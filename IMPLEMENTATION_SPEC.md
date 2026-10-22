# v0.2.8.2 brush-up notes

Baseline: v0.2.8 Optical Engines. No architecture rewrite.

HALO shader/common source is intentionally unchanged.
PRISM receives coefficient-only strength adjustments.
SMOKE keeps the same density, trail, refraction, transmission, beam and filament architecture; neutral scattering is whitened and shadow absorption reduced.
VEIL keeps the same membrane/fold/refraction/interference/lens/arc architecture; coefficients are raised modestly for visibility.
