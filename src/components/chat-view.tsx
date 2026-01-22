"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { VirtualTimelineList } from "@/components/chat/virtual-timeline-list";
import { ChatHeader } from "@/components/chat/chat-header";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { useConversationTimeline } from "@/hooks/use-conversation-timeline";
import { useMentions } from "@/hooks/use-mentions";
import { useAvatarManagement } from "@/hooks/use-avatar-management";
import { useAudioNotification } from "@/hooks/use-audio-notification";
import { useBotManagement } from "@/hooks/use-bot-management";
import { useScrollManagement } from "@/hooks/use-scroll-management";
import { useTitleManagement } from "@/hooks/use-title-management";
import { useResponseHandlers } from "@/hooks/use-response-handlers";
import { useDialogState } from "@/hooks/use-dialog-state";
import { usePasteToInput } from "@/hooks/use-paste-to-input";
import { useComposerHeight } from "@/hooks/use-composer-height";
import { useTextareaAutogrow } from "@/hooks/use-textarea-autogrow";
import { PreviewDialog, AvatarPickerDialog } from "@/components/chat/chat-dialogs";
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
import { PerfMonitor } from "@/components/perf-monitor";

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

  const { previewImage, setPreviewImage, closePreview } = useDialogState();
  const { composerPadPx } = useComposerHeight({ inputWrapRef });

  const PAGE_SIZE = 30;

  const {
    titleDisplay,
    agentRuntime,
    projectName,
    agentNameMap,
    setAgentNameMap,
    handleTitleChange,
  } = useTitleManagement({ type, id, name });

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

  const { pasteToInput } = usePasteToInput({
    input,
    setInput,
    setMentions,
    reconcileMentionsByDisplay,
    closeMention,
    textareaRef,
  });

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

  const {
    botEnabled,
    botLoaded,
    botLoadError,
    toggleBot,
  } = useBotManagement({
    type,
    id,
    refreshLatest,
    setNotice,
  });

  const pendingRequests = useMemo(() => {
    const requests = timeline
      .filter((item) => item.item_type === "request")
      .map((item) => item.request);
    return filterPendingRequests(requests);
  }, [timeline]);

  useTextareaAutogrow({ textareaRef, input });

  const { send } = useMessageSender({
    type,
    pendingRequests,
    mentions,
    onSuccess: async () => {
      setMentions([]);
      await refreshLatest();
      // 发送消息后立即滚动到底部
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
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

  useEffect(() => {
    setBusy(false);
    setError(null);
    setNotice(null);
    setInput("");
    setImages([]);
    imagesRef.current = [];
    setMentions([]);
  }, [type, id]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    if (loadingMore) return;

    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    await loadMorePage(nextCursor);
    requestAnimationFrame(() => {
      const cur = scrollRef.current;
      if (!cur) return;
      const newScrollHeight = cur.scrollHeight;
      cur.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    });
  }, [loadMorePage, loadingMore, nextCursor]);

  const { isAtBottom, scrollToBottom } = useScrollManagement({
    scrollRef,
    timeline,
    bootstrapping,
    id,
    loadMore,
    nextCursor,
    loadingMore,
  });

  const { handleSubmitConfirm, handleCancel, handleReply } = useResponseHandlers({
    busy,
    conversationMode,
    input,
    imagesRef,
    mentions,
    chatModeAppendText: config.chat_mode_append_text,
    setBusy,
    setError,
    setInput,
    setImages,
    setMentions,
    refreshLatest,
    scrollToBottom,
  });

  const hasPendingRequests = pendingRequests.length > 0;
  const canSend =
    !busy &&
    hasPendingRequests &&
    (input.trim().length > 0 || images.length > 0);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      <PerfMonitor />
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
      {bootstrapping ? (
        <div className="flex-1 min-h-0 p-2 sm:p-4">
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
        </div>
      ) : (
        <VirtualTimelineList
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
          scrollerRef={scrollRef}
        />
      )}

      {!bootstrapping && !isAtBottom && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scrollToBottom(true)}
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

      <PreviewDialog previewImage={previewImage} onClose={closePreview} />

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        avatarPickerTarget={avatarPickerTarget}
        avatarUrlMap={avatarUrlMap}
        avatarCandidates={avatarCandidates}
        titleDisplay={titleDisplay}
        onRandomize={async () => {
          const s = randomSeed();
          const target = avatarPickerTarget!;
          await setTargetAvatarSeed(target.kind, target.id, s);
          void openAvatarPicker(target);
        }}
        onSelectAvatar={async (seed) => {
          const target = avatarPickerTarget!;
          await setTargetAvatarSeed(target.kind, target.id, seed);
          setAvatarPickerOpen(false);
        }}
      />
    </div>
  );
}
