import { describe, expect, it } from "vitest";
import { readXls } from "./xlsReader";

// One BIFF record: type, length, body.
function record(type, body) {
  const out = new Uint8Array(4 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, type, true);
  dv.setUint16(2, body.length, true);
  out.set(body, 4);
  return out;
}

function u16(...values) {
  const out = new Uint8Array(values.length * 2);
  values.forEach((v, i) => new DataView(out.buffer).setUint16(i * 2, v, true));
  return out;
}

function u32(v) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, v, true);
  return out;
}

function bytes(...parts) {
  const all = parts.flatMap((p) => (typeof p === "number" ? [p] : [...p]));
  return new Uint8Array(all);
}

const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function stream(...records) {
  return bytes(...records).buffer;
}

const BOF_BIFF8_SHEET = record(0x0809, u16(0x0600, 0x0010, 0, 0));
const EOF = record(0x000a, new Uint8Array(0));

describe("readXls", () => {
  it("reads BIFF2 LABEL cells as ATT2000 writes them (Windows-1252 text)", () => {
    const label = (row, col, text) =>
      record(0x0004, bytes(u16(row, col), 0, 0, 0, text.length, latin1(text)));
    const rows = readXls(
      stream(
        BOF_BIFF8_SHEET,
        label(0, 0, "Name"),
        label(0, 1, "No."),
        label(1, 0, "ARA\xd1EZ, NILO"),
        label(1, 1, "4"),
        EOF,
      ),
    );
    expect(rows).toEqual([
      ["Name", "No."],
      ["ARAÑEZ, NILO", "4"],
    ]);
  });

  it("reads shared strings split across CONTINUE records, numbers and RK", () => {
    // SST with 2 strings; the second ("PALANAS") is split after "PAL" and
    // continues in a CONTINUE record that starts with its own option byte.
    const sst = record(0x00fc, bytes(u32(2), u32(2), u16(4), 0, latin1("Name"), u16(7), 0, latin1("PAL")));
    const cont = record(0x003c, bytes(0, latin1("ANAS")));
    const labelSst = (row, col, i) => record(0x00fd, bytes(u16(row, col, 0), u32(i)));
    const number = new Uint8Array(14);
    new DataView(number.buffer).setUint16(0, 1, true);
    new DataView(number.buffer).setUint16(2, 1, true);
    new DataView(number.buffer).setFloat64(6, 91, true);
    const rk = record(0x027e, bytes(u16(1, 2, 0), u32((16 << 2) | 0x02)));

    const rows = readXls(
      stream(
        record(0x0809, u16(0x0600, 0x0005, 0, 0)), // workbook globals
        sst,
        cont,
        EOF,
        BOF_BIFF8_SHEET,
        labelSst(0, 0, 0),
        labelSst(1, 0, 1),
        record(0x0203, number),
        rk,
        EOF,
      ),
    );
    expect(rows).toEqual([
      ["Name", "", ""],
      ["PALANAS", "91", "16"],
    ]);
  });

  it("rejects files that aren't old-style Excel", () => {
    expect(() => readXls(latin1("Name,No.\nA,1").buffer)).toThrow(/old-style Excel/);
    expect(() => readXls(new Uint8Array([0x50, 0x4b, 3, 4]).buffer)).toThrow(/old-style Excel/);
  });
});
