import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

interface UIStateContextValue {
  busy: boolean;
  error: string | null;
  notice: string | null;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function useUIStateContext() {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error("useUIStateContext must be used within UIStateProvider");
  }
  return context;
}

interface UIStateProviderProps {
  children: ReactNode;
}

export function UIStateProvider({ children }: UIStateProviderProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Memoize to prevent unnecessary re-renders
  // Note: setState functions are stable and don't need to be in deps
  const value = useMemo<UIStateContextValue>(
    () => ({
      busy,
      error,
      notice,
      setBusy,
      setError,
      setNotice,
    }),
    [busy, error, notice]
  );

  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}
