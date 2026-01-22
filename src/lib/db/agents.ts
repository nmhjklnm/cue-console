import { getDb } from "./connection";
import type { CueRequest, CueResponse, AgentTimelineItem, AgentEnv } from "./types";
import { getFilesByResponseIds } from "./files";
import { getConversationMetaMap } from "./conversations";
import { uniqueNonEmptyStrings, placeholdersFor } from "./utils";

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
  const unique = uniqueNonEmptyStrings(agentIds);
  if (unique.length === 0) return {};
  const placeholders = placeholdersFor(unique);
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

export function getAgentEnvMap(agentIds: string[]): Record<string, AgentEnv> {
  const unique = uniqueNonEmptyStrings(agentIds);
  if (unique.length === 0) return {};
  const placeholders = placeholdersFor(unique);
  const rows = getDb()
    .prepare(
      `SELECT agent_id, agent_runtime, project_dir, agent_terminal, updated_at
       FROM agent_envs
       WHERE agent_id IN (${placeholders})`
    )
    .all(...unique) as AgentEnv[];
  const map: Record<string, AgentEnv> = {};
  for (const r of rows) map[r.agent_id] = r;
  return map;
}

export function getAgentEnv(agentId: string): AgentEnv | undefined {
  const row = getDb()
    .prepare(
      `SELECT agent_id, agent_runtime, project_dir, agent_terminal, updated_at
       FROM agent_envs
       WHERE agent_id = ?`
    )
    .get(agentId) as AgentEnv | undefined;
  return row;
}

export function getAgentsByProjectDir(projectDir: string): string[] {
  if (!projectDir) return [];
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT agent_id FROM agent_envs WHERE project_dir = ? ORDER BY updated_at DESC`
    )
    .all(projectDir) as { agent_id: string }[];
  return rows.map(r => r.agent_id);
}
