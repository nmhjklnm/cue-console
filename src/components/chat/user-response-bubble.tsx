import { useMemo, type ReactNode } from "react";
import { cn, formatFullTime } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { CueResponse } from "@/lib/actions";
import { useConfig } from "@/contexts/config-context";
import Image from "next/image";

interface UserResponseBubbleProps {
  response: CueResponse;
  showAvatar?: boolean;
  compact?: boolean;
  onPreview?: (img: { mime_type: string; base64_data: string }) => void;
}

export function UserResponseBubble({
  response,
  showAvatar = true,
  compact = false,
  onPreview,
}: UserResponseBubbleProps) {
  const { config } = useConfig();
  const parsed = JSON.parse(response.response_json || "{}") as {
    text?: string;
    mentions?: { userId: string; start: number; length: number; display: string }[];
  };

  const analysisOnlyInstruction = config.chat_mode_append_text;
  const { analysisOnlyApplied, displayText } = useMemo(() => {
    const text = parsed.text;
    if (typeof text !== "string") return { analysisOnlyApplied: false, displayText: text };

    const raw = text;
    const lines = raw.split(/\r?\n/);
    let lastNonEmpty = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]?.trim().length) {
        lastNonEmpty = i;
        break;
      }
    }
    if (lastNonEmpty === -1) return { analysisOnlyApplied: false, displayText: raw };

    const tail = (lines[lastNonEmpty] ?? "").trim();
    if (tail !== analysisOnlyInstruction) {
      return { analysisOnlyApplied: false, displayText: raw };
    }

    let cut = lastNonEmpty;
    if (cut > 0 && (lines[cut - 1] ?? "").trim().length === 0) {
      cut -= 1;
    }
    const stripped = lines.slice(0, cut).join("\n").replace(/\s+$/, "");
    if (stripped.trim().length === 0) {
      return { analysisOnlyApplied: false, displayText: raw };
    }

    return { analysisOnlyApplied: true, displayText: stripped };
  }, [parsed.text, analysisOnlyInstruction]);

  const filesRaw = (response as unknown as { files?: unknown }).files;
  const files = Array.isArray(filesRaw) ? filesRaw : [];
  const imageFiles = files.filter((f) => {
    const obj = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
    const mime = String(obj?.mime_type || "");
    const b64 = obj?.inline_base64;
    return mime.startsWith("image/") && typeof b64 === "string" && b64.length > 0;
  });
  const otherFiles = files.filter((f) => {
    const obj = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
    const mime = String(obj?.mime_type || "");
    return !mime.startsWith("image/");
  });

  const renderTextWithMentions = (
    text: string,
    mentions?: { start: number; length: number }[]
  ) => {
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
          className="rounded-3xl p-3 sm:p-4 w-full sm:max-w-215 sm:w-fit glass-surface-soft glass-noise ring-1 ring-white/25"
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
        className="rounded-3xl p-3 sm:p-4 w-full sm:max-w-215 sm:w-fit glass-surface-soft glass-noise ring-1 ring-white/25"
        style={{
          clipPath: "inset(0 round 1rem)",
          maxWidth: showAvatar ? "calc(100% - 3rem)" : "100%",
        }}
      >
        {displayText && (
          <div className="text-sm overflow-wrap-anywhere">
            {parsed.mentions && parsed.mentions.length > 0 ? (
              <p className="whitespace-pre-wrap">
                {renderTextWithMentions(displayText, parsed.mentions)}
              </p>
            ) : (
              <MarkdownRenderer>{displayText}</MarkdownRenderer>
            )}
          </div>
        )}
        {imageFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 max-w-full">
            {imageFiles.map((f, i) => {
              const obj = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
              const mime = String(obj?.mime_type || "image/png");
              const b64 = String(obj?.inline_base64 || "");
              const img = { mime_type: mime, base64_data: b64 };
              return (
                <Image
                  key={i}
                  src={`data:${img.mime_type};base64,${img.base64_data}`}
                  alt=""
                  width={512}
                  height={256}
                  unoptimized
                  className="max-h-32 max-w-full h-auto w-auto rounded cursor-pointer"
                  onClick={() => onPreview?.(img)}
                />
              );
            })}
          </div>
        )}

        {otherFiles.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 max-w-full">
            {otherFiles.map((f, i) => {
              const obj = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
              const fileRef = String(obj?.file || "");
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
        <div className="mt-1 flex items-center justify-end gap-2 text-xs opacity-70">
          {analysisOnlyApplied && (
            <span
              className="rounded-full bg-white/40 dark:bg-black/20 px-2 py-0.5 ring-1 ring-border/40"
              title="Chat 模式：只做分析，不做改动（该规则会发送给模型，但不会显示在消息正文里）"
            >
              Chat
            </span>
          )}
          <span>{formatFullTime(response.created_at)}</span>
        </div>
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
}
