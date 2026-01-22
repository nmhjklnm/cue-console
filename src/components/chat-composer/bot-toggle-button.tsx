import { cn } from "@/lib/utils";

interface BotToggleButtonProps {
  botEnabled: boolean;
  botLoaded: boolean;
  botLoadError: string | null;
  botToggling: boolean;
  busy: boolean;
  onClick: () => void;
}

export function BotToggleButton({
  botEnabled,
  botLoaded,
  botLoadError,
  botToggling,
  busy,
  onClick,
}: BotToggleButtonProps) {
  return (
    <button
      type="button"
      disabled={busy || botToggling || !botLoaded}
      className={cn(
        "relative h-8 px-3 rounded-xl transition-all duration-200",
        "flex items-center gap-1.5",
        "disabled:cursor-not-allowed disabled:opacity-50",
        botEnabled
          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
          : botLoadError
            ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 ring-1 ring-red-500/30"
            : "bg-white/10 hover:bg-white/20 text-muted-foreground"
      )}
      onClick={onClick}
      aria-label={botEnabled ? "Stop bot" : "Start bot"}
      title={
        !botLoaded
          ? "Bot status loading…"
          : botToggling
            ? "Turning…"
            : botLoadError
              ? "Bot state sync error"
              : botEnabled
                ? "Bot is active - click to stop"
                : "Start bot mode"
      }
    >
      <svg
        className={cn(
          "w-4 h-4 transition-transform duration-200",
          botEnabled && "scale-110"
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="8" width="12" height="10" rx="2" />
        <path d="M12 8V5" />
        <circle cx="12" cy="4" r="1" fill="currentColor" />
        <circle cx="9.5" cy="12" r="1" fill="currentColor" />
        <circle cx="14.5" cy="12" r="1" fill="currentColor" />
        <path d="M9 15h6" />
        <path d="M6 13H4" />
        <path d="M20 13h-2" />
      </svg>
      
      <span className="text-xs font-medium">
        {botToggling ? "..." : botEnabled ? "ON" : "Bot"}
      </span>
      
      {!botLoaded && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {botLoadError && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      )}
    </button>
  );
}
