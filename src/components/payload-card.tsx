"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PayloadCard({
  raw,
  disabled,
  onPasteChoice,
  selectedLines,
}: {
  raw?: string | null;
  disabled?: boolean;
  onPasteChoice?: (text: string, mode?: "replace" | "append") => void;
  selectedLines?: Set<string>;
}) {
  type ParsedChoice = { id?: string; label?: string } | string;
  type ParsedField = { id?: string; label?: string; kind?: string } | string;
  type ParsedViewModel =
    | { kind: "raw"; raw: string }
    | { kind: "unknown"; pretty: string }
    | { kind: "choice"; allowMultiple: boolean; options: ParsedChoice[] }
    | { kind: "confirm"; text: string; confirmLabel: string; cancelLabel: string }
    | { kind: "form"; fields: ParsedField[] };

  const vm = useMemo<ParsedViewModel | null>(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return { kind: "raw", raw: String(raw) };
      }

      const obj = parsed as Record<string, unknown>;
      const type = typeof obj.type === "string" ? obj.type : "unknown";

      if (type === "choice") {
        return {
          kind: "choice",
          allowMultiple: Boolean(obj.allow_multiple),
          options: Array.isArray(obj.options) ? (obj.options as ParsedChoice[]) : [],
        };
      }

      if (type === "confirm") {
        return {
          kind: "confirm",
          text: typeof obj.text === "string" ? obj.text : "",
          confirmLabel:
            typeof obj.confirm_label === "string" ? obj.confirm_label : "确认",
          cancelLabel:
            typeof obj.cancel_label === "string" ? obj.cancel_label : "取消",
        };
      }

      if (type === "form") {
        return {
          kind: "form",
          fields: Array.isArray(obj.fields) ? (obj.fields as ParsedField[]) : [],
        };
      }

      return { kind: "unknown", pretty: JSON.stringify(parsed, null, 2) };
    } catch {
      return { kind: "raw", raw };
    }
  }, [raw]);

  if (!vm) return null;

  if (vm.kind === "raw") {
    return (
      <pre className="mt-2 max-w-full overflow-auto rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        {vm.raw}
      </pre>
    );
  }

  if (vm.kind === "unknown") {
    return (
      <pre className="mt-2 max-w-full overflow-auto rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        {vm.pretty}
      </pre>
    );
  }

  if (vm.kind === "choice") {
    const selected = selectedLines ?? new Set<string>();
    return (
      <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[11px]">
              选择
            </Badge>
            {vm.allowMultiple && (
              <span className="text-[11px] text-muted-foreground">可多选</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">点击按钮填入输入框</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {vm.options.length > 0 ? (
            vm.options.map((opt, idx) => {
              if (opt && typeof opt === "object") {
                const o = opt as Record<string, unknown>;
                const id = typeof o.id === "string" ? o.id : "";
                const label = typeof o.label === "string" ? o.label : "";
                const text = id && label ? `${id}：${label}` : id || label || "<empty>";
                const pasteText = id || label || "";
                const cleaned = pasteText.trim();
                const isSelected = vm.allowMultiple && !!cleaned && selected.has(cleaned);

                return (
                  <Button
                    key={`${id || "opt"}-${idx}`}
                    type="button"
                    variant={isSelected ? "secondary" : "outline"}
                    size="sm"
                    className={cn(
                      "h-auto min-h-9 justify-start gap-2 px-3 py-2 text-left text-xs",
                      "rounded-xl",
                      isSelected && "cursor-not-allowed opacity-80"
                    )}
                    disabled={disabled || !onPasteChoice || !pasteText || isSelected}
                    onClick={() =>
                      onPasteChoice?.(pasteText, vm.allowMultiple ? "append" : "replace")
                    }
                    title={pasteText ? `点击粘贴：${pasteText}` : undefined}
                  >
                    {id && (
                      <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
                        {id}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{id && label ? label : text}</span>
                  </Button>
                );
              }

              const asText = String(opt);
              return (
                <Button
                  key={`opt-${idx}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 justify-start rounded-xl px-3 py-2 text-left text-xs"
                  disabled={disabled || !onPasteChoice}
                  onClick={() =>
                    onPasteChoice?.(asText, vm.allowMultiple ? "append" : "replace")
                  }
                  title={`点击粘贴：${asText}`}
                >
                  {asText}
                </Button>
              );
            })
          ) : (
            <div className="text-muted-foreground">无选项</div>
          )}
        </div>
      </div>
    );
  }

  if (vm.kind === "confirm") {
    return (
      <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-[11px]">
            确认
          </Badge>
          <span className="text-[11px] text-muted-foreground">点击按钮填入输入框</span>
        </div>
        {vm.text && <div className="mb-2 whitespace-pre-wrap leading-normal">{vm.text}</div>}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-9 w-full rounded-xl px-3 text-xs"
            disabled={disabled || !onPasteChoice}
            onClick={() => onPasteChoice?.(vm.confirmLabel)}
            title={`点击粘贴：${vm.confirmLabel}`}
          >
            {vm.confirmLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-xl px-3 text-xs"
            disabled={disabled || !onPasteChoice}
            onClick={() => onPasteChoice?.(vm.cancelLabel)}
            title={`点击粘贴：${vm.cancelLabel}`}
          >
            {vm.cancelLabel}
          </Button>
        </div>
      </div>
    );
  }

  // vm.kind === "form"
  return (
    <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[11px]">
          表单
        </Badge>
        <span className="text-[11px] text-muted-foreground">按字段填写（点击可插入）</span>
      </div>
      <div className="space-y-2">
        {vm.fields.length > 0 ? (
          vm.fields.map((f, idx) => {
            if (f && typeof f === "object") {
              const fo = f as Record<string, unknown>;
              const id = typeof fo.id === "string" ? fo.id : "";
              const label = typeof fo.label === "string" ? fo.label : "";
              const kind = typeof fo.kind === "string" ? fo.kind : "";
              const name = label || id || "字段";
              const pasteText = id || label || "";

              return (
                <button
                  key={`${id || "field"}-${idx}`}
                  type="button"
                  className={cn(
                    "w-full rounded-xl border bg-background/60 px-3 py-2 text-left",
                    "hover:bg-background/80 hover:shadow-sm transition",
                    "disabled:opacity-60"
                  )}
                  disabled={disabled || !onPasteChoice || !pasteText}
                  onClick={() => onPasteChoice?.(pasteText)}
                  title={pasteText ? `点击粘贴：${pasteText}` : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>
                    {kind && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {kind}
                      </span>
                    )}
                  </div>
                  {id && label && (
                    <div className="mt-1 text-[11px] text-muted-foreground">{id}</div>
                  )}
                </button>
              );
            }

            const asText = String(f);
            return (
              <button
                key={`field-${idx}`}
                type="button"
                className="w-full rounded-xl border bg-background/60 px-3 py-2 text-left text-[13px] hover:bg-background/80 hover:shadow-sm transition disabled:opacity-60"
                disabled={disabled || !onPasteChoice}
                onClick={() => onPasteChoice?.(asText)}
                title={`点击粘贴：${asText}`}
              >
                {asText}
              </button>
            );
          })
        ) : (
          <div className="text-muted-foreground">无字段</div>
        )}
      </div>
    </div>
  );
}
