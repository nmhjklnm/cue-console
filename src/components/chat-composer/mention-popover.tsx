import { type RefObject, type MutableRefObject } from "react";
import { cn, getAgentEmoji } from "@/lib/utils";
import { setAgentDisplayName } from "@/lib/actions";

interface MentionPopoverProps {
  mentionOpen: boolean;
  mentionPos: { left: number; top: number } | null;
  mentionCandidates: string[];
  mentionActive: number;
  setMentionActive: (v: number) => void;
  mentionScrollable: boolean;
  mentionPopoverRef: RefObject<HTMLDivElement | null>;
  mentionListRef: RefObject<HTMLDivElement | null>;
  pointerInMentionRef: MutableRefObject<boolean>;
  mentionScrollTopRef: MutableRefObject<number>;
  insertMention: (display: string, userId: string) => void;
  agentNameMap: Record<string, string>;
  setAgentNameMap: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}

export function MentionPopover({
  mentionOpen,
  mentionPos,
  mentionCandidates,
  mentionActive,
  setMentionActive,
  mentionScrollable,
  mentionPopoverRef,
  mentionListRef,
  pointerInMentionRef,
  mentionScrollTopRef,
  insertMention,
  agentNameMap,
  setAgentNameMap,
}: MentionPopoverProps) {
  if (!mentionOpen) return null;

  return (
    <div
      ref={mentionPopoverRef}
      className={cn(
        "absolute mb-2",
        "w-auto max-w-130",
        "rounded-2xl glass-surface glass-noise"
      )}
      style={
        mentionPos
          ? {
              left: mentionPos.left,
              top: mentionPos.top,
              transform: "translateY(-100%)",
            }
          : undefined
      }
      onPointerDownCapture={() => {
        pointerInMentionRef.current = true;
      }}
      onPointerUpCapture={() => {
        pointerInMentionRef.current = false;
      }}
      onPointerCancelCapture={() => {
        pointerInMentionRef.current = false;
      }}
      onMouseEnter={() => {
        pointerInMentionRef.current = true;
      }}
      onMouseLeave={() => {
        pointerInMentionRef.current = false;
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <p className="text-[11px] text-muted-foreground">Mention members</p>
        <p className="text-[11px] text-muted-foreground">↑↓ / Enter</p>
      </div>
      <div
        ref={mentionListRef}
        className={cn(
          "px-1 pb-2 pt-1",
          mentionScrollable ? "max-h-28 overflow-y-auto" : "overflow-hidden"
        )}
        onWheel={(e) => {
          e.stopPropagation();
        }}
        onScroll={(e) => {
          mentionScrollTopRef.current = (e.currentTarget as HTMLDivElement).scrollTop;
        }}
      >
        {mentionCandidates.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
        ) : (
          mentionCandidates.map((m, idx) => {
            const isAll = m === "all";
            const label = isAll ? "All" : agentNameMap[m] || m;
            const active = idx === mentionActive;
            return (
              <button
                key={m}
                type="button"
                data-mention-active={active ? "true" : "false"}
                className={cn(
                  "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  active ? "bg-accent" : "hover:bg-accent/50"
                )}
                onMouseEnter={() => setMentionActive(idx)}
                onClick={() => {
                  insertMention(label, isAll ? "all" : m);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[12px]">
                  {isAll ? "@" : getAgentEmoji(m)}
                </span>
                <span
                  className="flex-1 truncate"
                  onDoubleClick={(e) => {
                    if (isAll) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const current = agentNameMap[m] || m;
                    const next = window.prompt(`Rename: ${m}`, current);
                    if (!next) return;
                    void (async () => {
                      await setAgentDisplayName(m, next);
                      setAgentNameMap((prev) => ({ ...prev, [m]: next.trim() }));
                    })();
                  }}
                  title={isAll ? undefined : "Double-click to rename"}
                >
                  @{label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
