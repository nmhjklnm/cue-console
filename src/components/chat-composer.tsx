"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, getAgentEmoji } from "@/lib/utils";
import { setAgentDisplayName } from "@/lib/actions";
import { Bot, CornerUpLeft, GripVertical, Plus, Send, Trash2, X } from "lucide-react";
import Image from "next/image";

type MentionDraft = {
  userId: string;
  start: number;
  length: number;
  display: string;
};

export type QueuedMessage = {
  id: string;
  text: string;
  images: { mime_type: string; base64_data: string }[];
  createdAt: number;
};

const shiftMentions = (from: number, delta: number, list: MentionDraft[]) => {
  return list.map((m) => {
    if (m.start >= from) return { ...m, start: m.start + delta };
    return m;
  });
};

const reconcileMentionsByDisplay = (text: string, list: MentionDraft[]) => {
  const used = new Set<number>();
  const next: MentionDraft[] = [];
  for (const m of list) {
    const windowStart = Math.max(0, m.start - 8);
    const windowEnd = Math.min(text.length, m.start + 32);
    const windowText = text.slice(windowStart, windowEnd);
    const localIdx = windowText.indexOf(m.display);
    let idx = -1;
    if (localIdx >= 0) idx = windowStart + localIdx;
    if (idx < 0) idx = text.indexOf(m.display);
    if (idx >= 0 && !used.has(idx)) {
      used.add(idx);
      next.push({ ...m, start: idx, length: m.display.length });
    }
  }
  next.sort((a, b) => a.start - b.start);
  return next;
};

export function ChatComposer({
  type,
  onBack,
  busy,
  canSend,
  hasPendingRequests,
  input,
  conversationMode,
  setConversationMode,
  setInput,
  images,
  setImages,
  setPreviewImage,
  botEnabled,
  onToggleBot,
  handleSend,
  enqueueCurrent,
  queue,
  removeQueued,
  recallQueued,
  reorderQueue,
  handlePaste,
  handleImageUpload,
  textareaRef,
  fileInputRef,
  inputWrapRef,
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
  closeMention,
  insertMention,
  updateMentionFromCursor,
  draftMentions,
  setDraftMentions,
  agentNameMap,
  setAgentNameMap,
}: {
  type: "agent" | "group";
  onBack?: (() => void) | undefined;
  busy: boolean;
  canSend: boolean;
  hasPendingRequests: boolean;
  input: string;
  conversationMode: "chat" | "agent";
  setConversationMode: (mode: "chat" | "agent") => void;
  setInput: Dispatch<SetStateAction<string>>;
  images: { mime_type: string; base64_data: string; file_name?: string }[];
  setImages: Dispatch<SetStateAction<{ mime_type: string; base64_data: string; file_name?: string }[]>>;
  setPreviewImage: Dispatch<SetStateAction<{ mime_type: string; base64_data: string } | null>>;
  botEnabled: boolean;
  onToggleBot: () => Promise<boolean>;
  handleSend: () => void | Promise<void>;
  enqueueCurrent: () => void;
  queue: QueuedMessage[];
  removeQueued: (id: string) => void;
  recallQueued: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  handleImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputWrapRef: RefObject<HTMLDivElement | null>;

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
  closeMention: () => void;
  insertMention: (display: string, userId: string) => void;
  updateMentionFromCursor: (nextText: string) => void;

  draftMentions: MentionDraft[];
  setDraftMentions: Dispatch<SetStateAction<MentionDraft[]>>;

  agentNameMap: Record<string, string>;
  setAgentNameMap: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const composerStyle = useMemo(() => {
    return onBack
      ? ({ left: 0, right: 0 } as const)
      : ({ left: "var(--cuehub-sidebar-w, 0px)", right: 0 } as const);
  }, [onBack]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [botToggling, setBotToggling] = useState(false);
  const [botConfirmOpen, setBotConfirmOpen] = useState(false);
  const isComposingRef = useRef(false);

  const submitOrQueue = () => {
    if (busy) return;
    if (canSend) {
      void handleSend();
      return;
    }
    enqueueCurrent();
  };

  return (
    <>
      {/* Input */}
      <div className="fixed bottom-5 z-40 px-4" style={composerStyle}>
        <div
          ref={inputWrapRef}
          className={cn(
            "relative mx-auto flex w-full max-w-230 flex-col gap-1 rounded-4xl px-2 py-1",
            "glass-surface glass-noise"
          )}
        >
          {/* Queue Panel */}
          {queue.length > 0 && (
            <div className="px-1 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {queue.length} messages queued
                </p>
              </div>
              <div className="mt-1 max-h-28 overflow-y-auto pr-1">
                <div className="space-y-1">
                  {queue.map((q, idx) => {
                    const summary = (q.text || "").split(/\r?\n/)[0] || "(empty)";
                    const hasImages = (q.images?.length || 0) > 0;
                    return (
                      <div
                        key={q.id}
                        className={cn(
                          "flex items-center gap-2 rounded-2xl px-2 py-1",
                          "bg-white/35 ring-1 ring-white/25"
                        )}
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(idx);
                          e.dataTransfer.setData("text/plain", String(idx));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const raw = e.dataTransfer.getData("text/plain");
                          const from = Number(raw);
                          if (Number.isFinite(from)) reorderQueue(from, idx);
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        data-dragging={dragIndex === idx ? "true" : "false"}
                      >
                        <span className="text-muted-foreground">
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs">
                            {summary}
                            {hasImages ? "  [img]" : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-xl hover:bg-white/40"
                          onClick={() => recallQueued(q.id)}
                          title="Recall to input"
                        >
                          <CornerUpLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-xl hover:bg-white/40"
                          onClick={() => removeQueued(q.id)}
                          title="Remove from queue"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <Dialog open={botConfirmOpen} onOpenChange={setBotConfirmOpen}>
            <DialogContent className="sm:max-w-110">
              <DialogHeader>
                <DialogTitle>Enable bot mode?</DialogTitle>
              </DialogHeader>

              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  Bot mode will automatically reply to <span className="text-foreground font-medium">cue</span> requests
                  in this conversation.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Only affects the current {type === "group" ? "group" : "agent"} conversation.</li>
                  <li>May immediately reply to currently pending cue requests.</li>
                  <li>Does not reply to pause confirmations.</li>
                  <li>You can turn it off anytime.</li>
                </ul>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={botToggling}
                  onClick={() => setBotConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={botToggling}
                  onClick={async () => {
                    if (botToggling) return;
                    setBotToggling(true);
                    try {
                      await onToggleBot();
                      setBotConfirmOpen(false);
                    } finally {
                      setBotToggling(false);
                    }
                  }}
                >
                  {botToggling ? "Enabling…" : "Enable"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Image Preview */}
          {images.length > 0 && (
            <div className="flex max-w-full gap-2 overflow-x-auto px-0.5 pt-0.5">
              {images.map((img, i) => (
                <div key={i} className="relative shrink-0">
                  {img.mime_type.startsWith("image/") ? (
                    <Image
                      src={`data:${img.mime_type};base64,${img.base64_data}`}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 rounded-xl object-cover shadow-sm ring-1 ring-border/60 cursor-pointer"
                      onClick={() => setPreviewImage(img)}
                    />
                  ) : (
                    <div
                      className="h-16 w-16 rounded-xl bg-white/40 dark:bg-black/20 ring-1 ring-border/60 shadow-sm flex flex-col items-center justify-center px-1"
                      title={`${img.file_name || "File"}${img.mime_type ? ` (${img.mime_type})` : ""}`}
                    >
                      <div className="text-[10px] font-semibold text-muted-foreground">FILE</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-foreground/80 truncate w-full text-center">
                        {(img.file_name || "File").slice(0, 10)}
                      </div>
                    </div>
                  )}
                  <button
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mentionOpen && type === "group" && (
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
          )}

          {/* Row 1: textarea */}
          <div
            className="px-0.5 cursor-text"
            onPointerDown={(e) => {
              if (busy) return;
              const ta = textareaRef.current;
              if (!ta) return;
              const target = e.target as Node | null;
              if (target && ta.contains(target)) return;
              ta.focus();
            }}
          >
            <textarea
              ref={textareaRef}
              placeholder={
                hasPendingRequests
                  ? type === "group"
                    ? "Type... (Enter to send or queue, Shift+Enter for newline, supports @)"
                    : "Type... (Enter to send or queue, Shift+Enter for newline)"
                  : "Waiting for new pending requests..."
              }
              title={
                !hasPendingRequests
                  ? "No pending requests (PENDING/PROCESSING). Send button is disabled."
                  : type === "group"
                    ? "Type @ to mention members; ↑↓ to navigate, Enter to insert; Enter to send or queue, Shift+Enter for newline"
                    : "Enter to send or queue, Shift+Enter for newline"
              }
              value={input}
              onPaste={handlePaste}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onChange={(e) => {
                const next = e.target.value;
                setInput(next);
                setDraftMentions((prev) => reconcileMentionsByDisplay(next, prev));
                updateMentionFromCursor(next);
              }}
              onKeyDown={(e) => {
                if (type === "group" && e.key === "@") {
                  requestAnimationFrame(() => updateMentionFromCursor(input));
                }

                if (mentionOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = Math.min(mentionActive + 1, mentionCandidates.length - 1);
                    setMentionActive(next);
                    requestAnimationFrame(() => {
                      const list = mentionListRef.current;
                      if (!list) return;
                      const btn = list.querySelector<HTMLButtonElement>(
                        `button[data-mention-active='true']`
                      );
                      const fallback = list.querySelectorAll<HTMLButtonElement>(
                        'button[type="button"]'
                      )[next];
                      (btn || fallback)?.scrollIntoView({ block: "nearest" });
                    });
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const next = Math.max(mentionActive - 1, 0);
                    setMentionActive(next);
                    requestAnimationFrame(() => {
                      const list = mentionListRef.current;
                      if (!list) return;
                      const btn = list.querySelector<HTMLButtonElement>(
                        `button[data-mention-active='true']`
                      );
                      const fallback = list.querySelectorAll<HTMLButtonElement>(
                        'button[type="button"]'
                      )[next];
                      (btn || fallback)?.scrollIntoView({ block: "nearest" });
                    });
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const picked = mentionCandidates[mentionActive];
                    if (picked) {
                      if (picked === "all") insertMention("all", "all");
                      else insertMention(picked, picked);
                    }
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeMention();
                    return;
                  }
                }

                if (e.key === "Backspace" || e.key === "Delete") {
                  const el = textareaRef.current;
                  if (!el) return;
                  const start = el.selectionStart ?? 0;
                  const end = el.selectionEnd ?? start;
                  const hit = draftMentions.find(
                    (m) =>
                      (start > m.start && start <= m.start + m.length) ||
                      (end > m.start && end <= m.start + m.length) ||
                      (start <= m.start && end >= m.start + m.length)
                  );
                  if (hit) {
                    e.preventDefault();
                    const before = input.slice(0, hit.start);
                    const after = input.slice(hit.start + hit.length);
                    const next = before + after;
                    setInput(next);
                    setDraftMentions((prev) =>
                      shiftMentions(
                        hit.start + hit.length,
                        -hit.length,
                        prev.filter((m) => m !== hit)
                      )
                    );
                    requestAnimationFrame(() => {
                      const cur = textareaRef.current;
                      if (!cur) return;
                      cur.setSelectionRange(hit.start, hit.start);
                    });
                    closeMention();
                    return;
                  }
                }

                if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
                  e.preventDefault();
                  submitOrQueue();
                }
              }}
              onKeyUp={() => {
                if (document.activeElement !== textareaRef.current) return;
                updateMentionFromCursor(input);
              }}
              onSelect={() => {
                if (document.activeElement !== textareaRef.current) return;
                updateMentionFromCursor(input);
              }}
              onBlur={() => {
                setTimeout(() => {
                  const cur = document.activeElement;
                  const ta = textareaRef.current;
                  const pop = mentionPopoverRef.current;
                  if (cur && ta && cur === ta) return;
                  if (cur && pop && pop.contains(cur)) return;
                  if (pointerInMentionRef.current) return;
                  closeMention();
                }, 120);
              }}
              disabled={busy}
              className={cn(
                "w-full resize-none rounded-2xl bg-transparent px-1 pt-1.5 pb-0.5 text-sm border-0 outline-none ring-0",
                "leading-6",
                "min-h-9 max-h-36 overflow-y-auto",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
              rows={1}
            />
          </div>

          {/* Row 2: toolbar */}
          <div className="flex items-center justify-between gap-2 px-0.5 pb-0">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-xl",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-white/40"
                )}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="Add file"
              >
                <Plus className="h-4.5 w-4.5" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 rounded-xl px-2",
                  conversationMode === "chat"
                    ? "bg-white/35 text-foreground ring-1 ring-white/25"
                    : "text-muted-foreground hover:text-foreground",
                  "hover:bg-white/40"
                )}
                onClick={() => {
                  if (busy) return;
                  setConversationMode(conversationMode === "chat" ? "agent" : "chat");
                }}
                disabled={busy}
                title={conversationMode === "chat" ? "Chat mode" : "Agent mode"}
              >
                {conversationMode === "chat" ? "Chat" : "Agent"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 rounded-xl px-2",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-white/40"
                )}
                onClick={() => {
                  if (busy) return;
                  enqueueCurrent();
                }}
                disabled={busy || (!input.trim() && images.length === 0)}
                title="Queue (Enter)"
              >
                Queue
              </Button>

              <div className="relative group">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || botToggling}
                  className={cn(
                    "relative h-9 w-9 rounded-2xl",
                    "hover:bg-white/40",
                    botEnabled ? "text-primary" : "text-muted-foreground",
                    (busy || botToggling) && "opacity-60 cursor-not-allowed"
                  )}
                  onClick={async () => {
                    if (busy || botToggling) return;
                    if (!botEnabled) {
                      setBotConfirmOpen(true);
                      return;
                    }
                    setBotToggling(true);
                    try {
                      await onToggleBot();
                    } finally {
                      setBotToggling(false);
                    }
                  }}
                  aria-label={botEnabled ? "Stop bot" : "Start bot"}
                  title={botToggling ? "Turning…" : botEnabled ? "Stop bot" : "Start bot"}
                >
                  {botEnabled && (
                    <span className="pointer-events-none absolute inset-0 rounded-xl">
                      <span className="absolute inset-0 rounded-2xl bg-primary/15 blur-md animate-pulse" />
                    </span>
                  )}
                  <Bot
                    className={cn(
                      "relative z-10 h-5 w-5",
                      botEnabled && "drop-shadow-[0_0_12px_rgba(99,102,241,0.45)]"
                    )}
                  />
                </Button>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => {
                submitOrQueue();
              }}
              disabled={busy || (!input.trim() && images.length === 0)}
              className={cn(
                "h-8 w-8 rounded-xl p-0",
                canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-transparent text-muted-foreground hover:bg-white/40",
                (busy || (!input.trim() && images.length === 0)) && "opacity-40 hover:bg-transparent"
              )}
              title={canSend ? "Send" : "Queue (cannot send now)"}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>
    </>
  );
}
