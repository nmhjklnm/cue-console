"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "@/components/conversation-list";
import { ChatView } from "@/components/chat-view";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { MessageCircle } from "lucide-react";
import { claimWorkerLease, fetchBotEnabledConversations, processBotTick, processQueueTick } from "@/lib/actions";
import "@/lib/perf-monitor"; // Auto-starts if enabled in localStorage

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"agent" | "group" | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const raw = window.localStorage.getItem("cuehub.sidebarCollapsed");
      if (raw === "1") return true;
      if (raw === "0") return false;
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let stopped = false;
    const holderId =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const leaseKey = "cue-console:global-queue-worker";
    const leaseTtlMs = 12_000;
    const claimEveryMs = 4_000;
    const tickEveryMs = 3_000;

    let isLeader = false;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let claimTimer: ReturnType<typeof setInterval> | null = null;

    const stopTick = () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const startTick = () => {
      if (tickTimer) return;
      tickTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void (async () => {
          try {
            const res = await processQueueTick(holderId);
            if ((res?.sent ?? 0) > 0 || (res?.failed ?? 0) > 0 || (res?.rescheduled ?? 0) > 0) {
              const removedQueueIds = Array.isArray((res as { removedQueueIds?: unknown })?.removedQueueIds)
                ? ((res as { removedQueueIds: string[] }).removedQueueIds || [])
                : [];
              window.dispatchEvent(
                new CustomEvent("cue-console:queueUpdated", {
                  detail: {
                    removedQueueIds,
                  },
                })
              );
            }
          } catch {
            // ignore
          }
        })();
      }, tickEveryMs);
    };

    const claimOnce = async () => {
      try {
        const res = await claimWorkerLease({ leaseKey, holderId, ttlMs: leaseTtlMs });
        const nextLeader = Boolean(res.acquired && res.holderId === holderId);
        if (nextLeader !== isLeader) {
          isLeader = nextLeader;
          if (isLeader) {
            startTick();
          } else {
            stopTick();
          }
        }
      } catch {
        // ignore
      }
    };

    const boot = async () => {
      await claimOnce();
      if (stopped) return;
      claimTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void claimOnce();
      }, claimEveryMs);
    };

    void boot();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void claimOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTick();
      if (claimTimer) clearInterval(claimTimer);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const holderId =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const leaseKey = "cue-console:global-bot-worker";
    const leaseTtlMs = 12_000;
    const claimEveryMs = 4_000;
    const tickEveryMs = 2_500;

    let isLeader = false;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let claimTimer: ReturnType<typeof setInterval> | null = null;
    let rrIndex = 0;

    const stopTick = () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const startTick = () => {
      if (tickTimer) return;
      tickTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void (async () => {
          try {
            const enabled = await fetchBotEnabledConversations(200);
            if (!Array.isArray(enabled) || enabled.length === 0) return;

            const maxPerTick = 10;
            const n = Math.min(enabled.length, maxPerTick);
            for (let i = 0; i < n; i += 1) {
              const idx = (rrIndex + i) % enabled.length;
              const row = enabled[idx] as { conv_type?: unknown; conv_id?: unknown };
              const convType = row?.conv_type === "group" ? "group" : "agent";
              const convId = String(row?.conv_id || "").trim();
              if (!convId) continue;
              await processBotTick({ holderId, convType, convId, limit: 80 });
            }
            rrIndex = (rrIndex + n) % enabled.length;
          } catch {
            // ignore
          }
        })();
      }, tickEveryMs);
    };

    const claimOnce = async () => {
      try {
        const res = await claimWorkerLease({ leaseKey, holderId, ttlMs: leaseTtlMs });
        const nextLeader = Boolean(res.acquired && res.holderId === holderId);
        if (nextLeader !== isLeader) {
          isLeader = nextLeader;
          if (isLeader) startTick();
          else stopTick();
        }
      } catch {
        // ignore
      }
    };

    const boot = async () => {
      await claimOnce();
      if (stopped) return;
      claimTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void claimOnce();
      }, claimEveryMs);
    };

    void boot();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void claimOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTick();
      if (claimTimer) clearInterval(claimTimer);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("cuehub.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  const handleSelect = (id: string, type: "agent" | "group", name: string) => {
    setSelectedId(id);
    setSelectedType(type);
    setSelectedName(name);
  };

  const handleBack = () => {
    setSelectedId(null);
    setSelectedType(null);
  };

  const handleGroupCreated = (groupId: string, groupName: string) => {
    setSelectedId(groupId);
    setSelectedType("group");
    setSelectedName(groupName);
  };

  return (
    <div className="flex h-screen bg-transparent overflow-hidden">
      {/* Desktop: Side by side */}
      <div
        className="hidden md:flex md:h-full md:w-full"
        style={{
          ["--cuehub-sidebar-w" as never]: sidebarCollapsed ? "4rem" : "18rem",
        }}
      >
        <ConversationList
          selectedId={selectedId}
          selectedType={selectedType}
          onSelect={handleSelect}
          onCreateGroup={() => setShowCreateGroup(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />
        {selectedId && selectedType ? (
          <ChatView
            type={selectedType}
            id={selectedId}
            name={selectedName}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-4 h-16 w-16 opacity-50" />
            <p className="text-lg">Select a conversation to start chatting</p>
            <p className="mt-2 text-sm">Or click + in the top-right to create a group</p>
          </div>
        )}
      </div>

      {/* Mobile: Stack view with smooth transition */}
      <div className="flex h-full w-full flex-col md:hidden">
        {selectedId && selectedType ? (
          <ChatView
            type={selectedType}
            id={selectedId}
            name={selectedName}
            onBack={handleBack}
          />
        ) : (
          <ConversationList
            selectedId={selectedId}
            selectedType={selectedType}
            onSelect={handleSelect}
            onCreateGroup={() => setShowCreateGroup(true)}
          />
        )}
      </div>

      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
