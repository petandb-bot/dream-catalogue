# DREAM CATALOGUE v0.2.5

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


## v0.2.5 PHENOMENA EXPANSION
- Rebuilt optical color so light is no longer a single flat tint.
- HALO: spectral ray fan, flare ghosts, arcs and exposure burns.
- VEIL: iridescent thin-film interference, luminous creases and wet-lens arcs.
- SMOKE: spectral backlight, beam-through-smoke, chemical filaments and local chromatic refraction.
- PRISM: multi-zone refraction, diffraction grating, caustics, spectral beams and arcs.
- Kept the renderer static and GPU-first; FBM remains four octaves.
