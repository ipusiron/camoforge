import test from 'node:test';
import assert from 'node:assert/strict';
import { color } from './load.js';

const C = color();

test('hexToRgb は3桁HEX（#RGB）を6桁に展開して読む（黒化しない）', () => {
  // 以前は後勝ちの版が3桁を黒にしていた。これが監査の「高」バグ
  assert.deepEqual(C.hexToRgb('#8af'), { r: 0x88, g: 0xaa, b: 0xff });
  assert.deepEqual(C.hexToRgb('8af'), { r: 0x88, g: 0xaa, b: 0xff });
  assert.deepEqual(C.hexToRgb('#88aaff'), { r: 0x88, g: 0xaa, b: 0xff });
  assert.deepEqual(C.hexToRgb('#000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(C.hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  // 読めない入力は黒
  assert.deepEqual(C.hexToRgb('nope'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(C.hexToRgb(''), { r: 0, g: 0, b: 0 });
});

test('rgbToHex は0〜255に丸めて #rrggbb にする', () => {
  assert.equal(C.rgbToHex(0x88, 0xaa, 0xff), '#88aaff');
  assert.equal(C.rgbToHex(0, 0, 0), '#000000');
  assert.equal(C.rgbToHex(300, -5, 128), '#ff0080');
  assert.equal(C.rgbToHex(7.6, 7.4, 7.5), '#080708');
});

test('hexToRgb と rgbToHex は往復する', () => {
  for (const hex of ['#000000', '#123456', '#abcdef', '#ffffff']) {
    const c = C.hexToRgb(hex);
    assert.equal(C.rgbToHex(c.r, c.g, c.b), hex);
  }
});

test('shade は明暗して範囲に収める', () => {
  assert.equal(C.shade('#808080', 0), 'rgb(128,128,128)');
  assert.equal(C.shade('#808080', 100), 'rgb(255,255,255)');
  assert.equal(C.shade('#808080', -100), 'rgb(0,0,0)');
});

test('sanitizeColorInput は #RGB / #RRGGBB だけ通し、ほかは黒', () => {
  assert.equal(C.sanitizeColorInput('#8af'), '#8af');
  assert.equal(C.sanitizeColorInput('#88aaff'), '#88aaff');
  assert.equal(C.sanitizeColorInput('red'), '#000000');
  assert.equal(C.sanitizeColorInput('rgb(1,2,3)'), '#000000');
  assert.equal(C.sanitizeColorInput('#12345'), '#000000');
});

test('parsePalette はカンマ区切りを検証済みの配列にする', () => {
  assert.deepEqual(C.parsePalette('#8af, #4a6 , #a55'), ['#8af', '#4a6', '#a55']);
  assert.deepEqual(C.parsePalette('#111,,bad,#222'), ['#111', '#000000', '#222']);
  assert.deepEqual(C.parsePalette(''), []);
});

test('mix は2色を混ぜる', () => {
  assert.equal(C.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(C.mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(C.mix('#000000', '#ffffff', 1), '#ffffff');
});

test('luminance は白1・黒0で、白のほうが大きい', () => {
  assert.ok(Math.abs(C.luminance('#ffffff') - 1) < 1e-9);
  assert.equal(C.luminance('#000000'), 0);
  assert.ok(C.luminance('#ffffff') > C.luminance('#808080'));
});
