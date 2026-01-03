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
  fetchAgentTimeline,
  fetchGroupTimeline,
  fetchGroupMembers,
  fetchAgentDisplayNames,
  setAgentDisplayName,
  setGroupName,
  submitResponse,
  cancelRequest,
  batchRespond,
  type CueRequest,
  type CueResponse,
  type AgentTimelineItem,
} from "@/lib/actions";
import { ChevronLeft } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PayloadCard } from "@/components/payload-card";
import { ChatComposer } from "@/components/chat-composer";

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
  const [images, setImages] = useState<
    { mime_type: string; base64_data: string }[]
  >([]);
  const imagesRef = useRef<{ mime_type: string; base64_data: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<
    { mime_type: string; base64_data: string } | null
  >(null);

  const [draftMentions, setDraftMentions] = useState<MentionDraft[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActive, setMentionActive] = useState(0);
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionPopoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const titleDisplay = useMemo(() => {
    if (type === "agent") return agentNameMap[id] || id;
    return groupTitle;
  }, [agentNameMap, groupTitle, id, type]);

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

      const imageFilesFromItems: File[] = [];
      for (const it of Array.from(cd.items || [])) {
        if (it.kind !== "file") continue;
        const f = it.getAsFile();
        if (!f) continue;
        const itemType = (it.type || "").trim();
        const fileType = (f.type || "").trim();
        const isImage =
          (itemType && itemType.startsWith("image/")) ||
          (fileType && fileType.startsWith("image/"));
        if (isImage) imageFilesFromItems.push(f);
      }

      // Prefer items over files. Some environments expose the same image in both,
      // and the metadata differs enough that naive dedupe fails.
      const imageFiles: File[] =
        imageFilesFromItems.length > 0
          ? imageFilesFromItems
          : Array.from(cd.files || []).filter((f) => (f?.type || "").startsWith("image/"));

      if (imageFiles.length === 0) {
        setNotice("未检测到可粘贴的图片（请确认剪贴板里是图片）");
        return;
      }

      // If images are present, treat this paste as an image attach.
      // Prevent unexpected text insertion (some browsers may paste placeholder text).
      e.preventDefault();

      try {
        const nextImages: { mime_type: string; base64_data: string }[] = [];
        const failures: string[] = [];
        const seen = new Set<string>();

        const fingerprint = (img: { mime_type: string; base64_data: string }) => {
          const head = img.base64_data.slice(0, 64);
          return `${img.mime_type}|${img.base64_data.length}|${head}`;
        };

        for (const f of imageFiles) {
          try {
            const img = await fileToInlineImage(f);
            const key = fingerprint(img);
            if (seen.has(key)) continue;
            seen.add(key);
            nextImages.push(img);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failures.push(msg || "unknown error");
          }
        }

        if (nextImages.length > 0) {
          setImages((prev) => [...prev, ...nextImages]);
          if (failures.length > 0) {
            setNotice(
              `已添加 ${nextImages.length} 张图片（来自粘贴），失败 ${failures.length} 张：${failures[0]}`
            );
          } else {
            setNotice(`已添加 ${nextImages.length} 张图片（来自粘贴）`);
          }
        } else {
          setNotice(`检测到图片但解析失败：${failures[0] || "unknown error"}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setNotice(`读取剪贴板图片失败：${msg || "unknown error"}`);
      }
    },
    [fileToInlineImage]
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

  useEffect(() => {
    const loadNames = async () => {
      try {
        const ids = type === "group" ? Array.from(new Set([id, ...members])) : [id];
        const map = await fetchAgentDisplayNames(ids);
        setAgentNameMap(map);
      } catch {
        // ignore
      }
    };

    void loadNames();
  }, [id, members, type]);

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

    const display = name === "all" ? "@所有人" : `@${name}`;
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

  const pasteToInput = (text: string, mode: "replace" | "append" = "replace") => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const next = (() => {
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

    const display = name === "all" ? "@所有人" : `@${name}`;
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
    try {
      if (type === "group") {
        const mems = await fetchGroupMembers(id);
        setMembers(mems);
      }
      const { items, nextCursor: cursor } = await fetchPage(null, PAGE_SIZE);
      const asc = [...items].reverse();
      setTimeline(asc);
      setNextCursor(cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshLatest = async () => {
    try {
      const { items } = await fetchPage(null, PAGE_SIZE);
      const asc = [...items].reverse();
      setTimeline((prev) => {
        const map = new Map<string, AgentTimelineItem>();
        for (const it of prev) map.set(keyForItem(it), it);
        for (const it of asc) map.set(keyForItem(it), it);
        return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    loadInitial();

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

      // 懒加载：接近顶部时自动加载更多
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
        return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
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
      // 单聊模式：回复该 agent 所有待处理请求
      const pendingIds = pendingRequests.filter(isPending).map((r) => r.request_id);
      if (pendingIds.length > 0) {
        const result = await batchRespond(pendingIds, input, currentImages, draftMentions);
        if (!result.success) {
          setError(result.error || "发送失败");
          setBusy(false);
          return;
        }
        sent = true;
      }
    } else {
      // 群聊模式
      const mentionTargets = new Set(
        draftMentions
          .map((m) => m.userId)
          .filter((u) => u && u !== "all")
      );

      const hasMentions = mentionTargets.size > 0;

      if (hasMentions) {
        // 有 mention 则只回复被 @ 的成员
        const targetRequests = pendingRequests.filter(
          (r) => isPending(r) && r.agent_id && mentionTargets.has(r.agent_id)
        );
        if (targetRequests.length > 0) {
          const result = await batchRespond(
            targetRequests.map((r) => r.request_id),
            input,
            currentImages,
            draftMentions
          );
          if (!result.success) {
            setError(result.error || "发送失败");
            setBusy(false);
            return;
          }
          sent = true;
        }
      } else {
        // 无 @ 则回复所有待处理
        const pendingIds = pendingRequests.filter(isPending).map((r) => r.request_id);
        if (pendingIds.length > 0) {
          const result = await batchRespond(pendingIds, input, images, draftMentions);
          if (!result.success) {
            setError(result.error || "发送失败");
            setBusy(false);
            return;
          }
          sent = true;
        }
      }
    }

    if (!sent) {
      setError("没有待回复的请求");
      setBusy(false);
      return;
    }

    setInput("");
    setImages([]);
    setDraftMentions([]);
    await refreshLatest();
    setBusy(false);
  };

  const handleCancel = async (requestId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await cancelRequest(requestId);
    if (!result.success) {
      setError(result.error || "结束失败");
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
      setError(result.error || "回复失败");
      setBusy(false);
      return;
    }
    setInput("");
    setImages([]);
    setDraftMentions([]);
    await refreshLatest();
    setBusy(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    try {
      const list = Array.from(files);
      const failures: string[] = [];
      const converted = await Promise.all(
        list.map(async (file) => {
          try {
            return await fileToInlineImage(file);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failures.push(msg || "unknown error");
            return null;
          }
        })
      );
      const next = converted.filter(Boolean) as { mime_type: string; base64_data: string }[];
      if (next.length > 0) {
        setImages((prev) => [...prev, ...next]);
        if (failures.length > 0) {
          setNotice(`已添加 ${next.length} 张图片，失败 ${failures.length} 张：${failures[0]}`);
        } else {
          setNotice(`已添加 ${next.length} 张图片`);
        }
      } else {
        setNotice(`选择了图片但解析失败：${failures[0] || "unknown error"}`);
      }
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

  const formatDivider = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
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
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 glass-surface-soft glass-noise">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <span className="text-2xl">
          {type === "group" ? "👥" : getAgentEmoji(id)}
        </span>
        <div className="flex-1">
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
              className={cn("font-semibold", "cursor-text")}
              onDoubleClick={beginEditTitle}
              title="双击修改名称"
            >
              {titleDisplay}
            </h2>
          )}
          {type === "group" && members.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {members.length} 位成员
            </p>
          )}
        </div>
        {type === "group" && (
          <span className="hidden sm:inline text-[11px] text-muted-foreground select-none mr-1" title="输入 @ 可提及成员">
            @ 提及
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea
        className={cn(
          "flex-1 min-h-0 p-2 sm:p-4",
          "bg-transparent"
        )}
        ref={scrollRef}
      >
        <div className="mx-auto flex w-full max-w-230 flex-col gap-6 pb-36 overflow-x-hidden">
          {loadingMore && (
            <div className="flex justify-center py-1">
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
                加载中...
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
                {loadingMore ? "加载中..." : "加载更多"}
              </Button>
            </div>
          )}

          {/* Timeline: 所有消息按时间排序（分页） */}
          {timeline.map((item, idx) => {
            const prev = idx > 0 ? timeline[idx - 1] : null;

            const curTime = item.time;
            const prevTime = prev?.time;
            const showDivider = (() => {
              if (!prevTime) return true;
              const a = new Date(prevTime + "Z").getTime();
              const b = new Date(curTime + "Z").getTime();
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
                    showName={!prevSameSender}
                    showAvatar={!prevSameSender}
                    compact={compact}
                    disabled={busy}
                    currentInput={input}
                    isGroup={type === "group"}
                    onPasteChoice={pasteToInput}
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
              暂无消息
            </div>
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
        handlePaste={handlePaste}
        handleImageUpload={handleImageUpload}
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
            <DialogTitle>预览</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="flex items-center justify-center">
              <img
                src={`data:${previewImage.mime_type};base64,${previewImage.base64_data}`}
                alt=""
                className="max-h-[70vh] rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({
  request,
  showAgent,
  agentNameMap,
  isHistory,
  showName,
  showAvatar,
  compact,
  disabled,
  currentInput,
  isGroup,
  onPasteChoice,
  onMentionAgent,
  onReply,
  onCancel,
}: {
  request: CueRequest;
  showAgent?: boolean;
  agentNameMap?: Record<string, string>;
  isHistory?: boolean;
  showName?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
  disabled?: boolean;
  currentInput?: string;
  isGroup?: boolean;
  onPasteChoice?: (text: string, mode?: "replace" | "append") => void;
  onMentionAgent?: (agentId: string) => void;
  onReply?: () => void;
  onCancel?: () => void;
}) {
  const isPending = request.status === "PENDING";

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
              ? "双击头像 @TA"
              : undefined
          }
          onDoubleClick={() => {
            if (!isGroup) return;
            const agentId = request.agent_id;
            if (!agentId) return;
            onMentionAgent?.(agentId);
          }}
        >
          {getAgentEmoji(request.agent_id || "")}
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
            selectedLines={selectedLines}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{formatFullTime(request.created_at || "")}</span>
          {isPending && (
            <>
              <Badge variant="default" className="text-xs shrink-0">
                待回复
              </Badge>
              <Badge variant="outline" className="text-xs shrink-0">
                等待 {getWaitingDuration(request.created_at || "")}
              </Badge>
              {onReply && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={onReply}
                  disabled={disabled}
                >
                  回复
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
                  结束
                </Button>
              )}
            </>
          )}
          {request.status === "COMPLETED" && (
            <Badge variant="secondary" className="text-xs shrink-0">
              已回复
            </Badge>
          )}
          {request.status === "CANCELLED" && (
            <Badge variant="destructive" className="text-xs shrink-0">
              已结束
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
    images?: { mime_type: string; base64_data: string }[];
    mentions?: { userId: string; start: number; length: number; display: string }[];
  };

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
          <p className="text-sm text-muted-foreground italic">对话已结束</p>
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
          <p className="whitespace-pre-wrap text-sm wrap-anywhere">
            {renderTextWithMentions(parsed.text, parsed.mentions)}
          </p>
        )}
        {parsed.images && parsed.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 max-w-full">
            {parsed.images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mime_type};base64,${img.base64_data}`}
                alt=""
                className="max-h-32 max-w-full h-auto rounded cursor-pointer"
                onClick={() => onPreview?.(img)}
              />
            ))}
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
