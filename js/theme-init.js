/**
 * theme-init - 最初の描画の前にテーマを決める。<head> で同期読み込みする。
 *
 * style.css の既定はダークで、ライトは <html> の light-mode クラスで切り替える。
 * この判定を </body> 直前の main.js で行うと、ダークで描いたあとにライトへ
 * 切り替わって見える（背景色の transition でアニメーションにもなる）。
 *
 * 保存した選択（localStorage の theme）を優先し、なければ OS の設定に従う。
 * localStorage が読めない環境でも落ちないよう try/catch で囲む。
 */
(function (global) {
  'use strict';

  var saved = null;
  try { saved = global.localStorage.getItem('theme'); } catch (e) { /* 使えない環境でも続行 */ }

  var prefersDark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  var theme = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

  if (theme === 'light') global.document.documentElement.classList.add('light-mode');
})(typeof window !== 'undefined' ? window : globalThis);
