/**
 * CamoColor - 色のユーティリティ（DOM に触れない純粋な関数だけ）。
 *
 * 画面（main.js）とテスト（node）の両方から使う。
 * 以前は main.js に hexToRgb が2つあり、後勝ちの版が3桁HEX（#RGB）を黒にしていた。
 * ここに1つだけ置き、3桁は6桁へ展開してから読む。
 */
(function (global) {
  'use strict';

  /** 数を a〜b に収める。 */
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /** #RGB・#RRGGBB・RGB・RRGGBB を {r,g,b} にする。読めない色は黒。 */
  function hexToRgb(hex) {
    var s = String(hex == null ? '' : hex).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) {
      s = s.split('').map(function (c) { return c + c; }).join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(s)) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16)
    };
  }

  /** 0〜255 の r,g,b を #rrggbb にする。 */
  function rgbToHex(r, g, b) {
    var to = function (v) {
      var h = clamp(Math.round(v), 0, 255).toString(16);
      return h.length === 1 ? '0' + h : h;
    };
    return '#' + to(r) + to(g) + to(b);
  }

  /** 色を percent（％）だけ明暗する。正で明るく、負で暗く。`rgb(...)` を返す。 */
  function shade(hex, percent) {
    var c = hexToRgb(hex);
    var p = percent / 100;
    return 'rgb(' + clamp(Math.round(c.r * (1 + p)), 0, 255) + ','
      + clamp(Math.round(c.g * (1 + p)), 0, 255) + ','
      + clamp(Math.round(c.b * (1 + p)), 0, 255) + ')';
  }

  /** 入力を #RGB か #RRGGBB だけに絞る。それ以外は黒（#000000）にして警告する。 */
  function sanitizeColorInput(color) {
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(color || ''))) {
      return color;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Invalid color input: ' + color + ', using #000000');
    }
    return '#000000';
  }

  /** カンマ区切りの文字列を、検証済みの色の配列にする。 */
  function parsePalette(text) {
    return String(text == null ? '' : text).split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(sanitizeColorInput);
  }

  /** 2つの色を t（0〜1）で混ぜた #rrggbb。 */
  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA);
    var b = hexToRgb(hexB);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }

  /** 相対輝度（WCAG）。0〜1。 */
  function luminance(hex) {
    var c = hexToRgb(hex);
    var f = function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  global.CamoColor = {
    clamp: clamp,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    shade: shade,
    sanitizeColorInput: sanitizeColorInput,
    parsePalette: parsePalette,
    mix: mix,
    luminance: luminance
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
