import type { ParsedChoice, ParsedField, ParsedViewModel } from "./types";

export function parsePayload(raw?: string | null): ParsedViewModel | null {
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
        variant: typeof obj.variant === "string" ? obj.variant : undefined,
        text: typeof obj.text === "string" ? obj.text : "",
        confirmLabel: typeof obj.confirm_label === "string" ? obj.confirm_label : "Confirm",
        cancelLabel: typeof obj.cancel_label === "string" ? obj.cancel_label : "Cancel",
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

export function formatChoiceLabel(opt: ParsedChoice): string {
  if (opt && typeof opt === "object") {
    const o = opt as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : "";
    return label.trim();
  }
  return String(opt || "").trim();
}

export function fieldDisplayName(f: ParsedField, idx: number): string {
  if (f && typeof f === "object") {
    const fo = f as Record<string, unknown>;
    const id = typeof fo.id === "string" ? fo.id : "";
    const label = typeof fo.label === "string" ? fo.label : "";
    return (label || id || `Field ${idx + 1}`).trim();
  }
  return String(f || `Field ${idx + 1}`).trim();
}

export function findFieldLine(selectedLines: Set<string>, fieldKey: string): string | null {
  const needle = `${fieldKey}:`;
  for (const line of selectedLines) {
    const t = (line || "").trim();
    if (t.startsWith(needle)) return t;
  }
  return null;
}

export function parseMultiValues(line: string, fieldKey: string): string[] {
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

export function toggleValue(values: string[], v: string): string[] {
  const next = new Set(values);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return Array.from(next);
}
