"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, getAgentEmoji, formatTime, truncateText } from "@/lib/utils";
import { fetchConversationList, type ConversationItem } from "@/lib/actions";
import {
  Plus,
  MessageCircle,
  Search,
  ChevronDown,
  Users,
  Bot,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const HIDDEN_CONVERSATIONS_STORAGE_KEY = "cuehub:hiddenConversations";

function conversationKey(item: Pick<ConversationItem, "type" | "id">) {
  return `${item.type}:${item.id}`;
}

interface ConversationListProps {
  selectedId: string | null;
  selectedType: "agent" | "group" | null;
  onSelect: (id: string, type: "agent" | "group", name: string) => void;
  onCreateGroup: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function ConversationList({
  selectedId,
  selectedType,
  onSelect,
  onCreateGroup,
  collapsed,
  onToggleCollapsed,
}: ConversationListProps) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [search, setSearch] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<
    | { open: false }
    | {
        open: true;
        x: number;
        y: number;
        item: ConversationItem | null;
      }
  >({ open: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_CONVERSATIONS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) {
        const next = new Set(parsed.filter((v) => typeof v === "string"));
        setHiddenKeys(next);
      }
    } catch {
      setHiddenKeys(new Set());
    }
  }, []);

  useEffect(() => {
    if (!menu.open) return;
    const onPointerDown = () => setMenu({ open: false });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu({ open: false });
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu.open]);

  const persistHidden = useCallback((next: Set<string>) => {
    setHiddenKeys(next);
    try {
      localStorage.setItem(
        HIDDEN_CONVERSATIONS_STORAGE_KEY,
        JSON.stringify(Array.from(next))
      );
    } catch {
      // ignore
    }
  }, []);

  const hideConversation = useCallback(
    (item: ConversationItem) => {
      const key = conversationKey(item);
      persistHidden(new Set([...hiddenKeys, key]));
    },
    [hiddenKeys, persistHidden]
  );

  const restoreAllHidden = useCallback(() => {
    persistHidden(new Set());
  }, [persistHidden]);

  useEffect(() => {
    const onAgentNameUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ agentId: string; displayName: string }>;
      const agentId = e.detail?.agentId;
      const displayName = (e.detail?.displayName || "").trim();
      if (!agentId || !displayName) return;
      setItems((prev) =>
        prev.map((it) =>
          it.type === "agent" && it.id === agentId ? { ...it, displayName } : it
        )
      );
    };

    window.addEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
    return () => {
      window.removeEventListener("cuehub:agentDisplayNameUpdated", onAgentNameUpdated);
    };
  }, []);

  const loadData = useCallback(async () => {
    const data = await fetchConversationList();
    setItems(data);
  }, []);

  useEffect(() => {
    const t0 = setTimeout(() => {
      void loadData();
    }, 0);

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadData();
    };

    const interval = setInterval(tick, 3000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(t0);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadData]);

  const filtered = items
    .filter((item) => !hiddenKeys.has(conversationKey(item)))
    .filter((item) => item.displayName.toLowerCase().includes(search.toLowerCase()));

  const groups = filtered.filter((i) => i.type === "group");
  const agents = filtered.filter((i) => i.type === "agent");

  const groupsPendingTotal = groups.reduce((sum, g) => sum + g.pendingCount, 0);
  const agentsPendingTotal = agents.reduce((sum, a) => sum + a.pendingCount, 0);

  const isCollapsed = !!collapsed;

  const collapsedGroups = useMemo(
    () => items.filter((i) => i.type === "group" && !hiddenKeys.has(conversationKey(i))),
    [items, hiddenKeys]
  );
  const collapsedAgents = useMemo(
    () => items.filter((i) => i.type === "agent" && !hiddenKeys.has(conversationKey(i))),
    [items, hiddenKeys]
  );

  const onItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ConversationItem) => {
      e.preventDefault();
      setMenu({ open: true, x: e.clientX, y: e.clientY, item });
    },
    []
  );

  const onEmptyContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-conversation-item='true']")) return;
      e.preventDefault();
      setMenu({ open: true, x: e.clientX, y: e.clientY, item: null });
    },
    []
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col shrink-0",
        "border-r border-border/60",
        "glass-surface-opaque glass-noise",
        "transition-[width] duration-200 ease-out",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center border-b border-border/60",
          isCollapsed ? "px-2 py-3" : "px-4 py-3"
        )}
      >
        {isCollapsed ? (
          <div className="flex w-full flex-col items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onToggleCollapsed}
              disabled={!onToggleCollapsed}
              title="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onCreateGroup}
              title="Create group"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">Cue Hub</h1>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapsed}
                disabled={!onToggleCollapsed}
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCreateGroup}
                title="Create group"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-8 h-9 bg-white/45 border-white/40 focus-visible:border-ring"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* List */}
      {isCollapsed ? (
        <ScrollArea className="flex-1 min-h-0 px-2">
          <div className="py-2 space-y-2" onContextMenu={onEmptyContextMenu}>
            {collapsedGroups.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedGroups.map((item) => (
                  <div
                    key={item.id}
                    data-conversation-item="true"
                    onContextMenu={(e) => onItemContextMenu(e, item)}
                  >
                    <ConversationIconButton
                      item={item}
                      isSelected={selectedId === item.id && selectedType === "group"}
                      onClick={() => onSelect(item.id, "group", item.name)}
                    />
                  </div>
                ))}
              </div>
            )}

            {collapsedAgents.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedAgents.map((item) => (
                  <div
                    key={item.id}
                    data-conversation-item="true"
                    onContextMenu={(e) => onItemContextMenu(e, item)}
                  >
                    <ConversationIconButton
                      item={item}
                      isSelected={selectedId === item.id && selectedType === "agent"}
                      onClick={() => onSelect(item.id, "agent", item.name)}
                    />
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <MessageCircle className="mb-2 h-7 w-7" />
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1 min-h-0 px-2">
          <div onContextMenu={onEmptyContextMenu}>
          {/* Groups Section */}
          {groups.length > 0 && (
            <Collapsible open={groupsOpen} onOpenChange={setGroupsOpen} className="mb-1">
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 transition-colors">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    groupsOpen ? "" : "-rotate-90"
                  )}
                />
                <Users className="h-4 w-4 shrink-0" />
                <span>Groups</span>
                {groupsPendingTotal > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                    {groupsPendingTotal}
                  </Badge>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {groups.map((item) => (
                  <div
                    key={item.id}
                    data-conversation-item="true"
                    onContextMenu={(e) => onItemContextMenu(e, item)}
                  >
                    <ConversationItemCard
                      item={item}
                      isSelected={selectedId === item.id && selectedType === "group"}
                      onClick={() => onSelect(item.id, "group", item.name)}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Agents Section */}
          {agents.length > 0 && (
            <Collapsible open={agentsOpen} onOpenChange={setAgentsOpen} className="mb-1">
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 transition-colors">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    agentsOpen ? "" : "-rotate-90"
                  )}
                />
                <Bot className="h-4 w-4 shrink-0" />
                <span>Agents</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {agents.map((item) => (
                  <div
                    key={item.id}
                    data-conversation-item="true"
                    onContextMenu={(e) => onItemContextMenu(e, item)}
                  >
                    <ConversationItemCard
                      item={item}
                      isSelected={selectedId === item.id && selectedType === "agent"}
                      onClick={() => onSelect(item.id, "agent", item.name)}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8" />
              <p className="text-sm">No conversations</p>
            </div>
          )}
          </div>
        </ScrollArea>
      )}

      {menu.open && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menu.open && menu.item ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                if (menu.item) hideConversation(menu.item);
                setMenu({ open: false });
              }}
            >
              Hide conversation
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={() => {
                restoreAllHidden();
                setMenu({ open: false });
              }}
              disabled={hiddenKeys.size === 0}
            >
              Restore hidden conversations
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationIconButton({
  item,
  isSelected,
  onClick,
}: {
  item: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);
  return (
    <button
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-2xl transition",
        "backdrop-blur-sm",
        isSelected
          ? "bg-white/60 text-accent-foreground shadow-sm ring-1 ring-white/45"
          : "hover:bg-white/40"
      )}
      onClick={onClick}
      title={item.displayName}
    >
      <span className="text-xl">{emoji}</span>
      {item.pendingCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-sidebar" />
      )}
    </button>
  );
}

function ConversationItemCard({
  item,
  isSelected,
  onClick,
}: {
  item: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left transition overflow-hidden",
        "backdrop-blur-sm",
        isSelected
          ? "bg-white/62 text-accent-foreground shadow-sm ring-1 ring-white/45"
          : "hover:bg-white/40"
      )}
      onClick={onClick}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40 text-[18px]">
        {emoji}
        {item.pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium leading-5">{truncateText(item.displayName, 18)}</span>
          {item.lastTime && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatTime(item.lastTime)}
            </span>
          )}
        </div>
        {item.lastMessage && (
          <p className="text-[11px] text-muted-foreground whitespace-nowrap leading-4">
            {truncateText(item.lastMessage.replace(/\n/g, ' '), 20)}
          </p>
        )}
      </div>
    </button>
  );
}
