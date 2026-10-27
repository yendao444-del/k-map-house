import test from 'node:test'
import assert from 'node:assert/strict'
import { startCameraPreview } from '../src/camera-preview.mjs'

const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture(options = {}) {
  const video = Object.assign(new EventTarget(), { paused: true, readyState: 2, videoWidth: 2560, videoHeight: 1920, currentTime: 0, attributes: {}, srcObject: null,
    setAttribute(k,v) { this.attributes[k]=v }, pause() { this.paused=true },
    async play() { if(options.playError)throw options.playError;this.paused=false;if(options.fullscreen)this.dispatchEvent(new Event('webkitbeginfullscreen')) },
    webkitExitFullscreen() { this.exited=true } })
  const track=Object.assign(new EventTarget(),{stops:0,stop(){this.stops++}})
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]}
  const frames=new Map(),timers=new Map(),events=[],draws=[]
  let id=0,now=0
  const doc=Object.assign(new EventTarget(),{visibilityState:'visible',createElement(name){assert.equal(name,'video');return video}})
  const environment={document:doc,navigator:{mediaDevices:options.unsupported?undefined:{getUserMedia:options.getUserMedia|| (async constraints=>{assert.equal(constraints.audio,false);assert.equal(constraints.video.facingMode.ideal,'environment');return stream})}},performance:{now:()=>now},
    requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(n){frames.delete(n)},
    setTimeout(fn,ms){timers.set(++id,{fn,ms});return id},clearTimeout(n){timers.delete(n)}}
  const canvas={width:0,height:0,getContext:()=>options.noContext?null:{drawImage(...args){if(options.drawError)throw Error('draw failed');draws.push(args)}}}
  const runtime=startCameraPreview({canvas,environment,onReady:v=>events.push(['ready',v]),onFailure:v=>events.push(['failure',v])})
  return {runtime,video,track,stream,events,canvas,draws,timers,frames,
    frame(ms){now=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(ms)},
    deadline(){const pending=[...timers.values()];timers.clear();for(const {fn}of pending)fn()},
    visibility(value){doc.visibilityState=value;doc.dispatchEvent(new Event('visibilitychange'))}}
}
test('canvas preview uses a detached inline/muted video and preserves full capture dimensions',async()=>{
  const f=fixture();await flush();assert.equal(f.runtime.isReady(),false)
  f.frame(0);assert.equal(f.runtime.isReady(),true);assert.equal(f.canvas.width,960);assert.equal(f.canvas.height,720)
  assert.equal(f.video.videoWidth,2560);assert.equal(f.video.muted,true);assert.equal(f.video.controls,false);assert.ok('webkit-playsinline' in f.video.attributes)
  assert.equal(f.timers.size,0);f.runtime.stop();assert.equal(f.track.stops,1);assert.equal(f.frames.size,0)
})
for(const options of [{unsupported:true},{noContext:true}])test('missing media or canvas support opens fallback without pretending ready',async()=>{
  const f=fixture(options);await flush();assert.deepEqual(f.events,[['failure','unsupported']]);assert.equal(f.runtime.isReady(),false)
})
test('permission denied opens fallback',async()=>{
  const f=fixture({getUserMedia:async()=>{throw new DOMException('Denied','NotAllowedError')}});await flush();assert.deepEqual(f.events,[['failure','denied']])
})
test('playback rejection releases camera before fallback',async()=>{
  const f=fixture({playError:Error('autoplay blocked')});await flush();assert.equal(f.track.stops,1);assert.deepEqual(f.events,[['failure','playback']])
})
test('forced iPhone fullscreen exits and stops instead of play retry loop',async()=>{
  const f=fixture({fullscreen:true});await flush();assert.equal(f.video.exited,true);assert.equal(f.track.stops,1);assert.equal(f.frames.size,0);assert.deepEqual(f.events,[['failure','fullscreen']])
})
test('first frame timeout falls back and cleans stream',async()=>{
  const f=fixture();f.video.readyState=0;await flush();f.frame(0);f.deadline();assert.deepEqual(f.events,[['failure','timeout']]);assert.equal(f.track.stops,1)
})
test('permission resolving after timeout cannot leave a camera running',async()=>{
  let resolve;const f=fixture({getUserMedia:()=>new Promise(r=>{resolve=r})});await flush();f.deadline();resolve(f.stream);await flush()
  assert.equal(f.track.stops,1);assert.equal(f.video.srcObject,null);assert.deepEqual(f.events,[['failure','timeout']])
})
test('unmount while permission is pending suppresses callbacks and stops late stream',async()=>{
  let resolve;const f=fixture({getUserMedia:()=>new Promise(r=>{resolve=r})});await flush();f.runtime.stop();resolve(f.stream);await flush()
  assert.equal(f.track.stops,1);assert.deepEqual(f.events,[]);assert.equal(f.timers.size,0)
})
test('immediate cleanup never requests camera',async()=>{
  let requests=0;const f=fixture({getUserMedia:async()=>{requests++;return f.stream}});f.runtime.stop();await flush();assert.equal(requests,0)
})
test('frozen/paused frames cannot be captured',async()=>{
  const f=fixture();await flush();f.frame(0);f.frame(5100);assert.deepEqual(f.events,[['ready',true],['ready',false],['failure','stalled']]);assert.equal(f.runtime.isReady(),false)
  const p=fixture();await flush();p.frame(0);p.video.paused=true;p.frame(100);assert.equal(p.runtime.isReady(),false);assert.equal(p.track.stops,1)
})
test('background hides readiness; interrupted stream falls back on return',async()=>{
  const f=fixture();await flush();f.frame(0);f.visibility('hidden');assert.equal(f.runtime.isReady(),false);f.video.paused=true;f.visibility('visible')
  assert.equal(f.events.at(-1)[1],'stalled');assert.equal(f.track.stops,1)
})
test('track ending or canvas failure falls back once',async()=>{
  const f=fixture();await flush();f.frame(0);f.track.dispatchEvent(new Event('ended'));assert.equal(f.runtime.isReady(),false);assert.equal(f.track.stops,1)
  const p=fixture({drawError:true});await flush();p.frame(0);assert.equal(p.events.at(-1)[1],'playback');p.deadline();assert.equal(p.events.filter(e=>e[0]==='failure').length,1)
})
