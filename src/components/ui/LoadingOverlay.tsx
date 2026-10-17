/**
 * Full-screen loading modal: the page dims behind it and the loader sits on
 * top, so a long parse or export clearly owns the screen and nothing
 * half-updated can be clicked while it runs.
 *
 * Rendered into document.body so no module's own stacking context or
 * `overflow: hidden` can clip it.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader, type LoaderVariant } from "./Loader";

export type LoadingState = {
  title: string;
  /** Second line, e.g. the file currently being read. */
  detail?: string;
  /** 0–100 when the work has countable steps; omit for indeterminate. */
  percent?: number;
};

export function LoadingOverlay({
  state,
  variant,
}: {
  /** null closes the overlay. */
  state: LoadingState | null;
  variant?: LoaderVariant;
}) {
  const open = state !== null;

  // Hold the page still behind the modal, and put the scrollbar's width back
  // so the layout underneath does not jump as it appears.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  // Swallow keystrokes that would otherwise reach the page behind the modal.
  useEffect(() => {
    if (!open) return;
    const stop = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", stop, true);
    return () => document.removeEventListener("keydown", stop, true);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const percent =
    state.percent === undefined
      ? undefined
      : Math.min(100, Math.max(0, Math.round(state.percent)));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-scrim/70 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex w-full max-w-xs animate-fade-up flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-7 text-center shadow-pop">
        <Loader size="lg" variant={variant} />

        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-semibold text-ink">{state.title}</p>
          {state.detail && (
            <p className="break-words font-mono text-[11px] leading-relaxed text-ink-3">
              {state.detail}
            </p>
          )}
        </div>

        {percent !== undefined && (
          <div className="w-full space-y-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tabular-nums text-ink-3">{percent}%</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Convenience for the common "step n of total" detail line. */
export function stepDetail(index: number, total: number, label: ReactNode): string {
  return `file ${index} of ${total} · ${String(label)}`;
}
