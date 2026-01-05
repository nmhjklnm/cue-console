"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, getAgentEmoji, formatTime, truncateText } from "@/lib/utils";
import {
  archiveConversations,
  deleteConversations,
  fetchArchivedConversationCount,
  fetchConversationList,
  unarchiveConversations,
  type ConversationItem,
} from "@/lib/actions";
import {
  Archive,
  Plus,
  MessageCircle,
  Search,
  ChevronDown,
  Users,
  Bot,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  const [view, setView] = useState<"active" | "archived">("active");
  const [archivedCount, setArchivedCount] = useState(0);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [undoToastKey, setUndoToastKey] = useState(0);
  const [menu, setMenu] = useState<
    | { open: false }
    | {
        open: true;
        x: number;
        y: number;
        key: string;
      }
  >({ open: false });

  const [moreMenu, setMoreMenu] = useState<
    | { open: false }
    | {
        open: true;
        x: number;
        y: number;
      }
  >({ open: false });

  const [confirm, setConfirm] = useState<
    | { open: false }
    | (
        {
          open: true;
          title: string;
          description?: string;
          confirmLabel?: string;
          destructive?: boolean;
        } & (
          | { kind: "archive_all"; keys: string[] }
          | { kind: "delete_selected"; keys: string[] }
          | { kind: "delete_one"; key: string }
        )
      )
  >({ open: false });

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
    const data = await fetchConversationList({ view });
    setItems(data);
    const count = await fetchArchivedConversationCount();
    setArchivedCount(count);
  }, [view]);

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

  useEffect(() => {
    if (!moreMenu.open) return;
    const onPointerDown = () => setMoreMenu({ open: false });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenu({ open: false });
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreMenu.open]);

  const onItemContextMenu = useCallback((e: React.MouseEvent, item: ConversationItem) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, key: conversationKey(item) });
  }, []);

  const displayNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) map.set(conversationKey(it), it.displayName);
    return map;
  }, [items]);

  const filtered = items.filter((item) =>
    item.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.filter((i) => i.type === "group");
  const agents = filtered.filter((i) => i.type === "agent");

  const groupsPendingTotal = groups.reduce((sum, g) => sum + g.pendingCount, 0);
  const agentsPendingTotal = agents.reduce((sum, a) => sum + a.pendingCount, 0);

  const isCollapsed = !!collapsed;

  const collapsedGroups = useMemo(
    () => items.filter((i) => i.type === "group"),
    [items]
  );
  const collapsedAgents = useMemo(
    () => items.filter((i) => i.type === "agent"),
    [items]
  );

  const selectedKeyList = useMemo(() => Array.from(selectedKeys), [selectedKeys]);

  const isSelectable = useCallback(
    (item: ConversationItem) => {
      if (view === "archived") return true;
      return true;
    },
    [view]
  );

  const toggleSelected = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const clearBulk = useCallback(() => {
    setBulkMode(false);
    setSelectedKeys(new Set());
  }, []);

  const scheduleDelete = useCallback(
    (keys: string[]) => {
      const unique = Array.from(new Set(keys));
      if (unique.length === 0) return;

      // Optimistically remove from current list
      setItems((prev) => prev.filter((it) => !unique.includes(conversationKey(it))));

      setPendingDelete((prev) => Array.from(new Set([...prev, ...unique])));

      for (const k of unique) {
        if (deleteTimersRef.current.has(k)) continue;
        const t = setTimeout(async () => {
          deleteTimersRef.current.delete(k);
          setPendingDelete((prev) => prev.filter((x) => x !== k));
          await deleteConversations([k]);
          await loadData();
        }, 5000);
        deleteTimersRef.current.set(k, t);
      }
    },
    [loadData]
  );

  const undoDelete = useCallback(
    async (keys?: string[]) => {
      const toUndo = keys && keys.length > 0 ? keys : pendingDelete;
      if (toUndo.length === 0) return;
      for (const k of toUndo) {
        const t = deleteTimersRef.current.get(k);
        if (t) clearTimeout(t);
        deleteTimersRef.current.delete(k);
      }
      setPendingDelete((prev) => prev.filter((k) => !toUndo.includes(k)));
      await loadData();
    },
    [loadData, pendingDelete]
  );

  const dismissUndoToast = useCallback(() => {
    setPendingDelete([]);
  }, []);

  useEffect(() => {
    if (pendingDelete.length > 0) {
      setUndoToastKey((v) => v + 1);
    }
  }, [pendingDelete.length]);

  const handleArchiveSelected = useCallback(async () => {
    if (selectedKeyList.length === 0) return;
    await archiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [selectedKeyList, clearBulk, loadData]);

  const handleUnarchiveSelected = useCallback(async () => {
    if (selectedKeyList.length === 0) return;
    await unarchiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [selectedKeyList, clearBulk, loadData]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedKeyList.length === 0) return;
    setConfirm({
      open: true,
      kind: "delete_selected",
      keys: selectedKeyList,
      title: "Delete conversations?",
      description: `This will remove ${selectedKeyList.length} conversation(s) from the sidebar. You can undo within 5 seconds.`,
      confirmLabel: "Delete",
      destructive: true,
    });
  }, [selectedKeyList, scheduleDelete, clearBulk]);

  const handleArchiveAll = useCallback(async () => {
    if (view !== "active") return;
    const keys = filtered
      .filter((i) => i.pendingCount === 0)
      .map((i) => conversationKey(i));
    if (keys.length === 0) return;
    setConfirm({
      open: true,
      kind: "archive_all",
      keys,
      title: "Archive conversations?",
      description: `Archive ${keys.length} conversation(s) (current filter, only pending == 0). You can unarchive later.`,
      confirmLabel: "Archive",
    });
  }, [view, filtered, loadData]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col shrink-0",
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
            <a
              href="https://github.com/nmhjklnm/cue-console"
              target="_blank"
              rel="noreferrer"
              className="text-lg font-semibold hover:underline underline-offset-4"
              title="Open cue-console repository"
            >
              cue-console
            </a>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  setMoreMenu({ open: true, x: e.clientX, y: e.clientY });
                }}
                title="More"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapsed}
                disabled={!onToggleCollapsed}
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {bulkMode && !isCollapsed && (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            {selectedKeys.size} selected
          </div>
          <div className="flex items-center gap-2">
            {view === "archived" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={selectedKeys.size === 0}
                onClick={() => void handleUnarchiveSelected()}
              >
                Unarchive
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={selectedKeys.size === 0}
                onClick={() => void handleArchiveSelected()}
              >
                Archive
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 rounded-md px-2 text-xs"
              disabled={selectedKeys.size === 0}
              onClick={handleDeleteSelected}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      {!isCollapsed && (
        <div className="px-3 py-2">
          {view === "archived" && (
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                onClick={() => {
                  setView("active");
                  clearBulk();
                }}
                title="Back"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <span className="text-xs text-muted-foreground">Archived chats</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-8 h-9 bg-white/45 border-white/40 focus-visible:border-ring"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {view === "active" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onCreateGroup}
                title="Create group"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {isCollapsed ? (
        <ScrollArea className="flex-1 min-h-0 px-2">
          <div className="py-2 space-y-2">
            {collapsedGroups.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                {collapsedGroups.map((item) => (
                  <div key={item.id} data-conversation-item="true">
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
                  <div key={item.id} data-conversation-item="true">
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
          <div>
          {view === "active" && archivedCount > 0 && (
            <div className="mb-2">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition overflow-hidden",
                  "backdrop-blur-sm hover:bg-white/40"
                )}
                onClick={() => {
                  setView("archived");
                  clearBulk();
                }}
                title="Archived chats"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40">
                  <Archive className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium leading-5">Archived chats</span>
                    <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                      {archivedCount}
                    </Badge>
                  </div>
                </div>
              </button>
            </div>
          )}
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
                      bulkMode={bulkMode}
                      checked={selectedKeys.has(conversationKey(item))}
                      onToggleChecked={() => toggleSelected(conversationKey(item))}
                      view={view}
                      onClick={() => {
                        if (bulkMode) {
                          if (isSelectable(item)) toggleSelected(conversationKey(item));
                          return;
                        }
                        onSelect(item.id, "group", item.name);
                      }}
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
                      bulkMode={bulkMode}
                      checked={selectedKeys.has(conversationKey(item))}
                      onToggleChecked={() => toggleSelected(conversationKey(item))}
                      view={view}
                      onClick={() => {
                        if (bulkMode) {
                          if (isSelectable(item)) toggleSelected(conversationKey(item));
                          return;
                        }
                        onSelect(item.id, "agent", item.name);
                      }}
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

      {pendingDelete.length > 0 && (
        <div className="fixed top-4 right-4 z-50 w-65 overflow-hidden rounded-xl border bg-white/85 p-3 text-xs shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">Deleted</div>
              <div className="text-muted-foreground">
                {pendingDelete.length} conversation(s) will be removed in 5s
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={dismissUndoToast}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 rounded-md px-2 text-xs"
              onClick={() => void undoDelete()}
            >
              Undo
            </Button>
          </div>

          <div
            key={undoToastKey}
            className="absolute bottom-0 left-0 right-0 h-1 bg-black/10"
          >
            <div
              className="h-full bg-primary origin-left"
              style={{
                transform: "scaleX(1)",
                animation: "cuehub-toast-progress 5s linear forwards",
              }}
            />
          </div>

          <style>{`@keyframes cuehub-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
        </div>
      )}

      {menu.open && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {view === "archived" ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={async () => {
                await unarchiveConversations([menu.key]);
                setMenu({ open: false });
                await loadData();
              }}
            >
              Unarchive
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={async () => {
                await archiveConversations([menu.key]);
                setMenu({ open: false });
                await loadData();
              }}
            >
              Archive
            </button>
          )}
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={() => {
              const name = displayNameByKey.get(menu.key) || menu.key;
              setConfirm({
                open: true,
                kind: "delete_one",
                key: menu.key,
                title: "Delete conversation?",
                description: `Delete “${name}”? This will remove it from the sidebar. You can undo within 5 seconds.`,
                confirmLabel: "Delete",
                destructive: true,
              });
              setMenu({ open: false });
            }}
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.open ? confirm.title : ""}
        description={confirm.open ? confirm.description : undefined}
        confirmLabel={confirm.open ? (confirm.confirmLabel ?? "Confirm") : "Confirm"}
        cancelLabel="Cancel"
        destructive={confirm.open ? confirm.destructive : undefined}
        onOpenChange={(open) => {
          if (!open) setConfirm({ open: false });
        }}
        onConfirm={async () => {
          if (!confirm.open) return;
          if (confirm.kind === "archive_all") {
            await archiveConversations(confirm.keys);
            await loadData();
            setConfirm({ open: false });
            return;
          }
          if (confirm.kind === "delete_selected") {
            scheduleDelete(confirm.keys);
            clearBulk();
            setConfirm({ open: false });
            return;
          }
          if (confirm.kind === "delete_one") {
            scheduleDelete([confirm.key]);
            setConfirm({ open: false });
            return;
          }
        }}
      />

      {moreMenu.open && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: moreMenu.x, top: moreMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!bulkMode ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setBulkMode(true);
                setMoreMenu({ open: false });
              }}
            >
              Select
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                clearBulk();
                setMoreMenu({ open: false });
              }}
            >
              Cancel selection
            </button>
          )}

          {view === "active" && (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setMoreMenu({ open: false });
                void handleArchiveAll();
              }}
            >
              Archive all
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
  bulkMode,
  checked,
  onToggleChecked,
  view,
}: {
  item: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
  bulkMode?: boolean;
  checked?: boolean;
  onToggleChecked?: () => void;
  view?: "active" | "archived";
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
      {bulkMode && (
        <span className="flex h-9 w-5 items-center justify-center">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={() => onToggleChecked?.()}
            onClick={(e) => e.stopPropagation()}
          />
        </span>
      )}
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
