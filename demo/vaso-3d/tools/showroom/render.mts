import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCupParts } from '../../src/cup-geometry.mts';
import { CATALOG, catalogModel } from '../../src/catalog.mts';
import type { CupShape } from '../../src/layout.mts';
interface Item {id:string;brand:string;model?:string;front:number;lid?:boolean;alternative?:boolean;visualShape?:CupShape;viewTiltRad?:number}
const items:Item[]=await (await fetch('./manifest.json')).json();
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.setClearColor(0x000000,0);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(environment,.04);environment.dispose();pmrem.dispose();
function paperSurface(){
 const size=1024,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(size,size);
 const hash=(x:number,y:number)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^715;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295};
 function noise(x:number,y:number,period:number){const gx=x/size*period,gy=y/size*period,ix=Math.floor(gx),iy=Math.floor(gy);let u=gx-ix,v=gy-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);const a=hash(ix%period,iy%period),b=hash((ix+1)%period,iy%period),c=hash(ix%period,(iy+1)%period),d=hash((ix+1)%period,(iy+1)%period);return(a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const v=128+noise(x,y,12)*12+noise(x,y,48)*18+noise(x,y,192)*25+(hash(x,y)-.5)*15;pixels.data.set([v,v,v,255],(y*size+x)*4)}
 ctx.putImageData(pixels,0,0);let seed=715;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
 // Short, low-contrast fibres and several noise scales avoid a uniform
 // plastic surface or an obvious repeating noise pattern.
 for(let i=0;i<22000;i++){const x=random()*size,y=random()*size,length=1+random()*9,angle=random()*Math.PI*2;ctx.strokeStyle=random()>.5?'#ffffff24':'#00000020';ctx.lineWidth=.35+random()*.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);ctx.stroke()}
 const height=new THREE.CanvasTexture(canvas),roughCanvas=document.createElement('canvas');roughCanvas.width=roughCanvas.height=size;
 const roughCtx=roughCanvas.getContext('2d')!,rough=ctx.getImageData(0,0,size,size);
 for(let i=0;i<rough.data.length;i+=4){const v=204+(rough.data[i]-128)*.5;rough.data.set([v,v,v,255],i)}roughCtx.putImageData(rough,0,0);
 const roughness=new THREE.CanvasTexture(roughCanvas);
 for(const texture of[height,roughness]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=renderer.capabilities.getMaxAnisotropy()}
 return{height,roughness};
}
function ambientOcclusion(floor:boolean){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;const gradient=floor?ctx.createRadialGradient(128,128,8,128,128,130):ctx.createLinearGradient(0,256,0,0);gradient.addColorStop(0,floor?'#ffffff':'#656565');gradient.addColorStop(floor?.68:.22,floor?'#f4f4f4':'#bebebe');gradient.addColorStop(1,floor?'#858585':'#ffffff');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);const texture=new THREE.CanvasTexture(c);texture.channel=0;return texture}
const surface=paperSurface(),insideOcclusion=ambientOcclusion(false),floorOcclusion=ambientOcclusion(true);
function shapeFor(item:Item):CupShape{
 if(item.model){const m=CATALOG.find(m=>m.id===item.model);if(!m)throw Error('Modelo desconocido: '+item.model);return catalogModel(m)!.shape}
 if(item.visualShape)return item.visualShape;
 // Existing showroom silhouettes only: these three models still lack supplier
 // drawings. These values are never exported as new technical dimensions.
 if(item.id==='cup-single-24oz')return {top:.4445,bottom:.285,height:1.74,printMargin:0};
 if(item.id==='pot-20oz')return {top:.731,bottom:.595,height:.75,printMargin:0};
 throw Error('Sin geometría');
}
async function render(item:Item){
 const pot=item.id.startsWith('pot-'),width=pot?1440:1200,height=pot?960:1800;
 renderer.setSize(width,height,false);
 const shape=shapeFor(item),d=shape.details,total=d?.fullHeight??shape.height+.019,radius=d?.rimOuter??shape.top+.013;
 const scene=new THREE.Scene();scene.environment=env.texture;scene.environmentIntensity=.28;
 scene.add(new THREE.HemisphereLight('#ffffff','#746c61',.20));
 const key=new THREE.DirectionalLight('#fffaf3',2.8);key.position.set(-3,5,5);key.target.position.set(0,total*.5,0);key.castShadow=true;
 key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-1.8;key.shadow.camera.right=key.shadow.camera.top=1.8;key.shadow.camera.near=.1;key.shadow.camera.far=14;key.shadow.bias=-.00008;key.shadow.normalBias=.001;key.shadow.radius=4;
 scene.add(key,key.target);
 const fill=new THREE.DirectionalLight('#f1f5ff',.28);fill.position.set(4,2,3);scene.add(fill);
 const back=new THREE.DirectionalLight('#ffffff',.45);back.position.set(2,4,-3);scene.add(back);
 const texture=await new THREE.TextureLoader().loadAsync('./textures/'+item.id+'.png');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
 const bump=surface.height.clone(),roughness=surface.roughness.clone();
 for(const map of[bump,roughness]){map.repeat.set(Math.PI*(shape.top+shape.bottom)/.55,shape.height/.55);map.needsUpdate=true}
 const exterior=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:texture,bumpMap:bump,bumpScale:.0011,roughnessMap:roughness,roughness:.9,metalness:0,specularIntensity:.3,clearcoat:.045,clearcoatRoughness:.8,sheen:.07,sheenColor:new THREE.Color('#ded4c2'),sheenRoughness:1});
 const paper=new THREE.MeshStandardMaterial({color:'#f7f4ed',bumpMap:bump,bumpScale:.0017,roughnessMap:roughness,roughness:.98});
 const inside=new THREE.MeshStandardMaterial({color:'#e8e1d5',side:THREE.BackSide,bumpMap:bump,bumpScale:.0013,roughnessMap:roughness,roughness:1,aoMap:insideOcclusion,aoMapIntensity:.65});
 const bottom=new THREE.MeshStandardMaterial({color:'#d8d2c7',roughness:.95});
 const parts=createCupParts(shape,{exterior,inside,paper,bottom});
 const floor=parts.group.getObjectByName('inner-floor') as THREE.Mesh;
 const floorMaterial=paper.clone();floorMaterial.color.set('#e8dfcf');floorMaterial.aoMap=floorOcclusion;floorMaterial.aoMapIntensity=.7;floor.material=floorMaterial;
 // Keep UVs continuous across adjacent triangles. The sampler wraps only at
 // the texture boundary, avoiding a smeared strip at an interpolated seam.
 const uv=parts.exterior.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)+item.front-.5);uv.needsUpdate=true;scene.add(parts.group);
 if(['cup-single-4oz','cup-single-6oz','cup-single-9oz','cup-single-12oz','cup-single-24oz'].includes(item.id)){
  // The shared model's foot fold is a zero-height annulus, invisible from
  // above. Give these static catalogue views a small rounded paper hem.
  // The supplied body profile and the configurator geometry stay intact.
  const foldHeight=.022,slope=(shape.top-shape.bottom)/shape.height;
  const cuff=new THREE.Mesh(new THREE.CylinderGeometry(shape.bottom+foldHeight*slope+.0005,shape.bottom+.0005,foldHeight,192,1,true),paper);cuff.position.y=foldHeight/2;cuff.name='base-paper-cuff';parts.group.add(cuff);
  const creaseMaterial=new THREE.MeshStandardMaterial({color:'#bcb4a5',roughness:.95});
  const crease=new THREE.Mesh(new THREE.TorusGeometry(shape.bottom+foldHeight*slope+.0007,.0009,8,192),creaseMaterial);crease.rotation.x=Math.PI/2;crease.position.y=foldHeight;parts.group.add(crease);
  const points:THREE.Vector2[]=[];
  for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;points.push(new THREE.Vector2(shape.bottom-.003+.004*Math.cos(a),.004+.007*Math.sin(a)))}
  const hem=new THREE.Mesh(new THREE.LatheGeometry(points,192),paper);hem.name='visible-base-fold';parts.group.add(hem);
 }
 if(item.lid){
  // Seat the clear lid on the paper roll. The previous flat blue disk and
  // raised ring created a detached translucent halo above the container.
  const plastic=new THREE.MeshPhysicalMaterial({color:'#ffffff',transparent:true,opacity:.10,roughness:.1,metalness:0,clearcoat:1,depthWrite:false});
  const edge=new THREE.Mesh(new THREE.TorusGeometry(radius-.003,.006,16,192),plastic);edge.rotation.x=Math.PI/2;edge.position.y=total-.002;parts.group.add(edge);
  const disk=new THREE.Mesh(new THREE.CircleGeometry(radius-.009,192),plastic);disk.rotation.x=-Math.PI/2;disk.position.y=total-.002;parts.group.add(disk);
 }
 const tilt=item.viewTiltRad??(pot?.33:.20),projectedHeight=total*Math.cos(tilt)+2*radius*Math.sin(tilt),aspect=width/height,frustumHeight=Math.max(projectedHeight,2*radius/aspect)*1.15;
 const camera=new THREE.OrthographicCamera(-frustumHeight*aspect/2,frustumHeight*aspect/2,frustumHeight/2,-frustumHeight/2,.01,100);
 const target=new THREE.Vector3(0,total/2+.025,0);camera.position.set(0,target.y+Math.sin(tilt)*10,Math.cos(tilt)*10);camera.lookAt(target);
 if((document.getElementById('cycles') as HTMLInputElement)?.checked){
  camera.name='showroom-camera';camera.userData={showroomFrameHeight:frustumHeight,showroomFrameWidth:frustumHeight*aspect};const exportScene=new THREE.Scene();exportScene.add(parts.group,camera);exportScene.updateMatrixWorld(true);
  const binary=await new GLTFExporter().parseAsync(exportScene,{binary:true});
  const exported=await fetch('/render-output/'+item.id+'.glb',{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:binary as ArrayBuffer});
  if(!exported.ok)throw Error('No se pudo guardar la escena de Blender');
  scene.add(parts.group);scene.add(camera);
 }
 renderer.render(scene,camera);
 const blob=await new Promise<Blob>((resolve,reject)=>renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('Captura vacía')),'image/png'));
 const saved=await fetch('/render-output/'+item.id+'.png',{method:'POST',headers:{'Content-Type':'image/png'},body:blob});if(!saved.ok)throw Error('No se pudo guardar el render');
 const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=URL.createObjectURL(blob);image.alt=item.brand+' · '+item.id;caption.textContent=item.id+' · '+item.brand;
 if((document.getElementById('compare') as HTMLInputElement)?.checked){const comparison=document.createElement('div');comparison.className='comparison';const before=document.createElement('img');before.src='./output/realism-before/'+item.id+'.webp';before.alt='Anterior · '+item.brand;comparison.append(before,image);figure.append(comparison);const labels=document.createElement('p');labels.className='comparison-labels';labels.textContent='Anterior · Papel y luz de estudio';figure.append(labels)}else figure.append(image);
 figure.append(caption);document.getElementById('results')!.append(figure);
 const usedMaterials=new Set<THREE.Material>();parts.group.traverse(object=>{if(object instanceof THREE.Mesh){const ms=Array.isArray(object.material)?object.material:[object.material];ms.forEach(m=>usedMaterials.add(m))}});
 parts.disposeGeometry();texture.dispose();bump.dispose();roughness.dispose();usedMaterials.forEach(m=>m.dispose());scene.traverse(object=>{if(object instanceof THREE.DirectionalLight)object.shadow.dispose()});
}
async function run(mode:'pilot'|'all'|'corrections'|'bases'|'espresso'|'alvica'){const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);document.getElementById('results')!.replaceChildren();try{const ids=mode==='alvica'?['cup-double-9oz']:mode==='espresso'?['cup-single-4oz']:mode==='pilot'?['cup-single-9oz','cup-double-12oz','pot-8oz']:mode==='corrections'?['cup-single-4oz','cup-single-12oz','cup-single-24oz','pot-20oz']:mode==='bases'?['cup-single-6oz','cup-single-9oz']:null;const selected=ids?items.filter(i=>ids.includes(i.id)):items;for(const item of selected){document.getElementById('status')!.textContent='Preparando '+item.id+'…';await render(item)}document.getElementById('status')!.textContent=selected.length+' renders terminados.'}catch(error){document.getElementById('status')!.textContent='Error: '+String(error)}finally{buttons.forEach(b=>b.disabled=false)}}
document.getElementById('pilot')!.addEventListener('click',()=>run('pilot'));document.getElementById('all')!.addEventListener('click',()=>run('all'));document.getElementById('corrections')!.addEventListener('click',()=>run('corrections'));
document.getElementById('bases')!.addEventListener('click',()=>run('bases'));

document.getElementById('espresso')!.addEventListener('click',()=>run('espresso'));

document.getElementById('alvica')!.addEventListener('click',()=>run('alvica'));
