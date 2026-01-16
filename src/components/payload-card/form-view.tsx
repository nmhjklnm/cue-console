"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fieldDisplayName,
  findFieldLine,
  formatChoiceLabel,
  parseMultiValues,
  toggleValue,
} from "./utils";
import type { OnPasteChoice, ParsedViewModel, ParsedChoice } from "./types";

export function PayloadFormView({
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
      const options = Array.isArray(fo.options) ? (fo.options as Array<unknown>) : [];
      const name = (label || id || `Field ${safeActiveIdx + 1}`).trim();
      const fieldKey = name.trim();

      const currentLine = fieldKey ? findFieldLine(selected, fieldKey) : null;
      const currentValues = allowMultiple && currentLine ? parseMultiValues(currentLine, fieldKey) : [];
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
                  const value = formatChoiceLabel(opt as ParsedChoice);
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
                      onClick={() => (allowMultiple ? toggleMulti(value) : selectSingle(value))}
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
              {vm.fields.map((ff, idx) => {
                const name = fieldDisplayName(ff, idx);
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
