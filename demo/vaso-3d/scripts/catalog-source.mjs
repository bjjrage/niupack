import ts from 'typescript';

// Read the website's literal data without executing its DOM/showroom code.
export function extractCatalog(source) {
  const file = ts.createSourceFile('showroom.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'cupDimensions') matches.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1 || !ts.isObjectLiteralExpression(matches[0])) throw new Error('No se encontró una tabla cupDimensions única en el catálogo.');
  function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    throw new Error('El catálogo debe contener medidas literales, no expresiones calculadas.');
  }
  function millimetres(value, name) {
    if (value === undefined) return null;
    const number = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(number) || number <= 0) throw new Error(`Medida inválida en el catálogo: ${name}.`);
    return number;
  }
  const seen = new Set();
  return matches[0].properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || !ts.isObjectLiteralExpression(property.initializer)) throw new Error('Formato de modelo no admitido en el catálogo.');
    const match = /^(\d+) oz$/.exec(property.name.text);
    if (!match || seen.has(match[1])) throw new Error('Tamaño de catálogo inválido o duplicado.');
    seen.add(match[1]);
    const fields = {};
    for (const field of property.initializer.properties) {
      if (!ts.isPropertyAssignment(field) || !(ts.isIdentifier(field.name) || ts.isStringLiteral(field.name))) throw new Error('Campo de catálogo no admitido.');
      fields[field.name.text] = literal(field.initializer);
    }
    return {
      id: `cup-${match[1]}oz`, sizeOz: Number(match[1]),
      topDiameterMm: millimetres(fields.diameter, 'boca'),
      heightMm: millimetres(fields.height, 'altura'),
      baseDiameterMm: millimetres(fields.baseDiameter, 'base'),
      approximate: fields.approximate === true,
      sourceWall: fields.sheetType === 'doble' ? 'double' : fields.sheetType === 'simple' ? 'single' : 'unspecified',
    };
  });
}
