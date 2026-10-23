# NIUPACK · Estudio de vasos 3D

Prototipo local independiente para **un vaso de polipapel de 12 oz, pared simple**. No modifica ni integra la web pública, el showroom, el CRM o el OS. No contiene backend, almacenamiento, cuentas, cotizaciones ni generación de arte industrial.

## Abrir en Windows

Requisito: Node.js **22.12 o superior** (probado con 24.20.0). Doble clic en `ABRIR_DEMO.bat` desde esta carpeta. La ventana debe permanecer abierta mientras probás.

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

- Geometría WebGL 2 auténtica: cuerpo cónico, pared interior, borde enrollado, base y fondo interior. Órbita de 360°, inclinación limitada y zoom con mouse, teclado o gestos de OrbitControls.
- JPG y PNG como formatos principales; SVG estático simple opcional. Carga mediante selector o arrastre.
- Tamaño, posición horizontal alrededor del vaso, altura y rotación independientes. Restablecer ajustes, quitar diseño, cambiar blanco/kraft y restablecer cámara.
- Dos aplicaciones explícitas: **Logo** conserva la imagen como una marca frontal; **Diseño 360°** cubre toda la zona imprimible con una escala uniforme, recortando los bordes necesarios. Los archivos con proporción horizontal de al menos 1.25 se cargan inicialmente en Diseño 360°; el usuario puede cambiarlo. Las transparencias siempre dejan ver el papel.
- Vista plana de la zona imprimible y accesos **Ver frente / Ver reverso**. Al cargar otra imagen se devuelve la cámara al frente. Restablecer conserva el modo elegido y devuelve la escala a 100%; en 360° ese es el mínimo de cobertura.
- Mapeo UV mediante el desarrollo en sector anular del cono, para evitar el estiramiento artificial de un mapeo cilíndrico. El diseño se recorta al área de impresión y continúa alrededor de la unión posterior.
- PNG del render real, con diseño y fondo. La captura copia inmediatamente el buffer de WebGL antes de codificar el PNG.
- Iluminación de estudio, material mate, grano procedural, sombras y reflejos discretos. Recursos de presentación generados localmente mediante código.
- Renderizado a demanda, límite de pixel ratio, texturas de 1024 px en móvil y hasta 2048 px en escritorio; los diseños se reducen proporcionalmente a un máximo de 2048 px.
- Pérdida/restauración del contexto: mantiene el canvas del diseño en la pestaña y reconstruye la iluminación generada en GPU al recuperarse.

## Archivos de cliente y privacidad

- Máximo **12 MiB**, **16 megapíxeles** y **8192 px por lado**. Se comprueban las dimensiones de PNG/JPG desde la cabecera antes de decodificar.
- Se valida el contenido y su concordancia con la extensión. Se rechazan archivos dañados con un mensaje y se conserva el diseño anterior.
- JPG conserva su fondo. PNG conserva su transparencia. No hay eliminación de fondo, vectorización ni cambios generativos del arte.
- El SVG admite formas, grupos, gradientes y recortes internos. Rechaza scripts, imágenes incrustadas, fuentes/textos, animaciones, filtros, estilos no admitidos, referencias externas y documentos muy complejos. Convertir texto a curvas o exportar PNG cuando corresponda. Se decodifica como imagen desde un Blob; nunca se inserta como HTML.
- Los diseños se procesan en memoria dentro del navegador, no se envían a ningún servicio ni se guardan en localStorage/IndexedDB. Al cerrar o recargar se pierden. Al descargar, el PNG queda en la carpeta de descargas elegida por el navegador.
- Las dependencias se empaquetan localmente: el visor no usa CDN ni APIs. El servidor del build envía CSP con `connect-src 'none'`.

## Aislamiento y publicación futura

Todo el código, configuración, dependencias y pruebas están en esta carpeta. `package.json` y `package-lock.json` son propios. Vite usa una configuración PostCSS vacía para no cargar la del OS.

Los fuentes TypeScript usan extensión **`.mts`**, que los patrones actuales `**/*.ts` / `**/*.tsx` del OS no incluyen. Se verificó la configuración del OS: **0 archivos del demo incluidos**. No se modifican `tsconfig.json`, `next.config.ts`, PostCSS ni el package de la raíz.

`dist/` utiliza rutas relativas (`base: './'`). Para una publicación futura, el contenido de ese build debe ocupar la ruta estática elegida; no alcanza con copiar TypeScript a GitHub Pages. No se creó workflow de deployment, no se cambió la web pública y no se hizo push ni merge. No ejecutar un deployment sin autorización.

## Comprobaciones

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

La suite de Node comprueba cabeceras PNG/JPG, archivos inválidos, límites de píxeles, continuidad y escala del mapeo cónico y conservación de proporciones.

Para las pruebas de navegador, ejecutar `npm.cmd run dev` y abrir **http://127.0.0.1:4173/demo/vaso-3d/qa/browser.html**. Pulsar **Ejecutar pruebas**. Ese banco de pruebas no se incluye en el build de producción. Prueba carga de JPG/PNG/SVG, transparencia, rechazo de contenido peligroso/dañado, límite de peso, reemplazos, capturas repetidas y recuperación WebGL conservando el diseño.

Ver `QA.md` para la evidencia y los límites de esta validación.

## Tecnologías y archivos

- Three.js 0.186.1, OrbitControls, RoomEnvironment, Canvas 2D nativo, TypeScript 5.9.3, Vite 8.3.5. Node nativo para servir el build y ejecutar pruebas. Sin React, Next.js, IA ni backend.
- `index.html`, `src/style.css`: interfaz responsive y accesible.
- `src/studio.mts`: geometría, materiales, cámara, UV, exportación y ciclo de vida WebGL.
- `src/layout.mts`: desarrollo geométrico, ajuste frontal y cobertura del arte envolvente.
- `src/print.mts`: composición compartida de la textura y la vista plana; cada copia se limita a su sector para evitar superposición en la unión.
- `src/artwork.mts`: validación y procesamiento de imágenes.
- `src/main.mts`: acciones de interfaz, carga, ajustes y estados.
- `public/`: copia del logo existente y favicon.
- `qa/`: pruebas y archivos de ejemplo sintéticos, sin datos de clientes.
- `serve.mjs`, `ABRIR_DEMO.bat`: ejecución local; `vite.config.mjs`, `tsconfig.json`, `package*.json`: build aislado.

## Límites conocidos

Es un mockup comercial. Las medidas y colores no certifican un troquel ni una prueba de imprenta. La perspectiva y la curvatura cambian naturalmente la apariencia del diseño. El material kraft es una aproximación de pantalla, no una simulación de tintas/absorción o de tinta blanca. Una foto de un vaso ya impreso no sustituye al diseño plano. Un JPG/PNG pequeño no recupera detalle por ampliarlo. Revisar siempre el arte antes de fabricar.

La validación móvil se realizó mediante viewport responsive en Chromium, sin certificar dispositivos físicos, Safari de iPhone, autonomía, temperatura o FPS en celulares de gama baja. WebGL 2 y aceleración gráfica son necesarios. Si no se pueden iniciar, aparece una explicación y la descarga queda deshabilitada.
