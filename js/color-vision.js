/**
 * ColorVision - 色覚の見え方を近似する変換（DOM 非依存の純粋なロジック）。
 *
 * RGBA の配列を、その場で書き換える。画面（main.js）は合成画像の表示と、馴染み度・
 * プリセット比較の採点に同じ変換を使う（パターンと背景を同じ見え方にそろえてから比べる）。
 * 変換は1回だけかける。2回かけると色がさらに動く（1型で赤 255,0,0 → 1回 145,142,0 → 2回 144,144,34）。
 */
(function (global) {
  'use strict';

  /** 1〜3型2色覚の近似行列（行 = 出力の R・G・B、列 = 入力の R・G・B）。 */
  var MATRICES = {
    protanopia:   [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    tritanopia:   [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]
  };

  var MODES = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'monochrome'];

  /**
   * 色覚の変換をかける。'normal' と知らない mode は何もしない。
   * @param {Uint8ClampedArray|number[]} data RGBA（その場で書き換える）
   * @param {string} mode
   * @returns 同じ data
   */
  function apply(data, mode) {
    if (mode === 'monochrome') {
      for (var j = 0; j + 2 < data.length; j += 4) {
        // ITU-R BT.601 の輝度
        var gray = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
        data[j] = gray; data[j + 1] = gray; data[j + 2] = gray;
      }
      return data;
    }
    var m = MATRICES[mode];
    if (!m) return data;
    for (var i = 0; i + 2 < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      data[i] = Math.round(m[0][0] * r + m[0][1] * g + m[0][2] * b);
      data[i + 1] = Math.round(m[1][0] * r + m[1][1] * g + m[1][2] * b);
      data[i + 2] = Math.round(m[2][0] * r + m[2][1] * g + m[2][2] * b);
    }
    return data;
  }

  global.ColorVision = { MODES: MODES, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = { ColorVision: global.ColorVision };
})(typeof globalThis !== 'undefined' ? globalThis : this);
