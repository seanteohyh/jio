"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * UX review log #5 — a shared, lightweight success-feedback system.
 * Toasts queue, they don't stack: only one shows at a time, so two quick
 * actions each get their own full moment rather than piling up. Wired into
 * ~7 actions (start a Jio, save/remove a place, RSVP, leave a group), plus
 * one deliberate exception: the vote that happens to close a Jio suppresses
 * its own "Vote counted" toast, since #25's full-screen celebration already
 * acknowledges that action — firing both would stack two acknowledgments
 * on one tap.
 */
interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

const DISPLAY_MS = 2600;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ id: number; message: string } | null>(
    null
  );
  const queue = useRef<string[]>([]);
  const nextId = useRef(0);
  const timer = useRef<number | null>(null);

  const advance = useCallback(() => {
    const next = queue.current.shift();
    if (next === undefined) {
      setCurrent(null);
      timer.current = null;
      return;
    }
    const id = nextId.current++;
    setCurrent({ id, message: next });
    timer.current = window.setTimeout(advance, DISPLAY_MS);
  }, []);

  const showToast = useCallback(
    (message: string) => {
      queue.current.push(message);
      if (!timer.current) advance();
    },
    [advance]
  );

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6 md:left-64 md:right-4"
      >
        {current && (
          <div
            key={current.id}
            className="animate-fade-in bg-espresso pointer-events-auto max-w-sm rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-sm)]"
          >
            {current.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).showToast;
}
