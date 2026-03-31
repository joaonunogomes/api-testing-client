"use client";

import { ConfirmProvider } from "./ConfirmDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
