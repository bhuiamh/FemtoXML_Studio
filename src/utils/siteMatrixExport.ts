/**
 * Exporters for the site configuration matrix: a plain CSV, and a styled
 * workbook where mismatching rows are highlighted by conditional formatting
 * (one rule over the whole range, so a 25,000-row sheet stays small and fast).
 */
import type { SiteMatrix } from "./siteMatrix";
import { XLSX_MIME, downloadBlob, styleColHeaderCell } from "./excelCommon";

const STATUS_LABEL: Record<string, string> = {
  match: "Match",
  mismatch: "Mismatch",
  missing: "Missing",
};

/** Header row shared by both exports. */
function headerRow(matrix: SiteMatrix): string[] {
  return [
    "Parameter Path",
    "Parameter",
    ...matrix.sites.map((s) => s.label),
    "Status",
    "Distinct",
    "Sites With Value",
  ];
}

function bodyRow(matrix: SiteMatrix, row: SiteMatrix["rows"][number]): (string | number)[] {
  return [
    row.path,
    row.name,
    ...row.values.map((v) => (v === null ? "" : v)),
    STATUS_LABEL[row.status] ?? row.status,
    row.distinct,
    `${row.present}/${matrix.sites.length}`,
  ];
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  // Quote when the value could break the row, and guard against spreadsheet
  // formula injection from values that begin with =, +, - or @.
  const needsQuote = /[",\n\r]/.test(text);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return needsQuote ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildMatrixCsv(matrix: SiteMatrix): string {
  const lines = [headerRow(matrix).map(csvCell).join(",")];
  for (const row of matrix.rows) {
    lines.push(bodyRow(matrix, row).map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

export function downloadMatrixCsv(matrix: SiteMatrix, fileName: string): void {
  const csv = buildMatrixCsv(matrix);
  // BOM so Excel opens UTF-8 correctly on Windows.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const safe = fileName.trim().replace(/[\\/:*?"<>|]/g, "_") || "Site_Configuration";
  const withExt = /\.csv$/i.test(safe) ? safe : `${safe}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = withExt;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const MISMATCH_FILL = "FFFDE2E2"; // light rose
const MISSING_FILL = "FFFFF3CD"; // light amber

export async function buildMatrixWorkbook(matrix: SiteMatrix): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FemtoXML Studio";
  workbook.created = new Date();

  // ---- Summary sheet ----
  const summary = workbook.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  ["Site ID", "Serial Number", "Source File", "Parameters"].forEach((h, i) => {
    styleColHeaderCell(summary.getCell(1, i + 1), h);
  });
  matrix.sites.forEach((site, i) => {
    const row = summary.getRow(i + 2);
    row.getCell(1).value = site.label;
    row.getCell(2).value = site.serial;
    row.getCell(3).value = site.sourceFile;
    row.getCell(4).value = site.values.size;
    row.getCell(1).font = { name: "Arial", size: 10, bold: true };
  });
  [18, 16, 44, 12].forEach((w, i) => {
    summary.getColumn(i + 1).width = w;
  });

  let srow = matrix.sites.length + 3;
  ["Result", "Parameters"].forEach((h, i) => {
    styleColHeaderCell(summary.getCell(srow, i + 1), h);
  });
  srow++;
  (
    [
      ["Identical across all sites", matrix.totals.match],
      ["Mismatched", matrix.totals.mismatch],
      ["Missing on some sites", matrix.totals.missing],
      ["Hidden as volatile (alarms, counters, timestamps…)", matrix.totals.hidden],
      ["Rows in this export", matrix.rows.length],
    ] as [string, number][]
  ).forEach(([label, value]) => {
    summary.getCell(srow, 1).value = label;
    summary.getCell(srow, 2).value = value;
    srow++;
  });

  // ---- Matrix sheet ----
  const ws = workbook.addWorksheet("Configuration", { views: [{ showGridLines: false }] });
  const headers = headerRow(matrix);
  headers.forEach((h, i) => styleColHeaderCell(ws.getCell(1, i + 1), h));
  ws.getRow(1).height = 24;

  // Bulk insert: styling every one of ~200k cells individually would be slow,
  // so the rows go in plain and the highlighting comes from one conditional
  // formatting rule over the whole range.
  for (const row of matrix.rows) {
    ws.addRow(bodyRow(matrix, row));
  }

  const lastRow = matrix.rows.length + 1;
  const lastCol = headers.length;
  const statusCol = lastCol - 2;
  const statusLetter = ws.getColumn(statusCol).letter;
  const range = `A2:${ws.getColumn(lastCol).letter}${Math.max(lastRow, 2)}`;

  ws.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`$${statusLetter}2="Mismatch"`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: MISMATCH_FILL } } },
      },
      {
        type: "expression",
        priority: 2,
        formulae: [`$${statusLetter}2="Missing"`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: MISSING_FILL } } },
      },
    ],
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastCol } };
  // Freeze the header and the two identifying columns so site values stay
  // readable when scrolling right across many sites.
  ws.views = [
    { state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2", showGridLines: false },
  ];

  ws.getColumn(1).width = 68;
  ws.getColumn(2).width = 26;
  matrix.sites.forEach((site, i) => {
    ws.getColumn(3 + i).width = Math.max(14, Math.min(28, site.label.length + 4));
  });
  ws.getColumn(statusCol).width = 11;
  ws.getColumn(lastCol - 1).width = 9;
  ws.getColumn(lastCol).width = 15;
  ws.getColumn(1).font = { name: "Arial", size: 9 };
  ws.getColumn(2).font = { name: "Arial", size: 9, bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

export async function downloadMatrixWorkbook(
  matrix: SiteMatrix,
  fileName: string,
): Promise<void> {
  const blob = await buildMatrixWorkbook(matrix);
  downloadBlob(blob, fileName, "Site_Configuration");
}
