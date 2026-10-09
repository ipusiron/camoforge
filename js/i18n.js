/**
 * i18n - 画面の日英切り替え。data-i18n（textContent）、data-i18n-html（innerHTML）、
 * data-i18n-attr（"属性:キー,属性:キー"）を見て文言を差し替える。
 *
 * 既定は日本語。選んだ言語は localStorage に残す（読めない環境でも落ちないよう try/catch）。
 * main.js は window.I18N.t(key) で動的な文言を引き、window.I18N.onChange(fn) で
 * 言語が変わったときに再描画する。
 */
(function (global) {
  'use strict';

  var MESSAGES = global.I18N_MESSAGES || { ja: {}, en: {} };
  var lang = 'ja';
  var listeners = [];

  function dict() { return MESSAGES[lang] || MESSAGES.ja; }

  function t(key) {
    var d = dict();
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    var ja = MESSAGES.ja || {};
    return Object.prototype.hasOwnProperty.call(ja, key) ? ja[key] : key;
  }

  function apply(root) {
    var scope = root || document;
    var d = dict();
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k] != null) el.textContent = d[k];
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (d[k] != null) el.innerHTML = d[k];
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2 && d[p[1]] != null) el.setAttribute(p[0].trim(), d[p[1].trim()]);
      });
    });
    document.documentElement.setAttribute('lang', lang);
    var btn = document.getElementById('langToggle');
    if (btn) btn.textContent = t('lang.toggle');
  }

  function set(next) {
    if (next !== 'ja' && next !== 'en') return;
    lang = next;
    try { localStorage.setItem('lang', lang); } catch (e) { /* 使えない環境でも続行 */ }
    apply();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) { /* 1つのリスナーで止めない */ }
    }
  }

  function init() {
    try {
      var saved = localStorage.getItem('lang');
      if (saved === 'ja' || saved === 'en') lang = saved;
    } catch (e) { /* 既定のまま */ }
    apply();
    var btn = document.getElementById('langToggle');
    if (btn) btn.addEventListener('click', function () { set(lang === 'ja' ? 'en' : 'ja'); });
  }

  global.I18N = {
    t: t,
    apply: apply,
    set: set,
    get lang() { return lang; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
