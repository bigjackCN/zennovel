/**
 * ZIP reading and writing for the desktop app, using only node:zlib.
 *
 * Reading: unpacks Electron's release zips (stored or deflated entries, Unix
 * permissions kept so the Linux binary stays executable).
 * Writing: packs an exported game folder (deflated, permissions kept).
 * No ZIP64: entries and archives must stay under 4 GB.
 */
import { chmod, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { deflateRaw as deflateRawCb, inflateRaw as inflateRawCb } from 'node:zlib';

// Asynchronous zlib runs on worker threads, so the app stays responsive while it packs.
const deflateRaw = promisify(deflateRawCb);
const inflateRaw = promisify(inflateRawCb);

const LIMIT = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  crc = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}

export interface ZipEntryInfo {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
  /** Unix permission bits, when the archive recorded them. */
  mode: number | null;
  size: number;
}

interface CentralEntry extends ZipEntryInfo {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readCentralDirectory(buf: Buffer): CentralEntry[] {
  // End of central directory: last 22 bytes plus up to 64 KB of comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === LIMIT) throw new Error('ZIP64 archives are not supported');
  const out: CentralEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged ZIP central directory');
    const madeBy = buf.readUInt16LE(p + 4) >> 8;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const external = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    const unixMode = madeBy === 3 ? external >>> 16 : 0;
    out.push({
      name,
      method,
      compressedSize,
      size,
      localOffset,
      isDirectory: name.endsWith('/'),
      isSymlink: (unixMode & 0o170000) === 0o120000,
      mode: unixMode ? unixMode & 0o7777 : null,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function entryData(buf: Buffer, e: CentralEntry): Promise<Buffer> {
  const p = e.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`Damaged ZIP entry: ${e.name}`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const raw = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error(`Unsupported ZIP compression (${e.method}) in ${e.name}`);
}

/** List a ZIP file's entries. */
export async function listZip(file: string): Promise<ZipEntryInfo[]> {
  return readCentralDirectory(await readFile(file)).map(
    ({ method: _m, compressedSize: _c, localOffset: _l, ...info }) => info,
  );
}

/**
 * Unpack a ZIP into `dest`. Entries that would land outside `dest` are
 * refused; symlinks are skipped (only macOS builds use them), and so is
 * anything `keep` says no to.
 */
export async function extractZip(
  file: string,
  dest: string,
  keep: (name: string) => boolean = () => true,
): Promise<number> {
  const buf = await readFile(file);
  const root = resolve(dest);
  let written = 0;
  for (const e of readCentralDirectory(buf)) {
    const target = resolve(root, e.name);
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Unsafe path in ZIP: ${e.name}`);
    if (e.isDirectory) {
      await mkdir(target, { recursive: true });
      continue;
    }
    if (e.isSymlink || !keep(e.name)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entryData(buf, e));
    if (e.mode && process.platform !== 'win32') await chmod(target, e.mode);
    written++;
  }
  return written;
}

function dosDateTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(full)));
    else if (d.isFile()) out.push(full);
  }
  return out.sort();
}

/** Formats that are already compressed: storing them is as small and much faster. */
const STORE = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|oga|m4a|aac|opus|mp4|webm|zip|woff2?)$/i;

/**
 * Pack the folder `src` into the ZIP file `out`. Paths inside the archive
 * start with `prefix` (e.g. "MyGame/"). Files that are executable on disk,
 * or that `executable` names (by path inside `src`), are marked executable:
 * Windows has no such permission, so a Linux game packed there needs the hint.
 */
export async function zipFolder(
  src: string,
  out: string,
  prefix = '',
  onProgress?: (done: number, total: number) => void,
  executable: (path: string) => boolean = () => false,
): Promise<void> {
  const files = await walk(src);
  await mkdir(dirname(out), { recursive: true });
  const fh = await open(out, 'w');
  const central: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  try {
    for (const [i, full] of files.entries()) {
      const rel = relative(src, full).split(sep).join('/');
      const name = Buffer.from(prefix + rel, 'utf8');
      const data = await readFile(full);
      const st = await stat(full);
      const store = STORE.test(full) || data.length < 64;
      const packed = store ? data : await deflateRaw(data, { level: 6 });
      const method = store || packed.length >= data.length ? 0 : 8;
      const body = method === 0 ? data : packed;
      if (body.length >= LIMIT || offset >= LIMIT) throw new Error('The game is too large for a ZIP file (over 4 GB)');
      const crc = crc32(data);
      const mode = (executable(rel) ? 0o755 : process.platform === 'win32' ? 0o644 : st.mode & 0o777) | 0o100000;

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      await fh.write(Buffer.concat([local, name]));
      await fh.write(body);

      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so permissions are honoured
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(method, 10);
      c.writeUInt16LE(time, 12);
      c.writeUInt16LE(date, 14);
      c.writeUInt32LE(crc, 16);
      c.writeUInt32LE(body.length, 20);
      c.writeUInt32LE(data.length, 24);
      c.writeUInt16LE(name.length, 28);
      c.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, 38);
      c.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([c, name]));
      offset += 30 + name.length + body.length;
      onProgress?.(i + 1, files.length);
    }
    const dir = Buffer.concat(central);
    if (files.length >= 0xffff) throw new Error('Too many files for a ZIP file');
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);
    await fh.write(Buffer.concat([dir, end]));
  } finally {
    await fh.close();
  }
}
