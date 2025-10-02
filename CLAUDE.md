# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CamoForge** is a web-based camouflage pattern generator for educational and research purposes. It generates various camouflage patterns (Perlin noise, stripes, panels) and overlays them on environment images to visualize how they blend. This is a **defensive security education tool** - it helps users understand visual concealment concepts, not facilitate malicious hiding of devices.

**Tech Stack**: Pure HTML/CSS/JavaScript (no frameworks), Canvas API, client-side only (no backend)

**Demo**: https://ipusiron.github.io/camoforge/

## Key Architecture

### Core Pattern Generation (js/main.js)

Four pattern generators, all using Canvas 2D API:

1. **drawBlackMatte** (js/main.js:112) - Matte black texture using multi-octave Perlin noise with vignetting
2. **drawCableBundle** (js/main.js:147) - Vertical stripe patterns simulating bundled cables
3. **drawHwPanel** (js/main.js:175) - Grid-based hardware panel with vent slits and screws
4. **drawCustomNoise** (js/main.js:221) - Perlin noise quantized to user-defined color palette

### Perlin Noise (js/perlin.js)

Lightweight 2D Perlin noise implementation. Uses deterministic shuffle seeded by `Math.random()` on load, so patterns change on page refresh but are consistent during a session.

### Preset System

- `data/presets.json` defines color palettes organized in three categories:
  - `cable_bundles` - Dark/gray cable colors
  - `hardware_panels` - Server rack/industrial panel colors
  - `office_backgrounds` - Wall/ceiling/desk colors
- Loaded via `fetch()` in js/main.js:282, dynamically populates dropdown

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

The preset loader (js/main.js:251-320) expects `data/presets.json` at `./presets.json` (relative to HTML). If moving files, update the fetch path at js/main.js:282.

### Canvas Export

Export function (js/main.js:328) exports either:
- `patternCanvas` alone (pattern only)
- `compositeCanvas` (pattern + environment image overlay)

Uses `canvas.toDataURL('image/png')` - no server upload.
