"use client";

import { useMemo } from "react";

import type { OnPasteChoice } from "./payload-card/types";
import { PayloadChoiceView } from "./payload-card/choice-view";
import { PayloadConfirmView } from "./payload-card/confirm-view";
import { PayloadFormView } from "./payload-card/form-view";
import type { ParsedViewModel } from "./payload-card/types";
import { parsePayload } from "./payload-card/utils";

export function PayloadCard({
  raw,
  disabled,
  onPasteChoice,
  onSubmitConfirm,
  selectedLines,
}: {
  raw?: string | null;
  disabled?: boolean;
  onPasteChoice?: OnPasteChoice;
  onSubmitConfirm?: (text: string, cancelled: boolean) => void | Promise<void>;
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
    return (
      <PayloadConfirmView
        vm={vm}
        disabled={disabled}
        onPasteChoice={onPasteChoice}
        onSubmitConfirm={onSubmitConfirm}
      />
    );
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
