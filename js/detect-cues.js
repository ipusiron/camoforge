/**
 * DetectCues - 「色以外の手がかり」を1つずつ可視化する純粋なロジック（DOM に触れない）。
 *
 * 迷彩は色を背景に合わせるだけでは隠れない。実際に見つかる手がかりは色だけではなく、
 * 輪郭（シルエット）・光沢（ハイライト）・直線（人工物の縁）・色の外れ、と複数ある。
 * ここではそれぞれを別々のマップにして、どの手がかりで見つかるのかを分解して見せる。
 * 検知・点検の側（サイバー忍者の物理侵入の発見）の着眼点になる。
 *
 * 各マップは幅×高さの Float32Array（生の強さ）で返し、normalize で 0〜255 にそろえる。
 */
(function (global) {
  'use strict';

  function lumAt(data, i) {
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }

  /** 明るさの配列（幅×高さ）。 */
  function luminanceField(data, w, h) {
    var lum = new Float32Array(w * h);
    for (var p = 0, i = 0; p < w * h; p++, i += 4) lum[p] = lumAt(data, i);
    return lum;
  }

  /** Sobel で明るさの勾配の強さ（輪郭）を出す。 */
  function edgeMap(data, w, h) {
    var lum = luminanceField(data, w, h);
    var out = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        var gx = -lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1]
               + lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1];
        var gy = -lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1]
               + lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1];
        out[p] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return out;
  }

  /**
   * 光沢（ハイライト）。周囲の局所平均より明るく、かつ全体でも明るい点を拾う。
   * つや消しでない面やコネクタの反射は、背景と色が合っていても白く浮く。
   */
  function glossMap(data, w, h, opts) {
    var o = opts || {};
    var r = o.radius || 4;
    var lum = luminanceField(data, w, h);
    var mean = boxMean(lum, w, h, r);
    var out = new Float32Array(w * h);
    for (var p = 0; p < w * h; p++) {
      var local = lum[p] - mean[p];        // 周囲より明るいか
      var bright = (lum[p] - 130) / 95;     // 全体でも明るいか（130以上で効く）
      var v = local * Math.max(0, Math.min(1, bright));
      out[p] = v > 0 ? v : 0;
    }
    return out;
  }

  /**
   * 直線（人工物の縁）。強い輪郭が一方向にまっすぐ続く場所を拾う。
   * 自然の背景は縁がちらばるが、機器・ケーブル・パネルは長い直線を持つ。
   * 各画素で、縦・横それぞれに連続して強い輪郭が並ぶ長さを数える。
   */
  function lineMap(data, w, h, opts) {
    var o = opts || {};
    var edge = edgeMap(data, w, h);
    var thresh = o.thresh || 60;
    var reach = o.reach || 4; // 片側に見る画素数
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = y * w + x;
        if (edge[p] < thresh) continue;
        var horiz = 1, vert = 1, k;
        for (k = 1; k <= reach; k++) {
          if (x - k >= 0 && edge[p - k] >= thresh) horiz++; else break;
        }
        for (k = 1; k <= reach; k++) {
          if (x + k < w && edge[p + k] >= thresh) horiz++; else break;
        }
        for (k = 1; k <= reach; k++) {
          if (y - k >= 0 && edge[p - k * w] >= thresh) vert++; else break;
        }
        for (k = 1; k <= reach; k++) {
          if (y + k < h && edge[p + k * w] >= thresh) vert++; else break;
        }
        var run = Math.max(horiz, vert);
        // まっすぐ続くほど強く（1画素だけの縁は 0 に近い）
        out[p] = (run - 1) / (2 * reach) * edge[p];
      }
    }
    return out;
  }

  /** 合成が背景の局所平均からどれだけ色で外れるか（第2弾の色の手がかり）。 */
  function colorMap(compData, envData, w, h, opts) {
    var o = opts || {};
    var r = o.radius || 8;
    var er = boxMeanChannel(envData, w, h, r, 0);
    var eg = boxMeanChannel(envData, w, h, r, 1);
    var eb = boxMeanChannel(envData, w, h, r, 2);
    var out = new Float32Array(w * h);
    for (var p = 0, i = 0; p < w * h; p++, i += 4) {
      var dr = compData[i] - er[p], dg = compData[i + 1] - eg[p], db = compData[i + 2] - eb[p];
      out[p] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    return out;
  }

  /** 積分画像で局所平均（単一フィールド）。 */
  function boxMean(field, w, h, r) {
    var sat = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
      var rowSum = 0;
      for (var x = 0; x < w; x++) {
        rowSum += field[y * w + x];
        sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
      }
    }
    var out = new Float32Array(w * h);
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var x0 = Math.max(0, xx - r), y0 = Math.max(0, yy - r);
        var x1 = Math.min(w - 1, xx + r), y1 = Math.min(h - 1, yy + r);
        var area = (x1 - x0 + 1) * (y1 - y0 + 1);
        var s = sat[(y1 + 1) * (w + 1) + (x1 + 1)] - sat[(y0) * (w + 1) + (x1 + 1)]
              - sat[(y1 + 1) * (w + 1) + (x0)] + sat[(y0) * (w + 1) + (x0)];
        out[yy * w + xx] = s / area;
      }
    }
    return out;
  }

  /** 積分画像で局所平均（RGBA の1チャンネル）。 */
  function boxMeanChannel(data, w, h, r, ch) {
    var field = new Float32Array(w * h);
    for (var p = 0, i = ch; p < w * h; p++, i += 4) field[p] = data[i];
    return boxMean(field, w, h, r);
  }

  /** Float のマップを 0〜255 に正規化（最大で割る）。生の値は Float に貯めてから移す。 */
  function normalize(field) {
    var max = 0;
    for (var p = 0; p < field.length; p++) if (field[p] > max) max = field[p];
    var out = new Uint8ClampedArray(field.length);
    if (max <= 0) return out;
    var scale = 255 / max;
    for (var q = 0; q < field.length; q++) out[q] = field[q] * scale;
    return out;
  }

  /** マップの平均から見つかりやすさ（0〜100）。 */
  function score(field) {
    if (!field.length) return 0;
    var s = 0;
    for (var p = 0; p < field.length; p++) s += field[p];
    var mean = s / field.length;
    // 正規化後（0〜255）の平均を 0〜100 に。経験的に平均は小さいので 4 倍で見やすく
    return Math.max(0, Math.min(100, Math.round(mean / 255 * 100 * 4)));
  }

  /**
   * 手がかりごとのマップとスコアをまとめて出す。
   * @returns {{cues:{edge,gloss,line,color}:Uint8ClampedArray, scores:{edge,gloss,line,color}:number}}
   */
  function build(compData, envData, w, h, opts) {
    var o = opts || {};
    var edge = normalize(edgeMap(compData, w, h));
    var gloss = normalize(glossMap(compData, w, h, o.gloss));
    var line = normalize(lineMap(compData, w, h, o.line));
    var color = normalize(colorMap(compData, envData, w, h, o.color));
    return {
      cues: { edge: edge, gloss: gloss, line: line, color: color },
      scores: { edge: score(edge), gloss: score(gloss), line: score(line), color: score(color) }
    };
  }

  global.DetectCues = {
    edgeMap: edgeMap, glossMap: glossMap, lineMap: lineMap, colorMap: colorMap,
    normalize: normalize, score: score, build: build
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { DetectCues: global.DetectCues };
})(typeof globalThis !== 'undefined' ? globalThis : this);
