# DREAM CATALOGUE v0.2.8 — IMPLEMENTATION SPEC

Pipeline: source photograph -> tonal/spectral transformation -> mode-specific optical phenomenon -> source-chroma recovery -> film cohesion.

Performance target: one fragment-shader pass for preview/export, no animation, four-octave procedural fields, bounded blur sampling.

Mode identity:
- HALO: overexposure, bloom, halation, directional spectral light.
- PRISM: local chromatic refraction, spectral bands, subtle caustics.
- VEIL: optical membrane, pearlescent transmission, wet-glass patches, luminous scars.
- SMOKE: sparse multi-trail smoke, local mist, backlit scattering, subtle refractive heat/air disturbance, rare anomalies.


## v0.2.8 PHENOMENA EXPANSION
- Rebuilt optical color so light is no longer a single flat tint.
- HALO: spectral ray fan, flare ghosts, arcs and exposure burns.
- VEIL: iridescent thin-film interference, luminous creases and wet-lens arcs.
- SMOKE: spectral backlight, beam-through-smoke, chemical filaments and local chromatic refraction.
- PRISM: multi-zone refraction, diffraction grating, caustics, spectral beams and arcs.
- Kept the renderer static and GPU-first; FBM remains four octaves.


## v0.2.8 architecture
Each mode now compiles from its own GLSL common/function block and its own fragment main. Changes to PRISM/SMOKE/VEIL helpers cannot change HALO. HALO's engine source is byte-equivalent to v0.2.5 after concatenation. PRISM, SMOKE and VEIL are tuned for stronger visible transformation while keeping a single GPU pass.


## v0.2.8 engine policy
HALO is isolated from later shared color/shoulder functions. PRISM is a separate optical engine. SMOKE and VEIL are intentionally not redesigned in this revision.
