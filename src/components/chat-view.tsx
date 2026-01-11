"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cn,
  getAgentEmoji,
  formatFullTime,
  getWaitingDuration,
} from "@/lib/utils";
import {
  getOrInitAvatarSeed,
  getOrInitGroupAvatarSeed,
  randomSeed,
  setAvatarSeed,
  setGroupAvatarSeed,
  thumbsAvatarDataUrl,
} from "@/lib/avatar";
import {
  fetchAgentTimeline,
  fetchGroupTimeline,
  fetchGroupMembers,
  fetchAgentDisplayNames,
  setAgentDisplayName,
  setGroupName,
  submitResponse,
  cancelRequest,
  batchRespond,
  bootstrapConversation,
  fetchMessageQueue,
  enqueueMessage,
  removeQueuedMessage,
  reorderQueuedMessage,
  getUserConfig,
  type CueRequest,
  type CueResponse,
  type AgentTimelineItem,
} from "@/lib/actions";
import { ChevronLeft, Github } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PayloadCard } from "@/components/payload-card";
import { ChatComposer } from "@/components/chat-composer";
import { Skeleton } from "@/components/ui/skeleton";

function perfEnabled(): boolean {
  try {
    return window.localStorage.getItem("cue-console:perf") === "1";
  } catch {
    return false;
  }
}

type MentionDraft = {
  userId: string;
  start: number;
  length: number;
  display: string;
};

interface ChatViewProps {
  type: "agent" | "group";
  id: string;
  name: string;
  onBack?: () => void;
}

export function ChatView({ type, id, name, onBack }: ChatViewProps) {
  const [timeline, setTimeline] = useState<AgentTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [groupTitle, setGroupTitle] = useState(name);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [images, setImages] = useState<
    { mime_type: string; base64_data: string; file_name?: string }[]
  >([]);
  const imagesRef = useRef<{ mime_type: string; base64_data: string; file_name?: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<
    { mime_type: string; base64_data: string } | null
  >(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const pendingNonPauseSeenRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const loadSeqRef = useRef(0);

  useEffect(() => {
    const onConfigUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ sound_enabled?: boolean }>;
      if (typeof e.detail?.sound_enabled === "boolean") {
        setSoundEnabled(e.detail.sound_enabled);
      }
    };
    window.addEventListener("cue-console:configUpdated", onConfigUpdated);
    return () => window.removeEventListener("cue-console:configUpdated", onConfigUpdated);
  }, []);

  const [draftMentions, setDraftMentions] = useState<MentionDraft[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActive, setMentionActive] = useState(0);
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);

  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarPickerTarget, setAvatarPickerTarget] = useState<
    | { kind: "agent"; id: string }
    | { kind: "group"; id: string }
    | null
  >(null);
  const [avatarCandidates, setAvatarCandidates] = useState<{ seed: string; url: string }[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionPopoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [composerPadPx, setComposerPadPx] = useState(36 * 4);

  const [mentionPos, setMentionPos] = useState<{ left: number; top: number } | null>(
    null
  );
  const prevMentionQueryRef = useRef<string>("");
  const prevMentionOpenRef = useRef<boolean>(false);
  const shouldAutoScrollMentionRef = useRef<boolean>(false);
  const mentionScrollTopRef = useRef<number>(0);
  const pointerInMentionRef = useRef<boolean>(false);

  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const [queue, setQueue] = useState<
    { id: string; text: string; images: { mime_type: string; base64_data: string; file_name?: string }[]; createdAt: number }[]
  >([]);

  const lastQueueFetchRef = useRef<{ key: string; at: number } | null>(null);
  const lastNamesFetchRef = useRef<{ key: string; at: number } | null>(null);

  const draftStorageKey = useMemo(() => {
    return `cue-console:draft:${type}:${id}`;
  }, [type, id]);

  const PAGE_SIZE = 30;

  const IMAGE_MAX_DIM = 1600;
  const IMAGE_COMPRESS_QUALITY = 0.82;
  const IMAGE_COMPRESS_THRESHOLD_BYTES = 1_200_000;

  const readAsDataUrl = (file: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });

  const isPauseRequest = useCallback((req: CueRequest) => {
    if (!req.payload) return false;
    try {
      const obj = JSON.parse(req.payload) as Record<string, unknown>;
      return obj?.type === "confirm" && obj?.variant === "pause";
    } catch {
      return false;
    }
  }, []);

  const playDing = useCallback(async () => {
    try {
      const Ctx = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // ignore (autoplay policy, etc.)
    }
  }, []);

  const fileToImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image load failed"));
      };
      img.src = url;
    });

  const enqueueCurrent = () => {
    const currentImages = imagesRef.current;
    if (!input.trim() && currentImages.length === 0) {
      setNotice("Enter a message to queue, or select a file.");
      return;
    }
    const qid =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const item = {
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
  };

  const removeQueued = (qid: string) => {
    void (async () => {
      const res = await removeQueuedMessage(qid);
      if (!res.success) {
        setError(res.error || "Remove failed");
        return;
      }
      await refreshQueue();
    })();
  };

  const recallQueued = (qid: string) => {
    const item = queue.find((x) => x.id === qid);
    if (!item) return;
    setInput(item.text);
    setImages(item.images);
    setDraftMentions([]);
    void (async () => {
      await removeQueuedMessage(qid);
      await refreshQueue();
    })();
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    void (async () => {
      const res = await reorderQueuedMessage(type, id, fromIndex, toIndex);
      if (!res.success) {
        setError(res.error || "Reorder failed");
        return;
      }
      await refreshQueue();
    })();
  };

  const maybeCompressImageFile = async (file: File) => {
    const inputType = (file.type || "").trim();
    const shouldTryCompress =
      file.size >= IMAGE_COMPRESS_THRESHOLD_BYTES ||
      !inputType.startsWith("image/") ||
      inputType === "image/png";

    if (!shouldTryCompress) return { blob: file as Blob, mime: inputType };

    const img = await fileToImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return { blob: file as Blob, mime: inputType };

    const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file as Blob, mime: inputType };
    ctx.drawImage(img, 0, 0, outW, outH);

    const outMime = inputType === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        outMime,
        IMAGE_COMPRESS_QUALITY
      );
    });

    if (blob.size >= file.size) return { blob: file as Blob, mime: inputType };
    return { blob, mime: outMime };
  };

  const fileToInlineImage = async (file: File) => {
    const { blob, mime } = await maybeCompressImageFile(file);
    const dataUrl = await readAsDataUrl(blob);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("invalid data url");
    const header = dataUrl.slice(0, comma);
    const base64 = dataUrl.slice(comma + 1);
    const m = /data:([^;]+);base64/i.exec(header);
    const rawMime = (m?.[1] || mime || file.type || "").trim();
    const finalMime = rawMime.startsWith("image/") ? rawMime : "image/png";
    if (!base64 || base64.length < 16) throw new Error("empty base64");
    return { mime_type: finalMime, base64_data: base64 };
  };

  const fileToInlineAttachment = async (file: File) => {
    const mime = (file.type || "").trim();
    if (mime.startsWith("image/")) {
      const img = await fileToInlineImage(file);
      return { ...img, file_name: file.name || undefined };
    }
    const dataUrl = await readAsDataUrl(file);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("invalid data url");
    const header = dataUrl.slice(0, comma);
    const base64 = dataUrl.slice(comma + 1);
    const m = /data:([^;]+);base64/i.exec(header);
    const finalMime = (m?.[1] || mime || "application/octet-stream").trim();
    if (!base64 || base64.length < 16) throw new Error("empty base64");
    return { mime_type: finalMime, base64_data: base64, file_name: file.name || undefined };
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const addAttachmentsFromFiles = useCallback(
    async (files: File[], sourceLabel: string) => {
      if (!files || files.length === 0) return;

      try {
        const failures: string[] = [];
        const converted = await Promise.all(
          files.map(async (file) => {
            try {
              return await fileToInlineAttachment(file);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              failures.push(msg || "unknown error");
              return null;
            }
          })
        );
        const next = converted.filter(Boolean) as {
          mime_type: string;
          base64_data: string;
          file_name?: string;
        }[];
        if (next.length > 0) {
          setImages((prev) => [...prev, ...next]);
          if (failures.length > 0) {
            setNotice(
              `Added ${next.length} file(s) from ${sourceLabel}; failed ${failures.length}: ${failures[0]}`
            );
          } else {
            setNotice(`Added ${next.length} file(s) from ${sourceLabel}`);
          }
        } else {
          setNotice(`Selected files but failed to parse: ${failures[0] || "unknown error"}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setNotice(msg || "Failed to add files");
      }
    },
    []
  );

  useEffect(() => {
    const el = inputWrapRef.current;
    if (!el) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (!dt) return;
      const list = Array.from(dt.files || []);
      if (list.length === 0) return;
      void addAttachmentsFromFiles(list, "drop");
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [addAttachmentsFromFiles]);

  const refreshQueue = useCallback(async () => {
    try {
      const key = `${type}:${id}`;
      const now = Date.now();
      const last = lastQueueFetchRef.current;
      if (last && last.key === key && now - last.at < 500) return;
      lastQueueFetchRef.current = { key, at: now };

      const t0 = perfEnabled() ? performance.now() : 0;
      const rows = await fetchMessageQueue(type, id);
      setQueue(rows);
      if (t0) {
        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.log(`[perf] fetchMessageQueue type=${type} id=${id} n=${rows.length} ${(t1 - t0).toFixed(1)}ms`);
      }
    } catch {
      // ignore
    }
  }, [type, id]);

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
          const obj = x as Partial<{
            id: string;
            text: string;
            images: { mime_type: string; base64_data: string; file_name?: string }[];
            createdAt: number;
          }>;
          const qid =
            typeof obj.id === "string" && obj.id
              ? obj.id
              : (globalThis.crypto && "randomUUID" in globalThis.crypto
                  ? (globalThis.crypto as Crypto).randomUUID()
                  : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
          const msg = {
            id: qid,
            text: typeof obj.text === "string" ? obj.text : "",
            images: Array.isArray(obj.images) ? obj.images : [],
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
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const obj = parsed as Partial<{
        input: string;
        images: { mime_type: string; base64_data: string }[];
        draftMentions: MentionDraft[];
      }>;
      if (typeof obj.input === "string") {
        setInput(obj.input);
      }
      if (Array.isArray(obj.images)) {
        setImages(obj.images);
        imagesRef.current = obj.images;
      }
      if (Array.isArray(obj.draftMentions)) {
        setDraftMentions(obj.draftMentions);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  useEffect(() => {
    try {
      const draft = {
        input,
        images,
        draftMentions,
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [input, images, draftMentions, draftStorageKey]);

  const titleDisplay = useMemo(() => {
    if (type === "agent") return agentNameMap[id] || id;
    return groupTitle;
  }, [agentNameMap, groupTitle, id, type]);

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

  useEffect(() => {
    if (type !== "group") return;
    setGroupTitle(name);
  }, [name, type]);

  const keyForItem = (item: AgentTimelineItem) => {
    return item.item_type === "request"
      ? `req:${item.request.request_id}`
      : `resp:${item.response.id}`;
  };

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData;
      if (!cd) return;

      const filesFromItems: File[] = [];
      for (const it of Array.from(cd.items || [])) {
        if (it.kind !== "file") continue;
        const f = it.getAsFile();
        if (!f) continue;
        filesFromItems.push(f);
      }

      // Prefer items over files.
      const files: File[] = filesFromItems.length > 0 ? filesFromItems : Array.from(cd.files || []);
      if (files.length === 0) return;

      // Prevent placeholder text insertion.
      e.preventDefault();
      void addAttachmentsFromFiles(files, "paste");
    },
    [addAttachmentsFromFiles]
  );

  const beginEditTitle = () => {
    setEditingTitle(true);
    setTitleDraft(type === "agent" ? agentNameMap[id] || id : groupTitle);
    setTimeout(() => {
      const el = document.getElementById("chat-title-input");
      if (el instanceof HTMLInputElement) el.focus();
    }, 0);
  };

  const commitEditTitle = async () => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next) return;
    if (type === "agent") {
      if (next === (agentNameMap[id] || id)) return;
      await setAgentDisplayName(id, next);
      setAgentNameMap((prev) => ({ ...prev, [id]: next }));
      window.dispatchEvent(
        new CustomEvent("cuehub:agentDisplayNameUpdated", {
          detail: { agentId: id, displayName: next },
        })
      );
      return;
    }
    if (next === groupTitle) return;
    await setGroupName(id, next);
    setGroupTitle(next);
  };

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const requestsById = useMemo(() => {
    const map = new Map<string, CueRequest>();
    for (const item of timeline) {
      if (item.item_type === "request") {
        map.set(item.request.request_id, item.request);
      }
    }
    return map;
  }, [timeline]);

  const pendingRequests = useMemo(() => {
    const list: CueRequest[] = [];
    for (const req of requestsById.values()) {
      if (req.status === "PENDING") {
        list.push(req);
      }
    }
    return list;
  }, [requestsById]);

  const mentionCandidates = useMemo(() => {
    if (type !== "group") return [];
    const q = mentionQuery.trim().toLowerCase();

    const base = members
      .filter((agentId) => {
        if (!q) return true;
        const label = (agentNameMap[agentId] || agentId).toLowerCase();
        return label.includes(q) || agentId.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const la = agentNameMap[a] || a;
        const lb = agentNameMap[b] || b;
        return la.localeCompare(lb);
      });

    const all = q.length === 0 ? ["all", ...base] : base;
    return all;
  }, [agentNameMap, members, mentionQuery, type]);

  const mentionScrollable = mentionCandidates.length > 5;

  // NOTE: agentNameMap is loaded via bootstrapConversation on switch.

  useEffect(() => {
    if (type === "agent") {
      void (async () => {
        const t0 = perfEnabled() ? performance.now() : 0;
        await ensureAvatarUrl("agent", id);
        if (t0) {
          const t1 = performance.now();
          // eslint-disable-next-line no-console
          console.log(`[perf] ensureAvatarUrl(agent) id=${id} ${(t1 - t0).toFixed(1)}ms`);
        }
      })();
      return;
    }

    // group header avatar
    void (async () => {
      const t0 = perfEnabled() ? performance.now() : 0;
      await ensureAvatarUrl("group", id);
      if (t0) {
        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.log(`[perf] ensureAvatarUrl(group) id=${id} ${(t1 - t0).toFixed(1)}ms`);
      }
    })();

    // message bubble avatars (avoid serial await; process in small batches)
    void (async () => {
      const t0 = perfEnabled() ? performance.now() : 0;
      const batchSize = 4;
      for (let i = 0; i < members.length; i += batchSize) {
        const batch = members.slice(i, i + batchSize);
        await Promise.all(batch.map((mid) => ensureAvatarUrl("agent", mid)));
      }
      if (t0) {
        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.log(`[perf] ensureAvatarUrl(group members) group=${id} n=${members.length} ${(t1 - t0).toFixed(1)}ms`);
      }
    })();
  }, [ensureAvatarUrl, id, members, type]);

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

  const closeMention = () => {
    setMentionQuery("");
    setMentionOpen(false);
    setMentionActive(0);
    setMentionPos(null);
  };

  const insertMentionAtCursor = (userId: string, name: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const text = input;

    const cursorStart = el.selectionStart ?? text.length;
    const cursorEnd = el.selectionEnd ?? cursorStart;

    const display = name === "all" ? "@all" : `@${name}`;
    const insertion = `${display} `;

    const before = text.slice(0, cursorStart);
    const after = text.slice(cursorEnd);
    const nextText = before + insertion + after;
    const delta = insertion.length - (cursorEnd - cursorStart);

    const start = cursorStart;
    const mention: MentionDraft = {
      userId,
      start,
      length: display.length,
      display,
    };

    setInput(nextText);
    setDraftMentions((prev) => {
      const shifted = shiftMentions(cursorEnd, delta, prev);
      return [...shifted, mention].sort((a, b) => a.start - b.start);
    });

    requestAnimationFrame(() => {
      const cur = textareaRef.current;
      if (!cur) return;
      const pos = start + insertion.length;
      cur.focus();
      cur.setSelectionRange(pos, pos);
    });

    closeMention();
  };

  const pasteToInput = (
    text: string,
    mode: "replace" | "append" | "upsert" = "replace"
  ) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const next = (() => {
      if (mode === "replace") return cleaned;

      if (mode === "upsert") {
        // Upsert by "<field>:" prefix (first colon defines the key)
        const colon = cleaned.indexOf(":");
        if (colon <= 0) {
          // No clear field key; fall back to append behavior
          mode = "append";
        } else {
          const key = cleaned.slice(0, colon).trim();
          if (!key) {
            mode = "append";
          } else {
            const rawLines = input.split(/\r?\n/);
            const lines = rawLines.map((s) => s.replace(/\s+$/, ""));
            const needle = key + ":";

            let replaced = false;
            const out = lines.map((line) => {
              const t = line.trimStart();
              if (!replaced && t.startsWith(needle)) {
                replaced = true;
                return cleaned;
              }
              return line;
            });

            if (!replaced) {
              const base = out.join("\n").trim() ? out.join("\n").replace(/\s+$/, "") : "";
              return base ? base + "\n" + cleaned : cleaned;
            }

            return out.join("\n");
          }
        }
      }

      if (mode !== "append") return cleaned;

      const lines = input
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = new Set(lines);
      if (exists.has(cleaned)) return input;

      const base = input.trim() ? input.replace(/\s+$/, "") : "";
      return base ? base + "\n" + cleaned : cleaned;
    })();

    setInput(next);
    setDraftMentions((prev) => reconcileMentionsByDisplay(next, prev));
    closeMention();

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const getCaretCoords = (el: HTMLTextAreaElement, pos: number) => {
    const style = window.getComputedStyle(el);
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";

    // mirror styles that affect layout
    div.style.font = style.font;
    div.style.letterSpacing = style.letterSpacing;
    div.style.textTransform = style.textTransform;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.style.boxSizing = style.boxSizing;
    div.style.lineHeight = style.lineHeight;
    div.style.width = style.width;

    const value = el.value;
    div.textContent = value.substring(0, pos);

    const span = document.createElement("span");
    span.textContent = value.substring(pos) || ".";
    div.appendChild(span);

    document.body.appendChild(div);
    const rect = span.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    document.body.removeChild(div);

    return { left: rect.left - divRect.left, top: rect.top - divRect.top };
  };

  const updateMentionPosition = () => {
    const ta = textareaRef.current;
    const wrap = inputWrapRef.current;
    if (!ta || !wrap) return;
    const cursor = ta.selectionStart ?? ta.value.length;
    const caret = getCaretCoords(ta, cursor);
    const taRect = ta.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const left = taRect.left + caret.left - wrapRect.left;
    const top = taRect.top + caret.top - wrapRect.top;
    setMentionPos({ left, top });
  };

  useEffect(() => {
    if (!mentionOpen) return;
    if (!mentionPos) return;

    requestAnimationFrame(() => {
      // clamp within container
      const wrap = inputWrapRef.current;
      const pop = mentionPopoverRef.current;
      if (!wrap || !pop) return;
      const wrapW = wrap.clientWidth;
      const wrapH = wrap.clientHeight;
      const popW = pop.offsetWidth;
      const popH = pop.offsetHeight;
      const padding = 12;
      const clampedLeft = Math.min(
        Math.max(mentionPos.left, padding),
        Math.max(padding, wrapW - popW - padding)
      );
      const clampedTop = Math.min(
        Math.max(mentionPos.top, padding),
        Math.max(padding, wrapH - popH - padding)
      );
      if (clampedLeft !== mentionPos.left || clampedTop !== mentionPos.top) {
        setMentionPos((p) =>
          p ? { ...p, left: clampedLeft, top: clampedTop } : p
        );
      }
    });
  }, [mentionOpen, mentionPos]);

  // Note: we intentionally do NOT restore scrollTop on every render.
  // This avoids "scroll jumping". We only set scrollTop when query changes.

  useEffect(() => {
    if (mentionOpen) return;
    prevMentionOpenRef.current = false;
    prevMentionQueryRef.current = "";
  }, [mentionOpen]);

  const updateMentionFromCursor = (text: string) => {
    if (type !== "group") return;
    // While the user is interacting with the mention popover (scrollbar/scroll),
    // do not recompute mention state; it can reset query/active and jump scroll.
    if (pointerInMentionRef.current) return;
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? text.length;
    const at = text.lastIndexOf("@", cursor - 1);
    if (at < 0) {
      closeMention();
      return;
    }

    const before = at === 0 ? "" : text[at - 1];
    const allowedBefore =
      at === 0 ||
      /\s/.test(before) ||
      /[\(\[\{\<\>\-—_,.，。！？!?:;；“”"'、]/.test(before);

    // avoid email/identifier like a@b
    if (!allowedBefore) {
      closeMention();
      return;
    }

    const after = text.slice(at + 1, cursor);
    if (after.includes(" ") || after.includes("\n") || after.includes("\t")) {
      closeMention();
      return;
    }

    // If nothing changed, don't touch state (prevents scroll reset / active reset)
    if (mentionOpen && mentionAtIndex === at && mentionQuery === after) {
      return;
    }

    // email heuristic: something@something.com while cursor after @ part
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text.slice(Math.max(0, at - 32), cursor + 32))) {
      closeMention();
      return;
    }

    setMentionAtIndex(at);
    setMentionQuery(after);
    setMentionOpen(true);
    setMentionActive(0);
    requestAnimationFrame(() => {
      updateMentionPosition();
    });
  };

  useEffect(() => {
    if (!mentionOpen) return;
    const el = mentionListRef.current;
    if (!el) return;

    // Reset only when opening, or when query actually changes (avoid stealing scroll)
    const queryChanged = prevMentionQueryRef.current !== mentionQuery;
    if (queryChanged) {
      // filtering should jump to the first match like WeChat
      shouldAutoScrollMentionRef.current = true;
      setMentionActive(0);
      el.scrollTop = 0;
      mentionScrollTopRef.current = 0;
    }
    prevMentionOpenRef.current = true;
    prevMentionQueryRef.current = mentionQuery;
  }, [mentionOpen, mentionQuery]);

  const shiftMentions = (from: number, delta: number, list: MentionDraft[]) => {
    return list.map((m) => {
      if (m.start >= from) return { ...m, start: m.start + delta };
      return m;
    });
  };

  const reconcileMentionsByDisplay = (text: string, list: MentionDraft[]) => {
    const used = new Set<number>();
    const next: MentionDraft[] = [];
    for (const m of list) {
      const windowStart = Math.max(0, m.start - 8);
      const windowEnd = Math.min(text.length, m.start + 32);
      const windowText = text.slice(windowStart, windowEnd);
      const localIdx = windowText.indexOf(m.display);
      let idx = -1;
      if (localIdx >= 0) idx = windowStart + localIdx;
      if (idx < 0) idx = text.indexOf(m.display);
      if (idx >= 0 && !used.has(idx)) {
        used.add(idx);
        next.push({ ...m, start: idx, length: m.display.length });
      }
    }
    next.sort((a, b) => a.start - b.start);
    return next;
  };

  const insertMention = (userId: string, name: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const text = input;
    const cursor = el.selectionStart ?? text.length;
    const at = mentionAtIndex;
    if (at === null) return;

    const display = name === "all" ? "@all" : `@${name}`;
    const insertion = `${display} `;
    const before = text.slice(0, at);
    const after = text.slice(cursor);
    const nextText = before + insertion + after;
    const delta = insertion.length - (cursor - at);

    const start = at;
    const mention: MentionDraft = {
      userId,
      start,
      length: display.length,
      display,
    };

    setInput(nextText);
    setDraftMentions((prev) => {
      const shifted = shiftMentions(cursor, delta, prev);
      return [...shifted, mention].sort((a, b) => a.start - b.start);
    });

    requestAnimationFrame(() => {
      const cur = textareaRef.current;
      if (!cur) return;
      const pos = start + insertion.length;
      cur.focus();
      cur.setSelectionRange(pos, pos);
    });

    closeMention();
  };

  const fetchPage = async (before: string | null, limit: number) => {
    if (type === "agent") {
      return fetchAgentTimeline(id, before, limit);
    }
    return fetchGroupTimeline(id, before, limit);
  };

  const loadInitial = async () => {
    const seq = ++loadSeqRef.current;
    const t0 = perfEnabled() ? performance.now() : 0;
    setBootstrapping(true);
    try {
      const res = await bootstrapConversation({ type, id, limit: PAGE_SIZE });

      if (seq !== loadSeqRef.current) return;

      setSoundEnabled(Boolean(res.config.sound_enabled));
      setMembers(res.members);
      setAgentNameMap(res.agentNameMap);
      setQueue(res.queue);

      const { items, nextCursor: cursor } = res.timeline;
      const asc = [...items].reverse();

      // Deduplicate by key to avoid duplicate React keys / duplicated items.
      const map = new Map<string, AgentTimelineItem>();
      for (const it of asc) map.set(keyForItem(it), it);
      const uniqueAsc = Array.from(map.values());

      // seed "seen" set so initial render doesn't ding
      const seed = new Set<string>();
      for (const it of uniqueAsc) {
        if (it.item_type !== "request") continue;
        if (it.request.status !== "PENDING") continue;
        if (isPauseRequest(it.request)) continue;
        seed.add(it.request.request_id);
      }
      pendingNonPauseSeenRef.current = seed;

      setTimeline(uniqueAsc);
      setNextCursor(cursor);

      if (t0) {
        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.log(`[perf] bootstrapConversation type=${type} id=${id} items=${asc.length} queue=${res.queue.length} ${(t1 - t0).toFixed(1)}ms`);
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq !== loadSeqRef.current) return;
      setBootstrapping(false);
    }
  };

  const refreshLatest = async () => {
    try {
      const { items } = await fetchPage(null, PAGE_SIZE);
      const asc = [...items].reverse();

      if (document.visibilityState === "visible" && soundEnabled) {
        const seen = pendingNonPauseSeenRef.current;
        let shouldDing = false;
        for (const it of asc) {
          if (it.item_type !== "request") continue;
          if (it.request.status !== "PENDING") continue;
          if (isPauseRequest(it.request)) continue;
          const rid = it.request.request_id;
          if (!seen.has(rid)) {
            seen.add(rid);
            shouldDing = true;
          }
        }
        if (shouldDing) {
          void playDing();
        }
      }

      setTimeline((prev) => {
        const map = new Map<string, AgentTimelineItem>();
        for (const it of prev) map.set(keyForItem(it), it);
        for (const it of asc) map.set(keyForItem(it), it);
        const toTs = (t: string) => {
          const d = new Date((t || "").replace(" ", "T"));
          const n = d.getTime();
          return Number.isFinite(n) ? n : 0;
        };
        return Array.from(map.values()).sort((a, b) => toTs(a.time) - toTs(b.time));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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

  useEffect(() => {
    setBusy(false);
    setError(null);
    setNotice(null);
    setInput("");
    setImages([]);
    imagesRef.current = [];
    setDraftMentions([]);

    setTimeline([]);
    setNextCursor(null);
    loadSeqRef.current++;
    void loadInitial();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLatest();
    };

    const interval = setInterval(tick, 3000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [type, id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 60;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setIsAtBottom(atBottom);

      // Lazy load: auto-load more when near the top
      if (
        el.scrollTop <= threshold &&
        nextCursorRef.current &&
        !loadingMoreRef.current
      ) {
        void loadMore();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [timeline, isAtBottom]);

  const loadMore = async () => {
    if (!nextCursor) return;
    if (loadingMore) return;

    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    setLoadingMore(true);
    try {
      const { items, nextCursor: cursor } = await fetchPage(nextCursor, PAGE_SIZE);
      const asc = [...items].reverse();
      setTimeline((prev) => {
        const merged = [...asc, ...prev];
        const map = new Map<string, AgentTimelineItem>();
        for (const it of merged) map.set(keyForItem(it), it);
        const toTs = (t: string) => {
          const d = new Date((t || "").replace(" ", "T"));
          const n = d.getTime();
          return Number.isFinite(n) ? n : 0;
        };
        return Array.from(map.values()).sort((a, b) => toTs(a.time) - toTs(b.time));
      });
      setNextCursor(cursor);
      requestAnimationFrame(() => {
        const cur = scrollRef.current;
        if (!cur) return;
        const newScrollHeight = cur.scrollHeight;
        cur.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async () => {
    const currentImages = imagesRef.current;
    if (!input.trim() && currentImages.length === 0) return;

    if (busy) return;
    setBusy(true);
    setError(null);

    let sent = false;

    const isPending = (r: CueRequest) => r.status === "PENDING";
    
    if (type === "agent") {
      // Direct chat: reply only to the latest pending request for this agent
      const latestPending = pendingRequests
        .filter(isPending)
        .slice()
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];

      if (latestPending) {
        const result = await submitResponse(
          latestPending.request_id,
          input,
          currentImages,
          draftMentions
        );
        if (!result.success) {
          setError(result.error || "Send failed");
          setBusy(false);
          return;
        }
        sent = true;
      }
    } else {
      // Group chat
      const mentionTargets = new Set(
        draftMentions
          .map((m) => m.userId)
          .filter((id) => id && id !== "all")
      );

      const hasMentions = mentionTargets.size > 0;

      if (hasMentions) {
        // If there are mentions, only respond to mentioned members
        const targetRequests = pendingRequests.filter(
          (r) => isPending(r) && r.agent_id && mentionTargets.has(r.agent_id)
        );
        if (targetRequests.length > 0) {
          const result = await batchRespond(
            targetRequests.map((r) => r.request_id),
            input,
            images,
            draftMentions
          );
          if (!result.success) {
            setError(result.error || "Send failed");
            setBusy(false);
            return;
          }
          sent = true;
        }
      } else {
        // Without mentions, respond to all pending
        const pendingIds = pendingRequests.filter(isPending).map((r) => r.request_id);
        if (pendingIds.length > 0) {
          const result = await batchRespond(pendingIds, input, images, draftMentions);
          if (!result.success) {
            setError(result.error || "Send failed");
            setBusy(false);
            return;
          }
          sent = true;
        }
      }
    }

    if (!sent) {
      setError("No pending requests to answer");
      setBusy(false);
      return;
    }

    setInput("");
    setImages([]);
    setDraftMentions([]);
    await refreshLatest();
    setBusy(false);
  };

  const handleSubmitConfirm = async (requestId: string, text: string, cancelled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = cancelled
      ? await cancelRequest(requestId)
      : await submitResponse(requestId, text, [], []);

    if (!result.success) {
      setError(result.error || "Send failed");
      setBusy(false);
      return;
    }

    await refreshLatest();
    setBusy(false);
  };

  const handleCancel = async (requestId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await cancelRequest(requestId);
    if (!result.success) {
      setError(result.error || "End failed");
      setBusy(false);
      return;
    }
    await refreshLatest();
    setBusy(false);
  };

  const handleReply = async (requestId: string) => {
    const currentImages = imagesRef.current;
    if (!input.trim() && currentImages.length === 0) return;
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await submitResponse(requestId, input, currentImages, draftMentions);
    if (!result.success) {
      setError(result.error || "Reply failed");
      setBusy(false);
      return;
    }
    setInput("");
    setImages([]);
    setDraftMentions([]);
    await refreshLatest();
    setBusy(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    try {
      const list = Array.from(files);
      await addAttachmentsFromFiles(list, "upload");
    } finally {
      // allow selecting the same file again
      e.target.value = "";
    }
  };

  const hasPendingRequests = pendingRequests.length > 0;
  const canSend =
    !busy &&
    hasPendingRequests &&
    (input.trim().length > 0 || images.length > 0);

  // Queue auto-consumption is handled by the global worker.

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Auto-grow up to ~8 lines; beyond that, keep it scrollable
    el.style.height = "0px";
    const maxPx = 8 * 22; // ~8 lines
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const el = inputWrapRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const bottomOffsetPx = 20; // matches ChatComposer: bottom-5
      const extraPx = 12;
      const next = Math.max(0, Math.ceil(rect.height + bottomOffsetPx + extraPx));
      setComposerPadPx(next);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parseDbTime = (dateStr: string) => new Date((dateStr || "").replace(" ", "T"));

  const formatDivider = (dateStr: string) => {
    const d = parseDbTime(dateStr);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai",
    });
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {notice && (
        <div className="pointer-events-none fixed right-5 top-5 z-50">
          <div className="rounded-2xl border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
            {notice}
          </div>
        </div>
      )}
      {/* Header */}
      <div className={cn("px-4 pt-4")}> 
        <div className={cn(
          "mx-auto flex w-full max-w-230 items-center gap-2 rounded-3xl p-3",
          "glass-surface glass-noise"
        )}>
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {type === "group" ? (
            <button
              type="button"
              className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden"
              onClick={() => openAvatarPicker({ kind: "group", id })}
              title="Change avatar"
            >
              {avatarUrlMap[`group:${id}`] ? (
                <img src={avatarUrlMap[`group:${id}`]} alt="" className="h-full w-full" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg">👥</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden"
              onClick={() => openAvatarPicker({ kind: "agent", id })}
              title="Change avatar"
            >
              {avatarUrlMap[`agent:${id}`] ? (
                <img src={avatarUrlMap[`agent:${id}`]} alt="" className="h-full w-full" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg">
                  {getAgentEmoji(id)}
                </span>
              )}
            </button>
          )}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                id="chat-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEditTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingTitle(false);
                  }
                }}
                onBlur={() => {
                  void commitEditTitle();
                }}
                className="w-60 max-w-full rounded-xl border border-white/45 bg-white/55 px-2.5 py-1.5 text-sm font-semibold outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            ) : (
              <h2
                className={cn("font-semibold", "cursor-text", "truncate")}
                onDoubleClick={beginEditTitle}
                title="Double-click to rename"
              >
                {titleDisplay}
              </h2>
            )}
            {type === "group" && members.length > 0 && (
              <p className="text-xs text-muted-foreground truncate">
                {members.length} member{members.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/nmhjklnm/cue-console"
                target="_blank"
                rel="noreferrer"
                title="https://github.com/nmhjklnm/cue-console"
              >
                <Github className="h-5 w-5" />
              </a>
            </Button>
            {type === "group" && (
              <span
                className="hidden sm:inline text-[11px] text-muted-foreground select-none mr-1"
                title="Type @ to mention members"
              >
                @ mention
              </span>
            )}
          </div>
        </div>
      {/* Messages */}
      <ScrollArea
        className={cn(
          "flex-1 min-h-0 p-2 sm:p-4",
          "bg-transparent"
        )}
        ref={scrollRef}
      >
        <div
          className="mx-auto flex w-full max-w-230 flex-col gap-6 overflow-x-hidden"
          style={{ paddingBottom: composerPadPx }}
        >
          {bootstrapping ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-center py-1">
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
              <div className="flex justify-end">
                <div className="w-[78%] space-y-2">
                  <Skeleton className="h-4 w-24 ml-auto" />
                  <Skeleton className="h-16 w-full ml-auto" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-14 w-full" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {loadingMore && (
                <div className="flex justify-center py-1">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
                    Loading...
                  </span>
                </div>
              )}
              {nextCursor && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}

              {/* Timeline: all messages sorted by time (paged) */}
              {timeline.map((item, idx) => {
                const prev = idx > 0 ? timeline[idx - 1] : null;

                const curTime = item.time;
                const prevTime = prev?.time;
                const showDivider = (() => {
                  if (!prevTime) return true;
                  const a = parseDbTime(prevTime).getTime();
                  const b = parseDbTime(curTime).getTime();
                  return b - a > 5 * 60 * 1000;
                })();

                const divider = showDivider ? (
                  <div key={`div-${curTime}-${idx}`} className="flex justify-center py-1">
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
                      {formatDivider(curTime)}
                    </span>
                  </div>
                ) : null;

                if (item.item_type === "request") {
                  const prevSameSender =
                    prev?.item_type === "request" &&
                    prev.request.agent_id === item.request.agent_id;

                  const prevWasRequest = prev?.item_type === "request";
                  const compact = prevWasRequest && prevSameSender;

                  return (
                    <div key={`wrap-req-${item.request.request_id}`} className={cn(compact ? "-mt-1" : "")}> 
                      {divider}
                      <MessageBubble
                        request={item.request}
                        showAgent={type === "group"}
                        agentNameMap={agentNameMap}
                        avatarUrlMap={avatarUrlMap}
                        showName={!prevSameSender}
                        showAvatar={!prevSameSender}
                        compact={compact}
                        disabled={busy}
                        currentInput={input}
                        isGroup={type === "group"}
                        onPasteChoice={pasteToInput}
                        onSubmitConfirm={handleSubmitConfirm}
                        onMentionAgent={(agentId) => insertMentionAtCursor(agentId, agentId)}
                        onReply={() => handleReply(item.request.request_id)}
                        onCancel={() => handleCancel(item.request.request_id)}
                      />
                    </div>
                  );
                }

                const prevIsResp = prev?.item_type === "response";
                const compactResp = prevIsResp;

                return (
                  <div key={`wrap-resp-${item.response.id}`} className={cn(compactResp ? "-mt-1" : "")}> 
                    {divider}
                    <UserResponseBubble
                      response={item.response}
                      showAvatar={!compactResp}
                      compact={compactResp}
                      onPreview={setPreviewImage}
                    />
                  </div>
                );
              })}

              {timeline.length === 0 && (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  No messages yet
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {error && (
        <div className="border-t bg-background px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ChatComposer
        type={type}
        onBack={onBack}
        busy={busy}
        canSend={canSend}
        hasPendingRequests={hasPendingRequests}
        input={input}
        setInput={setInput}
        images={images}
        setImages={setImages}
        setNotice={setNotice}
        setPreviewImage={setPreviewImage}
        handleSend={handleSend}
        enqueueCurrent={enqueueCurrent}
        queue={queue}
        removeQueued={removeQueued}
        recallQueued={recallQueued}
        reorderQueue={reorderQueue}
        handlePaste={handlePaste}
        handleImageUpload={handleFileUpload}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        inputWrapRef={inputWrapRef}
        mentionOpen={mentionOpen}
        mentionPos={mentionPos}
        mentionCandidates={mentionCandidates}
        mentionActive={mentionActive}
        setMentionActive={setMentionActive}
        mentionScrollable={mentionScrollable}
        mentionPopoverRef={mentionPopoverRef}
        mentionListRef={mentionListRef}
        pointerInMentionRef={pointerInMentionRef}
        mentionScrollTopRef={mentionScrollTopRef}
        closeMention={closeMention}
        insertMention={insertMention}
        updateMentionFromCursor={updateMentionFromCursor}
        draftMentions={draftMentions}
        setDraftMentions={setDraftMentions}
        agentNameMap={agentNameMap}
        setAgentNameMap={setAgentNameMap}
      />

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl glass-surface glass-noise">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewImage ? (
            <div className="flex items-center justify-center">
              {((img) => (
                <img
                  src={`data:${img.mime_type};base64,${img.base64_data}`}
                  alt=""
                  className="max-h-[70vh] rounded-lg"
                />
              ))(previewImage!)}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="max-w-lg glass-surface glass-noise">
          <DialogHeader>
            <DialogTitle>Avatar</DialogTitle>
          </DialogHeader>
          {avatarPickerTarget ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {((target) => {
                  const key = `${target.kind}:${target.id}`;
                  return (
                    <div className="h-14 w-14 rounded-full bg-muted overflow-hidden">
                      {avatarUrlMap[key] ? (
                        <img src={avatarUrlMap[key]} alt="" className="h-full w-full" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl">
                          {target.kind === "group" ? "👥" : getAgentEmoji(id)}
                        </div>
                      )}
                    </div>
                  );
                })(avatarPickerTarget!)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{titleDisplay}</p>
                  <p className="text-xs text-muted-foreground truncate">Click a thumb to apply</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const s = randomSeed();
                    const target = avatarPickerTarget!;
                    await setTargetAvatarSeed(target.kind, target.id, s);
                    // refresh candidate grid
                    void openAvatarPicker(target);
                  }}
                >
                  Random
                </Button>
              </div>

              <div className="max-h-52 overflow-y-auto pr-1">
                <div className="grid grid-cols-5 gap-2">
                {avatarCandidates.map((c) => (
                  <button
                    key={c.seed}
                    type="button"
                    className="h-12 w-12 rounded-full bg-muted overflow-hidden hover:ring-2 hover:ring-ring/40"
                    onClick={async () => {
                      const target = avatarPickerTarget!;
                      await setTargetAvatarSeed(
                        target.kind,
                        target.id,
                        c.seed
                      );
                      setAvatarPickerOpen(false);
                    }}
                    title="Apply"
                  >
                    {c.url ? <img src={c.url} alt="" className="h-full w-full" /> : null}
                  </button>
                ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({
  request,
  showAgent,
  agentNameMap,
  avatarUrlMap,
  isHistory,
  showName,
  showAvatar,
  compact,
  disabled,
  currentInput,
  isGroup,
  onPasteChoice,
  onSubmitConfirm,
  onMentionAgent,
  onReply,
  onCancel,
}: {
  request: CueRequest;
  showAgent?: boolean;
  agentNameMap?: Record<string, string>;
  avatarUrlMap?: Record<string, string>;
  isHistory?: boolean;
  showName?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
  disabled?: boolean;
  currentInput?: string;
  isGroup?: boolean;
  onPasteChoice?: (text: string, mode?: "replace" | "append" | "upsert") => void;
  onSubmitConfirm?: (requestId: string, text: string, cancelled: boolean) => void | Promise<void>;
  onMentionAgent?: (agentId: string) => void;
  onReply?: () => void;
  onCancel?: () => void;
}) {
  const isPending = request.status === "PENDING";

  const isPause = useMemo(() => {
    if (!request.payload) return false;
    try {
      const obj = JSON.parse(request.payload) as Record<string, unknown>;
      return obj?.type === "confirm" && obj?.variant === "pause";
    } catch {
      return false;
    }
  }, [request.payload]);

  const selectedLines = useMemo(() => {
    const text = (currentInput || "").trim();
    if (!text) return new Set<string>();
    return new Set(
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }, [currentInput]);

  const rawId = request.agent_id || "";
  const displayName = (agentNameMap && rawId ? agentNameMap[rawId] || rawId : rawId) || "";
  const cardMaxWidth = (showAvatar ?? true) ? "calc(100% - 3rem)" : "100%";
  const avatarUrl = rawId && avatarUrlMap ? avatarUrlMap[`agent:${rawId}`] : "";

  return (
    <div
      className={cn(
        "flex max-w-full min-w-0 items-start gap-3",
        compact && "gap-2",
        isHistory && "opacity-60"
      )}
    >
      {(showAvatar ?? true) ? (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg",
            isGroup && request.agent_id && onMentionAgent && "cursor-pointer"
          )}
          title={
            isGroup && request.agent_id && onMentionAgent
              ? "Double-click avatar to @mention"
              : undefined
          }
          onDoubleClick={() => {
            if (!isGroup) return;
            const agentId = request.agent_id;
            if (!agentId) return;
            onMentionAgent?.(agentId);
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full rounded-full" />
          ) : (
            getAgentEmoji(request.agent_id || "")
          )}
        </span>
      ) : (
        <span className="h-9 w-9 shrink-0" />
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        {(showName ?? true) && (showAgent || displayName) && (
          <p className="mb-1 text-xs text-muted-foreground truncate">{displayName}</p>
        )}
        <div
          className={cn(
            "rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 overflow-hidden",
            "glass-surface-soft glass-noise",
            isPending ? "ring-1 ring-ring/25" : "ring-1 ring-white/25"
          )}
          style={{ clipPath: "inset(0 round 1rem)", maxWidth: cardMaxWidth }}
        >
          <div className="text-sm wrap-anywhere overflow-hidden min-w-0">
            <MarkdownRenderer>{request.prompt || ""}</MarkdownRenderer>
          </div>
          <PayloadCard
            raw={request.payload}
            disabled={disabled}
            onPasteChoice={onPasteChoice}
            onSubmitConfirm={(text, cancelled) =>
              isPending ? onSubmitConfirm?.(request.request_id, text, cancelled) : undefined
            }
            selectedLines={selectedLines}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{formatFullTime(request.created_at || "")}</span>
          {isPending && (
            <>
              <Badge variant="outline" className="text-xs shrink-0">
                Waiting {getWaitingDuration(request.created_at || "")}
              </Badge>
              {!isPause && (
                <>
                  <Badge variant="default" className="text-xs shrink-0">
                    Pending
                  </Badge>
                  {onReply && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={onReply}
                      disabled={disabled}
                    >
                      Reply
                    </Button>
                  )}
                  {onCancel && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-destructive"
                      onClick={onCancel}
                      disabled={disabled}
                    >
                      End
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {request.status === "COMPLETED" && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Replied
            </Badge>
          )}
          {request.status === "CANCELLED" && (
            <Badge variant="destructive" className="text-xs shrink-0">
              Ended
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function UserResponseBubble({
  response,
  showAvatar = true,
  compact = false,
  onPreview,
}: {
  response: CueResponse;
  showAvatar?: boolean;
  compact?: boolean;
  onPreview?: (img: { mime_type: string; base64_data: string }) => void;
}) {
  const parsed = JSON.parse(response.response_json || "{}") as {
    text?: string;
    mentions?: { userId: string; start: number; length: number; display: string }[];
  };

  const files = Array.isArray((response as any).files) ? ((response as any).files as any[]) : [];
  const imageFiles = files.filter((f) => {
    const mime = String(f?.mime_type || "");
    return mime.startsWith("image/") && typeof f?.inline_base64 === "string" && f.inline_base64.length > 0;
  });
  const otherFiles = files.filter((f) => {
    const mime = String(f?.mime_type || "");
    return !mime.startsWith("image/");
  });

  const renderTextWithMentions = (
    text: string,
    mentions?: { start: number; length: number }[]
  ) => {
    if (!mentions || mentions.length === 0) return text;
    const safe = [...mentions]
      .filter((m) => m.start >= 0 && m.length > 0 && m.start + m.length <= text.length)
      .sort((a, b) => a.start - b.start);

    const nodes: ReactNode[] = [];
    let cursor = 0;
    for (const m of safe) {
      if (m.start < cursor) continue;
      if (m.start > cursor) {
        nodes.push(text.slice(cursor, m.start));
      }
      const seg = text.slice(m.start, m.start + m.length);
      nodes.push(
        <span key={`m-${m.start}`} className="text-emerald-900/90 dark:text-emerald-950 font-semibold">
          {seg}
        </span>
      );
      cursor = m.start + m.length;
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
  };
  
  if (response.cancelled) {
    return (
      <div className="flex justify-end gap-3 max-w-full min-w-0">
        <div
          className="rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 sm:max-w-215 sm:flex-none sm:w-fit overflow-hidden glass-surface-soft glass-noise ring-1 ring-white/25"
          style={{
            clipPath: "inset(0 round 1rem)",
            maxWidth: showAvatar ? "calc(100% - 3rem)" : "100%",
          }}
        >
          <p className="text-sm text-muted-foreground italic">Conversation ended</p>
          <p className="text-xs text-muted-foreground mt-1">{formatFullTime(response.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex justify-end gap-3 max-w-full min-w-0", compact && "gap-2")}>
      <div
        className="rounded-3xl p-3 sm:p-4 max-w-full flex-1 basis-0 min-w-0 sm:max-w-215 sm:flex-none sm:w-fit overflow-hidden glass-surface-soft glass-noise ring-1 ring-white/25"
        style={{
          clipPath: "inset(0 round 1rem)",
          maxWidth: showAvatar ? "calc(100% - 3rem)" : "100%",
        }}
      >
        {parsed.text && (
          <div className="text-sm wrap-anywhere overflow-hidden min-w-0">
            {parsed.mentions && parsed.mentions.length > 0 ? (
              <p className="whitespace-pre-wrap">
                {renderTextWithMentions(parsed.text, parsed.mentions)}
              </p>
            ) : (
              <MarkdownRenderer>{parsed.text}</MarkdownRenderer>
            )}
          </div>
        )}
        {imageFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 max-w-full">
            {imageFiles.map((f, i) => {
              const mime = String(f?.mime_type || "image/png");
              const b64 = String(f?.inline_base64 || "");
              const img = { mime_type: mime, base64_data: b64 };
              return (
                <img
                  key={i}
                  src={`data:${img.mime_type};base64,${img.base64_data}`}
                  alt=""
                  className="max-h-32 max-w-full h-auto rounded cursor-pointer"
                  onClick={() => onPreview?.(img)}
                />
              );
            })}
          </div>
        )}

        {otherFiles.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 max-w-full">
            {otherFiles.map((f, i) => {
              const fileRef = String(f?.file || "");
              const name = fileRef.split("/").filter(Boolean).pop() || fileRef || "file";
              return (
                <div
                  key={i}
                  className="px-2 py-1 rounded-lg bg-white/40 dark:bg-black/20 ring-1 ring-border/40 text-xs text-foreground/80 truncate"
                  title={fileRef}
                >
                  {name}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs opacity-70 mt-1 text-right">{formatFullTime(response.created_at)}</p>
      </div>
      {showAvatar ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
          👤
        </span>
      ) : (
        <span className="h-9 w-9 shrink-0" />
      )}
    </div>
  );
}
