"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, getAgentEmoji } from "@/lib/utils";
import { randomSeed } from "@/lib/avatar";
import Image from "next/image";
import {
  setAgentDisplayName,
  setGroupName,
  submitResponse,
  cancelRequest,
  processBotTick,
  fetchBotEnabled,
  updateBotEnabled,
  fetchAgentEnv,
} from "@/lib/actions";
import { ChatComposer } from "@/components/chat-composer";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineList } from "@/components/chat/timeline-list";
import { ChatHeader } from "@/components/chat/chat-header";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { useConversationTimeline } from "@/hooks/use-conversation-timeline";
import { useMentions } from "@/hooks/use-mentions";
import { useAvatarManagement } from "@/hooks/use-avatar-management";
import { useAudioNotification } from "@/hooks/use-audio-notification";
import { ChatProviders } from "@/contexts/chat-providers";
import { useConfig } from "@/contexts/config-context";
import { useInputContext } from "@/contexts/input-context";
import { useUIStateContext } from "@/contexts/ui-state-context";
import { useMessageSender } from "@/hooks/use-message-sender";
import { useFileHandler } from "@/hooks/use-file-handler";
import { useDraftPersistence } from "@/hooks/use-draft-persistence";
import { isPauseRequest, filterPendingRequests } from "@/lib/chat-logic";
import type { ChatType } from "@/types/chat";
import { ArrowDown } from "lucide-react";

function perfEnabled(): boolean {
  try {
    return window.localStorage.getItem("cue-console:perf") === "1";
  } catch {
    return false;
  }
}

interface ChatViewProps {
  type: ChatType;
  id: string;
  name: string;
  onBack?: () => void;
}

export function ChatView({ type, id, name, onBack }: ChatViewProps) {
  return (
    <ChatProviders>
      <ChatViewContent type={type} id={id} name={name} onBack={onBack} />
    </ChatProviders>
  );
}

function ChatViewContent({ type, id, name, onBack }: ChatViewProps) {
  const { config } = useConfig();
  const { input, images, conversationMode, setInput, setImages, setConversationMode } = useInputContext();
  const { busy, error, notice, setBusy, setError, setNotice } = useUIStateContext();
  const deferredInput = useDeferredValue(input);
  const imagesRef = useRef(images);

  const [botEnabled, setBotEnabled] = useState(false);
  const [botLoaded, setBotLoaded] = useState(false);
  const [botLoadError, setBotLoadError] = useState<string | null>(null);

  const { soundEnabled, setSoundEnabled, playDing } = useAudioNotification();

  const {
    avatarUrlMap,
    avatarPickerOpen,
    setAvatarPickerOpen,
    avatarPickerTarget,
    avatarCandidates,
    ensureAvatarUrl,
    setTargetAvatarSeed,
    openAvatarPicker,
  } = useAvatarManagement();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [members, setMembers] = useState<string[]>([]);
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [groupTitle, setGroupTitle] = useState<string>(name);
  const [agentRuntime, setAgentRuntime] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [previewImage, setPreviewImage] = useState<{ mime_type: string; base64_data: string } | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [composerPadPx, setComposerPadPx] = useState(36 * 4);

  const botHolderIdRef = useRef<string>(
    (() => {
      try {
        return globalThis.crypto?.randomUUID?.() || `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      } catch {
        return `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    })()
  );
  const botTickBusyRef = useRef(false);

  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const PAGE_SIZE = 30;

  const {
    draftMentions: mentions,
    setDraftMentions: setMentions,
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
    insertMentionAtCursor,
    updateMentionFromCursor,
    reconcileMentionsByDisplay,
  } = useMentions({
    type,
    input,
    setInput,
    members,
    agentNameMap,
    textareaRef,
    inputWrapRef,
  });

  // Sync mentions from useMentions to Context only when needed (not on every keystroke)
  // Use mentions directly from useMentions hook instead of syncing to Context
  // This avoids triggering Context updates on every input change


  const {
    queue,
    setQueue,
    enqueueCurrent,
    removeQueued,
    recallQueued,
    reorderQueue,
  } = useMessageQueue({
    type,
    id,
    input,
    imagesRef,
    setInput,
    setImages,
    setDraftMentions: setMentions,
    setNotice,
    setError,
    perfEnabled,
  });


  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const { handleFileInput, handlePaste } = useFileHandler({
    inputWrapRef,
  });

  useDraftPersistence({ type, id, mentions, setMentions });

  const titleDisplay = useMemo(() => {
    if (type === "agent") return agentNameMap[id] || id;
    return groupTitle;
  }, [agentNameMap, groupTitle, id, type]);

  useEffect(() => {
    if (type !== "agent") {
      setAgentRuntime(undefined);
      setProjectName(undefined);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const env = await fetchAgentEnv(id);
        if (cancelled) return;
        setAgentRuntime(env.agentRuntime);
        setProjectName(env.projectName);
      } catch {
        if (cancelled) return;
        setAgentRuntime(undefined);
        setProjectName(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, type]);

  useEffect(() => {
    if (type !== "group") return;
    queueMicrotask(() => setGroupTitle(name));
  }, [name, type]);

  const {
    timeline,
    nextCursor,
    loadingMore,
    bootstrapping,
    loadMore: loadMorePage,
    refreshLatest,
  } = useConversationTimeline({
    type,
    id,
    pageSize: PAGE_SIZE,
    soundEnabled,
    setSoundEnabled,
    onBootstrap: (res) => {
      setMembers(res.members);
      setAgentNameMap(res.agentNameMap);
      setQueue(res.queue);
    },
    isPauseRequest,
    playDing,
    perfEnabled,
    setError,
  });

  const triggerBotTickOnce = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    if (botTickBusyRef.current) return;
    botTickBusyRef.current = true;
    try {
      const res = await processBotTick({
        holderId: botHolderIdRef.current,
        convType: type,
        convId: id,
        limit: 80,
      });
      if (!res.success) {
        setNotice(`Bot tick failed: ${res.error}`);
        return;
      }
      if (!res.acquired) {
        setNotice("Bot is busy in another window");
        return;
      }
      if (res.replied === 0) {
        setNotice("Bot is enabled (no pending to reply)");
        return;
      }
      if (res.replied > 0) {
        await refreshLatest();
      }
    } catch {
    } finally {
      botTickBusyRef.current = false;
    }
  }, [id, refreshLatest, setNotice, type]);

  const toggleBot = useCallback(async (): Promise<boolean> => {
    if (!botLoaded) {
      setNotice("Bot status is still loading");
      return botEnabled;
    }
    const prev = botEnabled;
    const next = !prev;
    try {
      await updateBotEnabled(type, id, next);
      setBotEnabled(next);
      setBotLoadError(null);
      if (next) void triggerBotTickOnce();
      return next;
    } catch {
      setBotEnabled(prev);
      setNotice("Failed to toggle bot");
      return prev;
    }
  }, [botEnabled, botLoaded, id, setNotice, triggerBotTickOnce, type]);

  useEffect(() => {
    let cancelled = false;
    setBotLoaded(false);
    setBotLoadError(null);
    void (async () => {
      try {
        const res = await fetchBotEnabled(type, id);
        if (cancelled) return;
        setBotEnabled(Boolean(res.enabled));
        setBotLoaded(true);
        setBotLoadError(null);
      } catch {
        if (cancelled) return;
        setBotEnabled(false);
        setBotLoaded(true);
        setBotLoadError("Failed to sync bot state");
        setNotice("Failed to sync bot state (may still be enabled in background)");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  useEffect(() => {
    if (!botLoaded) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetchBotEnabled(type, id);
        if (cancelled) return;
        const next = Boolean(res.enabled);
        setBotEnabled(next);
        setBotLoadError(null);
      } catch {
        if (cancelled) return;
        setBotLoadError("Failed to sync bot state");
      }
    };

    const interval = setInterval(() => void tick(), 3000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [botLoaded, id, type]);

  useEffect(() => {
    if (!botEnabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      if (botTickBusyRef.current) return;
      botTickBusyRef.current = true;
      try {
        const res = await processBotTick({
          holderId: botHolderIdRef.current,
          convType: type,
          convId: id,
          limit: 80,
        });
        if (cancelled) return;
        if (!res.success) {
          setNotice(`Bot tick failed: ${res.error}`);
          return;
        }
        if (!res.acquired) return;
        if (res.replied > 0) {
          await refreshLatest();
        }
      } catch {
      } finally {
        botTickBusyRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [botEnabled, id, refreshLatest, setNotice, type]);


  const handleTitleChange = async (newTitle: string) => {
    if (type === "agent") {
      if (newTitle === (agentNameMap[id] || id)) return;
      await setAgentDisplayName(id, newTitle);
      setAgentNameMap((prev) => ({ ...prev, [id]: newTitle }));
      window.dispatchEvent(
        new CustomEvent("cuehub:agentDisplayNameUpdated", {
          detail: { agentId: id, displayName: newTitle },
        })
      );
      return;
    }
    if (newTitle === groupTitle) return;
    await setGroupName(id, newTitle);
    setGroupTitle(newTitle);
  };

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const pendingRequests = useMemo(() => {
    const requests = timeline
      .filter((item) => item.item_type === "request")
      .map((item) => item.request);
    return filterPendingRequests(requests);
  }, [timeline]);

  const { send } = useMessageSender({
    type,
    pendingRequests,
    mentions,
    onSuccess: async () => {
      setMentions([]);
      await refreshLatest();
    },
  });

  useEffect(() => {
    if (type === "agent") {
      void (async () => {
        const t0 = perfEnabled() ? performance.now() : 0;
        await ensureAvatarUrl("agent", id);
        if (t0) {
          const t1 = performance.now();
          console.log(`[perf] ensureAvatarUrl(agent) id=${id} ${(t1 - t0).toFixed(1)}ms`);
        }
      })();
      return;
    }

    // group header avatar
    void (async () => {
      const t0 = perfEnabled() ? performance.now() : 0;
      await ensureAvatarUrl("group", id);
      if (t0) {
        const t1 = performance.now();
        console.log(`[perf] ensureAvatarUrl(group) id=${id} ${(t1 - t0).toFixed(1)}ms`);
      }
    })();

    // message bubble avatars (avoid serial await; process in small batches)
    void (async () => {
      const t0 = perfEnabled() ? performance.now() : 0;
      const batchSize = 4;
      for (let i = 0; i < members.length; i += batchSize) {
        const batch = members.slice(i, i + batchSize);
        await Promise.all(batch.map((mid) => ensureAvatarUrl("agent", mid)));
      }
      if (t0) {
        const t1 = performance.now();
        console.log(`[perf] ensureAvatarUrl(group members) group=${id} n=${members.length} ${(t1 - t0).toFixed(1)}ms`);
      }
    })();
  }, [ensureAvatarUrl, id, members, type]);

  const pasteToInput = (
    text: string,
    mode: "replace" | "append" | "upsert" = "replace"
  ) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const next = (() => {
      if (mode === "replace") return cleaned;

      if (mode === "upsert") {
        // Upsert by "<field>:" prefix (first colon defines the key)
        const colon = cleaned.indexOf(":");
        if (colon <= 0) {
          // No clear field key; fall back to append behavior
          mode = "append";
        } else {
          const key = cleaned.slice(0, colon).trim();
          if (!key) {
            mode = "append";
          } else {
            const rawLines = input.split(/\r?\n/);
            const lines = rawLines.map((s) => s.replace(/\s+$/, ""));
            const needle = key + ":";

            let replaced = false;
            const out = lines.map((line) => {
              const t = line.trimStart();
              if (!replaced && t.startsWith(needle)) {
                replaced = true;
                return cleaned;
              }
              return line;
            });

            if (!replaced) {
              const base = out.join("\n").trim() ? out.join("\n").replace(/\s+$/, "") : "";
              return base ? base + "\n" + cleaned : cleaned;
            }

            return out.join("\n");
          }
        }
      }

      if (mode !== "append") return cleaned;

      const lines = input
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = new Set(lines);
      if (exists.has(cleaned)) return input;

      const base = input.trim() ? input.replace(/\s+$/, "") : "";
      return base ? base + "\n" + cleaned : cleaned;
    })();

    setInput(next);
    setMentions((prev) => reconcileMentionsByDisplay(next, prev));
    closeMention();

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    });
  };


  useEffect(() => {
    setBusy(false);
    setError(null);
    setNotice(null);
    setInput("");
    setImages([]);
    imagesRef.current = [];
    setMentions([]);
  }, [type, id, setBusy, setError, setImages, setInput, setMentions, setNotice]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    if (loadingMore) return;

    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    const res = await loadMorePage(nextCursor);
    requestAnimationFrame(() => {
      const cur = scrollRef.current;
      if (!cur) return;
      const newScrollHeight = cur.scrollHeight;
      cur.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    });

    nextCursorRef.current = res.cursor;
  }, [loadMorePage, loadingMore, nextCursor]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 60;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setIsAtBottom(atBottom);

      // Lazy load: auto-load more when near the top
      if (
        el.scrollTop <= threshold &&
        nextCursorRef.current &&
        !loadingMoreRef.current
      ) {
        void loadMore();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [timeline, isAtBottom]);

  const handleSubmitConfirm = useCallback(async (requestId: string, text: string, cancelled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);

    const analysisOnlyInstruction = config.chat_mode_append_text;
    const textToSend =
      conversationMode === "chat"
        ? text.trim().length > 0
          ? `${text}\n\n${analysisOnlyInstruction}`
          : analysisOnlyInstruction
        : text;

    const result = cancelled
      ? await cancelRequest(requestId)
      : await submitResponse(requestId, textToSend, [], []);

    if (!result.success) {
      setError(result.error || "Send failed");
      setBusy(false);
      return;
    }

    await refreshLatest();
    setBusy(false);
  }, [busy, conversationMode, setBusy, setError, refreshLatest, config.chat_mode_append_text]);

  const handleCancel = useCallback(async (requestId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await cancelRequest(requestId);
    if (!result.success) {
      setError(result.error || "End failed");
      setBusy(false);
      return;
    }
    await refreshLatest();
    setBusy(false);
  }, [busy, setBusy, setError, refreshLatest]);

  const handleReply = useCallback(async (requestId: string) => {
    const currentImages = imagesRef.current || [];
    if (!input.trim() && currentImages.length === 0) return;
    if (busy) return;
    setBusy(true);
    setError(null);

    const analysisOnlyInstruction = config.chat_mode_append_text;
    const textToSend =
      conversationMode === "chat"
        ? input.trim().length > 0
          ? `${input}\n\n${analysisOnlyInstruction}`
          : analysisOnlyInstruction
        : input;

    const result = await submitResponse(requestId, textToSend, currentImages, mentions);
    if (!result.success) {
      setError(result.error || "Reply failed");
      setBusy(false);
      return;
    }
    setInput("");
    setImages([]);
    setMentions([]);
    await refreshLatest();
    setBusy(false);
  }, [input, mentions, busy, conversationMode, imagesRef, setBusy, setError, setInput, setImages, setMentions, refreshLatest, config.chat_mode_append_text]);


  const hasPendingRequests = pendingRequests.length > 0;
  const canSend =
    !busy &&
    hasPendingRequests &&
    (input.trim().length > 0 || images.length > 0);

  // Queue auto-consumption is handled by the global worker.

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Auto-grow up to ~8 lines; beyond that, keep it scrollable
    el.style.height = "0px";
    const maxPx = 8 * 22; // ~8 lines
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const el = inputWrapRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const bottomOffsetPx = 20; // matches ChatComposer: bottom-5
      const extraPx = 12;
      const next = Math.max(0, Math.ceil(rect.height + bottomOffsetPx + extraPx));
      setComposerPadPx(next);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      {notice && (
        <div className="pointer-events-none fixed right-5 top-5 z-50">
          <div className="rounded-2xl border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
            {notice}
          </div>
        </div>
      )}
      <ChatHeader
        type={type}
        id={id}
        titleDisplay={titleDisplay}
        avatarUrl={type === "group" ? avatarUrlMap[`group:${id}`] : avatarUrlMap[`agent:${id}`]}
        members={members}
        agentRuntime={agentRuntime}
        projectName={projectName}
        onBack={onBack}
        onAvatarClick={() => openAvatarPicker({ kind: type, id })}
        onTitleChange={handleTitleChange}
      />
      {/* Messages */}
      <ScrollArea
        className={cn(
          "flex-1 min-h-0 p-2 sm:p-4",
          "bg-transparent"
        )}
        viewportRef={scrollRef}
      >
        <div
          className="mx-auto flex w-full max-w-230 flex-col gap-6 overflow-x-hidden"
          style={{ paddingBottom: composerPadPx }}
        >
          {bootstrapping ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-center py-1">
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
              <div className="flex justify-end">
                <div className="w-[78%] space-y-2">
                  <Skeleton className="h-4 w-24 ml-auto" />
                  <Skeleton className="h-16 w-full ml-auto" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-14 w-full" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <TimelineList
                type={type}
                timeline={timeline}
                nextCursor={nextCursor}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                agentNameMap={agentNameMap}
                avatarUrlMap={avatarUrlMap}
                busy={busy}
                pendingInput={deferredInput}
                onPasteChoice={pasteToInput}
                onSubmitConfirm={handleSubmitConfirm}
                onMentionAgent={(agentId: string) => insertMentionAtCursor(agentId, agentId)}
                onReply={handleReply}
                onCancel={handleCancel}
                onPreview={setPreviewImage}
              />
            </>
          )}
        </div>
      </ScrollArea>

      {!bootstrapping && !isAtBottom && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={scrollToBottom}
          className={cn(
            "absolute right-4 z-40",
            "h-10 w-10 rounded-full",
            "bg-background/85 backdrop-blur",
            "shadow-sm",
            "hover:bg-background"
          )}
          style={{ bottom: Math.max(16, composerPadPx - 8) }}
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}

      {error && (
        <div className="border-t bg-background px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ChatComposer
        type={type}
        onBack={onBack}
        busy={busy}
        canSend={canSend}
        hasPendingRequests={pendingRequests.length > 0}
        input={input}
        conversationMode={conversationMode}
        setConversationMode={setConversationMode}
        setInput={setInput}
        images={images}
        setImages={setImages}
        setPreviewImage={setPreviewImage}
        botEnabled={botEnabled}
        botLoaded={botLoaded}
        botLoadError={botLoadError}
        onToggleBot={toggleBot}
        handleSend={() => void send()}
        enqueueCurrent={enqueueCurrent}
        queue={queue}
        removeQueued={removeQueued}
        recallQueued={recallQueued}
        reorderQueue={reorderQueue}
        handlePaste={handlePaste}
        handleImageUpload={handleFileInput}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        inputWrapRef={inputWrapRef}
        mentionOpen={mentionOpen}
        mentionPos={mentionPos}
        mentionCandidates={mentionCandidates}
        mentionActive={mentionActive}
        setMentionActive={setMentionActive}
        mentionScrollable={mentionScrollable}
        mentionPopoverRef={mentionPopoverRef}
        mentionListRef={mentionListRef}
        pointerInMentionRef={pointerInMentionRef}
        mentionScrollTopRef={mentionScrollTopRef}
        closeMention={closeMention}
        insertMention={insertMentionAtCursor}
        updateMentionFromCursor={updateMentionFromCursor}
        draftMentions={mentions}
        setDraftMentions={setMentions}
        agentNameMap={agentNameMap}
        setAgentNameMap={setAgentNameMap}
      />

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl glass-surface glass-noise">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewImage ? (
            <div className="flex items-center justify-center">
              {((img) => (
                <Image
                  src={`data:${img.mime_type};base64,${img.base64_data}`}
                  alt=""
                  width={1200}
                  height={800}
                  unoptimized
                  className="max-h-[70vh] h-auto w-auto rounded-lg"
                />
              ))(previewImage!)}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="max-w-lg glass-surface glass-noise">
          <DialogHeader>
            <DialogTitle>Avatar</DialogTitle>
          </DialogHeader>
          {avatarPickerTarget ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {((target) => {
                  const key = `${target.kind}:${target.id}`;
                  return (
                    <div className="h-14 w-14 rounded-full bg-muted overflow-hidden">
                      {avatarUrlMap[key] ? (
                        <Image
                          src={avatarUrlMap[key]}
                          alt=""
                          width={56}
                          height={56}
                          unoptimized
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl">
                          {target.kind === "group" ? "👥" : getAgentEmoji(id)}
                        </div>
                      )}
                    </div>
                  );
                })(avatarPickerTarget!)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{titleDisplay}</p>
                  <p className="text-xs text-muted-foreground truncate">Click a thumb to apply</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const s = randomSeed();
                    const target = avatarPickerTarget!;
                    await setTargetAvatarSeed(target.kind, target.id, s);
                    // refresh candidate grid
                    void openAvatarPicker(target);
                  }}
                >
                  Random
                </Button>
              </div>

              <div className="max-h-52 overflow-y-auto pr-1">
                <div className="grid grid-cols-5 gap-2">
                {avatarCandidates.map((c) => (
                  <button
                    key={c.seed}
                    type="button"
                    className="h-12 w-12 rounded-full bg-muted overflow-hidden hover:ring-2 hover:ring-ring/40"
                    onClick={async () => {
                      const target = avatarPickerTarget!;
                      await setTargetAvatarSeed(
                        target.kind,
                        target.id,
                        c.seed
                      );
                      setAvatarPickerOpen(false);
                    }}
                    title="Apply"
                  >
                    {c.url ? (
                      <Image
                        src={c.url}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-full w-full"
                      />
                    ) : null}
                  </button>
                ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
