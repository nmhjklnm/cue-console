import { getDb } from "./connection";
import type { CueResponse, UserResponse } from "./types";
import { formatLocalIsoWithOffset, uniqueNonEmptyStrings, placeholdersFor } from "./utils";
import { upsertFileFromBase64, countFilesForResponseId, countFilesForResponseIds } from "./files";

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

  db.prepare(
    `UPDATE cue_requests 
     SET status = ? 
     WHERE request_id = ?`
  ).run(cancelled ? "CANCELLED" : "COMPLETED", requestId);
}
