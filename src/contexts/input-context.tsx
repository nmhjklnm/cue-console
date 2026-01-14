import { createContext, useContext, useState, type ReactNode } from "react";
import type { ImageAttachment } from "@/types/chat";

interface InputContextValue {
  input: string;
  images: ImageAttachment[];
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
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

  const value: InputContextValue = {
    input,
    images,
    setInput,
    setImages,
  };

  return <InputContext.Provider value={value}>{children}</InputContext.Provider>;
}
