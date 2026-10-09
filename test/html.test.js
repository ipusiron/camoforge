import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const html = read('index.html');
const csp = (html.match(/Content-Security-Policy" content="([^"]*)"/) || [])[1];

test('CSPのmetaがあり、metaで効かない指示を書いていない', () => {
  assert.ok(csp, 'CSPのmetaがない');
  assert.match(csp, /default-src 'self'/);
  // script-src から 'unsafe-inline' を外した（インラインscriptはない）
  assert.match(csp, /script-src 'self'(;| )/);
  assert.ok(!/script-src [^;]*'unsafe-inline'/.test(csp), "script-src に 'unsafe-inline' が残っている");
  // frame-ancestors は meta では無視される
  assert.ok(!csp.includes('frame-ancestors'), 'CSPにframe-ancestorsがある');
  // meta では無効なヘッダーを書かない
  assert.ok(!html.includes('X-Frame-Options'), 'X-Frame-Optionsのmetaがある');
  assert.ok(!html.includes('X-Content-Type-Options'), 'X-Content-Type-Optionsのmetaがある');
});

test('referrerのmetaがある', () => {
  assert.match(html, /<meta name="referrer" content="no-referrer"/);
});

test('インラインのイベントハンドラーとinline scriptがない', () => {
  assert.ok(!/<[^>]+\son[a-z]+=/i.test(html), 'インラインのイベントハンドラーがある');
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), 'インラインのscriptがある');
});

test('スクリプトを依存の順で読み込む（color-utils → perlin → cable-plan → main）', () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['js/color-utils.js', 'js/perlin.js', 'js/cable-plan.js',
    'js/blend-score.js', 'js/palette-extract.js', 'js/detect-map.js', 'js/main.js']);
});

test('パターンタイプは6つで、ハードウェアパネルが有効', () => {
  const block = html.slice(html.indexOf('id="patternType"'), html.indexOf('</select>', html.indexOf('id="patternType"')));
  const values = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['military', 'digital', 'cable', 'hardware', 'black-matte', 'custom']);
});

test('比較スライダーのハンドルがキーボード・読み上げで操作できる', () => {
  const handle = (html.match(/<div class="slider-handle"[^>]*>/) || [])[0] || '';
  assert.match(handle, /role="slider"/);
  assert.match(handle, /tabindex="0"/);
  assert.match(handle, /aria-valuenow="/);
  assert.match(handle, /aria-valuemin="0"/);
  assert.match(handle, /aria-valuemax="100"/);
});

test('サブタイトルの英語名がタイトルとそろっている', () => {
  assert.match(html, /<title>CamoForge — Camouflage Pattern Generator<\/title>/);
  assert.ok(html.includes('Camouflage Pattern Generator — カモフラージュデザイン生成ツール'));
  assert.ok(!html.includes('Camouflage Designs Generator'), '古い英語名が残っている');
});

test('色覚の選択肢が2色覚の表記になっている', () => {
  assert.ok(html.includes('1型2色覚（Protanopia）'));
  assert.ok(html.includes('2型2色覚（Deuteranopia）'));
  assert.ok(html.includes('3型2色覚（Tritanopia）'));
  assert.ok(!html.includes('赤弱 / Protanopia'), '赤弱（Protanomaly）との混同が残っている');
});

test('馴染み度・検出ビュー・色抽出のUIがある', () => {
  assert.ok(html.includes('id="blendPanel"'));
  assert.ok(html.includes('id="blendTotal"'));
  assert.ok(html.includes('id="enableDetectView"'));
  assert.ok(html.includes('id="extractPalette"'));
});

test('lang属性とviewportがある', () => {
  assert.match(html, /<html lang="ja"/);
  assert.match(html, /<meta name="viewport"/);
});
