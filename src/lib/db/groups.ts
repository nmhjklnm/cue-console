import { getDb } from "./connection";
import type { Group, CueRequest, CueResponse, AgentTimelineItem } from "./types";
import { getConversationMetaMap } from "./conversations";
import { getFilesByResponseIds, countFilesForResponseId, countFilesForResponseIds } from "./files";
import { uniqueNonEmptyStrings, placeholdersFor } from "./utils";

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
