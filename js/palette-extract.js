/**
 * PaletteExtract - 写真（環境画像）の画素から、よく使われている色を拾う純粋なロジック。
 *
 * 画面（main.js）は環境画像の画素を渡し、返ってきた色をパレット入力に入れる。
 * 「背景でしか迷彩は評価できない」ので、実物の背景から色を取れると、その背景専用の迷彩を作れる。
 *
 * k平均法（k-means）。初期の中心は明るさ順に等間隔で選ぶので、結果は毎回同じ（テストできる）。
 */
(function (global) {
  'use strict';

  var Color = global.CamoColor || (typeof require === 'function' ? require('./color-utils.js').CamoColor : null);

  function dist2(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  /** RGBA の平らな配列を [r,g,b] の配列にする（step で間引く。透明は飛ばす）。 */
  function samplePixels(pixels, step) {
    var out = [];
    var s = (step || 1) * 4;
    for (var i = 0; i + 3 < pixels.length; i += s) {
      if (pixels[i + 3] < 8) continue;
      out.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
    return out;
  }

  /**
   * 代表色を k 色取り出す。
   * @param {ArrayLike<number>} pixels RGBA の平らな配列
   * @param {number} k 取り出す色数（既定5）
   * @param {object} [opts] { step, iterations }
   * @returns {string[]} 使われている割合の多い順の #rrggbb
   */
  function extract(pixels, k, opts) {
    var o = opts || {};
    var pts = samplePixels(pixels, o.step || 1);
    k = Math.max(1, Math.min(k || 5, pts.length));
    if (!pts.length) return [];

    // 初期の中心を、明るさ順に等間隔で選ぶ（毎回同じ結果にする）
    var sorted = pts.slice().sort(function (a, b) {
      return (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]);
    });
    var centers = [];
    for (var c = 0; c < k; c++) {
      centers.push(sorted[Math.floor((c + 0.5) / k * (sorted.length - 1))].slice());
    }

    var assign = new Array(pts.length).fill(0);
    var iters = o.iterations || 8;
    for (var it = 0; it < iters; it++) {
      // 各点を最も近い中心へ
      for (var p = 0; p < pts.length; p++) {
        var best = 0, bestD = Infinity;
        for (var j = 0; j < k; j++) {
          var d = dist2(pts[p], centers[j]);
          if (d < bestD) { bestD = d; best = j; }
        }
        assign[p] = best;
      }
      // 中心を平均で更新
      var sum = [], cnt = [];
      for (var m = 0; m < k; m++) { sum.push([0, 0, 0]); cnt.push(0); }
      for (var q = 0; q < pts.length; q++) {
        var a = assign[q];
        sum[a][0] += pts[q][0]; sum[a][1] += pts[q][1]; sum[a][2] += pts[q][2];
        cnt[a]++;
      }
      for (var u = 0; u < k; u++) {
        if (cnt[u]) centers[u] = [sum[u][0] / cnt[u], sum[u][1] / cnt[u], sum[u][2] / cnt[u]];
      }
    }

    // 使われている割合の多い順に並べる
    var count = new Array(k).fill(0);
    for (var r = 0; r < assign.length; r++) count[assign[r]]++;
    var order = centers.map(function (ctr, idx) { return { ctr: ctr, n: count[idx] }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (x, y) { return y.n - x.n; });
    return order.map(function (x) {
      return Color.rgbToHex(Math.round(x.ctr[0]), Math.round(x.ctr[1]), Math.round(x.ctr[2]));
    });
  }

  global.PaletteExtract = { extract: extract, samplePixels: samplePixels };
  if (typeof module !== 'undefined' && module.exports) module.exports = { PaletteExtract: global.PaletteExtract };
})(typeof globalThis !== 'undefined' ? globalThis : this);
