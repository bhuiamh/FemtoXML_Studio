import { useMemo, useRef, useState } from "react";
import {
  NEIGHBOR_COLUMNS,
  bandLabel,
  columnValue,
  deviceNeighborRows,
  extractNeighborSite,
  totalNeighbors,
  type NeighborSite,
} from "../utils/neighborList";
import { downloadNeighborWorkbook } from "../utils/neighborExcel";

type LoadedSite = {
  id: string;
  site: NeighborSite;
  sizeKb: number;
};

type LoadError = { fileName: string; message: string };

const DEFAULT_FILE_NAME = "Femtocell_Neighbor_List.xlsx";

function formatCell(value: string | number | "" | undefined) {
  if (value === undefined || value === "") return "—";
  return String(value);
}

export default function NeighborListExcel() {
  const [loaded, setLoaded] = useState<LoadedSite[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState(DEFAULT_FILE_NAME);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let cells = 0;
    let neighbors = 0;
    for (const item of loaded) {
      cells += item.site.cells.length;
      neighbors += totalNeighbors(item.site);
    }
    return { files: loaded.length, cells, neighbors };
  }, [loaded]);

  const loadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name));
    const skipped = Array.from(fileList).length - files.length;
    if (files.length === 0) {
      setErrors((prev) => [
        ...prev,
        { fileName: "—", message: "No .xml files in the selection." },
      ]);
      return;
    }

    setIsLoading(true);
    setBuildError(null);

    const added: LoadedSite[] = [];
    const failed: LoadError[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const site = extractNeighborSite(text, file.name);
        added.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          site,
          sizeKb: Math.round(file.size / 1024),
        });
      } catch (err) {
        failed.push({ fileName: file.name, message: (err as Error).message });
      }
    }

    if (skipped > 0) {
      failed.push({
        fileName: "—",
        message: `${skipped} non-XML file(s) ignored.`,
      });
    }

    setLoaded((prev) => {
      // Re-loading the same file replaces the previous entry instead of duplicating it.
      const byName = new Map(prev.map((item) => [item.site.sourceFile, item]));
      for (const item of added) byName.set(item.site.sourceFile, item);
      return Array.from(byName.values());
    });
    setErrors(failed);
    setIsLoading(false);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) void loadFiles(files);
    // Allow picking the same file again after a remove.
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) void loadFiles(files);
  };

  const removeSite = (id: string) => {
    setLoaded((prev) => prev.filter((item) => item.id !== id));
    setExpanded(null);
  };

  const clearAll = () => {
    setLoaded([]);
    setErrors([]);
    setBuildError(null);
    setExpanded(null);
  };

  const handleDownload = async () => {
    if (loaded.length === 0) return;
    setIsBuilding(true);
    setBuildError(null);
    try {
      await downloadNeighborWorkbook(
        loaded.map((item) => item.site),
        outputName || DEFAULT_FILE_NAME,
      );
    } catch (err) {
      setBuildError(`Failed to build the workbook: ${(err as Error).message}`);
    }
    setIsBuilding(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Neighbour List Excel
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Load one or more femtocell device XML exports — one file is one
              eNodeB device — and build a single workbook with one sheet per
              device, holding that device's LTE{" "}
              <span className="font-semibold">Neighbor List In Use</span> from{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">
                Device.Services.FAPService.&#123;n&#125;.CellConfig.LTE.RAN.NeighborListInUse.LTECell
              </code>
              . Whether the device carries one band/cell or two, its neighbours
              come out as one table, each row tagged with its serving band and
              carrying live <span className="font-semibold">eNodeB ID</span> /{" "}
              <span className="font-semibold">Cell ID</span> formulas right
              after the CID.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-600">
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
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
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
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Devices", value: stats.files },
                { label: "Cells / bands", value: stats.cells },
                { label: "Neighbour rows", value: stats.neighbors },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2"
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {s.label}
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {s.value}
                  </div>
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
                  className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-200"
                />
              </label>
              <button
                onClick={handleDownload}
                disabled={isBuilding || stats.neighbors === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isBuilding ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Building…
                  </>
                ) : (
                  <>
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
                        d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
                      />
                    </svg>
                    Download Excel
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </header>

      {loaded.length === 0 && (
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
            Drop femtocell XML exports here, or click to browse
          </p>
          <p className="mt-2 text-xs text-slate-500">
            File names of the form{" "}
            <code className="rounded bg-slate-200 px-1">
              &lt;serial&gt;_&lt;siteId&gt;_&lt;date&gt;_&lt;rest&gt;.xml
            </code>{" "}
            give each sheet its site ID and serial number automatically.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
          <span className="text-sm font-semibold text-slate-700">
            Parsing XML files…
          </span>
        </div>
      )}

      {(errors.length > 0 || buildError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {buildError && <p className="font-semibold">{buildError}</p>}
          {errors.map((e, i) => (
            <p key={i}>
              <span className="font-semibold">{e.fileName}:</span> {e.message}
            </p>
          ))}
        </div>
      )}

      {loaded.map((item) => {
        const site = item.site;
        const siteNeighbors = totalNeighbors(site);
        return (
          <section
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Site {site.siteId}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {site.serial ? `serial ${site.serial}` : "serial n/a"}
                  </span>
                </h2>
                <p
                  className="mt-0.5 max-w-xl truncate text-xs text-slate-500"
                  title={site.sourceFile}
                >
                  {site.sourceFile} · {item.sizeKb} KB · {site.cells.length}{" "}
                  cell(s) · {siteNeighbors} neighbour row(s)
                </p>
              </div>
              <button
                onClick={() => removeSite(item.id)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Remove
              </button>
            </div>

            {site.cells.length === 0 && (
              <p className="p-4 text-sm text-amber-700">
                No LTE FAPService instance found in this export — nothing to put
                in the sheet.
              </p>
            )}

            {/* Cells the device carries — informational; the neighbour list
                below is a single table for the whole device. */}
            {site.cells.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {site.cells.map((cell) => (
                  <div
                    key={`${item.id}-${cell.instance}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-900">
                      {bandLabel(cell.band)}
                    </span>
                    <span className="text-slate-500">
                      FAPService.{cell.instance.replace("i", "")}
                    </span>
                    <span className="text-slate-600">
                      EARFCN{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCell(cell.earfcnDl)}
                      </span>
                    </span>
                    <span className="text-slate-600">
                      PCI{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCell(cell.servingPci)}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        cell.neighbors.length > 0
                          ? "bg-primary-50 text-primary-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {cell.neighbors.length} neighbour
                      {cell.neighbors.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(() => {
              const rows = deviceNeighborRows(site);
              if (rows.length === 0) {
                return site.cells.length > 0 ? (
                  <p className="border-t border-slate-100 px-4 py-3 text-sm text-amber-700">
                    Neighbour list is empty on this device.
                  </p>
                ) : null;
              }
              const isOpen = expanded === item.id;
              return (
                <div className="border-t border-slate-100">
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      Neighbour list — {rows.length} row
                      {rows.length === 1 ? "" : "s"} for this device
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {isOpen ? "Hide" : "Preview"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="max-h-96 overflow-auto border-t border-slate-100">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr>
                            {NEIGHBOR_COLUMNS.map((col) => (
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
                          {rows.map((entry, i) => (
                            <tr key={i} className="odd:bg-white even:bg-slate-50">
                              {NEIGHBOR_COLUMNS.map((col) => (
                                <td
                                  key={col.label}
                                  className={`whitespace-nowrap border-b border-slate-100 px-2 py-1.5 ${
                                    col.kind === "enb" || col.kind === "cellId"
                                      ? "font-semibold text-primary-700"
                                      : col.kind === "index"
                                        ? "text-slate-500"
                                        : "text-slate-800"
                                  }`}
                                >
                                  {formatCell(columnValue(col, entry, i + 1))}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        );
      })}

      {loaded.length > 0 && (
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
          Drop more XML exports here to add sites to the workbook
        </div>
      )}
    </div>
  );
}
