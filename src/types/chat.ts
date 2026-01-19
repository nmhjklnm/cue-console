import type { CueRequest } from "@/lib/actions";

export type ChatType = "agent" | "group";

export interface MentionDraft {
  userId: string;
  start: number;
  length: number;
  display: string;
}

export interface ImageAttachment {
  mime_type: string;
  base64_data: string;
  file_name?: string;
}

export interface ChatState {
  input: string;
  images: ImageAttachment[];
  draftMentions: MentionDraft[];
  busy: boolean;
  error: string | null;
  notice: string | null;
}

export interface ChatMetadata {
  type: ChatType;
  id: string;
  name: string;
  members: string[];
  agentNameMap: Record<string, string>;
  groupTitle: string;
}

export interface MessageActionParams {
  type: ChatType;
  input: string;
  images: ImageAttachment[];
  draftMentions: MentionDraft[];
  pendingRequests: CueRequest[];
}

export interface MessageActionResult {
  success: boolean;
  error?: string;
}
