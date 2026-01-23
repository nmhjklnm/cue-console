import Image from "next/image";
import { cn, getAgentEmoji } from "@/lib/utils";
import type { ConversationItem } from "@/lib/actions";

interface ConversationIconButtonProps {
  item: ConversationItem;
  avatarUrl?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationIconButton({
  item,
  avatarUrl,
  isSelected,
  onClick,
}: ConversationIconButtonProps) {
  const emoji = item.type === "group" ? "👥" : getAgentEmoji(item.name);
  return (
    <button
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-200 cursor-pointer",
        "backdrop-blur-sm",
        isSelected
          ? "bg-primary/10 text-accent-foreground shadow-sm"
          : "hover:bg-white/40"
      )}
      onClick={onClick}
      aria-label={`${item.type === "group" ? "Group" : "Agent"}: ${item.displayName}${item.pendingCount > 0 ? `, ${item.pendingCount} pending` : ""}`}
      aria-pressed={isSelected}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 rounded-full"
        />
      ) : (
        <span className="text-xl">{emoji}</span>
      )}
      {item.pendingCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-sidebar" />
      )}
    </button>
  );
}
