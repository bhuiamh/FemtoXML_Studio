import { useMemo, useRef, useState } from "react";
import {
  buildPathTableColumns,
  extractPathTable,
  totalPathRows,
  type PathTableBlock,
  type PathTableResult,
} from "../utils/pathTable";
import { computeCellId, computeEnbId } from "../utils/neighborList";
import { downloadPathWorkbook } from "../utils/pathTableExcel";

type LoadedFile = { id: string; file: File; sizeKb: number };
type ScanError = { fileName: string; message: string };

const DEFAULT_PATH =
  "Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell";

/** Handy starting points; anything the engineer types is equally valid. */
const PRESETS: { label: string; path: string }[] = [
  {
    label: "Neighbour list in use",
    path: "Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell",
  },
  {
    label: "Neighbour list (configured)",
    path: "Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborList.LTECell",
  },
  {
    label: "RF parameters",
    path: "Device.Services.FAPService.{n}.CellConfig.LTE.RAN.RF",
  },
  {
    label: "Mobility (subtree)",
    path: "Device.Services.FAPService.{n}.CellConfig.LTE.RAN.Mobility",
  },
  {
    label: "EPC PLMN list",
    path: "Device.Services.FAPService.{n}.CellConfig.LTE.EPC.PLMNList",
  },
  {
    label: "Alarm history",
    path: "Device.FaultMgmt.HistoryEvent",
  },
];

function formatCell(value: string | number | "" | undefined) {
  if (value === undefined || value === "") return "—";
  return String(value);
}

/** File name suggestion derived from the path's leaf, e.g. "LTECell_Table". */
function suggestFileName(tables: PathTableResult[]): string {
  const leaf = tables[0]?.leafName ?? "Path";
  return `${leaf}_Table.xlsx`;
}

export default function DynamicPathExcel() {
  const [path, setPath] = useState(DEFAULT_PATH);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [tables, setTables] = useState<PathTableResult[]>([]);
  const [errors, setErrors] = useState<ScanError[]>([]);
  const [pathError, setPathError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [addCidSplit, setAddCidSplit] = useState(true);
  const [includeChildTables, setIncludeChildTables] = useState(true);
  const [outputName, setOutputName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const rows = tables.reduce((sum, t) => sum + totalPathRows(t), 0);
    const matches = tables.reduce((sum, t) => sum + t.matchCount, 0);
    const blocks = tables.reduce((max, t) => Math.max(max, t.blocks.length), 0);
    return { devices: tables.length, matches, rows, blocks };
  }, [tables]);

  const scan = async (
    targetFiles: LoadedFile[],
    scanPath: string,
    withChildren: boolean,
  ) => {
    setIsScanning(true);
    setPathError(null);
    setBuildError(null);

    const results: PathTableResult[] = [];
    const failed: ScanError[] = [];

    for (const item of targetFiles) {
      try {
        const text = await item.file.text();
        results.push(
          extractPathTable(text, item.file.name, scanPath, {
            includeChildTables: withChildren,
          }),
        );
      } catch (err) {
        const message = (err as Error).message;
        // A bad path fails identically for every file — report it once, up top.
        if (/path/i.test(message) && results.length === 0) setPathError(message);
        failed.push({ fileName: item.file.name, message });
      }
    }

    setTables(results);
    setErrors(failed);
    setOutputName((prev) => prev || (results.length > 0 ? suggestFileName(results) : ""));
    setIsScanning(false);
  };

  const loadFiles = async (fileList: FileList | File[]) => {
    const picked = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name));
    if (picked.length === 0) {
      setErrors([{ fileName: "—", message: "No .xml files in the selection." }]);
      return;
    }

    const byName = new Map(files.map((item) => [item.file.name, item]));
    for (const file of picked) {
      byName.set(file.name, {
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        sizeKb: Math.round(file.size / 1024),
      });
    }
    const next = Array.from(byName.values());
    setFiles(next);
    await scan(next, path, includeChildTables);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    if (picked && picked.length > 0) void loadFiles(picked);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) void loadFiles(event.dataTransfer.files);
  };

  const applyPath = (nextPath: string) => {
    setPath(nextPath);
    setExpanded(null);
    setOutputName("");
    if (files.length > 0) void scan(files, nextPath, includeChildTables);
  };

  const toggleChildTables = (next: boolean) => {
    setIncludeChildTables(next);
    setExpanded(null);
    if (files.length > 0) void scan(files, path, next);
  };

  const removeFile = (id: string) => {
    const next = files.filter((item) => item.id !== id);
    setFiles(next);
    setExpanded(null);
    if (next.length > 0) void scan(next, path, includeChildTables);
    else {
      setTables([]);
      setErrors([]);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setTables([]);
    setErrors([]);
    setPathError(null);
    setBuildError(null);
    setExpanded(null);
    setOutputName("");
  };

  const handleDownload = async () => {
    if (tables.length === 0) return;
    setIsBuilding(true);
    setBuildError(null);
    try {
      await downloadPathWorkbook(tables, outputName || suggestFileName(tables), {
        addCidSplit,
      });
    } catch (err) {
      setBuildError(`Failed to build the workbook: ${(err as Error).message}`);
    }
    setIsBuilding(false);
  };

  /** Preview table for one block of one device. */
  const renderBlockTable = (block: PathTableBlock) => {
    const columns = buildPathTableColumns(block.columns, addCidSplit);
    const cidKey = columns.find(
      (c): c is { kind: "value"; label: string; key: string } =>
        c.kind === "value" && c.key.split(".").pop() === "CID",
    )?.key;
    const hasSplit = columns.some((c) => c.kind === "enb");

    return (
      <div className="max-h-96 overflow-auto border-t border-slate-100">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.label}
                  className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-semibold text-slate-700"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((entry, i) => {
              const cid = hasSplit && cidKey ? (entry.values[cidKey] ?? "") : "";
              return (
                <tr key={i} className="odd:bg-white even:bg-slate-50">
                  {columns.map((col) => (
                    <td
                      key={col.label}
                      className={`whitespace-nowrap border-b border-slate-100 px-2 py-1.5 ${
                        col.kind === "enb" || col.kind === "cellId"
                          ? "font-semibold text-primary-700"
                          : col.kind === "index"
                            ? "text-slate-500"
                            : col.kind === "instance"
                              ? "font-medium text-slate-600"
                              : "text-slate-800"
                      }`}
                    >
                      {col.kind === "index"
                        ? i + 1
                        : col.kind === "instance"
                          ? entry.instance
                          : col.kind === "value"
                            ? formatCell(entry.values[col.key])
                            : col.kind === "enb"
                              ? formatCell(computeEnbId(cid))
                              : formatCell(computeCellId(cid))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Dynamic Path Excel</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-600">
          Point any TR-069 parameter path at your device XML exports and get the
          same styled workbook the Neighbour module produces — one sheet per
          device, columns discovered from the data. Everything{" "}
          <span className="font-semibold">from the path down to the end</span> is
          exported: the node itself becomes the first table and every nested
          table below it gets its own table on the same sheet. Use{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">&#123;n&#125;</code>{" "}
          (or <code className="rounded bg-slate-100 px-1 text-xs">*</code>) for
          every instance of an indexed node, or a number like{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">i2</code> for one
          of them. Dots and slashes both work.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Parameter path
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPath(path);
              }}
              spellCheck={false}
              placeholder={DEFAULT_PATH}
              className="min-w-[320px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-200"
            />
            <button
              onClick={() => applyPath(path)}
              disabled={isScanning}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isScanning ? "Scanning…" : "Scan path"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Examples:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPath(preset.path)}
                title={preset.path}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  path === preset.path
                    ? "border-primary bg-primary-50 text-primary-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100">
            Load device XML files
            <input
              ref={inputRef}
              type="file"
              accept=".xml"
              multiple
              className="hidden"
              onChange={handleInputChange}
            />
          </label>
          {files.length > 0 && (
            <button
              onClick={clearAll}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear all
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={includeChildTables}
                onChange={(e) => toggleChildTables(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
              />
              Include child tables (whole subtree)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={addCidSplit}
                onChange={(e) => setAddCidSplit(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
              />
              Add eNodeB ID / Cell ID after CID
            </label>
          </div>
        </div>

        {tables.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Devices", value: stats.devices },
                { label: "Matches", value: stats.matches },
                { label: "Tables / device", value: stats.blocks },
                { label: "Rows", value: stats.rows },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2"
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {s.label}
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-1 flex-wrap items-end justify-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">
                  Output file name
                </span>
                <input
                  value={outputName}
                  onChange={(e) => setOutputName(e.target.value)}
                  spellCheck={false}
                  className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-200"
                />
              </label>
              <button
                onClick={handleDownload}
                disabled={isBuilding || stats.rows === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isBuilding ? "Building…" : "Download Excel"}
              </button>
            </div>
          </div>
        )}
      </header>

      {files.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition ${
            isDragging
              ? "border-primary bg-primary-50"
              : "border-slate-300 bg-slate-50 hover:border-primary-300 hover:bg-white"
          }`}
        >
          <p className="text-sm font-semibold text-slate-700">
            Drop device XML exports here, or click to browse
          </p>
          <p className="mt-2 text-xs text-slate-500">
            The path above is applied to every file as soon as it loads.
          </p>
        </div>
      )}

      {(pathError || buildError || errors.length > 0) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {pathError && <p className="font-semibold">{pathError}</p>}
          {buildError && <p className="font-semibold">{buildError}</p>}
          {!pathError &&
            errors.map((e, i) => (
              <p key={i}>
                <span className="font-semibold">{e.fileName}:</span> {e.message}
              </p>
            ))}
        </div>
      )}

      {tables.map((table) => {
        const fileEntry = files.find((f) => f.file.name === table.sourceFile);
        const rowTotal = totalPathRows(table);
        return (
          <section
            key={table.sourceFile}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Site {table.siteId}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {table.serial ? `serial ${table.serial}` : "serial n/a"}
                  </span>
                </h2>
                <p
                  className="mt-0.5 max-w-2xl truncate text-xs text-slate-500"
                  title={table.sourceFile}
                >
                  {table.sourceFile}
                  {fileEntry ? ` · ${fileEntry.sizeKb} KB` : ""} ·{" "}
                  {table.matchCount} match(es) · {table.blocks.length} table(s) ·{" "}
                  {rowTotal} row(s)
                </p>
              </div>
              {fileEntry && (
                <button
                  onClick={() => removeFile(fileEntry.id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Remove
                </button>
              )}
            </div>

            {table.blocks.length === 0 && (
              <p className="px-4 py-3 text-sm text-amber-700">
                This path does not resolve to anything in this export. Check the
                tag names and whether an indexed node needs{" "}
                <code className="rounded bg-amber-100 px-1">&#123;n&#125;</code>.
              </p>
            )}

            {(table.skippedTables.length > 0 || table.hitCellLimit) && (
              <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                {table.hitCellLimit &&
                  "Export limit reached — narrow the path to get the full subtree. "}
                {table.skippedTables.length > 0 &&
                  `Not exported: ${table.skippedTables.slice(0, 8).join(", ")}${
                    table.skippedTables.length > 8
                      ? ` and ${table.skippedTables.length - 8} more`
                      : ""
                  }.`}
              </p>
            )}

            <div className="divide-y divide-slate-100">
              {table.blocks.map((block) => {
                const key = `${table.sourceFile}::${block.relPath}`;
                const isOpen = expanded === key;
                return (
                  <div key={key}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      disabled={block.rows.length === 0}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
                    >
                      <span
                        className={`font-mono text-xs ${
                          block.relPath ? "text-slate-600" : "font-semibold text-slate-900"
                        }`}
                      >
                        {block.relPath ? `↳ ${block.relPath}` : block.title}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            block.rows.length > 0
                              ? "bg-primary-50 text-primary-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {block.rows.length} × {block.columns.length}
                        </span>
                        {block.rows.length > 0 && (
                          <span className="text-xs font-semibold text-primary">
                            {isOpen ? "Hide" : "Preview"}
                          </span>
                        )}
                      </span>
                    </button>
                    {isOpen && block.rows.length > 0 && renderBlockTable(block)}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {files.length > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${
            isDragging
              ? "border-primary bg-primary-50 text-primary-700"
              : "border-slate-300 bg-slate-50 text-slate-500 hover:border-primary-300 hover:bg-white"
          }`}
        >
          Drop more XML exports here to add devices
        </div>
      )}
    </div>
  );
}
