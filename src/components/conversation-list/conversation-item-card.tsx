import Image from "next/image";
import { Pin } from "lucide-react";
import { cn, getAgentEmoji, formatTime, truncateText } from "@/lib/utils";
import type { ConversationItem } from "@/lib/actions";

interface ConversationItemCardProps {
  item: ConversationItem;
  avatarUrl?: string;
  isSelected: boolean;
  isPinned?: boolean;
  onClick: () => void;
  bulkMode?: boolean;
  checked?: boolean;
  onToggleChecked?: () => void;
}

export function ConversationItemCard({
  item,
  avatarUrl,
  isSelected,
  isPinned,
  onClick,
  bulkMode,
  checked,
  onToggleChecked,
}: ConversationItemCardProps) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);
  const showAgentTags = item.type === "agent" && (item.agentRuntime || item.projectName);

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left transition overflow-hidden",
        "backdrop-blur-sm",
        isSelected
          ? "bg-primary/10 text-accent-foreground shadow-sm"
          : isPinned
            ? "bg-amber-200/15 hover:bg-amber-200/20"
            : "hover:bg-white/40"
      )}
      onClick={onClick}
    >
      {bulkMode && (
        <span className="flex h-9 w-5 items-center justify-center">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={() => onToggleChecked?.()}
            onClick={(e) => e.stopPropagation()}
          />
        </span>
      )}
      <span className="relative h-9 w-9 shrink-0">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white/55 ring-1 ring-white/40 text-[18px] overflow-hidden">
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
            emoji
          )}
        </span>
        {item.pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium leading-5">
            {isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600/80" />}
            {truncateText(item.displayName, 18)}
          </span>
          {item.lastTime && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatTime(item.lastTime)}
            </span>
          )}
        </div>
        {showAgentTags && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.agentRuntime && (
              <span className="inline-flex items-center rounded-full border bg-white/55 px-2 py-0.5 text-[10px] text-muted-foreground">
                {item.agentRuntime}
              </span>
            )}
            {item.projectName && (
              <span className="inline-flex items-center rounded-full border bg-white/55 px-2 py-0.5 text-[10px] text-muted-foreground">
                {item.projectName}
              </span>
            )}
          </div>
        )}
        {item.lastMessage && (
          <p className="text-[11px] text-muted-foreground whitespace-nowrap leading-4">
            {truncateText(item.lastMessage.replace(/\n/g, ' '), 20)}
          </p>
        )}
      </div>
    </button>
  );
}
