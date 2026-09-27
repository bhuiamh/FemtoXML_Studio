/**
 * Site-by-site configuration matrix.
 *
 * Every leaf parameter of a device XML becomes one row; every loaded site
 * becomes one column holding that site's value. Reading across a row shows
 * instantly where sites disagree.
 *
 * The transpose (sites as rows) is not possible at this scale: a single export
 * carries ~25,000 leaf parameters and Excel stops at 16,384 columns.
 */
import { parseFileName } from "./neighborList";

/** One parsed device export: its parameters in document order. */
export type SiteDoc = {
  siteId: string;
  serial: string;
  sourceFile: string;
  /** Column label — the site ID, made unique if two files share one. */
  label: string;
  values: Map<string, string>;
  /** Paths in the order they appear in the file. */
  order: string[];
};

export type RowStatus = "match" | "mismatch" | "missing";

export type MatrixRow = {
  /** Full TR-069 path, e.g. Device.Services.FAPService.i1.…RF.EARFCNDL */
  path: string;
  /** Leaf name only, e.g. EARFCNDL — handy for filtering in Excel. */
  name: string;
  /** One entry per site, null when that site does not have the parameter. */
  values: (string | null)[];
  status: RowStatus;
  /** How many different values the sites that do have it carry. */
  distinct: number;
  /** How many sites have the parameter at all. */
  present: number;
};

export type SiteMatrix = {
  sites: SiteDoc[];
  rows: MatrixRow[];
  totals: {
    parameters: number;
    match: number;
    mismatch: number;
    missing: number;
    hidden: number;
  };
};

export type MatrixOptions = {
  /** Drop alarms, counters, timestamps and device identity (default true). */
  hideVolatile?: boolean;
  /** Keep only rows that are not a clean match across all sites. */
  mismatchesOnly?: boolean;
};

// ---------------------------------------------------------------------------
// Volatile data: always differs between devices and is not configuration, so
// leaving it in buries the real mismatches. Each rule is labelled for the UI.
// ---------------------------------------------------------------------------

export const VOLATILE_RULES: {
  label: string;
  detail: string;
  test: (path: string, leaf: string) => boolean;
}[] = [
  {
    label: "Alarms & fault management",
    detail: "Device.FaultMgmt.* — alarm history, expedited events, queued events",
    test: (path) => path.startsWith("Device.FaultMgmt."),
  },
  {
    label: "Statistics & counters",
    detail: "Stats / Statistics / PM / counter and performance nodes",
    test: (path) =>
      /\.(Stats|Statistics|PerfStats|PM|Performance|Counters?)\./i.test(path) ||
      /\.(Bytes|Packets|Errors|Discards|Attempts|Succ|Fail)(Sent|Received|Total)?$/i.test(
        path,
      ),
  },
  {
    label: "Timestamps & uptime",
    detail: "Event times, first-use / last-service dates, uptime, reboot counters",
    test: (_path, leaf) =>
      /^(UpTime|Uptime|UpTimeSeconds|CurrentLocalTime|EventTime|FirstUseDate|TimeStamp|Timestamp)$/.test(
        leaf,
      ) ||
      /(DateOfLastService|LastReboot|LastChange|LastUpdate|LastAttempt|BootTime|StartTime|EndTime)/i.test(
        leaf,
      ),
  },
  {
    label: "Device identity & location",
    detail: "Serial number, MAC address, GPS coordinates, hardware IDs",
    test: (path, leaf) =>
      /^(SerialNumber|MACAddress|HardwareVersion|ManufacturerOUI|ProductClass|EquipmentID)$/.test(
        leaf,
      ) ||
      /\.GPS\./i.test(path) ||
      /^(Latitude|Longitude|Altitude|LockedLatitude|LockedLongitude)$/.test(leaf),
  },
  {
    label: "Live radio measurements",
    detail: "Scanned neighbours, RSRP/RSRQ readings and other measured values",
    test: (path, leaf) =>
      /\.(ScanResult|MeasurementReport|REM|RemScan)\./i.test(path) ||
      /^(RSRP|RSRQ|RSSI|SINR|X_2C7AF4_RSRP|X_2C7AF4_RSRQ)$/.test(leaf),
  },
];

export function isVolatile(path: string, leaf: string): boolean {
  return VOLATILE_RULES.some((rule) => rule.test(path, leaf));
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Walk every leaf element and record its full path and text.
 *
 * TR-069 exports already name repeated instances i1, i2, … so paths are unique
 * on their own; an index is only appended when a plain tag repeats among its
 * siblings, which keeps paths readable.
 */
function collectParameters(root: Element): { values: Map<string, string>; order: string[] } {
  const values = new Map<string, string>();
  const order: string[] = [];

  const walk = (el: Element, path: string) => {
    const kids = el.children;
    if (kids.length === 0) {
      if (!values.has(path)) order.push(path);
      values.set(path, (el.textContent ?? "").trim());
      return;
    }

    const totals = new Map<string, number>();
    for (let i = 0; i < kids.length; i++) {
      totals.set(kids[i].nodeName, (totals.get(kids[i].nodeName) ?? 0) + 1);
    }

    const seen = new Map<string, number>();
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      const tag = child.nodeName;
      const index = (seen.get(tag) ?? 0) + 1;
      seen.set(tag, index);
      const segment = (totals.get(tag) ?? 1) > 1 ? `${tag}[${index}]` : tag;
      walk(child, `${path}.${segment}`);
    }
  };

  walk(root, root.nodeName);
  return { values, order };
}

/** Parse one device export into its full parameter map. Throws on bad XML. */
export function extractSiteDoc(xmlText: string, fileName: string): SiteDoc {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error(
      (parseError.textContent ?? "Invalid XML").replace(/\s+/g, " ").trim().slice(0, 200),
    );
  }

  const root = doc.documentElement;
  if (!root) throw new Error("Empty XML document.");

  const { values, order } = collectParameters(root);
  const { serial, siteId } = parseFileName(fileName);

  return { siteId, serial, sourceFile: fileName, label: siteId, values, order };
}

/** Date-like token in a file name, used to tell snapshots of one site apart. */
function dateTokenOf(fileName: string): string | null {
  const match = fileName.match(/(20\d{6})|(\d{4}-\d{2}-\d{2})/);
  return match ? match[0] : null;
}

/**
 * Column labels must be unique. Plain site ID where possible; otherwise the
 * date from the file name (comparing one site across days is a normal case),
 * then the serial, then an index as a last resort.
 */
function assignLabels(docs: SiteDoc[]): SiteDoc[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    counts.set(doc.siteId, (counts.get(doc.siteId) ?? 0) + 1);
  }

  const taken = new Set<string>();
  return docs.map((doc, index) => {
    const candidates = [doc.siteId];
    if ((counts.get(doc.siteId) ?? 0) > 1) {
      const date = dateTokenOf(doc.sourceFile);
      if (date) candidates.push(`${doc.siteId} ${date}`);
      if (doc.serial) candidates.push(`${doc.siteId} (${doc.serial})`);
      if (date && doc.serial) candidates.push(`${doc.siteId} ${date} (${doc.serial})`);
      candidates.push(`${doc.siteId} #${index + 1}`);
      // The plain site ID cannot win when several files share it.
      candidates.shift();
    }

    const label = candidates.find((c) => !taken.has(c)) ?? `${doc.siteId} #${index + 1}`;
    taken.add(label);
    return { ...doc, label };
  });
}

/** Leaf name of a path, with any repetition index stripped. */
function leafOf(path: string): string {
  const last = path.slice(path.lastIndexOf(".") + 1);
  return last.replace(/\[\d+\]$/, "");
}

/**
 * Merge every site's parameters into one matrix.
 *
 * Row order follows the first site's document order, with parameters that only
 * later sites have appended in their own order — so the sheet reads like the
 * XML rather than like an alphabetical dump.
 */
export function buildSiteMatrix(
  docs: SiteDoc[],
  options: MatrixOptions = {},
): SiteMatrix {
  const hideVolatile = options.hideVolatile !== false;
  const mismatchesOnly = options.mismatchesOnly === true;
  const sites = assignLabels(docs);

  const seen = new Set<string>();
  const paths: string[] = [];
  for (const site of sites) {
    for (const path of site.order) {
      if (!seen.has(path)) {
        seen.add(path);
        paths.push(path);
      }
    }
  }

  const rows: MatrixRow[] = [];
  let match = 0;
  let mismatch = 0;
  let missing = 0;
  let hidden = 0;

  for (const path of paths) {
    const name = leafOf(path);

    if (hideVolatile && isVolatile(path, name)) {
      hidden++;
      continue;
    }

    const values: (string | null)[] = sites.map((site) =>
      site.values.has(path) ? (site.values.get(path) as string) : null,
    );

    let present = 0;
    const distinctValues = new Set<string>();
    for (const value of values) {
      if (value === null) continue;
      present++;
      distinctValues.add(value);
    }

    const anyMissing = present < sites.length;
    const status: RowStatus =
      distinctValues.size > 1 ? "mismatch" : anyMissing ? "missing" : "match";

    if (status === "match") match++;
    else if (status === "mismatch") mismatch++;
    else missing++;

    if (mismatchesOnly && status === "match") continue;

    rows.push({ path, name, values, status, distinct: distinctValues.size, present });
  }

  return {
    sites,
    rows,
    totals: { parameters: match + mismatch + missing, match, mismatch, missing, hidden },
  };
}
