# v0.2.6 WEBGL implementation notes

The rendering architecture is intentionally GPU-first. Each mode is a dedicated GLSL fragment shader using the source photo as a texture. Complex appearance comes from layered analytic fields rather than multi-pass CPU compositing.

HALO is frozen from v0.2.5. PRISM raises local dispersion and diffraction. SMOKE uses vector RGB transmittance/extinction, neutral scattering, backlight and refraction. VEIL uses multiplicative thin-film interference, transmission, wet arcs, caustics and chromatic slip.
