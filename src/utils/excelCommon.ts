/**
 * Shared workbook styling used by every Excel export in the app, so the
 * generated sheets look the same wherever they come from.
 */
import type { Cell } from "exceljs";
import type { CellValue } from "./neighborList";

const NYBSYS_BLUE = "FF4274AC";
const SUBTITLE_BLUE = "FF6E93BE";
const INFO_BAR_BLUE = "FF4274AC";
const COL_HEADER_BLUE = "FF2E5A8C";
const MUTED_GREY = "FF808080";
const BORDER_GREY = { style: "thin" as const, color: { argb: "FFBFBFBF" } };

export function styleTitleCell(cell: Cell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NYBSYS_BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

export function styleSubtitleCell(cell: Cell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTITLE_BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

/** Full-width blue bar introducing a block of rows (band, path, group…). */
export function styleInfoBarCell(cell: Cell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INFO_BAR_BLUE } };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
}

export function styleColHeaderCell(cell: Cell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COL_HEADER_BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = {
    top: BORDER_GREY,
    left: BORDER_GREY,
    bottom: BORDER_GREY,
    right: BORDER_GREY,
  };
}

export function styleDataCell(cell: Cell, value: CellValue | null) {
  if (value !== null) cell.value = value;
  cell.font = { name: "Arial", size: 9 };
  cell.alignment = { horizontal: "center" };
  cell.border = {
    top: BORDER_GREY,
    left: BORDER_GREY,
    bottom: BORDER_GREY,
    right: BORDER_GREY,
  };
}

/** Grey italic note used where a table would otherwise be. */
export function styleNoteCell(cell: Cell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 10, italic: true, color: { argb: MUTED_GREY } };
}

/** Excel sheet names: max 31 chars, no []:*?/\ — and unique within the workbook. */
export function uniqueSheetName(
  rawName: string,
  used: Set<string>,
  fallback = "Sheet",
): string {
  const base = rawName.replace(/[[\]:*?/\\]/g, "").substring(0, 31) || fallback;
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const candidate = base.substring(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return base.substring(0, 28) + "_x";
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Hand a generated workbook to the browser as a download. */
export function downloadBlob(blob: Blob, fileName: string, fallback: string) {
  const safeName = fileName.trim().replace(/[\\/:*?"<>|]/g, "_") || fallback;
  const withExt = /\.xlsx$/i.test(safeName) ? safeName : `${safeName}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = withExt;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
