import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { read, envphoto } from './load.js';

const README = read('README.md');

test('写真の出典（env-photos.js）が、日英の README の出典表にそろって載っている', () => {
  const EN = read('README.en.md');
  for (const p of envphoto().list()) {
    const c = p.credit;
    if (!c.url) continue; // 作者撮影
    assert.ok(README.includes(`[${c.title}](${c.url})`), `README.md に ${c.title}`);
    assert.ok(EN.includes(`[${c.title}](${c.url})`), `README.en.md に ${c.title}`);
    assert.ok(README.includes(c.license.name) && EN.includes(c.license.name), c.license.name);
  }
});

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

// 見出しの行（コードブロックの中を除く）
function headings(md) {
  let inCode = false;
  const out = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    else if (!inCode && /^#{1,6} /.test(line)) out.push(line);
  }
  return out;
}

test('英語版は日本語版と同じ見出し（数・順・階層・先頭の絵文字）を持つ＝要約にしない', () => {
  const ja = headings(README);
  const en = headings(read('README.en.md'));
  assert.equal(en.length, ja.length, `見出しの数 ja=${ja.length} en=${en.length}`);
  const level = (h) => h.match(/^#+/)[0].length;
  const emoji = (h) => (h.replace(/^#+ /, '').match(/^[^\p{L}\p{N}]*/u) || [''])[0].trim();
  ja.forEach((h, i) => {
    assert.equal(level(en[i]), level(h), `${i}: ${h} / ${en[i]}`);
    assert.equal(emoji(en[i]), emoji(h), `${i}: ${h} / ${en[i]}`);
  });
});

test('英語版に日本語を残さない（1行目の言語の切り替えだけは除く）', () => {
  const JA = /[　-ヿ一-鿿＀-￯]/;
  read('README.en.md').split('\n').slice(1).forEach((line, i) => {
    assert.ok(!JA.test(line), `${i + 2}行目: ${line}`);
  });
});

test('README の画像はすべて実在し、assets の PNG はどちらかの README から参照されている', () => {
  const EN = read('README.en.md');
  const refs = [...(README + EN).matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 12, `画像の参照が ${refs.length} 件`);
  for (const r of refs) assert.ok(fs.existsSync(new URL(`../${r}`, import.meta.url)), `${r} が無い`);
  for (const dir of ['assets', 'assets/en']) {
    for (const f of fs.readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => f.endsWith('.png'))) {
      assert.ok(refs.includes(`${dir}/${f}`), `${dir}/${f} はどの README からも参照されていない`);
    }
  }
  assert.ok(EN.includes('](assets/en/') && !/\]\(assets\/screenshot/.test(EN), '英語版は英語の画面（assets/en/）を載せる');
});
