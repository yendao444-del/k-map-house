const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
// Optional historical comparison; jsQR is not a production dependency.
let jsQR;
try { jsQR = require('jsqr'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const { readBarcodes, setZXingModuleOverrides } = require('zxing-wasm/reader');
const { createWorker } = require('tesseract.js');

async function main() {
  setZXingModuleOverrides({ wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) });
  const dir = path.join(__dirname, 'test image');
  const files = fs.readdirSync(dir).filter(x=>x.endsWith('.jpg'));
  for (const file of files) {
    const im = sharp(path.join(dir,file));
    const {data,info}=await im.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const start=Date.now();
    const z=await readBarcodes({data:new Uint8ClampedArray(data),width:info.width,height:info.height},{formats:['QRCode'],tryHarder:true});
    const j=jsQR?.(new Uint8ClampedArray(data),info.width,info.height);
    console.log(file.slice(0,13),'zxing',z.length,'jsqr',jsQR ? !!j : 'not installed (optional)','ms',Date.now()-start);
  }
  const worker=await createWorker('vie+eng',1,{langPath:path.resolve(__dirname,'../resources/identity-ocr'),gzip:false,cacheMethod:'none'});
  const file=path.join(dir,files[0]);
  for(const [label,img] of [
    ['full',await sharp(file).resize({width:1600}).toBuffer()],
    ['lower',await sharp(file).extract({left:200,top:1000,width:1350,height:900}).resize({width:2000}).normalize().toBuffer()]
  ]) {
    const t=Date.now(); const {data}=await worker.recognize(img); console.log('OCR',label,'ms',Date.now()-t,'confidence',data.confidence);
  }
  await worker.terminate();
}
main().catch(e=>{console.error(e);process.exit(1)});
