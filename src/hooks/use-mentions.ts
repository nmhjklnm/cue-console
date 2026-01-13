"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";

export type MentionDraft = {
  userId: string;
  start: number;
  length: number;
  display: string;
};

export function useMentions({
  type,
  input,
  setInput,
  members,
  agentNameMap,
  textareaRef,
  inputWrapRef,
}: {
  type: "agent" | "group";
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  members: string[];
  agentNameMap: Record<string, string>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  inputWrapRef: RefObject<HTMLDivElement | null>;
}) {
  const [draftMentions, setDraftMentions] = useState<MentionDraft[]>([]);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActive, _setMentionActive] = useState(0);
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);
  const [mentionPos, setMentionPos] = useState<{ left: number; top: number } | null>(null);

  const prevMentionQueryRef = useRef<string>("");
  const prevMentionOpenRef = useRef<boolean>(false);
  const shouldAutoScrollMentionRef = useRef<boolean>(false);
  const mentionScrollTopRef = useRef<number>(0);
  const pointerInMentionRef = useRef<boolean>(false);

  const mentionListRef = useRef<HTMLDivElement | null>(null);
  const mentionPopoverRef = useRef<HTMLDivElement | null>(null);

  const caretMirrorRef = useRef<HTMLDivElement | null>(null);
  const caretMirrorTextRef = useRef<Text | null>(null);
  const caretMirrorSpanRef = useRef<HTMLSpanElement | null>(null);

  const setMentionActive = useCallback((v: number) => {
    _setMentionActive(v);
  }, []);

  const closeMention = useCallback(() => {
    setMentionQuery("");
    setMentionOpen(false);
    setMentionActive(0);
    setMentionPos(null);
  }, [setMentionActive]);

  const mentionCandidates = useMemo(() => {
    if (type !== "group") return [] as string[];
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

  const shiftMentions = useCallback((from: number, delta: number, list: MentionDraft[]) => {
    return list.map((m) => {
      if (m.start >= from) return { ...m, start: m.start + delta };
      return m;
    });
  }, []);

  const reconcileMentionsByDisplay = useCallback((text: string, list: MentionDraft[]) => {
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
  }, []);

  const insertMentionAtCursor = useCallback(
    (userId: string, name: string) => {
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
    },
    [closeMention, input, setInput, shiftMentions, textareaRef]
  );

  const getCaretCoords = useCallback((el: HTMLTextAreaElement, pos: number) => {
    const style = window.getComputedStyle(el);

    let div = caretMirrorRef.current;
    let textNode = caretMirrorTextRef.current;
    let span = caretMirrorSpanRef.current;

    if (!div) {
      div = document.createElement("div");
      div.style.position = "absolute";
      div.style.left = "-10000px";
      div.style.top = "-10000px";
      div.style.visibility = "hidden";
      div.style.whiteSpace = "pre-wrap";
      div.style.wordWrap = "break-word";
      div.style.pointerEvents = "none";

      textNode = document.createTextNode("");
      span = document.createElement("span");
      div.appendChild(textNode);
      div.appendChild(span);
      document.body.appendChild(div);

      caretMirrorRef.current = div;
      caretMirrorTextRef.current = textNode;
      caretMirrorSpanRef.current = span;
    }

    div.style.font = style.font;
    div.style.letterSpacing = style.letterSpacing;
    div.style.textTransform = style.textTransform;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.style.boxSizing = style.boxSizing;
    div.style.lineHeight = style.lineHeight;
    div.style.width = style.width;

    const value = el.value;
    (textNode as Text).nodeValue = value.substring(0, pos);
    (span as HTMLSpanElement).textContent = value.substring(pos) || ".";

    const rect = (span as HTMLSpanElement).getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    return { left: rect.left - divRect.left, top: rect.top - divRect.top };
  }, []);

  useEffect(() => {
    return () => {
      const div = caretMirrorRef.current;
      if (div && div.parentNode) div.parentNode.removeChild(div);
      caretMirrorRef.current = null;
      caretMirrorTextRef.current = null;
      caretMirrorSpanRef.current = null;
    };
  }, []);

  const updateMentionPosition = useCallback(() => {
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
  }, [getCaretCoords, inputWrapRef, textareaRef]);

  useEffect(() => {
    if (!mentionOpen) return;
    if (!mentionPos) return;

    requestAnimationFrame(() => {
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
        setMentionPos((p) => (p ? { ...p, left: clampedLeft, top: clampedTop } : p));
      }
    });
  }, [inputWrapRef, mentionOpen, mentionPos]);

  useEffect(() => {
    if (mentionOpen) return;
    prevMentionOpenRef.current = false;
    prevMentionQueryRef.current = "";
  }, [mentionOpen]);

  const updateMentionFromCursor = useCallback(
    (text: string) => {
      if (type !== "group") return;
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

      if (!allowedBefore) {
        closeMention();
        return;
      }

      const after = text.slice(at + 1, cursor);
      if (after.includes(" ") || after.includes("\n") || after.includes("\t")) {
        closeMention();
        return;
      }

      if (mentionOpen && mentionAtIndex === at && mentionQuery === after) {
        return;
      }

      if (/([\w.+-]+@[\w-]+\.[\w.-]+)/.test(text.slice(Math.max(0, at - 32), cursor + 32))) {
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
    },
    [closeMention, mentionAtIndex, mentionOpen, mentionQuery, setMentionActive, textareaRef, type, updateMentionPosition]
  );

  useEffect(() => {
    if (!mentionOpen) return;
    const el = mentionListRef.current;
    if (!el) return;

    const queryChanged = prevMentionQueryRef.current !== mentionQuery;
    if (queryChanged) {
      shouldAutoScrollMentionRef.current = true;
      setMentionActive(0);
      el.scrollTop = 0;
      mentionScrollTopRef.current = 0;
    }
    prevMentionOpenRef.current = true;
    prevMentionQueryRef.current = mentionQuery;
  }, [mentionOpen, mentionQuery, setMentionActive]);

  const insertMention = useCallback(
    (userId: string, name: string) => {
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
    },
    [closeMention, input, mentionAtIndex, setInput, shiftMentions, textareaRef]
  );

  return {
    draftMentions,
    setDraftMentions,

    mentionOpen,
    mentionPos,
    mentionCandidates,
    mentionActive,
    setMentionActive,
    mentionScrollable,

    mentionPopoverRef,
    mentionListRef,
    pointerInMentionRef,
    mentionScrollTopRef,

    closeMention,
    insertMention,
    insertMentionAtCursor,
    updateMentionFromCursor,

    reconcileMentionsByDisplay,

    // Useful for consumers that want to keep some state in sync
    mentionQuery,
    mentionAtIndex,
    setMentionAtIndex,
    setMentionQuery,
    setMentionOpen,

    shouldAutoScrollMentionRef,
  };
}
