import { useCallback } from "react";
import { submitResponse, cancelRequest } from "@/lib/actions";
import type { MutableRefObject } from "react";

interface UseResponseHandlersProps {
  busy: boolean;
  conversationMode: "chat" | "agent";
  input: string;
  imagesRef: MutableRefObject<{ mime_type: string; base64_data: string; file_name?: string }[]>;
  mentions: { userId: string; start: number; length: number; display: string }[];
  chatModeAppendText: string;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setInput: (input: string) => void;
  setImages: (images: { mime_type: string; base64_data: string; file_name?: string }[]) => void;
  setMentions: (mentions: { userId: string; start: number; length: number; display: string }[]) => void;
  refreshLatest: () => Promise<void>;
  scrollToBottom: (instant?: boolean) => void;
}

export function useResponseHandlers({
  busy,
  conversationMode,
  input,
  imagesRef,
  mentions,
  chatModeAppendText,
  setBusy,
  setError,
  setInput,
  setImages,
  setMentions,
  refreshLatest,
  scrollToBottom,
}: UseResponseHandlersProps) {
  const handleSubmitConfirm = useCallback(async (requestId: string, text: string, cancelled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);

    const textToSend =
      conversationMode === "chat"
        ? text.trim().length > 0
          ? `${text}\n\n${chatModeAppendText}`
          : chatModeAppendText
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
    requestAnimationFrame(() => {
      scrollToBottom(true);
    });
  }, [busy, conversationMode, chatModeAppendText, setBusy, setError, refreshLatest, scrollToBottom]);

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

    const textToSend =
      conversationMode === "chat"
        ? input.trim().length > 0
          ? `${input}\n\n${chatModeAppendText}`
          : chatModeAppendText
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
    requestAnimationFrame(() => {
      scrollToBottom(true);
    });
  }, [input, mentions, busy, conversationMode, chatModeAppendText, imagesRef, setBusy, setError, setInput, setImages, setMentions, refreshLatest, scrollToBottom]);

  return {
    handleSubmitConfirm,
    handleCancel,
    handleReply,
  };
}
