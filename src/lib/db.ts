import Database from "better-sqlite3";
import { mkdirSync } from "fs";
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

function initTables() {
  const database = db!;

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
  return getDb()
    .prepare(
      `SELECT r.* FROM cue_responses r
       JOIN cue_requests req ON r.request_id = req.request_id
       WHERE req.agent_id = ?
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .get(agentId) as CueResponse | undefined;
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
       WHERE agent_id = ? AND status = 'PENDING'`
    )
    .get(agentId) as { count: number };
  return result.count;
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

  // Insert response
  db.prepare(
    `INSERT OR IGNORE INTO cue_responses (request_id, response_json, cancelled, created_at) 
     VALUES (?, ?, ?, ?)`
  ).run(requestId, JSON.stringify(response), cancelled ? 1 : 0, createdAt);

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
       WHERE agent_id IN (${placeholders}) AND status = 'PENDING'`
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
       WHERE agent_id IN (${placeholders}) AND status = 'PENDING'
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
  return getDb()
    .prepare(
      `SELECT r.* FROM cue_responses r
       JOIN cue_requests req ON r.request_id = req.request_id
       WHERE req.agent_id IN (${placeholders})
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .get(...members) as CueResponse | undefined;
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
