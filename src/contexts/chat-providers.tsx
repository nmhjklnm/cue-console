import type { ReactNode } from "react";
import { InputProvider } from "./input-context";
import { UIStateProvider } from "./ui-state-context";

interface ChatProvidersProps {
  children: ReactNode;
}

/**
 * Combined providers for chat functionality.
 * Separates high-frequency updates (input) from low-frequency updates (UI state)
 * to optimize rendering performance.
 */
export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <UIStateProvider>
      <InputProvider>{children}</InputProvider>
    </UIStateProvider>
  );
}
