import { useState, useRef } from "react";
import { xml2js, js2xml } from "xml-js";
import * as XLSX from "xlsx";
import {
  type EditableNode,
  buildEditableTree,
  buildXmlFromEditable,
  setNodeValueByPath,
} from "../utils/xmlTree";

type BulkResult = {
  path: string;
  value: string;
  status: "updated" | "not_found";
};

export default function BulkXmlEditor() {
  const [xmlContent, setXmlContent] = useState("");
  const [xmlFileName, setXmlFileName] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [editedTree, setEditedTree] = useState<EditableNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const pathHeaderNames = [
    "parameter path",
    "full parameter path",
    "path",
    "parameterpath",
    "param path",
    "full path",
  ];
  const valueHeaderNames = ["value", "values", "new value", "newvalue"];

  function findPathAndValueColumns(
    rows: (string | number)[][],
  ): { pathCol: number; valueCol: number; dataStartRow: number } | null {
    if (rows.length === 0) return null;
    const first = rows[0].map((c) => String(c ?? "").toLowerCase().trim());
    const pathCol = first.findIndex((h) =>
      pathHeaderNames.some((p) => h.includes(p) || p.includes(h)),
    );
    const valueCol = first.findIndex((h) =>
      valueHeaderNames.some((v) => h.includes(v) || v.includes(h)),
    );
    if (pathCol >= 0 && valueCol >= 0 && pathCol !== valueCol) {
      return { pathCol, valueCol, dataStartRow: 1 };
    }
    return { pathCol: 0, valueCol: 1, dataStartRow: 0 };
  }

  const handleXmlLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setXmlFileName(file.name);
    setError(null);
    setResults([]);
    setEditedTree(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result?.toString() ?? "";
      setXmlContent(content);
    };
    reader.readAsText(file);
  };

  const handleExcelLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelFile(file);
    setError(null);
    setResults([]);
    setEditedTree(null);
  };

  const runBulkEdit = () => {
    if (!xmlContent.trim()) {
      setError("Please load an XML file first.");
      return;
    }

    if (!excelFile) {
      setError("Please load an Excel file with Parameter path and Value columns.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Failed to read Excel file.");
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        });
        const colInfo = findPathAndValueColumns(rows);
        if (!colInfo) {
          setError("Excel must have at least two columns (Parameter path and Value).");
          setIsProcessing(false);
          return;
        }

        const { pathCol, valueCol, dataStartRow } = colInfo;
        const updates: { path: string; value: string }[] = [];
        for (let i = dataStartRow; i < rows.length; i++) {
          const row = rows[i] ?? [];
          const path = String(row[pathCol] ?? "").trim();
          const value = String(row[valueCol] ?? "").trim();
          if (path) updates.push({ path, value });
        }

        const parsed = xml2js(xmlContent, {
          compact: false,
          ignoreDeclaration: true,
        });
        const rootElements = (parsed as any).elements ?? [];
        const tree = buildEditableTree(rootElements);
        const treeCopy = JSON.parse(JSON.stringify(tree)) as EditableNode[];

        const resultList: BulkResult[] = [];
        for (const { path, value } of updates) {
          const found = setNodeValueByPath(treeCopy, path, value);
          resultList.push({
            path,
            value,
            status: found ? "updated" : "not_found",
          });
        }

        setResults(resultList);
        setEditedTree(treeCopy);
      } catch (err) {
        setError((err as Error).message);
        setResults([]);
        setEditedTree(null);
      }
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(excelFile);
  };

  const handleDownloadResult = () => {
    if (!editedTree) return;
    try {
      const xmlElements = buildXmlFromEditable(editedTree);
      const xmlObj = { elements: xmlElements };
      const xmlString = js2xml(xmlObj, { compact: false, spaces: 2 });
      const blob = new Blob([xmlString], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = xmlFileName ? `bulk-edited-${xmlFileName}` : "bulk-edited.xml";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to generate XML: ${(err as Error).message}`);
    }
  };

  const updatedCount = results.filter((r) => r.status === "updated").length;
  const notFoundCount = results.filter((r) => r.status === "not_found").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
        <p className="text-[13px] leading-relaxed text-ink-2">
          Load an XML file and an Excel file with two columns: <strong>Parameter path</strong> and <strong>Value</strong>.
          Paths can use dots or slashes (e.g. <code className="rounded bg-line px-1">Root.Child.Param</code> or <code className="rounded bg-line px-1">Root/Child/Param</code>).
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface h-9 px-3.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-sunk">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Load XML File
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml"
            onChange={handleXmlLoad}
            className="hidden"
          />
        </label>
        {xmlFileName && (
          <span className="text-sm text-ink-2">XML: {xmlFileName}</span>
        )}

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface h-9 px-3.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-sunk">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Load Excel File
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelLoad}
            className="hidden"
          />
        </label>
        {excelFileName && (
          <span className="text-sm text-ink-2">Excel: {excelFileName}</span>
        )}

        <button
          onClick={runBulkEdit}
          disabled={!xmlContent.trim() || !excelFile || isProcessing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-accent to-accent-deep h-9 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-line disabled:to-line disabled:text-ink-3"
        >
          {isProcessing ? "Applying…" : "Apply Excel to XML"}
        </button>

        {editedTree && (
          <button
            onClick={handleDownloadResult}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface h-9 px-3.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-sunk"
          >
            Download Edited XML
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-bad/35 bg-bad-soft p-4 text-sm text-bad">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mb-6 rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 text-lg font-semibold text-ink">Result summary</h2>
          <p className="text-sm text-ink-2">
            <span className="font-medium text-ok">{updatedCount} updated</span>
            {notFoundCount > 0 && (
              <> · <span className="font-medium text-warn">{notFoundCount} path(s) not found</span></>
            )}
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-line-soft">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-sunk">
                <tr>
                  <th className="border-b border-line px-3 py-2 font-semibold text-ink-2">Parameter path</th>
                  <th className="border-b border-line px-3 py-2 font-semibold text-ink-2">Value</th>
                  <th className="border-b border-line px-3 py-2 font-semibold text-ink-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-line-soft">
                    <td className="px-3 py-1.5 font-mono text-ink">{r.path}</td>
                    <td className="px-3 py-1.5 text-ink-2">{r.value}</td>
                    <td className="px-3 py-1.5">
                      {r.status === "updated" ? (
                        <span className="text-ok">Updated</span>
                      ) : (
                        <span className="text-warn">Not found</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!xmlContent.trim() && (
        <div className="rounded-lg border-2 border-dashed border-line bg-surface-sunk p-12 text-center">
          <p className="text-sm text-ink-2">
            Load an XML file and an Excel file, then click &quot;Apply Excel to XML&quot; to replace values by parameter path.
          </p>
          <p className="mt-2 text-xs text-ink-3">
            Excel: first column = full parameter path (e.g. Root.Section.Param or Root/Section/Param), second column = new value.
          </p>
        </div>
      )}
    </div>
  );
}
