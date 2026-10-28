import test from 'node:test';
import assert from 'node:assert/strict';
import { colorvision, read } from './load.js';

const CV = colorvision();

const px = (...rgb) => new Uint8ClampedArray([...rgb, 255]);

test('normal と知らない mode は色を変えない', () => {
  assert.deepEqual([...CV.apply(px(200, 40, 10), 'normal')], [200, 40, 10, 255]);
  assert.deepEqual([...CV.apply(px(200, 40, 10), 'unknown')], [200, 40, 10, 255]);
});

test('1型（protanopia）で純粋な赤は (145,142,0) になる', () => {
  assert.deepEqual([...CV.apply(px(255, 0, 0), 'protanopia')], [145, 142, 0, 255]);
});

test('2回かけると色がさらに動く（だから画面では1回だけかける）', () => {
  const twice = CV.apply(CV.apply(px(255, 0, 0), 'protanopia'), 'protanopia');
  assert.deepEqual([...twice], [144, 144, 34, 255]);
});

test('全色盲（monochrome）は BT.601 の輝度の灰色にする', () => {
  assert.deepEqual([...CV.apply(px(255, 0, 0), 'monochrome')], [76, 76, 76, 255]);
});

test('アルファは変えない', () => {
  const a = new Uint8ClampedArray([10, 200, 30, 77]);
  CV.apply(a, 'deuteranopia');
  assert.equal(a[3], 77);
});

test('画面（main.js）は合成画像に色覚の変換を1回だけかける', () => {
  const main = read('js/main.js');
  const start = main.indexOf('function composite(');
  const end = main.indexOf('\n  }\n', start);
  const body = main.slice(start, end);
  // envOnlyCanvas に1回、合成（cctx）に1回の計2か所
  assert.equal(body.split('applyColorVisionFilter(').length - 1, 2);
});

test('馴染み度と比較表は、パターンにも同じ色覚の変換をかけてから測る', () => {
  const main = read('js/main.js');
  assert.match(main, /const patternData = cvdCopy\(/);
  assert.match(main, /rankPattern\(px, SCORE_W, SCORE_H, 2, transform\)/);
});
