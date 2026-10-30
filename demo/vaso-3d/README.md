# NIUPACK · Estudio de vasos 3D

Demo local independiente con **diez modelos de vasos y potes construidos a partir de los planos de Mingyuan y Ruida**. Por indicación del usuario, esas fichas reemplazan las medidas anteriores del catálogo. El modelo inicial es el vaso Ruida de 12 oz de pared simple. No modifica la web pública, el showroom original, el CRM o el OS. No contiene backend, almacenamiento, cuentas, presupuestos automáticos ni generación de arte industrial.

La interfaz adopta la identidad de la web de NIU PACK: Montserrat, cabecera roja con logo blanco, navegación de regreso al sitio, ubicación de la subpágina y pie de marca. La fuente y su licencia se incluyen localmente en `public/fonts/`; no se solicitan recursos a Google Fonts en tiempo de ejecución. Ver `INTEGRACION.md` para el recorrido y la publicación propuestos, todavía sin ejecutar.

Para ver el recorrido integrado sin modificar la web pública: `npm.cmd run preview:integrated` genera una copia local con **Productos → Configurador 3D → Termoformado**. El módulo completo sustituye a la antigua sección Personalización. **Consultar este producto** lleva al modelo disponible dentro de la misma página, conservando arte y ajustes; los formatos pendientes muestran un aviso. Con el servidor de la demo activo, abrir `/demo/vaso-3d/vista-integrada/index.html#configurador-3d`. Los estilos están limitados al módulo y el motor se carga al aproximarse al visor. Los archivos generados quedan en `dist/` (ignorado por Git); solo se copian recursos públicos ya versionados, nunca el OS ni la raíz completa del repositorio. El build normal no incluye esta vista; hay que generarla de nuevo tras recompilar. La subpágina anterior se conserva como acceso compatible.

## Publicación en Vercel

El sitio público de Vercel corresponde al proyecto **newpack** (`niupack-web.vercel.app`), con raíz `demo/vaso-3d` y **Include source files outside of the Root Directory** activado. `vercel.json` publica únicamente `dist/website`, generado por `npm run build:website`; el `.vercelignore` local conserva los recursos compartidos necesarios y evita heredar las exclusiones de NIUPACK OS.

## Abrir en Windows

Requisito: Node.js **22.13 o superior** (probado con 24.20.0). Doble clic en `ABRIR_DEMO.bat` desde esta carpeta. La ventana debe permanecer abierta mientras probás.

Desde PowerShell, dentro de `demo/vaso-3d`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run serve
```

Abrir **http://127.0.0.1:4173/demo/vaso-3d/**. El servidor también admite **http://127.0.0.1:4173/niupack/demo/vaso-3d/** para comprobar las rutas de GitHub Pages. Se sirve únicamente `dist/`, enlazado a `127.0.0.1`; el resto del repositorio queda fuera del servidor.

Para editar con recarga automática:

```powershell
npm.cmd run dev
```

Usa el mismo puerto: detené el servidor anterior con Ctrl+C antes de iniciar otro. Los comandos `npm.cmd` evitan el bloqueo de `npm.ps1` por la política de PowerShell.

## Funciones

- Dos selectores paralelos, **Tipo de envase** y **Tamaño**, con Montserrat tanto en el control como en las opciones. Vasos simples de **6, 9, 12, 16 y 21 oz**, vasos dobles de **9 y 12 oz**, y potes simples de **3, 5 y 8 oz**. El vaso de 8 oz se reemplaza por el de 9 oz; el pote de 8 oz de Mingyuan es una familia separada. Solo se muestran modelos disponibles: **4 y 24 oz no se ofrecen por falta de ficha**.
- `data/supplier-models.json` contiene las cotas transcritas y comprobadas en los diez PDF locales. Cada fuente incluye archivo, página, revisión, fecha y SHA-256. `npm.cmd run catalog:import` valida esos datos y genera `src/catalog-data.mts`; el build es portable y no depende de la carpeta Descargas. Ver `FUENTES.md`.
- Cambiar el modelo reconstruye pared impresa, interior, borde enrollado, pie y fondo elevado con sus cotas nominales. Los vasos dobles incluyen la manga exterior y los 12 mm de vaso interior expuesto. Geometría, mapeo y vista plana comparten las dimensiones de la superficie impresa. Se conservan archivo, papel, tamaño del arte, posición, rotación, modo y cobertura 360°. Todos los modelos comparten cámara, distancia y punto de referencia para mostrar sus tamaños relativos reales; cambiar de modelo conserva el ángulo.
- Se distinguen boca exterior, abertura interior, apoyo del pie y diámetro de formado del fondo. No se usa la proporción estimada de 2/3 ni se ofrece el antiguo modelo genérico. Las medidas inválidas o incompletas impiden habilitar un modelo. La vista 360° y el PNG siguen siendo previsualizaciones comerciales, no troqueles industriales.

- Geometría WebGL 2 auténtica: cuerpo cónico, pared interior, borde enrollado, base y fondo interior. Órbita de 360° e inclinación con mouse, teclado o gestos de OrbitControls. La vista inicial equivale a dos clics de alejar y uno de acercar sobre la antigua referencia, con un punto de referencia común que deja entrar el vaso de 21 oz; el zoom del producto está desactivado.
- JPG, PNG y PDF mediante selector o arrastre; SVG estático simple opcional. Los PDF de hasta 12 MB se procesan localmente con PDF.js: se aplica la primera página, respetando su orientación y proporciones, y se rasteriza a un máximo de 2048 px por lado para el visor. Las páginas adicionales se ignoran con una indicación visible; los PDF dañados o con contraseña muestran un error y conservan el diseño anterior. La descarga del resultado sigue siendo PNG.
- Tamaño, posición horizontal, altura y rotación independientes. Restablecer ajustes, quitar diseño, cambiar blanco/kraft y restablecer cámara.
- Barra horizontal con modelo/tamaño, papel y aplicación 180°/360°. El panel derecho reúne carga, vista plana, ajuste proporcional, cuatro sliders, duplicación o ancho 360° y **Pedí presupuesto**. Medidas y ayuda se despliegan bajo demanda. Ningún panel tiene scroll propio: la rueda sobre el visor desplaza la página. La vista permite girar, inclinar, restablecer y ver frente/reverso; botones, teclado, rueda y pellizcos no acercan ni alejan el producto. El zoom de página del navegador sigue disponible.
- **Frente 180°** es la aplicación inicial para todas las cargas, incluidas las imágenes anchas. Agrandar, mover y rotar conservan las proporciones y se recortan dentro de esa mitad fija. La posición horizontal es local al frente, de -90° a +90°; no lleva el arte al reverso.
- Dos ajustes proporcionales: **Ver todo el arte** hace entrar la imagen completa al 100%, con posible papel visible; **Cubrir los 180°** llena la mitad al 100%, recortando los bordes sobrantes. La cobertura se garantiza centrado y sin rotación, para un archivo opaco; las transparencias permanecen. Los potes 3/5/8 oz empiezan en Cubrir y los vasos conservan Ver todo. El ajuste inicial se adapta a la familia hasta que el usuario elige uno explícitamente; esa elección se conserva al cambiar de modelo. Cargar otro archivo, cambiar de aplicación o restablecer recupera el ajuste inicial del modelo.
- **Duplicar en reverso** copia la composición frontal ya recortada a los otros 180°, con los mismos píxeles y orientación. Hay exactamente una composición por cara, sin patrón repetitivo ni superposición. Los cambios posteriores se aplican igual atrás. Desactivar deja el frente intacto. Cambiar de modelo conserva arte, duplicación y sliders; cargar otro archivo, restablecer o cambiar de aplicación desactiva la copia.
- **Diseño 360°** queda como aplicación separada para un arte continuo sobre todo el contorno. Su ajuste inicial cubre la banda con escala uniforme y recorte de bordes. Las transparencias dejan ver el papel. La posición y la rotación no cambian la escala automáticamente.
- Vista plana con **Frente 180° / Reverso 180° completos lado a lado**, y accesos **Ver frente / Ver reverso** para el visor. Las guías no aparecen en el modelo. Al cargar una imagen vuelve la cámara al frente. Restablecer conserva la aplicación elegida y devuelve la escala a 100%. Ambas aplicaciones admiten **10% a 400%**; achicar puede dejar papel visible y agrandar puede recortar contenido.
- Ajuste en dos etapas dentro de Diseño 360°: **1. Tamaño del arte** y **2. Ajustar ancho a 360°**. El botón adapta únicamente el ancho a una vuelta completa, conservando altura, posición y rotación, sin añadir copias del arte. Cambia expresamente su proporción horizontal. Mientras está activo, el tamaño modifica la altura y conserva el ancho completo; pulsar el botón otra vez recupera las proporciones anteriores. Restablecer, cargar otro archivo o cambiar de modo desactiva este ajuste.
- Ambas aplicaciones usan UV de ángulo y altura. El frente ocupa exactamente media circunferencia en todas las alturas del vaso. En Diseño 360° la banda rectangular es periódica; en Frente 180° hay un único canvas frontal limitado y una copia exacta opcional a media vuelta. Estas vistas son comerciales, no troqueles de imprenta.
- **Descargar diseño**, sobre el botón de presupuesto, guarda un PNG de la vista 3D actual con el modelo, papel y diseño aplicados: 1600 px de ancho en escritorio y 1200 px en celular. Se prepara en la pestaña y el archivo lleva el modelo y papel en el nombre. Se deshabilita durante la preparación, carga de imágenes, ausencia de diseño o pérdida del contexto 3D; un error permite reintentar. Es una previsualización comercial.
- **Pedí presupuesto**, con el ícono de WhatsApp junto al texto, abre el número comercial **+595 971 350619** en otra pestaña y prepara un mensaje con modelo y papel. No envía el mensaje ni adjunta el arte automáticamente.
- Iluminación de estudio, material mate, grano procedural, sombras y reflejos discretos. Recursos de presentación generados localmente mediante código.
- Renderizado a demanda, límite de pixel ratio, texturas de 1024 px en móvil y hasta 2048 px en escritorio; los diseños se reducen proporcionalmente a un máximo de 2048 px.
- Pérdida/restauración del contexto: mantiene el canvas del diseño en la pestaña y reconstruye la iluminación generada en GPU al recuperarse.

## Archivos de cliente y privacidad

- Máximo **12 MiB**, **16 megapíxeles** y **8192 px por lado**. Se comprueban las dimensiones de PNG/JPG desde la cabecera antes de decodificar.
- Se valida el contenido y su concordancia con la extensión. Se rechazan archivos dañados con un mensaje y se conserva el diseño anterior.
- JPG conserva su fondo. PNG conserva su transparencia. No hay eliminación de fondo, vectorización ni cambios generativos del arte.
- El SVG admite formas, grupos, gradientes y recortes internos. Rechaza scripts, imágenes incrustadas, fuentes/textos, animaciones, filtros, estilos no admitidos, referencias externas y documentos muy complejos. Convertir texto a curvas o exportar PNG cuando corresponda. Se decodifica como imagen desde un Blob; nunca se inserta como HTML.
- Los diseños se procesan en memoria dentro del navegador, no se envían a ningún servicio ni se guardan en localStorage/IndexedDB. Al cerrar o recargar se pierden. El enlace comercial solo incluye modelo y papel, sin imagen ni nombre de archivo.
- Las dependencias se empaquetan localmente: el visor no usa CDN ni APIs. El servidor del build envía CSP con `connect-src 'none'`.

## Aislamiento y publicación futura

Todo el código, configuración, dependencias y pruebas están en esta carpeta. `package.json` y `package-lock.json` son propios. Vite usa una configuración PostCSS vacía para no cargar la del OS.

Los fuentes TypeScript usan extensión **`.mts`**, que los patrones actuales `**/*.ts` / `**/*.tsx` del OS no incluyen. Se verificó la configuración del OS: **0 archivos del demo incluidos**. No se modifican `tsconfig.json`, `next.config.ts`, PostCSS ni el package de la raíz.

`dist/` utiliza rutas relativas (`base: './'`). Para una publicación futura, el contenido de ese build debe ocupar la ruta estática elegida; no alcanza con copiar TypeScript a GitHub Pages. No se creó workflow de deployment ni se cambió la web pública. La demo se trabaja en su rama independiente; no ejecutar un deployment sin autorización.

## Comprobaciones

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

La suite de Node comprueba cabeceras PNG/JPG, archivos inválidos, límites de píxeles, continuidad y escala del mapeo cónico y conservación de proporciones.

También coteja los diez modelos con la fuente revisada, comprueba altura y diámetro de los meshes reales, y verifica que pie, ángulo, espesor y elevación del fondo reproduzcan el diámetro de formado acotado por separado. Comprueba la sustitución 8→9 oz, la familia de potes, las mangas dobles y el bloqueo de 4/24 oz. Para regenerar únicamente los datos: `npm.cmd run catalog:import`.

Para las pruebas de navegador, ejecutar `npm.cmd run dev` y abrir **http://127.0.0.1:4173/demo/vaso-3d/qa/browser.html**. Pulsar **Ejecutar pruebas**. Ese banco de pruebas no se incluye en el build de producción. Prueba carga de JPG/PNG/SVG, transparencia, rechazo de contenido peligroso/dañado, límite de peso, reemplazos, capturas repetidas y recuperación WebGL conservando el diseño.

Ver `QA.md` para la evidencia y los límites de esta validación.

## Tecnologías y archivos

- Three.js 0.186.1, OrbitControls, RoomEnvironment, Canvas 2D nativo, TypeScript 5.9.3, Vite 8.3.5. Node nativo para servir el build y ejecutar pruebas. Sin React, Next.js, IA ni backend.
- `index.html`, `src/style.css`: interfaz responsive y accesible.
- `data/supplier-models.json`, `scripts/supplier-source.mjs`: cotas de proveedores, procedencia y validación.
- `src/catalog.mts`, `src/catalog-data.mts`: modelos seleccionables y conversión de mm a dimensiones del visor.
- `src/cup-geometry.mts`: geometría ensamblada a partir de las cotas del modelo.
- `src/studio.mts`: materiales, cámara, UV, exportación y ciclo de vida WebGL.
- `src/layout.mts`: ajuste proporcional a los 180° frontales y coordenadas angulares de 360°.
- `src/print.mts`: composición frontal con recorte fijo, copia posterior exacta y vista plana de ambas caras; la banda continua 360° mantiene su composición independiente.
- `src/artwork.mts`: validación y procesamiento de imágenes.
- `src/main.mts`: acciones de interfaz, carga, ajustes y estados.
- `src/model-picker.mts`: menús cortos de tipo/tamaño con tipografía propia, flechas, Enter, Escape, Tab y búsqueda por caracteres. No usa el menú visual nativo del sistema.
- `integration/`, `scripts/inline-studio.mjs`, `scripts/preview-integration.mjs`: copia de la portada con el visor insertado, CSS limitado y selección desde el showroom, solo para revisión local.
- `public/`: copia del logo existente y favicon.
- `qa/`: pruebas y archivos de ejemplo sintéticos, sin datos de clientes.
- `serve.mjs`, `ABRIR_DEMO.bat`: ejecución local; `vite.config.mjs`, `tsconfig.json`, `package*.json`: build aislado.

## Límites conocidos

Es un mockup comercial. Las medidas y colores no certifican un troquel ni una prueba de imprenta. La perspectiva y la curvatura cambian naturalmente la apariencia del diseño. El material kraft es una aproximación de pantalla, no una simulación de tintas/absorción o de tinta blanca. Una foto de un vaso ya impreso no sustituye al diseño plano. Un JPG/PNG pequeño no recupera detalle por ampliarlo. Revisar siempre el arte antes de fabricar.

En 360°, los extremos izquierdo y derecho del archivo se unen: si el arte no tiene extremos compatibles, la unión seguirá siendo visible. La herramienta no inventa ni mezcla contenido para ocultarla. Un desplazamiento de 180° lleva el centro del diseño al reverso; las posiciones -180° y +180° son equivalentes. Mover o rotar el archivo puede descubrir papel o recortar contenido, y la escala permanece bajo control del usuario.

**Ajustar ancho a 360°** cierra el espacio radial provocado por reducir el tamaño del archivo, sin recuperar su altura original. No rellena las transparencias del propio PNG ni elimina una unión ya presente en el diseño. Si hay rotación, adapta la extensión horizontal del arte rotado; conserva su altura, pero las esquinas inclinadas pueden dejar papel visible.

**Frente 180°** tiene bordes fijos a ambos lados. Lo que sale de esa mitad al ampliar, desplazar o rotar se recorta; no invade la cara posterior. Duplicar copia ese mismo recorte sin deformación ni espejo. Las dos caras pueden dejar papel visible según el tamaño, posición y transparencia elegidos. No se intenta rellenar esos espacios agregando copias. El antiguo patrón Repetir arte en 360° fue reemplazado por este flujo.

En potes bajos y anchos, una imagen de 1672 × 941 no puede entrar completa y a la vez cubrir los 180° sin cambiar sus proporciones. Ver todo conserva todo el archivo y deja márgenes; Cubrir amplía ambos ejes por el mismo factor y recorta. Elegir uno de estos ajustes conserva los sliders y la duplicación; al reducir el tamaño por debajo de 100% o desplazar/rotar pueden reaparecer márgenes.

La validación móvil se realizó mediante viewport responsive en Chromium, sin certificar dispositivos físicos, Safari de iPhone, autonomía, temperatura o FPS en celulares de gama baja. WebGL 2 y aceleración gráfica son necesarios. Si no se pueden iniciar, aparece una explicación; el enlace de presupuesto sigue disponible.
