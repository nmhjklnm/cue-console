import { useState, useCallback } from "react";
import {
  getOrInitAvatarSeed,
  getOrInitGroupAvatarSeed,
  randomSeed,
  setAvatarSeed,
  setGroupAvatarSeed,
  thumbsAvatarDataUrl,
} from "@/lib/avatar";

export function useAvatarManagement() {
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarPickerTarget, setAvatarPickerTarget] = useState<
    | { kind: "agent"; id: string }
    | { kind: "group"; id: string }
    | null
  >(null);
  const [avatarCandidates, setAvatarCandidates] = useState<{ seed: string; url: string }[]>([]);

  const ensureAvatarUrl = useCallback(async (kind: "agent" | "group", rawId: string) => {
    if (!rawId) return;
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
    } catch {
      // ignore
    }
  }, []);

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
        setAvatarCandidates(seeds.map((seed, i) => ({ seed, url: urls[i] || "" })));
      } catch {
        setAvatarCandidates([]);
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
  };
}
