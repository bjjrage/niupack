export function validateSupplierData(data) {
  if (data.units !== 'mm' || !Array.isArray(data.models) || data.models.length === 0) throw new Error('Se requieren modelos de proveedor en milímetros.');
  const ids = new Set();
  for (const model of data.models) {
    if (!model.id || ids.has(model.id)) throw new Error('Modelo ausente o duplicado.');
    ids.add(model.id);
    if (!['cup', 'pot'].includes(model.family) || !['single', 'double'].includes(model.wall)) throw new Error('Familia o pared no admitida.');
    const fields = ['sizeOz', 'heightMm', 'rimOuterDiameterMm', 'footDiameterMm', 'bottomFormingDiameterMm', 'rollDiameterMm', 'bottomRecessMm', 'rimDropMm'];
    fields.push(...(model.wall === 'single' ? ['mouthInnerDiameterMm', 'wallAngleDeg', 'paperThicknessMm'] : ['innerWallAngleDeg', 'sleeveAngleDeg', 'innerPaperThicknessMm', 'sleeveThicknessMm', 'exposedBaseHeightMm', 'sleeveBottomRollDiameterMm']));
    for (const field of fields) if (typeof model[field] !== 'number' || !Number.isFinite(model[field]) || model[field] <= 0) throw new Error('Medida inválida: ' + model.id + '.' + field);
    if (model.footDiameterMm >= model.rimOuterDiameterMm || model.rimDropMm >= model.heightMm || model.bottomRecessMm >= model.heightMm) throw new Error('Perfil invertido: ' + model.id);
    if (!model.source?.file || model.source.page !== 1 || !/^[a-f0-9]{64}$/.test(model.source.sha256)) throw new Error('Falta procedencia del plano.');
    for (const field of ['outerRadiusMm', 'innerRadiusMm', 'angleDeg', 'radialWidthMm']) if (!Number.isFinite(model.die?.[field]) || model.die[field] <= 0) throw new Error('Falta cota del desarrollo.');
  }
  for (const model of data.models.filter((m) => m.wall === 'double')) {
    const inner = data.models.find((m) => m.id === model.innerModelId);
    if (!inner || inner.wall !== 'single' || inner.family !== 'cup' || inner.sizeOz !== model.sizeOz || inner.heightMm !== model.heightMm || inner.footDiameterMm !== model.footDiameterMm) throw new Error('El vaso interior no coincide con la ficha de pared doble.');
  }
  return data.models;
}
