export function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function randomSeed(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

export function avatarSeedKey(agentId: string): string {
  return `cue-console.avatarSeed.agent.${agentId}`;
}

export function groupAvatarSeedKey(groupId: string): string {
  return `cue-console.avatarSeed.group.${groupId}`;
}

export function notifyAvatarSeedUpdated(
  kind: "agent" | "group",
  id: string,
  seed: string
): void {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("cue-console:avatarSeedUpdated", {
        detail: { kind, id, seed },
      })
    );
  } catch {
    // ignore
  }
}

export function getOrInitAvatarSeed(agentId: string): string {
  const key = avatarSeedKey(agentId);
  const existing = safeLocalStorageGet(key);
  if (existing) return existing;
  const seed = randomSeed();
  safeLocalStorageSet(key, seed);
  return seed;
}

export function getOrInitGroupAvatarSeed(groupId: string): string {
  const key = groupAvatarSeedKey(groupId);
  const existing = safeLocalStorageGet(key);
  if (existing) return existing;
  const seed = randomSeed();
  safeLocalStorageSet(key, seed);
  return seed;
}

export function setAvatarSeed(agentId: string, seed: string): void {
  safeLocalStorageSet(avatarSeedKey(agentId), seed);
  notifyAvatarSeedUpdated("agent", agentId, seed);
}

export function setGroupAvatarSeed(groupId: string, seed: string): void {
  safeLocalStorageSet(groupAvatarSeedKey(groupId), seed);
  notifyAvatarSeedUpdated("group", groupId, seed);
}

export async function thumbsAvatarDataUrl(seed: string): Promise<string> {
  const [{ createAvatar }, thumbsStyle] = await Promise.all([
    import("@dicebear/core"),
    import("@dicebear/thumbs"),
  ]);

  const svg = createAvatar(thumbsStyle as any, {
    seed,
  }).toString();

  // Use base64 to avoid data-uri escaping issues (spaces/newlines/quotes) that can break rendering.
  const utf8 = new TextEncoder().encode(svg);
  let binary = "";
  for (let i = 0; i < utf8.length; i++) binary += String.fromCharCode(utf8[i]);
  const b64 = btoa(binary);

  return `data:image/svg+xml;base64,${b64}`;
}
