import { useCallback, useRef } from "react";
import { submitResponse, batchRespond } from "@/lib/actions";
import { calculateMessageTargets } from "@/lib/chat-logic";
import { useInputContext } from "@/contexts/input-context";
import { useUIStateContext } from "@/contexts/ui-state-context";
import type { CueRequest } from "@/lib/actions";
import type { ChatType, MentionDraft } from "@/types/chat";

interface UseMessageSenderParams {
  type: ChatType;
  pendingRequests: CueRequest[];
  mentions: MentionDraft[];
  onSuccess?: () => Promise<void>;
}

export function useMessageSender({ type, pendingRequests, mentions, onSuccess }: UseMessageSenderParams) {
  const { input, images, setInput, setImages } = useInputContext();
  const { busy, setBusy, setError } = useUIStateContext();
  const imagesRef = useRef(images);
  
  // Keep ref in sync
  imagesRef.current = images;

  const send = useCallback(async () => {
    const currentImages = imagesRef.current;
    
    if (busy) return;

    const targets = calculateMessageTargets({
      type,
      input,
      images: currentImages,
      draftMentions: mentions,
      pendingRequests,
    });

    if (!targets.shouldSend) {
      if (targets.error) {
        setError(targets.error);
      }
      return;
    }

    setBusy(true);
    setError(null);

    try {
      let result;
      
      if (type === "agent" && targets.targetRequests.length === 1) {
        result = await submitResponse(
          targets.targetRequests[0].request_id,
          input,
          currentImages,
          mentions
        );
      } else {
        result = await batchRespond(
          targets.targetRequests.map((r) => r.request_id),
          input,
          currentImages,
          mentions
        );
      }

      if (!result.success) {
        setError(result.error || "Send failed");
        return;
      }

      // Clear input after successful send
      setInput("");
      setImages([]);
      await onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [type, input, mentions, pendingRequests, busy, setBusy, setError, setInput, setImages, onSuccess]);

  return { send };
}
