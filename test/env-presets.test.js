import test from 'node:test';
import assert from 'node:assert/strict';
import { envpreset } from './load.js';

const EP = envpreset();

/** w×h の一様なパターンを RGBA で作る。 */
function uniform(w, h, rgb) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = rgb[0]; a[i * 4 + 1] = rgb[1]; a[i * 4 + 2] = rgb[2]; a[i * 4 + 3] = 255; }
  return a;
}

/** RGBA の平均色を出す。 */
function mean(px) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return [r / n, g / n, b / n];
}

test('プリセットは5種類で、id は重複しない', () => {
  const l = EP.list();
  assert.equal(l.length, 5);
  const ids = l.map((p) => p.id);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(ids.sort(), ['cables', 'grass', 'server', 'snow', 'soil']);
});

test('各プリセットに日本語名と英語名がある', () => {
  for (const p of EP.list()) {
    assert.ok(p.nameJa && p.nameJa.length > 0, p.id);
    assert.ok(p.nameEn && p.nameEn.length > 0, p.id);
  }
});

test('render は w*h*4 の長さで、不透明（アルファ255）', () => {
  const w = 20, h = 12;
  const px = EP.render('snow', w, h);
  assert.equal(px.length, w * h * 4);
  for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255);
});

test('同じ id・サイズ・シードなら、同じ画素になる（再現できる）', () => {
  const a = EP.render('grass', 24, 24, { seed: 3 });
  const b = EP.render('grass', 24, 24, { seed: 3 });
  assert.deepEqual(a, b);
});

test('知らない id は黒で埋める（落ちない）', () => {
  const px = EP.render('unknown', 4, 4);
  assert.equal(px.length, 64);
  assert.deepEqual(mean(px), [0, 0, 0]);
});

test('雪は明るく、土は茶色（赤>青）、草は緑が優勢、サーバールームは暗い', () => {
  const W = 64, H = 64;
  const [sr, sg, sb] = mean(EP.render('snow', W, H));
  assert.ok((sr + sg + sb) / 3 > 190, `snow lum ${(sr + sg + sb) / 3}`);

  const [dr, , db] = mean(EP.render('soil', W, H));
  assert.ok(dr > db, `soil r ${dr} > b ${db}`);

  const [, gg, gb] = mean(EP.render('grass', W, H));
  assert.ok(gg > gb, `grass g ${gg} > b ${gb}`);

  const srv = mean(EP.render('server', W, H));
  assert.ok((srv[0] + srv[1] + srv[2]) / 3 < 60, `server lum ${(srv[0] + srv[1] + srv[2]) / 3}`);
});

test('rankPattern は馴染み度の高い順に、全プリセットを返す', () => {
  const W = 48, H = 48;
  const pattern = uniform(W, H, [80, 104, 54]); // 草に近い緑
  const rows = EP.rankPattern(pattern, W, H);
  assert.equal(rows.length, 5);
  // 降順になっている
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].blend >= rows[i].blend);
  // 各行は0〜100で段階ラベルを持つ
  for (const r of rows) {
    assert.ok(r.blend >= 0 && r.blend <= 100);
    assert.ok(['high', 'medium', 'low', 'poor'].includes(r.grade));
  }
});

test('緑のパターンは、雪より草によく馴染む（万能の迷彩は無い）', () => {
  const W = 48, H = 48;
  const green = uniform(W, H, [80, 104, 54]);
  const rows = EP.rankPattern(green, W, H);
  const grass = rows.find((r) => r.id === 'grass');
  const snow = rows.find((r) => r.id === 'snow');
  assert.ok(grass.blend > snow.blend, `grass ${grass.blend} > snow ${snow.blend}`);
});

test('白いパターンは、草より雪によく馴染む', () => {
  const W = 48, H = 48;
  const white = uniform(W, H, [228, 232, 240]);
  const rows = EP.rankPattern(white, W, H);
  const grass = rows.find((r) => r.id === 'grass');
  const snow = rows.find((r) => r.id === 'snow');
  assert.ok(snow.blend > grass.blend, `snow ${snow.blend} > grass ${grass.blend}`);
});
