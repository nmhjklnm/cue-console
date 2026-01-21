import { useMemo, useState, memo, type FC } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getAgentEmoji, formatFullTime, getWaitingDuration } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PayloadCard } from "@/components/payload-card";
import type { CueRequest } from "@/lib/actions";
import { Copy, Check } from "lucide-react";
import Image from "next/image";

interface MessageBubbleProps {
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
  onSubmitConfirm?: (requestId: string, text: string, cancelled: boolean) => void | Promise<void>;
  onMentionAgent?: (agentId: string) => void;
  onReply?: () => void;
  onCancel?: () => void;
}

const MessageBubbleComponent: FC<MessageBubbleProps> = ({
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
}: MessageBubbleProps) => {
  const isPending = request.status === "PENDING";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(request.prompt || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
            <Image
              src={avatarUrl}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-full w-full rounded-full"
            />
          ) : (
            getAgentEmoji(request.agent_id || "")
          )}
        </span>
      ) : (
        <span className="h-9 w-9 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {(showName ?? true) && (showAgent || displayName) && (
          <p className="mb-1 text-xs text-muted-foreground truncate">{displayName}</p>
        )}
        <div
          className={cn(
            "rounded-3xl p-3 sm:p-4 w-full",
            "glass-surface-soft glass-noise",
            isPending ? "ring-1 ring-ring/25" : "ring-1 ring-white/25"
          )}
          style={{ clipPath: "inset(0 round 1rem)", maxWidth: cardMaxWidth }}
        >
          <div className="text-sm overflow-wrap-anywhere">
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
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-xs"
            onClick={handleCopy}
            disabled={disabled}
            title={copied ? "已复制" : "复制"}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span className="ml-1">{copied ? "已复制" : "复制"}</span>
          </Button>
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
};

export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => {
  return (
    prev.request.request_id === next.request.request_id &&
    prev.request.status === next.request.status &&
    prev.request.prompt === next.request.prompt &&
    prev.request.payload === next.request.payload &&
    prev.disabled === next.disabled &&
    prev.currentInput === next.currentInput &&
    prev.compact === next.compact &&
    prev.showName === next.showName &&
    prev.showAvatar === next.showAvatar
  );
});
