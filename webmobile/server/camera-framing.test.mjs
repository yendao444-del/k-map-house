import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraFrameRect } from '../src/camera-framing.mjs'

test('scan guide maps to original camera pixels in portrait and landscape cover previews', () => {
  const preview = { left: 20, top: 100, width: 300, height: 400 }
  const guide = { left: 50, top: 180, width: 240, height: 240 }
  assert.deepEqual(cameraFrameRect(1920, 2560, preview, guide), { x: 192, y: 512, width: 1536, height: 1536 })
  // Landscape source loses its sides in the portrait preview: do not capture them.
  assert.deepEqual(cameraFrameRect(2560, 1920, preview, guide), { x: 704, y: 384, width: 1152, height: 1152 })
})
