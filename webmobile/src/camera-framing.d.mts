type Bounds = { left: number; top: number; width: number; height: number }
export function cameraFrameRect(sourceWidth: number, sourceHeight: number, preview: Bounds, guide: Bounds): { x: number; y: number; width: number; height: number }
