# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CamoForge** is a web-based camouflage pattern generator for educational and research purposes. It generates various camouflage patterns (Perlin noise, stripes, panels) and overlays them on environment images to visualize how they blend. This is a **defensive security education tool** - it helps users understand visual concealment concepts, not facilitate malicious hiding of devices.

**Tech Stack**: Pure HTML/CSS/JavaScript (no frameworks), Canvas API, client-side only (no backend)

**Demo**: https://ipusiron.github.io/camoforge/

## Key Architecture

### Core Pattern Generation (js/main.js)

Four pattern generators, all using Canvas 2D API. Each function uses **random offsets** to generate different patterns on each regeneration, even with identical parameters.

1. **drawBlackMatte** (js/main.js:453-490)
   - Matte black texture using multi-octave Perlin noise with vignetting
   - Parameters used:
     - `scale`: Noise frequency (larger = coarser texture)
     - `bright`: Base brightness (affects background darkness)
     - `contrast`: Intensity multiplier for noise amplitude
     - `palette`: Not used (always grayscale)
   - Random offset applied to noise sampling coordinates

2. **drawCableBundle** (js/main.js:488-523)
   - Vertical stripe patterns simulating bundled cables
   - Parameters used:
     - `scale`: Number of cable stripes (8-300 input → 8-25 stripes)
     - `bright`: Background color brightness
     - `contrast`: Gradient shading intensity
     - `palette`: Cable colors (cycles through palette for each stripe)
   - Random offset applied to Perlin noise for stripe positioning and waviness

3. **drawHwPanel** (js/main.js:525-586)
   - Grid-based hardware panel with vent slits and screws
   - Parameters used:
     - `scale`: Grid density (8-300 input → 15-4 cols, 9-2 rows inversely)
     - `bright`: Background panel brightness
     - `contrast`: Scratch overlay intensity and count
     - `palette`: Panel color (index 0), screw color (index 1)
   - Random offset applied to cell jitter and vent positioning

4. **drawCustomNoise** (js/main.js:588-620)
   - Perlin noise quantized to user-defined color palette
   - Parameters used:
     - `scale`: Noise frequency
     - `bright`: Not directly used (palette defines colors)
     - `contrast`: Sigmoid-style contrast adjustment (0.2-2.5 range)
     - `palette`: All colors used for quantization levels
   - Random offset applied to noise sampling coordinates

**Important**: All pattern functions use `Math.random()` to generate offsets at call time, ensuring each regeneration produces a unique pattern. The underlying Perlin noise remains deterministic within a page session.

### Perlin Noise (js/perlin.js)

Lightweight 2D Perlin noise implementation. Uses deterministic shuffle seeded by `Math.random()` on load, so the noise function itself is consistent during a session. Pattern variation comes from random offset injection in each generator function, not from reseeding Perlin noise.

### Preset System

- `data/presets.json` defines color palettes organized in four categories (50+ presets total):
  - `military_camouflage` (20 presets) - Woodland BDU, MARPAT, MultiCam, OCP, Flecktarn, JGSDF, etc.
  - `cable_bundles` (10 presets) - Dark/gray cable colors, graphite, charcoal mixes
  - `hardware_panels` (10 presets) - Server rack/industrial panel colors, gunmetal, brushed steel
  - `office_backgrounds` (10 presets) - Wall/ceiling/desk colors, wood tones, carpet grays
- Loaded via `fetch()` in js/main.js:601, dynamically populates dropdown
- Pattern type selector (js/main.js:329-351) filters presets to show only relevant categories

### Canvas Flow

1. Main pattern drawn to `patternCanvas`
2. If environment image uploaded + overlay enabled → composite drawn to `compositeCanvas`
3. Export uses whichever canvas is currently visible

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

## File Structure

```
├── index.html           # Main UI structure
├── style.css            # All styles
├── js/
│   ├── main.js         # Core pattern generation + UI logic
│   └── perlin.js       # Perlin noise implementation
├── data/
│   └── presets.json    # Color palette presets
└── assets/             # Screenshots (not in git yet)
```

## Important Notes

### Security Context

This tool is for **education only**. It demonstrates:
- How camouflage patterns work (visual blending)
- Why artificial devices are still detectable (LEDs, heat, RF signals)
- The limitations of visual-only concealment

**Do NOT**: Enhance this tool to facilitate device concealment, credential harvesting, or surveillance evasion.

**DO**: Improve educational explanations, pattern algorithms, visualization quality, accessibility.

### Palette Presets Loading

The preset loader (js/main.js:592-640) expects `data/presets.json` at `./data/presets.json` (relative to HTML). If moving files, update the fetch path at js/main.js:601.

### Canvas Export

Export function (js/main.js:770-777) exports either:
- `patternCanvas` alone (pattern only)
- `compositeCanvas` (pattern + environment image overlay)

Uses `canvas.toDataURL('image/png')` - no server upload.

### Pattern Regeneration System

**Critical Implementation Detail**: Each pattern generator MUST use random offsets to ensure regeneration produces different patterns.

**Why this matters**:
- Perlin noise is deterministic - same coordinates always return same values
- Without random offsets, clicking "Regenerate" or changing parameters would produce identical patterns
- Solution: Each generator function calls `Math.random()` to create unique offsets on each invocation

**Example pattern** (js/main.js:453-490):
```javascript
function drawBlackMatte(ctx,w,h,scale,contrast,bright,palette){
  const randomOffsetX = Math.random() * 1000;
  const randomOffsetY = Math.random() * 1000;
  // ...
  const nx = (x + randomOffsetX)/scale;
  const ny = (y + randomOffsetY)/scale;
  // Feed offset coordinates to Perlin.noise2()
}
```

**When adding new pattern generators**:
1. Always add random offsets at function entry
2. Apply offsets to ALL Perlin noise calls
3. Use all parameters (`scale`, `bright`, `contrast`, `palette`) meaningfully
4. Test regeneration produces visually different results
