# Workspace Agent Notes

## Product Design Image Generation

- Route image generation through the local 9Router endpoint in `NINEROUTER_URL` and query `/v1/models/image` before each generation.
- For faithful desktop UI screens, the local helper selects `cx/gpt-5.5-image` for one authoritative reference and `cx/gpt-image-2.5` when multi-image editing is required.
- Treat `cx/gpt-image-2.5-sunburst` and `flare` as intentional style variants, not universal defaults.
- Use one authoritative product screenshot, plus at most one same-context secondary reference. Do not send stale clipboard captures, generated variants, or screenshots from another repository unless the prompt explicitly says why.
- Prompts must state the authoritative reference, what to preserve, the exact requested change, and an explicit `Avoid` list. Keep Vietnamese labels and layout hierarchy readable and unclipped.
- The helper retries transient gateway failures up to three times and writes `b64_json` responses directly; never replace a failed generated image with an HTML/CSS screenshot.
- Override the selected model only with `PRODUCT_DESIGN_IMAGE_MODEL` after confirming that it exists in the current catalog.

## Mandatory Image Demo Gate

- For every Product Design request, the first deliverable must be a visual demo image, not a code implementation.
- Do not edit application UI code, scaffold a prototype, or wire a route until the user has selected or explicitly approved a generated/reference image direction.
- When no visual target is provided, generate exactly three distinct image directions using the local 9Router workflow, show all images in the response, and wait for the user's selection.
- When a visual target is provided, treat that image as the source of truth and show the proposed visual demo before implementation.
- After the user selects/approves the image, implementation may proceed and must finish with a `design-qa.md` comparison against the approved image.
