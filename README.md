# DREAM CATALOGUE v0.2.6 WEBGL

GPU-first optical phenomena build.

## Mode direction
- HALO: fixed to v0.2.5 behavior.
- PRISM: stronger multi-zone spectral refraction, diffraction, caustics, rays and sheared image regions.
- SMOKE: neutral volumetric scattering and RGB extinction instead of a flat Screen-color overlay; color occurs inside illuminated smoke and local refraction.
- VEIL: stronger refractive membrane, thin-film interference, folds, wet arcs and caustics; no broad single-color light layer.

## Performance
- p5.js WEBGL renderer.
- One fragment-shader pass per preview/export.
- Static rendering only; no animation loop or particle simulation.
- Four-octave FBM and bounded texture sampling.

FULL/GitHub builds include PWA files and icons. p5 Web Editor build excludes Service Worker and manifest registration.
