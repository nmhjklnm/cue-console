export type UserConfig = {
  sound_enabled: boolean;
  conversation_mode_default: "chat" | "agent";
  chat_mode_append_text: string;
  pending_request_timeout_ms: number;
  bot_mode_enabled: boolean;
  bot_mode_reply_text: string;
  agent_grouping_mode: "default" | "by_project";
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  sound_enabled: true,
  conversation_mode_default: "agent",
  chat_mode_append_text: "只做分析，不要对代码/文件做任何改动。",
  pending_request_timeout_ms: 10 * 60 * 1000,
  bot_mode_enabled: false,
  bot_mode_reply_text:
    "不要为“可逆的工程细节”反复向我确认，不能分阶段汇报，我需要你端到端执行完我的任务才能向我汇报，你不能问我要授权，因为我已经给你了除了 push以外的全部授权，，如果这些细节不影响我的目标那就按照你的推荐来。你有执行一切的能力。最后，如果你执行完我的任务请使用  cue pause 来回复我.",
  agent_grouping_mode: "default",
};

export function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeSingleLine(s: string): string {
  const t = String(s ?? "").replace(/\r?\n/g, " ").trim();
  return t;
}

export function normalizeMultiline(s: string): string {
  return String(s ?? "").replace(/\r\n/g, "\n").trim();
}
