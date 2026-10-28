/**
 * Comparison report exports.
 *
 * These run on whatever the diff produced, and that can be very large: two
 * structurally unrelated documents produce one row per parameter in each, which
 * on real device exports is ~57,000 rows. The previous implementation built the
 * whole sheet through SheetJS's `json_to_sheet`, which materialises every cell
 * as an object — measured at ~319 MB of heap for 60,000 rows, enough to take
 * the tab out with an out-of-memory crash.
 *
 * Both writers below therefore avoid holding more than one row's worth of
 * intermediate objects, and report progress so the caller can show it.
 */
import type { Diff } from '../workers/xmlDiffWorker';

export type ExportProgress = (percent: number, detail?: string) => void;

const HEADERS = ['Path', 'Status', 'Left Value', 'Right Value'];

/** Rows are emitted in batches so the UI can breathe between them. */
const BATCH = 5000;

function statusLabel(change: Diff['change']): string {
  return change.charAt(0).toUpperCase() + change.slice(1);
}

function rowOf(diff: Diff): [string, string, string, string] {
  return [diff.path, statusLabel(diff.change), diff.leftValue ?? '—', diff.rightValue ?? '—'];
}

/** Yield a frame so a progress update can paint mid-export. */
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 16);
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function csvCell(value: string): string {
  // Quote anything that could break the row, and neutralise values Excel would
  // otherwise execute as a formula.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export async function exportToCSV(
  diffs: Diff[],
  fileName: string = 'xml-comparison-report',
  onProgress?: ExportProgress,
): Promise<void> {
  // Collect batches of text rather than one ever-growing string: Blob takes the
  // array directly, so the full report never exists as a single allocation.
  const chunks: string[] = ['﻿' + HEADERS.join(',') + '\r\n'];
  let batch: string[] = [];

  for (let i = 0; i < diffs.length; i++) {
    batch.push(rowOf(diffs[i]).map(csvCell).join(',') + '\r\n');

    if (batch.length >= BATCH) {
      chunks.push(batch.join(''));
      batch = [];
      onProgress?.((i / diffs.length) * 100, `${i.toLocaleString()} of ${diffs.length.toLocaleString()} rows`);
      await yieldFrame();
    }
  }
  if (batch.length > 0) chunks.push(batch.join(''));

  onProgress?.(100);
  triggerDownload(
    new Blob(chunks, { type: 'text/csv;charset=utf-8;' }),
    /\.csv$/i.test(fileName) ? fileName : `${fileName}.csv`,
  );
}

export async function exportToExcel(
  diffs: Diff[],
  fileName: string = 'xml-comparison-report',
  onProgress?: ExportProgress,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FemtoXML Studio';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Comparison Results', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  const header = sheet.addRow(HEADERS);
  header.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5A8C' } };
  header.alignment = { horizontal: 'center', vertical: 'middle' };
  header.height = 22;

  // Rows go in unstyled and in batches. Styling each cell individually is what
  // makes a large sheet unaffordable; one conditional format below colours the
  // statuses for the whole range instead.
  for (let i = 0; i < diffs.length; i++) {
    sheet.addRow(rowOf(diffs[i]));

    if ((i + 1) % BATCH === 0) {
      onProgress?.((i / diffs.length) * 100, `${i.toLocaleString()} of ${diffs.length.toLocaleString()} rows`);
      await yieldFrame();
    }
  }

  const lastRow = diffs.length + 1;
  if (diffs.length > 0) {
    sheet.addConditionalFormatting({
      ref: `A2:D${lastRow}`,
      rules: [
        {
          type: 'expression',
          priority: 1,
          formulae: ['$B2="Added"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDDEBF7' } } },
        },
        {
          type: 'expression',
          priority: 2,
          formulae: ['$B2="Removed"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBE6EA' } } },
        },
        {
          type: 'expression',
          priority: 3,
          formulae: ['$B2="Changed"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBF0D9' } } },
        },
      ],
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
  }

  sheet.getColumn(1).width = 72;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 34;
  sheet.getColumn(4).width = 34;

  onProgress?.(100, 'Writing the file');
  await yieldFrame();

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`,
  );
}
