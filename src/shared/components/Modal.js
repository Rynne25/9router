"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/utils/cn";
import { playHudSound } from "@/shared/utils/hudAudio";
import Button from "./Button";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  showTrafficLights = true,
  className,
}) {
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    full: "max-w-6xl",
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm fade-in"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* Modal content */}
      <div
        className={cn(
          "relative w-full bg-surface/95 backdrop-blur-2xl",
          "border border-cyan-500/25",
          "rounded-xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6),0_0_32px_-8px_rgba(6,182,212,0.22)]",
          "fade-in",
          sizes[size] || sizes.md,
          className
        )}
      >
        {/* Subtle HUD corner brackets */}
        <span
          className="pointer-events-none absolute top-1.5 left-1.5 size-2.5 border-t border-l border-cyan-400/50 rounded-tl-[2px]"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute bottom-1.5 right-1.5 size-2.5 border-b border-r border-cyan-400/50 rounded-br-[2px]"
          aria-hidden="true"
        />

        {/* Header */}
        {(title || showTrafficLights) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-cyan-500/15">
            <div className="flex items-center gap-2 min-w-0">
              {showTrafficLights && (
                <span
                  className="size-2 rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.75)] shrink-0"
                  aria-hidden="true"
                />
              )}
              {title && (
                <h2 className="text-base font-semibold text-text-main tracking-tight truncate">
                  {title}
                </h2>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                playHudSound("click");
                onClose();
              }}
              aria-label="Close"
              className="p-1 rounded-lg text-text-muted hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors shrink-0 ml-2"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[calc(85vh-100px)] overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-cyan-500/15">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-text-muted">{message}</p>
    </Modal>
  );
}
