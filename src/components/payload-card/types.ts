export type PasteMode = "replace" | "append" | "upsert";
export type OnPasteChoice = (text: string, mode?: PasteMode) => void;

export type ParsedChoice = { id?: string; label?: string } | string;

export type ParsedField =
  | {
      id?: string;
      label?: string;
      kind?: string;
      allow_multiple?: boolean;
      options?: ParsedChoice[];
    }
  | string;

export type ParsedViewModel =
  | { kind: "raw"; raw: string }
  | { kind: "unknown"; pretty: string }
  | { kind: "choice"; allowMultiple: boolean; options: ParsedChoice[] }
  | {
      kind: "confirm";
      variant?: string;
      text: string;
      confirmLabel: string;
      cancelLabel: string;
    }
  | { kind: "form"; fields: ParsedField[] };
