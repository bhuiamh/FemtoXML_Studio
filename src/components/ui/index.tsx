/**
 * Shared UI primitives. Every module composes its screen from these, so
 * controls, surfaces, tables and messages behave identically across the app
 * and a theme change is handled entirely by the tokens behind them.
 *
 * House rules baked in: controls are 36px tall (`h-9`) with `rounded-lg`,
 * surfaces are `rounded-xl` cards on the page ground, numbers are tabular.
 */
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Info,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cx } from "./cx";
import { Spinner } from "./Loader";

export { cx } from "./cx";
export {
  Loader,
  LoadingPanel,
  SkeletonRows,
  Spinner,
  DEFAULT_LOADER,
  type LoaderVariant,
} from "./Loader";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "danger";
export type ButtonSize = "sm" | "md";

const BTN_BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed";

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accent-deep text-white shadow-sm hover:brightness-110 active:brightness-95 disabled:from-line disabled:to-line disabled:text-ink-3 disabled:shadow-none",
  secondary:
    "border border-line bg-surface text-ink-2 shadow-sm hover:border-accent hover:text-accent-ink active:bg-surface-sunk disabled:border-line-soft disabled:bg-surface-sunk disabled:text-ink-3 disabled:shadow-none",
  ghost:
    "text-ink-2 hover:bg-surface-sunk hover:text-ink active:bg-line-soft disabled:text-ink-3 disabled:hover:bg-transparent",
  success:
    "bg-ok text-white shadow-sm hover:brightness-110 active:brightness-95 disabled:bg-line disabled:text-ink-3 disabled:shadow-none",
  danger:
    "border border-bad/40 bg-surface text-bad shadow-sm hover:bg-bad-soft disabled:border-line-soft disabled:text-ink-3 disabled:shadow-none",
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-[13px]",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className)}
      {...rest}
    >
      {loading ? <Spinner /> : Icon ? <Icon className="h-4 w-4" strokeWidth={1.9} /> : null}
      {children}
    </button>
  );
}

/** A button that opens the file picker; `onFiles` receives the selection. */
export function FileButton({
  onFiles,
  accept = ".xml",
  multiple = false,
  variant = "primary",
  size = "md",
  icon: Icon = Upload,
  children,
}: {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <label className={cx(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], "cursor-pointer")}>
      <Icon className="h-4 w-4" strokeWidth={1.9} />
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  as: As = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div";
}) {
  return (
    <As className={cx("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>
        {description && <div className="mt-0.5 text-xs text-ink-3">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Page-level intro block at the top of a module. */
export function PageIntro({
  description,
  actions,
  children,
}: {
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card as="div">
      {(description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          {description && (
            <p className="max-w-4xl text-[13px] leading-relaxed text-ink-2">{description}</p>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

/** Control strip inside a card. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-end gap-3 border-t border-line bg-surface-sunk px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "bad" | "warn" | "ok";
}) {
  const valueTone =
    tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="min-w-[112px] rounded-lg border border-line bg-surface px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-3">{label}</div>
      <div className={cx("mt-0.5 text-xl font-semibold tabular-nums tracking-tight", valueTone)}>
        {value}
      </div>
      {detail && <div className="text-[11px] text-ink-3">{detail}</div>}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "bad";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunk text-ink-3 ring-1 ring-inset ring-line",
  accent: "bg-accent-soft text-accent-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn text-white",
  bad: "bg-bad text-white",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TableShell({
  children,
  maxHeight = "max-h-96",
  className,
}: {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div className={cx("overflow-auto", maxHeight, className)}>
      <table className="w-full border-collapse text-left text-xs tabular-nums">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap border-b border-line bg-surface-sunk px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cx("whitespace-nowrap border-b border-line-soft px-2.5 py-1.5 text-ink-2", className)}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const INPUT_BASE =
  "w-full rounded-lg border border-line bg-surface px-3 text-ink shadow-sm outline-none transition placeholder:text-ink-3/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-surface-sunk disabled:text-ink-3";

type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
  inputSize?: ButtonSize;
};

export function TextInput({ mono, inputSize = "md", className, ...rest }: TextInputProps) {
  return (
    <input
      type="text"
      spellCheck={false}
      className={cx(
        INPUT_BASE,
        inputSize === "sm" ? "h-8 text-xs" : "h-9 text-[13px]",
        mono && "font-mono text-xs",
        className,
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      spellCheck={false}
      className={cx(INPUT_BASE, "resize-y py-2 font-mono text-xs leading-relaxed", className)}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-3">{label}</span>
      {children}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink-2">
      <span
        className={cx(
          "grid h-[15px] w-[15px] shrink-0 place-items-center rounded border transition-colors",
          checked ? "border-accent bg-accent" : "border-line bg-surface",
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-sunk p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            value === option.value
              ? "bg-surface text-accent-ink shadow-sm"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type AlertTone = "danger" | "warning" | "info";

const ALERT_TONES: Record<AlertTone, { wrap: string; Icon: LucideIcon }> = {
  danger: { wrap: "border-bad/35 bg-bad-soft text-bad", Icon: AlertTriangle },
  warning: { wrap: "border-warn/35 bg-warn-soft text-warn", Icon: AlertTriangle },
  info: { wrap: "border-accent/30 bg-accent-soft text-accent-ink", Icon: Info },
};

export function Alert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { wrap, Icon } = ALERT_TONES[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-4 py-3 text-[13px]", wrap, className)} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: ReactNode }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-ink-3">{clamped}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function Dropzone({
  onFiles,
  title,
  hint,
  accept = ".xml",
  multiple = true,
  compact = false,
}: {
  onFiles: (files: FileList) => void;
  title: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  compact?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      className={cx(
        "cursor-pointer rounded-xl border-2 border-dashed text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        compact ? "px-4 py-4" : "dot-field px-6 py-12",
        isDragging
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:border-accent/60 hover:bg-accent-soft/40",
      )}
    >
      {!compact && <Upload className="mx-auto mb-3 h-7 w-7 text-ink-3" strokeWidth={1.6} />}
      <p className={cx("font-semibold", compact ? "text-xs text-ink-3" : "text-[13px] text-ink-2")}>
        {title}
      </p>
      {hint && !compact && <div className="mx-auto mt-1.5 max-w-xl text-xs text-ink-3">{hint}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {Icon && <Icon className="h-7 w-7 text-ink-3" strokeWidth={1.6} />}
      <p className="text-[13px] font-semibold text-ink-2">{title}</p>
      {description && <div className="max-w-md text-xs leading-relaxed text-ink-3">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Monospace inline code for paths and tag names. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-sunk px-1 py-0.5 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-line">
      {children}
    </code>
  );
}
