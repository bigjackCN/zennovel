import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@zennovel/core';
import { crc32, createZip } from './zip';
import { buildGameHtml, projectJsonFromGameHtml, safeFileName } from './gameHtml';

const bytes = (s: string) => new TextEncoder().encode(s);

/** Read back the entries of a stored (uncompressed) zip, via its central directory. */
function readZip(zip: Uint8Array): { name: string; data: string; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    out.push({ name, crc, data: new TextDecoder().decode(zip.subarray(dataStart, dataStart + size)) });
    at += 46 + nameLen;
  }
  return out;
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(bytes(''))).toBe(0);
  });

  it('writes entries that read back intact, with UTF-8 names', () => {
    const zip = createZip([
      { name: 'index.html', data: bytes('<p>hello</p>') },
      { name: '图片/背景.txt', data: bytes('樱花') },
    ]);
    expect(readZip(zip)).toEqual([
      { name: 'index.html', data: '<p>hello</p>', crc: crc32(bytes('<p>hello</p>')) },
      { name: '图片/背景.txt', data: '樱花', crc: crc32(bytes('樱花')) },
    ]);
  });
});

describe('buildGameHtml', () => {
  const tricky = () => {
    const p = createEmptyProject('A <b>"Tale"</b>');
    p.scenes[0]!.commands.push({ id: 'x', type: 'say', text: 'She typed </script><script>alert(1)</script>' });
    return p;
  };

  it('embeds the project so it parses back exactly, even with </script> in the story', () => {
    const p = tricky();
    const html = buildGameHtml(p, 'console.log("player")');
    const m = /<script type="application\/json" id="zennovel-project">([\s\S]*?)<\/script>/.exec(html);
    expect(JSON.parse(m![1]!)).toEqual(p);
    expect(html.match(/<script/g)).toHaveLength(2);
  });

  it('an exported game can be read back as a project (so it doubles as a backup)', () => {
    const p = tricky();
    expect(JSON.parse(projectJsonFromGameHtml(buildGameHtml(p, 'x'))!)).toEqual(p);
    expect(projectJsonFromGameHtml('<html><body>not a game</body></html>')).toBeNull();
  });

  it('escapes the title and a "</script>" inside the player code', () => {
    const html = buildGameHtml(tricky(), 'const s = "</script>";');
    expect(html).toContain('<title>A &lt;b&gt;&quot;Tale&quot;&lt;/b&gt;</title>');
    expect(html).toContain('const s = "<\\/script>";');
  });

  it('makes safe file names', () => {
    expect(safeFileName('樱花坡道')).toBe('樱花坡道');
    expect(safeFileName('a/b:c*?')).toBe('a b c');
    expect(safeFileName('  ..  ')).toBe('zennovel-game');
  });
});
