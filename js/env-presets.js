/**
 * EnvPreset - 作り付けの環境プリセット（背景）を画素で生成し、パターンとの馴染み度を並べる純粋なロジック。
 *
 * 迷彩は背景でしか良し悪しが決まらない。画像をアップロードしなくても、代表的な背景
 * （森の小道・雪・土・草・サーバールーム・ケーブル群）を手元で作り、同じパターンを全部に当てて
 * 採点すると「万能の迷彩は無い」ことが数字で見える。同じ id の写真は EnvPhoto（env-photos.js）にある。
 *
 * 背景は canvas を使わず Uint8ClampedArray（RGBA）で作る。シードから決まるので毎回同じ
 * になり（テストできる）、画面（main.js）は putImageData でそのまま描ける。
 *
 * 描き方の約束:
 * - 座標は「画像の高さを1とした単位」（X = x / h, Y = y / h）で計算する。小石・葉・ケーブルなどの
 *   要素も、この単位で位置と大きさを決めてから画素に落とす。160×90 で採点しても 1280×720 の表示と
 *   同じ絵（平均の色・明るさ）になる
 * - 地の模様はシードつきの値ノイズを重ねたもの（fBm）。陰影は高さの勾配と左上からの光で付ける
 * - 作った背景は id・幅・高さ・シードでキャッシュする（描画のたびに作り直さない）
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
  function mix(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  // ===== 値ノイズと fBm =====

  /** 格子点 (ix, iy) とシードから 0〜1 の値を決める。 */
  function hash2(ix, iy, s) {
    var h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** 値ノイズ（0〜1）。格子の値をなめらかに補間する。 */
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s);
    var c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
  }

  /** fBm（0〜1）。周波数を2倍、振幅を半分にしながら oct 回重ねる。 */
  function fbm(x, y, s, oct) {
    var sum = 0, amp = 0.5, norm = 0, f = 1;
    for (var o = 0; o < oct; o++) {
      sum += amp * vnoise(x * f, y * f, s + o * 101);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }

  // ===== 画素バッファ（浮動小数の RGB）と要素の描画 =====

  function Canvas(w, h) {
    this.w = w; this.h = h;
    this.rgb = new Float32Array(w * h * 3);
  }

  /** 左上から当たる光（画像の上が -Y）。陰影の計算に使う。 */
  var LX = -0.55, LY = -0.55, LZ = 0.63;

  /**
   * 円（または楕円）を描く。cx, cy, rx, ry は高さ1の単位、rot は回転（ラジアン）。
   * shade = true なら球のような陰影を付ける。半径が1画素に満たないときは、面積ぶんの濃さで1画素に置く
   * （縮小しても平均の色が保たれる）。
   */
  Canvas.prototype.ellipse = function (cx, cy, rx, ry, rot, col, alpha, shade) {
    var w = this.w, h = this.h, rgb = this.rgb;
    var px = cx * h, py = cy * h, prx = rx * h, pry = ry * h;
    var a0 = alpha === undefined ? 1 : alpha;
    if (prx < 0.7 && pry < 0.7) {
      var ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
      var k = a0 * Math.min(1, Math.PI * prx * pry), j = (iy * w + ix) * 3;
      rgb[j] = mix(rgb[j], col[0], k); rgb[j + 1] = mix(rgb[j + 1], col[1], k); rgb[j + 2] = mix(rgb[j + 2], col[2], k);
      return;
    }
    var cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    var R = Math.max(prx, pry) + 1;
    // 1画素より細い形は、縁を0.5画素ぶんとして描き、幅に比例して薄くする（太って見えないように）
    var minR = Math.min(prx, pry), edgeR = Math.max(minR, 0.5), thin = Math.min(1, minR / 0.5);
    var x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(w - 1, Math.ceil(px + R));
    var y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(h - 1, Math.ceil(py + R));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - px, dy = y + 0.5 - py;
        var u = (dx * cs + dy * sn) / prx, v = (-dx * sn + dy * cs) / pry;
        var d = Math.sqrt(u * u + v * v);
        // 縁を1画素ぶんなめらかにする
        var edge = clamp((1 - d) * edgeR + 0.5, 0, 1) * thin;
        if (edge <= 0) continue;
        var m = 1;
        if (shade) {
          var nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)));
          var lam = Math.max(0, u * LX + v * LY + nz * LZ);
          m = 0.45 + 0.85 * lam;
        }
        var t = edge * a0, i = (y * w + x) * 3;
        rgb[i] = mix(rgb[i], col[0] * m, t); rgb[i + 1] = mix(rgb[i + 1], col[1] * m, t); rgb[i + 2] = mix(rgb[i + 2], col[2] * m, t);
      }
    }
  };

  Canvas.prototype.toRGBA = function () {
    var n = this.w * this.h, out = new Uint8ClampedArray(n * 4), rgb = this.rgb;
    for (var i = 0, j = 0; i < n; i++, j += 3) {
      out[i * 4] = rgb[j]; out[i * 4 + 1] = rgb[j + 1]; out[i * 4 + 2] = rgb[j + 2]; out[i * 4 + 3] = 255;
    }
    return out;
  };

  /**
   * 高さ場 height(X, Y) から陰影つきの地を塗る。勾配は高さ1の単位で差分を取る（解像度に依存しない）。
   * colorAt(X, Y, hgt, lit) が色 [r, g, b] を返す。lit は 0（影）〜1（日なた）。
   */
  function paintGround(cv, height, gain, colorAt) {
    var w = cv.w, h = cv.h, rgb = cv.rgb, e = 0.004;
    for (var y = 0; y < h; y++) {
      var Y = (y + 0.5) / h;
      for (var x = 0; x < w; x++) {
        var X = (x + 0.5) / h;
        var hc = height(X, Y);
        var gx = (height(X + e, Y) - hc) / e, gy = (height(X, Y + e) - hc) / e;
        // 面の向き (-gx, -gy, 1) と光の内積
        var nl = (-gx * gain * LX - gy * gain * LY + LZ) / Math.sqrt(gx * gx * gain * gain + gy * gy * gain * gain + 1);
        // 平らな面（nl = LZ）で 0.75。光に向く面ほど明るく、背く面ほど影になる
        var lit = clamp(0.75 + (nl - LZ) * 2.0, 0, 1);
        var c = colorAt(X, Y, hc, lit), i = (y * w + x) * 3;
        rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
      }
    }
  }

  /** 全体に掛ける明るさのむら（雲の影・照明のむら）。k は強さ。 */
  function shadeField(cv, s, freq, k) {
    var w = cv.w, h = cv.h, rgb = cv.rgb;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var m = 1 + k * (fbm((x + 0.5) / h * freq, (y + 0.5) / h * freq, s, 3) - 0.5) * 2, i = (y * w + x) * 3;
        rgb[i] *= m; rgb[i + 1] *= m; rgb[i + 2] *= m;
      }
    }
  }

  // ===== 環境ごとの描き方 =====

  /** 雪: 吹きだまりの起伏、青みがかった影、ところどころのきらめき。 */
  function drawSnow(cv, s) {
    var height = function (X, Y) {
      return fbm(X * 1.6, Y * 1.6, s, 4) * 0.9 + fbm(X * 7, Y * 7, s + 7, 3) * 0.22 + fbm(X * 32, Y * 32, s + 9, 2) * 0.04;
    };
    paintGround(cv, height, 0.28, function (X, Y, hc, lit) {
      var c = [mix(176, 247, lit), mix(190, 249, lit), mix(216, 253, lit)];
      // きらめき: 細かいセルごとに、日の当たる面でだけまれに光る
      var cell = 0.004, sp = hash2(Math.floor(X / cell), Math.floor(Y / cell), s + 3);
      if (sp > 0.996 && lit > 0.6) { c[0] = 255; c[1] = 255; c[2] = 255; }
      return c;
    });
    shadeField(cv, s + 11, 0.8, 0.05);
  }

  /** 土: 黒っぽい土の塊と陰影、小石、乾いた葉や小枝のかけら。 */
  function drawSoil(cv, s) {
    var aspect = cv.w / cv.h, r = rng(s * 7 + 1);
    var height = function (X, Y) {
      var c = fbm(X * 9, Y * 9, s, 4);
      return c * 0.35 + Math.abs(fbm(X * 22, Y * 22, s + 5, 3) - 0.5) * 0.18;
    };
    paintGround(cv, height, 0.3, function (X, Y, hc, lit) {
      var tone = fbm(X * 1.8, Y * 1.8, s + 2, 3), damp = fbm(X * 0.7, Y * 0.7, s + 4, 2);
      var m = 0.55 + 0.6 * lit;
      return [mix(62, 120, tone) * m * mix(1, 0.8, damp), mix(46, 90, tone) * m * mix(1, 0.8, damp), mix(34, 64, tone) * m * mix(1, 0.85, damp)];
    });
    // 小石: 先に右下へずらした影、次に陰影つきの石
    var n = Math.round(90 * aspect);
    for (var i = 0; i < n; i++) {
      var cx = r() * aspect, cy = r(), rr = 0.002 + Math.pow(r(), 2.4) * 0.011, el = 0.65 + r() * 0.3, rot = r() * Math.PI;
      var g = 70 + r() * 50, warm = 6 + r() * 16;
      cv.ellipse(cx + rr * 0.35, cy + rr * 0.35, rr * 1.05, rr * el * 1.05, rot, [20, 15, 11], 0.55, false);
      cv.ellipse(cx, cy, rr, rr * el, rot, [g + warm, g + warm * 0.5, g - warm * 0.3], 1, true);
    }
    // 乾いた葉と小枝のかけら
    var m2 = Math.round(45 * aspect);
    for (var k = 0; k < m2; k++) {
      var tw = r() < 0.5;
      var col = tw ? [96 + r() * 30, 74 + r() * 20, 48] : [140 + r() * 40, 104 + r() * 30, 58 + r() * 20];
      cv.ellipse(r() * aspect, r(), tw ? 0.012 + r() * 0.02 : 0.006 + r() * 0.008, tw ? 0.0012 : 0.003 + r() * 0.003, r() * Math.PI, col, 0.9, !tw);
    }
  }

  /** 草: 暗い根元の地に、奥から手前へ重なる葉。色に幅を持たせ、ところどころ枯れ葉を混ぜる。 */
  function drawGrass(cv, s) {
    var aspect = cv.w / cv.h, r = rng(s * 13 + 5);
    paintGround(cv, function (X, Y) { return fbm(X * 6, Y * 6, s, 3) * 0.3; }, 0.5, function (X, Y, hc, lit) {
      var t = fbm(X * 3, Y * 3, s + 1, 3), m = 0.5 + 0.5 * lit;
      return [mix(26, 46, t) * m, mix(36, 60, t) * m, mix(18, 28, t) * m];
    });
    var n = Math.round(2600 * aspect);
    var blades = [];
    for (var i = 0; i < n; i++) blades.push([r() * aspect, r() * 1.1 + 0.02, r(), r(), r(), r(), r()]);
    blades.sort(function (a, b) { return a[1] - b[1]; }); // 奥（上）から手前（下）へ
    for (var b = 0; b < blades.length; b++) {
      var q = blades[b];
      var len = 0.035 + q[2] * 0.06, ang = (q[3] - 0.5) * 0.9, bend = (q[4] - 0.5) * 0.5;
      var dry = q[5] < 0.06, lightK = 0.75 + q[6] * 0.5;
      var tipCol = dry ? [150, 140, 84] : [mix(70, 120, q[6]) * lightK, mix(108, 150, q[5]) * lightK, mix(34, 58, q[4]) * lightK];
      var rootCol = [tipCol[0] * 0.45, tipCol[1] * 0.45, tipCol[2] * 0.45];
      var steps = 9, wid = 0.0028 + q[2] * 0.0018;
      for (var st = 0; st <= steps; st++) {
        var t = st / steps;
        var bx = q[0] + Math.sin(ang + bend * t) * len * t, by = q[1] - Math.cos(ang + bend * t) * len * t;
        var ct = Math.pow(t, 0.6);
        var col = [mix(rootCol[0], tipCol[0], ct), mix(rootCol[1], tipCol[1], ct), mix(rootCol[2], tipCol[2], ct)];
        var rw = wid * (1 - t * 0.85);
        cv.ellipse(bx, by, rw, len / steps * 0.75, ang + bend * t, col, 1, false);
      }
    }
    shadeField(cv, s + 21, 1.4, 0.12);
  }

  /** サーバールーム: ラックの列を正面から見た面。段ごとに通気孔・ドライブベイ・ポート・LED が並ぶ。 */
  function drawServer(cv, s) {
    var w = cv.w, h = cv.h, rgb = cv.rgb;
    var cw = 0.44, fr = 0.02, uh = 1 / 22;
    var LED = [[60, 230, 120], [255, 176, 50], [70, 150, 255]];
    for (var y = 0; y < h; y++) {
      var Y = (y + 0.5) / h;
      var u = Math.floor(Y / uh), ly = (Y - u * uh) / uh;
      var light = 1.18 - 0.42 * Y; // 天井の照明で上が明るい
      for (var x = 0; x < w; x++) {
        var X = (x + 0.5) / h + 0.07;
        var cab = Math.floor(X / cw), lx = X - cab * cw;
        var c0, c1, c2;
        if (lx < fr || lx > cw - fr) {
          // ラックの枠。縁に細いハイライト
          var e = lx < fr ? lx / fr : (cw - lx) / fr;
          c0 = c1 = c2 = 22 + 26 * Math.pow(1 - e, 6);
        } else {
          var kind = Math.floor(hash2(cab, u, s) * 4), ix = lx - fr, iw = cw - fr * 2;
          if (ly < 0.06 || ly > 0.94) { c0 = 12; c1 = 13; c2 = 15; } // 段の境目
          else if (kind === 0) {
            // 1U サーバー: 前面の通気孔（細かい丸穴の格子）
            var p = 0.0055, ax = (ix / p) % 1 - 0.5, ay = ((Y + (Math.floor(ix / p) % 2) * p * 0.5) / p) % 1 - 0.5;
            var hole = ix > 0.06 && ix < iw - 0.03 && ax * ax + ay * ay < 0.09;
            c0 = hole ? 10 : 40; c1 = hole ? 11 : 43; c2 = hole ? 13 : 48;
          } else if (kind === 1) {
            // ドライブベイ: 縦のすき間
            var bay = (ix / 0.034) % 1;
            c0 = bay < 0.08 ? 14 : 52; c1 = bay < 0.08 ? 15 : 55; c2 = bay < 0.08 ? 18 : 60;
          } else if (kind === 2) {
            // スイッチ: ポートの列
            var pt = (ix / 0.016) % 1, inPort = ix > 0.08 && pt > 0.15 && pt < 0.85 && ly > 0.3 && ly < 0.75;
            c0 = inPort ? 8 : 34; c1 = inPort ? 9 : 36; c2 = inPort ? 10 : 40;
          } else { c0 = 30; c1 = 32; c2 = 36; } // ブランクパネル
          // LED と、そのにじみ
          var lr = Math.floor(hash2(cab, u, s + 5) * 3), on = hash2(cab, u, s + 9) > 0.25;
          if (on && kind !== 3) {
            var dxl = (ix - 0.03) * h, dyl = (ly - 0.5) * uh * h, d2 = dxl * dxl + dyl * dyl, rad = Math.max(0.6, uh * h * 0.09);
            var gl = Math.exp(-d2 / (rad * rad * 6)) * 0.8 + (d2 < rad * rad ? 1 : 0);
            c0 = mix(c0, LED[lr][0], Math.min(1, gl)); c1 = mix(c1, LED[lr][1], Math.min(1, gl)); c2 = mix(c2, LED[lr][2], Math.min(1, gl));
          }
        }
        var i = (y * w + x) * 3;
        rgb[i] = c0 * light; rgb[i + 1] = c1 * light; rgb[i + 2] = c2 * light;
      }
    }
    shadeField(cv, s + 31, 2.2, 0.06);
  }

  /** ケーブル群: 上のパネルのポートから下へ垂れる束。円筒の陰影と光沢を付け、奥から手前へ重ねる。 */
  function drawCables(cv, s) {
    var w = cv.w, h = cv.h, rgb = cv.rgb, aspect = w / h, r = rng(s * 17 + 3);
    // 背景: 暗い奥行きと、上端のパッチパネル
    for (var y = 0; y < h; y++) {
      var Y = (y + 0.5) / h;
      for (var x = 0; x < w; x++) {
        var X = (x + 0.5) / h, i = (y * w + x) * 3, v;
        if (Y < 0.13) {
          var pt = (X / 0.03) % 1, port = Y > 0.05 && Y < 0.1 && pt > 0.18 && pt < 0.82;
          v = port ? 12 : 46 + 10 * (1 - Y / 0.13);
        } else v = 14 + fbm(X * 3, Y * 3, s, 3) * 16;
        rgb[i] = v; rgb[i + 1] = v * 1.02; rgb[i + 2] = v * 1.1;
      }
    }
    var PAL = [[38, 86, 205], [38, 86, 205], [52, 104, 225], [30, 70, 180], [150, 152, 150], [178, 176, 168], [230, 196, 40], [196, 44, 40], [48, 160, 70]];
    // 束: ポートの位置から出て、いくつかの束の中心へ寄りながら垂れる
    var n = Math.round(62 * aspect), groups = [];
    for (var gi = 0; gi < 4; gi++) groups.push(0.1 * aspect + (gi + r() * 0.6) * aspect * 0.22);
    var cables = [];
    for (var c = 0; c < n; c++) {
      // 近くの束へ寄る（遠くの束へ斜めに横切らない）
      var x0 = r() * aspect, near = groups[0];
      for (var gk = 1; gk < groups.length; gk++) if (Math.abs(groups[gk] - x0) < Math.abs(near - x0)) near = groups[gk];
      cables.push({ x0: x0, gx: near + (r() - 0.5) * 0.12, depth: r(),
        col: PAL[Math.floor(r() * PAL.length)], ph: r() * 6.28, sag: 0.3 + r() * 0.5 });
    }
    cables.sort(function (a, b) { return a.depth - b.depth; });
    var dist = new Float32Array(w * h), side = new Float32Array(w * h), touched = [];
    for (var i0 = 0; i0 < dist.length; i0++) dist[i0] = 1e9;
    for (var ci = 0; ci < cables.length; ci++) {
      var cb = cables[ci], rad = 0.009 + cb.depth * 0.009, pr = rad * h;
      var pts = [];
      for (var t = 0; t <= 1.0001; t += 0.02) {
        var yy = 0.1 + t * 1.0, pull = smooth(0, cb.sag, t);
        var xx = mix(cb.x0, cb.gx, pull) + Math.sin(t * 6 + cb.ph) * 0.03 * t + Math.sin(t * 15 + cb.ph * 2) * 0.008;
        pts.push([xx * h, yy * h]);
      }
      // 中心線からの距離（符号つき）を、このケーブルの範囲だけ求める
      for (var sg = 0; sg + 1 < pts.length; sg++) {
        var ax = pts[sg][0], ay = pts[sg][1], bx = pts[sg + 1][0], by = pts[sg + 1][1];
        var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
        var x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pr - 1)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + pr + 1));
        var y0 = Math.max(0, Math.floor(Math.min(ay, by) - pr - 1)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + pr + 1));
        for (var py = y0; py <= y1; py++) {
          for (var px = x0; px <= x1; px++) {
            var qx = px + 0.5 - ax, qy = py + 0.5 - ay, tt = clamp((qx * vx + qy * vy) / L2, 0, 1);
            var ex = qx - vx * tt, ey = qy - vy * tt, d = Math.sqrt(ex * ex + ey * ey), j = py * w + px;
            if (d < dist[j]) {
              if (dist[j] === 1e9) touched.push(j);
              dist[j] = d; side[j] = (vx * qy - vy * qx) > 0 ? 1 : -1;
            }
          }
        }
      }
      for (var k = 0; k < touched.length; k++) {
        var jj = touched[k], dd = dist[jj];
        var cover = clamp(pr - dd + 0.5, 0, 1);
        if (cover > 0) {
          var nx = clamp(dd / Math.max(pr, 0.5), 0, 1) * side[jj], nz = Math.sqrt(Math.max(0, 1 - nx * nx));
          var lam = Math.max(0, nx * LX * 0.9 + nz * LZ + 0.25), spec = Math.pow(Math.max(0, 1 - Math.abs(nx + 0.35) * 3), 3) * 0.55;
          var m = (0.3 + 0.75 * lam) * (0.75 + 0.35 * cb.depth), q = jj * 3;
          rgb[q] = mix(rgb[q], cb.col[0] * m + 255 * spec, cover);
          rgb[q + 1] = mix(rgb[q + 1], cb.col[1] * m + 255 * spec, cover);
          rgb[q + 2] = mix(rgb[q + 2], cb.col[2] * m + 255 * spec, cover);
        }
        dist[jj] = 1e9;
      }
      touched.length = 0;
    }
  }

  /** 森の小道: 苔・土・落ち葉のまだらの地に、下草の葉と落ち葉。木漏れ日の明暗を重ねる。 */
  function drawForest(cv, s) {
    var w = cv.w, h = cv.h, rgb = cv.rgb, aspect = w / h, r = rng(s * 19 + 7);
    paintGround(cv, function (X, Y) { return fbm(X * 5, Y * 5, s, 4) * 0.35; }, 0.6, function (X, Y, hc, lit) {
      var moss = smooth(0.42, 0.62, fbm(X * 1.6, Y * 1.6, s + 3, 4)), litter = smooth(0.4, 0.7, fbm(X * 4, Y * 4, s + 6, 3));
      var m = 0.55 + 0.6 * lit;
      var r0 = mix(mix(58, 112, litter), 82, moss), g0 = mix(mix(46, 84, litter), 104, moss), b0 = mix(mix(32, 52, litter), 46, moss);
      return [r0 * m, g0 * m, b0 * m];
    });
    // 落ち葉
    var n = Math.round(700 * aspect);
    for (var i = 0; i < n; i++) {
      var t = r(), v = 0.75 + r() * 0.35;
      var col = t < 0.55 ? [96 * v, 72 * v, 44 * v] : (t < 0.85 ? [124 * v, 100 * v, 58 * v] : [84 * v, 90 * v, 48 * v]);
      cv.ellipse(r() * aspect, r(), 0.008 + r() * 0.012, 0.0035 + r() * 0.004, r() * Math.PI, col, 0.9, true);
    }
    // 下草: 小さな緑の葉のかたまり
    var cl = Math.round(40 * aspect);
    for (var c = 0; c < cl; c++) {
      var cx = r() * aspect, cy = r(), g = 0.8 + r() * 0.5;
      for (var k = 0; k < 14; k++) {
        var a = r() * 6.28, d = r() * 0.03;
        cv.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 0.008 + r() * 0.01, 0.004 + r() * 0.004, a, [56 * g, 104 * g, 38 * g], 0.95, true);
      }
    }
    // 木漏れ日: 日の当たるところは暖かく明るく、影は青みがかって暗く
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var X = (x + 0.5) / h, Y = (y + 0.5) / h;
        var warp = fbm(X * 1.2, Y * 1.2, s + 41, 2) * 0.6;
        var sun = smooth(0.5, 0.62, fbm(X * 2.6 + warp, Y * 2.6 - warp, s + 43, 4)), q = (y * w + x) * 3;
        rgb[q] *= mix(0.62, 1.3, sun); rgb[q + 1] *= mix(0.66, 1.24, sun); rgb[q + 2] *= mix(0.78, 1.02, sun);
      }
    }
  }

  /**
   * プリセットの一覧。並びは画面のボタンの順（写真 EnvPhoto と同じ id・同じ順）。
   * draw = 描き方。
   */
  var PRESETS = [
    { id: 'forest', nameJa: '森の小道',       nameEn: 'Forest path',  descJa: '苔と土と落ち葉のまだらに、下草と木漏れ日の明暗が重なる', draw: drawForest },
    { id: 'snow',   nameJa: '雪',             nameEn: 'Snow',         descJa: '明るく白い。吹きだまりの起伏に青みがかった影が落ち、ところどころ光る', draw: drawSnow },
    { id: 'soil',   nameJa: '土',             nameEn: 'Soil',         descJa: '黒っぽい土の塊と陰影。小石や乾いた葉のかけらが混じる', draw: drawSoil },
    { id: 'grass',  nameJa: '草',             nameEn: 'Grass',        descJa: '奥から手前へ重なる葉。色に幅があり、枯れ葉が混じる', draw: drawGrass },
    { id: 'server', nameJa: 'サーバールーム', nameEn: 'Server room',  descJa: 'ラックの列を正面から見た面。通気孔・ドライブベイ・ポートと LED が並ぶ', draw: drawServer },
    { id: 'cables', nameJa: 'ケーブル群',     nameEn: 'Cable bundle', descJa: 'パッチパネルから垂れる色とりどりのケーブル。円筒の陰影と光沢がある', draw: drawCables }
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

  function hashId(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  var cache = {};
  var cacheKeys = [];
  var CACHE_MAX = 16;

  /** キャッシュつきで背景を作る（返した配列を書き換えないこと）。 */
  function renderShared(p, w, h, seed) {
    var key = p.id + '|' + w + '|' + h + '|' + seed;
    if (cache[key]) return cache[key];
    var cv = new Canvas(w, h);
    p.draw(cv, (seed * 2654435761 + hashId(p.id)) >>> 0);
    var out = cv.toRGBA();
    cache[key] = out; cacheKeys.push(key);
    if (cacheKeys.length > CACHE_MAX) delete cache[cacheKeys.shift()];
    return out;
  }

  /**
   * プリセットの背景を w×h の RGBA で作る。
   * @param {string|object} idOrPreset プリセットの id か、id を持つオブジェクト
   * @param {number} w
   * @param {number} h
   * @param {object} [opts] { seed }
   * @returns {Uint8ClampedArray} 長さ w*h*4（呼び出し側が書き換えてよい複製）
   */
  function render(idOrPreset, w, h, opts) {
    var p = find(typeof idOrPreset === 'string' ? idOrPreset : (idOrPreset && idOrPreset.id));
    var o = opts || {};
    if (!p) {
      var black = new Uint8ClampedArray(w * h * 4);
      for (var z = 3; z < black.length; z += 4) black[z] = 255;
      return black;
    }
    return renderShared(p, w, h, o.seed || 1).slice();
  }

  /**
   * パターンの画素を、与えた背景の一覧に対して採点し、馴染み度の高い順に並べる。
   * @param {ArrayLike<number>} patternPixels パターンの RGBA
   * @param {Array<{id,nameJa,nameEn,pixels}>} envs 背景の一覧（パターンと同じ画素数の RGBA）
   * @param {number} [step] 間引き
   * @returns {Array<{id,nameJa,nameEn,blend,colorMatch,lumMatch,contrastMatch,grade}>}
   */
  function rankAgainst(patternPixels, envs, step) {
    var s = step || 7;
    var patStats = BS.stats(patternPixels, s);
    var rows = envs.map(function (e) {
      var r = BS.score(patStats, BS.stats(e.pixels, s));
      return {
        id: e.id, nameJa: e.nameJa, nameEn: e.nameEn,
        blend: r.blend, colorMatch: r.colorMatch, lumMatch: r.lumMatch, contrastMatch: r.contrastMatch,
        grade: BS.grade(r.blend)
      };
    });
    rows.sort(function (a, b) { return b.blend - a.blend; });
    return rows;
  }

  /**
   * パターンの画素を、全プリセット（生成）の背景に対して採点して馴染み度の高い順に並べる。
   * transform(rgba) を渡すと、背景にも同じ変換（色覚の見え方など）をかけてから比べる。
   */
  function rankPattern(patternPixels, w, h, step, transform) {
    var envs = PRESETS.map(function (p) {
      var px = renderShared(p, w, h, 1);
      if (transform) px = transform(px.slice());
      return { id: p.id, nameJa: p.nameJa, nameEn: p.nameEn, pixels: px };
    });
    return rankAgainst(patternPixels, envs, step);
  }

  global.EnvPreset = { PRESETS: PRESETS, list: list, render: render, rankPattern: rankPattern, rankAgainst: rankAgainst };
  if (typeof module !== 'undefined' && module.exports) module.exports = { EnvPreset: global.EnvPreset };
})(typeof globalThis !== 'undefined' ? globalThis : this);
