import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const kind = process.argv[2];
if (!['electric', 'water'].includes(kind)) throw new Error('Pass electric or water');
const root = path.dirname(fileURLToPath(import.meta.url));
const reference = path.resolve(root, '../meter-reference.png');
const output = path.join(root, `meter-${kind}.png`);
const target = path.resolve(root, `../../public/assets/meter-${kind}.webp`);
const base = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
if (!base) throw new Error('NINEROUTER_URL unavailable');
const headers = { 'Content-Type': 'application/json' };
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image';
const referenceData = `data:image/png;base64,${(await fs.readFile(reference)).toString('base64')}`;
const subject = kind === 'electric'
  ? 'A real old residential Vietnamese mechanical electricity meter, front-facing, matching the round glass casing and pale gray metal faceplate of the reference. Five separate rolling black digit cells clearly read 0 1 3 2 0, with a small red decimal marking on the right. The number window must remain the largest, sharpest readable feature at approximately 45% down the frame. The kWh label is above. Small believable mechanical labels below: EMIC, CV140, 220V and 10(40)A. Show lightly dusty worn glass, screw mounts and subdued wall enclosure. Keep the rolling number central, casing nearly fills the portrait frame.'
  : 'A real Vietnamese residential water meter, photographed directly front-facing in the same worn natural photographic style. A circular meter head with pale ivory face and blue metal outer rim, mounted onto a small horizontal pipe visible on the sides. The horizontally aligned rectangular rolling reading window must clearly read five black digits 0 0 0 4 2 followed by red decimal digits 1 5 0; number window in the upper center at about 45% down the portrait frame. A small m³ unit label nearby. Include restrained mechanical dial markings lower on the face, honest slightly worn glass and muted concrete background. Meter fills most of the portrait crop; do not show any hand.';
const prompt = `Generate one realistic photographic instructional sample image asset for a Vietnamese room-rental meter capture page, portrait canvas 1024x1536. AUTHORITATIVE REFERENCE: the attached meter-reference.png crop from the approved mobile UI. PRESERVE: the reference's front-facing mechanical meter photography, natural subdued light, realistic materials, portrait composition, central sharply readable number window and muted background. EXACT REQUEST: ${subject} Remove the reference's white scan corner overlay completely; the photograph must have no user interface. Compose the essential complete meter inside the central 410:473 portrait crop, with number window around 45% vertical, so a center cover crop at 410x473 retains it. This is clearly a generic instructional sample, not real tenant evidence. Avoid: phone frames, UI, scan-corner overlays, text banners, labels outside the meter, hands, people, QR codes, watermarks, drawings, CGI, flat vectors, glossy futuristic gadgets, artistic blur on digits, illegible readings, floating digital numerals, unrelated branding, gradients, extra meters, clipped essential number window. Keep the photo believable and calm.`;
await fs.mkdir(root, { recursive: true });
await fs.mkdir(path.dirname(target), { recursive: true });
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers });
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    if (!catalog.data?.some(item => item.id === model)) throw new Error(`${model} unavailable in catalog`);
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, prompt, image: referenceData, n: 1, size: '1024x1536', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(300000)
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 200)}`);
    let payload;
    try { payload = JSON.parse(raw); } catch {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) {
        try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event; } catch {}
      }
    }
    const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json;
    if (!encoded) throw new Error('No image bytes returned');
    await fs.writeFile(output, Buffer.from(encoded, 'base64'));
    await sharp(output).resize(820, 946, { fit: 'cover', position: 'centre' }).webp({ quality: 86 }).toFile(target);
    await fs.writeFile(`${output}.json`, JSON.stringify({ model, reference, prompt, output, target, role: 'instructional-demo-sample', generatedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ output, target, model }));
    break;
  } catch (error) {
    if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error;
    console.log(`Retry ${attempt}: ${error.message.slice(0, 180)}`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
