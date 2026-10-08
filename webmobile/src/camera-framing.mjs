// Translate the fixed scan guide through a centered object-fit: cover preview.
export function cameraFrameRect(sourceWidth, sourceHeight, preview, guide) {
  const scale = Math.max(preview.width / sourceWidth, preview.height / sourceHeight)
  const offsetX = (sourceWidth * scale - preview.width) / 2
  const offsetY = (sourceHeight * scale - preview.height) / 2
  const x = Math.max(0, Math.round((guide.left - preview.left + offsetX) / scale))
  const y = Math.max(0, Math.round((guide.top - preview.top + offsetY) / scale))
  return { x, y, width: Math.max(1, Math.min(sourceWidth - x, Math.round(guide.width / scale))), height: Math.max(1, Math.min(sourceHeight - y, Math.round(guide.height / scale))) }
}
