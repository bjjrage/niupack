# Integración del configurador en la web de NIU PACK

## Estado actual

La publicación de la versión integrada en GitHub Pages está autorizada. `.github/workflows/niupack-pages.yml` compila este módulo y publica únicamente `dist/website/` en `https://bjjrage.github.io/niupack/`. El HTML de la raíz permanece como plantilla: el artefacto publicado incorpora el hero con video y el configurador bajo Productos. No se modifican fuentes, dependencias ni configuración del OS.

`npm.cmd run build:website` genera ese artefacto y comprueba sus recursos bajo `/niupack/`, idiomas, fuentes, video y entrada 3D. Excluye código del OS, fuentes de desarrollo, dependencias y etiquetas de demo. Incluye `site-version.json` con el commit compilado y los idiomas disponibles para verificar qué versión sirve el dominio. El workflow ejecuta primero las 31 pruebas y publica con GitHub Actions, separado de Vercel.

Español (`index.html`), inglés (`en.html`) y portugués (`pt.html`) pasan por el mismo generador: las tres páginas reciben el video y el configurador bajo Productos. Se conserva el texto de cada plantilla del sitio. `integration/i18n.js` comparte las traducciones entre el generador y el navegador para los controles, avisos, selectores, ayuda, reproducción de video y mensaje preparado de WhatsApp. El arte subido y su nombre de archivo no se traducen. Las pruebas verifican la integración en los tres idiomas y los mensajes dinámicos; el verificador del artefacto rechaza páginas traducidas sin el módulo o con los principales controles todavía en español.

La **vista integrada local** se genera con `npm.cmd run preview:integrated`. Copia únicamente recursos públicos versionados a `dist/vista-integrada/`, reemplaza la antigua sección Personalización por el configurador completo y mueve Termoformado inmediatamente debajo. El orden visible es **Productos → Configurador 3D → Termoformado**. No utiliza iframe ni duplica encabezado, pie o título principal. El build normal borra esta copia: regenerarla después de compilar.

URL de revisión: `http://127.0.0.1:4174/demo/vaso-3d/vista-integrada/index.html#configurador-3d`. El ancla anterior `#personalizacion` también lleva al módulo. Se usa un segundo servidor con `NIUPACK_DEMO_PORT=4174` para conservar la pestaña y servidor anteriores del puerto 4173. La copia generada y sus recursos no se versionan ni se publican.

## Recorrido propuesto

1. Elegir tipo y tamaño en el showroom. **Consultar este producto** baja al configurador en el mismo documento y preselecciona el modelo disponible. No abre WhatsApp ni otra pestaña. El antiguo vaso 8 oz se vincula al Ruida 9 oz con aviso explícito; el pote 8 oz sigue siendo otro modelo.
2. Para formatos sin plano disponible o productos que no son vasos/potes, mostrar un aviso y conservar el modelo actual. No se inventan modelos. Los formatos 4/24 oz y el pote 20 oz siguen pendientes.
3. Subir JPG/PNG en **Frente 180°**, ajustar tamaño y posición, y activar **Duplicar en reverso** si corresponde. Se conservan los ajustes proporcionales específicos de vasos/potes. **Diseño 360°** y **Ajustar ancho a 360°** siguen disponibles para arte continuo.
4. Volver a Productos o recorrer otros sectores mediante enlaces internos conserva el arte y los controles. Inspeccionar ambas caras y pulsar **Pedí presupuesto**, con el ícono de WhatsApp junto al texto. Abre el comercial **+595 971 350619** en otra pestaña, con modelo y papel en un mensaje preparado. No envía el mensaje ni adjunta el arte automáticamente. La interfaz ya no ofrece descarga. Cerrar o recargar la página elimina el diseño de memoria.

## Implementación de la copia local

El hero de esta copia sustituye la tarjeta estática por el video proporcionado por el usuario, conservado en `integration/media/hero-niupack.mp4` (1280 × 720, 15,04 segundos). El contenedor ocupa una columna más amplia y respeta el formato 16:9 completo, también en móvil. `integration/hero.html` y `integration/hero-video.js` se aplican solamente al generar la vista integrada; el HTML y los recursos del sitio original no cambian.

El color se realza con `saturate(1.15) contrast(1.04)` en `integration/entry.css`, sin recomprimir ni alterar el MP4. Una captura del propio video sirve como poster. La reproducción es silenciosa, en bucle y dentro de la página; el control permite pausar/reanudar con teclado o mouse. Se pausa al salir de pantalla o cambiar de pestaña, y no arranca automáticamente si el navegador pide reducir movimiento. Si la reproducción automática se bloquea, el botón permite iniciarla manualmente.

El video usa su propio contenedor `hero-video-visual`, separado de los estilos de la tarjeta anterior. Se retira el antiguo `hero-visual` y su fondo rojo decorativo; la grilla alinea el video con el comienzo del título. En pantallas de hasta 1080 px se apila sin ese desplazamiento superior.

La configuración general está en una barra horizontal: modelo/tamaño, papel y Frente 180°/Diseño 360°. La barra derecha contiene acciones sobre el arte, con sliders en dos columnas, vista plana compacta y el acceso comercial Pedí presupuesto. Las medidas y las explicaciones se expanden en el flujo de la página, sin alto máximo ni scroll interno. La rueda normal sobre el vaso desplaza la página; botones +/−, teclado, dos dedos y Ctrl/gesto de trackpad conservan el zoom. En móvil la barra superior se adapta a dos filas y las acciones quedan debajo del visor.

Modelo/tamaño se divide en dos bloques paralelos: Tipo de envase y Tamaño. Los menús HTML usan Montserrat y muestran tres tipos y únicamente las 2–5 medidas disponibles de cada uno. La sección Pendientes de ficha se retiró de la interfaz. Los identificadores incompletos siguen rechazados internamente. Un cambio de tipo conserva las onzas actuales cuando ese formato existe; de lo contrario usa 12 oz en vasos u 8 oz en potes, o la primera medida válida. El selector canónico oculto conserva la conexión con el showroom, sin otro desplegable visible.

`scripts/inline-studio.mjs` extrae el área de trabajo del HTML compilado, cambia su `main` por un contenedor y baja los niveles de encabezado. Prefija IDs y referencias accesibles con `studio-`. PostCSS limita todas las reglas al contenedor `#niu-studio` y renombra animaciones; los estilos del visor no afectan al hero ni al showroom. La fuente Montserrat local se comparte con la portada.

`integration/entry.js` importa el motor cuando el visitante se aproxima al configurador, lo enfoca o usa el botón del catálogo. Hasta iniciar se bloquean carga de archivos, selector y ajustes. Los cambios de producto usan el evento local `niupack:select-model`; no reconstruyen la aplicación ni pierden el arte. La selección de modelos se resuelve en `integration/selection.js`. No hay API, almacenamiento ni acceso al OS.

## Proceso de publicación

- El usuario autorizó publicar la portada integrada. Mantener una prueba con archivos reales en teléfonos físicos como comprobación posterior.
- Compilar con `npm.cmd run build:website`: HTML, CSS limitado al módulo y entrada diferida, con rutas relativas bajo `/niupack/`.
- GitHub Pages usa GitHub Actions como origen y publica solo el artefacto del sitio, separado del build de Next.js del OS. No publicar el checkout completo.
- Comprobar los botones del catálogo, navegación interna, rutas de fuente/JS/CSS, JPG/PNG, ajustes 360°, enlace comercial de presupuesto y vista móvil sobre el dominio publicado.
- El build público retira el indicador local y `noindex`; la demo conserva esas opciones.

El motor se carga al aproximarse al configurador, no al iniciar la portada. No se incorpora un iframe ni se crea una ruta del OS. Las imágenes continúan procesándose en memoria dentro del navegador.

## Datos de los tamaños

`npm.cmd run catalog:import` valida `data/supplier-models.json` y genera el módulo estático. Los diez PDF de Mingyuan y Ruida fueron revisados localmente; no se copian al sitio. Por instrucción del usuario, sus cotas nominales reemplazan el antiguo catálogo web y las bases estimadas. No se consulta el OS. Ver `FUENTES.md` para los modelos, referencias y derivaciones geométricas.

El pote de 8 oz de Mingyuan se mantiene separado; el vaso de 8 oz se sustituye por el Ruida de 9 oz, con variantes simple y doble. El módulo también incorpora potes de 3/5 oz, vaso de 6 oz, simples de 12/16/21 oz y doble de 12 oz. Los formatos de 4/24 oz quedan pendientes. El selector muestra proveedor y archivo fuente; conserva el arte y todos los ajustes al cambiar de modelo.

El módulo usa pie, inclinación, espesor, borde y fondo del plano, sin bases proporcionales inventadas. El desarrollo de troquel se conserva como referencia separada: incluye pliegues y solapes y no se confunde con la superficie visible. El PNG no es un archivo industrial de impresión. El showroom de la web original mantiene sus datos anteriores hasta una actualización pública autorizada.

## Identidad visual aplicada

Referencia: `https://bjjrage.github.io/niupack/`, contrastada con `css/styles.css` del sitio. Montserrat, rojo `#f53732`, tinta `#15191f`, gris `#66717d`, fondos claros, superficies con esquinas suaves, cabecera roja y logo blanco. La acción principal usa una variante roja más oscura para dar contraste al texto pequeño.

La fuente variable Montserrat está incluida localmente con su licencia SIL OFL en `public/fonts/`; no se requiere Google Fonts en tiempo de ejecución. Los estilos del módulo son independientes para evitar conflictos con el showroom. La iluminación, materiales y carga de imágenes conservan su implementación. La geometría y el mapeo ahora reciben las dimensiones del modelo seleccionado; se mantiene el funcionamiento del ajuste independiente de ancho/altura.
