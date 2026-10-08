import sharp from 'sharp'

export function decodeMeterImage(value) {
  if (typeof value !== 'string' || value.length > 4_000_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('invalid_image')
  return Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')
}

export async function prepareMeterViews(value) {
  const bytes = decodeMeterImage(value)
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().toBuffer({ resolveWithObject: true })
    if (info.width < 240 || info.height < 180) throw new Error('image_too_small')
    const stats = await sharp(data).greyscale().stats()
    if (stats.channels[0].stdev < 3) throw new Error('image_blank')
    const full = await sharp(data).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
    // Both reads retain every wheel: do not apply a fixed central crop that can
    // cut off leading digits or select a neighbouring meter. No generative enhancement.
    const detail = await sharp(data).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).linear(1.08, -8).jpeg({ quality: 95 }).toBuffer()
    return { full: `data:image/jpeg;base64,${full.toString('base64')}`, detail: `data:image/jpeg;base64,${detail.toString('base64')}` }
  } catch (cause) { if (['image_too_small', 'image_blank'].includes(cause.message)) throw cause; throw new Error('invalid_image') }
}
