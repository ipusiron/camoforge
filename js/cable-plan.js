/**
 * CableBundle - ケーブル束の「配置計画」を作る純粋なロジック（DOM に触れない）。
 *
 * 画面（main.js）はこの計画を受け取って canvas に描く。計画はシードから決まるので、
 * 同じシードと設定なら必ず同じ束になる（テストで確かめられる）。
 *
 * 束ねられたケーブルが見分けられる手がかりは「色」だけではない。
 * 太さのばらつき、光沢（ハイライト）、蛇行、重なり（奥行き）、結束バンドが
 * そろって初めて「束の一部」に見える。計画にはそれらを入れる。
 */
(function (global) {
  'use strict';

  var Color = global.CamoColor || (typeof require === 'function' ? require('./color-utils.js').CamoColor : null);

  /** mulberry32。シードから決まる 0〜1 の乱数。Perlin と違い再現できる。 */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** scale（8〜300）からケーブルの本数（6〜28）を出す。太いほど本数は少ない。 */
  function cableCount(scale) {
    var n = Math.round(6 + (300 - clamp(scale, 8, 300)) / 292 * 22);
    return clamp(n, 6, 28);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /**
   * ケーブル束の計画を作る。
   * @param {object} o
   * @param {number} o.width  キャンバスの幅
   * @param {number} o.height キャンバスの高さ
   * @param {number} o.seed   シード
   * @param {number} o.scale  8〜300（本数に効く）
   * @param {number} o.contrast 0〜2（光沢と陰影の強さ）
   * @param {number} o.bright 0〜2（背景の明るさ）
   * @param {string[]} o.palette 色の配列
   * @returns {{background:string, cables:object[], ties:object[], count:number}}
   */
  function build(o) {
    var width = o.width || 1280;
    var height = o.height || 720;
    var contrast = o.contrast == null ? 1 : o.contrast;
    var bright = o.bright == null ? 1 : o.bright;
    var palette = (o.palette && o.palette.length) ? o.palette : ['#1b1b1b', '#2a2a2a', '#3a3a3a'];
    var rand = rng(Math.floor((o.seed || 0) * 1000) + 1);

    var bg = Math.round(clamp(10 + bright * 14, 0, 44));
    var background = Color.rgbToHex(bg, bg, bg);

    var count = cableCount(o.scale == null ? 150 : o.scale);
    var slot = width / count;
    var cables = [];
    for (var i = 0; i < count; i++) {
      // 中心の x は等間隔＋ゆらぎ。太さはスロットの 55〜110%
      var cx = (i + 0.5) * slot + (rand() - 0.5) * slot * 0.5;
      var w = slot * (0.55 + rand() * 0.55);
      var base = palette[i % palette.length];
      // 同じ色でも1本ごとに少し明暗をずらし、束らしいばらつきを出す
      var tint = Color.shade(base, (rand() - 0.5) * 18);
      // 蛇行の制御点（縦に6点）。上下に少しはみ出させ、端で先が尖らないようにする
      var points = [];
      var sway = slot * (0.12 + rand() * 0.22);
      var phase = rand() * Math.PI * 2;
      var freq = 0.6 + rand() * 0.5;
      var margin = height * 0.12;
      for (var k = 0; k <= 6; k++) {
        var y = -margin + (k / 6) * (height + margin * 2);
        var x = cx + Math.sin(phase + k * freq) * sway;
        points.push({ x: x, y: y });
      }
      // 光沢（ハイライト）は中心より少し左。幅と強さは contrast に効く
      var highlight = Color.shade(base, 22 + contrast * 26);
      var shadow = Color.shade(base, -(20 + contrast * 24));
      cables.push({
        x: cx,
        width: w,
        color: tint,
        highlight: highlight,
        shadow: shadow,
        highlightOffset: -w * (0.18 + rand() * 0.1),
        highlightWidth: Math.max(2, w * (0.12 + contrast * 0.05)),
        points: points,
        depth: rand()
      });
    }
    // 奥行き: depth の小さい順（奥）に描く
    cables.sort(function (a, b) { return a.depth - b.depth; });

    // 結束バンド（横帯）。2〜4本、暗い色でケーブルをまたぐ
    var tieCount = 2 + Math.floor(rand() * 3);
    var ties = [];
    for (var t = 0; t < tieCount; t++) {
      var ty = height * (0.12 + rand() * 0.76);
      var th = clamp(height * (0.03 + rand() * 0.03), 12, 48);
      ties.push({
        y: ty,
        height: th,
        color: Color.shade(palette[0], -(34 + contrast * 16)),
        buckleX: width * (0.2 + rand() * 0.6)
      });
    }
    ties.sort(function (a, b) { return a.y - b.y; });

    return { background: background, cables: cables, ties: ties, count: count };
  }

  global.CableBundle = { build: build, cableCount: cableCount, rng: rng };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CableBundle: global.CableBundle };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
