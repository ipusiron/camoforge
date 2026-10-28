import test from 'node:test';
import assert from 'node:assert/strict';
import { envpreset, envphoto } from './load.js';

const EP = envpreset();

/** w×h の一様なパターンを RGBA で作る。 */
function uniform(w, h, rgb) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = rgb[0]; a[i * 4 + 1] = rgb[1]; a[i * 4 + 2] = rgb[2]; a[i * 4 + 3] = 255; }
  return a;
}

/** RGBA の平均色を出す。 */
function mean(px) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return [r / n, g / n, b / n];
}

test('プリセットは6種類で、id は重複しない', () => {
  const l = EP.list();
  assert.equal(l.length, 6);
  const ids = l.map((p) => p.id);
  assert.equal(new Set(ids).size, 6);
  assert.deepEqual(ids.sort(), ['cables', 'forest', 'grass', 'server', 'snow', 'soil']);
});

test('生成の id と並びは、写真（EnvPhoto）と同じ', () => {
  assert.deepEqual(EP.list().map((p) => p.id), envphoto().list().map((p) => p.id));
});

test('各プリセットに日本語名と英語名がある', () => {
  for (const p of EP.list()) {
    assert.ok(p.nameJa && p.nameJa.length > 0, p.id);
    assert.ok(p.nameEn && p.nameEn.length > 0, p.id);
  }
});

test('render は w*h*4 の長さで、不透明（アルファ255）', () => {
  const w = 20, h = 12;
  const px = EP.render('snow', w, h);
  assert.equal(px.length, w * h * 4);
  for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255);
});

test('同じ id・サイズ・シードなら、同じ画素になる（再現できる）', () => {
  const a = EP.render('grass', 24, 24, { seed: 3 });
  const b = EP.render('grass', 24, 24, { seed: 3 });
  assert.deepEqual(a, b);
});

test('知らない id は黒で埋める（落ちない）', () => {
  const px = EP.render('unknown', 4, 4);
  assert.equal(px.length, 64);
  assert.deepEqual(mean(px), [0, 0, 0]);
});

test('雪は明るく青みがかり、土は茶色（赤>青）、草と森は緑が優勢、サーバールームは暗く、ケーブル群は青が強い', () => {
  const W = 64, H = 36;
  const [sr, sg, sb] = mean(EP.render('snow', W, H));
  assert.ok((sr + sg + sb) / 3 > 190, `snow lum ${(sr + sg + sb) / 3}`);
  assert.ok(sb > sr, `snow b ${sb} > r ${sr}`);

  const [dr, , db] = mean(EP.render('soil', W, H));
  assert.ok(dr > db, `soil r ${dr} > b ${db}`);

  const [gr, gg, gb] = mean(EP.render('grass', W, H));
  assert.ok(gg > gb && gg > gr, `grass g ${gg} > r ${gr}, b ${gb}`);

  const [, fg, fb] = mean(EP.render('forest', W, H));
  assert.ok(fg > fb, `forest g ${fg} > b ${fb}`);

  const srv = mean(EP.render('server', W, H));
  assert.ok((srv[0] + srv[1] + srv[2]) / 3 < 60, `server lum ${(srv[0] + srv[1] + srv[2]) / 3}`);

  const [cr, , cb] = mean(EP.render('cables', W, H));
  assert.ok(cb > cr, `cables b ${cb} > r ${cr}`);
});

test('解像度を変えても同じ絵になる（採点用の縮小と表示で平均の色がずれない）', () => {
  for (const p of EP.list()) {
    // 画面は 1280×720 で表示し、160×90 で採点する。テストは時間のかからない 320×180 と比べる
    const big = mean(EP.render(p.id, 320, 180));
    const small = mean(EP.render(p.id, 160, 90));
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(big[c] - small[c]) < 4, `${p.id} ch${c} ${big[c].toFixed(1)} vs ${small[c].toFixed(1)}`);
  }
});

test('シードを変えると別の絵になる', () => {
  const a = EP.render('soil', 40, 24, { seed: 1 });
  const b = EP.render('soil', 40, 24, { seed: 2 });
  assert.notDeepEqual(a, b);
});

test('render が返す配列を書き換えても、次の render に影響しない（キャッシュを壊さない）', () => {
  const a = EP.render('forest', 16, 9);
  a.fill(0);
  const b = EP.render('forest', 16, 9);
  assert.ok(mean(b)[1] > 0);
});

test('id を持つオブジェクトでも描ける', () => {
  assert.deepEqual(EP.render({ id: 'snow' }, 8, 6), EP.render('snow', 8, 6));
});

test('rankAgainst は与えた背景の一覧を、馴染み度の高い順に並べる', () => {
  const W = 8, H = 8;
  const green = uniform(W, H, [80, 104, 54]);
  const envs = [
    { id: 'white', nameJa: '白', nameEn: 'White', pixels: uniform(W, H, [240, 240, 240]) },
    { id: 'green', nameJa: '緑', nameEn: 'Green', pixels: uniform(W, H, [80, 104, 54]) }
  ];
  const rows = EP.rankAgainst(green, envs, 1);
  assert.deepEqual(rows.map((r) => r.id), ['green', 'white']);
  assert.equal(rows[0].blend, 100);
});

test('rankPattern に変換を渡すと、背景にも同じ変換をかけてから比べる', () => {
  const W = 32, H = 18;
  const black = uniform(W, H, [0, 0, 0]);
  const toBlack = (px) => { for (let i = 0; i < px.length; i += 4) { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; } return px; };
  const rows = EP.rankPattern(black, W, H, 1, toBlack);
  for (const r of rows) assert.equal(r.blend, 100, r.id);
});

test('rankPattern は馴染み度の高い順に、全プリセットを返す', () => {
  const W = 48, H = 48;
  const pattern = uniform(W, H, [80, 104, 54]); // 草に近い緑
  const rows = EP.rankPattern(pattern, W, H);
  assert.equal(rows.length, 6);
  // 降順になっている
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].blend >= rows[i].blend);
  // 各行は0〜100で段階ラベルを持つ
  for (const r of rows) {
    assert.ok(r.blend >= 0 && r.blend <= 100);
    assert.ok(['high', 'medium', 'low', 'poor'].includes(r.grade));
  }
});

test('緑のパターンは、雪より草によく馴染む（万能の迷彩は無い）', () => {
  const W = 48, H = 48;
  const green = uniform(W, H, [80, 104, 54]);
  const rows = EP.rankPattern(green, W, H);
  const grass = rows.find((r) => r.id === 'grass');
  const snow = rows.find((r) => r.id === 'snow');
  assert.ok(grass.blend > snow.blend, `grass ${grass.blend} > snow ${snow.blend}`);
});

test('白いパターンは、草より雪によく馴染む', () => {
  const W = 48, H = 48;
  const white = uniform(W, H, [228, 232, 240]);
  const rows = EP.rankPattern(white, W, H);
  const grass = rows.find((r) => r.id === 'grass');
  const snow = rows.find((r) => r.id === 'snow');
  assert.ok(snow.blend > grass.blend, `snow ${snow.blend} > grass ${grass.blend}`);
});
