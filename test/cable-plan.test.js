import test from 'node:test';
import assert from 'node:assert/strict';
import { cable } from './load.js';

const B = cable();
const opts = (over) => Object.assign({
  width: 1280, height: 720, seed: 12.345, scale: 150, contrast: 1, bright: 1,
  palette: ['#223344', '#2a3340', '#39414d', '#c8c8c8']
}, over);

test('同じシードと設定なら、同じ束になる（再現できる）', () => {
  const a = B.build(opts());
  const b = B.build(opts());
  assert.deepEqual(a, b);
  // シードが違えば変わる
  const c = B.build(opts({ seed: 99.9 }));
  assert.notDeepEqual(a.cables.map((x) => x.x), c.cables.map((x) => x.x));
});

test('ケーブルの本数はスケールで決まり、6〜28の範囲に収まる', () => {
  assert.equal(B.cableCount(8), 28);
  assert.equal(B.cableCount(300), 6);
  assert.ok(B.cableCount(150) >= 6 && B.cableCount(150) <= 28);
  // 細い（スケール大）ほど本数は少ない
  assert.ok(B.build(opts({ scale: 300 })).count < B.build(opts({ scale: 8 })).count);
  for (const s of [8, 50, 150, 300]) {
    const n = B.build(opts({ scale: s })).count;
    assert.equal(n, B.build(opts({ scale: s })).cables.length);
  }
});

test('各ケーブルは上下にはみ出す制御点を持つ（端で先が尖らない）', () => {
  const plan = B.build(opts());
  for (const c of plan.cables) {
    assert.ok(c.points.length >= 6);
    assert.ok(c.points[0].y < 0, '最初の点は上端より上');
    assert.ok(c.points[c.points.length - 1].y > 720, '最後の点は下端より下');
    assert.ok(c.width > 0);
  }
});

test('ケーブルは奥（depth 小）から手前（depth 大）の順に並ぶ', () => {
  const plan = B.build(opts());
  for (let i = 1; i < plan.cables.length; i++) {
    assert.ok(plan.cables[i - 1].depth <= plan.cables[i].depth);
  }
});

test('結束バンドは2〜4本で、留め具の位置が幅の中に収まる', () => {
  for (const seed of [1, 2.2, 7.7, 100.5]) {
    const plan = B.build(opts({ seed }));
    assert.ok(plan.ties.length >= 2 && plan.ties.length <= 4, `${plan.ties.length}`);
    for (const tie of plan.ties) {
      assert.ok(tie.buckleX >= 0 && tie.buckleX <= 1280);
      assert.ok(tie.height >= 12 && tie.height <= 48);
      assert.ok(tie.y >= 0 && tie.y <= 720);
    }
    // y の昇順
    for (let i = 1; i < plan.ties.length; i++) assert.ok(plan.ties[i - 1].y <= plan.ties[i].y);
  }
});

test('明度で背景の明るさが、パレット無しでも落ちずに動く', () => {
  const dark = B.build(opts({ bright: 0 }));
  const light = B.build(opts({ bright: 2 }));
  const lum = (hex) => parseInt(hex.slice(1, 3), 16);
  assert.ok(lum(light.background) > lum(dark.background));
  // パレットが空でも既定色で動く
  const empty = B.build(opts({ palette: [] }));
  assert.ok(empty.cables.length > 0);
});

test('rng はシードから決まる0〜1の列を返す', () => {
  const a = B.rng(42);
  const b = B.rng(42);
  for (let i = 0; i < 5; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
