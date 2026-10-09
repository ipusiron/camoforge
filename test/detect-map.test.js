import test from 'node:test';
import assert from 'node:assert/strict';
import { detect } from './load.js';

const DM = detect();

/** w×h の一様な背景（明るさ lum）を RGBA で作る。 */
function uniform(w, h, lum) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = lum; a[i * 4 + 3] = 255; }
  return a;
}

test('背景と同じ合成は、ほとんど目立たない', () => {
  const env = uniform(16, 16, 60);
  const r = DM.build(env.slice(), env, 16, 16, { radius: 3 });
  assert.ok(r.mean < 5, `${r.mean}`);
  assert.equal(DM.detectScore(r.mean), 0);
});

test('一様な背景に明るいパッチを置くと、その場所が熱くなる', () => {
  const W = 16, H = 16;
  const env = uniform(W, H, 60);
  const comp = env.slice();
  for (let y = 6; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      const i = (y * W + x) * 4;
      comp[i] = comp[i + 1] = comp[i + 2] = 255;
    }
  }
  const r = DM.build(comp, env, W, H, { radius: 3 });
  const hotInside = r.heat[(7 * W + 7)];
  const coolCorner = r.heat[0];
  assert.ok(hotInside > coolCorner, `${hotInside} > ${coolCorner}`);
  assert.ok(r.mean > 0);
  // パッチの縁（輪郭）が最も熱い
  const edge = r.heat[(6 * W + 6)];
  assert.ok(edge >= hotInside - 1);
});

test('heat は w×h の長さで、0〜255に正規化されている', () => {
  const env = uniform(8, 8, 40);
  const comp = env.slice(); comp[0] = comp[1] = comp[2] = 255;
  const r = DM.build(comp, env, 8, 8);
  assert.equal(r.heat.length, 64);
  let mx = 0;
  for (const v of r.heat) { assert.ok(v >= 0 && v <= 255); mx = Math.max(mx, v); }
  assert.ok(mx > 200, '最大が255付近に正規化される');
});

test('detectScore は0〜100で、低いほど見つかりにくい', () => {
  assert.equal(DM.detectScore(0), 0);
  assert.equal(DM.detectScore(255), 100);
  assert.equal(DM.detectScore(128), 50);
});
