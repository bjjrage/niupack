import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {showroomMarkup,showroomScript,showroomControls} from '../scripts/showroom-artwork.mjs';
const artwork=JSON.parse(await readFile(new URL('../data/showroom-artwork.json',import.meta.url),'utf8'));
const models=JSON.parse(await readFile(new URL('../data/supplier-models.json',import.meta.url),'utf8')).models;
test('every approved showroom size has an optimized render with source provenance',async()=>{
 assert.equal(artwork.items.filter(item=>!item.alternative).length,13);
 assert.equal(artwork.items.find(item=>item.id==='cup-single-4oz').file,'Vaso 4oz heylife.pdf');
 for(const item of artwork.items){
  assert.match(item.sourceSHA256,/^[a-f0-9]{64}$/);assert.equal(item.sourcePage,1);
  const file=await readFile(new URL('../integration/'+item.src,import.meta.url));
  assert.equal(file.subarray(0,4).toString(),'RIFF');assert.equal(file.subarray(8,12).toString(),'WEBP');
  assert.ok(file.length<300_000,item.id+' supera el presupuesto de imagen');
  assert.equal(createHash('sha256').update(file).digest('hex'),item.renderSHA256);
  assert.ok(item.measureBounds.left+item.measureBounds.right<70);
  assert.ok(item.measureBounds.top+item.measureBounds.bottom<65);
  if(!item.approximate)assert.ok(models.some(model=>model.id===item.model),item.id+' necesita una geometría verificada');
 }
});

test('the Heylife espresso cup is shorter than the previous 4 oz and the 6 oz, with less taper',()=>{
 const item=artwork.items.find(item=>item.id==='cup-single-4oz');
 const six=artwork.items.find(item=>item.id==='cup-single-6oz');
 const visibleHeight=entry=>100-entry.measureBounds.top-entry.measureBounds.bottom;
 const b=item.measureBounds,shape=item.visualShape,revision=item.visualRevision;
 const projectedAspect=visibleHeight(item)/((100-b.left-b.right)*item.imageAspect);
 // Portrait images share the same contain frame. Include display scale when
 // comparing their actual visible height, rather than the PNG dimensions.
 assert.ok(visibleHeight(item)*revision.displayScale <= visibleHeight(revision.previousPhoto)*revision.previousPhoto.displayScale*.90,
  'The revised 4 oz must display at least 10% shorter than the prior version');
 assert.ok(visibleHeight(item)*revision.displayScale <= visibleHeight(six)*.7*.90,
  'The espresso cup must be visibly smaller than the 6 oz');
 assert.ok(projectedAspect>=.98&&projectedAspect<=1.12,'Keep an espresso cup silhouette, not a squat pot');
 assert.ok(shape.bottom/shape.top>=.80,'Keep a proportionally broader base');
 assert.ok((shape.top-shape.bottom)/shape.height < (.331-.2315)/.70,'Shortening must also reduce the taper angle');
});
test('photographic finishes retain every product silhouette and document the original render',()=>{
 const ratio=item=>{const b=item.measureBounds;return(100-b.top-b.bottom)/((100-b.left-b.right)*item.imageAspect)};
 for(const item of artwork.items){
  assert.equal(item.photographic.provider,'Built-in imagegen');
  assert.match(item.photographic.rawSHA256,/^[a-f0-9]{64}$/);
  const original=item.photographic.sourceRender;
  assert.match(original.renderSHA256,/^[a-f0-9]{64}$/);
  assert.ok(Math.abs(ratio(item)/ratio(original)-1)<.05,item.id+' cambió las proporciones del producto');
 }
});

test('Alvica uses a balanced frontal projection while retaining the supplied double-wall model',()=>{
 const item=artwork.items.find(item=>item.id==='cup-double-9oz');
 const model=models.find(model=>model.id===item.model);
 assert.equal(model.id,'cup-9oz-double');
 assert.equal(model.heightMm,87);assert.equal(model.rimOuterDiameterMm,77.83);
 assert.equal(item.visualShape,undefined,'A photographic correction must not override the supplier geometry');
 const ratio=entry=>{const b=entry.measureBounds;return(100-b.top-b.bottom)/((100-b.left-b.right)*entry.imageAspect)};
 assert.ok(ratio(item)<=ratio(item.visualRevision.previousPhoto)*.96,'The revised photograph must visibly reduce the elongated projection');
 assert.ok(Math.abs(ratio(item)/ratio(item.photographic.sourceRender)-1)<.03,'The photo must retain the corrected model projection');
});

test('all languages preserve their original product covers while updating individual cup sizes',async()=>{
 for(const file of ['index.html','en.html','pt.html']){
  const source=await readFile(new URL('../../../'+file,import.meta.url),'utf8'),html=showroomMarkup(source);
  const images=markup=>[...markup.matchAll(/<img\b[^>]*>/g)].map(match=>match[0]);
  assert.deepEqual(images(html),images(source),'All original page images, including product covers, must remain intact in '+file);
  assert.doesNotMatch(html,/showroom\/(?:cups-single-all|cups-double-all|pots-all)\.webp/);
  const cups=html.match(/<article\b[^>]*data-cup-card[\s\S]*?<\/article>/g)!.join('');
  assert.doesNotMatch(cups,/8 oz/);
  const lids=source.match(/<article\b[^>]*data-lid-card[\s\S]*?<\/article>/)![0];assert.ok(html.includes(lids));
 }
});
test('generated showroom uses wall-specific real dimensions and preserves carousel wiring',async()=>{
 const source=await readFile(new URL('../../../js/showroom.js',import.meta.url),'utf8');
 const script=showroomScript(source,artwork,models);new Script(script);
 function covers(code){
  const context={image:{getAttribute:()=> 'original-markup-cover.png'}};
  const cups=new Script('('+code.match(/const cupImages = (\{[\s\S]*?\});/)![1]+')').runInNewContext(context);
  const pots=new Script('('+code.match(/const bowlImages = (\{[\s\S]*?\});/)![1]+')').runInNewContext(context);
  return JSON.parse(JSON.stringify([cups.simple.all,cups.doble.all,pots.all]));
 }
 assert.deepEqual(covers(script),covers(source),'Selecting All must use the original covers and scales for single cups, double cups and pots');
 assert.doesNotMatch(script,/showroom\/(?:cups-single-all|cups-double-all|pots-all)\.webp/);
 assert.match(script,/showroom\/cup-single-4oz.webp/);assert.match(script,/showroom\/cup-single-9oz.webp/);
 assert.match(script,/showroom\/cup-double-9oz.webp/);assert.match(script,/showroom\/pot-8oz.webp/);
 assert.doesNotMatch(script,/assets\/showroom\/(?:cup-single|cup-double|bowl-icecream)-/);
 assert.match(script,/cupDimensions\[type\]\?\.\[size\]/);
 assert.match(script,/custom-select-change/);assert.match(script,/positionBowlRail/);
 assert.match(script,/assets\/showroom\/lid-spout-8oz/);
 const controls=showroomControls(await readFile(new URL('../../../js/main.js',import.meta.url),'utf8'));
 const cups=controls.match(/const cupSizes = \{[\s\S]*?\n  \};/)![0];
 assert.match(cups,/'9 oz'/);assert.doesNotMatch(cups,/'8 oz'/);
 assert.match(controls,/viajera: \[allSizesLabel, '8 oz'/);
});
