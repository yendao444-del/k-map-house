const {app,BrowserWindow,ipcMain}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..')
const privateDir=path.join(__dirname,'private')
app.setPath('userData',path.join(privateDir,'electron-ipc-profile'))
const originalAppPath=app.getAppPath.bind(app)
app.getAppPath=()=>root
app.whenReady().then(async()=>{
 let win
 try{
  require(path.join(privateDir,'ipc-handlers.cjs')).registerTenantIdentityHandlers()
  const files=fs.readdirSync(path.join(root,'webmobile/test image')).filter(x=>x.endsWith('.jpg'))
  const image=fs.readFileSync(path.join(root,'webmobile/test image',files[1]))
  const expected=JSON.parse(fs.readFileSync(path.join(privateDir,'expected.json'),'utf8'))
  const html=path.join(privateDir,'ipc-test.html')
  fs.writeFileSync(html,`<!doctype html><meta charset="utf-8"><script>window.addEventListener('DOMContentLoaded',async()=>{const result=await window.api.tenantIdentity.read(${JSON.stringify('data:image/jpeg;base64,'+image.toString('base64'))});window.api.db.write(result);})</script>`)
  const testResult=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('IPC smoke timed out')),30000)
   ipcMain.handle('db:write',(_,result)=>{clearTimeout(timer);resolve(result);return true})
  })
  win=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'out/preload/index.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}})
  await win.loadFile(html)
  const result=await testResult
  assert.equal(result.ok,true);assert.equal(result.source,'qr');assert.equal(result.fields.fullName,expected.fullName);assert.equal(result.fields.identityCard,expected.identityCard)
  fs.writeFileSync(path.join(__dirname,'ipc-runtime-results.json'),JSON.stringify({passed:true,actualPreload:true,actualMainHandlers:true,sandbox:true,nameExact:true,idExact:true}))
  win.destroy();app.getAppPath=originalAppPath;app.exit(0)
 }catch(error){fs.writeFileSync(path.join(__dirname,'ipc-runtime-results.json'),JSON.stringify({passed:false,error:String(error)}));if(win)win.destroy();app.exit(1)}
})
