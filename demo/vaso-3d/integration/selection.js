// The original showroom still labels the replaced cup as 8 oz. The current
// supplier catalog identifies that drinking cup as 9 oz; an 8 oz pot is separate.
export function studioSelection({ family, size = '', wall = 'simple' }, available) {
  const ounces = Number(size.match(/^(\d+)\s*oz$/)?.[1] || 0);
  if (family !== 'cup' && family !== 'pot') return { modelId: null, notice: 'El configurador 3D está disponible para vasos y potes. Elegí uno de los modelos disponibles.' };
  const normalized = family === 'cup' && ounces === 8 ? 9 : ounces;
  const chosen = normalized || (family === 'pot' ? 8 : 12);
  const modelId = `${family}-${chosen}oz${family === 'cup' && wall === 'doble' ? '-double' : ''}`;
  if (!available.has(modelId)) return { modelId: null, notice: `El ${family === 'pot' ? 'pote' : 'vaso'} de ${chosen} oz todavía no tiene un modelo 3D disponible. Elegí otro tamaño en el configurador.` };
  return { modelId, notice: family === 'cup' && ounces === 8 ? 'El vaso de 8 oz fue reemplazado por el modelo de 9 oz de Ruida.' : '' };
}
