/**
 * BlendScore - パターンが背景にどれだけ馴染むかを数値にする純粋なロジック（DOM に触れない）。
 *
 * 画面（main.js）は patternCanvas と envOnlyCanvas の画素を渡す。
 * 迷彩を背景に紛れさせる要点は「色・明るさ・コントラストを背景に合わせる」ことなので、
 * その3つのずれから馴染み度（0〜100、高いほど馴染む）を出す。
 */
(function (global) {
  'use strict';

  /** RGBA の平らな配列から、平均の色・平均の明るさ・明るさのばらつきを出す。 */
  function stats(pixels, step) {
    var n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
    var s = (step || 1) * 4;
    for (var i = 0; i + 3 < pixels.length; i += s) {
      var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sr += r; sg += g; sb += b; sl += lum; sl2 += lum * lum;
      n++;
    }
    if (!n) return { r: 0, g: 0, b: 0, lum: 0, lumStd: 0, n: 0 };
    var ml = sl / n;
    return {
      r: sr / n, g: sg / n, b: sb / n,
      lum: ml,
      lumStd: Math.sqrt(Math.max(0, sl2 / n - ml * ml)),
      n: n
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /**
   * パターンと背景の統計から、馴染み度を出す。
   * @returns {{blend:number, colorMatch:number, lumMatch:number, contrastMatch:number,
   *            colorDist:number, lumDiff:number, contrastDiff:number}}
   */
  function score(patternStats, envStats) {
    var dr = patternStats.r - envStats.r;
    var dg = patternStats.g - envStats.g;
    var db = patternStats.b - envStats.b;
    // 平均色のユークリッド距離を0〜100に正規化
    var colorDist = Math.sqrt(dr * dr + dg * dg + db * db) / (255 * Math.sqrt(3)) * 100;
    var lumDiff = Math.abs(patternStats.lum - envStats.lum) / 255 * 100;
    var contrastDiff = clamp(Math.abs(patternStats.lumStd - envStats.lumStd) / 128 * 100, 0, 100);
    // 色のずれを重く、明るさ・コントラストのずれを軽く見る
    var penalty = 0.5 * colorDist + 0.3 * lumDiff + 0.2 * contrastDiff;
    return {
      blend: Math.round(clamp(100 - penalty, 0, 100)),
      colorMatch: Math.round(clamp(100 - colorDist, 0, 100)),
      lumMatch: Math.round(clamp(100 - lumDiff, 0, 100)),
      contrastMatch: Math.round(clamp(100 - contrastDiff, 0, 100)),
      colorDist: colorDist,
      lumDiff: lumDiff,
      contrastDiff: contrastDiff
    };
  }

  /** 画素の配列2つから直接、馴染み度を出す（step は間引き）。 */
  function evaluate(patternPixels, envPixels, step) {
    return score(stats(patternPixels, step), stats(envPixels, step));
  }

  /** 馴染み度の段階ラベルのキー（画面は言語ごとの文言に差し替える）。 */
  function grade(blend) {
    if (blend >= 75) return 'high';
    if (blend >= 50) return 'medium';
    if (blend >= 25) return 'low';
    return 'poor';
  }

  global.BlendScore = { stats: stats, score: score, evaluate: evaluate, grade: grade };
  if (typeof module !== 'undefined' && module.exports) module.exports = { BlendScore: global.BlendScore };
})(typeof globalThis !== 'undefined' ? globalThis : this);
