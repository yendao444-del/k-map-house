import test from 'node:test'
import assert from 'node:assert/strict'
import { requestJson } from '../src/request-json.mjs'
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(fetch) {
 const timers=new Map();let next=0
 return {timers,env:{AbortController,DOMException,fetch,setTimeout(fn){timers.set(++next,fn);return next},clearTimeout(id){timers.delete(id)}}}
}
test('JSON request works without AbortSignal.any or timeout and clears its timer',async()=>{
 const f=fixture(async(_,init)=>{assert.ok(init.signal instanceof AbortSignal);return {json:async()=>({ok:true})}})
 assert.deepEqual((await requestJson('/qa',{},100,f.env)).data,{ok:true});assert.equal(f.timers.size,0)
})
test('parent cancellation aborts fetch and clears timer',async()=>{
 const f=fixture((_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))))
 const parent=new AbortController();const promise=requestJson('/qa',{signal:parent.signal},100,f.env);parent.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(f.timers.size,0)
})
test('already canceled request does not call fetch',async()=>{
 let calls=0;const f=fixture(async()=>{calls++});const parent=new AbortController();parent.abort()
 await assert.rejects(requestJson('/qa',{signal:parent.signal},100,f.env));assert.equal(calls,0);assert.equal(f.timers.size,0)
})
test('deadline includes a stalled response body and preserves TimeoutError',async()=>{
 let captured;const f=fixture(async(_,init)=>{captured=init.signal;return {json:()=>new Promise((_,reject)=>captured.addEventListener('abort',()=>reject(captured.reason)))}})
 const promise=requestJson('/qa',{},100,f.env);await flush();for(const fn of f.timers.values())fn()
 await assert.rejects(promise,{name:'TimeoutError'});assert.equal(f.timers.size,0)
})

test('native body AbortError retains the deadline reason for user feedback',async()=>{
 let captured;const f=fixture(async(_,init)=>{captured=init.signal;return {json:()=>new Promise((_,reject)=>captured.addEventListener('abort',()=>reject(new DOMException('Body aborted','AbortError'))))}})
 const promise=requestJson('/qa',{},100,f.env);await flush();for(const fn of f.timers.values())fn()
 await assert.rejects(promise,{name:'TimeoutError'});assert.equal(f.timers.size,0)
})
