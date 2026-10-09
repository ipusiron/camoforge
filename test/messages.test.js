import test from 'node:test';
import assert from 'node:assert/strict';
import { messages } from './load.js';

const M = messages();

test('日本語と英語の辞書がある', () => {
  assert.ok(M.ja && typeof M.ja === 'object');
  assert.ok(M.en && typeof M.en === 'object');
});

test('日英でキーが完全に一致する（訳し漏れ・余分なキーがない）', () => {
  const ja = Object.keys(M.ja).sort();
  const en = Object.keys(M.en).sort();
  const missingInEn = ja.filter((k) => !(k in M.en));
  const extraInEn = en.filter((k) => !(k in M.ja));
  assert.deepEqual(missingInEn, [], `英語に無いキー: ${missingInEn}`);
  assert.deepEqual(extraInEn, [], `日本語に無いキー: ${extraInEn}`);
});

test('値が空でない', () => {
  for (const lang of ['ja', 'en']) {
    for (const [k, v] of Object.entries(M[lang])) {
      assert.ok(typeof v === 'string' && v.length > 0, `${lang}.${k} が空`);
    }
  }
});

test('HTMLを入れるキーは日英で同じ数のタグを持つ（<li>・<strong>）', () => {
  const htmlKeys = Object.keys(M.ja).filter((k) => /<(li|strong)/.test(M.ja[k]));
  for (const k of htmlKeys) {
    const countJa = (M.ja[k].match(/<li>/g) || []).length;
    const countEn = (M.en[k].match(/<li>/g) || []).length;
    assert.equal(countJa, countEn, `${k} の <li> の数が日英で違う`);
  }
});
