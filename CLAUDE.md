# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CamoForge** is a web-based camouflage pattern generator for educational and research purposes. It generates various camouflage patterns (Perlin noise, stripes, panels) and overlays them on environment images to visualize how they blend. This is a **defensive security education tool** - it helps users understand visual concealment concepts, not facilitate malicious hiding of devices.

**Tech Stack**: Pure HTML/CSS/JavaScript (no frameworks), Canvas API, client-side only (no backend)

**Demo**: https://ipusiron.github.io/camoforge/

## Key Architecture

### Core Pattern Generation (js/main.js)

Six pattern generators, all using Canvas 2D API. Each uses a global `patternSeed` so patterns only change when the "Regenerate" button is clicked. Pure, DOM-free helpers live in separate modules loaded before main.js:
- `js/color-utils.js` (`CamoColor`): hexToRgb (3-digit aware — the old duplicate turned #RGB black), rgbToHex, shade, sanitizeColorInput, parsePalette, mix, luminance. Tested with node.
- `js/cable-plan.js` (`CableBundle`): builds the cable-bundle layout (cables with width/color/highlight/shadow/meander points/depth, plus ties) deterministically from a seeded PRNG (mulberry32, not Perlin). `drawCableBundle` in main.js renders the plan. Tested with node.
- `js/perlin.js` (`Perlin`): noise for the other patterns (its table is seeded by Math.random at load, so it is not reproducible across loads).
- `js/blend-score.js` (`BlendScore`): blend score (0-100) from the pattern vs environment color/luminance/contrast stats. DOM-free, tested.
- `js/palette-extract.js` (`PaletteExtract`): k-means palette extraction from an image's pixels (deterministic init by luminance). DOM-free, tested.
- `js/detect-map.js` (`DetectMap`): a detectability heatmap from the composite's edges and its difference from the environment's local mean. DOM-free, tested.
- `js/env-presets.js` (`EnvPreset`): built-in environment backgrounds (snow/soil/grass/server-room/cable-bundle) generated as RGBA buffers (canvas-free, seeded), plus `rankPattern` which scores one pattern against every preset via BlendScore and sorts them. DOM-free, tested.
- `js/detect-cues.js` (`DetectCues`): breaks detectability into separate cues — edge (Sobel), gloss (local-above-mean bright spots), line (strong edges continuing straight), color (diff from the environment's local mean). Each cue is a normalized 0-255 map plus a 0-100 score. DOM-free, tested.

The Environment Check tab uses these: updateBlendReadout (BlendScore) shows the blend panel, drawDetectView (DetectMap) overlays the heatmap when 検出ビュー is on, and 環境画像から色を抽出 runs PaletteExtract on the uploaded image and fills the palette. 環境プリセット (EnvPreset) renders a preset into an offscreen canvas as the background (loadPreset) and updatePresetCompare ranks the current pattern against all presets on every draw (scored at a downscaled 160×90 for speed). drawDetectView uses DetectMap for the combined cue and DetectCues for the individual cues (edge/gloss/line/color) selected in #detectCue, and updateDetectBreakdown lists every cue's score.

1. **drawBlackMatte** (js/main.js:627-677)
   - Matte black texture using multi-octave Perlin noise with vignetting
   - Parameters used:
     - `scale`: Noise frequency (larger = coarser texture)
     - `bright`: Base brightness via brightnessFactor (affects overall darkness)
     - `contrast`: Intensity multiplier for noise amplitude
     - `palette`: First color used as base (defaults to black)
   - Uses `patternSeed` for deterministic offset

2. **drawCableBundle**
   - A cable bundle: several cables with varied width and color, drawn with meander, overlap (depth), a specular highlight and cable ties. The layout is `CableBundle.build(...)` (js/cable-plan.js); the body outline is a quadratic path from the centerline control points.
   - Parameters: `scale` → cable count (6-28), `contrast` → highlight and shadow strength, `bright` → background brightness, `palette` → cable colors (cycled, each tinted a little).

3. **drawHwPanel** (js/main.js:716-773)
   - Grid-based hardware panel with vent slits and screws
   - Parameters used:
     - `scale`: Grid density (8-300 input → 4-15 cols, 2-9 rows inversely)
     - `bright`: Background panel brightness
     - `contrast`: Scratch overlay intensity and count
     - `palette`: Panel color (index 0), screw color (index 1)
   - Uses `patternSeed` for cell jitter and vent positioning

4. **drawDigitalCamo** (js/main.js:822-919)
   - Digital camouflage (MARPAT-style) with pixelated rectangular patterns
   - Multi-scale approach: 3 layers (large/medium/small pixels) with varying density
   - Parameters used:
     - `scale`: Base pixel size (8-300 input → 5-100px base, up to 2x for large layer)
     - `bright`: Overall brightness via overlay (0-0.3 alpha white/black)
     - `contrast`: Adjusts palette color luminance spread
     - `palette`: All colors used with Perlin-based selection per pixel
   - Uses `patternSeed` for deterministic pixel placement and color selection
   - Key features:
     - Sharp edges (non-blurred rectangles)
     - Natural distribution using Perlin noise for placement
     - Variable pixel sizes within each layer

5. **drawCustomNoise** (js/main.js:775-820)
   - Perlin noise quantized to user-defined color palette
   - Parameters used:
     - `scale`: Noise frequency
     - `bright`: Overall brightness via overlay (0-0.3 alpha white/black)
     - `contrast`: Sigmoid-style contrast adjustment (0.2-2.5 range)
     - `palette`: All colors used for quantization levels
   - Uses `patternSeed` for deterministic noise offset

**Pattern Seed System**: All pattern functions use a global `patternSeed` (js/main.js:41) instead of `Math.random()` at call time. This ensures:
- Parameter changes produce consistent patterns (same seed = same pattern structure)
- Only clicking "Regenerate" button changes the pattern (updates seed at js/main.js:1079)
- Deterministic Perlin noise sampling with consistent offsets

### Image Processing Filters (js/main.js)

- **Color Vision Simulation** (js/main.js:109-156): Matrix transformation to simulate protanopia, deuteranopia, tritanopia, and monochrome vision
- **Edge Detection** (js/main.js:169-228): Sobel operator for highlighting contours where camouflage breaks

### Perlin Noise (js/perlin.js)

Lightweight 2D Perlin noise implementation. Uses deterministic shuffle seeded by `Math.random()` on load, so the noise function itself is consistent during a session.

### Preset System

- `data/presets.json` defines color palettes organized by category (50+ presets total):
  - `military_camouflage` - Woodland BDU, MARPAT, MultiCam, OCP, Flecktarn, JGSDF, etc.
  - `digital_camouflage` - MARPAT variants for digital camo pattern
  - `cable_bundles` - Dark/gray cable colors for server room environments
  - `hardware_panels` - Industrial panel colors, gunmetal, brushed steel
  - `office_backgrounds` - Wall/ceiling/desk colors, wood tones
  - `black_matte` - Pure black variants for matte texture
- Loaded via `fetch()` at js/main.js:933, dynamically populates dropdown
- Pattern type → preset category mapping defined in `PATTERN_PRESETS` (js/main.js:53-59)

### Canvas Flow

1. Main pattern drawn to `patternCanvas` (1280x720)
2. If environment image uploaded + overlay enabled → composite drawn to `compositeCanvas`
3. `envOnlyCanvas` holds environment-only image for comparison slider left side
4. Color vision filter and edge detection applied as post-processing
5. Export uses whichever canvas is appropriate for current view

## Development Commands

**Run locally**:
```bash
# Any static HTTP server, e.g.:
python -m http.server 8000
# OR
npx http-server
```
Then open `http://localhost:8000`

**No build step required** - all files are static

## Important Notes

### Security Context

This tool is for **education only**. It demonstrates:
- How camouflage patterns work (visual blending)
- Why artificial devices are still detectable (LEDs, heat, RF signals)
- The limitations of visual-only concealment

**Do NOT**: Enhance this tool to facilitate device concealment, credential harvesting, or surveillance evasion.

**DO**: Improve educational explanations, pattern algorithms, visualization quality, accessibility.

### Palette Presets Loading

The preset loader (js/main.js:921-972) expects `data/presets.json` at `./data/presets.json` (relative to HTML). If moving files, update the fetch path at js/main.js:933.

### Canvas Export

Export function (js/main.js:1105-1112) exports either:
- `patternCanvas` alone (pattern only)
- `compositeCanvas` (pattern + environment image overlay)

Uses `canvas.toDataURL('image/png')` - no server upload.

### When Adding New Pattern Generators

1. Use global `patternSeed` variable for all random offsets (not `Math.random()`)
2. Apply offsets to ALL Perlin noise calls
3. Add pattern type to `PATTERN_TYPE_MAP` (js/main.js:44-50)
4. Add preset category mapping to `PATTERN_PRESETS` (js/main.js:53-59)
5. Add drawing call in `draw()` function switch (js/main.js:558-568)
6. Use all parameters (`scale`, `bright`, `contrast`, `palette`) meaningfully
7. Test that regeneration (new seed) produces visually different results
