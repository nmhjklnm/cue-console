import { useState, useCallback, useRef, useEffect } from "react";
import { archiveConversations, deleteConversations, unarchiveConversations } from "@/lib/actions";
import { conversationKey } from "./utils";
import type { ConversationItem } from "@/lib/actions";

export function useConversationActions(loadData: () => Promise<void>) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [undoToastKey, setUndoToastKey] = useState(0);

  const toggleSelected = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const clearBulk = useCallback(() => {
    setBulkMode(false);
    setSelectedKeys(new Set());
  }, []);

  const scheduleDelete = useCallback(
    (keys: string[], items: ConversationItem[]) => {
      const unique = Array.from(new Set(keys));
      if (unique.length === 0) return;

      setPendingDelete((prev) => Array.from(new Set([...prev, ...unique])));

      for (const k of unique) {
        if (deleteTimersRef.current.has(k)) continue;
        const t = setTimeout(async () => {
          deleteTimersRef.current.delete(k);
          setPendingDelete((prev) => prev.filter((x) => x !== k));
          await deleteConversations([k]);
          await loadData();
        }, 5000);
        deleteTimersRef.current.set(k, t);
      }
    },
    [loadData]
  );

  const undoDelete = useCallback(
    async (keys?: string[]) => {
      const toUndo = keys && keys.length > 0 ? keys : pendingDelete;
      if (toUndo.length === 0) return;
      for (const k of toUndo) {
        const t = deleteTimersRef.current.get(k);
        if (t) clearTimeout(t);
        deleteTimersRef.current.delete(k);
      }
      setPendingDelete((prev) => prev.filter((k) => !toUndo.includes(k)));
      await loadData();
    },
    [loadData, pendingDelete]
  );

  const dismissUndoToast = useCallback(() => {
    setPendingDelete([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of deleteTimersRef.current.values()) {
        clearTimeout(timer);
      }
      deleteTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (pendingDelete.length > 0) {
      queueMicrotask(() => setUndoToastKey((v) => v + 1));
    }
  }, [pendingDelete.length]);

  const handleArchiveSelected = useCallback(async (selectedKeyList: string[]) => {
    if (selectedKeyList.length === 0) return;
    await archiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [clearBulk, loadData]);

  const handleUnarchiveSelected = useCallback(async (selectedKeyList: string[]) => {
    if (selectedKeyList.length === 0) return;
    await unarchiveConversations(selectedKeyList);
    clearBulk();
    await loadData();
  }, [clearBulk, loadData]);

  return {
    bulkMode,
    setBulkMode,
    selectedKeys,
    setSelectedKeys,
    toggleSelected,
    clearBulk,
    pendingDelete,
    scheduleDelete,
    undoDelete,
    dismissUndoToast,
    undoToastKey,
    handleArchiveSelected,
    handleUnarchiveSelected,
  };
}
