"use server";

import { promises as fs } from "fs";
import os from "os";
import path from "path";

import {
  getPendingRequests,
  getRequestsByAgent,
  getResponsesByAgent,
  getAllAgents,
  getConversationMetaMap,
  getAgentDisplayNames,
  upsertAgentDisplayName,
  getAgentLastRequest,
  getPendingCountByAgent,
  getAgentTimeline,
  getAgentLastResponse,
  sendResponse,
  archiveConversation,
  unarchiveConversation,
  deleteConversation,
  getArchivedConversationCount,
  createGroup,
  getAllGroups,
  getGroupMembers,
  getGroupLastRequest,
  getGroupLastResponse,
  addGroupMember,
  removeGroupMember,
  deleteGroup,
  updateGroupName,
  getGroupPendingCount,
  getGroupPendingRequests,
  getGroupTimeline,
  enqueueMessageQueue,
  listMessageQueue,
  deleteMessageQueueItem,
  moveMessageQueueItem,
  acquireWorkerLease,
  processMessageQueueTick,
  type ConversationType,
  type CueResponse,
} from "./db";

// Import/export from the shared types file
import type { ConversationItem, UserResponse } from "./types";
export type { Group, UserResponse, ImageContent, ConversationItem } from "./types";
export type { CueRequest, CueResponse, AgentTimelineItem } from "./db";
import { v4 as uuidv4 } from "uuid";

export type UserConfig = {
  sound_enabled: boolean;
};

export type QueuedMessage = {
  id: string;
  text: string;
  images: { mime_type: string; base64_data: string; file_name?: string }[];
  createdAt: number;
};

const defaultUserConfig: UserConfig = {
  sound_enabled: true,
};

function getUserConfigPath(): string {
  return path.join(os.homedir(), ".cue", "config.json");
}

export async function getUserConfig(): Promise<UserConfig> {
  const p = getUserConfigPath();
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserConfig>;
    return {
      sound_enabled:
        typeof parsed.sound_enabled === "boolean"
          ? parsed.sound_enabled
          : defaultUserConfig.sound_enabled,
    };
  } catch {
    return defaultUserConfig;
  }
}

export async function setUserConfig(next: Partial<UserConfig>): Promise<UserConfig> {
  const prev = await getUserConfig();
  const merged: UserConfig = {
    sound_enabled:
      typeof next.sound_enabled === "boolean" ? next.sound_enabled : prev.sound_enabled,
  };
  const p = getUserConfigPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export async function fetchAgentDisplayNames(agentIds: string[]) {
  return getAgentDisplayNames(agentIds);
}

export async function setAgentDisplayName(agentId: string, displayName: string) {
  upsertAgentDisplayName(agentId, displayName);
  return { success: true } as const;
}

export async function fetchArchivedConversationCount() {
  return getArchivedConversationCount();
}

export async function bootstrapConversation(args: {
  type: ConversationType;
  id: string;
  limit?: number;
}): Promise<{
  config: UserConfig;
  members: string[];
  agentNameMap: Record<string, string>;
  queue: QueuedMessage[];
  timeline: Awaited<ReturnType<typeof fetchAgentTimeline>>;
}> {
  const type = args.type;
  const id = args.id;
  const limit = Math.max(1, Math.min(80, args.limit ?? 30));

  const cfgP = getUserConfig();
  const memsP = type === "group" ? Promise.resolve(getGroupMembers(id)) : Promise.resolve<string[]>([]);
  const queueP = Promise.resolve(fetchMessageQueue(type, id));
  const pageP = type === "agent" ? fetchAgentTimeline(id, null, limit) : fetchGroupTimeline(id, null, limit);

  const [config, members, queue, timeline] = await Promise.all([cfgP, memsP, queueP, pageP]);
  const ids = type === "group" ? Array.from(new Set([id, ...members])) : [id];
  const agentNameMap = getAgentDisplayNames(ids);

  return {
    config,
    members,
    agentNameMap,
    queue,
    timeline,
  };
}

function parseConversationKey(key: string): { type: "agent" | "group"; id: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const type = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if ((type !== "agent" && type !== "group") || !id) return null;
  return { type, id };
}

export async function archiveConversations(keys: string[]) {
  const unique = Array.from(new Set(keys));
  for (const k of unique) {
    const parsed = parseConversationKey(k);
    if (!parsed) continue;
    archiveConversation(parsed.type, parsed.id);
  }
  return { success: true } as const;
}

export async function unarchiveConversations(keys: string[]) {
  const unique = Array.from(new Set(keys));
  for (const k of unique) {
    const parsed = parseConversationKey(k);
    if (!parsed) continue;
    unarchiveConversation(parsed.type, parsed.id);
  }
  return { success: true } as const;
}

export async function deleteConversations(keys: string[]) {
  const unique = Array.from(new Set(keys));
  for (const k of unique) {
    const parsed = parseConversationKey(k);
    if (!parsed) continue;
    deleteConversation(parsed.type, parsed.id);
    if (parsed.type === "group") {
      deleteGroup(parsed.id);
    }
  }
  return { success: true } as const;
}

// Agent
export async function fetchAllAgents() {
  return getAllAgents();
}

export async function fetchAgentRequests(agentName: string) {
  return getRequestsByAgent(agentName);
}

export async function fetchAgentResponses(agentName: string) {
  return getResponsesByAgent(agentName);
}

export async function fetchAgentTimeline(
  agentName: string,
  before: string | null,
  limit: number
) {
  return getAgentTimeline(agentName, before, limit);
}

export async function fetchAgentLastRequest(agentName: string) {
  return getAgentLastRequest(agentName);
}

export async function fetchAgentPendingCount(agentName: string) {
  return getPendingCountByAgent(agentName);
}

export async function fetchPendingRequests() {
  return getPendingRequests();
}

export async function fetchMessageQueue(type: ConversationType, id: string): Promise<QueuedMessage[]> {
  const rows = listMessageQueue(type, id);
  const out: QueuedMessage[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.message_json || "{}") as {
        text?: string;
        images?: { mime_type: string; base64_data: string; file_name?: string }[];
        createdAt?: number;
      };
      out.push({
        id: String(r.id),
        text: typeof parsed.text === "string" ? parsed.text : "",
        images: Array.isArray(parsed.images) ? parsed.images : [],
        createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      });
    } catch {
      out.push({ id: r.id, text: "", images: [], createdAt: Date.now() });
    }
  }
  return out;
}

export async function enqueueMessage(
  type: ConversationType,
  id: string,
  msg: QueuedMessage
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    enqueueMessageQueue(type, id, JSON.stringify(msg));
    return { success: true } as const;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) } as const;
  }
}

export async function removeQueuedMessage(queueId: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    deleteMessageQueueItem(queueId);
    return { success: true } as const;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) } as const;
  }
}

export async function reorderQueuedMessage(
  type: ConversationType,
  id: string,
  fromIndex: number,
  toIndex: number
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    moveMessageQueueItem(type, id, fromIndex, toIndex);
    return { success: true } as const;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) } as const;
  }
}

export async function processQueueTick(workerId: string) {
  return processMessageQueueTick(workerId, { limit: 50 });
}

export async function claimWorkerLease(args: {
  leaseKey: string;
  holderId: string;
  ttlMs: number;
}) {
  return acquireWorkerLease(args);
}

// Responses
export async function submitResponse(
  requestId: string,
  text: string,
  images: { mime_type: string; base64_data: string }[] = [],
  mentions: { userId: string; start: number; length: number; display: string }[] = []
) {
  try {
    const response: UserResponse = {
      text,
      images,
      mentions: mentions.length > 0 ? mentions : undefined,
    };
    sendResponse(requestId, response, false);
    return { success: true } as const;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    } as const;
  }
}

export async function cancelRequest(requestId: string) {
  try {
    const response: UserResponse = { text: "" };
    sendResponse(requestId, response, true);
    return { success: true } as const;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    } as const;
  }
}

export async function batchRespond(
  requestIds: string[],
  text: string,
  images: { mime_type: string; base64_data: string }[] = [],
  mentions: { userId: string; start: number; length: number; display: string }[] = []
) {
  try {
    const response: UserResponse = {
      text,
      images,
      mentions: mentions.length > 0 ? mentions : undefined,
    };
    for (const id of requestIds) {
      sendResponse(id, response, false);
    }
    return { success: true, count: requestIds.length } as const;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    } as const;
  }
}

// Groups
export async function fetchAllGroups() {
  return getAllGroups();
}

export async function fetchGroupMembers(groupId: string) {
  return getGroupMembers(groupId);
}

export async function fetchGroupPendingCount(groupId: string) {
  return getGroupPendingCount(groupId);
}

export async function fetchGroupPendingRequests(groupId: string) {
  return getGroupPendingRequests(groupId);
}

export async function fetchGroupTimeline(
  groupId: string,
  before: string | null,
  limit: number
) {
  return getGroupTimeline(groupId, before, limit);
}

export async function createNewGroup(name: string, members: string[]) {
  try {
    const id = `grp_${uuidv4().slice(0, 8)}`;
    createGroup(id, name);
    for (const member of members) {
      addGroupMember(id, member);
    }
    return { success: true, id, name } as const;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    } as const;
  }
}

export async function addMemberToGroup(groupId: string, agentName: string) {
  addGroupMember(groupId, agentName);
  return { success: true };
}

export async function removeMemberFromGroup(
  groupId: string,
  agentName: string
) {
  removeGroupMember(groupId, agentName);
  return { success: true };
}

export async function removeGroup(groupId: string) {
  deleteGroup(groupId);
  return { success: true };
}

export async function setGroupName(groupId: string, name: string) {
  updateGroupName(groupId, name);
  return { success: true } as const;
}

// Aggregated data
export async function fetchConversationList(options?: {
  view?: "active" | "archived";
}): Promise<ConversationItem[]> {
  const view = options?.view ?? "active";
  const wantArchived = view === "archived";

  const agentsAll = wantArchived ? getAllAgents({ includeArchived: true }) : getAllAgents();
  const groupsAll = wantArchived ? getAllGroups({ includeArchived: true }) : getAllGroups();

  const agentMeta = wantArchived
    ? getConversationMetaMap("agent", agentsAll)
    : {};
  const groupMeta = wantArchived
    ? getConversationMetaMap(
        "group",
        groupsAll.map((g) => g.id)
      )
    : {};

  const agents = wantArchived
    ? agentsAll.filter((id) => agentMeta[id]?.archived === 1)
    : agentsAll;
  const groups = wantArchived
    ? groupsAll.filter((g) => groupMeta[g.id]?.archived === 1)
    : groupsAll;

  const agentNameMap = getAgentDisplayNames(agents);

  const items: ConversationItem[] = [];

  const responsePreview = (r: CueResponse | undefined) => {
    if (!r) return undefined;
    try {
      const parsed = JSON.parse(r.response_json || "{}") as {
        text?: string;
      };
      const text = (parsed.text || "").trim();
      if (text) return `You: ${text}`;
      const filesCount = typeof r.files_count === "number" ? r.files_count : 0;
      if (filesCount > 0) return "You: [file]";
      return "You: [message]";
    } catch {
      return "You: [message]";
    }
  };

  // Groups
  for (const group of groups) {
    const pendingCount = getGroupPendingCount(group.id);
    const members = getGroupMembers(group.id);
    const lastReq = getGroupLastRequest(group.id);

    const lastResp = getGroupLastResponse(group.id);
    const lastReqTime = lastReq?.created_at;
    const lastRespTime = lastResp?.created_at;

    const respMsg = responsePreview(lastResp);

    const lastIsResp =
      !!lastRespTime &&
      (!lastReqTime || new Date(lastRespTime).getTime() >= new Date(lastReqTime).getTime());

    const lastReqName = lastReq?.agent_id
      ? agentNameMap[lastReq.agent_id] || lastReq.agent_id
      : undefined;

    items.push({
      type: "group",
      id: group.id,
      name: group.name,
      displayName: `${group.name} (${members.length} members)`,
      pendingCount,
      lastMessage: (
        lastIsResp
          ? respMsg
          : lastReq?.prompt
            ? `${lastReqName}: ${lastReq.prompt}`
            : undefined
      )?.slice(0, 50),
      lastTime: (lastIsResp ? lastRespTime : lastReqTime) || group.created_at,
    });
  }

  // Agents
  for (const agent of agents) {
    const pendingCount = getPendingCountByAgent(agent);
    const lastReq = getAgentLastRequest(agent);
    const lastResp = getAgentLastResponse(agent);
    const lastReqTime = lastReq?.created_at;
    const lastRespTime = lastResp?.created_at;

    const respMsg = responsePreview(lastResp);
    const reqMsg = lastReq?.prompt ? `Other: ${lastReq.prompt}` : undefined;

    const lastIsResp =
      !!lastRespTime &&
      (!lastReqTime || new Date(lastRespTime).getTime() >= new Date(lastReqTime).getTime());

    items.push({
      type: "agent",
      id: agent,
      name: agent,
      displayName: agentNameMap[agent] || agent,
      pendingCount,
      lastMessage: (lastIsResp ? respMsg : reqMsg)?.slice(0, 50),
      lastTime: (lastIsResp ? lastRespTime : lastReqTime),
    });
  }

  // Pin pending first, then sort by last activity time
  items.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
    if (!a.lastTime) return 1;
    if (!b.lastTime) return -1;
    return new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime();
  });

  return items;
}
