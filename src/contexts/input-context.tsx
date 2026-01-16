"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ImageAttachment } from "@/types/chat";

type ConversationMode = "chat" | "agent";

interface InputContextValue {
  input: string;
  images: ImageAttachment[];
  conversationMode: ConversationMode;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  setConversationMode: (mode: ConversationMode) => void;
}

const InputContext = createContext<InputContextValue | null>(null);

export function useInputContext() {
  const context = useContext(InputContext);
  if (!context) {
    throw new Error("useInputContext must be used within InputProvider");
  }
  return context;
}

interface InputProviderProps {
  children: ReactNode;
}

export function InputProvider({ children }: InputProviderProps) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [conversationMode, setConversationModeState] = useState<ConversationMode>(() => {
    try {
      const last = window.localStorage.getItem("cue-console:conversationMode");
      if (last === "agent" || last === "chat") return last;
      const def = window.localStorage.getItem("cue-console:conversationModeDefault");
      return def === "agent" || def === "chat" ? def : "agent";
    } catch {
      return "agent";
    }
  });

  const setConversationMode = (mode: ConversationMode) => {
    setConversationModeState(mode);
    try {
      window.localStorage.setItem("cue-console:conversationMode", mode);
    } catch {
    }
  };

  const value: InputContextValue = {
    input,
    images,
    conversationMode,
    setInput,
    setImages,
    setConversationMode,
  };

  return <InputContext.Provider value={value}>{children}</InputContext.Provider>;
}
