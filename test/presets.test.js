import test from 'node:test';
import assert from 'node:assert/strict';
import { read, messages } from './load.js';

const DATA = JSON.parse(read('data/presets.json'));
const M = messages();
// ひらがな・カタカナ・漢字・全角の記号
const JA = /[　-ヿ一-鿿＀-￯]/;

test('英語表示のプリセット名に日本語が残らない（日本語を含む名前には label_en がある）', () => {
  for (const [cat, items] of Object.entries(DATA.categories)) {
    for (const p of items) {
      const en = p.label_en || p.label;
      assert.ok(!JA.test(en), `${cat}/${p.id}: ${en}`);
    }
  }
});

test('プリセットの分類名が日英の辞書にある', () => {
  for (const cat of Object.keys(DATA.categories)) {
    const key = `presetGroup.${cat}`;
    assert.ok(M.ja[key], `ja.${key}`);
    assert.ok(M.en[key] && !JA.test(M.en[key]), `en.${key}`);
  }
});

test('main.js がプリセットの選択肢に日本語を直書きしない', () => {
  const main = read('js/main.js');
  assert.ok(!main.includes("'--- カスタム入力 ---'"), 'カスタム入力は辞書の opt.customInput から引く');
  assert.ok(!main.includes('JP_LABELS'), '分類名は辞書の presetGroup.* から引く');
});
