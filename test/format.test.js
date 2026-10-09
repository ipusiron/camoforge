import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { read } from './load.js';

const JS = ['js/color-utils.js', 'js/cable-plan.js', 'js/blend-score.js', 'js/palette-extract.js', 'js/detect-map.js', 'js/perlin.js', 'js/main.js',
  ...fs.readdirSync(new URL('./', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `test/${f}`)];
const ALL = [...JS, 'style.css', 'index.html'];

test('ファイルはLFで、CRを含まない', () => {
  for (const f of ALL) assert.ok(!read(f).includes('\r'), `${f} にCRがある`);
});

test('ファイルの末尾に改行がある', () => {
  for (const f of ALL) assert.ok(read(f).endsWith('\n'), `${f} の末尾に改行がない`);
});

test('純モジュールとテストは、1行を詰め込まない（200文字まで）', () => {
  for (const f of ['js/color-utils.js', 'js/cable-plan.js', 'js/blend-score.js', 'js/palette-extract.js', 'js/detect-map.js',
    ...fs.readdirSync(new URL('./', import.meta.url)).filter((x) => x.endsWith('.js')).map((x) => `test/${x}`)]) {
    read(f).split('\n').forEach((line, i) => {
      assert.ok([...line].length <= 200, `${f}:${i + 1} が ${[...line].length} 文字`);
    });
  }
});

test('純モジュールにソース上の見えない文字を書かない', () => {
  const INVISIBLE = [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2011, 0x202A, 0x202E, 0x2060, 0xFEFF, 0x00AD, 0x3000];
  for (const f of ['js/color-utils.js', 'js/cable-plan.js', 'js/blend-score.js', 'js/palette-extract.js', 'js/detect-map.js']) {
    const hits = [...read(f)].filter((c) => INVISIBLE.includes(c.codePointAt(0)));
    assert.deepEqual(hits, [], `${f}`);
  }
});

test('色のユーティリティは1か所に集約し、main.js で再定義しない', () => {
  const main = read('js/main.js');
  assert.ok(!/function hexToRgb\(/.test(main), 'main.js に hexToRgb の定義が残っている');
  assert.ok(main.includes('CamoColor.hexToRgb'), 'CamoColor を使っていない');
  assert.ok(!/function rgbToHex\(/.test(main), 'main.js に rgbToHex の定義が残っている');
});
