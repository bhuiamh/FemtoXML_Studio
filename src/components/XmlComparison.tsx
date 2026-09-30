import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Diff } from "../workers/xmlDiffWorker";
import { exportToCSV, exportToExcel } from "../utils/export";
import { Loader, Spinner } from "./ui";

type ChangeKind = "added" | "removed" | "changed";
type Stats = Record<ChangeKind, number>;
type Progress = {
  percent: number;
  message?: string;
  phase?: "left" | "right" | "diff";
} | null;
type QuickFilterKey = "FaultMgmt" | "NeighborList" | "NeighborListInUse";

const sampleLeft = `<device>
  <name>Femto A</name>
  <version>1.0.0</version>
  <config>
    <band>n78</band>
    <power unit="dBm">20</power>
  </config>
</device>`;

const sampleRight = `<device>
  <name>Femto A</name>
  <version>1.1.0</version>
  <config>
    <band>n77</band>
    <power unit="dBm">23</power>
    <sync enabled="true" />
  </config>
</device>`;

function formatValue(value?: string) {
  if (value === undefined) return "—";
  if (value === "") return "(empty)";
  return value;
}

function extractValueFromXml(xmlString: string, path: string): string | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      return null;
    }
    
    // Parse path like "Device[1].IPsec[1].Profile[1].i1[1].X_2C7AF4_LocalId[1]/#text"
    const parts = path.split(".");
    let node: Node = xmlDoc as any;
    
    for (const part of parts) {
      if (part === "#text") {
        return node.textContent || null;
      }
      
      // Extract element name and index like "Device[1]" -> ["Device", "1"]
      const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[(\d+)\])?$/);
      if (!match) continue;
      
      const elementName = match[1];
      const index = match[2] ? parseInt(match[2]) - 1 : 0; // Convert to 0-based
      
      // Find matching child elements
      const children = Array.from(node.childNodes).filter(
        (n) => n.nodeName === elementName
      ) as Element[];
      
      if (!children[index]) {
        return null;
      }
      
      node = children[index];
    }
    
    return node.textContent || null;
  } catch {
    return null;
  }
}

const quickFilterPatterns: Record<QuickFilterKey, string | null> = {
  FaultMgmt: "Device[1].FaultMgmt[1]",
  NeighborList:
    "Device[1].Services[1].FAPService[1].i1[1].CellConfig[1].LTE[1].RAN[1].NeighborList",
  NeighborListInUse:
    "Device[1].Services[1].FAPService[1].i1[1].CellConfig[1].LTE[1].RAN[1].NeighborListInUse",
};

export function XmlComparison() {
  const [leftXml, setLeftXml] = useState(sampleLeft);
  const [rightXml, setRightXml] = useState(sampleRight);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [leftFileName, setLeftFileName] = useState<string | null>(null);
  const [rightFileName, setRightFileName] = useState<string | null>(null);
  const [leftFileValue, setLeftFileValue] = useState<string | null>(null);
  const [rightFileValue, setRightFileValue] = useState<string | null>(null);
  const [leftFileLoading, setLeftFileLoading] = useState(false);
  const [rightFileLoading, setRightFileLoading] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [leftError, setLeftError] = useState<string | undefined>(undefined);
  const [rightError, setRightError] = useState<string | undefined>(undefined);
  const [differences, setDifferences] = useState<Diff[]>([]);
  const [stats, setStats] = useState<Stats>({
    added: 0,
    removed: 0,
    changed: 0,
  });
  const [filter, setFilter] = useState("");
  const [changeFilter, setChangeFilter] = useState<Record<ChangeKind, boolean>>(
    {
      added: true,
      removed: true,
      changed: true,
    },
  );
  console.log("leftFileName............leftFileValue", leftFileValue);
  const [excludedQuickFilters, setExcludedQuickFilters] = useState<
    Set<Exclude<QuickFilterKey, "all">>
  >(new Set());
  const [valueView, setValueView] = useState<"both" | "valueOnly">("both");
  const [progress, setProgress] = useState<Progress>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/xmlDiffWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const filteredDiffs = useMemo(() => {
    const q = filter.trim().toLowerCase();

    // first filter by change kind toggles
    let byKind = differences.filter((d) => changeFilter[d.change]);

    // full-text / path search
    if (q) {
      byKind = byKind.filter((d) => {
        const path = String((d as any).path || (d as any).fullPath || "");
        const leftVal = String((d as any).left ?? "");
        const rightVal = String((d as any).right ?? "");
        return (
          path.toLowerCase().includes(q) ||
          leftVal.toLowerCase().includes(q) ||
          rightVal.toLowerCase().includes(q)
        );
      });
    }

    // apply quick filter exclusions - exclude selected categories
    if (excludedQuickFilters.size > 0) {
      byKind = byKind.filter((d) => {
        const path = String(
          (d as any).path || (d as any).fullPath || "",
        ).toLowerCase();
        // Exclude items that match any of the excluded patterns
        for (const excludedKey of excludedQuickFilters) {
          const pattern = quickFilterPatterns[excludedKey];
          if (pattern) {
            const patLower = pattern.toLowerCase();
            // Match pattern: check for pattern followed by [ (for nested elements) or at end of string
            // Also check if path starts with pattern (for root-level paths)
            if (
              path.includes(patLower + "[") ||
              path.endsWith(patLower) ||
              path.includes(patLower + ".")
            ) {
              return false; // Exclude this item
            }
          }
        }
        return true; // Include this item
      });
    }

    return byKind;
  }, [differences, filter, changeFilter, excludedQuickFilters]);

  const activeKindsCount = (Object.values(changeFilter).filter(Boolean)
    .length || 0) as number;
  const showLeftCol =
    valueView === "both" || (activeKindsCount === 1 && changeFilter.removed);
  const showRightCol =
    valueView === "both" || (activeKindsCount === 1 && changeFilter.added);
  const isAddedOnly = activeKindsCount === 1 && changeFilter.added;

  useEffect(() => {
    // Clear computed outputs when input changes, but don't re-diff automatically (perf for large XML).
    setLeftError(undefined);
    setRightError(undefined);
    setDifferences([]);
    setStats({ added: 0, removed: 0, changed: 0 });
    setLastRun(null);
  }, [leftXml, rightXml]);

  const handleCompare = () => {
    const worker = workerRef.current;
    if (!worker) return;

    setIsComparing(true);
    setLeftError(undefined);
    setRightError(undefined);
    setProgress({ percent: 0, message: "Starting…" });

    const onMessage = (event: MessageEvent<any>) => {
      const data = event.data as
        | {
            ok: true;
            type: "progress";
            phase: "left" | "right" | "diff";
            percent: number;
            message?: string;
          }
        | { ok: true; type: "done"; differences: Diff[]; stats: Stats }
        | { ok: false; type: "error"; leftError?: string; rightError?: string };

      if (data.ok && data.type === "progress") {
        setProgress({
          percent: data.percent,
          message: data.message,
          phase: data.phase,
        });
        return;
      }

      if (!data.ok && data.type === "error") {
        setLeftError(data.leftError);
        setRightError(data.rightError);
        setDifferences([]);
        setStats({ added: 0, removed: 0, changed: 0 });
        setIsComparing(false);
        setProgress(null);
        worker.removeEventListener("message", onMessage as any);
        worker.removeEventListener("error", onError as any);
        return;
      }

      if (data.ok && data.type === "done") {
        setDifferences(data.differences);
        setStats(data.stats);
        setLastRun(new Date());
        setIsComparing(false);
        setProgress(null);
        worker.removeEventListener("message", onMessage as any);
        worker.removeEventListener("error", onError as any);
      }
    };

    const onError = (err: ErrorEvent) => {
      setIsComparing(false);
      setLeftError(`Worker error: ${err.message}`);
      setDifferences([]);
      setStats({ added: 0, removed: 0, changed: 0 });
      setProgress(null);
      worker.removeEventListener("message", onMessage as any);
      worker.removeEventListener("error", onError as any);
    };

    worker.addEventListener("message", onMessage as any);
    worker.addEventListener("error", onError as any);
    worker.postMessage({ leftXml, rightXml });
  };

  const handleFileLoad = (
    event: React.ChangeEvent<HTMLInputElement>,
    side: "left" | "right",
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (side === "left") {
      setLeftFileName(file.name);
      setLeftFileLoading(true);
    } else {
      setRightFileName(file.name);
      setRightFileLoading(true);
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result?.toString() ?? "";
      const xmlPath = "Device[1].IPsec[1].Profile[1].i1[1].X_2C7AF4_LocalId[1]";
      const extractedValue = extractValueFromXml(content, xmlPath);
      
      if (side === "left") {
        setLeftXml(content);
        setLeftFileValue(extractedValue);
        setLeftFileLoading(false);
      } else {
        setRightXml(content);
        setRightFileValue(extractedValue);
        setRightFileLoading(false);
      }
    };
    reader.onerror = () => {
      if (side === "left") {
        setLeftFileLoading(false);
        setLeftError("Failed to read left XML file.");
      } else {
        setRightFileLoading(false);
        setRightError("Failed to read right XML file.");
      }
    };
    reader.readAsText(file);
  };

  const changesBadge =
    leftError || rightError
      ? "Fix XML errors to compare"
      : differences.length > 0
        ? `${differences.length} change${differences.length === 1 ? "" : "s"} found`
        : "Ready to compare";

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredDiffs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 16,
  });

  const handleExportCSV = () => {
    const baseName = leftFileName || rightFileName || "femtoxml-studio-report";
    exportToCSV(filteredDiffs, baseName.replace(/\.xml$/i, ""));
  };

  const handleExportExcel = () => {
    const baseName = leftFileName || rightFileName || "femtoxml-studio-report";
    exportToExcel(filteredDiffs, baseName.replace(/\.xml$/i, ""));
  };

  return (
    <>
      {/* Header with Compare button and search - only for comparison view */}
      <header className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
            Load or paste two device XMLs and compare them parameter by
            parameter. Results are virtualised, so exports with hundreds of
            thousands of parameters stay responsive.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="inline-flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-ink">
              {isComparing ? "Comparing…" : changesBadge}
            </span>
            {lastRun && (
              <span className="text-xs text-ink-3">
                Last run: {lastRun.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCompare}
              disabled={isComparing}
              className="inline-flex items-center justify-center rounded-lg bg-accent h-9 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isComparing ? "Comparing…" : "Compare"}
            </button>

            <div className="flex items-center gap-2">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search path/value/status…"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/25 sm:w-72"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Progress indicator shown while comparing XMLs */}
      {isComparing && progress && (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Loader size="sm" />
            <div className="flex w-full flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-ink">
                  {progress.message ?? "Comparing…"}
                </div>
                <div className="text-sm font-semibold text-ink-2">
                  {progress.percent}%
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Left and Right XML input panels */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">
              Left XML
            </h2>
            <div className="flex items-center gap-3">
              {leftFileName && (
                <div className="flex flex-col gap-1">
                  <span
                    className="max-w-[220px] truncate text-xs text-ink-3"
                    title={leftFileName}
                  >
                    {leftFileName}
                  </span>
                  <span className="max-w-[220px] truncate text-xs font-semibold text-accent">
                    {formatValue(leftFileValue ?? undefined)}
                  </span>
                </div>
              )}
              {leftFileLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <Spinner className="h-3 w-3 text-accent" />
                  Loading…
                </span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft">
                <input
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={(e) => handleFileLoad(e, "left")}
                />
                Load file
              </label>
            </div>
          </div>

          <textarea
            value={leftXml}
            onChange={(e) => setLeftXml(e.target.value)}
            spellCheck={false}
            placeholder="Paste device XML here"
            className="h-72 w-full resize-y rounded-xl border border-line bg-surface-sunk p-3 font-mono text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {leftError && (
            <div className="mt-2 rounded-xl border border-bad/35 bg-bad-soft px-3 py-2 text-sm text-bad">
              Left XML error: {leftError}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">
              Right XML
            </h2>
            <div className="flex items-center gap-3">
              {rightFileName && (
                <div className="flex flex-col gap-1">
                  <span
                    className="max-w-[220px] truncate text-xs text-ink-3"
                    title={rightFileName}
                  >
                    {rightFileName}
                  </span>
                  <span className="max-w-[220px] truncate text-xs font-semibold text-accent">
                    {formatValue(rightFileValue ?? undefined)}
                  </span>
                </div>
              )}
              {rightFileLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <Spinner className="h-3 w-3 text-accent" />
                  Loading…
                </span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft">
                <input
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={(e) => handleFileLoad(e, "right")}
                />
                Load file
              </label>
            </div>
          </div>

          <textarea
            value={rightXml}
            onChange={(e) => setRightXml(e.target.value)}
            spellCheck={false}
            placeholder="Paste device XML here"
            className="h-72 w-full resize-y rounded-xl border border-line bg-surface-sunk p-3 font-mono text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {rightError && (
            <div className="mt-2 rounded-xl border border-bad/35 bg-bad-soft px-3 py-2 text-sm text-bad">
              Right XML error: {rightError}
            </div>
          )}
        </div>
      </section>

      {/* Differences comparison results section */}
      <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Differences
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Paths include element index (e.g.{" "}
              <span className="font-mono">band[1]</span>), attributes (
              <span className="font-mono">@attr</span>), and text nodes (
              <span className="font-mono">#text</span>).
            </p>
          </div>

          {/* Filter controls */}
          <div>
            <div>
              {/* Statistics badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
                Added: {stats.added}
              </span>
              <span className="rounded-full border border-bad/35 bg-bad-soft px-3 py-1 text-sm font-semibold text-bad">
                Removed: {stats.removed}
              </span>
              <span className="rounded-full border border-warn/35 bg-warn-soft px-3 py-1 text-sm font-semibold text-warn">
                Changed: {stats.changed}
              </span>
              <span className="rounded-full border border-line bg-surface-sunk px-3 py-1 text-sm font-semibold text-ink-2">
                Showing: {filteredDiffs.length}
              </span>
            </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
               

                {/* Change type filter buttons (added, removed, changed) */}
                <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 mb-1">
                 
                  <button
                  type="button"
                  onClick={() =>
                    setChangeFilter({
                      added: true,
                      removed: false,
                      changed: false,
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isAddedOnly
                      ? "border-cyan-300 bg-accent-soft text-accent-ink"
                      : "border-line bg-surface text-ink-2 hover:bg-surface-sunk"
                  }`}
                  title="Show only Added"
                >
                  Added only
                </button>


                  {(["added", "removed", "changed"] as const).map((k) => {
                    const on = changeFilter[k];
                    const colors =
                      k === "added"
                        ? on
                          ? "bg-accent-soft text-accent-ink"
                          : "text-ink-2 hover:bg-surface-sunk"
                        : k === "removed"
                          ? on
                            ? "bg-bad-soft text-bad"
                            : "text-ink-2 hover:bg-surface-sunk"
                          : on
                            ? "bg-warn-soft text-warn"
                            : "text-ink-2 hover:bg-surface-sunk";
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          setChangeFilter((prev) => {
                            const next = { ...prev, [k]: !prev[k] };
                            // Prevent "none selected" (keep at least one on)
                            if (
                              !next.added &&
                              !next.removed &&
                              !next.changed
                            ) {
                              return prev;
                            }
                            return next;
                          })
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${colors}`}
                        aria-pressed={on}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div> 
              </div>
            </div>

            

            {/* Quick filter buttons to exclude specific categories (FaultMgmt, NeighborList, NeighborListInUse) */}
            <div className="flex gap-1 mt-1">
              {(
                ["FaultMgmt", "NeighborList", "NeighborListInUse"] as Exclude<
                  QuickFilterKey,
                  "all"
                >[]
              ).map((k) => {
                const isExcluded = excludedQuickFilters.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => {
                      const newExcluded = new Set(excludedQuickFilters);
                      if (isExcluded) {
                        newExcluded.delete(k);
                      } else {
                        newExcluded.add(k);
                      }
                      setExcludedQuickFilters(newExcluded);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition border border-line ${
                      isExcluded
                        ? "bg-bad-soft text-bad"
                        : "text-ink-2 hover:bg-surface-sunk"
                    }`}
                    title={
                      isExcluded
                        ? `Excluding: ${k}`
                        : `Click to exclude: ${k}`
                    }
                  >
                    {isExcluded ? `✕ ${k}` : k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Differences results table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <div
            className={`grid bg-surface-sunk px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-2 ${
              showLeftCol && showRightCol ? "grid-cols-12" : "grid-cols-12"
            }`}
          >
            <div
              className={
                showLeftCol && showRightCol ? "col-span-6" : "col-span-8"
              }
            >
              Path
            </div>
            {showLeftCol && <div className="col-span-2">Left</div>}
            {showRightCol && <div className="col-span-2">Right</div>}
            <div className="col-span-2 text-right">Status</div>
          </div>

          {filteredDiffs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-2">
              {isComparing
                ? "Comparing…"
                : differences.length === 0
                  ? "No results yet. Upload two XMLs, then click Compare."
                  : "No matches for your current filters/search."}
            </div>
          ) : (
            <div
              ref={parentRef}
              className="h-[520px] overflow-auto bg-surface"
              style={{ contain: "strict" }}
            >
              <div
                className="relative w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const diff = filteredDiffs[virtualRow.index]!;
                  const rowBg =
                    diff.change === "added"
                      ? "bg-accent-soft"
                      : diff.change === "removed"
                        ? "bg-bad-soft"
                        : "bg-warn-soft";

                  return (
                    <div
                      key={`${diff.path}-${diff.change}-${virtualRow.index}`}
                      className={`absolute left-0 top-0 w-full border-b border-line-soft px-3 py-2 text-sm ${rowBg}`}
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                    >
                      <div className="grid grid-cols-12 gap-2">
                        <div
                          className={`${showLeftCol && showRightCol ? "col-span-6" : "col-span-8"} break-words font-mono text-xs text-ink`}
                        >
                          {diff.path}
                        </div>
                        {showLeftCol && (
                          <div className="col-span-2 break-words font-mono text-xs text-ink">
                            {formatValue(diff.leftValue)}
                          </div>
                        )}
                        {showRightCol && (
                          <div className="col-span-2 break-words font-mono text-xs text-ink">
                            {formatValue(diff.rightValue)}
                          </div>
                        )}
                        <div className="col-span-2 text-right text-xs font-semibold capitalize text-ink">
                          {diff.change}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Export options */}
        <div>
          {filteredDiffs.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-4">
              <h3 className="text-[13px] font-semibold text-ink">Export report</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft h-8 px-3 text-xs font-semibold text-ok hover:brightness-105"
                  title="Export to CSV (Google Sheets compatible)"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft h-8 px-3 text-xs font-semibold text-ok hover:brightness-105"
                  title="Export to Excel"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export Excel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
