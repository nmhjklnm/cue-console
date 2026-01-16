"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getUserConfig, type UserConfig } from "@/lib/actions";

const defaultConfig: UserConfig = {
  sound_enabled: true,
  conversation_mode_default: "agent",
  chat_mode_append_text: "只做分析，不要对代码/文件做任何改动。",
  pending_request_timeout_ms: 10 * 60 * 1000,
};

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
  const [config, setConfig] = useState<UserConfig>(defaultConfig);

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
  }, [config.pending_request_timeout_ms, config.chat_mode_append_text]);

  const value = useMemo<ConfigContextValue>(() => ({ config }), [config]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
