import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  VOLATILE_RULES,
  buildSiteMatrix,
  extractSiteDoc,
  type MatrixRow,
  type SiteDoc,
} from "../utils/siteMatrix";
import { downloadMatrixCsv, downloadMatrixWorkbook } from "../utils/siteMatrixExport";

type LoadedSite = { id: string; doc: SiteDoc; sizeKb: number };
type LoadError = { fileName: string; message: string };

const DEFAULT_FILE_NAME = "Site_Configuration_Comparison";

/** Visual width of one site column in the preview grid. */
const SITE_COL = 150;
const PATH_COL = 460;
const NAME_COL = 190;
const STATUS_COL = 110;

export default function SiteConfigMatrix() {
  const [loaded, setLoaded] = useState<LoadedSite[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [hideVolatile, setHideVolatile] = useState(true);
  const [mismatchesOnly, setMismatchesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [outputName, setOutputName] = useState(DEFAULT_FILE_NAME);
  const [showRules, setShowRules] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** The full matrix for the current toggles — this is what gets exported. */
  const matrix = useMemo(
    () =>
      buildSiteMatrix(
        loaded.map((item) => item.doc),
        { hideVolatile, mismatchesOnly },
      ),
    [loaded, hideVolatile, mismatchesOnly],
  );

  /** The search box only narrows what is on screen, never the export. */
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return matrix.rows;
    return matrix.rows.filter(
      (row) =>
        row.path.toLowerCase().includes(query) ||
        row.values.some((v) => v !== null && v.toLowerCase().includes(query)),
    );
  }, [matrix, search]);

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 20,
  });

  const gridWidth =
    PATH_COL + NAME_COL + matrix.sites.length * SITE_COL + STATUS_COL;

  const loadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name));
    const skipped = Array.from(fileList).length - files.length;
    if (files.length === 0) {
      setErrors([{ fileName: "—", message: "No .xml files in the selection." }]);
      return;
    }

    setIsLoading(true);
    setExportError(null);

    const added: LoadedSite[] = [];
    const failed: LoadError[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        added.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          doc: extractSiteDoc(text, file.name),
          sizeKb: Math.round(file.size / 1024),
        });
      } catch (err) {
        failed.push({ fileName: file.name, message: (err as Error).message });
      }
    }

    if (skipped > 0) {
      failed.push({ fileName: "—", message: `${skipped} non-XML file(s) ignored.` });
    }

    setLoaded((prev) => {
      // Re-loading the same file replaces its column instead of adding one.
      const byName = new Map(prev.map((item) => [item.doc.sourceFile, item]));
      for (const item of added) byName.set(item.doc.sourceFile, item);
      return Array.from(byName.values());
    });
    setErrors(failed);
    setIsLoading(false);
  };

  const removeSite = (id: string) => setLoaded((prev) => prev.filter((i) => i.id !== id));

  const clearAll = () => {
    setLoaded([]);
    setErrors([]);
    setExportError(null);
    setSearch("");
  };

  const handleExport = async (kind: "csv" | "xlsx") => {
    if (matrix.rows.length === 0) return;
    setIsExporting(kind);
    setExportError(null);
    try {
      if (kind === "csv") downloadMatrixCsv(matrix, outputName || DEFAULT_FILE_NAME);
      else await downloadMatrixWorkbook(matrix, outputName || DEFAULT_FILE_NAME);
    } catch (err) {
      setExportError(`Export failed: ${(err as Error).message}`);
    }
    setIsExporting(null);
  };

  const statusStyle = (row: MatrixRow) =>
    row.status === "mismatch"
      ? "bg-rose-50"
      : row.status === "missing"
        ? "bg-amber-50"
        : "";

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Site Configuration Matrix
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Load several site XML exports and compare them side by side. Every
              parameter becomes a row, every site a column, so a configuration
              mismatch shows up as soon as you read across the row. Export to CSV
              or to Excel with the mismatching rows highlighted.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
              Load site XML files
              <input
                ref={inputRef}
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) void loadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {loaded.length > 0 && (
              <button
                onClick={clearAll}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {loaded.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              {loaded.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                  title={`${item.doc.sourceFile} · ${item.sizeKb} KB · ${item.doc.values.size} parameters`}
                >
                  <span className="font-semibold text-slate-900">{item.doc.siteId}</span>
                  <span className="text-slate-500">
                    {item.doc.values.size.toLocaleString()} params
                  </span>
                  <button
                    onClick={() => removeSite(item.id)}
                    className="text-slate-400 transition hover:text-rose-600"
                    title="Remove this site"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Sites", value: matrix.sites.length },
                  { label: "Parameters", value: matrix.totals.parameters },
                  { label: "Mismatched", value: matrix.totals.mismatch },
                  { label: "Missing somewhere", value: matrix.totals.missing },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {s.label}
                    </div>
                    <div className="text-lg font-semibold text-slate-900">
                      {s.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-1 flex-wrap items-end justify-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Output file name</span>
                  <input
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    spellCheck={false}
                    className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <button
                  onClick={() => handleExport("csv")}
                  disabled={isExporting !== null || matrix.rows.length === 0}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {isExporting === "csv" ? "Writing…" : "Download CSV"}
                </button>
                <button
                  onClick={() => handleExport("xlsx")}
                  disabled={isExporting !== null || matrix.rows.length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isExporting === "xlsx" ? "Building…" : "Download Excel"}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={hideVolatile}
                  onChange={(e) => setHideVolatile(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
                />
                Hide volatile data
                <button
                  type="button"
                  onClick={() => setShowRules((v) => !v)}
                  className="font-semibold text-primary hover:underline"
                >
                  ({matrix.totals.hidden.toLocaleString()} hidden — what&apos;s this?)
                </button>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={mismatchesOnly}
                  onChange={(e) => setMismatchesOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
                />
                Mismatches only
              </label>

              <div className="ml-auto flex items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter the preview by path or value…"
                  spellCheck={false}
                  className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-200"
                />
              </div>
            </div>

            {showRules && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="mb-2 font-semibold text-slate-700">
                  Hidden while “Hide volatile data” is on — these always differ
                  between devices and are not configuration:
                </p>
                <ul className="space-y-1">
                  {VOLATILE_RULES.map((rule) => (
                    <li key={rule.label}>
                      <span className="font-semibold text-slate-700">{rule.label}</span>{" "}
                      — {rule.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </header>

      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
          <span className="text-sm font-semibold text-slate-700">
            Parsing site XML files…
          </span>
        </div>
      )}

      {(errors.length > 0 || exportError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {exportError && <p className="font-semibold">{exportError}</p>}
          {errors.map((e, i) => (
            <p key={i}>
              <span className="font-semibold">{e.fileName}:</span> {e.message}
            </p>
          ))}
        </div>
      )}

      {loaded.length === 0 && !isLoading && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) void loadFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition ${
            isDragging
              ? "border-primary bg-primary-50"
              : "border-slate-300 bg-slate-50 hover:border-primary-300 hover:bg-white"
          }`}
        >
          <p className="text-sm font-semibold text-slate-700">
            Drop the site XML exports here, or click to browse
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Load as many sites as you like — each becomes one column. Site IDs come
            from file names of the form{" "}
            <code className="rounded bg-slate-200 px-1">
              &lt;serial&gt;_&lt;siteId&gt;_&lt;date&gt;.xml
            </code>
            .
          </p>
        </div>
      )}

      {loaded.length === 1 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only one site is loaded — add at least one more to compare. The export
          works with a single site too, but every row will read “Match”.
        </div>
      )}

      {matrix.sites.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Preview
              <span className="ml-2 text-sm font-normal text-slate-500">
                {visibleRows.length.toLocaleString()} of{" "}
                {matrix.rows.length.toLocaleString()} exported row(s)
              </span>
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-rose-200 bg-rose-50" />
                Mismatch
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" />
                Missing on some sites
              </span>
            </div>
          </div>

          <div ref={scrollRef} className="max-h-[560px] overflow-auto">
            <div style={{ width: gridWidth }}>
              {/* Header */}
              <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                <div className="shrink-0 px-2 py-2" style={{ width: PATH_COL }}>
                  Parameter Path
                </div>
                <div className="shrink-0 px-2 py-2" style={{ width: NAME_COL }}>
                  Parameter
                </div>
                {matrix.sites.map((site) => (
                  <div
                    key={site.label}
                    className="shrink-0 border-l border-slate-200 px-2 py-2"
                    style={{ width: SITE_COL }}
                    title={site.sourceFile}
                  >
                    {site.label}
                  </div>
                ))}
                <div
                  className="shrink-0 border-l border-slate-200 px-2 py-2"
                  style={{ width: STATUS_COL }}
                >
                  Status
                </div>
              </div>

              {/* Virtualised body */}
              {visibleRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  {matrix.rows.length === 0
                    ? "Nothing to show with the current filters."
                    : "No rows match your search."}
                </div>
              ) : (
                <div
                  className="relative"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = visibleRows[virtualRow.index]!;
                    return (
                      <div
                        key={row.path}
                        className={`absolute left-0 top-0 flex border-b border-slate-100 text-xs ${statusStyle(row)}`}
                        style={{
                          height: virtualRow.size,
                          width: gridWidth,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className="shrink-0 truncate px-2 py-1.5 font-mono text-[11px] text-slate-600"
                          style={{ width: PATH_COL }}
                          title={row.path}
                        >
                          {row.path}
                        </div>
                        <div
                          className="shrink-0 truncate px-2 py-1.5 font-semibold text-slate-800"
                          style={{ width: NAME_COL }}
                          title={row.name}
                        >
                          {row.name}
                        </div>
                        {row.values.map((value, i) => (
                          <div
                            key={i}
                            className={`shrink-0 truncate border-l border-slate-100 px-2 py-1.5 ${
                              value === null
                                ? "italic text-slate-400"
                                : "tabular-nums text-slate-800"
                            }`}
                            style={{ width: SITE_COL }}
                            title={value === null ? "not present on this site" : value}
                          >
                            {value === null ? "—" : value === "" ? "(empty)" : value}
                          </div>
                        ))}
                        <div
                          className="shrink-0 border-l border-slate-100 px-2 py-1.5"
                          style={{ width: STATUS_COL }}
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.status === "mismatch"
                                ? "bg-rose-100 text-rose-700"
                                : row.status === "missing"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {row.status === "mismatch"
                              ? `${row.distinct} values`
                              : row.status === "missing"
                                ? `${row.present}/${matrix.sites.length}`
                                : "Match"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {loaded.length > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) void loadFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${
            isDragging
              ? "border-primary bg-primary-50 text-primary-700"
              : "border-slate-300 bg-slate-50 text-slate-500 hover:border-primary-300 hover:bg-white"
          }`}
        >
          Drop more site XML exports here to add columns
        </div>
      )}
    </div>
  );
}
