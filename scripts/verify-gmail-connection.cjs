// Read only the dedicated Electron token; never print tokens or send email.
require('dotenv').config({quiet:true})
const {app,safeStorage}=require('electron')
const fs=require('node:fs'),path=require('node:path')
const {google}=require('googleapis')
app.setPath('userData',path.join(app.getPath('appData'),'k-map-house'))
app.whenReady().then(async()=>{
 const output=path.resolve('webmobile/qa/gmail-production-connection.json')
 try {
  const profile=path.join(app.getPath('appData'),'k-map-house')
  const token=JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(profile,'dev-gmail-token.bin'))))
  const expected=process.env.GMAIL_SENDER_EMAIL.trim().toLowerCase()
  if(token.gmail_sender_email!==expected || token.gmail_client_id!==process.env.DEV_GMAIL_CLIENT_ID.trim()) throw new Error('Dedicated sender token binding mismatch')
  if(!token.refresh_token) throw new Error('No offline refresh credential; reconnect Gmail')
  const oauth=new google.auth.OAuth2(process.env.DEV_GMAIL_CLIENT_ID,process.env.DEV_GMAIL_CLIENT_SECRET,'http://localhost:3456/callback')
  oauth.setCredentials(token)
  const refreshed=await oauth.refreshAccessToken()
  const info=await oauth.getTokenInfo(refreshed.credentials.access_token)
  if(info.email?.toLowerCase()!==expected || !info.scopes.includes('https://www.googleapis.com/auth/gmail.send')) throw new Error('Google sender identity/scope mismatch')
  fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),ok:true,sender:expected,googleIdentityVerified:true,offlineRefreshVerified:true,sendScopeVerified:true,encryptedStorage:true,emailSent:false},null,2)+'\n')
 } catch(error) {
  fs.writeFileSync(output,JSON.stringify({ok:false,error:error.message})+'\n')
 }
 app.quit()
})
