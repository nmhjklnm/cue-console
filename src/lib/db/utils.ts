export function formatLocalIsoWithOffset(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad2 = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const pad3 = (n: number) => String(Math.abs(n)).padStart(3, "0");

  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hours = pad2(d.getHours());
  const minutes = pad2(d.getMinutes());
  const seconds = pad2(d.getSeconds());
  const ms = pad3(d.getMilliseconds());

  const offsetHours = pad2(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad2(Math.abs(offset) % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${sign}${offsetHours}:${offsetMinutes}`;
}

export function nowIso(): string {
  return formatLocalIsoWithOffset(new Date());
}

export function addMsToIso(iso: string, ms: number): string {
  const d = new Date((iso || "").replace(" ", "T"));
  if (!Number.isFinite(d.getTime())) return nowIso();
  const next = new Date(d.getTime() + ms);
  return formatLocalIsoWithOffset(next);
}

export function uniqueNonEmptyStrings(xs: string[]): string[] {
  return Array.from(
    new Set(xs.map((x) => String(x || "").trim()).filter((x) => x.length > 0))
  );
}

export function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(",");
}
