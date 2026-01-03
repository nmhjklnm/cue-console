"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PasteMode = "replace" | "append" | "upsert";
type OnPasteChoice = (text: string, mode?: PasteMode) => void;

type ParsedChoice = { id?: string; label?: string } | string;
type ParsedField =
  | {
      id?: string;
      label?: string;
      kind?: string;
      allow_multiple?: boolean;
      options?: ParsedChoice[];
    }
  | string;

type ParsedViewModel =
  | { kind: "raw"; raw: string }
  | { kind: "unknown"; pretty: string }
  | { kind: "choice"; allowMultiple: boolean; options: ParsedChoice[] }
  | { kind: "confirm"; text: string; confirmLabel: string; cancelLabel: string }
  | { kind: "form"; fields: ParsedField[] };

function parsePayload(raw?: string | null): ParsedViewModel | null {
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
          typeof obj.confirm_label === "string" ? obj.confirm_label : "Confirm",
        cancelLabel:
          typeof obj.cancel_label === "string" ? obj.cancel_label : "Cancel",
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
}

function formatChoiceLabel(opt: ParsedChoice): string {
  if (opt && typeof opt === "object") {
    const o = opt as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : "";
    return label.trim();
  }
  return String(opt || "").trim();
}

function fieldDisplayName(f: ParsedField, idx: number): string {
  if (f && typeof f === "object") {
    const fo = f as Record<string, unknown>;
    const id = typeof fo.id === "string" ? fo.id : "";
    const label = typeof fo.label === "string" ? fo.label : "";
    return (label || id || `Field ${idx + 1}`).trim();
  }
  return String(f || `Field ${idx + 1}`).trim();
}

function findFieldLine(selectedLines: Set<string>, fieldKey: string): string | null {
  const needle = `${fieldKey}:`;
  for (const line of selectedLines) {
    const t = (line || "").trim();
    if (t.startsWith(needle)) return t;
  }
  return null;
}

function parseMultiValues(line: string, fieldKey: string): string[] {
  const needle = `${fieldKey}:`;
  const idx = line.indexOf(needle);
  if (idx < 0) return [];
  const rest = line.slice(idx + needle.length).trim();
  if (!rest) return [];
  return rest
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toggleValue(values: string[], v: string): string[] {
  const next = new Set(values);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return Array.from(next);
}

function PayloadChoiceView({
  vm,
  disabled,
  onPasteChoice,
  selectedLines,
}: {
  vm: Extract<ParsedViewModel, { kind: "choice" }>;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
  selectedLines?: Set<string>;
}) {
  const selected = selectedLines ?? new Set<string>();
  return (
    <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[11px]">
            Choice
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            {vm.allowMultiple ? "多选" : "单选"}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {vm.allowMultiple
            ? "点击选项追加到输入框（可多次选择）"
            : "点击选项填入输入框（单选替换）"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {vm.options.length > 0 ? (
          vm.options.map((opt, idx) => {
            const label = formatChoiceLabel(opt);
            const text = label || "<empty>";
            const cleaned = label.trim();
            const isSelected = vm.allowMultiple && !!cleaned && selected.has(cleaned);
            return (
              <Button
                key={`opt-${idx}`}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                size="sm"
                className={cn(
                  "h-auto min-h-9 justify-start gap-2 px-3 py-2 text-left text-xs",
                  "rounded-xl",
                  isSelected && "cursor-not-allowed opacity-80"
                )}
                disabled={disabled || !onPasteChoice || !label || isSelected}
                onClick={() =>
                  onPasteChoice?.(label, vm.allowMultiple ? "append" : "replace")
                }
                title={label ? `Click to paste: ${label}` : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{text}</span>
              </Button>
            );
          })
        ) : (
          <div className="text-muted-foreground">No options</div>
        )}
      </div>
    </div>
  );
}

function PayloadConfirmView({
  vm,
  disabled,
  onPasteChoice,
}: {
  vm: Extract<ParsedViewModel, { kind: "confirm" }>;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
}) {
  return (
    <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[11px]">
          Confirm
        </Badge>
        <span className="text-[11px] text-muted-foreground">Click a button to fill the input</span>
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
          title={`Click to paste: ${vm.confirmLabel}`}
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
          title={`Click to paste: ${vm.cancelLabel}`}
        >
          {vm.cancelLabel}
        </Button>
      </div>
    </div>
  );
}

function PayloadFormView({
  vm,
  disabled,
  onPasteChoice,
  selectedLines,
}: {
  vm: Extract<ParsedViewModel, { kind: "form" }>;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
  selectedLines?: Set<string>;
}) {
  const [activeFieldIdx, setActiveFieldIdx] = useState(0);

  const clampFieldIdx = (idx: number) => {
    const max = Math.max(0, vm.fields.length - 1);
    return Math.min(Math.max(0, idx), max);
  };

  const safeActiveIdx = clampFieldIdx(activeFieldIdx);
  const selected = selectedLines ?? new Set<string>();

  const advance = () => setActiveFieldIdx((prev) => clampFieldIdx(prev + 1));

  const renderPanel = () => {
    const f = vm.fields[safeActiveIdx];
    if (f && typeof f === "object") {
      const fo = f as Record<string, unknown>;
      const id = typeof fo.id === "string" ? fo.id : "";
      const label = typeof fo.label === "string" ? fo.label : "";
      const kind = typeof fo.kind === "string" ? fo.kind : "";
      const allowMultiple = Boolean(fo.allow_multiple);
      const options = Array.isArray(fo.options) ? (fo.options as ParsedChoice[]) : [];
      const name = (label || id || `Field ${safeActiveIdx + 1}`).trim();
      const fieldKey = name.trim();

      const currentLine = fieldKey ? findFieldLine(selected, fieldKey) : null;
      const currentValues =
        allowMultiple && currentLine ? parseMultiValues(currentLine, fieldKey) : [];
      const currentSet = new Set(currentValues);

      const selectSingle = (value: string) => {
        const v = (value || "").trim();
        if (!v) return;
        onPasteChoice?.(`${fieldKey}: ${v}`, "upsert");
        advance();
      };

      const toggleMulti = (value: string) => {
        const v = (value || "").trim();
        if (!v) return;
        const next = toggleValue(currentValues, v).sort();
        const line = next.length > 0 ? `${fieldKey}: ${next.join(", ")}` : `${fieldKey}:`;
        onPasteChoice?.(line, "upsert");
      };

      const upsertOther = () => {
        if (!fieldKey) return;
        onPasteChoice?.(`${fieldKey}:`, "upsert");
      };

      return (
        <div
          key={`panel-${safeActiveIdx}`}
          className={cn(
            "w-full rounded-xl border bg-background/60 px-3 py-2 text-left",
            "hover:bg-background/80 hover:shadow-sm transition",
            "disabled:opacity-60"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px]" title={name}>
              {name}
            </span>
            {kind && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {kind}
              </span>
            )}
            {allowMultiple && (
              <span className="shrink-0 text-[11px] text-muted-foreground">Multiple allowed</span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2">
            {options.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {options.map((opt, oidx) => {
                  const value = formatChoiceLabel(opt);
                  const title = value ? `Click to select: ${fieldKey}: ${value}` : undefined;
                  const isSelected = allowMultiple && !!value && currentSet.has(value);
                  return (
                    <Button
                      key={`field-${safeActiveIdx}-opt-${oidx}`}
                      type="button"
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      className="h-auto min-h-9 justify-start rounded-xl px-3 py-2 text-left text-xs"
                      disabled={disabled || !onPasteChoice || !fieldKey || !value}
                      onClick={() =>
                        allowMultiple ? toggleMulti(value) : selectSingle(value)
                      }
                      title={title}
                    >
                      {value || "<empty>"}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="text-muted-foreground">No options</div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 flex-1 justify-start rounded-xl px-3 text-left text-xs"
                disabled={disabled || !onPasteChoice || !fieldKey}
                onClick={upsertOther}
                title={fieldKey ? `Click to enter custom value: ${fieldKey}:` : undefined}
              >
                Other
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl px-3 text-xs"
                disabled={disabled || safeActiveIdx >= vm.fields.length - 1}
                onClick={() => setActiveFieldIdx((prev) => clampFieldIdx(prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      );
    }

    const asText = String(f || "").trim();
    const fieldKey = asText || `Field ${safeActiveIdx + 1}`;
    return (
      <div
        key={`panel-${safeActiveIdx}`}
        className="w-full rounded-xl border bg-background/60 px-3 py-2 text-left text-[13px]"
      >
        <div className="mb-2 truncate" title={fieldKey}>
          {fieldKey}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 justify-start rounded-xl px-3 text-left text-xs"
          disabled={disabled || !onPasteChoice || !fieldKey}
          onClick={() => onPasteChoice?.(`${fieldKey}:`, "upsert")}
        >
          Other
        </Button>
      </div>
    );
  };

  return (
    <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[11px]">
          Form
        </Badge>
        <span className="text-[11px] text-muted-foreground">Fill by field (click to insert)</span>
      </div>
      <div className="space-y-2">
        {vm.fields.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-background/60 p-1">
              {vm.fields.map((f, idx) => {
                const name = fieldDisplayName(f, idx);
                const active = idx === safeActiveIdx;
                return (
                  <Button
                    key={`tab-${idx}`}
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 shrink-0 rounded-lg px-2 text-xs",
                      "max-w-55",
                      active && "cursor-default"
                    )}
                    disabled={disabled || active}
                    onClick={() => setActiveFieldIdx(idx)}
                    title={name}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {idx + 1}. {name}
                    </span>
                  </Button>
                );
              })}
            </div>

            {renderPanel()}
          </div>
        ) : (
          <div className="text-muted-foreground">No fields</div>
        )}
      </div>
    </div>
  );
}

export function PayloadCard({
  raw,
  disabled,
  onPasteChoice,
  selectedLines,
}: {
  raw?: string | null;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
  selectedLines?: Set<string>;
}) {
  const vm = useMemo<ParsedViewModel | null>(() => parsePayload(raw), [raw]);

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
    return (
      <PayloadChoiceView
        vm={vm}
        disabled={disabled}
        onPasteChoice={onPasteChoice}
        selectedLines={selectedLines}
      />
    );
  }

  if (vm.kind === "confirm") {
    return <PayloadConfirmView vm={vm} disabled={disabled} onPasteChoice={onPasteChoice} />;
  }

  return (
    <PayloadFormView
      vm={vm}
      disabled={disabled}
      onPasteChoice={onPasteChoice}
      selectedLines={selectedLines}
    />
  );
}
