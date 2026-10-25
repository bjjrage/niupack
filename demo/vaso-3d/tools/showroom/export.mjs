import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import crypto from 'node:crypto';import sharp from 'sharp';
const root=fileURLToPath(new URL('../../',import.meta.url));
const manifests=JSON.parse(await fs.readFile(path.join(root,'tools/showroom/manifest.json'),'utf8'));
const onlyArgument=process.argv.find(value=>value.startsWith('--only='));
const only=onlyArgument?new Set(onlyArgument.slice(7).split(',')):null;
const cycles=process.argv.includes('--cycles');
if(only)for(const id of only)if(!manifests.some(item=>item.id===id))throw Error('Producto desconocido: '+id);
const out=path.join(root,'integration/showroom');await fs.mkdir(out,{recursive:true});
const tiles=[],data=[];
function bbox(raw,width,height,channels){let left=width,right=0,top=height,bottom=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(raw[(y*width+x)*channels+channels-1]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}return{left:+(left/width*100).toFixed(2),right:+((width-right-1)/width*100).toFixed(2),top:+(top/height*100).toFixed(2),bottom:+((height-bottom-1)/height*100).toFixed(2)}}
for(let i=0;i<manifests.length;i++){
 const item=manifests[i],input=path.join(root,'tools/showroom/output',cycles?'cycles':'',item.id+'.png'),bytes=await fs.readFile(input),{data:raw,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const file=item.id+'.webp';const result=only&&!only.has(item.id)?{size:(await fs.stat(path.join(out,file))).size}:await sharp(bytes).webp({quality:90,alphaQuality:100,effort:6}).toFile(path.join(out,file));
 data.push({...item,top:undefined,bottom:undefined,topPoints:undefined,topCurves:undefined,bottomCurves:undefined,renderEngine:cycles?'Blender Cycles':'Three.js WebGL',src:'showroom/'+file,imageAspect:info.width/info.height,measureBounds:bbox(raw,info.width,info.height,info.channels),bytes:result.size,renderSHA256:crypto.createHash('sha256').update(await fs.readFile(path.join(out,file))).digest('hex')});
 const thumb=await sharp(bytes).resize(350,380,{fit:'contain',background:'#f6f4ef'}).flatten({background:'#f6f4ef'}).png().toBuffer();
 const label=Buffer.from('<svg width="390" height="60"><rect width="390" height="60" fill="white"/><text x="12" y="23" font-size="16" font-family="Arial">'+item.id+'</text><text x="12" y="47" font-size="15" font-family="Arial">'+item.brand.replace(/&/g,'&amp;')+'</text></svg>');tiles.push({input:thumb,left:(i%4)*390+20,top:Math.floor(i/4)*450+60},{input:label,left:(i%4)*390,top:Math.floor(i/4)*450});
}
await sharp({create:{width:1560,height:Math.ceil(manifests.length/4)*450,channels:3,background:'#ddd'}}).composite(tiles).jpeg({quality:93}).toFile(path.join(root,'tools/showroom/output/renders-review.jpg'));
// Covers belong to the original website. Export individual products only.
await fs.writeFile(path.join(root,'data/showroom-artwork.json'),JSON.stringify({version:1,status:'Local visual review; not approved for publication',authority:'User-approved mapping, with Quattro D 4 oz attachment replacing the proposed Coffee Shop adaptation.',items:data},null,2)+'\n');
console.log(data.map(x=>({id:x.id,kb:Math.round(x.bytes/1024),bounds:x.measureBounds})));
