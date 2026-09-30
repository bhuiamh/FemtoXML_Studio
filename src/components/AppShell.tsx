import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileCode2,
  GitCompareArrows,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Radio,
  Route,
  Sun,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme, type ThemeChoice } from "../theme";
import { BrandMark } from "./BrandMark";
import { cx } from "./ui";

export type ViewMode = "comparison" | "matrix" | "neighbour" | "dynamic" | "editor";

type NavItem = {
  id: ViewMode;
  label: string;
  icon: LucideIcon;
  group: string;
  blurb: string;
};

/** Grouped by what the engineer is trying to do, not by when it was built. */
export const NAV: NavItem[] = [
  {
    id: "comparison",
    label: "Comparison",
    icon: GitCompareArrows,
    group: "Analyse",
    blurb: "Diff two device XMLs parameter by parameter",
  },
  {
    id: "matrix",
    label: "Site Compare",
    icon: Columns3,
    group: "Analyse",
    blurb: "Every parameter across every site, mismatches highlighted",
  },
  {
    id: "neighbour",
    label: "Neighbour Excel",
    icon: Radio,
    group: "Export",
    blurb: "LTE neighbour list per device, with eNodeB / Cell ID split",
  },
  {
    id: "dynamic",
    label: "Dynamic Excel",
    icon: Route,
    group: "Export",
    blurb: "Any TR-069 path and everything below it, as tables",
  },
  {
    id: "editor",
    label: "XML Editor",
    icon: FileCode2,
    group: "Edit",
    blurb: "Edit the parameter tree, or apply changes in bulk from Excel",
  },
];

const THEME_OPTIONS: { value: ThemeChoice; icon: LucideIcon; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const { choice, setChoice, toggle } = useTheme();

  if (collapsed) {
    const Icon = THEME_OPTIONS.find((o) => o.value === choice)?.icon ?? Monitor;
    return (
      <button
        type="button"
        onClick={toggle}
        title={`Theme: ${choice}`}
        className="grid h-9 w-full place-items-center rounded-lg text-rail-ink/80 transition hover:bg-white/10 hover:text-white"
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="flex rounded-lg bg-white/5 p-0.5" role="group" aria-label="Theme">
      {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setChoice(value)}
          aria-pressed={choice === value}
          title={label}
          className={cx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition",
            choice === value
              ? "bg-white/15 text-white"
              : "text-rail-ink/60 hover:text-rail-ink",
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
          {label}
        </button>
      ))}
    </div>
  );
}

function RailContent({
  current,
  onSelect,
  collapsed,
  onToggleCollapse,
  onSignOut,
  counts,
}: {
  current: ViewMode;
  onSelect: (id: ViewMode) => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onSignOut: () => void;
  counts: Partial<Record<ViewMode, number>>;
}) {
  let lastGroup = "";

  return (
    <div className="dot-field flex h-full flex-col gap-5 bg-rail px-2.5 py-3.5 text-rail-ink">
      <div className="flex items-center gap-2.5 px-1.5">
        <BrandMark className="h-8 w-8" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight text-white">
              FemtoXML Studio
            </div>
            <div className="truncate text-[10.5px] text-rail-dim">RAN configuration toolkit</div>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="Modules">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const count = counts[item.id];

          return (
            <div key={item.id}>
              {showGroup && (
                <div
                  className={cx(
                    "px-2.5 pb-1.5 pt-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-rail-dim",
                    collapsed && "text-center",
                  )}
                >
                  {collapsed ? "···" : item.group}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : item.blurb}
                className={cx(
                  "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-gradient-to-r from-accent/25 to-accent/5 text-white"
                    : "text-rail-ink hover:bg-white/[.07]",
                )}
              >
                {isActive && (
                  <span className="absolute -left-2.5 bottom-2 top-2 w-[3px] rounded-r bg-accent" />
                )}
                <Icon
                  className={cx("h-[17px] w-[17px] shrink-0", isActive ? "text-accent" : "opacity-80")}
                  strokeWidth={1.8}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && count !== undefined && count > 0 && (
                  <span className="ml-auto font-mono text-[10.5px] text-rail-dim">{count}</span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-white/10 pt-3">
        <ThemeSwitch collapsed={collapsed} />

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-rail-ink/80 transition hover:bg-white/[.07] hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                Collapse
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onSignOut}
          className={cx(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-rail-ink/80 transition hover:bg-white/[.07] hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  current,
  onSelect,
  onSignOut,
  counts = {},
  actions,
  children,
}: {
  current: ViewMode;
  onSelect: (id: ViewMode) => void;
  onSignOut: () => void;
  counts?: Partial<Record<ViewMode, number>>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = NAV.find((n) => n.id === current);

  // Close the mobile drawer whenever the module changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [current]);

  return (
    <div className="flex min-h-full">
      {/* Fixed rail on desktop */}
      <aside
        className={cx(
          "sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 md:block",
          collapsed ? "w-[68px]" : "w-[236px]",
        )}
      >
        <RailContent
          current={current}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onSignOut={onSignOut}
          counts={counts}
        />
      </aside>

      {/* Drawer on small screens */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[250px] shadow-pop">
            <RailContent
              current={current}
              onSelect={onSelect}
              collapsed={false}
              onSignOut={onSignOut}
              counts={counts}
            />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="absolute right-3 top-3 rounded-lg bg-surface p-2 text-ink-2 shadow-card"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-1.5 text-ink-2 transition hover:bg-surface-sunk md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.9} />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-[14.5px] font-semibold tracking-tight text-ink">
              {active?.label ?? "FemtoXML Studio"}
            </h1>
            <p className="hidden truncate text-[11.5px] text-ink-3 sm:block">{active?.blurb}</p>
          </div>

          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>

        <main className="flex-1 px-4 py-5">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        <footer className="border-t border-line px-4 py-4 text-center text-[11.5px] text-ink-3">
          FemtoXML Studio · XML comparator, editor and Excel exporter for RAN engineers ·{" "}
          <a
            href="https://www.linkedin.com/in/bhuiamh/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink-2 underline decoration-line underline-offset-2 transition hover:text-accent-ink"
          >
            Mahmudul Hasan Bhuia
          </a>
        </footer>
      </div>
    </div>
  );
}
