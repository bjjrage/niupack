// Optimize selected built-in imagegen outputs without retouching artwork or alpha.
// Original product covers are outside this pipeline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../../',import.meta.url));
const recordPath=path.join(root,'data/showroom-artwork.json');
const record=JSON.parse(await fs.readFile(recordPath,'utf8'));
const prompts=JSON.parse(await fs.readFile(path.join(root,'tools/showroom/photo-prompts.json'),'utf8'));
const stage=path.join(root,'tools/showroom/output/photos/webp');
await fs.mkdir(stage,{recursive:true});
if(prompts.items.length!==record.items.length)throw Error('Faltan fotografías del catálogo.');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function bounds(bytes,width,height,channels){
 let left=width,right=-1,top=height,bottom=-1,transparent=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const alpha=bytes[(y*width+x)*channels+channels-1];
  if(alpha===0)transparent++;
  if(alpha>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 }
 if(right<left||bottom<top||transparent<width*height*.08)throw Error('La fotografía no tiene un recorte transparente válido.');
 return{left:left/width*100,right:(width-right-1)/width*100,top:top/height*100,bottom:(height-bottom-1)/height*100};
}
const silhouette=item=>{const b=item.measureBounds;return(100-b.top-b.bottom)/((100-b.left-b.right)*item.imageAspect)};
const updated=[];
const only=new Set((process.argv.find(arg=>arg.startsWith('--only='))?.slice(7)||'').split(',').filter(Boolean));
for(const id of only)if(!record.items.some(item=>item.id===id))throw Error('Producto desconocido: '+id);
for(const item of record.items.filter(item=>!only.size||only.has(item.id))){
 const prompt=prompts.items.find(entry=>entry.id===item.id);
 if(!prompt||!/^output\/photos\/[a-z0-9-]+-v[1-9][0-9]*\.png$/.test(prompt.rawOutput))throw Error('Fotografía desconocida: '+item.id);
 const original=item.photographic?.sourceRender??{renderSHA256:item.renderSHA256,imageAspect:item.imageAspect,measureBounds:item.measureBounds};
 const bytes=await fs.readFile(path.join(root,'tools/showroom',prompt.rawOutput));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const next={...item,imageAspect:info.width/info.height,measureBounds:bounds(data,info.width,info.height,info.channels)};
 if(Math.abs(silhouette(next)/silhouette(original)-1)>.05)throw Error('Revisar proporciones del producto: '+item.id);
 const target=path.join(stage,item.id+'.webp');let result;
 for(const quality of[90,87,84]){result=await sharp(bytes).webp({quality,alphaQuality:100,effort:6}).toFile(target);if(result.size<300_000)break}
 if(result.size>=300_000)throw Error('Imagen demasiado pesada: '+item.id);
 updated.push({...next,bytes:result.size,renderSHA256:digest(await fs.readFile(target)),renderEngine:'Source 3D render with built-in imagegen photographic finish',photographic:{provider:prompts.tool,promptFile:'tools/showroom/photo-prompts.json',rawOutput:prompt.rawOutput,rawSHA256:digest(bytes),sourceRender:original}});
 console.log(item.id+': '+Math.round(result.size/1024)+' KB; proporción conservada.');
}
// Validate every product before replacing current review assets.
for(const item of updated)await fs.copyFile(path.join(stage,item.id+'.webp'),path.join(root,'integration',item.src));
await fs.writeFile(recordPath,JSON.stringify({...record,items:record.items.map(item=>updated.find(next=>next.id===item.id)??item)},null,2)+'\n');
console.log(updated.length+' fotografías individuales optimizadas; portadas originales conservadas.');
