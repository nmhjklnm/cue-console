import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setUserConfig } from "@/lib/actions";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  conversationModeDefault: "chat" | "agent";
  setConversationModeDefault: (mode: "chat" | "agent") => void;
  chatModeAppendText: string;
  setChatModeAppendText: (text: string) => void;
  pendingRequestTimeoutMs: string;
  setPendingRequestTimeoutMs: (ms: string) => void;
  botModeReplyText: string;
  setBotModeReplyText: (text: string) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  soundEnabled,
  setSoundEnabled,
  conversationModeDefault,
  setConversationModeDefault,
  chatModeAppendText,
  setChatModeAppendText,
  pendingRequestTimeoutMs,
  setPendingRequestTimeoutMs,
  botModeReplyText,
  setBotModeReplyText,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Sound notification</div>
            <div className="text-xs text-muted-foreground truncate">
              Ding on new non-pause messages
            </div>
          </div>
          <Button
            type="button"
            variant={soundEnabled ? "default" : "outline"}
            onClick={async () => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              try {
                await setUserConfig({ sound_enabled: next });
              } catch {
              }
              window.dispatchEvent(
                new CustomEvent("cue-console:configUpdated", {
                  detail: { sound_enabled: next },
                })
              );
            }}
          >
            {soundEnabled ? "On" : "Off"}
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Default conversation mode</div>
            <div className="text-xs text-muted-foreground truncate">
              Used when opening cue-console (unless a last-used mode exists)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={conversationModeDefault === "chat" ? "default" : "outline"}
              onClick={async () => {
                const next = "chat" as const;
                setConversationModeDefault(next);
                try {
                  await setUserConfig({ conversation_mode_default: next });
                } catch {
                }
                try {
                  window.localStorage.setItem("cue-console:conversationModeDefault", next);
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { conversation_mode_default: next },
                  })
                );
              }}
            >
              Chat
            </Button>
            <Button
              type="button"
              variant={conversationModeDefault === "agent" ? "default" : "outline"}
              onClick={async () => {
                const next = "agent" as const;
                setConversationModeDefault(next);
                try {
                  await setUserConfig({ conversation_mode_default: next });
                } catch {
                }
                try {
                  window.localStorage.setItem("cue-console:conversationModeDefault", next);
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { conversation_mode_default: next },
                  })
                );
              }}
            >
              Agent
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium">Chat mode append text</div>
          <div className="text-xs text-muted-foreground">
            Appended to every message in Chat mode (single line)
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Input
              value={chatModeAppendText}
              onChange={(e) => setChatModeAppendText(e.target.value)}
              placeholder="Append text"
              className="h-9 flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-md px-3 text-xs"
              onClick={async () => {
                const next = chatModeAppendText;
                try {
                  await setUserConfig({ chat_mode_append_text: next });
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { chat_mode_append_text: next },
                  })
                );
              }}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium">Pending request timeout (ms)</div>
          <div className="text-xs text-muted-foreground">
            Filter out pending requests older than this duration
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Input
              value={pendingRequestTimeoutMs}
              onChange={(e) => setPendingRequestTimeoutMs(e.target.value)}
              placeholder="600000"
              inputMode="numeric"
              className="h-9 flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-md px-3 text-xs"
              onClick={async () => {
                const raw = pendingRequestTimeoutMs.trim();
                const parsed = Number(raw);
                const next = Number.isFinite(parsed) ? parsed : 600000;
                try {
                  await setUserConfig({ pending_request_timeout_ms: next });
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { pending_request_timeout_ms: next },
                  })
                );
                setPendingRequestTimeoutMs(String(next));
              }}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium">Bot reply text</div>
          <div className="text-xs text-muted-foreground">
            Multi-line
          </div>
          <div className="mt-2 flex items-start justify-end gap-2">
            <textarea
              value={botModeReplyText}
              onChange={(e) => setBotModeReplyText(e.target.value)}
              placeholder="Bot reply"
              className="min-h-24 flex-1 min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-md px-3 text-xs"
              onClick={async () => {
                const next = botModeReplyText;
                try {
                  await setUserConfig({ bot_mode_reply_text: next });
                } catch {
                }
                window.dispatchEvent(
                  new CustomEvent("cue-console:configUpdated", {
                    detail: { bot_mode_reply_text: next },
                  })
                );
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
