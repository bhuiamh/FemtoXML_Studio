/**
 * Extraction of the LTE "Neighbor List In Use" table from femtocell (eNodeB)
 * TR-069 device XML exports.
 *
 * Source path in the device XML:
 *   Device.Services.FAPService.{n}.CellConfig.LTE.RAN.NeighborListInUse.LTECell
 *
 * Single-band devices expose one FAPService instance, dual-band devices expose
 * two (e.g. Band 1 + Band 3); both are handled by walking every i{n} instance.
 */

/** One field pulled from each <LTECell> entry: XML tag name + sheet header. */
export type NeighborField = { key: string; label: string };

/** Fields to pull from each <LTECell> neighbor entry, in output order. */
export const NEIGHBOR_FIELDS: NeighborField[] = [
  { key: "PLMNID", label: "PLMNID" },
  { key: "CID", label: "CID" },
  { key: "EUTRACarrierARFCN", label: "EARFCN" },
  { key: "PhyCellID", label: "PhyCellID" },
  { key: "QOffset", label: "QOffset" },
  { key: "CIO", label: "CIO" },
  { key: "RSTxPower", label: "RSTxPower" },
  { key: "Blacklisted", label: "Blacklisted" },
  { key: "TAC", label: "TAC" },
  { key: "EnbType", label: "EnbType" },
  { key: "X_2C7AF4_AccessMode", label: "AccessMode" },
  { key: "X_2C7AF4_CSGID", label: "CSGID" },
  { key: "X_2C7AF4_BlacklistedSIB", label: "BlacklistedSIB" },
  { key: "X_2C7AF4_NoRemove", label: "NoRemove" },
  { key: "X_2C7AF4_NoX2", label: "NoX2" },
  { key: "X_2C7AF4_NoX2HO", label: "NoX2HO" },
  { key: "X_2C7AF4_S1X2HO", label: "S1X2HO" },
  { key: "X_2C7AF4_AntennaPortsCount", label: "AntennaPorts" },
  { key: "X_2C7AF4_DLBandwidth", label: "DLBandwidth" },
  { key: "X_2C7AF4_SubFrameAssignment", label: "SubFrameAssign" },
  { key: "X_2C7AF4_SpecialSubframePatterns", label: "SpecialSubframe" },
  { key: "X_2C7AF4_RSRP", label: "RSRP" },
  { key: "X_2C7AF4_RSRQ", label: "RSRQ" },
  { key: "X_2C7AF4_MocnMode", label: "MocnMode" },
];

export const BAND_NAMES: Record<string, string> = {
  "1": "Band 1 (2100 MHz)",
  "3": "Band 3 (1800 MHz)",
};

export type CellValue = string | number;
export type NeighborRow = Record<string, CellValue>;

export type NeighborCell = {
  /** FAPService instance key as it appears in the XML (i1, i2, …). */
  instance: string;
  band: CellValue;
  earfcnDl: CellValue;
  servingPci: CellValue;
  neighbors: NeighborRow[];
};

export type NeighborSite = {
  siteId: string;
  serial: string;
  sourceFile: string;
  cells: NeighborCell[];
};

/** Human label for a FreqBandIndicator value. */
export function bandLabel(band: CellValue): string {
  const key = String(band);
  if (BAND_NAMES[key]) return BAND_NAMES[key];
  return key !== "" ? `Band ${key}` : "Unknown";
}

/** Parse "<serial>_<siteId>_<date>_<rest>.xml" out of a file name. */
export function parseFileName(fileName: string): { serial: string; siteId: string } {
  const base = fileName.replace(/\.[^.]*$/, "");
  const parts = base.split("_");
  if (parts.length >= 3) {
    return { serial: parts[0], siteId: parts[1] };
  }
  return { serial: "", siteId: base };
}

/** Coerce a raw XML text value to a number when it looks numeric, else keep the string. */
export function coerceValue(raw: string | null | undefined): CellValue {
  if (raw === undefined || raw === null) return "";
  const str = String(raw).trim();
  if (str === "") return "";
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  return str;
}

/** Cell ID = CID mod 256, or '' when CID is not numeric. */
export function computeCellId(cid: CellValue): number | "" {
  return typeof cid === "number" ? ((cid % 256) + 256) % 256 : "";
}

/** eNodeB ID = (CID - Cell ID) / 256, or '' when CID is not numeric. */
export function computeEnbId(cid: CellValue): number | "" {
  const cellId = computeCellId(cid);
  return typeof cid === "number" && typeof cellId === "number" ? (cid - cellId) / 256 : "";
}

export function totalNeighbors(site: NeighborSite): number {
  return site.cells.reduce((sum, c) => sum + c.neighbors.length, 0);
}

/** Short band label used inside the neighbour table ("Band 1", "Band 3"). */
export function shortBandLabel(band: CellValue): string {
  return String(band) !== "" ? `Band ${band}` : "Unknown";
}

// ---------------------------------------------------------------------------
// Per-device view: one XML export is one eNodeB device, so its cells (one per
// band) are flattened into a single neighbour list, each row tagged with the
// serving band it came from.
// ---------------------------------------------------------------------------

export type DeviceNeighborRow = {
  /** FreqBandIndicator of the serving cell this neighbour is listed under. */
  band: CellValue;
  bandShort: string;
  /** FAPService instance the row came from (i1, i2, …). */
  instance: string;
  values: NeighborRow;
};

/** Every neighbour of the device, in cell order, tagged with its serving band. */
export function deviceNeighborRows(site: NeighborSite): DeviceNeighborRow[] {
  const rows: DeviceNeighborRow[] = [];
  for (const cell of site.cells) {
    for (const values of cell.neighbors) {
      rows.push({
        band: cell.band,
        bandShort: shortBandLabel(cell.band),
        instance: cell.instance,
        values,
      });
    }
  }
  return rows;
}

export type DeviceSummary = {
  /** "Band 1 (2100 MHz) + Band 3 (1800 MHz)" — every band the device carries. */
  bands: string;
  /** Number when the device has a single distinct value, else a joined string. */
  earfcns: CellValue;
  pcis: CellValue;
  cellCount: number;
  neighborCount: number;
};

/** Collapse a device's per-cell values into one row's worth of summary. */
export function deviceSummary(site: NeighborSite): DeviceSummary {
  const join = (values: CellValue[]): CellValue => {
    const unique = Array.from(new Set(values.filter((v) => v !== ""))).map(String);
    if (unique.length === 0) return "";
    if (unique.length === 1) return coerceValue(unique[0]);
    return unique.join(" / ");
  };

  return {
    bands:
      site.cells.length > 0
        ? site.cells.map((c) => bandLabel(c.band)).join(" + ")
        : "No LTE cell found",
    earfcns: join(site.cells.map((c) => c.earfcnDl)),
    pcis: join(site.cells.map((c) => c.servingPci)),
    cellCount: site.cells.length,
    neighborCount: totalNeighbors(site),
  };
}

// ---------------------------------------------------------------------------
// Shared column layout — used by both the .xlsx sheet and the on-screen
// preview so the two never drift apart. eNodeB ID and Cell ID sit directly
// after CID, since they are read straight off it.
// ---------------------------------------------------------------------------

export type NeighborColumn =
  | { kind: "index"; label: string; width: number }
  | { kind: "band"; label: string; width: number }
  | { kind: "field"; label: string; width: number; key: string }
  | { kind: "enb"; label: string; width: number }
  | { kind: "cellId"; label: string; width: number };

function buildNeighborColumns(): NeighborColumn[] {
  const cols: NeighborColumn[] = [
    { kind: "index", label: "No.", width: 6 },
    { kind: "band", label: "Serving Band", width: 13 },
  ];
  for (const f of NEIGHBOR_FIELDS) {
    cols.push({
      kind: "field",
      key: f.key,
      label: f.label,
      width: Math.max(9, f.label.length + 2),
    });
    if (f.key === "CID") {
      cols.push({ kind: "enb", label: "eNodeB ID", width: 12 });
      cols.push({ kind: "cellId", label: "Cell ID", width: 10 });
    }
  }
  return cols;
}

export const NEIGHBOR_COLUMNS: NeighborColumn[] = buildNeighborColumns();

/** Value for one column of one neighbour row; `ordinal` is the 1-based row number. */
export function columnValue(
  col: NeighborColumn,
  row: DeviceNeighborRow,
  ordinal: number,
): CellValue {
  switch (col.kind) {
    case "index":
      return ordinal;
    case "band":
      return row.bandShort;
    case "field":
      return row.values[col.key] ?? "";
    case "enb":
      return computeEnbId(row.values.CID);
    case "cellId":
      return computeCellId(row.values.CID);
  }
}

// ---------------------------------------------------------------------------
// DOM walking helpers (direct children only — TR-069 exports reuse tag names
// such as NeighborListInUse and LTECell under both the UMTS and LTE subtrees,
// so a document-wide query would mix inter-RAT entries into the LTE table).
// ---------------------------------------------------------------------------

function childrenByTag(parent: Element | null, tag: string): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  const kids = parent.children;
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].nodeName === tag) out.push(kids[i]);
  }
  return out;
}

function childByTag(parent: Element | null, tag: string): Element | null {
  return childrenByTag(parent, tag)[0] ?? null;
}

/** Walk a chain of direct-child tag names, e.g. descend(inst, "CellConfig", "LTE", "RAN"). */
function descend(parent: Element | null, ...tags: string[]): Element | null {
  let node = parent;
  for (const tag of tags) {
    node = childByTag(node, tag);
    if (!node) return null;
  }
  return node;
}

/** Trimmed text of a direct child element, '' when the tag is missing or empty. */
function textOf(parent: Element | null, tag: string): string {
  const el = childByTag(parent, tag);
  return el ? (el.textContent ?? "").trim() : "";
}

/**
 * TR-069 array convention: instances are children named i1, i2, i3 …
 * Returned in numeric index order.
 */
function indexedEntries(container: Element | null): { key: string; el: Element }[] {
  if (!container) return [];
  const out: { key: string; el: Element; index: number }[] = [];
  const kids = container.children;
  for (let i = 0; i < kids.length; i++) {
    const match = kids[i].nodeName.match(/^i(\d+)$/);
    if (match) {
      out.push({ key: kids[i].nodeName, el: kids[i], index: parseInt(match[1], 10) });
    }
  }
  out.sort((a, b) => a.index - b.index);
  return out.map(({ key, el }) => ({ key, el }));
}

/**
 * Parse one device XML export and pull out per-FAPService cell info
 * (band, serving EARFCN, serving PCI, neighbor list).
 *
 * Throws when the XML is malformed or has no <Device> root.
 */
export function extractNeighborSite(xmlText: string, fileName: string): NeighborSite {
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
    throw new Error(
      "No <Device> root element found — is this a femtocell device XML export?",
    );
  }

  const services = childByTag(device, "Services");
  const cells: NeighborCell[] = [];

  for (const fapContainer of childrenByTag(services, "FAPService")) {
    for (const { key, el: inst } of indexedEntries(fapContainer)) {
      const ran = descend(inst, "CellConfig", "LTE", "RAN");
      if (!ran) continue;

      const rf = childByTag(ran, "RF");
      const ltecell = descend(ran, "NeighborListInUse", "LTECell");

      const neighbors: NeighborRow[] = indexedEntries(ltecell).map(({ el: entry }) => {
        const row: NeighborRow = {};
        for (const field of NEIGHBOR_FIELDS) {
          row[field.key] = coerceValue(textOf(entry, field.key));
        }
        return row;
      });

      cells.push({
        instance: key,
        band: coerceValue(textOf(rf, "FreqBandIndicator")),
        earfcnDl: coerceValue(textOf(rf, "EARFCNDL")),
        servingPci: coerceValue(textOf(rf, "PhyCellID")),
        neighbors,
      });
    }
  }

  const { serial, siteId } = parseFileName(fileName);
  return { siteId, serial, sourceFile: fileName, cells };
}
