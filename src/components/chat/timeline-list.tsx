"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentTimelineItem } from "@/lib/actions";
import { MessageBubble } from "@/components/chat/message-bubble";
import { UserResponseBubble } from "@/components/chat/user-response-bubble";

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
