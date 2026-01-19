"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getUserConfig, type UserConfig } from "@/lib/actions";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config";

type ConfigContextValue = {
  config: UserConfig;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return ctx;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<UserConfig>(DEFAULT_USER_CONFIG);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getUserConfig();
        if (cancelled) return;
        setConfig(cfg);
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onConfigUpdated = (evt: Event) => {
      const e = evt as CustomEvent<Partial<UserConfig>>;
      const next = e.detail;
      if (!next || typeof next !== "object") return;
      setConfig((prev) => ({ ...prev, ...next }));
    };
    window.addEventListener("cue-console:configUpdated", onConfigUpdated);
    return () => window.removeEventListener("cue-console:configUpdated", onConfigUpdated);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "cue-console:pending_request_timeout_ms",
        String(config.pending_request_timeout_ms)
      );
    } catch {
    }
    try {
      window.localStorage.setItem(
        "cue-console:chat_mode_append_text",
        String(config.chat_mode_append_text)
      );
    } catch {
    }
    try {
      window.localStorage.setItem(
        "cue-console:bot_mode_enabled",
        config.bot_mode_enabled ? "1" : "0"
      );
    } catch {
    }
    try {
      window.localStorage.setItem(
        "cue-console:bot_mode_reply_text",
        String(config.bot_mode_reply_text || "")
      );
    } catch {
    }
  }, [
    config.pending_request_timeout_ms,
    config.chat_mode_append_text,
    config.bot_mode_enabled,
    config.bot_mode_reply_text,
  ]);

  const value = useMemo<ConfigContextValue>(() => ({ config }), [config]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
