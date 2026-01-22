import { getDb } from "./connection";
import type { ConversationType, ConversationMeta } from "./types";
import { uniqueNonEmptyStrings } from "./utils";

function metaKey(type: "agent" | "group", id: string): string {
  return `${type}:${id}`;
}

export function getConversationMeta(type: "agent" | "group", id: string): ConversationMeta | undefined {
  return getDb()
    .prepare(`SELECT * FROM conversation_meta WHERE key = ?`)
    .get(metaKey(type, id)) as ConversationMeta | undefined;
}

export function getConversationMetaMap(type: "agent" | "group", ids: string[]): Record<string, ConversationMeta> {
  const unique = uniqueNonEmptyStrings(ids);
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

export function pinConversation(convType: ConversationType, convId: string, view: "active" | "archived"): void {
  const t = String(convType || "").trim();
  const id = String(convId || "").trim();
  const v = view === "archived" ? "archived" : "active";
  if (!id) return;
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO conversation_pins (conv_type, conv_id, view)
       VALUES (?, ?, ?)`
    )
    .run(t, id, v);
}

export function unpinConversation(convType: ConversationType, convId: string, view: "active" | "archived"): void {
  const t = String(convType || "").trim();
  const id = String(convId || "").trim();
  const v = view === "archived" ? "archived" : "active";
  if (!id) return;
  getDb()
    .prepare(
      `DELETE FROM conversation_pins
       WHERE conv_type = ? AND conv_id = ? AND view = ?`
    )
    .run(t, id, v);
}

export function listPinnedConversations(view: "active" | "archived"): Array<{ conv_type: ConversationType; conv_id: string }> {
  const v = view === "archived" ? "archived" : "active";
  const rows = getDb()
    .prepare(
      `SELECT conv_type, conv_id
       FROM conversation_pins
       WHERE view = ?
       ORDER BY pin_order ASC`
    )
    .all(v) as Array<{ conv_type: ConversationType; conv_id: string }>;
  return rows || [];
}

export function setBotEnabledConversation(convType: ConversationType, convId: string, enabled: boolean): void {
  const t = convType === "group" ? "group" : "agent";
  const id = String(convId || "").trim();
  if (!id) return;
  const { nowIso } = require("./utils");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO bot_enabled_conversations (conv_type, conv_id, enabled, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(conv_type, conv_id) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`
    )
    .run(t, id, enabled ? 1 : 0, now);
}

export function getBotEnabledConversation(convType: ConversationType, convId: string): boolean {
  const t = convType === "group" ? "group" : "agent";
  const id = String(convId || "").trim();
  if (!id) return false;
  const row = getDb()
    .prepare(`SELECT enabled FROM bot_enabled_conversations WHERE conv_type = ? AND conv_id = ?`)
    .get(t, id) as { enabled?: number } | undefined;
  return Number(row?.enabled ?? 0) === 1;
}

export function listBotEnabledConversations(limit?: number): Array<{ conv_type: ConversationType; conv_id: string }> {
  const lim = Math.max(1, Math.min(500, Math.floor(Number(limit ?? 200))));
  const rows = getDb()
    .prepare(
      `SELECT conv_type, conv_id
       FROM bot_enabled_conversations
       WHERE enabled = 1
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(lim) as Array<{ conv_type: ConversationType; conv_id: string }>;
  return rows || [];
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

  const { nowIso, addMsToIso } = require("./utils");
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
