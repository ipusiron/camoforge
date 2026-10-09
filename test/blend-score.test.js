import test from 'node:test';
import assert from 'node:assert/strict';
import { blend } from './load.js';

const BS = blend();
const px = (rgb, n) => {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = rgb[0]; a[i * 4 + 1] = rgb[1]; a[i * 4 + 2] = rgb[2]; a[i * 4 + 3] = 255; }
  return a;
};

test('同じ色なら馴染み度は100', () => {
  const a = px([100, 120, 90], 20);
  const r = BS.evaluate(a, a);
  assert.equal(r.blend, 100);
  assert.equal(r.colorMatch, 100);
  assert.equal(r.lumMatch, 100);
});

test('黒と白ではほとんど馴染まない', () => {
  const r = BS.evaluate(px([0, 0, 0], 10), px([255, 255, 255], 10));
  assert.ok(r.blend < 30, `${r.blend}`);
  assert.ok(r.colorMatch < 10);
  assert.ok(r.lumMatch < 10);
});

test('色が近いほど馴染み度が高い', () => {
  const env = px([80, 90, 70], 10);
  const near = BS.evaluate(px([85, 95, 72], 10), env).blend;
  const far = BS.evaluate(px([200, 60, 60], 10), env).blend;
  assert.ok(near > far);
});

test('stats は平均の色・明るさ・ばらつきを出す', () => {
  const mixed = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const s = BS.stats(mixed);
  assert.equal(Math.round(s.r), 128);
  assert.ok(s.lumStd > 100, 'ばらつきがある');
  const flat = BS.stats(px([50, 50, 50], 4));
  assert.ok(flat.lumStd < 1, '一様ならばらつきは0');
});

test('段階ラベルはしきい値で決まる', () => {
  assert.equal(BS.grade(90), 'high');
  assert.equal(BS.grade(60), 'medium');
  assert.equal(BS.grade(30), 'low');
  assert.equal(BS.grade(10), 'poor');
});

test('空の入力でも落ちない', () => {
  const r = BS.evaluate(new Uint8ClampedArray(0), new Uint8ClampedArray(0));
  assert.equal(typeof r.blend, 'number');
});
