// main.js
// CamoForge — Camouflage Pattern Generator (client-only)
// 可視合成・デザイン・研究用デモ。監視回避や不正隠蔽の具体的手法には使用しないこと。

document.addEventListener('DOMContentLoaded', () => {
  // ===== Canvas setup =====
  const canvas = document.getElementById('patternCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const comp = document.getElementById('compositeCanvas');
  const cctx = comp.getContext('2d', { alpha: false });
  const envOnlyCanvas = document.getElementById('envOnlyCanvas');
  const envOnlyCtx = envOnlyCanvas ? envOnlyCanvas.getContext('2d', { alpha: false }) : null;

  // ===== UI elements =====
  const patternTypeEl  = document.getElementById('patternType');
  const palettePresetEl = document.getElementById('palettePreset');
  const scaleEl        = document.getElementById('scale');
  const contrastEl     = document.getElementById('contrast');
  const brightEl       = document.getElementById('brightness');
  const paletteEl      = document.getElementById('palette');
  const palettePreview = document.getElementById('palettePreview');
  const regenBtn       = document.getElementById('regen');
  const randomizeBtn   = document.getElementById('randomize');
  const exportBtn      = document.getElementById('export');
  const envUpload      = document.getElementById('envUpload');
  const overlayAlpha   = document.getElementById('overlayAlpha');
  const showOverlay    = document.getElementById('showOverlay');

  // Range value displays
  const scaleValue    = document.getElementById('scaleValue');
  const contrastValue = document.getElementById('contrastValue');
  const brightnessValue = document.getElementById('brightnessValue');
  const alphaValue    = document.getElementById('alphaValue');

  let envImage = null;
  let allPresets = {}; // Store all available presets by category for randomization
  let colorVisionMode = 'normal';
  let edgeDetectionEnabled = false;

  // Pattern seed for deterministic regeneration (only changes on regenerate button click)
  let patternSeed = Math.random() * 10000;

  // Pattern type to drawing function mapping
  const PATTERN_TYPE_MAP = {
    'military': 'custom-noise',
    'cable': 'cable-bundle',
    'hardware': 'hw-panel',
    'black-matte': 'black-matte',
    'digital': 'digital-camo',
    'custom': 'custom-noise'
  };

  // Pattern type to recommended preset categories
  const PATTERN_PRESETS = {
    'military': ['military_camouflage'],
    'cable': ['cable_bundles'],
    'hardware': ['hardware_panels'],
    'black-matte': ['black_matte'],  // 漆黒マット専用（単色の黒系のみ）
    'digital': ['digital_camouflage'],
    'custom': ['military_camouflage', 'cable_bundles', 'hardware_panels', 'office_backgrounds']
  };

  // ===== Helpers =====
  const parsePalette = CamoColor.parsePalette;

  // 色の検証も CamoColor（js/color-utils.js）に集約した。
  const sanitizeColorInput = CamoColor.sanitizeColorInput;

  function randomInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomFloat(min, max, decimals = 2){
    const val = Math.random() * (max - min) + min;
    return Number(val.toFixed(decimals));
  }

  function randomColorHex(){
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  }

  function randomPalette(colorCount = null){
    const count = colorCount || randomInt(3, 6);
    const colors = [];
    for(let i = 0; i < count; i++){
      colors.push(randomColorHex());
    }
    return colors.join(',');
  }

  // ===== Color vision simulation =====
  // 変換そのものは js/color-vision.js（ColorVision）。ImageData にかける薄い包み。
  function applyColorVisionFilter(imageData, mode){
    ColorVision.apply(imageData.data, mode);
    return imageData;
  }

  // 採点用: RGBA の複製に、いま選んでいる色覚の変換をかけて返す（元の配列は変えない）
  function cvdCopy(px){
    const out = new Uint8ClampedArray(px);
    return colorVisionMode === 'normal' ? out : ColorVision.apply(out, colorVisionMode);
  }

  // ===== Edge detection (Sobel filter) =====
  /**
   * Apply Sobel edge detection filter to highlight contours in the image
   * This helps identify areas where camouflage patterns "break" and become visible.
   * Uses the Sobel operator, a standard computer vision technique for edge detection.
   *
   * @param {ImageData} imageData - Canvas ImageData object to process
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   * @returns {ImageData} Modified ImageData with edges highlighted
   */
  function applyEdgeDetection(imageData, width, height){
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    // Sobel kernels for horizontal and vertical edge detection
    // These 3x3 convolution kernels detect changes in pixel intensity
    const sobelX = [  // Horizontal edges
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1]
    ];
    const sobelY = [  // Vertical edges
      [-1, -2, -1],
      [ 0,  0,  0],
      [ 1,  2,  1]
    ];

    // Convert to grayscale first (edge detection works on intensity, not color)
    // Using ITU-R BT.601 luminance formula
    const gray = new Array(width * height);
    for(let i = 0; i < data.length; i += 4){
      const idx = i / 4;
      gray[idx] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // Apply Sobel operator (skip border pixels to avoid edge cases)
    for(let y = 1; y < height - 1; y++){
      for(let x = 1; x < width - 1; x++){
        let gx = 0, gy = 0;

        // Convolve 3x3 neighborhood with Sobel kernels
        for(let ky = -1; ky <= 1; ky++){
          for(let kx = -1; kx <= 1; kx++){
            const idx = (y + ky) * width + (x + kx);
            const weight = gray[idx];
            gx += weight * sobelX[ky + 1][kx + 1];  // Horizontal gradient
            gy += weight * sobelY[ky + 1][kx + 1];  // Vertical gradient
          }
        }

        // Calculate gradient magnitude (edge strength)
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const normalized = Math.min(255, magnitude);

        // Write grayscale edge intensity to output
        const i = (y * width + x) * 4;
        output[i] = normalized;      // R
        output[i + 1] = normalized;  // G
        output[i + 2] = normalized;  // B
        output[i + 3] = 255;         // A (fully opaque)
      }
    }

    // Copy output back to imageData
    for(let i = 0; i < data.length; i++){
      data[i] = output[i];
    }

    return imageData;
  }

  // 色のユーティリティは js/color-utils.js（CamoColor）に集約した。
  // 以前は hexToRgb がこのファイルに2つあり、後勝ちの版が3桁HEX（#RGB）を黒にしていた。
  const hexToRgb = CamoColor.hexToRgb;
  const clamp = CamoColor.clamp;
  const shade = CamoColor.shade;
  // cover draw (preserve aspect, crop overflow)
  function drawImageCover(ctx, img, x, y, w, h){
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const ir = iw/ih;
    const cr = w/h;
    let sx=0, sy=0, sw=iw, sh=ih;
    if(ir > cr){ sw = ih * cr; sx = (iw - sw)/2; }
    else { sh = iw / cr; sy = (ih - sh)/2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke){
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
    if(fill) ctx.fill();
    if(stroke) ctx.stroke();
  }

  // ===== Update range value displays =====
  function updateRangeValues(){
    scaleValue.textContent = scaleEl.value;
    contrastValue.textContent = Number(contrastEl.value).toFixed(2);
    brightnessValue.textContent = Number(brightEl.value).toFixed(2);
    alphaValue.textContent = Number(overlayAlpha.value).toFixed(2);
  }

  // ===== Update palette preview =====
  function updatePalettePreview(){
    const colors = parsePalette(paletteEl.value);
    palettePreview.innerHTML = '';
    colors.forEach((color, index) => {
      const swatch = document.createElement('div');
      swatch.className = 'palette-swatch';
      swatch.style.backgroundColor = color;
      swatch.setAttribute('data-color', color);
      swatch.setAttribute('data-index', index);
      swatch.style.cursor = 'pointer';
      swatch.title = T('gen.swatchTitle').replace('{color}', color);

      // クリックでカラーピッカーを表示
      swatch.addEventListener('click', () => {
        openColorPicker(color, index);
      });

      palettePreview.appendChild(swatch);
    });
  }

  // ===== Color picker modal for palette swatch =====
  let colorPickerState = {
    currentIndex: -1,
    originalColor: '',
    tempColor: ''
  };

  // hexToRgb は CamoColor の1つを使う（上で定義済み）。rgbToHex も CamoColor から。
  const rgbToHex = CamoColor.rgbToHex;

  // Update color preview and sliders
  function updateColorPickerUI(hexColor){
    const previewBox = document.getElementById('colorPreviewBox');
    const hexInput = document.getElementById('colorHexInput');
    const redSlider = document.getElementById('colorRedSlider');
    const greenSlider = document.getElementById('colorGreenSlider');
    const blueSlider = document.getElementById('colorBlueSlider');
    const redValue = document.getElementById('colorRedValue');
    const greenValue = document.getElementById('colorGreenValue');
    const blueValue = document.getElementById('colorBlueValue');

    // Update preview box
    previewBox.style.backgroundColor = hexColor;

    // Update HEX input
    hexInput.value = hexColor.toUpperCase();

    // Update RGB sliders
    const rgb = hexToRgb(hexColor);
    redSlider.value = rgb.r;
    greenSlider.value = rgb.g;
    blueSlider.value = rgb.b;
    redValue.textContent = rgb.r;
    greenValue.textContent = rgb.g;
    blueValue.textContent = rgb.b;

    // Update temporary color and real-time preview
    colorPickerState.tempColor = hexColor;
    updatePaletteColor(colorPickerState.currentIndex, hexColor);
  }

  // Open color picker modal
  function openColorPicker(currentColor, index){
    const modal = document.getElementById('colorPickerModal');

    // Store state
    colorPickerState.currentIndex = index;
    colorPickerState.originalColor = currentColor;
    colorPickerState.tempColor = currentColor;

    // Initialize UI with current color
    updateColorPickerUI(currentColor);

    // Show modal
    modal.style.display = 'flex';
    const hexInput = document.getElementById('colorHexInput');
    if(hexInput) hexInput.focus();
  }

  // Close color picker modal
  function closeColorPicker(){
    const modal = document.getElementById('colorPickerModal');
    modal.style.display = 'none';
  }

  // Confirm color change
  function confirmColorChange(){
    // Color is already applied via real-time preview
    closeColorPicker();
  }

  // Cancel color change
  function cancelColorChange(){
    // Restore original color
    updatePaletteColor(colorPickerState.currentIndex, colorPickerState.originalColor);
    closeColorPicker();
  }

  // Initialize color picker event listeners
  function initColorPicker(){
    const modal = document.getElementById('colorPickerModal');
    const closeBtn = document.getElementById('colorPickerClose');
    const confirmBtn = document.getElementById('colorPickerConfirm');
    const cancelBtn = document.getElementById('colorPickerCancel');
    const hexInput = document.getElementById('colorHexInput');
    const redSlider = document.getElementById('colorRedSlider');
    const greenSlider = document.getElementById('colorGreenSlider');
    const blueSlider = document.getElementById('colorBlueSlider');

    // Close button
    closeBtn.addEventListener('click', cancelColorChange);

    // Confirm button
    confirmBtn.addEventListener('click', confirmColorChange);

    // Cancel button
    cancelBtn.addEventListener('click', cancelColorChange);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if(e.target === modal){
        cancelColorChange();
      }
    });

    // Escape キーで閉じる
    modal.addEventListener('keydown', (e) => {
      if(e.key === 'Escape'){ cancelColorChange(); }
    });

    // RGB sliders
    const updateFromSliders = () => {
      const r = parseInt(redSlider.value);
      const g = parseInt(greenSlider.value);
      const b = parseInt(blueSlider.value);
      const hexColor = rgbToHex(r, g, b);
      updateColorPickerUI(hexColor);
    };

    redSlider.addEventListener('input', updateFromSliders);
    greenSlider.addEventListener('input', updateFromSliders);
    blueSlider.addEventListener('input', updateFromSliders);

    // HEX input
    hexInput.addEventListener('input', (e) => {
      let hex = e.target.value.trim();
      // Auto-add # if missing
      if(!hex.startsWith('#')){
        hex = '#' + hex;
      }
      // Validate HEX format
      if(/^#[0-9A-Fa-f]{6}$/.test(hex)){
        updateColorPickerUI(hex);
      }
    });
  }

  // ===== Update specific color in palette =====
  function updatePaletteColor(index, newColor){
    const colors = parsePalette(paletteEl.value);
    if(index >= 0 && index < colors.length){
      colors[index] = newColor;
      paletteEl.value = colors.join(',');
      updatePalettePreview();
      draw();
    }
  }

  // ===== Randomize all parameters =====
  function randomizeAll(){
    // Generate new pattern seed
    patternSeed = Math.random() * 10000;

    // Keep current pattern type (don't randomize)
    const patternType = patternTypeEl.value;

    // Get all available presets for current pattern type
    const availableCategories = PATTERN_PRESETS[patternType] || [];
    let availablePresets = [];
    availableCategories.forEach(catKey => {
      if(allPresets[catKey]){
        availablePresets = availablePresets.concat(allPresets[catKey].items.map(i => i.value));
      }
    });

    // Random preset from available presets (70% chance) or completely random palette (30% chance)
    if(availablePresets.length > 0 && Math.random() > 0.3){
      const randomPreset = availablePresets[randomInt(0, availablePresets.length - 1)];
      paletteEl.value = randomPreset;
      palettePresetEl.value = randomPreset;
    } else {
      paletteEl.value = randomPalette();
      palettePresetEl.value = ''; // Reset to custom
    }

    // Random scale (20-250)
    scaleEl.value = randomInt(20, 250);

    // Random contrast (0.3-2.2)
    contrastEl.value = randomFloat(0.3, 2.2, 2);

    // Random brightness (-0.8 to 0.8)
    brightEl.value = randomFloat(-0.8, 0.8, 2);

    // Update UI
    updateRangeValues();
    updatePalettePreview();
    draw();
  }

  // ===== Update palette preset options based on pattern type =====
  // keepSelection: 言語の切り替えで作り直すときは、選択中のプリセットを保つ
  function updatePaletteOptions(keepSelection){
    const patternType = patternTypeEl.value;
    const categories = PATTERN_PRESETS[patternType] || [];
    const selected = palettePresetEl.value;
    const en = curLang() === 'en';

    // 先頭の「カスタム入力」から作り直す
    palettePresetEl.textContent = '';
    const customOpt = document.createElement('option');
    customOpt.value = '';
    customOpt.textContent = T('opt.customInput');
    palettePresetEl.appendChild(customOpt);

    // Add relevant category presets
    categories.forEach(catKey => {
      if(allPresets[catKey]){
        const group = document.createElement('optgroup');
        group.label = T('presetGroup.' + catKey);
        allPresets[catKey].items.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = en ? item.labelEn : item.label;
          group.appendChild(opt);
        });
        palettePresetEl.appendChild(group);
      }
    });
    if(keepSelection) palettePresetEl.value = selected;
  }

  // ===== Core draw =====
  /**
   * Main rendering function - draws camouflage pattern and composites with environment
   * This function orchestrates all rendering steps:
   * 1. Generate camouflage pattern on patternCanvas
   * 2. Composite with environment image on compositeCanvas
   * 3. Apply color vision simulation if enabled
   * 4. Apply edge detection if enabled
   */
  // パターンの生成（パターンの設定が変わったときだけでよい重い処理）を分ける。
  // 重ね合わせ透明度のように合成の見た目だけ変える操作は composite() だけを呼ぶ（再生成しない）。
  // 指定したコンテキストにパターンを描く（解像度に依らず使えるよう切り出す）。
  function paintPattern(c, w, h, preset, scale, contrast, bright, palette){
    c.clearRect(0,0,w,h);
    c.fillStyle = '#000';
    c.fillRect(0,0,w,h);
    if(preset === 'black-matte') {
      drawBlackMatte(c,w,h,scale,contrast,bright,palette);
    } else if(preset === 'cable-bundle') {
      drawCableBundle(c,w,h,scale,contrast,bright,palette);
    } else if(preset === 'hw-panel') {
      drawHwPanel(c,w,h,scale,contrast,bright,palette);
    } else if(preset === 'digital-camo') {
      drawDigitalCamo(c,w,h,scale,contrast,bright,palette);
    } else {
      drawCustomNoise(c,w,h,scale,contrast,bright,palette);
    }
  }

  // ドラッグ中の仮描画用の縮小キャンバス
  const patternTmp = document.createElement('canvas');

  // パターンを patternCanvas に描く。preview=true のときは縮小解像度で描いて拡大する（ドラッグ中に軽くする）。
  function renderPattern(preview){
    const w = canvas.width  = 1280;
    const h = canvas.height = 720;
    comp.width = w; comp.height = h;
    if(envOnlyCanvas) {
      envOnlyCanvas.width = w;
      envOnlyCanvas.height = h;
    }

    const patternType = patternTypeEl.value;
    const preset   = PATTERN_TYPE_MAP[patternType] || 'custom-noise';
    const scale    = Number(scaleEl.value);
    const contrast = Number(contrastEl.value);
    const bright   = Number(brightEl.value);
    const palette  = parsePalette(paletteEl.value);

    if(preview){
      const f = 0.5;
      const rw = Math.round(w * f), rh = Math.round(h * f);
      // ケーブルは本数（scale）基準なので scale を変えない。ノイズ・格子は px サイズ基準なので scale を縮尺に合わせる。
      const pscale = (preset === 'cable-bundle') ? scale : Math.max(1, scale * f);
      patternTmp.width = rw; patternTmp.height = rh;
      paintPattern(patternTmp.getContext('2d'), rw, rh, preset, pscale, contrast, bright, palette);
      ctx.clearRect(0,0,w,h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(patternTmp, 0, 0, rw, rh, 0, 0, w, h);
    } else {
      paintPattern(ctx, w, h, preset, scale, contrast, bright, palette);
    }
  }

  // 合成（背景＋パターンの重ね・色覚・検出・エッジ）だけをやり直す。
  // withDetect=false のときは重い検出ビューの計算を省く（ドラッグ中に使う）。
  function composite(withDetect){
    const w = canvas.width, h = canvas.height;

    // Composite pattern with environment image for "Environment Check" tab
    cctx.clearRect(0,0,w,h);
    if(envImage && showOverlay.checked){
      // Draw environment image, then overlay camouflage pattern with alpha
      drawImageCover(cctx, envImage, 0,0,w,h);
      cctx.globalCompositeOperation = 'source-over';
      cctx.globalAlpha = Number(overlayAlpha.value);
      cctx.drawImage(canvas, 0,0,w,h);
      cctx.globalAlpha = 1;
    } else if(envImage){
      // Environment only (no pattern overlay)
      drawImageCover(cctx, envImage, 0,0,w,h);
    } else {
      // No environment image - show pattern only
      cctx.drawImage(canvas, 0,0,w,h);
    }

    // Draw environment-only canvas for comparison slider (left side)
    if(envOnlyCtx){
      envOnlyCtx.clearRect(0,0,w,h);
      if(envImage){
        drawImageCover(envOnlyCtx, envImage, 0,0,w,h);
      } else {
        envOnlyCtx.fillStyle = '#000';
        envOnlyCtx.fillRect(0,0,w,h);
      }

      // Apply color vision filter to environment-only canvas
      if(colorVisionMode !== 'normal'){
        const imgData = envOnlyCtx.getImageData(0, 0, w, h);
        applyColorVisionFilter(imgData, colorVisionMode);
        envOnlyCtx.putImageData(imgData, 0, 0);
      }
    }

    // Apply color vision filter to composite canvas (right side of comparison)。1回だけかける
    if(colorVisionMode !== 'normal'){
      const imgData = cctx.getImageData(0, 0, w, h);
      applyColorVisionFilter(imgData, colorVisionMode);
      cctx.putImageData(imgData, 0, 0);
    }

    // 馴染み度の評価と検出ビュー（環境画像があるときだけ）。選んだ色覚の見え方で測る
    // （背景と合成はここまでで変換済み。パターンは updateBlendReadout で同じ変換をかける）。
    // 検出ビューのヒートマップは変換のあとに重ねるので、色覚にかかわらず同じ配色で読める
    if(envImage && envOnlyCtx){
      updateBlendReadout(w, h);
      if(detectViewEnabled && withDetect){
        drawDetectView(w, h);
      }
    } else {
      clearBlendReadout();
    }

    // Apply edge detection filter if enabled (applied AFTER color vision simulation)
    if(edgeDetectionEnabled){
      if(envOnlyCtx){
        const envImgData = envOnlyCtx.getImageData(0, 0, w, h);
        applyEdgeDetection(envImgData, w, h);
        envOnlyCtx.putImageData(envImgData, 0, 0);
      }

      const compImgData = cctx.getImageData(0, 0, w, h);
      applyEdgeDetection(compImgData, w, h);
      cctx.putImageData(compImgData, 0, 0);
    }
  }

  // パターンの生成＋合成＋プリセット採点をまとめて行う（パターンが変わったとき）。
  // 合成・プリセット採点は環境タブでしか見えないので、そのタブのときだけ行う（生成タブを軽くする）。
  function draw(){
    renderPattern();
    const envTab = document.getElementById('tab-environment');
    if(envTab && envTab.classList.contains('active')){
      composite(true);
      updatePresetCompare();
    }
  }

  // ===== 描画のスケジュール（スライダーのドラッグをフレームごとにまとめる） =====
  let rafPending = false;
  let rafTask = null;
  function schedule(task){
    rafTask = task;
    if(rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const t = rafTask; rafTask = null;
      if(t) t();
    });
  }

  // 重ね合わせ透明度・パターンを重ねるの変更は合成だけ更新する（パターンは再生成しない）。
  // ドラッグ中は重い検出ビューを省き、止まったら更新する。
  let detectSettleTimer = null;
  function recomposite(){
    schedule(() => composite(false));
    if(detectViewEnabled && envImage){
      clearTimeout(detectSettleTimer);
      detectSettleTimer = setTimeout(() => composite(true), 160);
    }
  }

  // パターンの設定スライダー用。ドラッグ中は縮小解像度でプレビューし、止まったら原寸で描く。
  let patternSettleTimer = null;
  function recomputePattern(preview){
    renderPattern(preview);
    const envTab = document.getElementById('tab-environment');
    if(envTab && envTab.classList.contains('active')){
      composite(!preview);          // プレビュー中は重い検出ビューを省く
      if(!preview) updatePresetCompare();
    }
  }
  function schedulePattern(){
    schedule(() => recomputePattern(true));
    clearTimeout(patternSettleTimer);
    patternSettleTimer = setTimeout(() => recomputePattern(false), 180);
  }

  // ===== 馴染み度の評価と検出ビュー（第2弾） =====
  let detectViewEnabled = false;
  let lastDetectScore = null;

  const T = (k) => (window.I18N ? window.I18N.t(k) : k);
  const curLang = () => (window.I18N ? window.I18N.lang : 'ja');

  // パターン（patternCanvas）と背景（envOnlyCanvas）の色・明るさ・コントラストのずれから馴染み度を出す。
  // envOnlyCanvas は色覚の変換済みなので、パターンにも同じ変換をかけてからそろえて比べる
  function updateBlendReadout(w, h){
    const panel = document.getElementById('blendPanel');
    if(!panel) return;
    const patternData = cvdCopy(ctx.getImageData(0, 0, w, h).data);
    const envData = envOnlyCtx.getImageData(0, 0, w, h).data;
    // 全画素は重いので間引く
    const step = 7;
    const r = BlendScore.evaluate(patternData, envData, step);
    panel.hidden = false;
    setBar('blendColor', r.colorMatch);
    setBar('blendLum', r.lumMatch);
    setBar('blendContrast', r.contrastMatch);
    const total = document.getElementById('blendTotal');
    const grade = document.getElementById('blendGrade');
    if(total) total.textContent = String(r.blend);
    if(grade){
      grade.textContent = T('grade.' + BlendScore.grade(r.blend));
    }
  }

  function setBar(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const bar = el.querySelector('.blend-bar-fill');
    const num = el.querySelector('.blend-bar-num');
    if(bar) bar.style.width = value + '%';
    if(num) num.textContent = value;
  }

  function clearBlendReadout(){
    const panel = document.getElementById('blendPanel');
    if(panel) panel.hidden = true;
  }

  // 合成画像のどこが目立つかをヒートマップで重ねる。
  // 総合（色＋輪郭）は第2弾のDetectMap、個別の手がかり（輪郭・光沢・直線・色の外れ）は第4弾のDetectCues。
  let detectCue = 'combined';
  // 手がかりの短い名前は I18N の cueShort.* を使う

  // 検出ビューは縮小解像度で計算する（原寸1280×720だと重い）。
  // 320×180でDetectMap/DetectCuesを出し、ヒートマップを拡大して重ねる。半径は縮尺に合わせる。
  const DETECT_W = 320, DETECT_H = 180;
  const detectTmp = document.createElement('canvas');
  detectTmp.width = DETECT_W; detectTmp.height = DETECT_H;

  function downscaledData(srcCanvas, dw, dh){
    const t = document.createElement('canvas');
    t.width = dw; t.height = dh;
    const tc = t.getContext('2d');
    tc.drawImage(srcCanvas, 0, 0, dw, dh);
    return tc.getImageData(0, 0, dw, dh).data;
  }

  function drawDetectView(w, h){
    const dw = DETECT_W, dh = DETECT_H;
    // 合成と背景を縮小してから画素を取る（comp・envOnlyCanvas から）
    const compData = downscaledData(comp, dw, dh);
    const envData = downscaledData(envOnlyCanvas, dw, dh);

    // 半径は縮尺（dw/w ≈ 0.25）に合わせて小さくする
    const radius = Math.max(1, Math.round(8 * dw / w));
    const colorRadius = radius;
    const glossRadius = Math.max(1, Math.round(4 * dw / w));

    // 手がかりごとのスコアの内訳を出す（総合はDetectMap、個別はDetectCues）
    const map = DetectMap.build(compData, envData, dw, dh, { radius: radius });
    const combinedScore = DetectMap.detectScore(map.mean);
    const cues = DetectCues.build(compData, envData, dw, dh, {
      color: { radius: colorRadius }, gloss: { radius: glossRadius }
    });

    // 表示する手がかりのヒート配列を選ぶ
    let heat;
    if(detectCue === 'combined'){
      heat = map.heat;
      lastDetectScore = combinedScore;
    } else {
      heat = cues.cues[detectCue];
      lastDetectScore = cues.scores[detectCue];
    }

    // ヒートマップ（黒→赤→黄）を縮小解像度で作り、拡大して半透明で重ねる
    const out = detectTmp.getContext('2d').createImageData(dw, dh);
    for(let p=0;p<heat.length;p++){
      const v = heat[p] / 255;
      const i = p * 4;
      out.data[i]   = Math.min(255, v * 2 * 255);
      out.data[i+1] = Math.max(0, (v - 0.5) * 2) * 255;
      out.data[i+2] = 0;
      out.data[i+3] = Math.round(v * 200);
    }
    detectTmp.getContext('2d').putImageData(out, 0, 0);
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(detectTmp, 0, 0, dw, dh, 0, 0, w, h);

    const scoreEl = document.getElementById('detectScore');
    if(scoreEl) scoreEl.textContent = String(lastDetectScore);
    updateDetectBreakdown(combinedScore, cues.scores);
  }

  // 手がかりごとのスコアを一覧で見せる（いま見ている手がかりを強調）
  function updateDetectBreakdown(combinedScore, scores){
    const el = document.getElementById('detectBreakdown');
    if(!el) return;
    el.textContent = '';
    const rows = [
      ['combined', combinedScore],
      ['edge', scores.edge],
      ['gloss', scores.gloss],
      ['line', scores.line],
      ['color', scores.color]
    ];
    for(const [key, val] of rows){
      const row = document.createElement('div');
      row.className = 'detect-cue-row' + (key === detectCue ? ' current' : '');
      const name = document.createElement('span');
      name.className = 'detect-cue-name';
      name.textContent = T('cueShort.' + key);
      const track = document.createElement('span');
      track.className = 'detect-cue-track';
      const fill = document.createElement('span');
      fill.className = 'detect-cue-fill';
      fill.style.width = Math.min(100, val) + '%';
      track.appendChild(fill);
      const num = document.createElement('span');
      num.className = 'detect-cue-num';
      num.textContent = val;
      row.appendChild(name); row.appendChild(track); row.appendChild(num);
      el.appendChild(row);
    }
  }

  // ===== 環境プリセット比較 =====
  // 作り付けの背景（森の小道・雪・土・草・サーバールーム・ケーブル群）にパターンを当てて、
  // 同じ迷彩がどの環境でどれだけ馴染むかを並べる。「万能の迷彩は無い」ことを数字で見せる。
  // 各環境に「写真」（EnvPhoto）と「生成」（EnvPreset）の2種類がある。切り替えると、同じ環境の
  // もう一方を読み込み、比較表には両方の馴染み度を並べる（作った背景と本物の背景のずれを見せる）。
  const presetListEl = document.getElementById('presetList');
  const presetCompareEl = document.getElementById('presetCompare');
  const presetModeBtns = document.querySelectorAll('.preset-mode-btn');
  // 起動時は「写真・森の小道」。プリセットを選んだあとでも、ボタンで戻せる
  let presetMode = 'photo';
  let activeEnv = { kind: 'photo', id: 'forest' }; // アップロードした画像のときは null
  let envLoadSeq = 0; // 写真の読み込み中に別の背景を選んだら、遅れて届いた写真で上書きしない

  const GRADE_CLASS = { high: 'g-high', medium: 'g-medium', low: 'g-low', poor: 'g-poor' };
  const SCORE_W = 160, SCORE_H = 90; // 比較表の採点に使う大きさ

  // 写真のサムネイル（320×180）を採点用の 160×90 に縮めた画素。届いたものから比較表に出す
  const photoPixels = {};
  function loadPhotoThumbs(){
    if(typeof EnvPhoto === 'undefined') return;
    for(const p of EnvPhoto.list()){
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = SCORE_W; c.height = SCORE_H;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, SCORE_W, SCORE_H);
        photoPixels[p.id] = cx.getImageData(0, 0, SCORE_W, SCORE_H).data;
        const envTab = document.getElementById('tab-environment');
        if(envTab && envTab.classList.contains('active')) updatePresetCompare();
      };
      img.src = './' + p.thumb;
    }
  }

  function envName(id){
    const p = EnvPreset.list().find((x) => x.id === id);
    return p ? (curLang() === 'en' ? p.nameEn : p.nameJa) : id;
  }

  // ボタンの説明（ツールチップ）: 写真は出典とライセンス、生成は描き方の説明
  function presetTitle(kind, id){
    if(kind === 'photo'){
      const c = EnvPhoto.find(id).credit;
      // 作者撮影の写真は題名を環境名で出す（英語表示に日本語を残さない）
      const title = c.license ? c.title : envName(id);
      const lic = c.license ? c.license.name : T('env.ownPhoto');
      return curLang() === 'en' ? `${title} — ${c.site || c.author} (${lic})` : `${title} — ${c.site || c.author}（${lic}）`;
    }
    const p = EnvPreset.list().find((x) => x.id === id);
    return curLang() === 'en' ? p.nameEn : p.descJa;
  }

  function buildPresetButtons(){
    if(!presetListEl || typeof EnvPreset === 'undefined' || typeof EnvPhoto === 'undefined') return;
    presetListEl.textContent = '';
    for(const p of EnvPreset.list()){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.preset = p.id;
      btn.title = presetTitle(presetMode, p.id);
      if(presetMode === 'photo'){
        const img = document.createElement('img');
        img.className = 'preset-thumb';
        img.src = './' + EnvPhoto.find(p.id).thumb;
        img.alt = '';
        btn.appendChild(img);
      } else {
        const c = document.createElement('canvas');
        c.className = 'preset-thumb';
        c.width = SCORE_W; c.height = SCORE_H;
        c.getContext('2d').putImageData(new ImageData(EnvPreset.render(p.id, SCORE_W, SCORE_H), SCORE_W, SCORE_H), 0, 0);
        btn.appendChild(c);
      }
      const label = document.createElement('span');
      label.className = 'preset-label';
      label.textContent = envName(p.id);
      btn.appendChild(label);
      btn.addEventListener('click', () => selectEnv(presetMode, p.id));
      presetListEl.appendChild(btn);
    }
    highlightActivePreset();
  }

  function setPresetMode(mode){
    presetMode = mode;
    for(const b of presetModeBtns){
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    buildPresetButtons();
  }

  // 背景を読み込む。写真は画像として、生成は canvas として envImage に置く
  function selectEnv(kind, id){
    activeEnv = { kind, id };
    highlightActivePreset();
    if(kind === 'photo'){
      loadEnvironmentImage('./' + EnvPhoto.find(id).src, false);
      return;
    }
    const w = 1280, h = 720;
    const buf = EnvPreset.render(id, w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
    envLoadSeq++;
    envImage = c; // drawImageCover は canvas も扱える（naturalWidth が無ければ width を使う）
    const extractBtn = document.getElementById('extractPalette');
    if(extractBtn) extractBtn.disabled = false;
    draw();
  }

  function highlightActivePreset(){
    if(!presetListEl) return;
    for(const b of presetListEl.querySelectorAll('.preset-btn')){
      const on = !!activeEnv && activeEnv.kind === presetMode && b.dataset.preset === activeEnv.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // 1本のバー（名前の横に「写真」「生成」の2本を並べる）
  function compareBar(kind, r){
    const line = document.createElement('span');
    line.className = 'preset-bar preset-bar-' + kind + (kind === presetMode ? ' is-mode' : '');
    const tag = document.createElement('span');
    tag.className = 'preset-bar-tag';
    tag.textContent = T(kind === 'photo' ? 'env.modePhoto' : 'env.modeGen');
    const track = document.createElement('span');
    track.className = 'preset-row-track';
    const fill = document.createElement('span');
    fill.className = 'preset-row-fill ' + (r ? (GRADE_CLASS[r.grade] || '') : '');
    fill.style.width = (r ? r.blend : 0) + '%';
    track.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'preset-row-num';
    num.textContent = r ? String(r.blend) : '…';
    line.appendChild(tag); line.appendChild(track); line.appendChild(num);
    return line;
  }

  // 現在のパターンを、各環境の写真と生成の両方に当てて採点する。
  // 並びは、いま選んでいる種類（写真／生成）の馴染み度の高い順。採点は選んだ色覚の見え方で行う
  function updatePresetCompare(){
    if(!presetCompareEl || typeof EnvPreset === 'undefined' || typeof EnvPhoto === 'undefined') return;
    // パターンを小さく描き直してから採点する（軽く・速く）
    const tmp = document.createElement('canvas');
    tmp.width = SCORE_W; tmp.height = SCORE_H;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(canvas, 0, 0, SCORE_W, SCORE_H);
    const px = cvdCopy(tctx.getImageData(0, 0, SCORE_W, SCORE_H).data);
    const transform = colorVisionMode === 'normal' ? null : (a) => ColorVision.apply(a, colorVisionMode);
    const genRows = EnvPreset.rankPattern(px, SCORE_W, SCORE_H, 2, transform);
    const photoEnvs = EnvPreset.list().filter((p) => photoPixels[p.id]).map((p) => ({
      id: p.id, nameJa: p.nameJa, nameEn: p.nameEn, pixels: cvdCopy(photoPixels[p.id])
    }));
    const photoRows = EnvPreset.rankAgainst(px, photoEnvs, 2);
    const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
    const gen = byId(genRows), photo = byId(photoRows);
    const order = EnvPreset.list().map((p) => p.id);
    const score = (id) => {
      const r = presetMode === 'photo' ? photo[id] : gen[id];
      return r ? r.blend : -1;
    };
    order.sort((a, b) => score(b) - score(a));

    presetCompareEl.textContent = '';
    const title = document.createElement('p');
    title.className = 'preset-compare-title';
    title.textContent = T('presetCompareTitle');
    presetCompareEl.appendChild(title);
    order.forEach((id, idx) => {
      const row = document.createElement('div');
      const cur = activeEnv && activeEnv.id === id;
      row.className = 'preset-row' + (idx === 0 ? ' best' : '') + (cur ? ' current' : '');
      const name = document.createElement('span');
      name.className = 'preset-row-name';
      name.textContent = envName(id);
      const bars = document.createElement('span');
      bars.className = 'preset-row-bars';
      bars.appendChild(compareBar('photo', photo[id]));
      bars.appendChild(compareBar('gen', gen[id]));
      row.appendChild(name); row.appendChild(bars);
      presetCompareEl.appendChild(row);
    });
  }

  // ===== Pattern generators =====
  function drawBlackMatte(ctx,w,h,scale,contrast,bright,palette){
    // 微細ノイズ＋わずかなビネットで"艶消し漆黒"の質感を再現（視覚デモ用）
    // グローバルシードを使用（再生成ボタンでのみ変化）
    const randomOffsetX = patternSeed;
    const randomOffsetY = patternSeed + 100;

    // パレットの最初の色を基準色として使用（デフォルトは黒）
    const baseColor = palette.length > 0 ? palette[0] : '#000000';
    const baseRgb = hexToRgb(baseColor);

    const img = ctx.createImageData(w,h);
    const data = img.data;

    // 明るさパラメータでベース明度を調整（-1〜+1 → 0.8〜1.2倍）
    const brightnessFactor = 1.0 + (bright * 0.2);

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const nx = (x + randomOffsetX)/scale, ny = (y + randomOffsetY)/scale;
        let n = 0, amp=1, freq=1;
        for(let o=0;o<5;o++){
          n += (Perlin.noise2(nx*freq, ny*freq) + 1)/2 * amp;
          amp *= 0.5; freq *= 2;
        }
        n = Math.pow(n, 1.3); // 暗部を残す

        // ビネット効果
        const dx = (x-w/2)/(w/2), dy = (y-h/2)/(h/2);
        const vig = 1 - Math.sqrt(dx*dx + dy*dy) * 0.6;

        // ノイズとビネット、コントラストを適用
        const factor = clamp((n * 0.4 + 0.8) * vig * contrast * brightnessFactor, 0, 2);

        const i = (y*w + x)*4;
        data[i]   = clamp(Math.round(baseRgb.r * factor), 0, 255);
        data[i+1] = clamp(Math.round(baseRgb.g * factor), 0, 255);
        data[i+2] = clamp(Math.round(baseRgb.b * factor), 0, 255);
        data[i+3] = 255;
      }
    }
    ctx.putImageData(img,0,0);

    // 極小の擦り傷・テクスチャ
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,0.01)';
    for(let i=0;i<500;i++){
      const rx = Math.random()*w, ry = Math.random()*h;
      ctx.fillRect(rx, ry, Math.random()*1.5, Math.random()*0.2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 1本のケーブルの輪郭（中心線 points を左右に width/2 ふくらませた帯）をパスにする。
  function cablePath(ctx, points, width){
    const half = width / 2;
    ctx.beginPath();
    // 左側を上から下へ
    ctx.moveTo(points[0].x - half, points[0].y);
    for(let k=1;k<points.length;k++){
      const prev = points[k-1], cur = points[k];
      const mx = (prev.x + cur.x)/2, my = (prev.y + cur.y)/2;
      ctx.quadraticCurveTo(prev.x - half, prev.y, mx - half, my);
    }
    ctx.lineTo(points[points.length-1].x - half, points[points.length-1].y);
    // 右側を下から上へ
    ctx.lineTo(points[points.length-1].x + half, points[points.length-1].y);
    for(let k=points.length-1;k>0;k--){
      const prev = points[k], cur = points[k-1];
      const mx = (prev.x + cur.x)/2, my = (prev.y + cur.y)/2;
      ctx.quadraticCurveTo(prev.x + half, prev.y, mx + half, my);
    }
    ctx.closePath();
  }

  function drawCableBundle(ctx,w,h,scale,contrast,bright,palette){
    // 束ねられたケーブルを、太さ・色・光沢・蛇行・重なり・結束バンドで描く。
    // 配置の計画は js/cable-plan.js（CableBundle）が作る。シードで決まるので再現できる。
    const plan = CableBundle.build({
      width: w, height: h, seed: patternSeed,
      scale: scale, contrast: contrast, bright: bright, palette: palette
    });

    ctx.fillStyle = plan.background;
    ctx.fillRect(0,0,w,h);

    // 各ケーブル（奥から手前へ）
    plan.cables.forEach(cable => {
      // 本体（左→右の明暗で丸みを出す）
      cablePath(ctx, cable.points, cable.width);
      const cx = cable.x;
      const grad = ctx.createLinearGradient(cx - cable.width/2, 0, cx + cable.width/2, 0);
      grad.addColorStop(0, cable.shadow);
      grad.addColorStop(0.5, cable.color);
      grad.addColorStop(1, cable.shadow);
      ctx.fillStyle = grad;
      ctx.fill();

      // 光沢（中心より少し左の細い明るい帯）。ケーブルを見分ける最大の手がかり
      ctx.save();
      ctx.clip(); // 本体のパスの内側にだけ描く
      ctx.globalAlpha = clamp(0.5 + contrast * 0.2, 0.2, 0.95);
      cablePath(ctx, cable.points.map(p => ({ x: p.x + cable.highlightOffset, y: p.y })), cable.highlightWidth);
      ctx.fillStyle = cable.highlight;
      ctx.fill();
      ctx.restore();
    });

    // 結束バンド（横帯）。ケーブルをまたいで束ねているように見せる
    plan.ties.forEach(tie => {
      ctx.fillStyle = tie.color;
      roundRect(ctx, -4, tie.y, w + 8, tie.height, Math.min(6, tie.height/2), true, false);
      // 上端の細いハイライトで帯の立体感を出す
      ctx.fillStyle = shade(tie.color, 45);
      ctx.fillRect(-4, tie.y, w + 8, Math.max(1, tie.height * 0.14));
      // 留め具（結束バンドのヘッド）
      ctx.fillStyle = shade(tie.color, 28);
      roundRect(ctx, tie.buckleX, tie.y - tie.height*0.12, tie.height*1.1, tie.height*1.24, 3, true, false);
    });

    // 微細ノイズ（明るさに応じて調整）
    ctx.globalCompositeOperation = 'overlay';
    const noiseAlpha = clamp(0.1 - bright * 0.04, 0.02, 0.2);
    ctx.fillStyle = `rgba(0,0,0,${noiseAlpha})`;
    ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHwPanel(ctx,w,h,scale,contrast,bright,palette){
    // 機器パネル風：グリッド、通気スリット、ネジ
    // グローバルシードを使用（再生成ボタンでのみ変化）
    const randomOffsetX = patternSeed;
    const randomOffsetY = patternSeed + 100;

    // 明るさパラメーターを背景色に反映
    const baseBrightness = clamp(15 + Math.round(bright * 20), 0, 50);
    const bgColor = `rgb(${baseBrightness},${baseBrightness},${baseBrightness})`;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,w,h);

    // スケールパラメーターでグリッドの密度を調整（8-300 → 4-15 cols, 2-9 rows）
    const cols = Math.max(4, Math.min(15, Math.floor(20 - scale / 20)));
    const rows = Math.max(2, Math.min(9, Math.floor(12 - scale / 40)));
    const padX = 60, padY = 60;
    const cellW = (w - padX*2) / cols;
    const cellH = (h - padY*2) / rows;

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = padX + c*cellW;
        const y = padY + r*cellH;
        const jitter = Perlin.noise2((c+randomOffsetX)*0.8, (r+randomOffsetY)*0.8) * 8;
        const cw = cellW - 10 + jitter;
        const ch = cellH - 10 + jitter;

        // 面（パレットの最初の色を使用、なければデフォルト）
        const panelColor = palette[0] || '#101010';
        ctx.fillStyle = panelColor;
        roundRect(ctx, x+5, y+5, cw, ch, 6, true, false);

        // 通気スリット
        const ventCols = 6;
        ctx.fillStyle = `rgba(0,0,0,${0.45+0.1*contrast})`;
        for(let v=0; v<ventCols; v++){
          const vx = x + 8 + v*(cw/ventCols) + Perlin.noise2(v+randomOffsetX,c+randomOffsetY)*4;
          ctx.fillRect(vx, y + ch/2 - 3, cw/ventCols - 6, 6);
        }

        // ネジ（パレットの2番目の色を使用、なければデフォルト）
        const screwColor = palette[1] || '#0b0b0b';
        ctx.fillStyle = screwColor;
        ctx.beginPath(); ctx.arc(x+12, y+12, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+cw-8, y+ch-8, 4, 0, Math.PI*2); ctx.fill();
      }
    }

    // 細かい擦り傷（コントラストに応じて量を調整）
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,0.01)';
    const scratchCount = Math.round(600 * contrast);
    const srand = CableBundle.rng(Math.floor(patternSeed*1000)+7);
    for(let i=0;i<scratchCount;i++){
      const rx = srand()*w, ry = srand()*h;
      ctx.fillRect(rx, ry, srand()*1.5, srand()*0.2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCustomNoise(ctx,w,h,scale,contrast,bright,palette){
    // Perlinベースの多階調ノイズをパレット量子化
    // グローバルシードを使用（再生成ボタンでのみ変化）
    const randomOffsetX = patternSeed;
    const randomOffsetY = patternSeed + 100;

    const img = ctx.createImageData(w,h);
    const data = img.data;
    const nColors = Math.max(1, palette.length);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const nx = (x + randomOffsetX)/scale, ny = (y + randomOffsetY)/scale;
        let n = 0, amp = 1, freq = 1;
        for(let o=0;o<4;o++){
          n += (Perlin.noise2(nx*freq, ny*freq) + 1)/2 * amp;
          amp *= 0.5; freq *= 2;
        }
        // コントラスト調整（シグモイド風）
        const k = clamp(contrast, 0.2, 2.5);
        n = clamp( (n-0.5)*k + 0.5, 0, 1 );

        const idx = Math.floor(n * (nColors - 1));
        const col = hexToRgb(palette[idx] || '#111111');
        const i = (y*w + x)*4;
        data[i]   = col.r;
        data[i+1] = col.g;
        data[i+2] = col.b;
        data[i+3] = 255;
      }
    }
    ctx.putImageData(img,0,0);

    // 明るさパラメータを全体的なオーバーレイとして適用（パレット色の比率は保持）
    if(bright !== 0){
      const overlayAlpha = Math.abs(bright) * 0.3; // 0〜0.3の範囲
      if(bright > 0){
        // 明るくする（白のオーバーレイ）
        ctx.fillStyle = `rgba(255, 255, 255, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        // 暗くする（黒のオーバーレイ）
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  function drawDigitalCamo(ctx,w,h,scale,contrast,bright,palette){
    // デジタル迷彩（MARPAT風）：ピクセル化された矩形パターン
    // グローバルシードを使用（再生成ボタンでのみ変化）
    const randomSeed = patternSeed;

    // パレットが空の場合はデフォルト色を使用
    const colors = palette.length > 0 ? palette : ['#2d3d1f', '#4a5a3c', '#5a6c3a', '#3d4a2c'];
    const nColors = colors.length;

    // スケールパラメーターで基本ピクセルサイズを調整（8-300 → 5-100px）
    const basePixelSize = Math.max(5, Math.min(100, Math.floor(scale / 3)));

    // マルチスケールピクセル生成（大・中・小の3レイヤー）- 密度を上げて隙間を埋める
    const layers = [
      { size: basePixelSize * 2.0, density: 0.6 },  // 大ピクセル（60%密度）
      { size: basePixelSize, density: 0.8 },         // 中ピクセル（80%密度）
      { size: basePixelSize * 0.5, density: 1.0 }   // 小ピクセル（100%密度）
    ];

    // コントラストでパレット色の明暗差を調整（色の相対関係は保つ）
    const adjustedColors = colors.map(color => {
      if(contrast === 1.0) return color;

      // RGB値を取得
      const rgb = hexToRgb(color);

      // 明度を計算（perceived luminance）
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

      // コントラスト調整：明度を基準に調整
      // contrast > 1.0: 暗い色はより暗く、明るい色はより明るく
      // contrast < 1.0: すべての色を中間に近づける
      const adjustedLum = 0.5 + (luminance - 0.5) * contrast;
      const factor = adjustedLum / (luminance || 0.001); // 0除算回避

      const newR = clamp(Math.round(rgb.r * factor), 0, 255);
      const newG = clamp(Math.round(rgb.g * factor), 0, 255);
      const newB = clamp(Math.round(rgb.b * factor), 0, 255);

      return rgbToHex(newR, newG, newB);
    });

    // 背景を調整後の最初の色（通常は最も暗い色）で塗りつぶし、隙間をなくす
    ctx.fillStyle = adjustedColors[0];
    ctx.fillRect(0,0,w,h);

    layers.forEach((layer, layerIdx) => {
      const pixelSize = Math.max(2, Math.floor(layer.size));
      const cols = Math.ceil(w / pixelSize) + 1;
      const rows = Math.ceil(h / pixelSize) + 1;

      for(let r=0; r<rows; r++){
        for(let c=0; c<cols; c++){
          // Perlinノイズを使って配置密度を制御（自然な分布）
          const nx = (c + randomSeed) * 0.1;
          const ny = (r + randomSeed) * 0.1;
          const noise = (Perlin.noise2(nx, ny) + 1) / 2;

          // レイヤーの密度に応じて描画するか判定
          if(noise > (1 - layer.density)){
            // Perlinノイズを使って位置オフセットを決定的に生成
            const offsetNoiseX = Perlin.noise2((c + randomSeed) * 0.3, (r + randomSeed) * 0.3);
            const offsetNoiseY = Perlin.noise2((c + randomSeed) * 0.3 + 100, (r + randomSeed) * 0.3 + 100);
            const x = c * pixelSize + offsetNoiseX * pixelSize * 0.3;
            const y = r * pixelSize + offsetNoiseY * pixelSize * 0.3;

            // Perlinノイズを使ってピクセルサイズのバリエーションを決定的に生成
            const sizeNoiseW = (Perlin.noise2((c + randomSeed) * 0.5, (r + randomSeed) * 0.5 + 200) + 1) / 2;
            const sizeNoiseH = (Perlin.noise2((c + randomSeed) * 0.5 + 300, (r + randomSeed) * 0.5 + 300) + 1) / 2;
            const pw = pixelSize * (0.8 + sizeNoiseW * 0.4);
            const ph = pixelSize * (0.8 + sizeNoiseH * 0.4);

            // Perlinノイズを使ってパレット色を決定的に選択
            const colorNoise = (Perlin.noise2((c + randomSeed) * 0.7 + 500, (r + randomSeed) * 0.7 + 500) + 1) / 2;
            const colorIdx = Math.floor(colorNoise * nColors) % nColors;
            const color = adjustedColors[colorIdx];  // コントラスト調整済みの色を使用

            ctx.fillStyle = color;
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(pw), Math.ceil(ph));
          }
        }
      }
    });

    // 明るさパラメータを全体的なオーバーレイとして適用（軍用スペック色の比率は保持）
    if(bright !== 0){
      const overlayAlpha = Math.abs(bright) * 0.3; // 0〜0.3の範囲
      if(bright > 0){
        // 明るくする（白のオーバーレイ）
        ctx.fillStyle = `rgba(255, 255, 255, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        // 暗くする（黒のオーバーレイ）
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // ===== Preset palette loader（分類名は辞書の presetGroup.*、英語の名前は label_en） =====
  (function setupPresetPaletteSelector(){
    // JSONロード
    fetch('data/presets.json')
      .then(res => {
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const categories = data.categories || {};

        // Store all presets by category
        Object.keys(categories).forEach(catKey => {
          allPresets[catKey] = {
            items: categories[catKey].map(p => ({
              value: (p.colors || []).join(','),
              label: p.label || p.id || '(unnamed)',
              labelEn: p.label_en || p.label || p.id || '(unnamed)'
            }))
          };
        });

        // Initialize palette options for default pattern type
        updatePaletteOptions();
      })
      .catch(err => {
        console.error('presets.json 読み込み失敗:', err);
        const errOpt = document.createElement('option');
        errOpt.disabled = true;
        errOpt.textContent = T('opt.presetLoadError');
        palettePresetEl.appendChild(errOpt);
      });

    // 選択されたら palette 入力欄へ反映して再描画
    palettePresetEl.addEventListener('change', (ev) => {
      const val = ev.target.value;
      if(val){
        paletteEl.value = val;
        updatePalettePreview();
        draw();
      }
    });
  })();

  // ===== Comparison slider =====
  const comparisonWrap = document.querySelector('.comparison-wrap');
  const comparisonSlider = document.querySelector('.comparison-slider');
  const sliderHandle = document.querySelector('.slider-handle');
  const enableComparisonCheckbox = document.getElementById('enableComparison');
  let isDragging = false;
  let sliderPosition = 50; // percentage

  function updateSliderPosition(percentage){
    sliderPosition = Math.max(0, Math.min(100, percentage));
    if(comparisonSlider){
      comparisonSlider.style.left = sliderPosition + '%';
    }
    if(comp){
      // スライダーはラッパー基準、clip-path はキャンバス基準なので、
      // パディングのぶんを補正しないと端で最大12pxずれる。
      const wrapRect = comparisonWrap.getBoundingClientRect();
      const compRect = comp.getBoundingClientRect();
      const xPx = wrapRect.width * sliderPosition / 100;
      const clipPct = Math.max(0, Math.min(100, (xPx - (compRect.left - wrapRect.left)) / compRect.width * 100));
      comp.style.clipPath = `inset(0 0 0 ${clipPct}%)`;
    }
    if(sliderHandle){
      sliderHandle.setAttribute('aria-valuenow', String(Math.round(sliderPosition)));
    }
  }

  if(sliderHandle && comparisonWrap){
    sliderHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if(!isDragging || !comparisonWrap) return;
      const rect = comparisonWrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      updateSliderPosition(percentage);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    sliderHandle.addEventListener('touchstart', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
      if(!isDragging || !comparisonWrap) return;
      const touch = e.touches[0];
      const rect = comparisonWrap.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      updateSliderPosition(percentage);
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });

    // キーボード（左右・上下の矢印で5%、Home/End で端へ）
    sliderHandle.addEventListener('keydown', (e) => {
      let next = sliderPosition;
      if(e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= 5;
      else if(e.key === 'ArrowRight' || e.key === 'ArrowUp') next += 5;
      else if(e.key === 'Home') next = 0;
      else if(e.key === 'End') next = 100;
      else return;
      e.preventDefault();
      updateSliderPosition(next);
    });
  }

  if(enableComparisonCheckbox && comparisonWrap){
    enableComparisonCheckbox.addEventListener('change', (e) => {
      if(e.target.checked){
        comparisonWrap.classList.add('active');
      } else {
        comparisonWrap.classList.remove('active');
      }
    });
    // Initialize
    if(enableComparisonCheckbox.checked){
      comparisonWrap.classList.add('active');
    }
  }

  // ===== Tab switching =====
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const exportCompositeBtn = document.getElementById('exportComposite');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Update active states
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');

      // Redraw when switching tabs
      draw();
    });
  });

  // Export composite button
  if(exportCompositeBtn){
    exportCompositeBtn.addEventListener('click', () => {
      const comp = document.getElementById('compositeCanvas');
      const url = comp.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'camoforge_composite.png';
      a.click();
    });
  }

  // ===== UI events =====
  regenBtn.addEventListener('click', () => {
    patternSeed = Math.random() * 10000;  // 新しいシードを生成
    draw();
  });

  randomizeBtn.addEventListener('click', randomizeAll);

  // Pattern type change updates available palette options
  patternTypeEl.addEventListener('change', () => {
    updatePaletteOptions();
    draw();
  });

  // パターンの設定（再生成が必要）。ドラッグ中はプレビュー、止まったら原寸（schedulePattern）
  [scaleEl, contrastEl, brightEl, paletteEl].forEach(el=>{
    el.addEventListener('input', () => {
      updateRangeValues();
      updatePalettePreview();
      schedulePattern();
    });
  });

  // 重ね合わせ透明度・パターンを重ねるは合成だけ更新する（再生成しない＝軽い）
  [overlayAlpha, showOverlay].forEach(el=>{
    el.addEventListener('input', () => {
      updateRangeValues();
      recomposite();
    });
  });

  exportBtn.addEventListener('click', () => {
    // 生成タブのプレビューはパターン単体なので、保存も patternCanvas にそろえる。
    // 背景と合成した画像は「環境チェック」タブの exportComposite で保存する。
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camoforge_pattern.png';
    a.click();
  });

  // ===== Load environment image from URL or file =====
  function loadEnvironmentImage(src, isFile = false){
    const img = new Image();
    const seq = ++envLoadSeq;
    img.onload = () => {
      // Revoke object URL after loading if it was a blob
      if(isFile) URL.revokeObjectURL(img.src);
      if(seq !== envLoadSeq) return;
      envImage = img;
      // アップロードした画像はプリセットではないので、ボタンの選択を外す
      if(isFile){ activeEnv = null; highlightActivePreset(); }
      const extractBtn = document.getElementById('extractPalette');
      if(extractBtn) extractBtn.disabled = false;
      draw();
    };
    img.onerror = () => {
      if(isFile){
        alert(T('alert.loadFailed'));
        URL.revokeObjectURL(img.src);
        envUpload.value = ''; // Reset input
      } else {
        console.warn('Default background image not found:', src);
      }
    };
    img.src = src;
  }

  envUpload.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if(!f) return;

    // Validate file type (images only)
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    if(!validTypes.includes(f.type)){
      alert(T('alert.imageOnly'));
      envUpload.value = ''; // Reset input
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if(f.size > maxSize){
      alert(T('alert.tooLarge'));
      envUpload.value = ''; // Reset input
      return;
    }

    loadEnvironmentImage(URL.createObjectURL(f), true);
  });

  // Color vision mode selector
  const colorVisionModeSelect = document.getElementById('colorVisionMode');
  if(colorVisionModeSelect){
    colorVisionModeSelect.addEventListener('change', (e) => {
      colorVisionMode = e.target.value;
      draw();
    });
  }

  // Edge detection toggle
  const enableEdgeDetectionCheckbox = document.getElementById('enableEdgeDetection');
  if(enableEdgeDetectionCheckbox){
    enableEdgeDetectionCheckbox.addEventListener('change', (e) => {
      edgeDetectionEnabled = e.target.checked;
      draw();
    });
  }

  // 検出ビュー（目立つ場所のヒートマップ）
  const enableDetectViewCheckbox = document.getElementById('enableDetectView');
  const detectCueControls = document.getElementById('detectCueControls');
  if(enableDetectViewCheckbox){
    enableDetectViewCheckbox.addEventListener('change', (e) => {
      detectViewEnabled = e.target.checked;
      if(detectCueControls) detectCueControls.hidden = !detectViewEnabled;
      if(!detectViewEnabled){
        const scoreEl = document.getElementById('detectScore');
        if(scoreEl) scoreEl.textContent = '';
        const bd = document.getElementById('detectBreakdown');
        if(bd) bd.textContent = '';
      }
      draw();
    });
  }

  // 検出ビューで見る手がかりの切り替え（総合・輪郭・光沢・直線・色の外れ）
  const detectCueSelect = document.getElementById('detectCue');
  if(detectCueSelect){
    detectCueSelect.addEventListener('change', (e) => {
      detectCue = e.target.value;
      draw();
    });
  }

  // 環境画像から色を抽出してパレットに入れる
  const extractPaletteBtn = document.getElementById('extractPalette');
  if(extractPaletteBtn){
    extractPaletteBtn.addEventListener('click', () => {
      if(!envImage) return;
      // 環境画像を作業用キャンバスに縮小して描き、画素から代表色を取る
      const tw = 160, th = Math.max(1, Math.round(160 * (envImage.naturalHeight || envImage.height) / (envImage.naturalWidth || envImage.width)));
      const tmp = document.createElement('canvas');
      tmp.width = tw; tmp.height = th;
      const tctx = tmp.getContext('2d');
      drawImageCover(tctx, envImage, 0, 0, tw, th);
      const data = tctx.getImageData(0, 0, tw, th).data;
      const colors = PaletteExtract.extract(data, 6, { step: 1 });
      if(colors.length){
        paletteEl.value = colors.join(', ');
        updatePalettePreview();
        draw();
      }
    });
  }

  // ===== Theme toggle =====
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.querySelector('.theme-icon');
  const root = document.documentElement;

  // The initial theme is set in <head> by js/theme-init.js (before first paint); here we only sync the icon
  themeIcon.textContent = root.classList.contains('light-mode') ? '🌙' : '☀️';

  if(themeToggle){
    themeToggle.addEventListener('click', () => {
      const isLight = root.classList.toggle('light-mode');
      themeIcon.textContent = isLight ? '🌙' : '☀️';
      try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch (e) { /* 使えない環境でも続行 */ }
    });
  }

  // ===== Initial draw and setup =====
  initColorPicker(); // Initialize color picker modal
  updateRangeValues();
  updatePalettePreview();
  buildPresetButtons();
  loadPhotoThumbs();
  // 「写真｜生成」の切り替え。プリセットを表示中なら、同じ環境のもう一方を読み込む
  for(const b of presetModeBtns){
    b.addEventListener('click', () => {
      if(b.dataset.mode === presetMode) return;
      setPresetMode(b.dataset.mode);
      if(activeEnv) selectEnv(presetMode, activeEnv.id);
      else updatePresetCompare();
    });
  }
  if(window.I18N){ window.I18N.onChange(() => { updatePaletteOptions(true); updatePalettePreview(); buildPresetButtons(); draw(); }); }
  draw();

  // Load default background image（写真・森の小道）
  selectEnv('photo', 'forest');
});
