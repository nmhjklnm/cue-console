"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { OnPasteChoice, ParsedViewModel } from "./types";

export function PayloadConfirmView({
  vm,
  disabled,
  onPasteChoice,
  onSubmitConfirm,
}: {
  vm: Extract<ParsedViewModel, { kind: "confirm" }>;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
  onSubmitConfirm?: (text: string, cancelled: boolean) => void | Promise<void>;
}) {
  const hasCancel = Boolean((vm.cancelLabel || "").trim());
  const isPause = (vm.variant || "").trim().toLowerCase() === "pause";

  return (
    <div className="mt-2 rounded-xl border bg-linear-to-b from-background to-muted/20 p-2.5 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[11px]">
          {isPause ? "Pause" : "Confirm"}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {isPause ? "Waiting for your confirmation" : "Click a button to fill the input"}
        </span>
      </div>
      {vm.text && <div className="mb-2 whitespace-pre-wrap leading-normal">{vm.text}</div>}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-9 w-full rounded-xl px-3 text-xs"
          disabled={disabled || (!onPasteChoice && !onSubmitConfirm)}
          onClick={() => {
            if (onSubmitConfirm) {
              void onSubmitConfirm(vm.confirmLabel, false);
              return;
            }
            onPasteChoice?.(vm.confirmLabel);
          }}
          title={`Click to paste: ${vm.confirmLabel}`}
        >
          {vm.confirmLabel}
        </Button>
        {hasCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-xl px-3 text-xs"
            disabled={disabled || (!onPasteChoice && !onSubmitConfirm)}
            onClick={() => {
              if (onSubmitConfirm) {
                void onSubmitConfirm(vm.cancelLabel, true);
                return;
              }
              onPasteChoice?.(vm.cancelLabel);
            }}
            title={`Click to paste: ${vm.cancelLabel}`}
          >
            {vm.cancelLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
