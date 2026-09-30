/**
 * Loading indicators.
 *
 * Three variants were prototyped; `DEFAULT_LOADER` picks the one the app uses,
 * so switching the whole product is a one-line change here. All are pure
 * CSS/SVG and stop animating under `prefers-reduced-motion` (handled globally
 * in index.css).
 */
import { cx } from "./cx";

export type LoaderVariant = "bloom" | "radar" | "spectrum";

/** The house loader. Change this to re-skin every loading state at once. */
export const DEFAULT_LOADER: LoaderVariant = "bloom";

const SIZES = { sm: 28, md: 56, lg: 92 } as const;
export type LoaderSize = keyof typeof SIZES;

/** A cell radiating rings with two nodes in orbit. */
function Bloom({ px }: { px: number }) {
  const hub = Math.max(8, Math.round(px * 0.24));
  const dot = Math.max(3, Math.round(px * 0.076));
  return (
    <span className="relative block" style={{ width: px, height: px }}>
      {[0, 0.55, 1.1].map((delay) => (
        <span
          key={delay}
          className="absolute inset-0 animate-bloom rounded-full border-[1.5px] border-accent opacity-0"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
      <span
        className="absolute animate-radar-spin"
        style={{ inset: 0, animationDuration: "3.4s" }}
      >
        <span
          className="absolute left-1/2 rounded-full bg-accent-deep"
          style={{ top: -dot / 2, width: dot, height: dot, marginLeft: -dot / 2 }}
        />
      </span>
      <span
        className="absolute animate-radar-spin"
        style={{ inset: 0, animationDuration: "5s", animationDirection: "reverse" }}
      >
        <span
          className="absolute left-1/2 rounded-full bg-accent/70"
          style={{ bottom: -dot / 2, width: dot, height: dot, marginLeft: -dot / 2 }}
        />
      </span>
      <span
        className="absolute left-1/2 top-1/2 animate-hub-pulse bg-gradient-to-br from-accent to-accent-deep"
        style={{
          width: hub,
          height: hub,
          marginLeft: -hub / 2,
          marginTop: -hub / 2,
          borderRadius: Math.max(3, hub * 0.3),
        }}
      />
    </span>
  );
}

/** A beam sweeping over range rings, with returns blipping in. */
function Radar({ px }: { px: number }) {
  const core = Math.max(5, Math.round(px * 0.1));
  const blip = Math.max(3, Math.round(px * 0.055));
  return (
    <span className="relative block" style={{ width: px, height: px }}>
      <span className="absolute inset-0 rounded-full border border-line" />
      <span className="absolute rounded-full border border-line" style={{ inset: px * 0.17 }} />
      <span className="absolute rounded-full border border-line" style={{ inset: px * 0.35 }} />
      <span
        className="absolute inset-0 animate-radar-spin rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgb(var(--accent) / .55), transparent 62%)",
          WebkitMask: "radial-gradient(circle, transparent 12%, #000 13%)",
          mask: "radial-gradient(circle, transparent 12%, #000 13%)",
        }}
      />
      {[
        { left: "68%", top: "30%", delay: "0.25s" },
        { left: "30%", top: "62%", delay: "1.1s" },
      ].map((b) => (
        <span
          key={b.delay}
          className="absolute animate-radar-blip rounded-full bg-accent-deep"
          style={{ left: b.left, top: b.top, width: blip, height: blip, animationDelay: b.delay }}
        />
      ))}
      <span
        className="absolute left-1/2 top-1/2 rounded-full bg-accent"
        style={{
          width: core,
          height: core,
          marginLeft: -core / 2,
          marginTop: -core / 2,
          boxShadow: "0 0 0 4px rgb(var(--accent) / .22)",
        }}
      />
    </span>
  );
}

/** Staggered bars easing like a live spectrum analyser. */
function Spectrum({ px }: { px: number }) {
  const heights = [32, 62, 92, 54, 76, 40];
  const barW = Math.max(3, Math.round(px * 0.1));
  return (
    <span
      className="flex items-end"
      style={{ height: px * 0.78, gap: Math.max(2, barW * 0.66) }}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className="animate-bars origin-bottom rounded-t bg-gradient-to-b from-accent to-accent-deep"
          style={{ width: barW, height: `${h}%`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </span>
  );
}

export function Loader({
  variant = DEFAULT_LOADER,
  size = "md",
  className,
}: {
  variant?: LoaderVariant;
  size?: LoaderSize;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span className={cx("inline-grid place-items-center", className)} role="status" aria-label="Loading">
      {variant === "radar" ? (
        <Radar px={px} />
      ) : variant === "spectrum" ? (
        <Spectrum px={px} />
      ) : (
        <Bloom px={px} />
      )}
    </span>
  );
}

/** Small spinner for inside buttons, where a full loader would be too much. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block animate-radar-spin rounded-full border-2 border-current border-t-transparent opacity-70",
        className ?? "h-3.5 w-3.5",
      )}
      aria-hidden="true"
    />
  );
}

/** Full-panel loading state with a message and optional determinate progress. */
export function LoadingPanel({
  title,
  detail,
  percent,
  variant,
}: {
  title: string;
  detail?: string;
  percent?: number;
  variant?: LoaderVariant;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <Loader size="lg" variant={variant} />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {detail && <p className="font-mono text-xs text-ink-3">{detail}</p>}
      </div>
      {percent !== undefined && (
        <div className="h-1 w-56 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Placeholder rows shown while a table's data is still being built. */
export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line-soft">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <span
              key={c}
              className="relative h-3 overflow-hidden rounded bg-line-soft"
              style={{ flex: c === 0 ? 3 : 1 }}
            >
              <span
                className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface to-transparent"
                style={{ animationDelay: `${(r * cols + c) * 0.05}s` }}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
