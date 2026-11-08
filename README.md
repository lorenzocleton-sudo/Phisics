# Solar System Explorer

A scientifically grounded 3D model of the Solar System in **one self-contained file**: [`index.html`](index.html) (~450 KB, three.js loaded from a CDN). Open it in any modern browser, on desktop or phone. It needs an internet connection the first time it loads, to fetch three.js.

**Controls:** drag to rotate · pinch/scroll to zoom · tap to select · double-tap to fly there · `/` opens search · space bar pauses.

## What's computed, and where the numbers come from
| Part | Method / source |
|---|---|
| Planets | JPL Keplerian elements + rates (Standish & Williams, Table 2a/2b, valid 3000 BC – AD 3000) |
| Moon | Truncated ELP-2000/82 (Meeus ch. 47): about 10–30 km against JPL Horizons |
| 461 moons | JPL SSD satellite mean elements (precessing ellipses, Laplace/equatorial frames) |
| 95 asteroids & TNOs, 18 comets & interstellar objects | JPL Small-Body Database osculating elements (two-body) |
| Voyager 1/2, Pioneer 10/11, New Horizons, Parker Solar Probe, JWST | Fitted to JPL Horizons vectors, with planet-centred close-ups for every flyby |
| Stars | Yale Bright Star Catalogue (via d3-celestial) |

Checks against Horizons and published values:
- The Event Finder lists the same 24 eclipses (dates and types) as NASA for 2026–2030.
- Voyager 1 passes Jupiter at 348,510 km, 12:05 UTC on 5 Mar 1979 (real: ~348,900 km).
- New Horizons passes Pluto at 13,680 km (real: 13,691 km).
- Apophis passes Earth on 13/14 Apr 2029 at ~40,700 km (real: ~38,000 km; the app uses two-body orbits only).

Physical data, mission lists and fun facts come from the AI model's training knowledge (to ~2025). Orbital data was retrieved on 2026-11-07. Moon counts are taken from JPL's table on that date. Discoveries keep changing these numbers.

## Features
- Real positions for any date, with presets (Apollo 11, Voyager 2 at Neptune, Apophis 2029, year 3000…). Time controls: reverse, pause, real time, 1 h/s, 1 d/s, 1 month/s, 1 yr/s.
- **True scale** (real sizes and distances, with a scale bar from km to AU to light-years) and **Explore mode** (sizes enlarged, distances compressed logarithmically).
- A light-speed trip outward from the Sun, with a live clock and milestones.
- Belts and clouds whose orbits are solved on the GPU:
  - Main belt with Kirkwood gaps, Hildas, Jupiter Trojans and near-Earth asteroids
  - Kuiper belt with resonant plutinos, plus the scattered disc
  - Oort cloud and heliopause
- Comet tails that point away from the Sun, and the hyperbolic paths of interstellar visitors.
- Info panel with a data table, live distances and light-times, travel times and a weight calculator.
- Comparison tool with a to-scale drawing, search, layer toggles, follow camera, Lagrange points and the nearest stars.
