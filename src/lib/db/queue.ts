import crypto from "crypto";
import { getDb } from "./connection";
import type { ConversationType, CueQueuedMessage, UserResponse } from "./types";
import { nowIso, addMsToIso } from "./utils";
import { sendResponse } from "./responses";

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

function cancelExpiredPendingRequests(options?: { timeoutMs?: number; excludePause?: boolean }): {
  considered: number;
  cancelled: number;
} {
  const timeoutMs = Math.max(1, options?.timeoutMs ?? 10 * 60 * 1000);
  const excludePause = options?.excludePause ?? true;

  const db = getDb();
  const now = Date.now();
  const cutoff = now - timeoutMs;

  const rows = db
    .prepare(
      `SELECT request_id, created_at, payload
       FROM cue_requests
       WHERE status = 'PENDING'
       ORDER BY created_at ASC`
    )
    .all() as Array<{ request_id: string; created_at: string; payload: string | null }>;

  let cancelled = 0;

  for (const r of rows) {
    if (excludePause) {
      const payload = r.payload;
      if (payload && payload.includes('"type"') && payload.includes('"confirm"')) {
        const looksLikePause =
          payload.includes('"variant"') && payload.includes('"pause"');
        if (looksLikePause) continue;
      }
    }

    const createdAtMs = new Date(r.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) continue;
    if (createdAtMs > cutoff) continue;

    try {
      sendResponse(String(r.request_id), { text: "" }, true);
      cancelled += 1;
    } catch {
    }
  }

  return { considered: rows.length, cancelled };
}

export function processMessageQueueTick(workerId: string, options?: { limit?: number }): {
  claimed: number;
  sent: number;
  rescheduled: number;
  failed: number;
  removedQueueIds: string[];
} {
  cancelExpiredPendingRequests({ timeoutMs: 10 * 60 * 1000, excludePause: true });

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
