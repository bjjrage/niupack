# Design QA - familia NIU roja y blanca

- Scope: imagen general de categoria y vasos de pared simple de 4, 6, 8, 12, 16, 21 y 24 oz.
- Direction: todos los vasos exclusivamente rojos y blancos, con patrones distintos y stamping irregular `niu`.
- Automated browser comparison: bloqueada porque la pagina local usa `file://`.

**Assets implemented**

- Categoria: composicion compacta de siete vasos NIU, sin marcas externas.
- 4 oz: ondas organicas blancas.
- 6 oz: diagonales con micro-sellos irregulares.
- 8 oz: estampas tipograficas sobredimensionadas.
- 12 oz: arcos concentricos con pequenos sellos.
- 16 oz: lineas de contorno, acabado glossy.
- 21 oz: tipografia recortada y trama de puntos, acabado glossy.
- 24 oz: bandas diagonales con repeticion `niu`, acabado glossy.

**Technical validation**

- Los ocho activos son PNG con canal alfa real.
- Los archivos anteriores se conservaron; las nuevas versiones usan nombres versionados.
- Se recalcularon los contornos alfa de los siete vasos para mantener alineadas las cotas.
- La relacion especial del vaso de 16 oz se actualizo a `1079 / 1458`.
- Los tres idiomas apuntan a la misma nueva composicion de categoria.
- JavaScript validado con `node --check`; formato validado con `git diff --check`.

final result: blocked
