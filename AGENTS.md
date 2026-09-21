# Workspace Agent Notes

## Product Design Image Generation

- Route image generation through the local 9Router endpoint in `NINEROUTER_URL` and query `/v1/models/image` before each generation.
- For faithful desktop UI screens, the local helper selects `cx/gpt-5.5-image` for one authoritative reference and `cx/gpt-image-2.5` when multi-image editing is required.
- Treat `cx/gpt-image-2.5-sunburst` and `flare` as intentional style variants, not universal defaults.
- Use one authoritative product screenshot, plus at most one same-context secondary reference. Do not send stale clipboard captures, generated variants, or screenshots from another repository unless the prompt explicitly says why.
- Prompts must state the authoritative reference, what to preserve, the exact requested change, and an explicit `Avoid` list. Keep Vietnamese labels and layout hierarchy readable and unclipped.
- The helper retries transient gateway failures up to three times and writes `b64_json` responses directly; never replace a failed generated image with an HTML/CSS screenshot.
- Override the selected model only with `PRODUCT_DESIGN_IMAGE_MODEL` after confirming that it exists in the current catalog.
