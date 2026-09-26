# Design QA - escala de Potes y bowls

- Visual target: seccion existente del showroom `Potes y bowls`.
- Requested change: reducir proporcionalmente 30% todos los productos de la seccion.
- States covered: categoria, 3 oz, 5 oz, 8 oz y 20 oz.
- Implementation screenshot: no disponible despues del cambio; la automatizacion del navegador no admite la pagina local `file://`.

**Fix implemented**

- Se aplico un factor unico `0.70` a los cinco estados visuales.
- Las escalas pasaron de `1 / .69 / .69 / .82 / .94` a `.70 / .483 / .483 / .574 / .658`.
- Las cotas conservan su posicion proporcional porque comparten la misma transformacion que el producto.
- Vasos, navegacion, panel de detalles, textos y activos originales permanecen sin cambios.
- Se incremento la version del script para evitar que el navegador conserve la escala anterior en cache.

**Verification**

- Sintaxis JavaScript: comprobada con `node --check`.
- Diferencia matematica: 30% exacto en cada estado.
- Comparacion visual posterior: bloqueada hasta recargar la pagina local y obtener una captura nueva.

final result: blocked
