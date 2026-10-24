# Integración del configurador en la web de NIU PACK

## Estado actual

La adaptación está únicamente en `/demo/vaso-3d/`. No se agregó ningún acceso al sitio publicado ni se modificaron el showroom o el OS. La demo incluye su propio encabezado, navegación, pie, tipografía y estilos. Sus enlaces de regreso apuntan al sitio actual de NIU PACK.

## Recorrido propuesto

1. En la sección **Personalización y desarrollo** (`#personalizacion`), agregar **Probá tu diseño en 3D** como acceso principal.
2. En el panel de **Vasos** del showroom, agregar un acceso secundario **Personalizar vaso**. Mantener la consulta comercial existente. No anunciar modelos comerciales disponibles hasta completar sus fichas y verificar su geometría.
3. Abrir una subpágina en **`personaliza-tu-vaso/`**, con la misma navegación e identidad visual del sitio. Esa ruta es una propuesta: todavía no está publicada.
4. El cliente sube su JPG/PNG, ajusta tamaño, contorno y posición, inspecciona frente/reverso y descarga el PNG. **Solicitar cotización** abre la sección Contacto de la web en otra pestaña para conservar el arte en el configurador. No envía ni adjunta automáticamente el arte.

## Publicación cuando se apruebe

- Compilar este módulo con su propio `npm.cmd run build`.
- Incorporar el contenido de `dist/` en la carpeta `personaliza-tu-vaso/` del artefacto estático de la web. Su `base: './'` permite servirlo bajo el prefijo `/niupack/` de GitHub Pages, sin llevar sus fuentes o sus dependencias de desarrollo al sitio.
- Integrar ese paso en el proceso de publicación de la web, separado del build de Next.js del OS. No usar el checkout completo como raíz del servidor del configurador.
- Incorporar los dos accesos indicados y comprobar navegación, rutas de fuente/JS/CSS, JPG/PNG, ajustes 360°, exportación y vista móvil sobre el dominio publicado.
- Retirar el indicador **Vista de prueba** y revisar `noindex` cuando se decida lanzar la versión pública. No cambiar esas opciones en la demo actual.

El motor se carga solamente en la subpágina; la página principal conserva su carga actual. No se incorpora un iframe ni se crea una ruta del OS. Las imágenes continúan procesándose en memoria dentro del navegador.

## Datos de los tamaños

`npm.cmd run catalog:import` lee la tabla literal `cupDimensions` de `js/showroom.js` mediante el parser de TypeScript y genera un módulo estático propio. El build y las pruebas ejecutan esa importación. Los datos no se consultan desde el navegador ni se completan con datos de ejemplo del OS.

Hoy faltan los diámetros de base de los siete formatos. El usuario autorizó estimarlos para la demo: se usa 2/3 de la boca (proporción del prototipo original), redondeado a 0,1 mm. Las siete vistas aproximadas ya se pueden seleccionar y cambian la geometría y el mapeo, conservando el arte y los ajustes. Las estimaciones se calculan en una capa aparte: el módulo importado sigue manteniendo las bases ausentes como null.

El selector, la tabla, el visor y el nombre del PNG indican que son aproximaciones. La boca y altura se mantienen tal como aparecen en el catálogo, incluidas sus notas de aproximación o pared doble. Una base real en la fuente sustituye la estimación. Boca o altura ausente, base inválida o diámetros invertidos mantienen el formato deshabilitado. Antes de ofrecer medidas de producción, completar las fichas validadas y confirmar el tipo de pared; estas vistas no generan un troquel industrial.

## Identidad visual aplicada

Referencia: `https://bjjrage.github.io/niupack/`, contrastada con `css/styles.css` del sitio. Montserrat, rojo `#f53732`, tinta `#15191f`, gris `#66717d`, fondos claros, superficies con esquinas suaves, cabecera roja y logo blanco. La acción principal usa una variante roja más oscura para dar contraste al texto pequeño.

La fuente variable Montserrat está incluida localmente con su licencia SIL OFL en `public/fonts/`; no se requiere Google Fonts en tiempo de ejecución. Los estilos del módulo son independientes para evitar conflictos con el showroom. La iluminación, materiales y carga de imágenes conservan su implementación. La geometría y el mapeo ahora reciben las dimensiones del modelo seleccionado; se mantiene el funcionamiento del ajuste independiente de ancho/altura.
