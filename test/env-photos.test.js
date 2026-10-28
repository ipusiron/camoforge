import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { envphoto } from './load.js';

const EPh = envphoto();
const file = (p) => new URL(`../${p}`, import.meta.url);

/** JPEG の SOF から幅と高さを読む（SOF0〜SOF3）。見つからなければ null。 */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** APP1 の Exif セグメントがあるか（GPS などの撮影情報を持ち込まない）。 */
function hasExif(buf) {
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff) {
    const m = buf[i + 1];
    if (m === 0xda) return false; // 画像データの開始。ここより後はメタデータでない
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') return true;
    i += 2 + len;
  }
  return false;
}

test('写真は6環境で、id は重複しない', () => {
  const ids = EPh.list().map((p) => p.id);
  assert.deepEqual([...ids].sort(), ['cables', 'forest', 'grass', 'server', 'snow', 'soil']);
});

test('写真とサムネイルが実在し、JPEG の大きさが決まりどおり', () => {
  for (const p of EPh.list()) {
    const big = fs.readFileSync(file(p.src));
    const th = fs.readFileSync(file(p.thumb));
    const bs = jpegSize(big), ts = jpegSize(th);
    assert.ok(bs && ts, p.id);
    assert.deepEqual(ts, { w: 320, h: 180 }, `${p.id} thumb`);
    if (p.id !== 'forest') assert.deepEqual(bs, { w: 1280, h: 720 }, `${p.id} photo`);
    assert.ok(big.length <= 800 * 1024, `${p.id} ${big.length}B`);
    assert.ok(th.length <= 40 * 1024, `${p.id} thumb ${th.length}B`);
  }
});

test('写真とサムネイルは EXIF（撮影情報・位置情報）を持たない', () => {
  for (const p of EPh.list()) {
    assert.equal(hasExif(fs.readFileSync(file(p.src))), false, p.src);
    assert.equal(hasExif(fs.readFileSync(file(p.thumb))), false, p.thumb);
  }
});

test('作者撮影以外は、出典の URL と CC0 のライセンスを持つ', () => {
  for (const p of EPh.list()) {
    const c = p.credit;
    assert.ok(c.title && c.author, p.id);
    if (c.note === '作者撮影') continue;
    assert.match(c.url, /^https:\/\//, p.id);
    assert.equal(c.license.name, 'CC0 1.0', p.id);
  }
});

test('find は id で引け、知らない id は null', () => {
  assert.equal(EPh.find('snow').src, 'assets/env/snow.jpg');
  assert.equal(EPh.find('nope'), null);
});
