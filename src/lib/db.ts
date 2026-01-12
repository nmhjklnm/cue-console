import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import crypto from "crypto";
import { homedir } from "os";
import { join } from "path";
import type { UserResponse, Group } from "./types";

const DB_PATH = join(homedir(), ".cue", "cue.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(join(homedir(), ".cue"), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initTables();
  }

  return db;
}

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

function upsertFileFromBase64(mimeType: string, base64: string): CueFile {
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

function getFilesByResponseIds(responseIds: number[]): Record<number, CueFile[]> {
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

function countFilesForResponseId(responseId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as n FROM cue_response_files WHERE response_id = ?`)
    .get(responseId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function initTables() {
  const database = db!;

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      agent_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE,
      agent_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE,
      response_json TEXT NOT NULL,
      cancelled INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (request_id) REFERENCES cue_requests(request_id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sha256 TEXT UNIQUE NOT NULL,
      file TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_response_files (
      response_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      PRIMARY KEY (response_id, idx)
    )
  `);

  // Mode B: guide migrate and exit if an old DB exists.
  const versionRow = database
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get("schema_version") as { value?: string } | undefined;
  const version = String(versionRow?.value ?? "");
  if (version !== "2") {
    const reqCountRow = database.prepare(`SELECT COUNT(*) as n FROM cue_requests`).get() as { n: number };
    const respCountRow = database.prepare(`SELECT COUNT(*) as n FROM cue_responses`).get() as { n: number };
    const reqCount = Number(reqCountRow?.n ?? 0);
    const respCount = Number(respCountRow?.n ?? 0);
    if (reqCount === 0 && respCount === 0) {
      database
        .prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`)
        .run("schema_version", "2");
    } else {
      throw new Error(
        "Database schema is outdated (pre-file storage). Please migrate: cueme migrate\n" +
          "数据库结构已过期（旧的 base64 存储）。请先执行：cueme migrate"
      );
    }
  }

  // Groups table
  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Group members table
  database.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, agent_name),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS conversation_meta (
      key TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at DATETIME,
      deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at DATETIME
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_leases (
      lease_key TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_message_queue (
      id TEXT PRIMARY KEY,
      conv_type TEXT NOT NULL,
      conv_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      message_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at DATETIME NOT NULL,
      locked_by TEXT,
      locked_at DATETIME,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cue_message_queue_conv
    ON cue_message_queue (conv_type, conv_id, position)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cue_message_queue_due
    ON cue_message_queue (status, next_run_at)
  `);
}

function nowIso(): string {
  return formatLocalIsoWithOffset(new Date());
}

function addMsToIso(iso: string, ms: number): string {
  const d = new Date((iso || "").replace(" ", "T"));
  if (!Number.isFinite(d.getTime())) return nowIso();
  const next = new Date(d.getTime() + ms);
  return formatLocalIsoWithOffset(next);
}

export function acquireWorkerLease(args: {
  leaseKey: string;
  holderId: string;
  ttlMs: number;
}): { acquired: boolean; holderId: string; expiresAt: string } {
  const database = getDb();
  const leaseKey = String(args.leaseKey || "").trim();
  const holderId = String(args.holderId || "").trim();
  const ttlMs = Math.max(1000, Math.min(120_000, Math.floor(args.ttlMs || 0)));
  if (!leaseKey) throw new Error("leaseKey required");
  if (!holderId) throw new Error("holderId required");

  const now = nowIso();
  const expiresAt = addMsToIso(now, ttlMs);

  const tx = database.transaction(() => {
    const row = database
      .prepare(`SELECT holder_id, expires_at FROM worker_leases WHERE lease_key = ?`)
      .get(leaseKey) as { holder_id: string; expires_at: string } | undefined;

    const expired = !row
      ? true
      : new Date(String(row.expires_at || "").replace(" ", "T")).getTime() <= Date.now();

    if (row && !expired && String(row.holder_id) !== holderId) {
      return { acquired: false, holderId: String(row.holder_id), expiresAt: String(row.expires_at) };
    }

    database
      .prepare(
        `INSERT INTO worker_leases (lease_key, holder_id, expires_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(lease_key) DO UPDATE SET
           holder_id = excluded.holder_id,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      )
      .run(leaseKey, holderId, expiresAt, now);

    return { acquired: true, holderId, expiresAt };
  });

  return tx();
}

export type ConversationType = "agent" | "group";

export interface CueQueuedMessage {
  id: string;
  conv_type: ConversationType;
  conv_id: string;
  position: number;
  message_json: string;
  status: "queued" | "processing";
  attempts: number;
  next_run_at: string;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

function queueLockExpired(lockedAtIso: string | null, ttlMs: number): boolean {
  if (!lockedAtIso) return true;
  const t = new Date(String(lockedAtIso).replace(" ", "T")).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs;
}

export function listMessageQueue(convType: ConversationType, convId: string): CueQueuedMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM cue_message_queue
       WHERE conv_type = ? AND conv_id = ? AND status IN ('queued','processing')
       ORDER BY position ASC, created_at ASC`
    )
    .all(convType, convId) as CueQueuedMessage[];
}

export function enqueueMessageQueue(
  convType: ConversationType,
  convId: string,
  messageJson: string
): CueQueuedMessage {
  const database = getDb();
  const createdAt = nowIso();

  const id = crypto.randomUUID();
  const maxRow = database
    .prepare(
      `SELECT COALESCE(MAX(position), 0) as max_pos
       FROM cue_message_queue
       WHERE conv_type = ? AND conv_id = ?`
    )
    .get(convType, convId) as { max_pos?: number } | undefined;
  const nextPos = Number(maxRow?.max_pos ?? 0) + 1;

  database
    .prepare(
      `INSERT INTO cue_message_queue
       (id, conv_type, conv_id, position, message_json, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ? )`
    )
    .run(id, convType, convId, nextPos, messageJson, createdAt, createdAt, createdAt);

  const row = database
    .prepare(`SELECT * FROM cue_message_queue WHERE id = ?`)
    .get(id) as CueQueuedMessage | undefined;
  if (!row) throw new Error("failed to enqueue message");
  return row;
}

export function deleteMessageQueueItem(id: string): void {
  getDb().prepare(`DELETE FROM cue_message_queue WHERE id = ?`).run(id);
}

export function moveMessageQueueItem(
  convType: ConversationType,
  convId: string,
  fromIndex: number,
  toIndex: number
): void {
  const database = getDb();
  const list = listMessageQueue(convType, convId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return;
  if (fromIndex === toIndex) return;
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  const tx = database.transaction(() => {
    const updatedAt = nowIso();
    for (let i = 0; i < next.length; i++) {
      database
        .prepare(
          `UPDATE cue_message_queue
           SET position = ?, updated_at = ?
           WHERE id = ? AND conv_type = ? AND conv_id = ?`
        )
        .run(i + 1, updatedAt, next[i].id, convType, convId);
    }
  });
  tx();
}

function claimDueQueueItems(workerId: string, limit: number): CueQueuedMessage[] {
  const database = getDb();
  const now = nowIso();
  const lockTtlMs = 60_000;

  const tx = database.transaction(() => {
    const rows = database
      .prepare(
        `SELECT q.*
         FROM cue_message_queue q
         JOIN (
           SELECT conv_type, conv_id, MIN(position) AS min_pos
           FROM cue_message_queue
           WHERE status = 'queued'
             AND next_run_at <= ?
           GROUP BY conv_type, conv_id
         ) t
         ON q.conv_type = t.conv_type AND q.conv_id = t.conv_id AND q.position = t.min_pos
         ORDER BY q.next_run_at ASC, q.created_at ASC
         LIMIT ?`
      )
      .all(now, limit) as CueQueuedMessage[];

    const claimed: CueQueuedMessage[] = [];
    for (const r of rows) {
      const lockedAt = r.locked_at ? String(r.locked_at) : null;
      if (!queueLockExpired(lockedAt, lockTtlMs)) continue;

      const res = database
        .prepare(
          `UPDATE cue_message_queue
           SET status = 'processing', locked_by = ?, locked_at = ?, updated_at = ?
           WHERE id = ?
             AND (locked_at IS NULL OR locked_at <= ?) 
             AND status = 'queued'`
        )
        .run(workerId, now, now, r.id, addMsToIso(now, -lockTtlMs));

      if (res.changes === 1) {
        const row = database
          .prepare(`SELECT * FROM cue_message_queue WHERE id = ?`)
          .get(r.id) as CueQueuedMessage | undefined;
        if (row) claimed.push(row);
      }
    }
    return claimed;
  });

  return tx();
}

function releaseQueueItem(id: string, nextRunAt: string): void {
  const database = getDb();
  const updatedAt = nowIso();
  database
    .prepare(
      `UPDATE cue_message_queue
       SET status = 'queued', locked_by = NULL, locked_at = NULL, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(nextRunAt, updatedAt, id);
}

function failQueueItem(id: string, attempts: number, nextRunAt: string): void {
  const database = getDb();
  const updatedAt = nowIso();
  database
    .prepare(
      `UPDATE cue_message_queue
       SET status = 'queued', locked_by = NULL, locked_at = NULL,
           attempts = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(attempts, nextRunAt, updatedAt, id);
}

export function processMessageQueueTick(workerId: string, options?: { limit?: number }): {
  claimed: number;
  sent: number;
  rescheduled: number;
  failed: number;
  removedQueueIds: string[];
} {
  const limit = Math.max(1, Math.min(50, options?.limit ?? 20));
  const claimed = claimDueQueueItems(workerId, limit);
  let sent = 0;
  let rescheduled = 0;
  let failed = 0;
  const removedQueueIds: string[] = [];

  const now = nowIso();

  for (const item of claimed) {
    try {
      const message = JSON.parse(item.message_json || "{}") as {
        text?: string;
        images?: { mime_type: string; base64_data: string }[];
        mentions?: { userId: string; start: number; length: number; display: string }[];
      };
      const text = typeof message.text === "string" ? message.text : "";
      const images = Array.isArray(message.images) ? message.images : [];
      const mentions = Array.isArray(message.mentions) ? message.mentions : [];

      if (item.conv_type === "agent") {
        const latestPending = getDb()
          .prepare(
            `SELECT request_id
             FROM cue_requests
             WHERE agent_id = ? AND status = 'PENDING'
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get(item.conv_id) as { request_id?: string } | undefined;

        const rid = String(latestPending?.request_id || "");
        if (!rid) {
          releaseQueueItem(item.id, addMsToIso(now, 3000));
          rescheduled++;
          continue;
        }

        const resp: UserResponse = {
          text,
          images,
          mentions: mentions.length > 0 ? mentions : undefined,
        };
        sendResponse(rid, resp, false);
        deleteMessageQueueItem(item.id);
        removedQueueIds.push(item.id);
        sent++;
        continue;
      }

      // group: send to all pending in group
      const pendingRows = getDb()
        .prepare(
          `SELECT r.request_id as request_id
           FROM cue_requests r
           JOIN group_members gm ON gm.agent_name = r.agent_id
           WHERE gm.group_id = ? AND r.status = 'PENDING'
           ORDER BY r.created_at ASC`
        )
        .all(item.conv_id) as Array<{ request_id: string }>;

      const requestIds = pendingRows.map((x) => String(x.request_id || "")).filter(Boolean);
      if (requestIds.length === 0) {
        releaseQueueItem(item.id, addMsToIso(now, 3000));
        rescheduled++;
        continue;
      }

      const resp: UserResponse = {
        text,
        images,
        mentions: mentions.length > 0 ? mentions : undefined,
      };
      for (const rid of requestIds) {
        sendResponse(rid, resp, false);
      }
      deleteMessageQueueItem(item.id);
      removedQueueIds.push(item.id);
      sent++;
    } catch {
      const nextAttempts = Math.max(0, Number(item.attempts || 0)) + 1;
      const backoffMs = Math.min(60_000, Math.max(1000, Math.round(1000 * Math.pow(2, nextAttempts))));
      failQueueItem(item.id, nextAttempts, addMsToIso(now, backoffMs));
      failed++;
    }
  }

  return {
    claimed: claimed.length,
    sent,
    rescheduled,
    failed,
    removedQueueIds,
  };
}

function metaKey(type: "agent" | "group", id: string): string {
  return `${type}:${id}`;
}

export interface ConversationMeta {
  key: string;
  type: "agent" | "group";
  id: string;
  archived: 0 | 1;
  archived_at: string | null;
  deleted: 0 | 1;
  deleted_at: string | null;
}

export function getConversationMeta(type: "agent" | "group", id: string): ConversationMeta | undefined {
  return getDb()
    .prepare(`SELECT * FROM conversation_meta WHERE key = ?`)
    .get(metaKey(type, id)) as ConversationMeta | undefined;
}

export function getConversationMetaMap(type: "agent" | "group", ids: string[]): Record<string, ConversationMeta> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const keys = unique.map((id) => metaKey(type, id));
  const placeholders = keys.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM conversation_meta WHERE key IN (${placeholders})`)
    .all(...keys) as ConversationMeta[];
  const map: Record<string, ConversationMeta> = {};
  for (const r of rows) map[r.id] = r;
  return map;
}

function ensureConversationMeta(type: "agent" | "group", id: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO conversation_meta (key, type, id, archived, deleted)
       VALUES (?, ?, ?, 0, 0)`
    )
    .run(metaKey(type, id), type, id);
}

export function archiveConversation(type: "agent" | "group", id: string): void {
  ensureConversationMeta(type, id);
  getDb()
    .prepare(
      `UPDATE conversation_meta
       SET archived = 1, archived_at = datetime('now')
       WHERE key = ?`
    )
    .run(metaKey(type, id));
}

export function unarchiveConversation(type: "agent" | "group", id: string): void {
  ensureConversationMeta(type, id);
  getDb()
    .prepare(
      `UPDATE conversation_meta
       SET archived = 0, archived_at = NULL
       WHERE key = ?`
    )
    .run(metaKey(type, id));
}

export function deleteConversation(type: "agent" | "group", id: string): void {
  ensureConversationMeta(type, id);
  getDb()
    .prepare(
      `UPDATE conversation_meta
       SET deleted = 1, deleted_at = datetime('now')
       WHERE key = ?`
    )
    .run(metaKey(type, id));
}

export function getArchivedConversationCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM conversation_meta
       WHERE archived = 1 AND deleted = 0`
    )
    .get() as { count: number };
  return row.count;
}

export function getAgentDisplayName(agentId: string): string | undefined {
  const row = getDb()
    .prepare(`SELECT display_name FROM agent_profiles WHERE agent_id = ?`)
    .get(agentId) as { display_name: string } | undefined;
  return row?.display_name;
}

export function upsertAgentDisplayName(agentId: string, displayName: string): void {
  const clean = displayName.trim();
  if (!clean) return;
  getDb()
    .prepare(
      `INSERT INTO agent_profiles (agent_id, display_name, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(agent_id) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = datetime('now')`
    )
    .run(agentId, clean);
}

export function getAgentDisplayNames(agentIds: string[]): Record<string, string> {
  const unique = Array.from(new Set(agentIds.filter(Boolean)));
  if (unique.length === 0) return {};
  const placeholders = unique.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT agent_id, display_name
       FROM agent_profiles
       WHERE agent_id IN (${placeholders})`
    )
    .all(...unique) as Array<{ agent_id: string; display_name: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.agent_id] = r.display_name;
  return map;
}

// Type definitions
export interface CueRequest {
  id: number;
  request_id: string;
  agent_id: string;
  prompt: string;
  payload: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  created_at: string;
  updated_at: string;
}

export interface CueResponse {
  id: number;
  request_id: string;
  response_json: string;
  cancelled: boolean;
  created_at: string;
  files?: CueFile[];
  files_count?: number;
}

export interface CueFile {
  id: number;
  sha256: string;
  file: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  inline_base64?: string;
}

export type AgentTimelineItem =
  | {
      item_type: "request";
      time: string;
      request: CueRequest;
    }
  | {
      item_type: "response";
      time: string;
      response: CueResponse;
      request_id: string;
    };

// UserResponse, Group, GroupMember are imported from types.ts
export type { UserResponse, Group, GroupMember } from "./types";

// Query functions
export function getPendingRequests(): CueRequest[] {
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests 
       WHERE status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )
       ORDER BY created_at DESC`
    )
    .all() as CueRequest[];
}

export function getRequestsByAgent(agentId: string): CueRequest[] {
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests 
       WHERE agent_id = ? 
       ORDER BY created_at ASC 
       LIMIT 50`
    )
    .all(agentId) as CueRequest[];
}

export function getResponsesByAgent(agentId: string): CueResponse[] {
  return getDb()
    .prepare(
      `SELECT r.* FROM cue_responses r
       JOIN cue_requests req ON r.request_id = req.request_id
       WHERE req.agent_id = ?
       ORDER BY r.created_at ASC
       LIMIT 50`
    )
    .all(agentId) as CueResponse[];
}

export function getAgentLastResponse(agentId: string): CueResponse | undefined {
  const row = getDb()
    .prepare(
      `SELECT r.* FROM cue_responses r
       JOIN cue_requests req ON r.request_id = req.request_id
       WHERE req.agent_id = ?
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .get(agentId) as CueResponse | undefined;
  if (!row) return undefined;
  row.files_count = countFilesForResponseId(row.id);
  return row;
}

export function getAgentTimeline(
  agentId: string,
  before: string | null,
  limit: number
): { items: AgentTimelineItem[]; nextCursor: string | null } {
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
        SELECT
          'request' AS item_type,
          req.created_at AS time,
          req.request_id AS request_id,
          req.id AS req_id,
          req.agent_id AS agent_id,
          req.prompt AS prompt,
          req.payload AS payload,
          req.status AS status,
          req.created_at AS req_created_at,
          req.updated_at AS req_updated_at,
          NULL AS resp_id,
          NULL AS response_json,
          NULL AS cancelled,
          NULL AS resp_created_at
        FROM cue_requests req
        WHERE req.agent_id = ?

        UNION ALL

        SELECT
          'response' AS item_type,
          r.created_at AS time,
          r.request_id AS request_id,
          NULL AS req_id,
          NULL AS agent_id,
          NULL AS prompt,
          NULL AS payload,
          NULL AS status,
          NULL AS req_created_at,
          NULL AS req_updated_at,
          r.id AS resp_id,
          r.response_json AS response_json,
          r.cancelled AS cancelled,
          r.created_at AS resp_created_at
        FROM cue_responses r
        JOIN cue_requests req2 ON r.request_id = req2.request_id
        WHERE req2.agent_id = ?
      )
      WHERE (? IS NULL OR time < ?)
      ORDER BY time DESC
      LIMIT ?`
    )
    .all(agentId, agentId, before, before, limit) as Array<
    | {
        item_type: "request";
        time: string;
        request_id: string;
        req_id: number;
        agent_id: string;
        prompt: string;
        payload: string | null;
        status: CueRequest["status"];
        req_created_at: string;
        req_updated_at: string;
      }
    | {
        item_type: "response";
        time: string;
        request_id: string;
        resp_id: number;
        response_json: string;
        cancelled: 0 | 1;
        resp_created_at: string;
      }
  >;

  const items: AgentTimelineItem[] = rows.map((row) => {
    if (row.item_type === "request") {
      return {
        item_type: "request",
        time: row.time,
        request: {
          id: row.req_id,
          request_id: row.request_id,
          agent_id: row.agent_id,
          prompt: row.prompt,
          payload: row.payload,
          status: row.status,
          created_at: row.req_created_at,
          updated_at: row.req_updated_at,
        },
      };
    }
    return {
      item_type: "response",
      time: row.time,
      request_id: row.request_id,
      response: {
        id: row.resp_id,
        request_id: row.request_id,
        response_json: row.response_json,
        cancelled: row.cancelled === 1,
        created_at: row.resp_created_at,
      },
    };
  });

  const respIds = items
    .filter((x) => x.item_type === "response")
    .map((x) => (x.item_type === "response" ? x.response.id : 0))
    .filter((x) => x > 0);
  const filesMap = getFilesByResponseIds(respIds);
  for (const it of items) {
    if (it.item_type !== "response") continue;
    it.response.files = filesMap[it.response.id] || [];
    it.response.files_count = it.response.files.length;
  }

  const nextCursor = items.length > 0 ? items[items.length - 1].time : null;
  return { items, nextCursor };
}

export function getAllAgents(options?: { includeArchived?: boolean }): string[] {
  const includeArchived = options?.includeArchived ?? false;
  const results = getDb()
    .prepare(
      `SELECT agent_id, MAX(created_at) as last_time FROM cue_requests 
       WHERE agent_id != '' 
       GROUP BY agent_id
       ORDER BY last_time DESC`
    )
    .all() as { agent_id: string }[];

  const ids = results.map((r) => r.agent_id);
  const metaMap = getConversationMetaMap("agent", ids);
  return ids.filter((id) => {
    const m = metaMap[id];
    if (m?.deleted === 1) return false;
    if (!includeArchived && m?.archived === 1) return false;
    return true;
  });
}

export function getAgentLastRequest(
  agentId: string
): CueRequest | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests 
       WHERE agent_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`
    )
    .get(agentId) as CueRequest | undefined;
}

export function getPendingCountByAgent(agentId: string): number {
  const result = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM cue_requests 
       WHERE agent_id = ?
         AND status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )`
    )
    .get(agentId) as { count: number };
  return result.count;
}

function uniqueNonEmptyStrings(xs: string[]): string[] {
  return Array.from(
    new Set(xs.map((x) => String(x || "").trim()).filter((x) => x.length > 0))
  );
}

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(",");
}

function countFilesForResponseIds(responseIds: number[]): Record<number, number> {
  const ids = Array.from(new Set(responseIds.filter((x) => Number.isFinite(x) && x > 0)));
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
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

export function getPendingCountsByAgents(agentIds: string[]): Record<string, number> {
  const ids = uniqueNonEmptyStrings(agentIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT agent_id, COUNT(*) as count
       FROM cue_requests
       WHERE agent_id IN (${placeholders})
         AND status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )
       GROUP BY agent_id`
    )
    .all(...ids) as Array<{ agent_id: string; count: number }>;

  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  for (const r of rows) out[String(r.agent_id)] = Number(r.count);
  return out;
}

export function getLastRequestsByAgents(agentIds: string[]): Record<string, CueRequest | undefined> {
  const ids = uniqueNonEmptyStrings(agentIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT
           r.*,
           ROW_NUMBER() OVER (PARTITION BY r.agent_id ORDER BY r.created_at DESC) AS rn
         FROM cue_requests r
         WHERE r.agent_id IN (${placeholders})
       )
       WHERE rn = 1`
    )
    .all(...ids) as CueRequest[];

  const out: Record<string, CueRequest | undefined> = {};
  for (const id of ids) out[id] = undefined;
  for (const r of rows) out[String(r.agent_id)] = r;
  return out;
}

export function getLastResponsesByAgents(agentIds: string[]): Record<string, CueResponse | undefined> {
  const ids = uniqueNonEmptyStrings(agentIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT
           resp.*,
           req.agent_id as agent_id,
           ROW_NUMBER() OVER (PARTITION BY req.agent_id ORDER BY resp.created_at DESC) AS rn
         FROM cue_responses resp
         JOIN cue_requests req ON resp.request_id = req.request_id
         WHERE req.agent_id IN (${placeholders})
       )
       WHERE rn = 1`
    )
    .all(...ids) as Array<CueResponse & { agent_id: string }>;

  const respIds = rows.map((r) => Number(r.id)).filter((x) => x > 0);
  const filesCountMap = countFilesForResponseIds(respIds);

  const out: Record<string, CueResponse | undefined> = {};
  for (const id of ids) out[id] = undefined;
  for (const r of rows) {
    const agentId = String(r.agent_id);
    const respId = Number(r.id);
    r.files_count = filesCountMap[respId] || 0;
    out[agentId] = r;
  }
  return out;
}

function formatLocalIsoWithOffset(d: Date): string {
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

export function sendResponse(
  requestId: string,
  response: UserResponse,
  cancelled: boolean = false
): void {
  const db = getDb();

  const createdAt = formatLocalIsoWithOffset(new Date());

  const normalized = {
    text: typeof response.text === "string" ? response.text : "",
    mentions: Array.isArray(response.mentions) && response.mentions.length > 0 ? response.mentions : undefined,
  };

  // Insert response (no images/files in response_json)
  db.prepare(
    `INSERT OR IGNORE INTO cue_responses (request_id, response_json, cancelled, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(requestId, JSON.stringify(normalized), cancelled ? 1 : 0, createdAt);

  const respRow = db
    .prepare(`SELECT id FROM cue_responses WHERE request_id = ?`)
    .get(requestId) as { id: number } | undefined;
  const responseId = Number(respRow?.id ?? 0);

  if (responseId > 0 && !cancelled) {
    db.prepare(`DELETE FROM cue_response_files WHERE response_id = ?`).run(responseId);
    const images = Array.isArray(response.images) ? response.images : [];
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      const mime = String(img?.mime_type || "");
      const b64 = String(img?.base64_data || "");
      if (!b64) continue;
      const f = upsertFileFromBase64(mime, b64);
      db.prepare(
        `INSERT INTO cue_response_files (response_id, file_id, idx) VALUES (?, ?, ?)`
      ).run(responseId, f.id, i);
    }
  }

  // Update request status
  db.prepare(
    `UPDATE cue_requests 
     SET status = ? 
     WHERE request_id = ?`
  ).run(cancelled ? "CANCELLED" : "COMPLETED", requestId);
}

// Group-related functions
export function createGroup(id: string, name: string): void {
  getDb()
    .prepare(`INSERT INTO groups (id, name) VALUES (?, ?)`)
    .run(id, name);
}

export function getAllGroups(options?: { includeArchived?: boolean }): Group[] {
  const includeArchived = options?.includeArchived ?? false;
  const groups = getDb()
    .prepare(`SELECT * FROM groups ORDER BY created_at DESC`)
    .all() as Group[];

  const ids = groups.map((g) => g.id);
  const metaMap = getConversationMetaMap("group", ids);
  return groups.filter((g) => {
    const m = metaMap[g.id];
    if (m?.deleted === 1) return false;
    if (!includeArchived && m?.archived === 1) return false;
    return true;
  });
}

export function getGroupMembers(groupId: string): string[] {
  const results = getDb()
    .prepare(`SELECT agent_name FROM group_members WHERE group_id = ?`)
    .all(groupId) as { agent_name: string }[];
  return results.map((r) => r.agent_name);
}

export function getGroupMemberCounts(groupIds: string[]): Record<string, number> {
  const ids = uniqueNonEmptyStrings(groupIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT group_id, COUNT(*) as count
       FROM group_members
       WHERE group_id IN (${placeholders})
       GROUP BY group_id`
    )
    .all(...ids) as Array<{ group_id: string; count: number }>;

  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  for (const r of rows) out[String(r.group_id)] = Number(r.count);
  return out;
}

export function getGroupPendingCounts(groupIds: string[]): Record<string, number> {
  const ids = uniqueNonEmptyStrings(groupIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT gm.group_id as group_id, COUNT(*) as count
       FROM group_members gm
       JOIN cue_requests r ON r.agent_id = gm.agent_name
       WHERE gm.group_id IN (${placeholders})
         AND r.status = 'PENDING'
         AND NOT (
           COALESCE(r.payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(r.payload, '') LIKE '%"variant"%pause%'
         )
       GROUP BY gm.group_id`
    )
    .all(...ids) as Array<{ group_id: string; count: number }>;

  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  for (const r of rows) out[String(r.group_id)] = Number(r.count);
  return out;
}

export function getGroupLastRequests(groupIds: string[]): Record<string, CueRequest | undefined> {
  const ids = uniqueNonEmptyStrings(groupIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT
           r.*,
           gm.group_id as group_id,
           ROW_NUMBER() OVER (PARTITION BY gm.group_id ORDER BY r.created_at DESC) AS rn
         FROM group_members gm
         JOIN cue_requests r ON r.agent_id = gm.agent_name
         WHERE gm.group_id IN (${placeholders})
       )
       WHERE rn = 1`
    )
    .all(...ids) as Array<CueRequest & { group_id: string }>;

  const out: Record<string, CueRequest | undefined> = {};
  for (const id of ids) out[id] = undefined;
  for (const r of rows) out[String(r.group_id)] = r;
  return out;
}

export function getGroupLastResponses(groupIds: string[]): Record<string, CueResponse | undefined> {
  const ids = uniqueNonEmptyStrings(groupIds);
  if (ids.length === 0) return {};
  const placeholders = placeholdersFor(ids);
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT
           resp.*,
           gm.group_id as group_id,
           ROW_NUMBER() OVER (PARTITION BY gm.group_id ORDER BY resp.created_at DESC) AS rn
         FROM group_members gm
         JOIN cue_requests req ON req.agent_id = gm.agent_name
         JOIN cue_responses resp ON resp.request_id = req.request_id
         WHERE gm.group_id IN (${placeholders})
       )
       WHERE rn = 1`
    )
    .all(...ids) as Array<CueResponse & { group_id: string }>;

  const respIds = rows.map((r) => Number(r.id)).filter((x) => x > 0);
  const filesCountMap = countFilesForResponseIds(respIds);

  const out: Record<string, CueResponse | undefined> = {};
  for (const id of ids) out[id] = undefined;
  for (const r of rows) {
    const groupId = String(r.group_id);
    const respId = Number(r.id);
    r.files_count = filesCountMap[respId] || 0;
    out[groupId] = r;
  }
  return out;
}

export function addGroupMember(groupId: string, agentName: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO group_members (group_id, agent_name) VALUES (?, ?)`
    )
    .run(groupId, agentName);
}

export function removeGroupMember(groupId: string, agentName: string): void {
  getDb()
    .prepare(`DELETE FROM group_members WHERE group_id = ? AND agent_name = ?`)
    .run(groupId, agentName);
}

export function deleteGroup(groupId: string): void {
  getDb().prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
}

export function updateGroupName(groupId: string, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  getDb().prepare(`UPDATE groups SET name = ? WHERE id = ?`).run(clean, groupId);
}

export function getGroupPendingCount(groupId: string): number {
  const members = getGroupMembers(groupId);
  if (members.length === 0) return 0;

  const placeholders = members.map(() => "?").join(",");
  const result = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM cue_requests 
       WHERE agent_id IN (${placeholders})
         AND status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )`
    )
    .get(...members) as { count: number };
  return result.count;
}

export function getGroupPendingRequests(groupId: string): CueRequest[] {
  const members = getGroupMembers(groupId);
  if (members.length === 0) return [];

  const placeholders = members.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests 
       WHERE agent_id IN (${placeholders})
         AND status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )
       ORDER BY created_at ASC`
    )
    .all(...members) as CueRequest[];
}

export function getGroupLastRequest(groupId: string): CueRequest | undefined {
  const members = getGroupMembers(groupId);
  if (members.length === 0) return undefined;

  const placeholders = members.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests
       WHERE agent_id IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(...members) as CueRequest | undefined;
}

export function getGroupLastResponse(groupId: string): CueResponse | undefined {
  const members = getGroupMembers(groupId);
  if (members.length === 0) return undefined;

  const placeholders = members.map(() => "?").join(",");
  const row = getDb()
    .prepare(
      `SELECT r.* FROM cue_responses r
       JOIN cue_requests req ON r.request_id = req.request_id
       WHERE req.agent_id IN (${placeholders})
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .get(...members) as CueResponse | undefined;
  if (!row) return undefined;
  row.files_count = countFilesForResponseId(row.id);
  return row;
}

export function getGroupTimeline(
  groupId: string,
  before: string | null,
  limit: number
): { items: AgentTimelineItem[]; nextCursor: string | null } {
  const members = getGroupMembers(groupId);
  if (members.length === 0) return { items: [], nextCursor: null };

  const placeholders = members.map(() => "?").join(",");
  const query = `SELECT * FROM (
    SELECT
      'request' AS item_type,
      req.created_at AS time,
      req.request_id AS request_id,
      req.id AS req_id,
      req.agent_id AS agent_id,
      req.prompt AS prompt,
      req.payload AS payload,
      req.status AS status,
      req.created_at AS req_created_at,
      req.updated_at AS req_updated_at,
      NULL AS resp_id,
      NULL AS response_json,
      NULL AS cancelled,
      NULL AS resp_created_at
    FROM cue_requests req
    WHERE req.agent_id IN (${placeholders})

    UNION ALL

    SELECT
      'response' AS item_type,
      r.created_at AS time,
      r.request_id AS request_id,
      NULL AS req_id,
      NULL AS agent_id,
      NULL AS prompt,
      NULL AS payload,
      NULL AS status,
      NULL AS req_created_at,
      NULL AS req_updated_at,
      r.id AS resp_id,
      r.response_json AS response_json,
      r.cancelled AS cancelled,
      r.created_at AS resp_created_at
    FROM cue_responses r
    JOIN cue_requests req2 ON r.request_id = req2.request_id
    WHERE req2.agent_id IN (${placeholders})
  )
  WHERE (? IS NULL OR time < ?)
  ORDER BY time DESC
  LIMIT ?`;

  const rows = getDb()
    .prepare(query)
    .all(
      ...members,
      ...members,
      before,
      before,
      limit
    ) as Array<
    | {
        item_type: "request";
        time: string;
        request_id: string;
        req_id: number;
        agent_id: string;
        prompt: string;
        payload: string | null;
        status: CueRequest["status"];
        req_created_at: string;
        req_updated_at: string;
      }
    | {
        item_type: "response";
        time: string;
        request_id: string;
        resp_id: number;
        response_json: string;
        cancelled: 0 | 1;
        resp_created_at: string;
      }
  >;

  const items: AgentTimelineItem[] = rows.map((row) => {
    if (row.item_type === "request") {
      return {
        item_type: "request",
        time: row.time,
        request: {
          id: row.req_id,
          request_id: row.request_id,
          agent_id: row.agent_id,
          prompt: row.prompt,
          payload: row.payload,
          status: row.status,
          created_at: row.req_created_at,
          updated_at: row.req_updated_at,
        },
      };
    }
    return {
      item_type: "response",
      time: row.time,
      request_id: row.request_id,
      response: {
        id: row.resp_id,
        request_id: row.request_id,
        response_json: row.response_json,
        cancelled: row.cancelled === 1,
        created_at: row.resp_created_at,
      },
    };
  });

  const nextCursor = items.length > 0 ? items[items.length - 1].time : null;
  return { items, nextCursor };
}
