"use client";

import { GlassButton } from "@/components/ui/glass-button";
import { GlassModal } from "@/components/ui/glass-modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen — be specific, this guards real money records. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app replacement for window.confirm — native dialogs look out of place and
 * are suppressed in some mobile/PWA contexts, which would silently skip the guard.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <GlassModal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted leading-relaxed">{message}</p>
      <div className="flex gap-3 mt-5">
        <GlassButton className="flex-1" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </GlassButton>
        <GlassButton
          className="flex-1"
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </GlassButton>
      </div>
    </GlassModal>
  );
}
