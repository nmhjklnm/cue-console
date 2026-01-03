"use client";

import {
  useMemo,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { cn, getAgentEmoji } from "@/lib/utils";
import { setAgentDisplayName } from "@/lib/actions";
import { Plus, Send, X } from "lucide-react";

type MentionDraft = {
  userId: string;
  start: number;
  length: number;
  display: string;
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
  setInput,
  images,
  setImages,
  setNotice,
  setPreviewImage,
  handleSend,
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
  setInput: Dispatch<SetStateAction<string>>;
  images: { mime_type: string; base64_data: string }[];
  setImages: Dispatch<SetStateAction<{ mime_type: string; base64_data: string }[]>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setPreviewImage: Dispatch<SetStateAction<{ mime_type: string; base64_data: string } | null>>;
  handleSend: () => void | Promise<void>;
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
          {/* Image Preview */}
          {images.length > 0 && (
            <div className="flex max-w-full gap-2 overflow-x-auto px-0.5 pt-0.5">
              {images.map((img, i) => (
                <div key={i} className="relative shrink-0">
                  <img
                    src={`data:${img.mime_type};base64,${img.base64_data}`}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover shadow-sm ring-1 ring-border/60 cursor-pointer"
                    onClick={() => setPreviewImage(img)}
                  />
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
                <p className="text-[11px] text-muted-foreground">提及成员</p>
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
                  <div className="px-3 py-2 text-sm text-muted-foreground">无匹配成员</div>
                ) : (
                  mentionCandidates.map((m, idx) => {
                    const isAll = m === "all";
                    const label = isAll ? "所有人" : agentNameMap[m] || m;
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
                            const next = window.prompt(`修改名称：${m}`, current);
                            if (!next) return;
                            void (async () => {
                              await setAgentDisplayName(m, next);
                              setAgentNameMap((prev) => ({ ...prev, [m]: next.trim() }));
                            })();
                          }}
                          title={isAll ? undefined : "双击修改名称"}
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
                    ? "输入内容…（Enter 发送，Shift+Enter 换行，可 @）"
                    : "输入内容…（Enter 发送，Shift+Enter 换行）"
                  : "等待新的待回复请求…"
              }
              title={
                !hasPendingRequests
                  ? "当前没有待回复请求（PENDING/PROCESSING），发送按钮已禁用"
                  : type === "group"
                    ? "输入 @ 可提及成员，↑↓ 选择，Enter 插入；Enter 发送，Shift+Enter 换行"
                    : "Enter 发送，Shift+Enter 换行"
              }
              value={input}
              onPaste={handlePaste}
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

                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) void handleSend();
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
                title="添加图片"
              >
                <Plus className="h-4.5 w-4.5" />
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (canSend) {
                  void handleSend();
                  return;
                }
                if (!hasPendingRequests) {
                  setNotice("当前没有待处理的提问");
                  return;
                }
                if (!input.trim() && images.length === 0) {
                  setNotice("请先输入要发送的内容，或选择一张图片。");
                  return;
                }
                setNotice("暂时无法发送，请稍后再试。");
              }}
              disabled={busy || (!canSend && (!input.trim() && images.length === 0))}
              className={cn(
                "h-8 w-8 rounded-xl p-0",
                canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-transparent text-muted-foreground hover:bg-white/40",
                (busy || (!canSend && (!input.trim() && images.length === 0))) &&
                  "opacity-40 hover:bg-transparent"
              )}
              title={canSend ? "发送" : "请输入内容"}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>
    </>
  );
}
