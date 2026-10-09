/**
 * EnvPreset - 作り付けの環境プリセット（背景）を画素で生成し、パターンとの馴染み度を並べる純粋なロジック。
 *
 * 迷彩は背景でしか良し悪しが決まらない。画像をアップロードしなくても、代表的な背景
 * （雪・土・草・サーバールーム・ケーブル群）を手元で作り、同じパターンを全部に当てて
 * 採点すると「万能の迷彩は無い」ことが数字で見える。
 *
 * 背景は canvas を使わず Uint8ClampedArray（RGBA）で作る。シードから決まるので毎回同じ
 * になり（テストできる）、画面（main.js）は putImageData でそのまま描ける。
 */
(function (global) {
  'use strict';

  var BS = global.BlendScore || (typeof require === 'function' ? require('./blend-score.js').BlendScore : null);

  /** mulberry32。シードから決まる 0〜1 の乱数（cable-plan と同じ）。 */
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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /**
   * プリセットの一覧。
   * base = 地の色、speck = ふらつきの幅、feature = 背景ごとの描き分けの種類。
   */
  var PRESETS = [
    { id: 'snow',    nameJa: '雪',            nameEn: 'Snow',        descJa: '明るく白い。わずかに青みがかり、ところどころ影が落ちる', base: [226, 230, 238], speck: 22, feature: 'speckle', accent: [150, 165, 190] },
    { id: 'soil',    nameJa: '土',            nameEn: 'Soil',        descJa: '乾いた茶色のまだら。小石や乾いた葉の斑が混じる',       base: [120, 92, 64],   speck: 34, feature: 'mottle',  accent: [70, 52, 36] },
    { id: 'grass',   nameJa: '草',            nameEn: 'Grass',       descJa: '緑の下草。縦に伸びる葉の筋が入る',                     base: [78, 104, 54],   speck: 30, feature: 'blades',  accent: [52, 74, 36] },
    { id: 'server',  nameJa: 'サーバールーム', nameEn: 'Server room', descJa: '暗い機器の面。等間隔のラックとLEDの点が並ぶ',         base: [34, 38, 44],    speck: 10, feature: 'rack',    accent: [60, 200, 120] },
    { id: 'cables',  nameJa: 'ケーブル群',     nameEn: 'Cable bundle', descJa: '暗い配線の束。濃淡の違う縦縞が並ぶ',                   base: [40, 42, 48],    speck: 16, feature: 'stripes', accent: [96, 100, 110] }
  ];

  function find(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  /** プリセットの一覧（表示用の素のコピー）。 */
  function list() {
    return PRESETS.map(function (p) {
      return { id: p.id, nameJa: p.nameJa, nameEn: p.nameEn, descJa: p.descJa };
    });
  }

  function put(data, i, r, g, b) {
    data[i] = clamp(r, 0, 255); data[i + 1] = clamp(g, 0, 255); data[i + 2] = clamp(b, 0, 255); data[i + 3] = 255;
  }

  /**
   * プリセットの背景を w×h の RGBA で作る。
   * @param {string|object} idOrPreset プリセットの id かオブジェクト
   * @param {number} w
   * @param {number} h
   * @param {object} [opts] { seed }
   * @returns {Uint8ClampedArray} 長さ w*h*4
   */
  function render(idOrPreset, w, h, opts) {
    var p = typeof idOrPreset === 'string' ? find(idOrPreset) : idOrPreset;
    var o = opts || {};
    var data = new Uint8ClampedArray(w * h * 4);
    if (!p) { for (var z = 0; z < data.length; z += 4) put(data, z, 0, 0, 0); return data; }
    var rand = rng((o.seed || 1) * 2654435761 + hashId(p.id));
    var base = p.base, acc = p.accent, sp = p.speck;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var n = (rand() - 0.5) * 2; // -1〜1
        var r = base[0] + n * sp, g = base[1] + n * sp, b = base[2] + n * sp;

        if (p.feature === 'mottle') {
          // 低頻度で濃い斑（小石・枯れ葉）
          if (rand() < 0.04) { r = acc[0] + n * sp; g = acc[1] + n * sp; b = acc[2] + n * sp; }
        } else if (p.feature === 'blades') {
          // 縦の筋（葉）。x ごとに決まる濃淡
          var blade = Math.sin(x * 0.7 + (x % 13)) * 0.5 + 0.5;
          var k = blade < 0.35 ? 1 : 0;
          if (k) { r = acc[0] + n * sp; g = acc[1] + n * sp; b = acc[2] + n * sp; }
        } else if (p.feature === 'rack') {
          // 等間隔の横ライン（ラックの段）＋まれにLEDの点
          if (y % 48 < 3) { r = base[0] * 0.5; g = base[1] * 0.5; b = base[2] * 0.5; }
          if (rand() < 0.0008) { r = acc[0]; g = acc[1]; b = acc[2]; }
        } else if (p.feature === 'stripes') {
          // 濃淡の違う縦縞（配線の束）
          var band = Math.floor(x / 14) % 5;
          var tone = [0.7, 1.0, 1.3, 0.85, 1.15][band];
          r = base[0] * tone + n * sp; g = base[1] * tone + n * sp; b = base[2] * tone + n * sp;
        }
        // speckle（雪）: まれに薄い影
        if (p.feature === 'speckle' && rand() < 0.02) { r = acc[0] + n * sp; g = acc[1] + n * sp; b = acc[2] + n * sp; }

        put(data, i, r, g, b);
      }
    }
    return data;
  }

  function hashId(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  /**
   * パターンの画素を、全プリセットの背景に対して採点して馴染み度の高い順に並べる。
   * @param {ArrayLike<number>} patternPixels パターンの RGBA
   * @param {number} w
   * @param {number} h
   * @param {number} [step] 間引き
   * @returns {Array<{id,nameJa,nameEn,blend,colorMatch,lumMatch,contrastMatch,grade}>}
   */
  function rankPattern(patternPixels, w, h, step) {
    var s = step || 7;
    var patStats = BS.stats(patternPixels, s);
    var rows = PRESETS.map(function (p) {
      var env = render(p.id, w, h);
      var r = BS.score(patStats, BS.stats(env, s));
      return {
        id: p.id, nameJa: p.nameJa, nameEn: p.nameEn,
        blend: r.blend, colorMatch: r.colorMatch, lumMatch: r.lumMatch, contrastMatch: r.contrastMatch,
        grade: BS.grade(r.blend)
      };
    });
    rows.sort(function (a, b) { return b.blend - a.blend; });
    return rows;
  }

  global.EnvPreset = { PRESETS: PRESETS, list: list, render: render, rankPattern: rankPattern };
  if (typeof module !== 'undefined' && module.exports) module.exports = { EnvPreset: global.EnvPreset };
})(typeof globalThis !== 'undefined' ? globalThis : this);
