/**
 * DetectMap - どこが目立つか（検出されやすいか）を画素ごとに出す純粋なロジック。
 *
 * 色が背景に合っていても、輪郭・明るさの差・光沢があると見つかる。
 * ここでは「合成画像の局所的な明暗の変化（輪郭）」と「合成が背景の局所平均からどれだけ外れるか」を
 * 合わせて、目立ちやすさ（0〜255）のマップを作る。画面はこれをヒートマップで重ねる。
 */
(function (global) {
  'use strict';

  function lumAt(data, idx) {
    return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
  }

  /** 合成画像の明るさの配列（幅×高さ）。 */
  function luminanceField(data, w, h) {
    var lum = new Float32Array(w * h);
    for (var i = 0, p = 0; p < w * h; p++, i += 4) lum[p] = lumAt(data, i);
    return lum;
  }

  /**
   * 目立ちやすさのマップを作る。
   * @param {Uint8ClampedArray|number[]} compData 合成画像の RGBA
   * @param {Uint8ClampedArray|number[]} envData 背景のみの RGBA
   * @param {number} w
   * @param {number} h
   * @param {object} [opts] { radius: 局所平均の半径, edgeWeight, diffWeight }
   * @returns {{heat:Uint8ClampedArray, mean:number, max:number}} heat は幅×高さの0〜255
   */
  function build(compData, envData, w, h, opts) {
    var o = opts || {};
    var radius = o.radius || 6;
    var edgeW = o.edgeWeight == null ? 1 : o.edgeWeight;
    var diffW = o.diffWeight == null ? 1 : o.diffWeight;
    var compLum = luminanceField(compData, w, h);
    var envLum = luminanceField(envData, w, h);

    // 背景の局所平均（積分画像で高速化）
    var integ = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
      var rowSum = 0;
      for (var x = 0; x < w; x++) {
        rowSum += envLum[y * w + x];
        integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + rowSum;
      }
    }
    function localMean(cx, cy) {
      var x0 = Math.max(0, cx - radius), y0 = Math.max(0, cy - radius);
      var x1 = Math.min(w - 1, cx + radius), y1 = Math.min(h - 1, cy + radius);
      var area = (x1 - x0 + 1) * (y1 - y0 + 1);
      var s = integ[(y1 + 1) * (w + 1) + (x1 + 1)] - integ[y0 * (w + 1) + (x1 + 1)]
        - integ[(y1 + 1) * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
      return s / area;
    }

    var raw = new Float32Array(w * h);
    var sum = 0, max = 0;
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var p = yy * w + xx;
        // 輪郭（合成画像の横・縦の明暗差）
        var xl = xx > 0 ? compLum[p - 1] : compLum[p];
        var xr = xx < w - 1 ? compLum[p + 1] : compLum[p];
        var yu = yy > 0 ? compLum[p - w] : compLum[p];
        var yd = yy < h - 1 ? compLum[p + w] : compLum[p];
        var edge = (Math.abs(xr - xl) + Math.abs(yd - yu)) / 2;
        // 背景の局所平均からの外れ（色ではなく明るさで見る）
        var diff = Math.abs(compLum[p] - localMean(xx, yy));
        var v = edgeW * edge + diffW * diff;
        if (v > max) max = v;
        raw[p] = v;
        sum += v;
      }
    }
    // 0〜255へ正規化（切り捨てないよう、生の値を貯めてから変換する）
    var heat = new Uint8ClampedArray(w * h);
    var scale = max > 0 ? 255 / max : 0;
    for (var k = 0; k < raw.length; k++) heat[k] = raw[k] * scale;
    return { heat: heat, mean: (sum / raw.length) * scale, max: max };
  }

  /** 目立ちやすさの平均（0〜255）を、検出スコア（0〜100。低いほど見つかりにくい）に直す。 */
  function detectScore(mean) {
    return Math.round(Math.max(0, Math.min(100, mean / 255 * 100)));
  }

  global.DetectMap = { build: build, luminanceField: luminanceField, detectScore: detectScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = { DetectMap: global.DetectMap };
})(typeof globalThis !== 'undefined' ? globalThis : this);
