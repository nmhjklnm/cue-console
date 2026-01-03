"use server";

import {
  getPendingRequests,
  getRequestsByAgent,
  getResponsesByAgent,
  getAllAgents,
  getAgentDisplayNames,
  upsertAgentDisplayName,
  getAgentLastRequest,
  getPendingCountByAgent,
  getAgentTimeline,
  getAgentLastResponse,
  sendResponse,
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
  type CueResponse,
} from "./db";

// 从统一类型文件导入和导出
import type { ConversationItem, UserResponse } from "./types";
export type { Group, UserResponse, ImageContent, ConversationItem } from "./types";
export type { CueRequest, CueResponse, AgentTimelineItem } from "./db";
import { v4 as uuidv4 } from "uuid";

export async function fetchAgentDisplayNames(agentIds: string[]) {
  return getAgentDisplayNames(agentIds);
}

export async function setAgentDisplayName(agentId: string, displayName: string) {
  upsertAgentDisplayName(agentId, displayName);
  return { success: true } as const;
}

// Agent 相关
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

// 响应相关
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
    const response: UserResponse = { text: "", images: [] };
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

// 群组相关
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

// 综合数据获取
export async function fetchConversationList(): Promise<ConversationItem[]> {
  const agents = getAllAgents();
  const groups = getAllGroups();

  const agentNameMap = getAgentDisplayNames(agents);

  const items: ConversationItem[] = [];

  const responsePreview = (r: CueResponse | undefined) => {
    if (!r) return undefined;
    try {
      const parsed = JSON.parse(r.response_json || "{}") as {
        text?: string;
        images?: unknown[];
      };
      const text = (parsed.text || "").trim();
      if (text) return `你: ${text}`;
      if (Array.isArray(parsed.images) && parsed.images.length > 0) return "你: [图片]";
      return "你: [消息]";
    } catch {
      return "你: [消息]";
    }
  };

  // 添加群组
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
      displayName: `${group.name} (${members.length}人)`,
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

  // 添加单聊 agent
  for (const agent of agents) {
    const pendingCount = getPendingCountByAgent(agent);
    const lastReq = getAgentLastRequest(agent);
    const lastResp = getAgentLastResponse(agent);
    const lastReqTime = lastReq?.created_at;
    const lastRespTime = lastResp?.created_at;

    const respMsg = responsePreview(lastResp);
    const reqMsg = lastReq?.prompt ? `对方: ${lastReq.prompt}` : undefined;

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

  // 待回复置顶 + 按最后时间排序
  items.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
    if (!a.lastTime) return 1;
    if (!b.lastTime) return -1;
    return new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime();
  });

  return items;
}
