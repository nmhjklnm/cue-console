"use client";

import { useState, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  archiveConversations,
  pinConversationByKey,
  unpinConversationByKey,
  unarchiveConversations,
  setUserConfig,
  type ConversationItem,
} from "@/lib/actions";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConversationIconButton } from "./conversation-icon-button";
import { ConversationItemCard } from "./conversation-item-card";
import { SettingsDialog } from "./settings-dialog";
import { UndoToast } from "./undo-toast";
import { useAvatarManager } from "./use-avatar-manager";
import { useConversationList } from "./use-conversation-list";
import { useConversationActions } from "./use-conversation-actions";
import { useSettings } from "./use-settings";
import { conversationKey } from "./utils";

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
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
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

  const { items, setItems, archivedCount, pinnedKeys, setPinnedKeys, loadData } = useConversationList(view);
  const { avatarUrlMap } = useAvatarManager(items);
  const {
    bulkMode,
    setBulkMode,
    selectedKeys,
    toggleSelected,
    clearBulk,
    pendingDelete,
    scheduleDelete,
    undoDelete,
    dismissUndoToast,
    undoToastKey,
    handleArchiveSelected,
    handleUnarchiveSelected,
  } = useConversationActions(loadData);
  const settings = useSettings();

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

  const pinnedSet = useMemo(() => new Set(pinnedKeys), [pinnedKeys]);

  const groupsAll = filtered.filter((i) => i.type === "group");
  const agentsAll = filtered.filter((i) => i.type === "agent");

  const groups = useMemo(() => {
    const byKey = new Map(groupsAll.map((g) => [conversationKey(g), g] as const));
    const pinned = pinnedKeys
      .filter((k) => k.startsWith("group:"))
      .map((k) => byKey.get(k))
      .filter(Boolean) as ConversationItem[];
    const rest = groupsAll.filter((g) => !pinnedSet.has(conversationKey(g)));
    return [...pinned, ...rest];
  }, [groupsAll, pinnedKeys, pinnedSet]);

  const agents = useMemo(() => {
    const byKey = new Map(agentsAll.map((a) => [conversationKey(a), a] as const));
    const pinned = pinnedKeys
      .filter((k) => k.startsWith("agent:"))
      .map((k) => byKey.get(k))
      .filter(Boolean) as ConversationItem[];
    const rest = agentsAll.filter((a) => !pinnedSet.has(conversationKey(a)));
    return [...pinned, ...rest];
  }, [agentsAll, pinnedKeys, pinnedSet]);

  const groupsPendingTotal = groups.reduce((sum, g) => sum + g.pendingCount, 0);

  const agentsByProject = useMemo(() => {
    if (settings.agentGroupingMode !== "by_project") return null;

    const projectMap = new Map<string, ConversationItem[]>();
    
    for (const agent of agents) {
      const projectName = agent.projectName || "(No Project)";
      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, []);
      }
      projectMap.get(projectName)!.push(agent);
    }

    const projects = Array.from(projectMap.entries()).map(([name, agents]) => {
      const pendingCount = agents.reduce((sum, a) => sum + a.pendingCount, 0);
      return { name, agents, pendingCount };
    });

    projects.sort((a, b) => {
      if (a.name === "(No Project)") return 1;
      if (b.name === "(No Project)") return -1;
      return a.name.localeCompare(b.name);
    });

    return projects;
  }, [agents, settings.agentGroupingMode]);

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
  }, [selectedKeyList]);

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
  }, [view, filtered]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col shrink-0",
        "border-r border-border/60",
        "glass-surface-opaque glass-noise",
        "transition-[width] duration-200 ease-out",
        "w-full md:w-auto",
        isCollapsed ? "md:w-16" : "md:w-72"
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
                onClick={() => void handleUnarchiveSelected(selectedKeyList)}
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
                onClick={() => void handleArchiveSelected(selectedKeyList)}
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
                      avatarUrl={avatarUrlMap[`group:${item.id}`]}
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
                      avatarUrl={avatarUrlMap[`agent:${item.id}`]}
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
                      avatarUrl={avatarUrlMap[`group:${item.id}`]}
                      isSelected={selectedId === item.id && selectedType === "group"}
                      isPinned={pinnedSet.has(conversationKey(item))}
                      bulkMode={bulkMode}
                      checked={selectedKeys.has(conversationKey(item))}
                      onToggleChecked={() => toggleSelected(conversationKey(item))}
                      onClick={() => {
                        if (bulkMode) {
                          toggleSelected(conversationKey(item));
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
              <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-sm font-medium text-muted-foreground hover:bg-accent/50 transition-colors rounded-md -mx-2 px-2 py-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      agentsOpen ? "" : "-rotate-90"
                    )}
                  />
                  <Bot className="h-4 w-4 shrink-0" />
                  <span>Agents</span>
                </CollapsibleTrigger>
                <div
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded hover:bg-accent transition-colors cursor-pointer"
                  onClick={async () => {
                    const nextMode = settings.agentGroupingMode === "default" ? "by_project" : "default";
                    settings.setAgentGroupingMode(nextMode);
                    await setUserConfig({ agent_grouping_mode: nextMode });
                  }}
                  title={settings.agentGroupingMode === "default" ? "Group by project" : "Show as list"}
                >
                  {settings.agentGroupingMode === "default" ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  )}
                </div>
              </div>
              <CollapsibleContent className="mt-1 space-y-0.5">
                {settings.agentGroupingMode === "by_project" && agentsByProject ? (
                  agentsByProject.map((project) => (
                    <Collapsible key={project.name} defaultOpen={true} className="mb-1">
                      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground/80 hover:bg-accent/30 transition-colors">
                        <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200 data-[state=closed]:-rotate-90" />
                        <span className="text-[11px]">📁 {project.name}</span>
                        {project.pendingCount > 0 && (
                          <Badge variant="destructive" className="ml-auto h-4 min-w-4 px-1 text-[10px]">
                            {project.pendingCount}
                          </Badge>
                        )}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-0.5 space-y-0.5 pl-4">
                        {project.agents.map((item) => (
                          <div
                            key={item.id}
                            data-conversation-item="true"
                            onContextMenu={(e) => onItemContextMenu(e, item)}
                          >
                            <ConversationItemCard
                              item={item}
                              avatarUrl={avatarUrlMap[`agent:${item.id}`]}
                              isSelected={selectedId === item.id && selectedType === "agent"}
                              isPinned={pinnedSet.has(conversationKey(item))}
                              bulkMode={bulkMode}
                              checked={selectedKeys.has(conversationKey(item))}
                              onToggleChecked={() => toggleSelected(conversationKey(item))}
                              onClick={() => {
                                if (bulkMode) {
                                  toggleSelected(conversationKey(item));
                                  return;
                                }
                                onSelect(item.id, "agent", item.name);
                              }}
                            />
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))
                ) : (
                  agents.map((item) => (
                    <div
                      key={item.id}
                      data-conversation-item="true"
                      onContextMenu={(e) => onItemContextMenu(e, item)}
                    >
                      <ConversationItemCard
                        item={item}
                        avatarUrl={avatarUrlMap[`agent:${item.id}`]}
                        isSelected={selectedId === item.id && selectedType === "agent"}
                        isPinned={pinnedSet.has(conversationKey(item))}
                        bulkMode={bulkMode}
                        checked={selectedKeys.has(conversationKey(item))}
                        onToggleChecked={() => toggleSelected(conversationKey(item))}
                        onClick={() => {
                          if (bulkMode) {
                            toggleSelected(conversationKey(item));
                            return;
                          }
                          onSelect(item.id, "agent", item.name);
                        }}
                      />
                    </div>
                  ))
                )}
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

      <div className={cn("px-2 pb-3", isCollapsed ? "" : "")}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl transition",
                "backdrop-blur-sm hover:bg-white/40"
              )}
              onClick={() => settings.setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition overflow-hidden",
              "backdrop-blur-sm hover:bg-white/40"
            )}
            onClick={() => settings.setSettingsOpen(true)}
            title="Settings"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40">
              <Settings className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium leading-5">Settings</span>
                <span className="text-[11px] text-muted-foreground shrink-0">Global</span>
              </div>
              <p className="text-[11px] text-muted-foreground whitespace-nowrap leading-4">
                Sound notification
              </p>
            </div>
          </button>
        )}
      </div>

      <UndoToast
        pendingDelete={pendingDelete}
        undoToastKey={undoToastKey}
        onUndo={() => void undoDelete()}
        onDismiss={dismissUndoToast}
      />

      {menu.open && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border bg-white/90 p-1 shadow-lg backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const isPinned = pinnedSet.has(menu.key);
            return (
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={async () => {
                  const key = menu.key;
                  setMenu({ open: false });
                  if (!key) return;
                  if (isPinned) {
                    await unpinConversationByKey(key, view);
                    setPinnedKeys((prev) => prev.filter((k) => k !== key));
                    return;
                  }
                  await pinConversationByKey(key, view);
                  setPinnedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pin className="h-4 w-4" />
                  {isPinned ? "Unpin" : "Pin"}
                </span>
              </button>
            );
          })()}

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
                description: `Delete "${name}"? This will remove it from the sidebar. You can undo within 5 seconds.`,
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
            scheduleDelete(confirm.keys, items);
            clearBulk();
            setConfirm({ open: false });
            return;
          }
          if (confirm.kind === "delete_one") {
            scheduleDelete([confirm.key], items);
            setConfirm({ open: false });
            return;
          }
        }}
      />

      <SettingsDialog
        open={settings.settingsOpen}
        onOpenChange={settings.setSettingsOpen}
        soundEnabled={settings.soundEnabled}
        setSoundEnabled={settings.setSoundEnabled}
        conversationModeDefault={settings.conversationModeDefault}
        setConversationModeDefault={settings.setConversationModeDefault}
        chatModeAppendText={settings.chatModeAppendText}
        setChatModeAppendText={settings.setChatModeAppendText}
        pendingRequestTimeoutMs={settings.pendingRequestTimeoutMs}
        setPendingRequestTimeoutMs={settings.setPendingRequestTimeoutMs}
        botModeReplyText={settings.botModeReplyText}
        setBotModeReplyText={settings.setBotModeReplyText}
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
