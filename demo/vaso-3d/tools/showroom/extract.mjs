import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import mupdf from 'mupdf';
import sharp from 'sharp';
const {values}=parseArgs({options:{source:{type:'string'},'four-oz':{type:'string'}}});
if(!values.source||!values['four-oz'])throw Error('Uso: node extract.mjs --source CARPETA_ARTES --four-oz ARCHIVO_HEYLIFE');
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
await mkdir(new URL('./textures/',import.meta.url),{recursive:true});
function curve([a,b,c,d],t){const q=1-t;return[q*q*q*a[0]+3*q*q*t*b[0]+3*q*t*t*c[0]+t*t*t*d[0],q*q*q*a[1]+3*q*q*t*b[1]+3*q*t*t*c[1]+t*t*t*d[1]]}
function edge(curves,t){const i=Math.min(curves.length-1,Math.floor(t*curves.length));return curve(curves[i],Math.min(1,t*curves.length-i))}
for(const item of manifest){
 const filename=item.id==='cup-single-4oz'?resolve(values['four-oz']):resolve(values.source,item.file);
 const bytes=await readFile(filename);
 if(createHash('sha256').update(bytes).digest('hex')!==item.sourceSHA256)throw Error('El PDF cambió; revisar sus curvas antes de reutilizar el recorte: '+item.file);
 const doc=mupdf.Document.openDocument(new Uint8Array(bytes),'application/pdf'),page=doc.loadPage(item.sourcePage-1),scale=5,pix=page.toPixmap([scale,0,0,scale,0,0],mupdf.ColorSpace.DeviceRGB,false,false);
 const {data,info}=await sharp(pix.asPNG()).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const width=item.textureWidth,height=item.textureHeight,pixels=Buffer.alloc(width*height*3),margin=item.alternative?.02:.024;
 for(let x=0;x<width;x++){
  const u=margin+(1-margin*2)*x/(width-1),a=edge(item.topCurves,u),b=edge(item.bottomCurves,u);
  for(let y=0;y<height;y++){
   const v=.006+.982*y/(height-1),px=((1-v)*a[0]+v*b[0])*scale,py=((1-v)*a[1]+v*b[1])*scale;
   const ix=Math.max(0,Math.min(info.width-2,Math.floor(px))),iy=Math.max(0,Math.min(info.height-2,Math.floor(py))),fx=px-ix,fy=py-iy;
   for(let c=0;c<3;c++)pixels[(y*width+x)*3+c]=Math.round((1-fy)*((1-fx)*data[(iy*info.width+ix)*3+c]+fx*data[(iy*info.width+ix+1)*3+c])+fy*((1-fx)*data[((iy+1)*info.width+ix)*3+c]+fx*data[((iy+1)*info.width+ix+1)*3+c]));
  }
 }
 await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(new URL('./textures/'+item.id+'.png',import.meta.url));
 pix.destroy();page.destroy();doc.destroy();console.log('Preparado: '+item.id);
}
