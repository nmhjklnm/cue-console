"use client";

import { useCallback, useState } from "react";
import {
  getOrInitAvatarSeed,
  getOrInitGroupAvatarSeed,
  randomSeed,
  setAvatarSeed,
  setGroupAvatarSeed,
  thumbsAvatarDataUrl,
} from "@/lib/avatar";

function perfEnabled(): boolean {
  try {
    return window.localStorage.getItem("cue-console:perf") === "1";
  } catch {
    return false;
  }
}

export function useAvatar() {
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarPickerTarget, setAvatarPickerTarget] = useState<
    | { kind: "agent"; id: string }
    | { kind: "group"; id: string }
    | null
  >(null);
  const [avatarCandidates, setAvatarCandidates] = useState<
    { seed: string; url: string }[]
  >([]);

  const ensureAvatarUrl = useCallback(
    async (kind: "agent" | "group", rawId: string) => {
      if (!rawId) return;
      const key = `${kind}:${rawId}`;
      setAvatarUrlMap((prev) => {
        if (prev[key]) return prev;
        return { ...prev, [key]: "" };
      });

      try {
        const seed =
          kind === "agent"
            ? getOrInitAvatarSeed(rawId)
            : getOrInitGroupAvatarSeed(rawId);
        const url = await thumbsAvatarDataUrl(seed);
        setAvatarUrlMap((prev) => ({ ...prev, [key]: url }));
      } catch {
        // ignore
      }
    },
    []
  );

  const setTargetAvatarSeed = useCallback(
    async (kind: "agent" | "group", rawId: string, seed: string) => {
      if (!rawId) return;
      if (kind === "agent") setAvatarSeed(rawId, seed);
      else setGroupAvatarSeed(rawId, seed);

      const key = `${kind}:${rawId}`;
      try {
        const url = await thumbsAvatarDataUrl(seed);
        setAvatarUrlMap((prev) => ({ ...prev, [key]: url }));
      } catch {
        // ignore
      }
    },
    []
  );

  const openAvatarPicker = useCallback(
    async (target: { kind: "agent" | "group"; id: string }) => {
      setAvatarPickerTarget(target);
      setAvatarPickerOpen(true);
      void ensureAvatarUrl(target.kind, target.id);

      try {
        const seeds = Array.from({ length: 20 }, () => randomSeed());
        const urls = await Promise.all(seeds.map((s) => thumbsAvatarDataUrl(s)));
        setAvatarCandidates(
          seeds.map((seed, i) => ({ seed, url: urls[i] || "" }))
        );
      } catch {
        setAvatarCandidates([]);
      }
    },
    [ensureAvatarUrl]
  );

  const handleAvatarRandomize = useCallback(async () => {
    if (!avatarPickerTarget) return;
    const s = randomSeed();
    await setTargetAvatarSeed(
      avatarPickerTarget.kind,
      avatarPickerTarget.id,
      s
    );
    // refresh candidate grid
    void openAvatarPicker(avatarPickerTarget);
  }, [avatarPickerTarget, setTargetAvatarSeed, openAvatarPicker]);

  const handleAvatarSelect = useCallback(
    async (seed: string) => {
      if (!avatarPickerTarget) return;
      await setTargetAvatarSeed(
        avatarPickerTarget.kind,
        avatarPickerTarget.id,
        seed
      );
      setAvatarPickerOpen(false);
    },
    [avatarPickerTarget, setTargetAvatarSeed]
  );

  const ensureAvatarsForMembers = useCallback(
    async (members: string[]) => {
      const t0 = perfEnabled() ? performance.now() : 0;
      const batchSize = 4;
      for (let i = 0; i < members.length; i += batchSize) {
        const batch = members.slice(i, i + batchSize);
        await Promise.all(batch.map((mid) => ensureAvatarUrl("agent", mid)));
      }
      if (t0) {
        const t1 = performance.now();
        console.log(
          `[perf] ensureAvatarUrl(group members) n=${members.length} ${(t1 - t0).toFixed(1)}ms`
        );
      }
    },
    [ensureAvatarUrl]
  );

  return {
    avatarUrlMap,
    avatarPickerOpen,
    setAvatarPickerOpen,
    avatarPickerTarget,
    avatarCandidates,
    ensureAvatarUrl,
    setTargetAvatarSeed,
    openAvatarPicker,
    handleAvatarRandomize,
    handleAvatarSelect,
    ensureAvatarsForMembers,
  };
}
