# Evidencia de validación · 23 de octubre de 2026

## Hover de papel y aplicación · 24 de octubre de 2026

Blanco, Kraft, Frente 180° y Diseño 360° tienen transición de fondo/borde, sombra y elevación de 1 px con mouse. El hover seleccionado usa un fondo más intenso; no modifica `aria-pressed`. Solo se aplica a botones habilitados con puntero fino y capacidad de hover. La preferencia de movimiento reducido conserva la regla global que elimina transiciones.

Typecheck y build integrado: PASS. Verificación real con mouse de ambos papeles y ambos modos; Kraft no seleccionado bajo el puntero mantuvo `aria-pressed=false` con el hover visible. Se conservaron el ejemplo y los controles. También se actualizó, solo en la copia local, el selector de la animación de entrada del hero para que apunte a `hero-video-visual` tras reemplazar la tarjeta anterior. Evidencia: `qa/artifacts/toolbar-hover.jpg`.

## Corrección de ubicación del video · 24 de octubre de 2026

Se retiró del hero integrado el contenedor anterior `hero-visual`, cuyo pseudo-elemento rojo sobresalía detrás del video. El nuevo `hero-video-visual` no hereda ese fondo ni la alineación vertical centrada. La grilla alinea sus columnas arriba y el video comienza a la altura del título. La sombra se redujo.

Generador de vista integrada: PASS. Navegador a 1280 px: título en y=123,56 y video en y=123,55; cero contenedores `hero-visual` o `hero-product-card` dentro del hero y `::before` sin contenido. Video 707,64 × 398,05 (16:9), readyState 4, reproducción activa y sin desborde horizontal. Captura local ignorada: `qa/artifacts/hero-video-aligned-desktop.jpg`. Se corrigieron únicamente el generador y CSS de la demo, sin alterar el motor 3D ni publicar.

## Video ampliado en el hero · 24 de octubre de 2026

La portada integrada reemplaza la tarjeta estática por el MP4 aportado por el usuario: 1280 × 720, 24 fps, 15,04 segundos, 8,22 MB. La copia mantiene el mismo SHA-256 que el original. El realce reversible de color usa saturación 1,15 y contraste 1,04 en CSS. Se añadió un poster capturado del video y un control accesible para pausar/reanudar; el video se reproduce sin sonido, en bucle y dentro de la página.

**Typecheck, build integrado y 26/26 pruebas existentes de Node: PASS.** En navegador el video alcanzó readyState 4, sin error de medios, con dimensiones nativas correctas, silencio y bucle activos. Pausar y reanudar mediante teclado actualizó estado y etiqueta. Al desplazarse hasta el configurador se pausó el video y el configurador inició correctamente (`ready`). Consola sin errores ni advertencias.

Escritorio 1440 × 900: video de 802,11 × 451,17 px; móvil 390 × 844: 343 × 192,94 px. Ambas medidas conservan 16:9 y no hay desborde horizontal. La tarjeta anterior ya no está en el hero de la copia local. La preferencia de movimiento reducido impide el inicio automático por implementación; no se emuló esa preferencia en esta revisión. Evidencia local ignorada: `qa/artifacts/hero-video-desktop.jpg` y `hero-video-mobile.jpg`. Solo se modificaron fuentes y recursos de la demo; no se publicó ni se tocó el OS.

## Presupuesto por WhatsApp en lugar de descarga · 24 de octubre de 2026

Se sustituyó Descargar vista PNG por el enlace **Pedí presupuesto**, con el ícono de WhatsApp junto al texto. Se reutilizó el SVG presente en el sitio original. Apunta al comercial **+595 971 350619**, abre otra pestaña y prepara modelo y papel en el mensaje. No incluye archivo, nombre del arte ni píxeles; el envío queda a cargo del cliente en WhatsApp. Se retiraron el handler de descarga y su estado `saving` de la aplicación. La captura del motor continúa solo como utilidad de QA, sin acceso de descarga en la interfaz.

**Typecheck, build integrado y 26/26 pruebas de Node: PASS.** En el build se verificó el enlace `wa.me/595971350619`, texto Pedí presupuesto, SVG contiguo, `target=_blank` y `rel=noopener noreferrer`. La interfaz no contiene el botón anterior, texto Descargar vista PNG ni atributos `download`; `src/main.mts` tampoco contiene captura, creación de enlace de descarga ni estado de guardado. Cambiar de vaso 12 oz blanco a pote 8 oz Kraft actualizó correctamente el mensaje preparado, manteniendo el ejemplo en el visor.

Captura visual en escritorio con botón e ícono visibles. En móvil 390 × 844, el enlace tiene 309 px y el ícono queda a 9 px del texto, sin desborde horizontal. Consolas sin errores ni advertencias. Se verificaron URL y presentación sin abrir WhatsApp ni enviar mensajes. El enlace estático permite contactar al comercial incluso antes de iniciar el visor. No se repitió la suite del motor porque no se modificó su composición ni geometría.

Evidencia local ignorada: `qa/artifacts/quote-whatsapp-desktop.png`. Se conservaron las pestañas con arte del usuario. Todo permanece únicamente en la demo, sin publicar ni tocar el OS.

## Tipo y tamaño en dos bloques · 24 de octubre de 2026

El desplegable nativo largo se reemplazó por dos controles paralelos: Tipo de envase (vaso simple, vaso doble, pote simple) y Tamaño (solo las medidas disponibles de ese tipo). Se retiraron Pendientes de ficha, 4 oz y 24 oz del selector. Su falta de medidas continúa bloqueando esos IDs internamente; no se habilitaron modelos nuevos. Los controles y opciones usan Montserrat, sin la cursiva ni la tipografía del menú nativo del sistema.

**Typecheck, build integrado y 26/26 pruebas de Node: PASS.** En la portada compilada se comprobó selección por mouse y teclado: flechas y Enter pasan de simple 12 a doble 12, Home elige doble 9, Escape cierra sin cambiar el modelo y Tab cierra el menú y continúa al papel. Pote inicia en 8 oz cuando la medida anterior no existe; elegir 5 oz por mouse actualiza ambos controles. Tamaño del arte 150% y duplicación activa se conservaron durante esos cambios. El botón del showroom para Potes sincronizó Tipo de envase y Tamaño con pote 8 oz.

DOM comprobado: diez modelos reales en el estado canónico oculto, sin opciones pendientes. Menús de 120 px para tres tipos/potes, 192 px para los cinco vasos simples, sin scroll propio. Tipografía calculada Montserrat, estilo normal. Vista 1440 × 900 y 390 × 844 sin desborde horizontal; en móvil ambos bloques quedan paralelos, de aproximadamente 196 y 109 px. Consola revisada sin advertencias ni errores. Se probó el arte de ejemplo; no se recargaron las pestañas con archivos del usuario. El motor y la composición no se cambiaron en esta entrega; su última regresión de 18/18 se conserva en la sección anterior.

Evidencia local ignorada: `qa/artifacts/model-pickers-desktop.png` y `model-pickers-mobile.png`. Todo sigue dentro de la demo, sin publicación ni cambios en el OS.

## Barra horizontal y acciones compactas · 24 de octubre de 2026

Modelo/tamaño, papel y aplicación 180°/360° se trasladaron a una barra horizontal. El panel derecho conserva carga, vista plana, ajuste proporcional, sliders en dos columnas, duplicación/ancho 360° y descarga. Medidas y ayuda se expanden en el flujo normal del documento. El panel pasó de aproximadamente 1.980 px en la vista móvil anterior a 659 px en escritorio y 712 px en móvil, con las ayudas cerradas. No se eliminó ningún ajuste ni se modificaron las proporciones del arte.

**Typecheck, build integrado y 26/26 pruebas de Node: PASS. WebGL: 18/18 PASS.** La nueva regresión comprueba que la rueda normal no se consume por OrbitControls, y que Ctrl/gesto de trackpad sí conserva el zoom. En la portada compilada, la rueda real sobre el vaso aumentó el scroll de página de 4053 a 4413 px, sin contenedores internos desplazables. Los botones +/− y los gestos táctiles conservan sus handlers. La nueva escucha de rueda se retira al liberar el visor.

Escritorio 1440 × 900: barra de 116 px, panel derecho 659 px y descarga completamente visible (borde inferior en 858 px). Se comprobaron modelo, Kraft, duplicación y sliders: 150%, x=20° y copia activa persistieron al pasar de pote 8 oz a vaso 9 oz doble. En Diseño 360°, tamaño 53% y Ajustar ancho persistieron al cambiar a vaso 21 oz. Quitar el arte bloquea tanto los ajustes como el selector de aplicación situado ahora fuera del panel. No se volvió a cargar arte del usuario; estas comprobaciones de interfaz usaron el ejemplo.

Móvil 390 × 844: barra de 347 px, acciones debajo del visor, sin desborde horizontal ni scroll interno. Duplicar respondió y las medidas se abrieron/cerraron en el flujo de la página sin generar otro scroll. Consolas del build y del banco WebGL sin errores ni advertencias. Las pruebas de motor también cubrieron JPG/PNG, proporciones, recorte frontal, copia posterior, potes, captura y recuperación de contexto.

Evidencia local ignorada: `qa/artifacts/compact-webgl.json`, `compact-desktop.png`, `compact-mobile.png` y `compact-mobile-actions.png`. Cambios limitados a la demo, sin publicar ni modificar el OS. La adaptación móvil se comprobó mediante viewport de Chromium; no reemplaza la revisión en teléfonos físicos antes del lanzamiento.

## Configurador dentro de la portada local · 24 de octubre de 2026

La copia integrada sustituye la antigua sección Personalización por el módulo real, inmediatamente después del showroom de Productos. Termoformado queda justo debajo. El documento conserva un solo `main`, un solo `h1` y la cabecera original, sin iframe ni IDs duplicados. Los estilos están limitados a `#niu-studio`, con IDs y animaciones prefijados. Se mantiene la demo independiente y la subpágina anterior. No se modificaron los fuentes públicos ni el OS.

**Typecheck y build integrado: PASS. Node: 26/26 PASS. Regresión WebGL: 17/17 PASS**, sin errores ni advertencias en la consola de esta ejecución. Los cuatro casos de integración verifican orden y conservación de los bloques originales, IDs y referencias accesibles, bloqueo de controles antes de iniciar, aislamiento de CSS y correspondencia entre catálogo y planos reales. Los sliders quedan habilitados al iniciar el módulo, sin atributos `disabled` individuales residuales.

Recorrido comprobado en el build de `4174`: desde una portada nueva en Inicio, el motor permanece pendiente y la carga de archivos deshabilitada; al usar Consultar este producto inicia y baja al configurador en el mismo documento. Vaso antiguo 8 oz doble selecciona Ruida 9 oz doble con aviso; pote 8 oz selecciona Mingyuan 8 oz. Tamaño 150% y duplicación activa se conservaron al volver al showroom y cambiar de vaso a pote. Diseño 360° a 53% con Ajustar ancho activo se conservó al consultar el pote 20 oz pendiente; mostró el aviso y mantuvo el modelo anterior. No abrió WhatsApp ni nuevas pestañas. JPG/PNG y recuperación de contexto se comprobaron en el banco existente; el recorrido de integración utilizó el arte de ejemplo, sin volver a cargar archivos del usuario.

Escritorio 1440 × 900 y móvil 390 × 844: visor listo, sin desborde horizontal. En móvil el editor tiene 347 px y Duplicar en reverso 297 px; el botón respondió y la copia quedó activa. La navegación interna conserva el documento. Se corrigió el enlace directo para esperar fuentes y catálogo antes de fijar el scroll, evitando que la cabecera oculte el principio del editor al recargar. El ancla nueva es `#configurador-3d`; `#personalizacion` sigue siendo compatible. La consola de la portada integrada tampoco devolvió advertencias ni errores.

Evidencia local ignorada en `qa/artifacts/`: `inline-webgl.json`, `inline-desktop.png`, `inline-mobile.png`, `inline-mobile-controls.png` y `inline-thermo-transition.png`. Las pestañas con diseños del usuario se preservaron; el banco temporal se cerró. Solo se generó la demo local, sin commit/push o publicación nuevos. Esta revisión responsive de Chromium no reemplaza pruebas en teléfonos físicos ni la revisión comercial previa a producción.

## Cobertura proporcional para potes · 24 de octubre de 2026

El ajuste anterior hacía entrar todo el archivo dentro de cada mitad. En potes 3/5/8 oz, más anchos y bajos, esto limitaba por altura y dejaba franjas laterales. Se agregaron Ver todo el arte y Cubrir los 180°, ambos con escala uniforme. Cubrir usa el mayor factor necesario para llenar ancho y alto, y el recorte frontal existente elimina el sobrante; la copia posterior continúa usando el mismo canvas frontal, sin superposición ni espejo. No se cambiaron las cotas ni los meshes.

Los potes adoptan Cubrir como ajuste inicial y los vasos conservan Ver todo. Mientras la selección es automática se adapta al cambiar de familia; una elección explícita persiste entre modelos. Los sliders, archivo y duplicación se conservan. Cambiar aplicación, cargar otro archivo o restablecer recupera el ajuste inicial. La ayuda explica que Cubrir llena al 100%, centrado y sin rotación, con posible recorte de bordes.

**22/22 pruebas de Node, typecheck, build integrado y 17/17 pruebas de WebGL: PASS.** La nueva regresión usa un PNG opaco de 1672 × 941, igual a las dimensiones mostradas por el archivo del usuario, y reproduce primero las franjas de Ver todo. Con el ajuste inicial comprueba todos los píxeles de la textura de los tres potes y exige cobertura sin papel, tanto delante como atrás. Captura ambos lados y una vista lateral a 90°; en la fila con más tinta exige continuidad, con una tolerancia de hasta 3 píxeles por rasterizado. La regresión numérica comprueba proporciones originales y escala uniforme para imágenes anchas, cuadradas y verticales en los diez modelos, así como las opciones explícitas y el ajuste anterior de los vasos. Las regresiones de recorte fijo, duplicación idéntica, PNG transparente y diseño continuo siguen pasando.

En el build se cargó un PNG sintético local de 1672 × 941 mediante el selector del navegador con pote 8 oz seleccionado: inició en Cubrir. Se alternaron Ver todo/Cubrir con tamaño 100% y duplicación activa; Ver todo explícito se conservó al cambiar al pote 5 oz. Cubrir y la copia se mantuvieron al recorrer los tres potes. El vaso inicial 12 oz conserva Ver todo. Esta prueba usa arte sintético, preserva las pestañas con arte del usuario y no publica archivos ni cambios al OS.

Se inspeccionó el lateral del pote 8 oz a aproximadamente 90° mediante los controles del visor: la superficie queda cubierta, con la unión entre los colores del propio arte y sin franja de papel. La consola del build no registra errores ni advertencias. Viewport móvil 390 × 844: documento 375 px, tamaño 100%, Cubrir y duplicación activos, WebGL listo. Se restableció el viewport y cerró el banco de QA. Evidencia local ignorada: `qa/artifacts/pot-cover-front.png`, `pot-cover-side.png`, `pot-cover-ui-state.json` y `pot-cover-webgl.txt`; `prueba-1672x941.png` es un dibujo sintético de prueba, no el archivo del usuario ni un recurso del build.

## Frente 180° y Duplicar en reverso · 24 de octubre de 2026

Esta sección sustituye el flujo de repetición continua documentado debajo. Todas las cargas entran en Frente 180°: al 100% cabe el archivo completo con escala uniforme. Escala 10–400%, desplazamiento local -90°/+90°, altura y rotación actúan sobre una cara fija. Se renderiza una composición frontal con recorte y se copian esos mismos píxeles a la otra mitad al activar Duplicar en reverso. No hay patrón, espejado ni invasión de una cara a otra. La vista plana muestra dos caras completas lado a lado; Diseño 360° conserva su flujo independiente.

**21/21 pruebas de Node, typecheck, build integrado y 16/16 pruebas de WebGL: PASS.** Una regresión recorre potes y vasos simples/dobles con tamaño 10/48/100/200/400%, x=-90/0/90°, y=8% y rotación -45/0/90°; comprueba todos los píxeles del reverso y exige papel limpio sin duplicación. Otra recorre los diez modelos con composiciones asimétricas y PNG transparente, y compara cada píxel de ambas mitades y del frente antes/después de duplicar. Incluye tamaño 400%, desplazamiento extremo y rotación de 90°. El render real confirma colores en ambas caras y el mismo orden izquierda/derecha, sin espejo. JPG/PNG, captura y restauración del contexto pasan; las regresiones de banda continua y ajuste de ancho siguen funcionando.

En la subpágina compilada se pasó desde Diseño 360° a una carga real de `design-flat.jpg` mediante el selector del navegador: quedó en Frente 180°, 100% y sin copia posterior. Se ajustó a 150%, x=30°, y=8%, rotación=-9° y se duplicó sin cambiar esos valores. Se conservaron archivo y controles al cambiar por pote 3 oz, vaso 9 oz, doble 12 oz, vaso 21 oz y simple 12 oz. Se editó el frente con la copia activa y se inspeccionó el reverso actualizado. La vista plana distingue claramente las dos mitades y sus guías no aparecen en el render.

En viewport 390 × 844: documento de 375 px, botón de 289 px, labels completos, modo frontal y copia activos, x limitado a -90/+90 y WebGL listo. Consola sin errores ni advertencias. Se restableció el viewport; se cerró solo el banco de QA y se preservaron las pestañas anteriores con arte del usuario. Evidencia local ignorada: `qa/artifacts/faces-180-ui-state.json`, `faces-180-webgl.txt`, `faces-180-front.png` y `faces-180-back.png`. El generador integrado se ejecutó correctamente. Cambios limitados a la demo, sin publicación, commit/push nuevo ni modificaciones al OS.

## Repetir arte en 360° · 24 de octubre de 2026

La opción Repetir arte en 360° agrega copias horizontales conservando escala, proporciones, altura, posición, rotación y transparencia. Se alterna con Ajustar ancho, sin reiniciar los sliders. Desactivar vuelve a Libre; los cambios de modelo conservan la selección y el archivo. Restablecer, cargar otro archivo y cambiar de aplicación desactivan ambas opciones. La unión posterior recorta los extremos cuando no entra un número entero de copias.

**21/21 pruebas de Node, typecheck, build integrado y 16/16 pruebas de navegador con WebGL: PASS.** La nueva regresión de píxeles compara ancho de la marca y altura de una copia antes/después de repetir en 10/25/50/53/90/150%; comprueba cobertura sin huecos dentro de la banda del arte, frente y reverso con dos copias al 50%, y la igualdad de -180°/+180° al 53%. Se verifican JPG y PNG transparente con rotación -9/0/90° en pote 3 oz, vaso 9 oz, doble 12 oz y vaso 21 oz. Un raster de 2048 × 1 rotado a 90° con tamaño 10% también se compone correctamente sin crear miles de operaciones de dibujo. El resto de las regresiones anteriores sigue pasando, incluida recuperación del contexto con repetición aplicada.

En la interfaz compilada se comprobó que alternar Ajustar ancho / Repetir / Libre mantiene tamaño 53%, y que Repetir continúa activo al cambiar entre vaso 9 oz, doble 12 oz, pote 8 oz y pote 3 oz. Estado WebGL listo en todos ellos. Se abrió una pestaña nueva para conservar el archivo del usuario en la versión anterior.

Se inspeccionaron frente y reverso del vaso 12 oz al 50%, con el mismo diseño de ejemplo repetido. Consola sin advertencias ni errores. En viewport 390 × 844, el documento mide 375 px y el botón ocupa 289 px dentro del panel; la repetición, tamaño y WebGL listo se conservan. Se restableció el viewport al terminar y se cerró el banco de QA. Evidencia ignorada: `qa/artifacts/repeat-art-ui-state.json`, `repeat-art-webgl.txt`, `repeat-art-front.png` y `repeat-art-back.png`. Build y preview integrado actualizados; todo sigue solo en la demo, sin publicar ni tocar el OS.

## Planos reales de Mingyuan y Ruida · 24 de octubre de 2026

Esta sección reemplaza el estado anterior de catálogo y bases estimadas; las secciones siguientes se conservan como historial. Se revisaron los diez PDF locales y se registraron sus cotas, revisión, página y SHA-256. Se comprobó que los diez hashes coinciden con los archivos entregados. La fuente vigente es `data/supplier-models.json`, documentada en `FUENTES.md`; ya no se importa la tabla del showroom.

Historia verificada: elegir un modelo del proveedor → reconstruir el ensamblado y su superficie impresa → conservar arte y ajustes → renderizar y exportar. Es un flujo local: no hay API, base de datos ni variables de entorno. El pote Mingyuan de 8 oz permanece separado del vaso Ruida de 9 oz que reemplaza al antiguo vaso de 8 oz. Hay diez modelos seleccionables; 4/24 oz están deshabilitados porque no se entregaron sus fichas.

**20/20 pruebas de Node, typecheck, build integrado y 14/14 pruebas de navegador con WebGL: PASS.** Se comprueba la altura total y diámetro exterior del borde en los meshes, no solo en la tabla de datos. Pie, inclinación, espesor y elevación del fondo reproducen el diámetro de formado acotado por separado dentro de 0,025 mm. Las mangas dobles tienen su propio ángulo y rulo inferior, y dejan los 12 mm inferiores expuestos. No se aplica la antigua relación de base de 2/3.

El banco WebGL recorre los diez modelos con JPG/PNG y captura sus renders, verifica cobertura completa y conservación de los archivos, compara las siluetas del pote 8 oz y vaso 21 oz, y alterna Logo/360° en modelos bajos, altos y de pared doble. También pasan las regresiones de ancho independiente, altura/rotación, unión posterior, reemplazos y recuperación del contexto.

En la subpágina integrada compilada se recorrieron los diez modelos con el ejemplo y estos valores: tamaño 50%, x=-137°, y=8%, rotación=-9°, modo 360° y ancho completo activo. El estado y el archivo permanecieron iguales en todos los cambios, con WebGL `ready`. Se inspeccionaron visualmente el pote 8 oz, vaso simple 9/12 oz y doble 12 oz. En viewport 390 × 844 se comprobó ancho de documento 375, visor listo y opciones 4/24 oz deshabilitadas. Consola de la subpágina: sin advertencias ni errores. El servidor de desarrollo arrancó sin errores; el build y la copia integrada terminaron correctamente.

Evidencia local ignorada por Git: `qa/artifacts/supplier-models-ui-state.json`, `supplier-models-webgl.txt`, `supplier-pot-8oz.png` y `supplier-cup-9oz.png`. La pestaña original se conserva sin recargar. No se publicaron cambios ni se modificó el OS o la web original. Esta validación reproduce cotas nominales; no certifica tolerancias de fabricación, troqueles, impresión o dispositivos físicos.

## Vista local de la integración con la web · 24 de octubre de 2026

`npm.cmd run preview:integrated`: PASS (importación de catálogo, typecheck, build y generación de la copia). El generador lee solo los archivos públicos versionados de `assets/`, `css/`, `js/` y la portada. La copia se guarda en `dist/vista-integrada/`, ignorado por Git; se usa Montserrat local. No se modificaron la portada, los estilos o el showroom originales ni el OS. El servidor conserva la raíz en dist, ahora con tipos MIME para JPEG, WebP, PDF y MP4 y un puerto configurable; se lanzó en 4174 para no interrumpir 4173.

HTTP 200 para portada, subpágina y fuente WOFF2. En la portada se inspeccionó el acceso de Personalización dentro de la sección completa y el segundo acceso en el panel Vasos. El enlace de Personalización abrió la subpágina real del módulo. En ella se comprobó estado WebGL `ready`, selección de 12 oz, modo 360° y ajuste de ancho activo. Los enlaces de Inicio, Productos, Personalización, cotización y pie apuntan a la copia local; las rutas de JS, CSS y fuente del módulo funcionan bajo la subcarpeta. Portada sin iframe ni carga del motor 3D.

Inspección de escritorio en 1280 × 900: sin desborde horizontal; el acceso de Vasos cabe en su panel. La subpágina también se comprobó en 390 × 844, con ancho de documento 375 y estado 360° conservado. Los recursos de imagen con src no registraron errores de carga. Consolas de portada y subpágina: sin errores ni advertencias. Se cerró solo la subpágina de prueba con el diseño de ejemplo, conservando la pestaña original y la portada integrada para el usuario. Se solicitó restablecer el viewport de prueba al terminar.

Evidencia en `qa/artifacts/`: `integration-home-desktop.png`, `integration-showroom-desktop.png` e `integration-module-desktop.png`. El motor no cambió; no se repitieron sus suites de 20 casos de Node y 14 de WebGL. Esta integración es una vista local y no fue publicada.

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

## 2026-10-29 — Escala común y cámara sin zoom

Se eliminó el ajuste de distancia por modelo. Los diez modelos conservan las cotas de sus planos y comparten cámara, punto de referencia y escala; el cambio de producto conserva el ángulo actual. La distancia inicial es la antigua referencia multiplicada por 1,14², equivalente a dos clics de alejar. Se retiraron botones, atajos y mensajes de zoom en los tres idiomas, y se desactivó el zoom de OrbitControls. La rueda sigue desplazando la página; uno o dos dedos permiten girar sin cambiar la distancia.

- `npm test`: **40/40 PASS**, con regresiones de tamaño proyectado para los diez modelos en vistas de 980×600, 640×600 y 340×540. El pote de 8 oz se ve más ancho y alto que el de 5 oz; el de 5 oz más alto que el de 3 oz. Los vasos de 9, 12, 16 y 21 oz se ven progresivamente más altos.
- `npm run build:website`: **PASS**, incluyendo TypeScript y comprobación de recursos del artefacto publicado bajo `/niupack/`.
- Edge/WebGL: **18/18 PASS**, incluida rueda/Ctrl sin cambios de cámara y recuperación del contexto con el diseño conservado.
- Interfaz compilada: selección de ocho modelos, giro con mouse y teclado, restablecer, frente/reverso, ausencia de botones y atajos de zoom, celular de 390×844 y traducciones ES/EN/PT: **PASS**, sin errores de página.
- Capturas y resultados: `qa/artifacts/fixed-view-*.png` y `fixed-view-browser-results.txt` (ignorados por Git). Cambios preparados y verificados en local; no publicados.

## 2026-10-29 — Ajuste final, descarga y cabecera local

- Vista acercada un clic respecto de la revisión anterior (factor de distancia `1.14² × 0.88`), manteniendo cámara común y zoom bloqueado. El punto de referencia común subió a 0,72 para que entre también el vaso de 21 oz. **40/40 pruebas de Node y build público: PASS.**
- Botón **Descargar diseño** sobre **Pedí presupuesto**, traducido en ES/EN/PT. Descarga real comprobada: PNG de 1600 px de ancho en escritorio y 1200 px en celular, con el diseño visible y nombre de archivo por modelo/papel. Se verificaron descarga repetida, recuperación tras error del encoder y deshabilitación sin diseño.
- El logo gigante provenía del loader sin estilos: la política CSP del servidor local bloqueaba los bloques inline del sitio público. `serve.mjs` ahora autoriza sus contenidos exactos con hashes SHA-256. En ES/EN/PT se verificaron la desaparición del loader, el tamaño normal del logo y ausencia de infracciones CSP.
- Menú móvil con tres líneas blancas, fondo transparente, sin borde ni sombra; apertura y cierre comprobados. Navegación de escritorio conservada.
- Edge, escritorio 1440×1000 y celular 390×844: **PASS**, sin errores de página. Evidencias ignoradas por Git: `header-fixed-*.png`, `one-click-closer-*.png`, `download-footer.png` y `download-*.png` en `qa/artifacts/`.

## 2026-10-30 — Carga de PDF

- PDF.js 6.4.299 se carga bajo demanda cuando se selecciona un PDF. Parser, worker, fuentes, CMaps y decodificadores se sirven desde el propio sitio; el documento se procesa en la pestaña. Se aplica la primera página, con su rotación y proporciones, a un máximo de 2048 px por lado. La interfaz ES/EN/PT indica la primera página y el límite de 12 MB.
- `npm test`: **42/42 PASS**. Nuevas regresiones de PDF falso, archivo vacío y límite de peso; selector y ayuda PDF localizados en los tres idiomas.
- `npm run build:website`: **PASS**, con TypeScript y comprobación del worker y los recursos PDF en el artefacto de GitHub Pages.
- Sitio compilado en Edge: PDF de dos páginas (roja primero y azul después), PDF rotado, archivo corrupto, contenido falso, conservación del diseño anterior y retorno a PNG: **PASS**. PDF real `ARCHIVO ACT.pdf` de 9,9 MB aplicado correctamente. Descargas PNG con el diseño verificado en ES/EN/PT, escritorio y celular, sin recursos faltantes, errores de página ni infracciones CSP.
- Evidencia local ignorada por Git: `qa/artifacts/pdf-*.png`, `test-multipage.pdf` y `test-rotated.pdf`. El script de desarrollo prepara los recursos y precarga la dependencia para evitar una recarga al seleccionar el primer PDF.
- Banco WebGL de desarrollo: **22/22 PASS**, con primera página PDF, orientación, rechazo de documentos inválidos, JPG/PNG/SVG, ajuste 180°/360°, cambios de modelo y recuperación del contexto. Resultados en `qa/artifacts/pdf-browser-results.txt`.

## 2026-10-30 — Descarga del modelo 3D

- **Descargar 3D** genera un GLB 2.0 con geometría, materiales y texturas incrustadas; **Descargar PNG** conserva la captura. Ambos botones están localizados en ES/EN/PT. La exportación toma una copia independiente de geometrías, materiales y lienzos, convierte las unidades a metros y excluye piso, luces y cámara.
- `npm test`: **42/42 PASS**. TypeScript y `npm run build:website`: **PASS**. El exportador se carga bajo demanda, sin añadirlo a la carga inicial del visor.
- Sitio compilado: descargas GLB reales en escritorio y celular, diseño procedente de PDF, exportación sin diseño, nombre del archivo, texturas incorporadas y descarga PNG posterior: **PASS**. Los archivos de prueba ocuparon entre 0,88 y 0,96 MB y no referencian imágenes o buffers externos.
- Reapertura con GLTFLoader y renderizado en otra escena: **PASS**, para vaso de 12 oz y pote de 8 oz. Se comprobaron altura y boca en metros contra las cotas del proveedor, pared interior visible y diseño de color en el modelo reabierto. Esta comprobación puede ejecutarse aislada en `qa/browser.html?only=glb`.
- Evidencia local ignorada por Git: `qa/artifacts/export-*.glb`, `glb-roundtrip-*.png`, `glb-download-controls-*.png` y `glb-browser-results.txt`.

## 2026-10-30 — Vaso 21 oz, altura visual −15%

- El usuario confirmó la altura nominal de **166 mm** y pidió acortar la representación visual un **15%**. La ficha, sus cotas y el modelo nominal permanecen intactos; la presentación del 21 oz tiene una altura de **141,1 mm equivalentes**, con el mismo ancho y radios. Los otros nueve modelos no cambian.
- Geometría y composición del arte utilizan la misma superficie visual para conservar las proporciones del diseño. El visor, PNG y GLB comparten la presentación compacta; el GLB registra `nominalHeightMm: 166` y `visualHeightScale: 0.85` por separado.
- **43/43 pruebas de Node PASS**, incluyendo altura visual exacta, ancho intacto, fuente sin mutaciones, arte sin distorsión y comparación proyectada con el 16 oz en escritorio y celular. TypeScript y build público: **PASS**.
- Interfaz compilada: selección de 16/21 oz, ficha de 166 mm visible, descargas PNG/GLB y vista móvil: **PASS**, sin errores de página. GLB reabierto y renderizado para 12 oz, pote de 8 oz y 21 oz: **PASS**, con dimensiones de presentación y metadatos verificados.
- Evidencia local ignorada: `compact-21-compare-16.png`, `compact-21-compare-21.png`, `compact-21-mobile.png`, `compact-21oz.png`, `compact-21oz.glb` y `glb-roundtrip-cup-21oz.png` en `qa/artifacts/`.

## 2026-10-30 — Video 360° para teléfonos

- **Descargar video 360°** genera un MP4/H.264 Baseline de 8 segundos, 720 × 900 px, 30 fps y 240 fotogramas, con el modelo, papel y diseño seleccionados. Se codifica en la pestaña y muestra progreso, reproducción y **Guardar MP4** para un guardado con toque directo. PNG y GLB siguen disponibles en ES/EN/PT.
- **43/43 pruebas de Node PASS**; TypeScript y build público **PASS**. El codificador se carga bajo demanda. La generación requiere WebCodecs/H.264; un navegador sin codificador recibe un mensaje claro y conserva los controles disponibles.
- Banco `qa/browser.html?only=mp4`: **2/2 PASS**. Comprueba contenedor MP4, códec AVC, duración, resolución, presencia del diseño al inicio/final y reverso a mitad del giro. Espera la presentación del fotograma antes de inspeccionar píxeles. También cancela al ocultar la pestaña, verifica recuperación y reintenta una exportación completa, con la cámara y el modelo restaurados.
- Sitio compilado en Edge: descarga, reproducción, enlace de guardado directo, bloqueo/restauración de ajustes, PNG y GLB posteriores **PASS**. ES escritorio (12 oz), EN vista móvil iPhone (21 oz) y PT vista móvil Android (pote 8 oz, Kraft) **PASS**, sin errores de página. Las vistas móviles se comprobaron con emulación de dispositivo en Chromium; no se probaron teléfonos físicos. El WebKit de pruebas para Windows carece del codificador H.264 y se trata como navegador no compatible.
- Evidencia local ignorada en `qa/artifacts/`: `rotation-edge.mp4`, `mp4-bank-edge.txt`, `mp4-bank-edge.png`, `ui-desktop.mp4`, `ui-iphone.mp4`, `ui-android.mp4` y `video-result-*.png`.
