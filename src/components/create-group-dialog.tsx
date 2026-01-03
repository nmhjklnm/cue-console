"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchAllAgents, fetchConversationList, createNewGroup } from "@/lib/actions";
import { getAgentEmoji, cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (groupId: string, groupName: string) => void;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateGroupDialogProps) {
  const [mode, setMode] = useState<"quick" | "select">("quick");
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recentAgents, setRecentAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAllAgents().then(setAgents);
      fetchConversationList()
        .then((items) => {
          const recent = items
            .filter((i) => i.type === "agent")
            .slice()
            .sort((a, b) => {
              const ta = a.lastTime ? new Date(a.lastTime + "Z").getTime() : 0;
              const tb = b.lastTime ? new Date(b.lastTime + "Z").getTime() : 0;
              return tb - ta;
            })
            .map((i) => i.name)
            .slice(0, 5);
          setRecentAgents(recent);
        })
        .catch(() => {
          setRecentAgents([]);
        });
      setName("");
      setSelected(new Set());
      setMode("quick");
    }
  }, [open]);

  const toggleAgent = (agent: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) {
        next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
  };

  const membersForMode = () => {
    if (mode === "quick") return recentAgents;
    return Array.from(selected);
  };

  const handleCreate = async () => {
    const groupName = name.trim() || (mode === "quick" ? "最近聊天" : "新群聊");
    const members = membersForMode();
    if (members.length === 0) return;

    setLoading(true);
    try {
      const result = await createNewGroup(groupName, members);
      if (!result.success) {
        alert(result.error || "创建失败");
        return;
      }
      onCreated(result.id, result.name);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md glass-surface-opaque glass-noise">
        <DialogHeader>
          <DialogTitle>创建群聊</DialogTitle>
          <DialogDescription className="sr-only">
            创建一个群聊并选择要加入的成员
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-sm transition",
                mode === "quick"
                  ? "bg-primary text-primary-foreground border-primary/20"
                  : "bg-white/60 hover:bg-white/75"
              )}
              onClick={() => setMode("quick")}
              disabled={loading}
            >
              一键创群（最近 5）
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-sm transition",
                mode === "select"
                  ? "bg-primary text-primary-foreground border-primary/20"
                  : "bg-white/60 hover:bg-white/75"
              )}
              onClick={() => setMode("select")}
              disabled={loading}
            >
              选定创群
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">群名称</label>
            <Input
              placeholder="输入群聊名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/80"
            />
          </div>

          {mode === "quick" ? (
            <div>
              <label className="mb-2 block text-sm font-medium">将加入的成员</label>
              <div className="rounded-xl border bg-white/60 p-3">
                {recentAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无最近聊天的 Agent</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recentAgents.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-2.5 py-1 text-sm"
                        title={a}
                      >
                        <span className="text-base">{getAgentEmoji(a)}</span>
                        <span className="max-w-40 truncate">{a}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium">
                选择成员 ({selected.size} 已选)
              </label>
              <ScrollArea className="h-60 rounded-md border bg-white/55 p-2">
                {agents.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    暂无可添加的 Agent
                  </p>
                ) : (
                  <div className="space-y-1">
                    {agents.map((agent) => (
                      <button
                        key={agent}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                          selected.has(agent)
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        )}
                        onClick={() => toggleAgent(agent)}
                      >
                        <span className="text-xl">{getAgentEmoji(agent)}</span>
                        <span className="flex-1 font-medium">{agent}</span>
                        {selected.has(agent) && <Check className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={membersForMode().length === 0 || loading}
          >
            {loading ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
