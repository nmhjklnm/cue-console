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

  const filtered = items.filter((item) =>
    item.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.filter((i) => i.type === "group");
  const agents = filtered.filter((i) => i.type === "agent");

  const groupsPendingTotal = groups.reduce((sum, g) => sum + g.pendingCount, 0);
  const agentsPendingTotal = agents.reduce((sum, a) => sum + a.pendingCount, 0);

  const isCollapsed = !!collapsed;

  const collapsedGroups = useMemo(() => items.filter((i) => i.type === "group"), [items]);
  const collapsedAgents = useMemo(() => items.filter((i) => i.type === "agent"), [items]);

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-sidebar shrink-0",
        "transition-[width] duration-200 ease-out",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center border-b", isCollapsed ? "px-2 py-3" : "px-4 py-3")}>
        {isCollapsed ? (
          <div className="flex w-full flex-col items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onToggleCollapsed}
              disabled={!onToggleCollapsed}
              title="展开侧边栏"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onCreateGroup}
              title="创建群聊"
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
                title="折叠侧边栏"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCreateGroup}
                title="创建群聊"
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
              placeholder="搜索"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* List */}
      {isCollapsed ? (
        <ScrollArea className="flex-1 px-2">
          <div className="py-2 space-y-2">
            {collapsedGroups.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedGroups.map((item) => (
                  <ConversationIconButton
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id && selectedType === "group"}
                    onClick={() => onSelect(item.id, "group", item.name)}
                  />
                ))}
              </div>
            )}

            {collapsedAgents.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedAgents.map((item) => (
                  <ConversationIconButton
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id && selectedType === "agent"}
                    onClick={() => onSelect(item.id, "agent", item.name)}
                  />
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
        <ScrollArea className="flex-1 px-2">
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
                <span>群聊</span>
                {groupsPendingTotal > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                    {groupsPendingTotal}
                  </Badge>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {groups.map((item) => (
                  <ConversationItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id && selectedType === "group"}
                    onClick={() => onSelect(item.id, "group", item.name)}
                  />
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
                <span>单聊</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {agents.map((item) => (
                  <ConversationItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id && selectedType === "agent"}
                    onClick={() => onSelect(item.id, "agent", item.name)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8" />
              <p className="text-sm">暂无对话</p>
            </div>
          )}
        </ScrollArea>
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
        "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
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
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors overflow-hidden",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[18px]">
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
