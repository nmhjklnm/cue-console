"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "@/contexts/config-context";

export function Providers({ children }: { children: ReactNode }) {
  return <ConfigProvider>{children}</ConfigProvider>;
}
