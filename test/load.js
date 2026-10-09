// 画面と同じ通常のスクリプト（js/*.js）を、テストの実行環境に読み込む。
// color-utils → cable-plan の順で読む（cable-plan は CamoColor を使う）。
import fs from 'node:fs';
import vm from 'node:vm';

export const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const loaded = new Set();
export function load(file) {
  if (!loaded.has(file)) {
    vm.runInThisContext(read(file), { filename: file });
    loaded.add(file);
  }
  return globalThis;
}

export const color = () => load('js/color-utils.js').CamoColor;
export const cable = () => { load('js/color-utils.js'); return load('js/cable-plan.js').CableBundle; };
export const blend = () => load('js/blend-score.js').BlendScore;
export const extract = () => { load('js/color-utils.js'); return load('js/palette-extract.js').PaletteExtract; };
export const detect = () => load('js/detect-map.js').DetectMap;
export const envpreset = () => { load('js/blend-score.js'); return load('js/env-presets.js').EnvPreset; };
export const cues = () => load('js/detect-cues.js').DetectCues;
export const messages = () => load('js/messages.js').I18N_MESSAGES;
