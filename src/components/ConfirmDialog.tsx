"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState(options);
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
          onClick={() => handleResolve(false)}
        >
          <div
            className="bg-bg-primary border border-border rounded-lg w-[400px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                {state.title}
              </h3>
              <p className="text-sm text-text-secondary">{state.message}</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => handleResolve(false)}
                className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border rounded hover:border-border-light transition-colors"
                autoFocus
              >
                {state.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => handleResolve(true)}
                className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                  state.variant === "danger"
                    ? "bg-error/90 text-white hover:bg-error"
                    : "bg-accent text-bg-primary hover:bg-accent-hover"
                }`}
              >
                {state.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
