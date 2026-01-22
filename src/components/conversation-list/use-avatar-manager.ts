import { useState, useRef, useCallback, useEffect } from "react";
import { getOrInitAvatarSeed, getOrInitGroupAvatarSeed, thumbsAvatarDataUrl } from "@/lib/avatar";
import type { ConversationItem } from "@/lib/actions";
import { perfEnabled, type GlobalWithIdleCallbacks } from "./utils";

export function useAvatarManager(items: ConversationItem[]) {
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const avatarWorkSeqRef = useRef(0);
  const avatarUrlMapRef = useRef<Record<string, string>>({});

  const ensureAvatarUrl = useCallback(async (kind: "agent" | "group", rawId: string) => {
    if (!rawId) return;
    const t0 = perfEnabled() ? performance.now() : 0;
    const key = `${kind}:${rawId}`;
    setAvatarUrlMap((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: "" };
    });

    try {
      const seed =
        kind === "agent" ? getOrInitAvatarSeed(rawId) : getOrInitGroupAvatarSeed(rawId);
      const url = await thumbsAvatarDataUrl(seed);
      setAvatarUrlMap((prev) => ({ ...prev, [key]: url }));
      if (t0) {
        const t1 = performance.now();
        console.log(`[perf] ensureAvatarUrl kind=${kind} id=${rawId} ${(t1 - t0).toFixed(1)}ms`);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    avatarUrlMapRef.current = avatarUrlMap;
  }, [avatarUrlMap]);

  useEffect(() => {
    const seq = ++avatarWorkSeqRef.current;

    const keyOf = (it: ConversationItem) => `${it.type}:${it.id}`;
    const needs = (it: ConversationItem) => {
      const k = keyOf(it);
      const existing = avatarUrlMapRef.current[k];
      return typeof existing !== "string" || existing.length === 0;
    };

    const pending = items.filter((it) => it.id && needs(it));
    if (pending.length === 0) return;

    const FIRST_BATCH = 12;
    const IDLE_BATCH = 4;

    let cancelled = false;
    const run = async (batch: ConversationItem[]) => {
      for (const it of batch) {
        if (cancelled) return;
        if (avatarWorkSeqRef.current !== seq) return;
        await ensureAvatarUrl(it.type, it.id);
      }
    };

    void run(pending.slice(0, FIRST_BATCH));

    const rest = pending.slice(FIRST_BATCH);
    if (rest.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const scheduleIdle = (fn: () => void) => {
      const g = globalThis as GlobalWithIdleCallbacks;
      if (typeof g.requestIdleCallback === "function") {
        return g.requestIdleCallback(fn, { timeout: 1000 });
      }
      return window.setTimeout(fn, 60);
    };
    const cancelIdle = (handle: number) => {
      const g = globalThis as GlobalWithIdleCallbacks;
      if (typeof g.cancelIdleCallback === "function") {
        g.cancelIdleCallback(handle);
        return;
      }
      window.clearTimeout(handle);
    };

    let idx = 0;
    let handle: number | null = null;

    const pump = () => {
      if (cancelled) return;
      if (avatarWorkSeqRef.current !== seq) return;
      const batch = rest.slice(idx, idx + IDLE_BATCH);
      idx += IDLE_BATCH;
      void run(batch);
      if (idx >= rest.length) return;
      handle = scheduleIdle(pump);
    };

    handle = scheduleIdle(pump);

    return () => {
      cancelled = true;
      if (handle != null) cancelIdle(handle);
    };
  }, [ensureAvatarUrl, items]);

  useEffect(() => {
    const onAvatarSeedUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ kind: "agent" | "group"; id: string; seed: string }>;
      const kind = e.detail?.kind;
      const rawId = e.detail?.id;
      const seed = e.detail?.seed;
      if (!kind || !rawId || !seed) return;
      void (async () => {
        try {
          const url = await thumbsAvatarDataUrl(seed);
          setAvatarUrlMap((prev) => ({ ...prev, [`${kind}:${rawId}`]: url }));
        } catch {
          // ignore
        }
      })();
    };

    window.addEventListener("cue-console:avatarSeedUpdated", onAvatarSeedUpdated);
    return () => {
      window.removeEventListener("cue-console:avatarSeedUpdated", onAvatarSeedUpdated);
    };
  }, []);

  return { avatarUrlMap };
}
