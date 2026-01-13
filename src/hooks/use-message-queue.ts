"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  enqueueMessage,
  fetchMessageQueue,
  removeQueuedMessage,
  reorderQueuedMessage,
} from "@/lib/actions";

export type QueuedMessage = {
  id: string;
  text: string;
  images: { mime_type: string; base64_data: string; file_name?: string }[];
  createdAt: number;
};

export function useMessageQueue({
  type,
  id,
  input,
  imagesRef,
  setInput,
  setImages,
  setDraftMentions,
  setNotice,
  setError,
  perfEnabled,
}: {
  type: "agent" | "group";
  id: string;
  input: string;
  imagesRef: MutableRefObject<QueuedMessage["images"]>;
  setInput: (v: string) => void;
  setImages: (v: QueuedMessage["images"]) => void;
  setDraftMentions: (v: { userId: string; start: number; length: number; display: string }[]) => void;
  setNotice: (v: string | null) => void;
  setError: (v: string | null) => void;
  perfEnabled: () => boolean;
}) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const lastQueueFetchRef = useRef<{ key: string; at: number } | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const key = `${type}:${id}`;
      const now = Date.now();
      const last = lastQueueFetchRef.current;
      if (last && last.key === key && now - last.at < 500) return;
      lastQueueFetchRef.current = { key, at: now };

      const t0 = perfEnabled() ? performance.now() : 0;
      const rows = await fetchMessageQueue(type, id);
      setQueue(rows as QueuedMessage[]);
      if (t0) {
        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.log(
          `[perf] fetchMessageQueue type=${type} id=${id} n=${rows.length} ${(t1 - t0).toFixed(1)}ms`
        );
      }
    } catch {
      // ignore
    }
  }, [type, id, perfEnabled]);

  const enqueueCurrent = useCallback(() => {
    const currentImages = imagesRef.current;
    if (!input.trim() && currentImages.length === 0) {
      setNotice("Enter a message to queue, or select a file.");
      return;
    }

    const qid =
      globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const item: QueuedMessage = {
      id: qid,
      text: input,
      images: currentImages,
      createdAt: Date.now(),
    };

    void (async () => {
      const res = await enqueueMessage(type, id, item);
      if (!res.success) {
        setError(res.error || "Queue failed");
        return;
      }
      setInput("");
      setImages([]);
      setDraftMentions([]);
      await refreshQueue();
    })();
  }, [id, imagesRef, input, refreshQueue, setDraftMentions, setError, setImages, setInput, setNotice, type]);

  const removeQueued = useCallback(
    (qid: string) => {
      void (async () => {
        const res = await removeQueuedMessage(qid);
        if (!res.success) {
          setError(res.error || "Remove failed");
          return;
        }
        await refreshQueue();
      })();
    },
    [refreshQueue, setError]
  );

  const recallQueued = useCallback(
    (qid: string) => {
      const item = queue.find((x) => x.id === qid);
      if (!item) return;
      setInput(item.text);
      setImages(item.images);
      setDraftMentions([]);
      void (async () => {
        await removeQueuedMessage(qid);
        await refreshQueue();
      })();
    },
    [queue, refreshQueue, setDraftMentions, setImages, setInput]
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      void (async () => {
        const res = await reorderQueuedMessage(type, id, fromIndex, toIndex);
        if (!res.success) {
          setError(res.error || "Reorder failed");
          return;
        }
        await refreshQueue();
      })();
    },
    [id, refreshQueue, setError, type]
  );

  useEffect(() => {
    const legacyKey = `cue-console:queue:${type}:${id}`;
    let legacyRaw: string | null = null;
    try {
      legacyRaw = localStorage.getItem(legacyKey);
    } catch {
      legacyRaw = null;
    }
    if (!legacyRaw) return;

    void (async () => {
      try {
        const parsed = JSON.parse(legacyRaw || "[]") as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        for (const x of parsed) {
          const obj = x as Partial<QueuedMessage>;
          const qid =
            typeof obj.id === "string" && obj.id
              ? obj.id
              : globalThis.crypto && "randomUUID" in globalThis.crypto
                ? (globalThis.crypto as Crypto).randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const msg: QueuedMessage = {
            id: qid,
            text: typeof obj.text === "string" ? obj.text : "",
            images: Array.isArray(obj.images) ? (obj.images as QueuedMessage["images"]) : [],
            createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
          };
          if (!msg.text.trim() && msg.images.length === 0) continue;
          await enqueueMessage(type, id, msg);
        }
        try {
          localStorage.removeItem(legacyKey);
        } catch {
          // ignore
        }
      } finally {
        await refreshQueue();
      }
    })();
  }, [type, id, refreshQueue]);

  useEffect(() => {
    const onQueueUpdated = (evt: Event) => {
      if (document.visibilityState !== "visible") return;

      const e = evt as CustomEvent<{ removedQueueIds?: string[] }>;
      const removed = Array.isArray(e.detail?.removedQueueIds) ? e.detail.removedQueueIds : [];
      if (removed.length > 0) {
        const s = new Set(removed);
        setQueue((prev) => prev.filter((x) => !s.has(x.id)));
      }
      void refreshQueue();
    };

    window.addEventListener("cue-console:queueUpdated", onQueueUpdated);
    return () => window.removeEventListener("cue-console:queueUpdated", onQueueUpdated);
  }, [refreshQueue]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshQueue();
    };

    const interval = setInterval(tick, 10_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [refreshQueue]);

  return {
    queue,
    refreshQueue,
    enqueueCurrent,
    removeQueued,
    recallQueued,
    reorderQueue,
    setQueue,
  };
}
