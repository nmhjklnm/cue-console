import type { CueRequest } from "@/lib/actions";
import type { MessageActionParams, MentionDraft, ImageAttachment } from "@/types/chat";

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getPendingRequestTimeoutMs(): number {
  try {
    const raw = window.localStorage.getItem("cue-console:pending_request_timeout_ms");
    const n = Number(raw);
    if (Number.isFinite(n)) return clampNumber(n, 60_000, 86_400_000);
  } catch {
  }
  return 10 * 60 * 1000;
}

export function isPauseRequest(req: CueRequest): boolean {
  if (!req.payload) return false;
  try {
    const obj = JSON.parse(req.payload) as Record<string, unknown>;
    return obj?.type === "confirm" && obj?.variant === "pause";
  } catch {
    return false;
  }
}

export function filterPendingRequests(requests: CueRequest[]): CueRequest[] {
  const now = Date.now();
  const TIMEOUT_MS = getPendingRequestTimeoutMs();
  
  return requests.filter((r) => {
    if (r.status !== "PENDING") return false;
    
    // Filter out requests older than timeout
    if (r.created_at) {
      const createdTime = new Date(r.created_at).getTime();
      const age = now - createdTime;
      if (age > TIMEOUT_MS) return false;
    }
    
    return true;
  });
}

export function getLatestPendingRequest(requests: CueRequest[]): CueRequest | null {
  const pending = filterPendingRequests(requests);
  if (pending.length === 0) return null;
  
  return pending
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
}

export function getMentionTargets(draftMentions: MentionDraft[]): Set<string> {
  return new Set(
    draftMentions
      .map((m) => m.userId)
      .filter((id) => id && id !== "all")
  );
}

export function filterRequestsByMentions(
  requests: CueRequest[],
  mentionTargets: Set<string>
): CueRequest[] {
  return filterPendingRequests(requests).filter(
    (r) => r.agent_id && mentionTargets.has(r.agent_id)
  );
}

export function shouldSendMessage(
  input: string,
  images: ImageAttachment[]
): boolean {
  return input.trim().length > 0 || images.length > 0;
}

export function reconcileMentionsByDisplay(
  text: string,
  mentions: MentionDraft[]
): MentionDraft[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const textSet = new Set(lines);
  
  return mentions.filter((m) => {
    const mentionText = text.slice(m.start, m.start + m.length);
    return textSet.has(mentionText) || text.includes(m.display);
  });
}

export function calculateMessageTargets(params: MessageActionParams): {
  shouldSend: boolean;
  targetRequests: CueRequest[];
  error?: string;
} {
  const { type, input, images, draftMentions, pendingRequests } = params;

  if (!shouldSendMessage(input, images)) {
    return { shouldSend: false, targetRequests: [], error: "No content to send" };
  }

  const pending = filterPendingRequests(pendingRequests);
  if (pending.length === 0) {
    return { shouldSend: false, targetRequests: [], error: "No pending requests to answer" };
  }

  if (type === "agent") {
    const latest = getLatestPendingRequest(pendingRequests);
    return {
      shouldSend: !!latest,
      targetRequests: latest ? [latest] : [],
    };
  }

  // Group chat
  const mentionTargets = getMentionTargets(draftMentions);
  const hasMentions = mentionTargets.size > 0;

  if (hasMentions) {
    const targetRequests = filterRequestsByMentions(pendingRequests, mentionTargets);
    return {
      shouldSend: targetRequests.length > 0,
      targetRequests,
    };
  }

  return {
    shouldSend: true,
    targetRequests: pending,
  };
}
