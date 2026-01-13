"use client";

import { memo, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatFullTime, getAgentEmoji, getWaitingDuration } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PayloadCard } from "@/components/payload-card";
import type { AgentTimelineItem, CueRequest, CueResponse } from "@/lib/actions";

function parseDbTime(dateStr: string) {
  return new Date((dateStr || "").replace(" ", "T"));
}

function formatDivider(dateStr: string) {
  const d = parseDbTime(dateStr);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

export type TimelineListProps = {
  type: "agent" | "group";
  timeline: AgentTimelineItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void | Promise<void>;
  agentNameMap: Record<string, string>;
  avatarUrlMap: Record<string, string>;
  busy: boolean;
  pendingInput: string;
  onPasteChoice: (text: string, mode?: "replace" | "append" | "upsert") => void;
  onSubmitConfirm: (
    requestId: string,
    text: string,
    cancelled: boolean
  ) => void | Promise<void>;
  onMentionAgent: (agentId: string) => void;
  onReply: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onPreview: (img: { mime_type: string; base64_data: string }) => void;
};

export const TimelineList = memo(function TimelineList({
  type,
  timeline,
  nextCursor,
  loadingMore,
  onLoadMore,
  agentNameMap,
  avatarUrlMap,
  busy,
  pendingInput,
  onPasteChoice,
  onSubmitConfirm,
  onMentionAgent,
  onReply,
  onCancel,
  onPreview,
}: TimelineListProps) {
  return (
    <>
      {loadingMore && (
        <div className="flex justify-center py-1">
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
            Loading...
          </span>
        </div>
      )}
      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      {timeline.map((item, idx) => {
        const prev = idx > 0 ? timeline[idx - 1] : null;

        const curTime = item.time;
        const prevTime = prev?.time;
        const showDivider = (() => {
          if (!prevTime) return true;
          const a = parseDbTime(prevTime).getTime();
          const b = parseDbTime(curTime).getTime();
          return b - a > 5 * 60 * 1000;
        })();

        const divider = showDivider ? (
          <div key={`div-${curTime}-${idx}`} className="flex justify-center py-1">
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
              {formatDivider(curTime)}
            </span>
          </div>
        ) : null;

        if (item.item_type === "request") {
          const prevSameSender =
            prev?.item_type === "request" && prev.request.agent_id === item.request.agent_id;

          const prevWasRequest = prev?.item_type === "request";
          const compact = prevWasRequest && prevSameSender;

          return (
            <div key={`wrap-req-${item.request.request_id}`} className={cn(compact ? "-mt-1" : "")}>
              {divider}
              <MessageBubble
                request={item.request}
                showAgent={type === "group"}
                agentNameMap={agentNameMap}
                avatarUrlMap={avatarUrlMap}
                showName={!prevSameSender}
                showAvatar={!prevSameSender}
                compact={compact}
                disabled={busy}
                currentInput={item.request.status === "PENDING" ? pendingInput : undefined}
                isGroup={type === "group"}
                onPasteChoice={onPasteChoice}
                onSubmitConfirm={onSubmitConfirm}
                onMentionAgent={onMentionAgent}
                onReply={() => onReply(item.request.request_id)}
                onCancel={() => onCancel(item.request.request_id)}
              />
            </div>
          );
        }

        const prevIsResp = prev?.item_type === "response";
        const compactResp = prevIsResp;

        return (
          <div key={`wrap-resp-${item.response.id}`} className={cn(compactResp ? "-mt-1" : "")}>
            {divider}
            <UserResponseBubble
              response={item.response}
              showAvatar={!compactResp}
              compact={compactResp}
              onPreview={onPreview}
            />
          </div>
        );
      })}

      {timeline.length === 0 && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">No messages yet</div>
      )}
    </>
  );
});

const MessageBubble = memo(function MessageBubble({
  request,
  showAgent,
  agentNameMap,
  avatarUrlMap,
  isHistory,
  showName,
  showAvatar,
  compact,
  disabled,
  currentInput,
  isGroup,
  onPasteChoice,
  onSubmitConfirm,
  onMentionAgent,
  onReply,
  onCancel,
}: {
  request: CueRequest;
  showAgent?: boolean;
  agentNameMap?: Record<string, string>;
  avatarUrlMap?: Record<string, string>;
  isHistory?: boolean;
  showName?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
  disabled?: boolean;
  currentInput?: string;
  isGroup?: boolean;
  onPasteChoice?: (text: string, mode?: "replace" | "append" | "upsert") => void;
  onSubmitConfirm?: (
    requestId: string,
    text: string,
    cancelled: boolean
  ) => void | Promise<void>;
  onMentionAgent?: (agentId: string) => void;
  onReply?: () => void;
  onCancel?: () => void;
}) {
  const isPending = request.status === "PENDING";

  const isPause = useMemo(() => {
    if (!request.payload) return false;
    try {
      const obj = JSON.parse(request.payload) as Record<string, unknown>;
      return obj?.type === "confirm" && obj?.variant === "pause";
    } catch {
      return false;
    }
  }, [request.payload]);

  const selectedLines = useMemo(() => {
    const text = (currentInput || "").trim();
    if (!text) return new Set<string>();
    return new Set(
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }, [currentInput]);

  const rawId = request.agent_id || "";
  const displayName = (agentNameMap && rawId ? agentNameMap[rawId] || rawId : rawId) || "";
  const cardMaxWidth = (showAvatar ?? true) ? "calc(100% - 3rem)" : "100%";
  const avatarUrl = rawId && avatarUrlMap ? avatarUrlMap[`agent:${rawId}`] : "";

  return (
    <div
      className={cn(
        "flex max-w-full min-w-0 items-start gap-3",
        compact && "gap-2",
        isHistory && "opacity-60"
      )}
    >
      {(showAvatar ?? true) ? (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg",
            isGroup && request.agent_id && onMentionAgent && "cursor-pointer"
          )}
          title={
            isGroup && request.agent_id && onMentionAgent
              ? "Double-click avatar to @mention"
              : undefined
          }
          onDoubleClick={() => {
            if (!isGroup) return;
            const agentId = request.agent_id;
            if (!agentId) return;
            onMentionAgent?.(agentId);
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full rounded-full" />
          ) : (
            getAgentEmoji(request.agent_id || "")
          )}
        </span>
      ) : (
        <span className="h-9 w-9 shrink-0" />
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        {(showName ?? true) && (showAgent || displayName) && (
          <p className="mb-1 text-xs text-muted-foreground truncate">{displayName}</p>
        )}
        <div
          className={cn(
            "rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 overflow-hidden",
            "glass-surface-soft glass-noise",
            isPending ? "ring-1 ring-ring/25" : "ring-1 ring-white/25"
          )}
          style={{ clipPath: "inset(0 round 1rem)", maxWidth: cardMaxWidth }}
        >
          <div className="text-sm wrap-anywhere overflow-hidden min-w-0">
            <MarkdownRenderer>{request.prompt || ""}</MarkdownRenderer>
          </div>
          <PayloadCard
            raw={request.payload}
            disabled={disabled}
            onPasteChoice={onPasteChoice}
            onSubmitConfirm={(text, cancelled) =>
              isPending ? onSubmitConfirm?.(request.request_id, text, cancelled) : undefined
            }
            selectedLines={selectedLines}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{formatFullTime(request.created_at || "")}</span>
          {isPending && (
            <>
              <Badge variant="outline" className="text-xs shrink-0">
                Waiting {getWaitingDuration(request.created_at || "")}
              </Badge>
              {!isPause && (
                <>
                  <Badge variant="default" className="text-xs shrink-0">
                    Pending
                  </Badge>
                  {onReply && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={onReply}
                      disabled={disabled}
                    >
                      Reply
                    </Button>
                  )}
                  {onCancel && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-destructive"
                      onClick={onCancel}
                      disabled={disabled}
                    >
                      End
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {request.status === "COMPLETED" && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Replied
            </Badge>
          )}
          {request.status === "CANCELLED" && (
            <Badge variant="destructive" className="text-xs shrink-0">
              Ended
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
});

const UserResponseBubble = memo(function UserResponseBubble({
  response,
  showAvatar = true,
  compact = false,
  onPreview,
}: {
  response: CueResponse;
  showAvatar?: boolean;
  compact?: boolean;
  onPreview?: (img: { mime_type: string; base64_data: string }) => void;
}) {
  const parsed = JSON.parse(response.response_json || "{}") as {
    text?: string;
    mentions?: { userId: string; start: number; length: number; display: string }[];
  };

  const files = Array.isArray((response as any).files) ? ((response as any).files as any[]) : [];
  const imageFiles = files.filter((f) => {
    const mime = String(f?.mime_type || "");
    return mime.startsWith("image/") && typeof f?.inline_base64 === "string" && f.inline_base64.length > 0;
  });
  const otherFiles = files.filter((f) => {
    const mime = String(f?.mime_type || "");
    return !mime.startsWith("image/");
  });

  const renderTextWithMentions = (text: string, mentions?: { start: number; length: number }[]) => {
    if (!mentions || mentions.length === 0) return text;
    const safe = [...mentions]
      .filter((m) => m.start >= 0 && m.length > 0 && m.start + m.length <= text.length)
      .sort((a, b) => a.start - b.start);

    const nodes: ReactNode[] = [];
    let cursor = 0;
    for (const m of safe) {
      if (m.start < cursor) continue;
      if (m.start > cursor) {
        nodes.push(text.slice(cursor, m.start));
      }
      const seg = text.slice(m.start, m.start + m.length);
      nodes.push(
        <span key={`m-${m.start}`} className="text-emerald-900/90 dark:text-emerald-950 font-semibold">
          {seg}
        </span>
      );
      cursor = m.start + m.length;
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
  };

  if (response.cancelled) {
    return (
      <div className="flex justify-end gap-3 max-w-full min-w-0">
        <div
          className="rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 sm:max-w-215 sm:flex-none sm:w-fit overflow-hidden glass-surface-soft glass-noise ring-1 ring-white/25"
          style={{
            clipPath: "inset(0 round 1rem)",
            maxWidth: showAvatar ? "calc(100% - 3rem)" : "100%",
          }}
        >
          <p className="text-sm text-muted-foreground italic">Conversation ended</p>
          <p className="text-xs text-muted-foreground mt-1">{formatFullTime(response.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex justify-end gap-3 max-w-full min-w-0", compact && "gap-2")}>
      <div
        className="rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 sm:max-w-215 sm:flex-none sm:w-fit overflow-hidden glass-surface-soft glass-noise ring-1 ring-white/25"
        style={{
          clipPath: "inset(0 round 1rem)",
          maxWidth: showAvatar ? "calc(100% - 3rem)" : "100%",
        }}
      >
        {parsed.text && (
          <div className="text-sm wrap-anywhere overflow-hidden min-w-0">
            {parsed.mentions && parsed.mentions.length > 0 ? (
              <p className="whitespace-pre-wrap">{renderTextWithMentions(parsed.text, parsed.mentions)}</p>
            ) : (
              <MarkdownRenderer>{parsed.text}</MarkdownRenderer>
            )}
          </div>
        )}
        {imageFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 max-w-full">
            {imageFiles.map((f, i) => {
              const mime = String(f?.mime_type || "image/png");
              const b64 = String(f?.inline_base64 || "");
              const img = { mime_type: mime, base64_data: b64 };
              return (
                <img
                  key={i}
                  src={`data:${img.mime_type};base64,${img.base64_data}`}
                  alt=""
                  className="max-h-32 max-w-full h-auto rounded cursor-pointer"
                  onClick={() => onPreview?.(img)}
                />
              );
            })}
          </div>
        )}

        {otherFiles.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 max-w-full">
            {otherFiles.map((f, i) => {
              const fileRef = String(f?.file || "");
              const name = fileRef.split("/").filter(Boolean).pop() || fileRef || "file";
              return (
                <div
                  key={i}
                  className="px-2 py-1 rounded-lg bg-white/40 dark:bg-black/20 ring-1 ring-border/40 text-xs text-foreground/80 truncate"
                  title={fileRef}
                >
                  {name}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs opacity-70 mt-1 text-right">{formatFullTime(response.created_at)}</p>
      </div>
      {showAvatar ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
          👤
        </span>
      ) : (
        <span className="h-9 w-9 shrink-0" />
      )}
    </div>
  );
});
