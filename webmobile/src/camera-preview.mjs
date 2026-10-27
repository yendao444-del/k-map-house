// Keep the video detached. The user interacts only with canvas and buttons.
export function startCameraPreview({ canvas, onReady, onFailure, environment = globalThis }) {
  const doc = environment.document, video = doc.createElement('video')
  video.muted = true; video.playsInline = true; video.controls = false; video.disablePictureInPicture = true
  video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '')
  const context = canvas.getContext('2d', { alpha: false })
  let closed = false, stream = null, raf = null, deadline = null
  let ready = false, lastDraw = -Infinity, lastTime = -1, changedAt = 0
  const stopTracks = value => value?.getTracks().forEach(track => track.stop())
  const notifyReady = value => { if (ready !== value) { ready = value; onReady(value) } }
  function stop() {
    if (closed) return
    closed = true
    if (deadline != null) environment.clearTimeout(deadline)
    if (raf != null) environment.cancelAnimationFrame(raf)
    doc.removeEventListener('visibilitychange', visibility)
    video.removeEventListener('webkitbeginfullscreen', fullscreen)
    video.removeEventListener('error', mediaError)
    video.pause(); video.srcObject = null; stopTracks(stream); stream = null
  }
  function fail(reason) { if (!closed) { notifyReady(false); stop(); onFailure(reason) } }
  function fullscreen() {
    try { video.webkitExitFullscreen?.() } catch { /* OS may require closing its player. */ }
    fail('fullscreen')
  }
  function mediaError() { fail('playback') }
  function draw(now) {
    if (closed) return
    if (doc.visibilityState === 'hidden') { notifyReady(false); raf = environment.requestAnimationFrame(draw); return }
    if (!video.paused && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      if (video.currentTime !== lastTime) { lastTime = video.currentTime; changedAt = now }
      else if (ready && now - changedAt > 5000) { fail('stalled'); return }
      if (now - lastDraw >= 50) {
        const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight))
        const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale)
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        try { context.drawImage(video, 0, 0, width, height) } catch { fail('playback'); return }
        lastDraw = now; notifyReady(true)
        if (deadline != null) { environment.clearTimeout(deadline); deadline = null }
      }
    } else if (ready) { fail('stalled'); return }
    raf = environment.requestAnimationFrame(draw)
  }
  function visibility() {
    if (closed) return
    if (doc.visibilityState === 'hidden') { notifyReady(false); return }
    changedAt = environment.performance.now()
    if (video.paused) fail('stalled')
  }
  video.addEventListener('webkitbeginfullscreen', fullscreen)
  video.addEventListener('error', mediaError)
  doc.addEventListener('visibilitychange', visibility)
  deadline = environment.setTimeout(() => fail('timeout'), 12000)
  if (!context || !environment.navigator.mediaDevices?.getUserMedia) {
    Promise.resolve().then(() => fail('unsupported'))
  } else {
    Promise.resolve().then(async () => {
      if (closed) return
      const value = await environment.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      if (closed) { stopTracks(value); return }
      stream = value
      value.getVideoTracks()[0]?.addEventListener('ended', () => fail('ended'), { once: true })
      video.srcObject = value
      await video.play()
      if (!closed) raf = environment.requestAnimationFrame(draw)
    }).catch(error => fail(error?.name === 'NotAllowedError' ? 'denied' : 'playback'))
  }
  return { stop, source: video, isReady: () => !closed && ready && doc.visibilityState !== 'hidden' && !video.paused && video.readyState >= 2 }
}
