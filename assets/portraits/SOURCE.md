# Real portrait provenance

Source: the uploaded photograph referred to as `download(1).png`, received as `codex-clipboard-3b5425e9-8d26-408a-ad11-7d1661546bb9.png`.

- Untouched original: `rudra-original.png` (1086 × 1448).
- Original SHA-256: `fad85bff6c59b5d891882a76567abcf74ceaa63fb6e0960158444581105d220e`.
- `rudra-full.png` / `rudra-full.webp`: original RGB pixels, cropped around a non-generative human segmentation alpha mask. The mask uses a tighter subject region for edge detail, removes lawn-coloured boundary pixels and applies a one-pixel boundary cleanup below the face/hair. No face, clothing, body shape or RGB colour is regenerated or repainted.
- `rudra-upper.webp`: upper-body crop from that same isolated photograph.
- `rudra-upper-300.webp`: proportional 300 px-wide mobile derivative. All WebP assets use lossless encoding.
- `assets/portrait-config.json`: exact current crop coordinates and dimensions.

Pixel comparison verified that the PNG's RGB channels match the corresponding original crop exactly, and visible pixels survive the full-size lossless WebP encoding unchanged. The original is never requested by the hero.

Desktop CSS enlarges the isolated photograph to 138% of the previous composition and crops the lower legs. Tablet and mobile use the same photograph with responsive crops. The restrained light is behind the image; the photograph's lighting and face are not retouched.

Optional offline preparation: `python tools/prepare-portrait.py`. Requires Pillow, NumPy, SciPy, ONNX Runtime and pooch on the preparation machine only. It downloads checksum-verified U2Net human-segmentation weights into ignored `artifacts/`. No image model, Python dependency or generation service is used by the website at runtime.
