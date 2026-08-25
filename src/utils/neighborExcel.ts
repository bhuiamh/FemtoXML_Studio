/**
 * Builds the "Neighbor List In Use" .xlsx workbook: one Overview sheet plus one
 * sheet per device (one XML export = one eNodeB), each holding a single styled
 * neighbour table for the whole device, whether it carries one band or two.
 *
 * The two trailing columns are written as live Excel formulas so engineers can
 * edit a CID in the sheet and see the split update:
 *   Cell ID   = MOD(CID, 256)
 *   eNodeB ID = (CID - Cell ID) / 256
 */
import type { Cell } from "exceljs";
import {
  NEIGHBOR_COLUMNS,
  bandLabel,
  columnValue,
  computeCellId,
  computeEnbId,
  deviceNeighborRows,
  deviceSummary,
  type NeighborSite,
  type CellValue,
} from "./neighborList";

const NYBSYS_BLUE = "FF4274AC";
const SUBTITLE_BLUE = "FF6E93BE";
const BAND_HEADER_BLUE = "FF4274AC";
const COL_HEADER_BLUE = "FF2E5A8C";
const BORDER_GREY = { style: "thin" as const, color: { argb: "FFBFBFBF" } };

type AnyCell = Cell;

function styleTitleCell(cell: AnyCell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NYBSYS_BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleSubtitleCell(cell: AnyCell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTITLE_BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleBandHeaderCell(cell: AnyCell, text: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_HEADER_BLUE } };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
}

function styleColHeaderCell(cell: AnyCell, text: string) {
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

function styleDataCell(cell: AnyCell, value: CellValue | null) {
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

/** Excel sheet names: max 31 chars, no []:*?/\ — and unique within the workbook. */
function uniqueSheetName(rawName: string, used: Set<string>): string {
  const base = rawName.replace(/[[\]:*?/\\]/g, "").substring(0, 31) || "Site";
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

export async function buildNeighborWorkbook(sites: NeighborSite[]): Promise<Blob> {
  // Loaded on demand: ExcelJS is only needed when a workbook is actually built,
  // so it stays out of the initial app bundle.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FemtoXML Studio";
  workbook.created = new Date();

  // ---- Overview sheet ----
  const overview = workbook.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  overview.mergeCells("A1:F1");
  styleTitleCell(
    overview.getCell("A1"),
    "Femtocell LTE Neighbor List In Use - Summary",
  );
  overview.getRow(1).height = 26;

  overview.mergeCells("A2:F2");
  const subCell = overview.getCell("A2");
  subCell.value =
    "Source path: Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell";
  subCell.font = { name: "Arial", size: 9, italic: true };
  subCell.alignment = { horizontal: "center" };
  overview.getRow(2).height = 16;

  // One row per device (one XML export = one eNodeB device).
  const overviewHeaders = [
    "Site ID",
    "Serial Number",
    "Band(s)",
    "Serving EARFCN",
    "Serving PhyCellID",
    "Cells",
    "Neighbor Count",
  ];
  const headerRowIdx = 4;
  overviewHeaders.forEach((h, i) => {
    styleColHeaderCell(overview.getCell(headerRowIdx, i + 1), h);
  });

  let orow = headerRowIdx + 1;
  for (const site of sites) {
    const summary = deviceSummary(site);
    const rowVals: CellValue[] = [
      site.siteId,
      site.serial,
      summary.bands,
      summary.earfcns,
      summary.pcis,
      summary.cellCount,
      summary.neighborCount,
    ];
    rowVals.forEach((v, i) => {
      const c = overview.getCell(orow, i + 1);
      styleDataCell(c, v);
      if (i <= 1) c.font = { name: "Arial", size: 10, bold: true };
    });
    orow++;
  }

  [14, 16, 32, 16, 18, 8, 16].forEach((w, i) => {
    overview.getColumn(i + 1).width = w;
  });
  overview.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];

  // ---- One sheet per device ----
  const columns = NEIGHBOR_COLUMNS;
  const nCols = columns.length;
  const usedNames = new Set<string>(["overview"]);
  // 1-indexed column positions of CID and the two columns derived from it.
  const cidColIndex =
    columns.findIndex((c) => c.kind === "field" && c.key === "CID") + 1;
  const enbIdColIndex = columns.findIndex((c) => c.kind === "enb") + 1;
  const cellIdColIndex = columns.findIndex((c) => c.kind === "cellId") + 1;

  for (const site of sites) {
    const ws = workbook.addWorksheet(uniqueSheetName(site.siteId, usedNames), {
      views: [{ showGridLines: false }],
    });

    ws.mergeCells(1, 1, 1, nCols);
    styleTitleCell(
      ws.getCell(1, 1),
      `Neighbor List In Use (LTE) - Site ${site.siteId}`,
    );
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, nCols);
    styleSubtitleCell(
      ws.getCell(2, 1),
      `Serial Number: ${site.serial}   |   Source file: ${site.sourceFile}`,
    );
    ws.getRow(2).height = 18;

    let row = 4;

    // One info bar per cell the device carries (single-band devices get one,
    // dual-band devices get two), then a single neighbour table for the device.
    if (site.cells.length === 0) {
      ws.mergeCells(row, 1, row, nCols);
      const c = ws.getCell(row, 1);
      c.value =
        "No LTE FAPService instance found in this export (Device.Services.FAPService.{n}.CellConfig.LTE.RAN is missing).";
      c.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF808080" } };
      row++;
    }

    for (const cell of site.cells) {
      ws.mergeCells(row, 1, row, nCols);
      styleBandHeaderCell(
        ws.getCell(row, 1),
        `${bandLabel(cell.band)}  |  Serving EARFCN: ${cell.earfcnDl}  |  Serving PhyCellID: ${cell.servingPci}  |  Neighbor Count: ${cell.neighbors.length}`,
      );
      ws.getRow(row).height = 20;
      row++;
    }

    const deviceRows = deviceNeighborRows(site);

    if (deviceRows.length === 0) {
      // A device with no LTE cell already said so above — don't repeat it.
      if (site.cells.length > 0) {
        ws.mergeCells(row, 1, row, nCols);
        const c = ws.getCell(row, 1);
        c.value = "No neighbor entries in use on this device (list is empty).";
        c.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF808080" } };
      }
    } else {
      const headerRow = row;
      columns.forEach((col, i) => {
        styleColHeaderCell(ws.getCell(headerRow, i + 1), col.label);
      });
      ws.getRow(headerRow).height = 26;
      row++;

      deviceRows.forEach((entry, i) => {
        const dataRow = row;
        const cid = entry.values.CID;

        columns.forEach((col, ci) => {
          const cell = ws.getCell(dataRow, ci + 1);
          if (col.kind === "enb" || col.kind === "cellId") {
            styleDataCell(cell, null);
          } else {
            styleDataCell(cell, columnValue(col, entry, i + 1));
          }
        });

        const cidCellAddr = ws.getCell(dataRow, cidColIndex).address;
        const cellIdCell = ws.getCell(dataRow, cellIdColIndex);
        const enbIdCell = ws.getCell(dataRow, enbIdColIndex);

        // Only emit formulas for a numeric CID — MOD("",256) would show #VALUE!.
        // The cached result keeps the split readable in viewers that don't
        // recalculate; Excel refreshes it as soon as a CID is edited.
        if (typeof cid === "number") {
          const cellIdAddr = cellIdCell.address;
          cellIdCell.value = {
            formula: `MOD(${cidCellAddr},256)`,
            result: computeCellId(cid) as number,
          };
          enbIdCell.value = {
            formula: `(${cidCellAddr}-${cellIdAddr})/256`,
            result: computeEnbId(cid) as number,
          };
        }

        row++;
      });
    }

    // Freeze the header row of the table as well as the sheet's title block.
    const frozenRows = site.cells.length + 4;
    columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width;
    });
    ws.views = [{ state: "frozen", ySplit: frozenRows, showGridLines: false }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Build the workbook and hand it to the browser as a download. */
export async function downloadNeighborWorkbook(
  sites: NeighborSite[],
  fileName: string,
): Promise<void> {
  const blob = await buildNeighborWorkbook(sites);
  const safeName = fileName.trim().replace(/[\\/:*?"<>|]/g, "_") || "Neighbor_List";
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
