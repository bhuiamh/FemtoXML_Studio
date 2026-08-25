/**
 * Generic TR-069 path → table extraction.
 *
 * Give any parameter path, e.g.
 *   Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell
 * and this resolves it against a device XML export and turns whatever it finds
 * into tables:
 *
 *   - `{n}` (also `{i}`, `*`, `i*`) matches every indexed instance (i1, i2, …)
 *   - `i2` / `2` matches one specific instance
 *   - `.` and `/` both work as separators, a leading `Device` is optional
 *
 * Everything from the given path down to the end of the subtree is exported.
 * The node the path lands on becomes the first table — one row per indexed
 * entry if it is a TR-069 table, otherwise a single row of its parameters — and
 * every nested table below it becomes a table of its own, named by its path
 * relative to the queried node. Plain parameter groups are not separate tables:
 * their leaves are flattened into dotted columns (`Common.CellIdentity`).
 */
import { coerceValue, parseFileName, type CellValue } from "./neighborList";

/** Hard stops so a badly aimed path can't produce an unusable sheet. */
export const MAX_COLUMNS = 2000;
export const MAX_ROWS = 5000;
export const MAX_TABLES = 60;
export const MAX_TOTAL_CELLS = 500_000;
const MAX_DEPTH = 12;

export type PathSegment =
  | { kind: "tag"; name: string }
  | { kind: "wildcard" }
  | { kind: "instance"; index: number };

export type PathTableRow = {
  /** Resolved instance path of the row, e.g. "FAPService.1 / LTECell.3". */
  instance: string;
  values: Record<string, CellValue>;
};

export type PathTableBlock = {
  /** Path relative to the queried node; "" for the queried node itself. */
  relPath: string;
  /** Display name: the queried node's own name, or the relative path. */
  title: string;
  columns: string[];
  rows: PathTableRow[];
  omittedColumns: number;
  omittedRows: number;
};

export type PathTableResult = {
  siteId: string;
  serial: string;
  sourceFile: string;
  /** The path as typed (normalised), and the leaf name used for titles. */
  path: string;
  leafName: string;
  /** First entry is the queried node; the rest are nested tables. */
  blocks: PathTableBlock[];
  /** How many elements the path resolved to. */
  matchCount: number;
  /** Nested tables left out: by MAX_TABLES, or because expansion was off. */
  skippedTables: string[];
  /** True when MAX_TOTAL_CELLS stopped the export early. */
  hitCellLimit: boolean;
};

export type ExtractOptions = {
  /** Export nested tables below the path as their own tables (default true). */
  includeChildTables?: boolean;
};

/** Parse a path into segments. Throws when nothing usable is left. */
export function parsePathSpec(path: string): PathSegment[] {
  const raw = path
    .trim()
    .split(/[./]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (raw.length === 0) {
    throw new Error(
      "Enter a parameter path, e.g. Device.Services.FAPService.{n}.CellConfig.LTE",
    );
  }

  // The XML root element is <Device>, so a leading "Device." is optional.
  const parts = raw[0].toLowerCase() === "device" ? raw.slice(1) : raw;
  if (parts.length === 0) {
    throw new Error("Path needs at least one segment below Device.");
  }

  return parts.map((part) => {
    if (/^\{.*\}$/.test(part) || part === "*" || part === "i*" || part === "#") {
      return { kind: "wildcard" as const };
    }
    const instance = part.match(/^i?(\d+)$/i);
    if (instance) {
      return { kind: "instance" as const, index: parseInt(instance[1], 10) };
    }
    return { kind: "tag" as const, name: part };
  });
}

/** Human-readable form of the parsed path, used in sheet headers. */
export function formatPathSpec(segments: PathSegment[]): string {
  return [
    "Device",
    ...segments.map((s) =>
      s.kind === "tag" ? s.name : s.kind === "wildcard" ? "{n}" : `i${s.index}`,
    ),
  ].join(".");
}

/** Last plain tag in the path — "LTECell" for the neighbour list. */
export function leafNameOf(segments: PathSegment[]): string {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s.kind === "tag") return s.name;
  }
  return "Table";
}

// ---------------------------------------------------------------------------
// DOM helpers (direct children only, so same-named tags on other branches of
// the tree — UMTS vs LTE, for instance — can never bleed into the result).
// ---------------------------------------------------------------------------

function childrenByTag(parent: Element, tag: string): Element[] {
  const exact: Element[] = [];
  const loose: Element[] = [];
  const kids = parent.children;
  const lower = tag.toLowerCase();
  for (let i = 0; i < kids.length; i++) {
    const name = kids[i].nodeName;
    if (name === tag) exact.push(kids[i]);
    else if (name.toLowerCase() === lower) loose.push(kids[i]);
  }
  // Exact match wins; the case-insensitive list is a convenience fallback.
  return exact.length > 0 ? exact : loose;
}

function indexedChildren(parent: Element): { index: number; el: Element }[] {
  const out: { index: number; el: Element }[] = [];
  const kids = parent.children;
  for (let i = 0; i < kids.length; i++) {
    const m = kids[i].nodeName.match(/^i(\d+)$/);
    if (m) out.push({ index: parseInt(m[1], 10), el: kids[i] });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/** A TR-069 table (has i1, i2, …), a parameter group, or a single parameter. */
function classify(el: Element): "table" | "group" | "leaf" {
  if (indexedChildren(el).length > 0) return "table";
  if (el.children.length > 0) return "group";
  return "leaf";
}

function joinRel(base: string, name: string): string {
  return base ? `${base}.${name}` : name;
}

type Match = { el: Element; labels: string[] };

/** Walk the segments from the Device root, collecting every element they hit. */
function resolveMatches(device: Element, segments: PathSegment[]): Match[] {
  let current: Match[] = [{ el: device, labels: [] }];

  for (const segment of segments) {
    const next: Match[] = [];
    for (const match of current) {
      if (segment.kind === "tag") {
        for (const el of childrenByTag(match.el, segment.name)) {
          next.push({ el, labels: match.labels });
        }
      } else if (segment.kind === "wildcard") {
        for (const { index, el } of indexedChildren(match.el)) {
          next.push({
            el,
            labels: [...match.labels, `${match.el.nodeName}.${index}`],
          });
        }
      } else {
        const target = childrenByTag(match.el, `i${segment.index}`)[0];
        if (target) {
          next.push({
            el: target,
            labels: [...match.labels, `${match.el.nodeName}.${segment.index}`],
          });
        }
      }
    }
    current = next;
    if (current.length === 0) break;
  }

  return current;
}

/** A nested table waiting to be turned into its own block. */
type PendingTable = { el: Element; relPath: string; labels: string[] };

/**
 * Flatten one row's parameters into dotted column names, queueing any nested
 * table found on the way instead of trying to squeeze it into a column.
 */
function collectRowValues(
  el: Element,
  prefix: string,
  relPath: string,
  labels: string[],
  out: Record<string, CellValue>,
  nested: PendingTable[],
  depth: number,
) {
  const kids = el.children;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const name = child.nodeName;
    const kind = classify(child);

    if (kind === "table") {
      nested.push({ el: child, relPath: joinRel(relPath, joinRel(prefix, name)), labels });
    } else if (kind === "group") {
      if (depth < MAX_DEPTH) {
        collectRowValues(
          child,
          joinRel(prefix, name),
          relPath,
          labels,
          out,
          nested,
          depth + 1,
        );
      }
    } else {
      out[joinRel(prefix, name)] = coerceValue(child.textContent);
    }
  }
}

/**
 * Resolve `path` against one device XML export and build every table from that
 * path down to the end of the subtree.
 *
 * Throws on malformed XML, a missing <Device> root, or an unusable path.
 */
export function extractPathTable(
  xmlText: string,
  fileName: string,
  path: string,
  options: ExtractOptions = {},
): PathTableResult {
  const includeChildTables = options.includeChildTables !== false;
  const segments = parsePathSpec(path);
  const leafName = leafNameOf(segments);

  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error(
      (parseError.textContent ?? "Invalid XML").replace(/\s+/g, " ").trim().slice(0, 200),
    );
  }

  const root = doc.documentElement;
  const device =
    root && root.nodeName === "Device"
      ? root
      : doc.getElementsByTagName("Device")[0] ?? null;
  if (!device) {
    throw new Error("No <Device> root element found — is this a device XML export?");
  }

  const matches = resolveMatches(device, segments);

  const blocks = new Map<string, PathTableBlock>();
  const seenColumns = new Map<string, Set<string>>();
  // Keys turned away by MAX_COLUMNS, so each one is only counted once even
  // though every row re-offers it.
  const omittedColumnKeys = new Map<string, Set<string>>();
  const skippedTables: string[] = [];
  let totalCells = 0;
  let hitCellLimit = false;

  const blockFor = (relPath: string): PathTableBlock => {
    let block = blocks.get(relPath);
    if (!block) {
      block = {
        relPath,
        title: relPath || leafName,
        columns: [],
        rows: [],
        omittedColumns: 0,
        omittedRows: 0,
      };
      blocks.set(relPath, block);
      seenColumns.set(relPath, new Set());
      omittedColumnKeys.set(relPath, new Set());
    }
    return block;
  };

  const addRow = (
    relPath: string,
    el: Element,
    labels: string[],
    nested: PendingTable[],
  ) => {
    const block = blockFor(relPath);
    if (block.rows.length >= MAX_ROWS) {
      block.omittedRows++;
      return;
    }
    if (totalCells >= MAX_TOTAL_CELLS) {
      hitCellLimit = true;
      block.omittedRows++;
      return;
    }

    const values: Record<string, CellValue> = {};
    const found: PendingTable[] = [];
    collectRowValues(el, "", relPath, labels, values, found, 0);

    const seen = seenColumns.get(relPath)!;
    const omitted = omittedColumnKeys.get(relPath)!;
    for (const key of Object.keys(values)) {
      if (seen.has(key)) continue;
      if (block.columns.length >= MAX_COLUMNS) {
        if (!omitted.has(key)) {
          omitted.add(key);
          block.omittedColumns++;
        }
        continue;
      }
      seen.add(key);
      block.columns.push(key);
    }

    block.rows.push({ instance: labels.join(" / ") || el.nodeName, values });
    totalCells += Object.keys(values).length + 2;

    for (const table of found) {
      if (!includeChildTables) {
        if (!skippedTables.includes(table.relPath)) skippedTables.push(table.relPath);
        continue;
      }
      nested.push(table);
    }
  };

  // Breadth-first: the queried node's own table first, then nested tables.
  const queue: PendingTable[] = [];

  for (const match of matches) {
    const kind = classify(match.el);
    if (kind === "table") {
      queue.push({ el: match.el, relPath: "", labels: match.labels });
    } else if (kind === "group") {
      addRow("", match.el, match.labels.length > 0 ? match.labels : [match.el.nodeName], queue);
    } else {
      // A single leaf parameter.
      const block = blockFor("");
      const seen = seenColumns.get("")!;
      const key = match.el.nodeName;
      if (!seen.has(key)) {
        seen.add(key);
        block.columns.push(key);
      }
      block.rows.push({
        instance: match.labels.join(" / ") || key,
        values: { [key]: coerceValue(match.el.textContent) },
      });
      totalCells += 3;
    }
  }

  while (queue.length > 0) {
    const pending = queue.shift()!;
    const entries = indexedChildren(pending.el);

    if (!blocks.has(pending.relPath) && blocks.size >= MAX_TABLES) {
      if (!skippedTables.includes(pending.relPath)) skippedTables.push(pending.relPath);
      continue;
    }

    // Touch the block even when empty, so an empty table is still reported.
    blockFor(pending.relPath);

    for (const { index, el } of entries) {
      addRow(
        pending.relPath,
        el,
        [...pending.labels, `${pending.el.nodeName}.${index}`],
        queue,
      );
    }
  }

  const { serial, siteId } = parseFileName(fileName);

  return {
    siteId,
    serial,
    sourceFile: fileName,
    path: formatPathSpec(segments),
    leafName,
    blocks: Array.from(blocks.values()),
    matchCount: matches.length,
    skippedTables,
    hitCellLimit,
  };
}

/** Total rows across every table of a result. */
export function totalPathRows(result: PathTableResult): number {
  return result.blocks.reduce((sum, b) => sum + b.rows.length, 0);
}

/** Does this table carry a CID column that the eNodeB/Cell ID split applies to? */
export function cidColumnOf(columns: string[]): string | null {
  return (
    columns.find((c) => c === "CID") ??
    columns.find((c) => c.split(".").pop() === "CID") ??
    null
  );
}

/**
 * Final column layout for one table: No. and Instance first, then the
 * discovered columns, with eNodeB ID / Cell ID inserted straight after CID.
 */
export type PathTableColumn =
  | { kind: "index"; label: string }
  | { kind: "instance"; label: string }
  | { kind: "value"; label: string; key: string }
  | { kind: "enb"; label: string }
  | { kind: "cellId"; label: string };

export function buildPathTableColumns(
  columns: string[],
  addCidSplit: boolean,
): PathTableColumn[] {
  const cidKey = addCidSplit ? cidColumnOf(columns) : null;
  const out: PathTableColumn[] = [
    { kind: "index", label: "No." },
    { kind: "instance", label: "Instance" },
  ];
  for (const key of columns) {
    out.push({ kind: "value", label: key, key });
    if (cidKey && key === cidKey) {
      out.push({ kind: "enb", label: "eNodeB ID" });
      out.push({ kind: "cellId", label: "Cell ID" });
    }
  }
  return out;
}
