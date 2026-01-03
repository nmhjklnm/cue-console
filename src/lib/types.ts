/* tslint:disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * 请求状态（SQLModel 存储枚举名称为大写）
 */
export type RequestStatus = "PENDING" | "COMPLETED" | "CANCELLED";

/**
 * MCP → 客户端（cue-hub / 模拟器）的请求
 */
export interface CueRequest {
  id?: number | null;
  request_id: string;
  agent_id?: string;
  prompt: string;
  payload?: string | null;
  status?: RequestStatus;
  created_at?: string;
  updated_at?: string;
}
/**
 * 客户端（cue-hub / 模拟器）→ MCP 的响应
 */
export interface CueResponse {
  id?: number | null;
  request_id: string;
  response_json: string;
  cancelled?: boolean;
  created_at?: string;
}
/**
 * 图片内容
 */
export interface ImageContent {
  mime_type: string;
  base64_data: string;
}

export interface Mention {
  userId: string;
  start: number;
  length: number;
  display: string;
}
/**
 * 用户响应内容
 */
export interface UserResponse {
  text?: string;
  images?: ImageContent[];
  mentions?: Mention[];
}

// ============ 以下为前端扩展类型 ============

/**
 * 群组
 */
export interface Group {
  id: string;
  name: string;
  created_at: string;
}

/**
 * 群组成员
 */
export interface GroupMember {
  group_id: string;
  agent_name: string;
  joined_at: string;
}

/**
 * 对话列表项
 */
export interface ConversationItem {
  id: string;
  name: string;
  displayName: string;
  type: "agent" | "group";
  lastMessage?: string;
  lastTime?: string;
  pendingCount: number;
}
