import test from 'node:test'
import assert from 'node:assert/strict'
import {createManualFallback} from './manual-fallback.mjs'
const contexts={electric:{previousReading:12600,elapsedDays:30,maxDailyUsage:40,recentDailyUsage:[3,3.2,3.4],spikeMultiplier:3,minimumSpikeDailyUsage:5},water:{previousReading:280,elapsedDays:30,maxDailyUsage:2,recentDailyUsage:[.23,.25,.27],spikeMultiplier:3,minimumSpikeDailyUsage:.5}}
test('two failures unlock only the affected meter and preserve manual source',()=>{
 const f=createManualFallback(contexts)
 const read={meter:'electric',reading:12692}
 assert.equal(f.confirm(read).ok,false)
 f.failed('electric');assert.equal(f.confirm(read).ok,false)
 f.failed('electric');assert.deepEqual(f.available(),{electric:true,water:false})
 const result=f.confirm(read);assert.equal(result.ok,true);assert.equal(result.source,'manual');assert.equal(result.assessment.usage,92)
 assert.equal(f.confirm({meter:'water',reading:287}).ok,false)
})
test('camera error unlocks fallback but cannot bypass meter and usage validation',()=>{
 const f=createManualFallback(contexts)
 assert.equal(f.confirm({meter:'water',reading:279,cameraError:true}).ok,false)
 assert.equal(f.confirm({meter:'water',reading:10000}).ok,false)
 assert.equal(f.confirm({meter:'water',reading:310}).ok,false) // Historical spike despite being under the hard limit.
 assert.equal(f.confirm({meter:'water',reading:287}).ok,true)
 assert.equal(f.confirm({meter:'wrong',reading:287,cameraError:true}).ok,false)
 assert.equal(f.confirm({meter:'water',reading:'287'}).ok,false)
 f.reset();assert.deepEqual(f.available(),{electric:false,water:false})
})
