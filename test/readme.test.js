import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const README = read('README.md');

test('パターンタイプの数が6で、デジタル迷彩を含みハードウェアパネルが実装済み', () => {
  assert.ok(README.includes('**パターンタイプ**（6種類）'));
  assert.ok(README.includes('デジタル迷彩（ピクセル）'));
  assert.ok(!README.includes('【実装予定】'), 'ハードウェアパネルが実装予定のまま');
});

test('色覚の表記が2色覚になっている', () => {
  assert.ok(README.includes('**1型2色覚（Protanopia）**'));
  assert.ok(!README.includes('赤弱 / Protanopia'), '赤弱との混同が残っている');
});

test('文末コロンを置いていない（箇条書きの区切りや内部の：は除く）', () => {
  for (const line of README.split('\n')) {
    assert.ok(!/：\s*$/.test(line), `文末コロン: ${line}`);
  }
});

test('区切り線は --- を使う（-- を残さない）', () => {
  for (const line of README.split('\n')) {
    assert.ok(line.trim() !== '--', 'Markdownの区切りにならない -- がある');
  }
});

test('表記のゆれを残さない', () => {
  const NG = [
    [/とくに/, '「特に」と書く'],
    [/アクセシビリティー/, '「アクセシビリティ」と書く'],
    [/\*\* 。/, '強調閉じの後に空白＋句点を置かない']
  ];
  for (const [pattern, why] of NG) {
    const hit = README.match(pattern);
    assert.ok(!hit, `「${hit && hit[0]}」 → ${why}`);
  }
});
