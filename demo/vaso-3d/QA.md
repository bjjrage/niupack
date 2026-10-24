# Evidencia de validación · 23 de octubre de 2026

## Bases estimadas autorizadas y cambio de tamaño · 24 de octubre de 2026

El usuario autorizó asumir las bases faltantes para la demo. Se habilitaron los siete tamaños como aproximados: base = 2/3 de la boca, redondeada a 0,1 mm, a partir de la proporción del prototipo anterior. La fuente importada mantiene sus null; las estimaciones no se escriben en el catálogo ni en el OS. La geometría del cuerpo, interior, bordes y fondo, el desarrollo Logo y la banda 360° ahora reciben las mismas dimensiones seleccionadas. Una base real sustituye la estimación; datos de boca/altura ausentes o medidas inválidas siguen bloqueando el modelo.

**Node 20/20 PASS, build y typecheck PASS; navegador con WebGL real 14/14 PASS.** La nueva regresión recorre los siete modelos con JPG y PNG y comprueba capturas no vacías, conservación de fuentes y estado, cobertura sin huecos de una banda opaca y siluetas distintas de 4 y 24 oz. Una segunda regresión alterna Logo y 360° con un PNG disperso en 4/12/24/12 oz y coteja color visible de frente y reverso. Al cambiar la altura del canvas de textura se recrea el recurso GPU, como exige Three.js; se corrigió una textura anterior que podía permanecer en el vaso al cambiar de modo. Las regresiones existentes de ancho independiente, altura, rotación, unión posterior y recuperación del contexto también pasan.

En la interfaz compilada se comprobaron los siete tamaños con el diseño de ejemplo, Diseño 360°, tamaño 90%, x=-137°, y=8%, rotación=-9° y ancho 360° activo: los valores no se reinician. Se inspeccionaron visualmente el vaso bajo de 4 oz y el alto de 24 oz, la tabla con bases estimadas y las notas de origen. Sin errores ni advertencias en consola. La pestaña anterior con Café Rojo se conservó; la versión nueva se abrió en otra pestaña para evitar perder ese estado.

Evidencia en `qa/artifacts/`: `catalog-approx-4oz.png`, `catalog-approx-24oz.png`, `catalog-approx-ui-state.json` y `catalog-approx-webgl.txt`. La sección siguiente documenta el estado anterior a la autorización de estimar, ya reemplazado. Todo continúa limitado a la demo local.

## Selector de tamaños del catálogo · 24 de octubre de 2026

**18/18 pruebas de Node PASS; build y typecheck PASS.** Se importan 4/6/8/12/16/21/24 oz desde la tabla del showroom mediante análisis sintáctico, sin ejecutarla. Se cotejan los datos generados con la fuente y se rechazan tablas ambiguas, tamaños duplicados, expresiones calculadas y medidas inválidas.

Los siete formatos no incluyen diámetro de base: sus opciones están deshabilitadas. Se conservan las notas de 4 oz aproximado y 16/21/24 oz con medidas de pared doble. La tabla desplegable muestra los números originales, incluido 12 oz con boca 83,8 mm y altura 110 mm; ninguna base fue estimada ni tomada de los seeds del OS. Solo se conserva disponible la geometría ilustrativa anterior, identificada como Modelo de prueba; la descarga también lleva `demo` en su nombre.

En el build del puerto 4173 se cargó el archivo local Café Rojo (PNG 1800 × 1100), se seleccionó Diseño 360°, tamaño 90%, x=-180°, y=8%, rotación=-9° y ajuste de ancho completo activo. Se comparó ese estado antes y después de seleccionar la opción ilustrativa y recorrer el selector con teclado: archivo y todos los ajustes idénticos. Las siete opciones comerciales continúan deshabilitadas. Se inspeccionó visualmente el diseño en el vaso y las medidas de la tabla. Consola de esta comprobación: sin errores ni advertencias.

Evidencia en `qa/artifacts/`: `catalog-state-preservation.json`, `catalog-options-and-measures.txt` y `catalog-selector-desktop.png`. El motor y el mapeo no fueron modificados. No se puede probar un cambio entre tamaños comerciales reales hasta contar con fichas completas y conectar sus geometrías; ese límite se muestra en la interfaz. Los cambios siguen restringidos al demo.

## Adaptación a la identidad de NIU PACK · 24 de octubre de 2026

Se comparó la página publicada `https://bjjrage.github.io/niupack/` con su hoja `css/styles.css`. La demo adopta Montserrat, el rojo de marca, la cabecera con logo blanco y navegación, la ubicación dentro del sitio, los botones de esquinas suaves y el pie de marca. El plan de accesos y publicación está en `INTEGRACION.md`; todavía no se ejecutó.

Build y typecheck: PASS. La página y la fuente local responden HTTP 200; la fuente se sirve como `font/woff2`. La misma URL local se utiliza en la precarga y en el CSS. No se agregaron solicitudes a Google Fonts en tiempo de ejecución. Montserrat se distribuye con su licencia SIL OFL.

Se inspeccionaron los viewports de Chromium de 390 × 844, 820 × 1024 y el escritorio de 1280 px de ancho. Sin desborde horizontal; el título no se superpone al vaso. En tablet y móvil los controles se disponen debajo del visor. En escritorio, su altura se adapta al espacio disponible para mantener visibles los controles de vista. El menú móvil abre, cierra con Escape y cierra al seleccionar el configurador.

Se comprobó en la interfaz el modo Diseño 360°, tamaño 90% y Ajustar ancho a 360° activo. No se observaron errores ni advertencias en consola. Los archivos del motor, materiales, geometría, validación del arte, composición y mapeo no se modificaron; no se repitieron las suites de 13 casos de Node y 12 de WebGL de la validación funcional anterior.

Evidencia local en `qa/artifacts/`: `brand-reference-site.png`, `brand-desktop.png`, `brand-desktop-controls.png`, `brand-mobile.png` y `brand-tablet.png`. Esto es una comprobación responsive en Chromium, no una prueba en teléfonos físicos ni una certificación de accesibilidad. Los cambios están limitados al demo; no se modificaron la web publicada ni el OS.

## Ajustar ancho a 360° · 24 de octubre de 2026

Resultado actual: **build y typecheck PASS; Node 13/13 PASS; navegador con WebGL real 12/12 PASS**. La demo compilada responde HTTP 200 en el puerto 4173; el banco de QA se ejecutó por separado en 4181. Consola final del banco: sin errores ni advertencias.

Se agregó un ajuste explícito y reversible del ancho, separado del tamaño. Normaliza una sola imagen a una vuelta completa y aplica la corrección en el eje horizontal del vaso después de la rotación, por lo que conserva todas sus coordenadas verticales. No agrega motivos repetidos. La composición se comparte entre vista plana, textura 3D y PNG exportado.

Las regresiones nuevas comprueban 25 combinaciones de tamaño (10%, 50%, 90%, 150% y 400%) y posición horizontal (-180°, -90°, 0°, 90° y 180°): ninguna columna de la banda opaca queda vacía, una marca central ocupa exactamente una décima parte de la vuelta sin duplicarse y la altura coincide con el estado previo al ajuste. Las capturas WebGL de frente y reverso comprueban la ubicación de esa marca. Otras seis combinaciones de rotación/posición vertical conservan los límites superior e inferior del arte con tolerancia de un píxel.

En la interfaz del build se cargó `diseno_prueba_cafe_rojo.png` (1800 × 1100), se redujo al 90% y se inspeccionó el reverso antes y después del botón. El espacio central entre los extremos desapareció; tamaño 90%, x=0°, y=0% y rotación=0° se mantuvieron. El botón se puede desactivar sin cambiar el tamaño. Cambiar el tamaño a 89% mantuvo el ajuste activo. Restablecer devolvió 100% y Libre; cambiar a Logo ocultó el control y desactivó el ajuste. Cargar el archivo también restableció el ajuste a Libre. La consola de la interfaz no devolvió errores ni advertencias. El archivo del usuario no se modificó ni se versionó.

Evidencia ignorada por Git en `qa/artifacts/`: `full-width-browser-results.txt`, `full-width-cafe90-before.png` y `full-width-cafe90-after.png`. El ajuste no rellena transparencias del propio archivo ni garantiza continuidad entre extremos incompatibles; la rotación puede dejar esquinas sin cubrir. Solo se modificaron archivos del demo, sin publicación ni cambios en la web pública o el OS.

## Ampliación del control de tamaño · 24 de octubre de 2026

Diseño 360° admite ahora 10% a 400%, frente al rango anterior de 100% a 180%. Solo se cambiaron los límites de la interfaz y su explicación; la composición, el mapeo angular y el ajuste proporcional conservan la implementación validada.

Build y typecheck: PASS. Las 11 pruebas de Node existentes: PASS. En la interfaz del build se comprobaron los extremos de 10% y 400% con el arte de ejemplo y Diseño 360° seleccionado; ambos actualizan la vista plana y el vaso. Cambiar a Logo conserva su rango de 35% a 180%; volver a Diseño 360° recupera 10% a 400%. Restablecer devuelve 100% y mantiene seleccionado Diseño 360°. La consola de esta comprobación no devolvió errores ni advertencias. Evidencia en `qa/artifacts/scale-360-min10.png` y `scale-360-max400.png`. No se repitió el banco completo de carga de archivos/WebGL, cuyo resultado anterior se documenta abajo.

## Resultado

**Build estático y typecheck: PASS. Pruebas de Node: 11/11 PASS. Banco de pruebas de navegador con WebGL real: 10/10 PASS**, con mapeo angular del modo 360° y regresión de alineación horizontal.

Validado localmente en Windows con Node 24.20.0 y Chromium del navegador integrado. Los archivos de imagen de prueba son sintéticos y no contienen datos de clientes.

## Recorrido comprobado en la interfaz

1. El build se sirve en `http://127.0.0.1:4173/demo/vaso-3d/` con HTTP 200; también en `/niupack/demo/vaso-3d/`.
2. Carga real mediante el selector de archivos de `design-flat.jpg` (1200 × 900): se aplica el arte en la superficie cónica y aparece la indicación sobre el fondo del JPG.
3. Los controles de tamaño, altura y rotación actualizan sus valores y el render. La órbita mediante teclado se recorrió más de 360°; restablecer vista devuelve la cámara al encuadre inicial. La inclinación permite inspeccionar el interior.
4. Descarga real mediante el botón: `niupack-vaso-12oz-white.png`, **1600 × 1133 px**, 379731 bytes en la prueba. Se inspeccionó visualmente y mediante estadísticas de píxeles: contiene el vaso, arte y fondo; no está vacío y su canal alfa es opaco.
5. Carga real de `logo-transparent.png` (1000 × 1000) y selección de kraft: el fondo queda transparente y se conserva la superficie kraft alrededor y dentro del logo.
6. Distribución de escritorio a 1365 × 1000 y móvil a 390 × 844. El visor aparece arriba y los controles debajo en móvil. En el build final, `scrollWidth <= innerWidth`, sin desborde horizontal. Se corrigió la superposición entre título, modelo y leyenda inferior en pantalla angosta.

## Banco de pruebas del navegador

La página `qa/browser.html` se ejecutó con Vite en el puerto 4181, separada del build final. Resultado visible: `Finalizado: passed`.

| Prueba | Resultado |
| --- | --- |
| JPG decodificado, aplicado y presente en captura | PASS |
| PNG con transparencia conservada y aplicado sobre kraft | PASS |
| SVG simple decodificado y presente en captura | PASS |
| SVG con script rechazado | PASS |
| JPG dañado rechazado | PASS |
| Archivo mayor a 12 MiB rechazado antes de decodificar | PASS |
| 12 reemplazos sucesivos, liberación de canvas anterior y capturas repetidas | PASS |
| Diseño 360°: cobertura opaca en frente/reverso y cinco desplazamientos por la unión, sin dejar una banda vacía | PASS |
| Una línea horizontal conserva su altura en toda la circunferencia: x=-180,-90,0,90,180° e y=0,8,32%; -180° y +180° producen los mismos píxeles | PASS |
| Pérdida y recuperación WebGL mediante `WEBGL_lose_context`, con arte visible en la captura posterior | PASS |

La recuperación se probó después de reconstruir el mapa de entorno generado en GPU. El registro de consola de esta ejecución final no devolvió errores ni advertencias. En la primera ejecución se observaron advertencias de precisión del compilador gráfico del equipo y una constante de sombras obsoleta; se reemplazó la constante por la vigente, `PCFShadowMap`.

## Pruebas de Node

11 casos: validación de cabeceras y tamaños, UV métrico del logo, conservación de proporciones, sugerencia de modo, separación de coordenadas angulares y altura, cobertura inicial de la banda y escala constante al modificar x, y o rotación. Se incluyen los valores reportados por el usuario: x=-180°, y=32%, y=8% y rotación=-9°.

## Corrección del ajuste a partir de las capturas del usuario

La versión inicial ajustaba toda imagen a un rectángulo frontal de 1.08 × 0.72 unidades. Aumentar ese rectángulo no equivale a envolver el vaso y dejaba una zona grande sin diseño por detrás.

La primera corrección agregó cobertura de toda la plantilla curva, pero seguía girando copias del diseño en sectores: al mover x, la orientación del texto cambiaba por fragmentos. Sus pruebas de cobertura pasaban, pero no comprobaban esa alineación. Las nuevas capturas del usuario mostraron el problema que faltaba validar.

Se reemplazó ese mapeo del modo 360° por coordenadas de ángulo y altura en el cuerpo, sin cambiar vértices, proporciones, luces ni materiales. La textura y la vista plana usan una banda rectangular periódica. Solo el modo Logo mantiene el desarrollo anular. Los UV originales se conservan en una copia inmutable para poder cambiar de modo sin acumular transformaciones.

Desplazar x traslada la banda horizontalmente; desplazar y la traslada verticalmente; ninguno modifica la escala del archivo. La rotación es únicamente la que el usuario solicita con su control. Los extremos de un arte no continuo pueden seguir produciendo una unión visible, y un desplazamiento vertical puede recortar contenido o descubrir papel: son resultados del archivo y la posición elegida, no se intentan ocultar con reescalados automáticos.

Se reprodujo el caso con el archivo local `diseno_prueba_cafe_rojo.png` (1800 × 1100), sin modificar el original y sin versionarlo. Al cargarlo se seleccionó Diseño 360°; se inspeccionaron el frente, el reverso y la vista plana. El recorte necesario para cubrir la superficie se indica en la interfaz. El archivo contiene transparencia: el papel visible dentro de esas áreas pertenece al diseño y no es un fallo de cobertura.

Se agregaron pruebas de regresión independientes del arte del usuario: cobertura inicial con un patrón opaco, centro rojo y extremos azul/verde en las capturas reales de frente y reverso, y una regla roja horizontal que no puede inclinarse o cortarse al recorrer la circunferencia. La altura de esa regla se compara columna por columna para 15 combinaciones de x/y, incluida x=-180° e y=32%. También se comparan todos los píxeles de -180° y +180°. La recuperación WebGL posterior conservó el diseño.

## Aislamiento y privacidad

- Todos los archivos agregados pertenecen a `demo/vaso-3d/`, en la rama `feature/web-3d-cup-configurator` creada desde `main` (base `407236f20b60f8025d3c4876edb59beb3be475c3`).
- La configuración TypeScript del OS se inspeccionó con su propio parser: 415 fuentes y **0 archivos del demo incluidos**. No se modificó ningún archivo existente del OS ni de la web pública. No se ejecutó el build del OS: esta validación comprueba aislamiento, no certifica el estado previo del OS.
- El servidor propio responde 404 a `/src/`, `/.env.local` y accesos fuera de las rutas del demo. Sirve únicamente el build de este módulo.
- El build tiene todas sus dependencias empaquetadas; no usa servicios de carga, IA, analítica ni CDN. CSP del servidor: `connect-src 'none'`. Revisión de fuentes: no hay envío de archivos ni persistencia del arte.
- Build actual aproximado: JS 583.5 kB / 147.9 kB gzip; CSS 14 kB / 4 kB gzip. Las texturas de papel y el ejemplo se generan localmente.
- Sin push, merge, deployment ni enlace agregado a la página pública.

## Evidencia local

Los resultados detallados y las capturas de esta sesión están en `qa/artifacts/` (ignorados por Git): `browser-results.txt`, `desktop-jpg.png`, `desktop-png-kraft.png`, `mobile-final.png`, `interior-view.png`, `desktop-final.png`, `export-jpg.png`. Los archivos para repetir las pruebas están versionados en `qa/fixtures/`.

La validación del mapeo angular está en `band-browser-results.txt`; se guardaron `band-case-minus180-y32.png`, `band-case-minus180-y8-rotminus9.png` y `band-cafe-final.png`. Se repitieron en la interfaz las dos combinaciones de las capturas del usuario; la segunda se inspeccionó mirando el reverso, porque x=-180° coloca ahí el centro del archivo.

## Pendiente antes de producción

Probar con archivos reales de clientes y teléfonos físicos, especialmente Safari en iPhone y Android de gama baja. Los viewports de Chromium no certifican gestos de un dispositivo real, FPS, consumo de batería ni límites térmicos. Falta aprobación visual/comercial del usuario y cualquier integración o publicación está fuera de esta entrega.

No se promete compatibilidad con SVG arbitrarios, eliminación de fondo, recuperación de detalle inexistente, colores de imprenta ni arte final industrial. Son límites explícitos del prototipo.
