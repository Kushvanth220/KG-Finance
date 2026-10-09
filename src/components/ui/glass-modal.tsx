"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  /**
   * The body sizes itself to the panel and does its own scrolling (a stack,
   * a long list): the panel takes a fixed height and stops scrolling itself.
   */
  fill?: boolean;
}

export function GlassModal({ open, onClose, title, children, className, fill }: GlassModalProps) {
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    // SmoothScroll (Lenis) takes every wheel event on the page and scrolls
    // the window — so on a desktop the page behind an open dialog moved while
    // the dialog stood still. Inside a dialog the browser scrolls natively.
    <div data-lenis-prevent className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="glass-modal-title"
        className={cn(
          "relative z-[81] w-full max-w-md rounded-3xl",
          fill ? "flex h-[86dvh] flex-col overflow-hidden p-4 sm:p-5" : "p-6 max-h-[85dvh] overflow-y-auto",
          // The panel's colour is a variable so what sits on it (the account
          // stack's fading pile) can match it in both themes.
          "[--modal-surface:#f4f8ff] dark:[--modal-surface:#03195b] bg-[var(--modal-surface)]",
          "text-[#03195b] dark:text-[#cbe9fd]",
          "border border-black/10 dark:border-white/15 shadow-2xl",
          className
        )}
      >
        <div className={cn("flex shrink-0 items-center justify-between", fill ? "mb-3" : "mb-5")}>
          <h2 id="glass-modal-title" className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="tap-icon focus-ring p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
