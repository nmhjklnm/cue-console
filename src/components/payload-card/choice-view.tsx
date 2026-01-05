"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { OnPasteChoice, ParsedViewModel } from "./types";
import { formatChoiceLabel } from "./utils";

export function PayloadChoiceView({
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
                onClick={() => onPasteChoice?.(label, vm.allowMultiple ? "append" : "replace")}
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
