// Build-time composition shared by ES/EN/PT. PDF sources and render tools are
// local only; the public site receives optimized static WebP images.
export function showroomMarkup(html) {
  return html.replace(/<article\b[\s\S]*?<\/article>/g, article => {
    if (article.includes('data-cup-card')) {
      return article.replaceAll('8 oz', '9 oz');
    }
    return article;
  });
}

export function showroomScript(source, artwork, models) {
  const products = artwork.items.filter(item => !item.alternative);
  const scales = {'cup-single-4oz':'.60','cup-single-6oz':'.7','cup-single-9oz':'.78','cup-single-12oz':'.88','cup-single-16oz':'.96','cup-single-21oz':'1','cup-single-24oz':'1.04','cup-double-9oz':'.78','cup-double-12oz':'.96','pot-3oz':'.483','pot-5oz':'.483','pot-8oz':'.574','pot-20oz':'.658'};
  const cups = { simple: {}, doble: {} };
  const pots = {};
  const cupDimensions={simple:{'4 oz':{diameter:'69,5',height:'44',approximate:true},'24 oz':{diameter:'91,5',height:'177',approximate:true}},doble:{}};
  const bowlDimensions={'20 oz':{diameter:'149',height:'78',approximate:true}};
  for(const item of products){
    const size=item.id.match(/-(\d+)oz$/)?.[1]+' oz';
    const variant={src:item.src,scale:scales[item.id],imageAspect:item.imageAspect,measureBounds:item.measureBounds,brand:item.brand};
    if(!variant.scale)throw Error('Falta escala para '+item.id);
    const model=models.find(model=>model.id===item.model);
    const dimensions=model?{diameter:String(model.rimOuterDiameterMm).replace('.',','),height:String(model.heightMm).replace('.',',')}:null;
    if(item.id.startsWith('pot-')){pots[size]=variant;if(dimensions)bowlDimensions[size]=dimensions;}
    else{const wall=item.id.includes('-double-')?'doble':'simple';cups[wall][size]=variant;if(dimensions)cupDimensions[wall][size]=dimensions;}
  }
  function replaceRequired(pattern,replacement){if(!pattern.test(source))throw Error('Cambió la estructura del showroom: '+pattern);source=source.replace(pattern,replacement);}
  // Keep each original "all" variant, including its image source, scale and
  // any future cover settings. Only the individually selected sizes change.
  function originalCovers(block, count) {
    const covers=[...block.matchAll(/^\s*all:\s*(\{[^\n]*\}),\s*$/gm)].map(match=>match[1]);
    if(covers.length!==count)throw Error('No se pudieron conservar las portadas originales del showroom.');
    return covers;
  }
  const entries=variants=>JSON.stringify(variants).slice(1,-1);
  replaceRequired(/const cupImages = \{[\s\S]*?\n      \};/,block=>{
    const covers=originalCovers(block,2);
    return `const cupImages = {simple:{all:${covers[0]},${entries(cups.simple)}},doble:{all:${covers[1]},${entries(cups.doble)}}};`;
  });
  replaceRequired(/const bowlImages = \{[\s\S]*?\n      \};/,block=>{
    const [cover]=originalCovers(block,1);
    return `const bowlImages = {all:${cover},${entries(pots)}};`;
  });
  replaceRequired(/const cupDimensions = \{[\s\S]*?\n      \};/,'const cupDimensions = '+JSON.stringify(cupDimensions)+';');
  replaceRequired(/const bowlDimensions = \{[\s\S]*?\n      \};/,'const bowlDimensions = '+JSON.stringify(bowlDimensions)+';');
  source=source.replaceAll('cupDimensions[size]','cupDimensions[type]?.[size]');
  source=source.replace("const isPortuguese = document.documentElement.lang === 'pt-BR';", "const isPortuguese = document.documentElement.lang === 'pt-BR';\n  const formatDimension = value => isEnglish ? String(value).replace(',', '.') : value;")
    .replaceAll('${dimensions.diameter}', '${formatDimension(dimensions.diameter)}')
    .replaceAll('${dimensions.height}', '${formatDimension(dimensions.height)}');
  source=source.replace("'Medidas aproximadas; ficha técnica específica do copo de 4 oz pendente.'",'`Medidas aproximadas; ficha técnica específica do copo de ${size} pendente.`')
    .replace("'Approximate dimensions; specific 4 oz cup technical sheet pending.'",'`Approximate dimensions; specific ${size} cup technical sheet pending.`')
    .replace("'Medidas aproximadas; ficha técnica específica del vaso de 4 oz pendiente.'",'`Medidas aproximadas; ficha técnica específica del vaso de ${size} pendiente.`');
  // Brands are identical across languages; the surrounding product selection
  // remains in the language of the original showroom controls.
  source=source.replaceAll('currentImage.alt = selection;',"currentImage.alt = variant.brand ? selection + ' · ' + variant.brand : selection;")
    .replaceAll('incoming.alt = selection;',"incoming.alt = variant.brand ? selection + ' · ' + variant.brand : selection;");
  return source;
}

export function showroomControls(source) {
  const sizes=/const cupSizes = \{[\s\S]*?\n  \};/;
  if(!sizes.test(source))throw Error('No se encontró la lista de tamaños del vaso.');
  return source.replace(sizes,block=>block.replaceAll("'8 oz'","'9 oz'"));
}
