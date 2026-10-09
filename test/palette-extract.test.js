import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './load.js';

const PE = extract();

function pixels(groups) {
  const a = [];
  for (const [rgb, n] of groups) {
    for (let i = 0; i < n; i++) a.push(rgb[0], rgb[1], rgb[2], 255);
  }
  return a;
}

test('2つのかたまりから、その2色を取り出す', () => {
  const px = pixels([[[10, 20, 30], 50], [[200, 210, 220], 50]]);
  const pal = PE.extract(px, 2);
  assert.equal(pal.length, 2);
  // 多い順。ここでは同数なので両色が含まれること
  assert.ok(pal.includes('#0a141e') || pal.some((c) => c.startsWith('#0')));
  assert.ok(pal.some((c) => c.startsWith('#c')));
});

test('同じ入力なら同じ結果（再現できる）', () => {
  const px = pixels([[[30, 40, 50], 30], [[120, 60, 60], 30], [[220, 220, 200], 30]]);
  assert.deepEqual(PE.extract(px, 3), PE.extract(px, 3));
});

test('多い色ほど先に並ぶ', () => {
  const px = pixels([[[10, 10, 10], 90], [[240, 240, 240], 10]]);
  const pal = PE.extract(px, 2);
  assert.ok(pal[0].startsWith('#0'), `${pal}`);
});

test('kは色数を超えない。透明は無視する', () => {
  const px = [10, 20, 30, 0, 100, 100, 100, 255];
  const pal = PE.extract(px, 5);
  assert.ok(pal.length >= 1 && pal.length <= 2);
  assert.ok(!pal.includes('#0a141e'), '透明の画素は数えない');
});

test('すべて同じ色なら1色', () => {
  const px = pixels([[[64, 96, 128], 40]]);
  const pal = PE.extract(px, 4);
  assert.deepEqual(pal, ['#406080']);
});

test('返す色はすべて #rrggbb', () => {
  const px = pixels([[[12, 34, 56], 20], [[210, 180, 140], 20]]);
  for (const c of PE.extract(px, 3)) assert.match(c, /^#[0-9a-f]{6}$/);
});
