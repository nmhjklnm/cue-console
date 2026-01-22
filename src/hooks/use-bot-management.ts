import { useState, useEffect, useRef, useCallback } from "react";
import { processBotTick, fetchBotEnabled, updateBotEnabled } from "@/lib/actions";
import type { ChatType } from "@/types/chat";

interface UseBotManagementProps {
  type: ChatType;
  id: string;
  refreshLatest: () => Promise<void>;
  setNotice: (notice: string | null) => void;
}

export function useBotManagement({
  type,
  id,
  refreshLatest,
  setNotice,
}: UseBotManagementProps) {
  const [botEnabled, setBotEnabled] = useState(false);
  const [botLoaded, setBotLoaded] = useState(false);
  const [botLoadError, setBotLoadError] = useState<string | null>(null);

  const botHolderIdRef = useRef<string>(
    (() => {
      try {
        return globalThis.crypto?.randomUUID?.() || `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      } catch {
        return `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    })()
  );
  const botTickBusyRef = useRef(false);
  const currentConvRef = useRef({ type, id });

  const triggerBotTickOnce = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    if (botTickBusyRef.current) return;
    botTickBusyRef.current = true;
    try {
      const res = await processBotTick({
        holderId: botHolderIdRef.current,
        convType: type,
        convId: id,
        limit: 80,
      });
      if (!res.success) {
        setNotice(`Bot tick failed: ${res.error}`);
        return;
      }
      if (!res.acquired) {
        setNotice("Bot is busy in another window");
        return;
      }
      if (res.replied === 0) {
        setNotice("Bot is enabled (no pending to reply)");
        return;
      }
      if (res.replied > 0) {
        await refreshLatest();
      }
    } catch {
    } finally {
      botTickBusyRef.current = false;
    }
  }, [id, refreshLatest, setNotice, type]);

  const toggleBot = useCallback(async (): Promise<boolean> => {
    if (!botLoaded) {
      setNotice("Bot status is still loading");
      return botEnabled;
    }
    const prev = botEnabled;
    const next = !prev;
    try {
      await updateBotEnabled(type, id, next);
      setBotEnabled(next);
      setBotLoadError(null);
      if (next) void triggerBotTickOnce();
      return next;
    } catch {
      setBotEnabled(prev);
      setNotice("Failed to toggle bot");
      return prev;
    }
  }, [botEnabled, botLoaded, id, setNotice, triggerBotTickOnce, type]);

  useEffect(() => {
    let cancelled = false;
    currentConvRef.current = { type, id };
    
    setBotEnabled(false);
    setBotLoaded(false);
    setBotLoadError(null);
    botTickBusyRef.current = false;
    
    void (async () => {
      try {
        const res = await fetchBotEnabled(type, id);
        if (cancelled || currentConvRef.current.type !== type || currentConvRef.current.id !== id) return;
        setBotEnabled(Boolean(res.enabled));
        setBotLoaded(true);
        setBotLoadError(null);
      } catch {
        if (cancelled || currentConvRef.current.type !== type || currentConvRef.current.id !== id) return;
        setBotEnabled(false);
        setBotLoaded(true);
        setBotLoadError("Failed to sync bot state");
        setNotice("Failed to sync bot state (may still be enabled in background)");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type, setNotice]);

  useEffect(() => {
    if (!botLoaded) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetchBotEnabled(type, id);
        if (cancelled || currentConvRef.current.type !== type || currentConvRef.current.id !== id) return;
        const next = Boolean(res.enabled);
        setBotEnabled(next);
        setBotLoadError(null);
      } catch {
        if (cancelled || currentConvRef.current.type !== type || currentConvRef.current.id !== id) return;
        setBotLoadError("Failed to sync bot state");
      }
    };

    const interval = setInterval(() => void tick(), 5000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [botLoaded, id, type]);

  useEffect(() => {
    if (!botEnabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      if (botTickBusyRef.current) return;
      botTickBusyRef.current = true;
      try {
        const res = await processBotTick({
          holderId: botHolderIdRef.current,
          convType: type,
          convId: id,
          limit: 80,
        });
        if (cancelled) return;
        if (!res.success) {
          setNotice(`Bot tick failed: ${res.error}`);
          return;
        }
        if (!res.acquired) return;
        if (res.replied > 0) {
          await refreshLatest();
        }
      } catch {
      } finally {
        botTickBusyRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [botEnabled, id, refreshLatest, setNotice, type]);

  return {
    botEnabled,
    botLoaded,
    botLoadError,
    toggleBot,
    triggerBotTickOnce,
  };
}
