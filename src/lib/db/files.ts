import crypto from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getDb } from "./connection";
import type { CueFile } from "./types";
import { formatLocalIsoWithOffset } from "./utils";

function filesRootDir(): string {
  return join(homedir(), ".cue", "files");
}

function absPathFromFileRef(file: string): string {
  const clean = String(file || "").replace(/^\//, "");
  return join(homedir(), ".cue", clean);
}

function extFromMime(mime: string): string {
  const m = (mime || "").toLowerCase().trim();
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "bin";
}

function decodeBase64(base64: string): Buffer {
  return Buffer.from(String(base64 || ""), "base64");
}

function pickUniqueFileRelByShaHex(sha256Hex: string, ext: string): string {
  const database = getDb();
  const full = String(sha256Hex || "").toLowerCase();
  const cleanExt = String(ext || "bin").toLowerCase();

  const tryLens = [24, 28, 32, 40, 48, 56, 64];
  for (const n of tryLens) {
    const prefix = full.slice(0, n);
    const rel = join("files", `${prefix}.${cleanExt}`);

    const row = database
      .prepare(`SELECT sha256 FROM cue_files WHERE file = ? LIMIT 1`)
      .get(rel) as { sha256: string } | undefined;
    if (!row) return rel;
    if (String(row.sha256 || "").toLowerCase() === full) return rel;
  }

  return join("files", `${full}.${cleanExt}`);
}

export function upsertFileFromBase64(mimeType: string, base64: string): CueFile {
  const database = getDb();
  const buf = decodeBase64(base64);
  if (!buf || buf.length === 0) throw new Error("empty base64");
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const ext = extFromMime(mimeType);
  const rel = pickUniqueFileRelByShaHex(sha256, ext);
  const abs = absPathFromFileRef(rel);
  mkdirSync(filesRootDir(), { recursive: true });
  if (!existsSync(abs)) {
    mkdirSync(join(homedir(), ".cue", "files"), { recursive: true });
    writeFileSync(abs, buf);
  }

  const createdAt = formatLocalIsoWithOffset(new Date());
  database
    .prepare(
      `INSERT INTO cue_files (sha256, file, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sha256) DO UPDATE SET
         file = excluded.file,
         mime_type = excluded.mime_type,
         size_bytes = excluded.size_bytes`
    )
    .run(sha256, rel, mimeType || "application/octet-stream", buf.length, createdAt);

  const row = database
    .prepare(`SELECT id, sha256, file, mime_type, size_bytes, created_at FROM cue_files WHERE sha256 = ?`)
    .get(sha256) as Omit<CueFile, "inline_base64"> | undefined;
  if (!row) throw new Error("failed to upsert cue_files");
  return { ...row };
}

export function getFilesByResponseIds(responseIds: number[]): Record<number, CueFile[]> {
  const ids = Array.from(new Set(responseIds.filter((x) => Number.isFinite(x) && x > 0)));
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT rf.response_id as response_id,
              f.id as id,
              f.sha256 as sha256,
              f.file as file,
              f.mime_type as mime_type,
              f.size_bytes as size_bytes,
              f.created_at as created_at,
              rf.idx as idx
       FROM cue_response_files rf
       JOIN cue_files f ON f.id = rf.file_id
       WHERE rf.response_id IN (${placeholders})
       ORDER BY rf.response_id ASC, rf.idx ASC`
    )
    .all(...ids) as Array<
    CueFile & { response_id: number; idx: number }
  >;

  const map: Record<number, CueFile[]> = {};
  for (const r of rows) {
    const rid = Number(r.response_id);
    const f: CueFile = {
      id: Number(r.id),
      sha256: String(r.sha256),
      file: String(r.file),
      mime_type: String(r.mime_type),
      size_bytes: Number(r.size_bytes),
      created_at: String(r.created_at),
    };
    if (f.mime_type.startsWith("image/")) {
      try {
        const abs = absPathFromFileRef(f.file);
        const buf = readFileSync(abs);
        f.inline_base64 = buf.toString("base64");
      } catch {
        // ignore
      }
    }
    (map[rid] ||= []).push(f);
  }
  return map;
}

export function countFilesForResponseId(responseId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as n FROM cue_response_files WHERE response_id = ?`)
    .get(responseId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export function countFilesForResponseIds(responseIds: number[]): Record<number, number> {
  const ids = Array.from(new Set(responseIds.filter((x) => Number.isFinite(x) && x > 0)));
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT response_id, COUNT(*) as n
       FROM cue_response_files
       WHERE response_id IN (${placeholders})
       GROUP BY response_id`
    )
    .all(...ids) as Array<{ response_id: number; n: number }>;

  const out: Record<number, number> = {};
  for (const r of rows) out[Number(r.response_id)] = Number(r.n);
  return out;
}
