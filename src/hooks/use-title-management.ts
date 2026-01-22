import { useState, useEffect, useMemo, useCallback } from "react";
import { setAgentDisplayName, setGroupName, fetchAgentEnv } from "@/lib/actions";
import type { ChatType } from "@/types/chat";

interface UseTitleManagementProps {
  type: ChatType;
  id: string;
  name: string;
}

export function useTitleManagement({ type, id, name }: UseTitleManagementProps) {
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [groupTitle, setGroupTitle] = useState<string>(name);
  const [agentRuntime, setAgentRuntime] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);

  const titleDisplay = useMemo(() => {
    if (type === "agent") return agentNameMap[id] || id;
    return groupTitle;
  }, [agentNameMap, groupTitle, id, type]);

  useEffect(() => {
    if (type !== "agent") {
      setAgentRuntime(undefined);
      setProjectName(undefined);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const env = await fetchAgentEnv(id);
        if (cancelled) return;
        setAgentRuntime(env.agentRuntime);
        setProjectName(env.projectName);
      } catch {
        if (cancelled) return;
        setAgentRuntime(undefined);
        setProjectName(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  useEffect(() => {
    if (type !== "group") return;
    queueMicrotask(() => setGroupTitle(name));
  }, [name, type]);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    if (type === "agent") {
      if (newTitle === (agentNameMap[id] || id)) return;
      await setAgentDisplayName(id, newTitle);
      setAgentNameMap((prev) => ({ ...prev, [id]: newTitle }));
      window.dispatchEvent(
        new CustomEvent("cuehub:agentDisplayNameUpdated", {
          detail: { agentId: id, displayName: newTitle },
        })
      );
      return;
    }
    if (newTitle === groupTitle) return;
    await setGroupName(id, newTitle);
    setGroupTitle(newTitle);
  }, [type, id, agentNameMap, groupTitle]);

  return {
    titleDisplay,
    agentRuntime,
    projectName,
    agentNameMap,
    setAgentNameMap,
    groupTitle,
    setGroupTitle,
    handleTitleChange,
  };
}
