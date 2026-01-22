export type ConversationType = "agent" | "group";

export interface CueRequest {
  id: number;
  request_id: string;
  agent_id: string;
  prompt: string;
  payload: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  created_at: string;
  updated_at: string;
}

export interface CueResponse {
  id: number;
  request_id: string;
  response_json: string;
  cancelled: boolean;
  created_at: string;
  files?: CueFile[];
  files_count?: number;
}

export interface CueFile {
  id: number;
  sha256: string;
  file: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  inline_base64?: string;
}

export type AgentTimelineItem =
  | {
      item_type: "request";
      time: string;
      request: CueRequest;
    }
  | {
      item_type: "response";
      time: string;
      response: CueResponse;
      request_id: string;
    };

export interface ConversationMeta {
  key: string;
  type: "agent" | "group";
  id: string;
  archived: 0 | 1;
  archived_at: string | null;
  deleted: 0 | 1;
  deleted_at: string | null;
}

export interface AgentEnv {
  agent_id: string;
  agent_runtime: string | null;
  project_dir: string | null;
  agent_terminal: string | null;
  updated_at: string | null;
}

export interface CueQueuedMessage {
  id: string;
  conv_type: ConversationType;
  conv_id: string;
  position: number;
  message_json: string;
  status: "queued" | "processing";
  attempts: number;
  next_run_at: string;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type { UserResponse, Group, GroupMember } from "../types";
