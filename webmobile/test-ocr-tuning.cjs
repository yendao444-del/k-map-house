const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const {createWorker,PSM}=require('tesseract.js');
async function main(){
 const files=fs.readdirSync('webmobile/test image').filter(x=>x.endsWith('.jpg'));
 const img=await sharp(path.join('webmobile/test image',files[0])).rotate().resize({width:1600}).toBuffer();
 for(const lang of ['vie','vie+eng']){
  const w=await createWorker(lang,1,{langPath:path.resolve('resources/identity-ocr'),gzip:false,cacheMethod:'none'});
  for(const mode of [PSM.AUTO,PSM.SPARSE_TEXT]){
   await w.setParameters({tessedit_pageseg_mode:mode});
   const t=Date.now();const r=await w.recognize(img);
   fs.writeFileSync(`webmobile/qa/private/ocr-${lang}-${mode}.txt`,r.data.text);
   console.log(lang,mode,'exactAccentedName',r.data.text.includes('ĐỖ KIM NGÂN'),'confidence',r.data.confidence,'ms',Date.now()-t);
  }
  await w.terminate();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
