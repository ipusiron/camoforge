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
    'black-matte': 'black-matte',
    'digital': 'digital-camo',
    'custom': 'custom-noise'
  };

  // Pattern type to recommended preset categories
  const PATTERN_PRESETS = {
    'military': ['military_camouflage'],
    'cable': ['cable_bundles'],
    'black-matte': ['black_matte'],  // 漆黒マット専用（単色の黒系のみ）
    'digital': ['digital_camouflage'],
    'custom': ['military_camouflage', 'cable_bundles', 'hardware_panels', 'office_backgrounds']
  };

  // ===== Helpers =====
  function parsePalette(text){
    return text.split(',').map(s => s.trim()).filter(Boolean).map(sanitizeColorInput);
  }

  function sanitizeColorInput(color){
    // Allow only hex colors (#RGB or #RRGGBB) and basic CSS color names
    const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    if(hexPattern.test(color)){
      return color;
    }
    // Fallback to black if invalid
    console.warn(`Invalid color input: ${color}, using #000000`);
    return '#000000';
  }

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
  /**
   * Apply color vision filter to simulate different types of color blindness
   * Uses matrix transformation to convert RGB values to simulate how people with
   * different color vision deficiencies perceive colors.
   *
   * @param {ImageData} imageData - Canvas ImageData object to apply filter to
   * @param {string} mode - Color vision mode: 'normal', 'protanopia', 'deuteranopia', 'tritanopia', 'monochrome'
   * @returns {ImageData} Modified ImageData with color vision simulation applied
   */
  function applyColorVisionFilter(imageData, mode){
    if(mode === 'normal') return imageData;

    const data = imageData.data;
    const len = data.length;

    // Iterate through each pixel (RGBA = 4 values per pixel)
    for(let i = 0; i < len; i += 4){
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      let nr, ng, nb;

      // Apply color transformation matrix based on color vision type
      switch(mode){
        case 'protanopia': // Red-blind (1型色覚) - Cannot distinguish red
          nr = 0.567 * r + 0.433 * g;
          ng = 0.558 * r + 0.442 * g;
          nb = 0.242 * g + 0.758 * b;
          break;
        case 'deuteranopia': // Green-blind (2型色覚) - Cannot distinguish green
          nr = 0.625 * r + 0.375 * g;
          ng = 0.7 * r + 0.3 * g;
          nb = 0.3 * g + 0.7 * b;
          break;
        case 'tritanopia': // Blue-blind (3型色覚) - Cannot distinguish blue
          nr = 0.95 * r + 0.05 * g;
          ng = 0.433 * g + 0.567 * b;
          nb = 0.475 * g + 0.525 * b;
          break;
        case 'monochrome': // Total color blindness - Grayscale only
          // Standard luminance formula (ITU-R BT.601)
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          nr = ng = nb = gray;
          break;
        default:
          nr = r; ng = g; nb = b;
      }

      // Write transformed RGB values back to image data
      data[i] = Math.round(nr);
      data[i + 1] = Math.round(ng);
      data[i + 2] = Math.round(nb);
    }

    return imageData;
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

  function hexToRgb(hex){
    hex = hex.replace('#','');
    if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    return {
      r: parseInt(hex.substring(0,2),16),
      g: parseInt(hex.substring(2,4),16),
      b: parseInt(hex.substring(4,6),16)
    };
  }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function shade(hex, percent){
    const c = hexToRgb(hex);
    const p = percent/100;
    const r = Math.round(c.r*(1+p));
    const g = Math.round(c.g*(1+p));
    const b = Math.round(c.b*(1+p));
    return `rgb(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(b,0,255)})`;
  }
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
      swatch.title = `${color} をクリックして変更`;

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

  // HEX to RGB conversion
  function hexToRgb(hex){
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  // RGB to HEX conversion
  function rgbToHex(r, g, b){
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  // Update color preview and sliders
  function updateColorPickerUI(hexColor){
    const modal = document.getElementById('colorPickerModal');
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
  function updatePaletteOptions(){
    const patternType = patternTypeEl.value;
    const categories = PATTERN_PRESETS[patternType] || [];

    // Clear current options except the first "カスタム入力"
    palettePresetEl.innerHTML = '<option value="">--- カスタム入力 ---</option>';

    // Add relevant category presets
    categories.forEach(catKey => {
      if(allPresets[catKey]){
        const group = document.createElement('optgroup');
        group.label = allPresets[catKey].label;
        allPresets[catKey].items.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          group.appendChild(opt);
        });
        palettePresetEl.appendChild(group);
      }
    });
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
  function draw(){
    // Set canvas dimensions (16:9 aspect ratio)
    const w = canvas.width  = 1280;
    const h = canvas.height = 720;
    comp.width = w; comp.height = h;
    if(envOnlyCanvas) {
      envOnlyCanvas.width = w;
      envOnlyCanvas.height = h;
    }

    // Clear pattern canvas
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,w,h);

    // Get current parameters from UI
    const patternType = patternTypeEl.value;
    const preset   = PATTERN_TYPE_MAP[patternType] || 'custom-noise';
    const scale    = Number(scaleEl.value);
    const contrast = Number(contrastEl.value);
    const bright   = Number(brightEl.value);
    const palette  = parsePalette(paletteEl.value);

    // Draw camouflage pattern based on selected type
    if(preset === 'black-matte') {
      drawBlackMatte(ctx,w,h,scale,contrast,bright,palette);
    } else if(preset === 'cable-bundle') {
      drawCableBundle(ctx,w,h,scale,contrast,bright,palette);
    } else if(preset === 'hw-panel') {
      drawHwPanel(ctx,w,h,scale,contrast,bright,palette);
    } else if(preset === 'digital-camo') {
      drawDigitalCamo(ctx,w,h,scale,contrast,bright,palette);
    } else {
      drawCustomNoise(ctx,w,h,scale,contrast,bright,palette);
    }

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

    // Apply color vision filter to composite canvas (right side of comparison)
    if(colorVisionMode !== 'normal'){
      const imgData = cctx.getImageData(0, 0, w, h);
      applyColorVisionFilter(imgData, colorVisionMode);
      cctx.putImageData(imgData, 0, 0);
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

  function drawCableBundle(ctx,w,h,scale,contrast,bright,palette){
    // 束ねられたケーブルを思わせる縦ストライプ＋わずかな蛇行
    // グローバルシードを使用（再生成ボタンでのみ変化）
    const randomOffset = patternSeed;

    // 明るさパラメーターを背景色に反映
    const baseBrightness = clamp(11 + Math.round(bright * 15), 0, 40);
    const bgColor = `rgb(${baseBrightness},${baseBrightness},${baseBrightness})`;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,w,h);

    // スケールパラメーターでストライプ数を調整（8-300 → 8-25本）
    const stripes = Math.max(8, Math.min(25, Math.floor(scale / 12)));
    for(let i=0;i<stripes;i++){
      const baseX = (i/stripes)*w + Perlin.noise2((i+randomOffset)*0.3, (i+randomOffset)*0.1)*12;
      const width = Math.max(6, w/stripes*0.95 + Perlin.noise2(i+randomOffset,10+randomOffset)*20);
      const color = palette[i % palette.length] || (i%2?'#111':'#222');
      ctx.save();
      const angle = Perlin.noise2(i+randomOffset, (i+randomOffset)*0.5) * 0.08;
      ctx.translate(baseX, 0);
      ctx.rotate(angle);
      const grad = ctx.createLinearGradient(0,0,width,0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, shade(color, -8*contrast));
      grad.addColorStop(1, shade(color, -16*contrast));
      ctx.fillStyle = grad;
      ctx.fillRect(-10, -30, width + 20, h + 60);
      ctx.restore();
    }
    // 微細ノイズ（明るさに応じて調整）
    ctx.globalCompositeOperation = 'overlay';
    const noiseAlpha = clamp(0.12 - bright * 0.05, 0.02, 0.25);
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
    for(let i=0;i<scratchCount;i++){
      const rx = Math.random()*w, ry = Math.random()*h;
      ctx.fillRect(rx, ry, Math.random()*1.5, Math.random()*0.2);
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

  // ===== Preset palette loader (Japanese category labels) =====
  (function setupPresetPaletteSelector(){
    const JP_LABELS = {
      cable_bundles: 'ケーブル群',
      hardware_panels: 'ハードウェア・パネル',
      office_backgrounds: 'オフィス背景',
      military_camouflage: '軍用迷彩',
      digital_camouflage: 'デジタル迷彩',
      black_matte: '漆黒マット'
    };

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
            label: JP_LABELS[catKey] || catKey,
            items: categories[catKey].map(p => ({
              value: (p.colors || []).join(','),
              label: p.label || p.id || '(unnamed)'
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
        errOpt.textContent = '（プリセット読み込み失敗）';
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
      comp.style.clipPath = `inset(0 0 0 ${sliderPosition}%)`;
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

  [scaleEl, contrastEl, brightEl, paletteEl, overlayAlpha, showOverlay].forEach(el=>{
    el.addEventListener('input', () => {
      updateRangeValues();
      updatePalettePreview();
      draw();
    });
  });

  // Palette input updates
  paletteEl.addEventListener('input', () => {
    updatePalettePreview();
    draw();
  });

  exportBtn.addEventListener('click', () => {
    const useCanvas = (envImage && showOverlay.checked) ? comp : canvas;
    const url = useCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camoforge_pattern.png';
    a.click();
  });

  // ===== Load environment image from URL or file =====
  function loadEnvironmentImage(src, isFile = false){
    const img = new Image();
    img.onload = () => {
      envImage = img;
      draw();
      // Revoke object URL after loading if it was a blob
      if(isFile){
        URL.revokeObjectURL(img.src);
      }
    };
    img.onerror = () => {
      if(isFile){
        alert('画像の読み込みに失敗しました');
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
      alert('画像ファイルのみアップロード可能です (JPEG, PNG, GIF, WebP, BMP)');
      envUpload.value = ''; // Reset input
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if(f.size > maxSize){
      alert('ファイルサイズが大きすぎます（最大10MB）');
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

  // ===== Theme toggle =====
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.querySelector('.theme-icon');
  const root = document.documentElement;

  // Check for saved theme or default to system preference
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  if(initialTheme === 'light'){
    root.classList.add('light-mode');
    themeIcon.textContent = '🌙';
  } else {
    themeIcon.textContent = '☀️';
  }

  if(themeToggle){
    themeToggle.addEventListener('click', () => {
      const isLight = root.classList.toggle('light-mode');
      themeIcon.textContent = isLight ? '🌙' : '☀️';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
  }

  // ===== Initial draw and setup =====
  initColorPicker(); // Initialize color picker modal
  updateRangeValues();
  updatePalettePreview();
  draw();

  // Load default background image
  loadEnvironmentImage('./assets/background.jpg', false);
});
