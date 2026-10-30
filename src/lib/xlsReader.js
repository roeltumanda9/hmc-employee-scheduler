/**
 * Minimal reader for old binary Excel files (.xls), enough for the exports of
 * the ATT2000 biometric software. Handles both ways it writes them:
 *  - a bare BIFF record stream (newer ATT2000 "Export → Excel"), and
 *  - an OLE2 compound file holding a "Workbook"/"Book" stream (Excel 97–2003).
 * Reads the cell text of the FIRST worksheet only; formulas, styles and dates
 * are not interpreted (numbers come back as plain strings).
 *
 * readXls(arrayBuffer) → rows: string[][] (missing cells are "").
 * Throws an Error with a readable message for anything it can't read.
 */

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const MAX_CHAIN = 1 << 20; // guard against cyclic sector chains in broken files

const cp1252 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

export function readXls(buffer) {
  const bytes = new Uint8Array(buffer);
  const isOle = OLE_MAGIC.every((b, i) => bytes[i] === b);
  const stream = isOle ? workbookStream(bytes) : bytes;
  const first = stream.length >= 4 ? view(stream).getUint16(0, true) : 0;
  // BOF record: 0x0809 (BIFF5/8), 0x0409 (BIFF4), 0x0209 (BIFF3), 0x0009 (BIFF2).
  if (![0x0809, 0x0409, 0x0209, 0x0009].includes(first)) {
    throw new Error(
      "This isn't an old-style Excel (.xls) file. Export it again from the biometric software, or save it in Excel as \"Excel 97-2003 Workbook (*.xls)\".",
    );
  }
  return readBiff(stream);
}

function view(u8) {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

// ---------------------------------------------------------------------------
// OLE2 compound file → the workbook stream
// ---------------------------------------------------------------------------

function workbookStream(bytes) {
  const dv = view(bytes);
  const sectorSize = 1 << dv.getUint16(0x1e, true);
  const miniSize = 1 << dv.getUint16(0x20, true);
  const numFat = dv.getUint32(0x2c, true);
  const dirStart = dv.getUint32(0x30, true);
  const miniCutoff = dv.getUint32(0x38, true);
  const miniFatStart = dv.getUint32(0x3c, true);
  let difatNext = dv.getUint32(0x44, true);

  const sector = (n) => {
    const start = (n + 1) * sectorSize;
    if (start + sectorSize > bytes.length) throw new Error("The Excel file is damaged (sector out of range).");
    return bytes.subarray(start, start + sectorSize);
  };

  // Sector numbers of the FAT itself: 109 in the header, the rest in DIFAT sectors.
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i++) {
    fatSectors.push(dv.getUint32(0x4c + i * 4, true));
  }
  for (let guard = 0; fatSectors.length < numFat && difatNext < END_OF_CHAIN && guard < MAX_CHAIN; guard++) {
    const s = view(sector(difatNext));
    const perSector = sectorSize / 4 - 1;
    for (let i = 0; i < perSector && fatSectors.length < numFat; i++) {
      fatSectors.push(s.getUint32(i * 4, true));
    }
    difatNext = s.getUint32(perSector * 4, true);
  }
  const fat = tableFrom(fatSectors.map(sector));

  const chain = (start, table) => {
    const out = [];
    for (let n = start; n < END_OF_CHAIN && out.length < MAX_CHAIN; n = table[n]) {
      if (n >= table.length) throw new Error("The Excel file is damaged (broken sector chain).");
      out.push(n);
    }
    return out;
  };
  const readChain = (start, size) => concat(chain(start, fat).map(sector)).subarray(0, size);

  // Directory entries (128 bytes each).
  const dir = concat(chain(dirStart, fat).map(sector));
  const ddv = view(dir);
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = ddv.getUint16(off + 0x40, true);
    entries.push({
      name: utf16.decode(dir.subarray(off, off + Math.max(0, nameLen - 2))),
      type: dir[off + 0x42],
      start: ddv.getUint32(off + 0x74, true),
      size: ddv.getUint32(off + 0x78, true),
    });
  }

  const wb = entries.find((e) => e.type === 2 && /^(workbook|book)$/i.test(e.name));
  if (!wb) throw new Error("No worksheet was found in this Excel file.");
  if (wb.size >= miniCutoff) return readChain(wb.start, wb.size);

  // Small streams live in the "mini stream" (inside the root entry's data).
  const root = entries[0];
  const miniStream = readChain(root.start, root.size);
  const miniFat = tableFrom(chain(miniFatStart, fat).map(sector));
  return concat(
    chain(wb.start, miniFat).map((n) => miniStream.subarray(n * miniSize, (n + 1) * miniSize)),
  ).subarray(0, wb.size);
}

function tableFrom(sectors) {
  const all = concat(sectors);
  const dv = view(all);
  const out = new Uint32Array(all.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint32(i * 4, true);
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// BIFF records → cells of the first worksheet
// ---------------------------------------------------------------------------

function readBiff(stream) {
  const dv = view(stream);
  const records = [];
  for (let off = 0; off + 4 <= stream.length; ) {
    const type = dv.getUint16(off, true);
    const len = dv.getUint16(off + 2, true);
    records.push({ type, data: stream.subarray(off + 4, off + 4 + len) });
    off += 4 + len;
  }

  let biff8 = false;
  let sst = [];
  const cells = [];
  let inSheet = false;
  let sheetDone = false;

  const put = (row, col, value) => {
    (cells[row] ||= [])[col] = value;
  };

  for (let i = 0; i < records.length && !sheetDone; i++) {
    const { type, data } = records[i];
    const d = view(data);

    switch (type) {
      case 0x0809: case 0x0409: case 0x0209: case 0x0009: {
        // BOF: version (0x0600 = BIFF8), then substream type (0x10 = worksheet).
        if (type === 0x0809) biff8 = d.getUint16(0, true) === 0x0600;
        const kind = data.length >= 4 ? d.getUint16(2, true) : 0x10;
        if (kind === 0x10) inSheet = true;
        break;
      }
      case 0x000a: // EOF
        if (inSheet) sheetDone = true;
        break;
      case 0x00fc: { // SST, continued in CONTINUE (0x003C) records
        const parts = [data];
        while (records[i + 1]?.type === 0x003c) parts.push(records[++i].data);
        sst = readSst(parts);
        break;
      }
      default:
        if (inSheet) readCell(type, data, d, biff8, sst, put);
    }
  }

  const width = Math.max(0, ...cells.map((r) => (r ? r.length : 0)));
  return Array.from(cells, (r) =>
    Array.from({ length: width }, (_, c) => (r && r[c] != null ? r[c] : "")),
  );
}

function readCell(type, data, d, biff8, sst, put) {
  if (data.length < 4) return;
  const row = d.getUint16(0, true);
  const col = d.getUint16(2, true);
  switch (type) {
    case 0x0004: // LABEL (BIFF2): 3 attribute bytes, 1-byte length, 8-bit text
      put(row, col, cp1252.decode(data.subarray(8, 8 + data[7])));
      break;
    case 0x0204: // LABEL (BIFF3–8)
    case 0x00d6: { // RSTRING
      const len = d.getUint16(6, true);
      put(row, col, biff8 ? unicodeString(data, 8, len).text : cp1252.decode(data.subarray(8, 8 + len)));
      break;
    }
    case 0x00fd: // LABELSST
      put(row, col, sst[d.getUint32(6, true)] ?? "");
      break;
    case 0x0203: // NUMBER
      put(row, col, numberText(d.getFloat64(6, true)));
      break;
    case 0x0003: // NUMBER (BIFF2)
      put(row, col, numberText(d.getFloat64(7, true)));
      break;
    case 0x0002: // INTEGER (BIFF2)
      put(row, col, String(d.getUint16(7, true)));
      break;
    case 0x027e: // RK
      put(row, col, numberText(rk(d.getUint32(6, true))));
      break;
    case 0x00bd: { // MULRK: several RK cells in one row
      const last = d.getUint16(data.length - 2, true);
      for (let c = col, off = 4; c <= last; c++, off += 6) {
        put(row, c, numberText(rk(d.getUint32(off + 2, true))));
      }
      break;
    }
  }
}

// BIFF8 unicode string body at `off`: option byte, then rich-text / phonetic
// headers, then `len` characters (1 or 2 bytes each).
function unicodeString(data, off, len) {
  const d = view(data);
  const flags = data[off++];
  const wide = flags & 0x01;
  let runs = 0;
  let ext = 0;
  if (flags & 0x08) { runs = d.getUint16(off, true); off += 2; }
  if (flags & 0x04) { ext = d.getUint32(off, true); off += 4; }
  const bytes = data.subarray(off, off + len * (wide ? 2 : 1));
  const text = wide ? utf16.decode(bytes) : cp1252.decode(bytes);
  return { text, end: off + bytes.length + runs * 4 + ext };
}

// The shared string table. Strings may be split across CONTINUE records; each
// continuation of a string's characters starts with a fresh option byte.
function readSst(parts) {
  let p = 0;
  let off = 8; // skip total / unique counts
  const count = view(parts[0]).getUint32(4, true);
  const out = [];
  const next = () => {
    p++;
    off = 0;
    return p < parts.length;
  };

  while (out.length < count) {
    if (off >= parts[p].length && !next()) break;
    const cur = parts[p];
    const d = view(cur);
    const len = d.getUint16(off, true);
    const flags = cur[off + 2];
    off += 3;
    let runs = 0;
    let ext = 0;
    if (flags & 0x08) { runs = d.getUint16(off, true); off += 2; }
    if (flags & 0x04) { ext = d.getUint32(off, true); off += 4; }

    let text = "";
    let left = len;
    let wide = flags & 0x01;
    while (left > 0) {
      const part = parts[p];
      const fits = Math.min(left, Math.floor((part.length - off) / (wide ? 2 : 1)));
      const bytes = part.subarray(off, off + fits * (wide ? 2 : 1));
      text += wide ? utf16.decode(bytes) : cp1252.decode(bytes);
      off += bytes.length;
      left -= fits;
      if (left > 0) {
        if (!next()) break;
        wide = parts[p][0] & 0x01;
        off = 1;
      }
    }
    out.push(text);

    // Skip formatting runs and phonetic data, which may also cross records.
    let skip = runs * 4 + ext;
    while (skip > 0) {
      const room = parts[p].length - off;
      if (skip <= room) { off += skip; skip = 0; }
      else { skip -= room; if (!next()) break; }
    }
  }
  return out;
}

function rk(v) {
  let n;
  if (v & 0x02) {
    n = v >> 2; // signed 30-bit integer
  } else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, v & 0xfffffffc, true);
    n = buf.getFloat64(0, true);
  }
  return v & 0x01 ? n / 100 : n;
}

function numberText(n) {
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(10));
}
