import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read } from './load.js';

// theme-init.js を、保存値と OS 設定を差し替えた仮の window で動かし、light-mode が付くかを返す。
function run({ saved = null, prefersDark = false, storageThrows = false } = {}) {
  const classes = new Set();
  const window = {
    localStorage: { getItem: () => { if (storageThrows) throw new Error('blocked'); return saved; } },
    matchMedia: () => ({ matches: prefersDark }),
    document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
  };
  vm.runInNewContext(read('js/theme-init.js'), { window });
  return classes.has('light-mode');
}

test('保存値がなければ OS の設定に従う', () => {
  assert.equal(run({ prefersDark: true }), false);
  assert.equal(run({ prefersDark: false }), true);
});

test('保存値は OS の設定より優先する', () => {
  assert.equal(run({ saved: 'light', prefersDark: true }), true);
  assert.equal(run({ saved: 'dark', prefersDark: false }), false);
});

test('想定外の保存値は無視して OS の設定に従う', () => {
  assert.equal(run({ saved: 'blue', prefersDark: true }), false);
});

test('localStorage が使えなくても落ちず、OS の設定に従う', () => {
  assert.equal(run({ storageThrows: true, prefersDark: false }), true);
});

test('index.html の <head> で、stylesheet のあとに読み込む', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<script src="js/theme-init.js"></script>'), '<head> に theme-init.js がない');
  assert.ok(head.indexOf('style.css') < head.indexOf('js/theme-init.js'));
});
