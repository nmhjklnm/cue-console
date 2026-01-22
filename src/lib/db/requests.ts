import { getDb } from "./connection";
import type { CueRequest } from "./types";
import { uniqueNonEmptyStrings, placeholdersFor } from "./utils";

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

export function getAgentPendingRequests(agentId: string, limit: number = 200): CueRequest[] {
  const cleanAgentId = String(agentId || "").trim();
  if (!cleanAgentId) return [];
  const lim = Math.max(1, Math.min(500, Math.floor(Number(limit) || 0)));
  return getDb()
    .prepare(
      `SELECT * FROM cue_requests
       WHERE agent_id = ?
         AND status = 'PENDING'
         AND NOT (
           COALESCE(payload, '') LIKE '%"type"%confirm%'
           AND COALESCE(payload, '') LIKE '%"variant"%pause%'
         )
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(cleanAgentId, lim) as CueRequest[];
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

export function getAgentLastRequest(agentId: string): CueRequest | undefined {
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

export function deleteRequest(requestId: string): void {
  const db = getDb();
  
  const respRow = db
    .prepare(`SELECT id FROM cue_responses WHERE request_id = ?`)
    .get(requestId) as { id: number } | undefined;
  
  if (respRow) {
    db.prepare(`DELETE FROM cue_response_files WHERE response_id = ?`).run(respRow.id);
    db.prepare(`DELETE FROM cue_responses WHERE id = ?`).run(respRow.id);
  }
  
  db.prepare(`DELETE FROM cue_requests WHERE request_id = ?`).run(requestId);
}
