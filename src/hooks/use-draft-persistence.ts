import { useEffect, useMemo } from "react";
import { useInputContext } from "@/contexts/input-context";
import type { ChatType, ImageAttachment, MentionDraft } from "@/types/chat";
import { logError } from "@/lib/error-handler";

interface DraftData {
  input: string;
  images: ImageAttachment[];
  draftMentions: MentionDraft[];
}

interface UseDraftPersistenceParams {
  type: ChatType;
  id: string;
}

function getDraftKey(type: ChatType, id: string): string {
  return `cue-console:draft:${type}:${id}`;
}

function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw) as Partial<DraftData>;
    
    return {
      input: typeof parsed.input === "string" ? parsed.input : "",
      images: Array.isArray(parsed.images) ? parsed.images : [],
      draftMentions: Array.isArray(parsed.draftMentions) ? parsed.draftMentions : [],
    };
  } catch (error) {
    logError(error, "draft-load");
    return null;
  }
}

function saveDraft(key: string, data: DraftData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    logError(error, "draft-save");
  }
}

export function useDraftPersistence({ type, id, mentions, setMentions }: UseDraftPersistenceParams & {
  mentions: MentionDraft[];
  setMentions: React.Dispatch<React.SetStateAction<MentionDraft[]>>;
}) {
  const { input, images, setInput, setImages } = useInputContext();
  
  const draftKey = useMemo(() => getDraftKey(type, id), [type, id]);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft(draftKey);
    if (draft) {
      setInput(draft.input);
      setImages(draft.images);
      setMentions(draft.draftMentions);
    }
  }, [draftKey, setInput, setImages, setMentions]);

  // Save draft on change (debounced via useEffect)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(draftKey, { input, images, draftMentions: mentions });
    }, 500); // Increased from 300ms to reduce performance impact

    return () => clearTimeout(timer);
  }, [draftKey, input, images, mentions]);
}
