# DREAM CATALOGUE v0.2.8

Optical Phenomena Engine rebuild.

This version keeps the existing interface while rebuilding the image engine around four dedicated photographic phenomena: HALO, VEIL, SMOKE, and PRISM.

## Engine changes

- New hidden film-spectrum recipes selected by REVEAL.
- SOURCE COLOR restores original chroma without cancelling optical phenomena.
- HALO preserves the strong overexposed / halation direction.
- PRISM preserves the usable spectral/refraction direction with a subtle caustic layer.
- VEIL is rebuilt as a translucent optical membrane with wet-glass zones and luminous scars.
- SMOKE is rebuilt around separate drifting trails, local density, backlight response, small refraction, and rare geometric anomalies.
- Static GPU processing only: no animation loop, no particle simulation, four-octave noise for lower cost.

## Files

FULL/GitHub builds include the PWA manifest, service worker and icons. The p5 Web Editor build excludes PWA registration files.


## v0.2.8 PHENOMENA EXPANSION
- Rebuilt optical color so light is no longer a single flat tint.
- HALO: spectral ray fan, flare ghosts, arcs and exposure burns.
- VEIL: iridescent thin-film interference, luminous creases and wet-lens arcs.
- SMOKE: spectral backlight, beam-through-smoke, chemical filaments and local chromatic refraction.
- PRISM: multi-zone refraction, diffraction grating, caustics, spectral beams and arcs.
- Kept the renderer static and GPU-first; FBM remains four octaves.


## v0.2.8 OPTICAL ENGINES
- HALO: v0.2.5 engine frozen exactly (common GLSL + fragment shader + HALO recipe branch).
- PRISM: independent optical-fracture engine with three refractive zones, multi-axis chromatic separation, diffraction planes, caustics, rays and arcs.
- SMOKE: independent volumetric-scattering engine. Neutral density and Beer-Lambert-style RGB transmission replace the previous color-screen look; spectral color appears mainly in backscatter and beams.
- VEIL: independent thin-film/membrane engine with thickness fields, refraction, interference gain, liquid-lens pockets, folds, arcs and pearlescent scattering.
- Runtime remains one static WEBGL fragment-shader pass per mode; no animation or CPU particle simulation.


v0.2.8 optical engine notes
- HALO restored from the accepted v0.2.3.4 engine, including its uncompressed white blowout behavior.
- PRISM rebuilt from the photographic v0.2.3.4 direction with stronger soft refraction, diffraction, caustics, rays and lens arcs.
- SMOKE and VEIL remain on the v0.2.7 direction because that direction was accepted.
