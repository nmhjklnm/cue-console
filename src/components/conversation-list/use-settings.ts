import { useState, useEffect } from "react";
import { getUserConfig, setUserConfig } from "@/lib/actions";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config";

export function useSettings() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [conversationModeDefault, setConversationModeDefault] = useState<"chat" | "agent">("agent");
  const [chatModeAppendText, setChatModeAppendText] = useState("只做分析，不要对代码/文件做任何改动。");
  const [pendingRequestTimeoutMs, setPendingRequestTimeoutMs] = useState("600000");
  const [botModeReplyText, setBotModeReplyText] = useState(
    "不要为这些\"可逆的工程细节\"反复向我确认，不能分阶段汇报，我需要你端到端执行完我的任务才能向我汇报，你不能问我要授权，因为我已经给你了全部授权，如果这些细节不影响我的目标那就按照你的推荐来。你有执行一切的权利。"
  );
  const [agentGroupingMode, setAgentGroupingMode] = useState<"default" | "by_project">("default");

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getUserConfig();
        setSoundEnabled(Boolean(cfg.sound_enabled));
        const nextMode = cfg.conversation_mode_default === "chat" ? "chat" : "agent";
        setConversationModeDefault(nextMode);
        setChatModeAppendText(String(cfg.chat_mode_append_text || DEFAULT_USER_CONFIG.chat_mode_append_text));
        setPendingRequestTimeoutMs(String(cfg.pending_request_timeout_ms ?? 600000));
        setBotModeReplyText(
          String(
            cfg.bot_mode_reply_text || DEFAULT_USER_CONFIG.bot_mode_reply_text
          )
        );
        setAgentGroupingMode(cfg.agent_grouping_mode || "default");
        try {
          window.localStorage.setItem("cue-console:conversationModeDefault", nextMode);
        } catch {
        }
      } catch {
      }
    })();
  }, []);

  const saveSettings = async () => {
    await setUserConfig({
      sound_enabled: soundEnabled,
      conversation_mode_default: conversationModeDefault,
      chat_mode_append_text: chatModeAppendText,
      pending_request_timeout_ms: Number(pendingRequestTimeoutMs),
      bot_mode_reply_text: botModeReplyText,
      agent_grouping_mode: agentGroupingMode,
    });
    setSettingsOpen(false);
  };

  return {
    settingsOpen,
    setSettingsOpen,
    soundEnabled,
    setSoundEnabled,
    conversationModeDefault,
    setConversationModeDefault,
    chatModeAppendText,
    setChatModeAppendText,
    pendingRequestTimeoutMs,
    setPendingRequestTimeoutMs,
    botModeReplyText,
    setBotModeReplyText,
    agentGroupingMode,
    setAgentGroupingMode,
    saveSettings,
  };
}
