# DREAM CATALOGUE v0.2.4 — IMPLEMENTATION SPEC

Pipeline: source photograph -> tonal/spectral transformation -> mode-specific optical phenomenon -> source-chroma recovery -> film cohesion.

Performance target: one fragment-shader pass for preview/export, no animation, four-octave procedural fields, bounded blur sampling.

Mode identity:
- HALO: overexposure, bloom, halation, directional spectral light.
- PRISM: local chromatic refraction, spectral bands, subtle caustics.
- VEIL: optical membrane, pearlescent transmission, wet-glass patches, luminous scars.
- SMOKE: sparse multi-trail smoke, local mist, backlit scattering, subtle refractive heat/air disturbance, rare anomalies.
