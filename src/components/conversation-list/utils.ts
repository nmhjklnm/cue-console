import type { ConversationItem } from "@/lib/actions";

export function perfEnabled(): boolean {
  try {
    return window.localStorage.getItem("cue-console:perf") === "1";
  } catch {
    return false;
  }
}

export function conversationKey(item: Pick<ConversationItem, "type" | "id">) {
  return `${item.type}:${item.id}`;
}

export type IdleCallbackHandle = number;
export type IdleRequestCallback = () => void;
export type IdleRequestOptions = { timeout?: number };
export type GlobalWithIdleCallbacks = typeof globalThis & {
  requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};
