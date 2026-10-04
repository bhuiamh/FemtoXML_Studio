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
  allNeighborEarfcns,
  columnValue,
  computeCellId,
  computeEnbId,
  deviceNeighborRows,
  deviceSummary,
  neighborEarfcnCounts,
  bandLabel,
  type NeighborSite,
  type CellValue,
} from "./neighborList";
import {
  XLSX_MIME,
  downloadBlob,
  styleColHeaderCell,
  styleInfoBarCell,
  styleDataCell,
  styleNoteCell,
  styleSubtitleCell,
  styleTitleCell,
  uniqueSheetName,
} from "./excelCommon";

/**
 * One colour per neighbour EARFCN column, so a carrier can be picked out at a
 * glance across every site. Cycles when a workbook carries more EARFCNs than
 * the palette has entries.
 */
const EARFCN_COLOURS: { head: string; body: string }[] = [
  { head: "FF2E75B6", body: "FFDDEBF7" }, // blue
  { head: "FFC55A11", body: "FFFCE4D6" }, // orange
  { head: "FF548235", body: "FFE2EFDA" }, // green
  { head: "FFBF8F00", body: "FFFFF2CC" }, // gold
  { head: "FF7030A0", body: "FFEAE1F2" }, // purple
  { head: "FF1F7A7A", body: "FFD9F0F0" }, // teal
  { head: "FF9E3B3B", body: "FFF5DEDE" }, // brick
  { head: "FF305496", body: "FFD9E1F2" }, // indigo
];

const BORDER = { style: "thin" as const, color: { argb: "FFBFBFBF" } };

/** Column header carrying its EARFCN's own colour rather than the sheet blue. */
function styleEarfcnHeader(cell: Cell, text: string, colour: string) {
  cell.value = text;
  cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colour } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

/** Count cell tinted with its EARFCN's shade; blank when the site has none. */
function styleEarfcnCount(cell: Cell, count: number, colour: string) {
  if (count > 0) cell.value = count;
  cell.font = { name: "Arial", size: 9, bold: count > 0 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colour } };
  cell.alignment = { horizontal: "center" };
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

export async function buildNeighborWorkbook(sites: NeighborSite[]): Promise<Blob> {
  // Loaded on demand: ExcelJS is only needed when a workbook is actually built,
  // so it stays out of the initial app bundle.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FemtoXML Studio";
  workbook.created = new Date();

  // ---- Overview sheet ----
  // One row per device, then one tinted column per neighbour EARFCN carrying
  // how many of that device's neighbours sit on that carrier.
  const earfcns = allNeighborEarfcns(sites);
  const overviewCols = 7 + earfcns.length;
  const overview = workbook.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  const lastOverviewCol = overview.getColumn(overviewCols).letter;

  overview.mergeCells(`A1:${lastOverviewCol}1`);
  styleTitleCell(
    overview.getCell("A1"),
    "Femtocell LTE Neighbor List In Use - Summary",
  );
  overview.getRow(1).height = 26;

  overview.mergeCells(`A2:${lastOverviewCol}2`);
  const subCell = overview.getCell("A2");
  subCell.value =
    "Source path: Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell";
  subCell.font = { name: "Arial", size: 9, italic: true };
  subCell.alignment = { horizontal: "center" };
  overview.getRow(2).height = 16;

  // Group label sitting above the per-EARFCN block.
  if (earfcns.length > 0) {
    overview.mergeCells(3, 8, 3, overviewCols);
    styleInfoBarCell(
      overview.getCell(3, 8),
      `Neighbour count per EARFCN  (${earfcns.length} carrier${earfcns.length === 1 ? "" : "s"})`,
    );
    overview.getCell(3, 8).alignment = { horizontal: "center", vertical: "middle" };
    overview.getRow(3).height = 18;
  }

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
  earfcns.forEach((earfcn, i) => {
    const colour = EARFCN_COLOURS[i % EARFCN_COLOURS.length];
    styleEarfcnHeader(overview.getCell(headerRowIdx, 8 + i), `EARFCN ${earfcn}`, colour.head);
  });
  overview.getRow(headerRowIdx).height = 26;

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

    const counts = neighborEarfcnCounts(site);
    earfcns.forEach((earfcn, i) => {
      const colour = EARFCN_COLOURS[i % EARFCN_COLOURS.length];
      styleEarfcnCount(overview.getCell(orow, 8 + i), counts.get(earfcn) ?? 0, colour.body);
    });
    orow++;
  }

  // Totals, so a carrier's share across the whole batch reads off the bottom.
  if (sites.length > 1 && earfcns.length > 0) {
    const totalRow = orow;
    styleDataCell(overview.getCell(totalRow, 1), "All sites");
    overview.getCell(totalRow, 1).font = { name: "Arial", size: 10, bold: true };
    for (let c = 2; c <= 6; c++) styleDataCell(overview.getCell(totalRow, c), "");
    styleDataCell(
      overview.getCell(totalRow, 7),
      sites.reduce((sum, s) => sum + deviceSummary(s).neighborCount, 0),
    );
    overview.getCell(totalRow, 7).font = { name: "Arial", size: 9, bold: true };
    earfcns.forEach((earfcn, i) => {
      const colour = EARFCN_COLOURS[i % EARFCN_COLOURS.length];
      const total = sites.reduce(
        (sum, s) => sum + (neighborEarfcnCounts(s).get(earfcn) ?? 0),
        0,
      );
      styleEarfcnCount(overview.getCell(totalRow, 8 + i), total, colour.body);
    });
  }

  [14, 16, 32, 16, 18, 8, 16].forEach((w, i) => {
    overview.getColumn(i + 1).width = w;
  });
  earfcns.forEach((earfcn, i) => {
    overview.getColumn(8 + i).width = Math.max(12, earfcn.length + 9);
  });
  overview.views = [
    { state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", showGridLines: false },
  ];

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
      styleNoteCell(
        ws.getCell(row, 1),
        "No LTE FAPService instance found in this export " +
          "(Device.Services.FAPService.{n}.CellConfig.LTE.RAN is missing).",
      );
      row++;
    }

    for (const cell of site.cells) {
      ws.mergeCells(row, 1, row, nCols);
      styleInfoBarCell(
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
        styleNoteCell(
          ws.getCell(row, 1),
          "No neighbor entries in use on this device (list is empty).",
        );
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
  return new Blob([buffer], { type: XLSX_MIME });
}

/** Build the workbook and hand it to the browser as a download. */
export async function downloadNeighborWorkbook(
  sites: NeighborSite[],
  fileName: string,
): Promise<void> {
  const blob = await buildNeighborWorkbook(sites);
  downloadBlob(blob, fileName, "Neighbor_List");
}
