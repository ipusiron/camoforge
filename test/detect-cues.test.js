import test from 'node:test';
import assert from 'node:assert/strict';
import { cues } from './load.js';

const DC = cues();

/** w×h の一様な RGBA（明るさ lum）。 */
function uniform(w, h, lum) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = lum; a[i * 4 + 3] = 255; }
  return a;
}
function setLum(a, w, x, y, lum) { const i = (y * w + x) * 4; a[i] = a[i + 1] = a[i + 2] = lum; }

test('一様な面には輪郭が出ない', () => {
  const W = 16, H = 16;
  const e = DC.edgeMap(uniform(W, H, 80), W, H);
  let max = 0; for (const v of e) max = Math.max(max, v);
  assert.ok(max < 1, `max=${max}`);
});

test('明暗の境目で輪郭が強くなる', () => {
  const W = 16, H = 16;
  const a = uniform(W, H, 40);
  for (let y = 0; y < H; y++) for (let x = 8; x < W; x++) setLum(a, W, x, y, 220);
  const e = DC.edgeMap(a, W, H);
  const onEdge = e[(8 * W + 8)];
  const flat = e[(8 * W + 2)];
  assert.ok(onEdge > flat + 50, `edge=${onEdge} flat=${flat}`);
});

test('光沢は、周囲より明るい明点でだけ立つ', () => {
  const W = 20, H = 20;
  const a = uniform(W, H, 60);
  setLum(a, W, 10, 10, 255); // 明るい反射点
  const g = DC.glossMap(a, W, H, { radius: 3 });
  assert.ok(g[(10 * W + 10)] > 0, 'brightスポットで立つ');
  assert.equal(g[0], 0, '平らな暗部では0');
});

test('暗い面では光沢は立たない（明るさの条件）', () => {
  const W = 20, H = 20;
  const a = uniform(W, H, 30);
  setLum(a, W, 10, 10, 90); // 周囲より明るいが全体では暗い
  const g = DC.glossMap(a, W, H, { radius: 3 });
  assert.ok(g[(10 * W + 10)] < 5, '暗ければほぼ立たない');
});

test('まっすぐな線は、同じ数のばらけた点より直線の手がかりが強い', () => {
  const W = 40, H = 40;
  // (a) まっすぐな縦線
  const line = uniform(W, H, 40);
  for (let y = 5; y < 35; y++) setLum(line, W, 20, y, 230);
  // (b) 同数のばらけた点
  const spots = uniform(W, H, 40);
  let placed = 0;
  for (let y = 5; y < 35 && placed < 30; y++) { setLum(spots, W, (y * 7) % W, (y * 13) % H, 230); placed++; }
  // 直線性は画素ごとの強さで見る（点が多いほど上がる平均ではなく、生マップの最大で比べる）
  const maxOf = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return m; };
  const lineMax = maxOf(DC.lineMap(line, W, H, { thresh: 50, reach: 4 }));
  const spotMax = maxOf(DC.lineMap(spots, W, H, { thresh: 50, reach: 4 }));
  assert.ok(lineMax > spotMax * 1.3, `line=${lineMax} spots=${spotMax}`);
});

test('色の外れは、背景と同じなら小さく、違う色なら大きい', () => {
  const W = 16, H = 16;
  const env = uniform(W, H, 80);
  const same = DC.colorMap(env.slice(), env, W, H, { radius: 4 });
  let sameMax = 0; for (const v of same) sameMax = Math.max(sameMax, v);
  assert.ok(sameMax < 1, `same=${sameMax}`);
  // 赤いパッチ
  const comp = env.slice();
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) { const i = (y * W + x) * 4; comp[i] = 230; comp[i + 1] = 20; comp[i + 2] = 20; }
  const diff = DC.colorMap(comp, env, W, H, { radius: 4 });
  assert.ok(diff[(7 * W + 7)] > 50, 'ちがう色で大きい');
});

test('normalize は0〜255で、最大が255', () => {
  const f = new Float32Array([0, 1, 2, 4]);
  const n = DC.normalize(f);
  assert.equal(n[0], 0);
  assert.equal(n[3], 255);
  for (const v of n) assert.ok(v >= 0 && v <= 255);
});

test('normalize は全部0なら全部0（落ちない）', () => {
  const n = DC.normalize(new Float32Array([0, 0, 0]));
  assert.deepEqual([...n], [0, 0, 0]);
});

test('build は4つの手がかりのマップとスコアを返す', () => {
  const W = 24, H = 24;
  const env = uniform(W, H, 70);
  const comp = env.slice();
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) setLum(comp, W, x, y, 200);
  const r = DC.build(comp, env, W, H);
  for (const k of ['edge', 'gloss', 'line', 'color']) {
    assert.equal(r.cues[k].length, W * H, k);
    assert.ok(r.scores[k] >= 0 && r.scores[k] <= 100, `${k} score ${r.scores[k]}`);
  }
});
