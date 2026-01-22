import { useState, useEffect, useCallback, useRef, type RefObject } from "react";

interface UseScrollManagementProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  timeline: unknown[];
  bootstrapping: boolean;
  id: string;
  loadMore: () => Promise<void>;
  nextCursor: string | null;
  loadingMore: boolean;
}

export function useScrollManagement({
  scrollRef,
  timeline,
  bootstrapping,
  id,
  loadMore,
  nextCursor,
  loadingMore,
}: UseScrollManagementProps) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: instant ? "instant" : "auto" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 60;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setIsAtBottom(atBottom);

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
  }, [loadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [timeline, isAtBottom, scrollRef]);

  useEffect(() => {
    if (bootstrapping) return;
    if (timeline.length === 0) return;
    requestAnimationFrame(() => {
      scrollToBottom(true);
      setIsAtBottom(true);
    });
  }, [id, bootstrapping, scrollToBottom]);

  return {
    isAtBottom,
    scrollToBottom,
  };
}
