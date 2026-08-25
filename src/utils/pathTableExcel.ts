/**
 * Builds the workbook for a dynamic path query: an Overview sheet plus one
 * sheet per device. Each device sheet carries every table found from the given
 * path down to the end of its subtree — the queried node first, then each
 * nested table under its own blue bar — styled like the Neighbour workbook,
 * with columns discovered from the data.
 */
import {
  buildPathTableColumns,
  totalPathRows,
  type PathTableBlock,
  type PathTableColumn,
  type PathTableResult,
} from "./pathTable";
import { computeCellId, computeEnbId, type CellValue } from "./neighborList";
import {
  XLSX_MIME,
  downloadBlob,
  styleColHeaderCell,
  styleDataCell,
  styleInfoBarCell,
  styleNoteCell,
  styleSubtitleCell,
  styleTitleCell,
  uniqueSheetName,
} from "./excelCommon";

export type PathWorkbookOptions = {
  /** Add eNodeB ID / Cell ID formulas after CID in tables that have one. */
  addCidSplit: boolean;
};

/** Column width from the header plus the widest value in that column. */
function columnWidth(col: PathTableColumn, block: PathTableBlock): number {
  if (col.kind === "index") return 6;
  if (col.kind === "instance") {
    const widest = block.rows.reduce((m, r) => Math.max(m, r.instance.length), 0);
    return Math.min(30, Math.max(12, widest + 2));
  }
  if (col.kind !== "value") return 12;
  const widest = block.rows.reduce(
    (m, r) => Math.max(m, String(r.values[col.key] ?? "").length),
    0,
  );
  // Headers wrap, so they only need to cover their longest dotted part.
  const headerWord = col.label.split(".").reduce((m, w) => Math.max(m, w.length), 0);
  return Math.min(30, Math.max(9, headerWord + 2, widest + 2));
}

function cellValueFor(
  col: PathTableColumn,
  row: PathTableResult["blocks"][number]["rows"][number],
  ordinal: number,
): CellValue {
  switch (col.kind) {
    case "index":
      return ordinal;
    case "instance":
      return row.instance;
    case "value":
      return row.values[col.key] ?? "";
    case "enb":
    case "cellId":
      return ""; // written as a formula instead
  }
}

export async function buildPathWorkbook(
  tables: PathTableResult[],
  options: PathWorkbookOptions,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FemtoXML Studio";
  workbook.created = new Date();

  const queryPath = tables[0]?.path ?? "";
  const leafName = tables[0]?.leafName ?? "Table";

  // ---- Overview sheet ----
  const overview = workbook.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  overview.mergeCells("A1:G1");
  styleTitleCell(overview.getCell("A1"), `${leafName} - Summary`);
  overview.getRow(1).height = 26;

  overview.mergeCells("A2:G2");
  const subCell = overview.getCell("A2");
  subCell.value = `Source path: ${queryPath}  (path and everything below it)`;
  subCell.font = { name: "Arial", size: 9, italic: true };
  subCell.alignment = { horizontal: "center" };
  overview.getRow(2).height = 16;

  const overviewHeaders = [
    "Site ID",
    "Serial Number",
    "Source File",
    "Matches",
    "Tables",
    "Rows",
    "Max Columns",
  ];
  let orow = 4;
  overviewHeaders.forEach((h, i) => {
    styleColHeaderCell(overview.getCell(orow, i + 1), h);
  });
  orow++;

  for (const table of tables) {
    const rowVals: CellValue[] = [
      table.siteId,
      table.serial,
      table.sourceFile,
      table.matchCount,
      table.blocks.length,
      totalPathRows(table),
      table.blocks.reduce((m, b) => Math.max(m, b.columns.length), 0),
    ];
    rowVals.forEach((v, i) => {
      const c = overview.getCell(orow, i + 1);
      styleDataCell(c, v);
      if (i <= 1) c.font = { name: "Arial", size: 10, bold: true };
    });
    orow++;
  }

  // Index of every table found, so a wide subtree stays navigable.
  const perTable = new Map<string, { rows: number; columns: number }>();
  for (const table of tables) {
    for (const block of table.blocks) {
      const prev = perTable.get(block.title) ?? { rows: 0, columns: 0 };
      perTable.set(block.title, {
        rows: prev.rows + block.rows.length,
        columns: Math.max(prev.columns, block.columns.length),
      });
    }
  }

  if (perTable.size > 1) {
    orow += 2;
    overview.mergeCells(orow, 1, orow, 7);
    styleInfoBarCell(
      overview.getCell(orow, 1),
      `Tables exported from ${queryPath} (${perTable.size})`,
    );
    overview.getRow(orow).height = 20;
    orow++;

    ["Table (relative to path)", "Rows (all devices)", "Columns"].forEach((h, i) => {
      styleColHeaderCell(overview.getCell(orow, i + 1), h);
    });
    orow++;

    for (const [title, counts] of perTable) {
      styleDataCell(overview.getCell(orow, 1), title);
      overview.getCell(orow, 1).alignment = { horizontal: "left", indent: 1 };
      styleDataCell(overview.getCell(orow, 2), counts.rows);
      styleDataCell(overview.getCell(orow, 3), counts.columns);
      orow++;
    }
  }

  [14, 16, 42, 10, 10, 10, 13].forEach((w, i) => {
    overview.getColumn(i + 1).width = Math.max(overview.getColumn(i + 1).width ?? 0, w);
  });
  overview.getColumn(1).width = 42; // holds the table index names too
  overview.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];

  // ---- One sheet per device ----
  const usedNames = new Set<string>(["overview"]);

  for (const table of tables) {
    const layouts = table.blocks.map((block) => ({
      block,
      columns: buildPathTableColumns(block.columns, options.addCidSplit),
    }));
    const nCols = Math.max(3, ...layouts.map((l) => l.columns.length));
    const ws = workbook.addWorksheet(uniqueSheetName(table.siteId, usedNames, "Site"), {
      views: [{ showGridLines: false }],
    });

    ws.mergeCells(1, 1, 1, nCols);
    styleTitleCell(ws.getCell(1, 1), `${table.leafName} - Site ${table.siteId}`);
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, nCols);
    styleSubtitleCell(
      ws.getCell(2, 1),
      `Serial Number: ${table.serial}   |   Source file: ${table.sourceFile}`,
    );
    ws.getRow(2).height = 18;

    let row = 4;

    if (layouts.length === 0) {
      ws.mergeCells(row, 1, row, nCols);
      styleInfoBarCell(
        ws.getCell(row, 1),
        `${table.path}  |  Matches: 0  |  Tables: 0  |  Rows: 0`,
      );
      row++;
      ws.mergeCells(row, 1, row, nCols);
      styleNoteCell(
        ws.getCell(row, 1),
        "This path does not resolve to anything in this export.",
      );
      ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
      continue;
    }

    // Widths are per sheet column, so take the widest need across all tables.
    const widths: number[] = [];
    let firstHeaderRow = 0;

    layouts.forEach(({ block, columns }, blockIndex) => {
      const label = block.relPath
        ? `${table.path} → ${block.relPath}`
        : `${table.path}  (${block.title})`;

      ws.mergeCells(row, 1, row, nCols);
      styleInfoBarCell(
        ws.getCell(row, 1),
        `${label}  |  Rows: ${block.rows.length}  |  Columns: ${block.columns.length}`,
      );
      ws.getRow(row).height = 20;
      row++;

      if (block.rows.length === 0) {
        ws.mergeCells(row, 1, row, nCols);
        styleNoteCell(ws.getCell(row, 1), "This table is empty on this device.");
        row += 3;
        return;
      }

      const headerRow = row;
      if (blockIndex === 0) firstHeaderRow = headerRow;
      columns.forEach((col, i) => {
        styleColHeaderCell(ws.getCell(headerRow, i + 1), col.label);
        widths[i] = Math.max(widths[i] ?? 0, columnWidth(col, block));
      });
      ws.getRow(headerRow).height = 30;
      row++;

      // The eNodeB ID column is inserted directly after CID, so CID is its
      // left-hand neighbour (1-indexed; 0 means no CID split on this table).
      const enbColIndex = columns.findIndex((c) => c.kind === "enb") + 1;
      const cellIdColIndex = columns.findIndex((c) => c.kind === "cellId") + 1;
      const cidColIndex = enbColIndex > 1 ? enbColIndex - 1 : 0;

      block.rows.forEach((entry, i) => {
        const dataRow = row;

        columns.forEach((col, ci) => {
          const cell = ws.getCell(dataRow, ci + 1);
          if (col.kind === "enb" || col.kind === "cellId") {
            styleDataCell(cell, null);
          } else {
            styleDataCell(cell, cellValueFor(col, entry, i + 1));
            if (col.kind === "instance") cell.alignment = { horizontal: "left", indent: 1 };
          }
        });

        if (cidColIndex > 0) {
          const cidValue = ws.getCell(dataRow, cidColIndex).value;
          if (typeof cidValue === "number") {
            const cidAddr = ws.getCell(dataRow, cidColIndex).address;
            const cellIdCell = ws.getCell(dataRow, cellIdColIndex);
            const cellIdAddr = cellIdCell.address;
            cellIdCell.value = {
              formula: `MOD(${cidAddr},256)`,
              result: computeCellId(cidValue) as number,
            };
            ws.getCell(dataRow, enbColIndex).value = {
              formula: `(${cidAddr}-${cellIdAddr})/256`,
              result: computeEnbId(cidValue) as number,
            };
          }
        }

        row++;
      });

      const notes: string[] = [];
      if (block.omittedColumns > 0) {
        notes.push(
          `${block.omittedColumns} column(s) beyond the ${block.columns.length}-column limit were omitted.`,
        );
      }
      if (block.omittedRows > 0) {
        notes.push(`${block.omittedRows} row(s) were omitted (export limit reached).`);
      }
      if (notes.length > 0) {
        ws.mergeCells(row, 1, row, nCols);
        styleNoteCell(ws.getCell(row, 1), notes.join("  "));
        row++;
      }

      row += 2; // spacing before the next table
    });

    const trailing: string[] = [];
    if (table.skippedTables.length > 0) {
      trailing.push(
        `Not exported: ${table.skippedTables.join(", ")} — point the path at them directly.`,
      );
    }
    if (table.hitCellLimit) {
      trailing.push("Export limit reached; narrow the path for the full subtree.");
    }
    if (trailing.length > 0) {
      ws.mergeCells(row, 1, row, nCols);
      styleNoteCell(ws.getCell(row, 1), trailing.join("  "));
    }

    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    // A single table keeps its header frozen; stacked tables freeze the header
    // block instead, since only one header row could ever stay visible.
    ws.views = [
      {
        state: "frozen",
        ySplit: layouts.length === 1 && firstHeaderRow > 0 ? firstHeaderRow : 2,
        showGridLines: false,
      },
    ];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

export async function downloadPathWorkbook(
  tables: PathTableResult[],
  fileName: string,
  options: PathWorkbookOptions,
): Promise<void> {
  const blob = await buildPathWorkbook(tables, options);
  downloadBlob(blob, fileName, "Path_Table");
}
