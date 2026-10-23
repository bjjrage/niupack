# Evidencia de validación · 23 de octubre de 2026

## Resultado

**Build estático y typecheck: PASS. Pruebas de Node: 7/7 PASS. Banco de pruebas de navegador con WebGL real: 8/8 PASS.**

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
| Pérdida y recuperación WebGL mediante `WEBGL_lose_context`, con arte visible en la captura posterior | PASS |

La recuperación se probó después de reconstruir el mapa de entorno generado en GPU. El registro de consola de esta ejecución final no devolvió errores ni advertencias. En la primera ejecución se observaron advertencias de precisión del compilador gráfico del equipo y una constante de sombras obsoleta; se reemplazó la constante por la vigente, `PCFShadowMap`.

## Pruebas de Node

7 casos: lectura de cabecera PNG; JPG baseline y progressive; rechazo de cabeceras dañadas/falsas; límites de resolución; límites y simetría del UV en la unión; escala física de la superficie cónica; proporciones de arte vertical, cuadrado y horizontal en distintos tamaños.

## Aislamiento y privacidad

- Todos los archivos agregados pertenecen a `demo/vaso-3d/`, en la rama `feature/web-3d-cup-configurator` creada desde `main` (base `407236f20b60f8025d3c4876edb59beb3be475c3`).
- La configuración TypeScript del OS se inspeccionó con su propio parser: 415 fuentes y **0 archivos del demo incluidos**. No se modificó ningún archivo existente del OS ni de la web pública. No se ejecutó el build del OS: esta validación comprueba aislamiento, no certifica el estado previo del OS.
- El servidor propio responde 404 a `/src/`, `/.env.local` y accesos fuera de las rutas del demo. Sirve únicamente el build de este módulo.
- El build tiene todas sus dependencias empaquetadas; no usa servicios de carga, IA, analítica ni CDN. CSP del servidor: `connect-src 'none'`. Revisión de fuentes: no hay envío de archivos ni persistencia del arte.
- Build final aproximado: JS 581 kB / 147 kB gzip; CSS 12.8 kB / 3.7 kB gzip. Las texturas de papel y el ejemplo se generan localmente.
- Sin push, merge, deployment ni enlace agregado a la página pública.

## Evidencia local

Los resultados detallados y las capturas de esta sesión están en `qa/artifacts/` (ignorados por Git): `browser-results.txt`, `desktop-jpg.png`, `desktop-png-kraft.png`, `mobile-final.png`, `interior-view.png`, `desktop-final.png`, `export-jpg.png`. Los archivos para repetir las pruebas están versionados en `qa/fixtures/`.

## Pendiente antes de producción

Probar con archivos reales de clientes y teléfonos físicos, especialmente Safari en iPhone y Android de gama baja. Los viewports de Chromium no certifican gestos de un dispositivo real, FPS, consumo de batería ni límites térmicos. Falta aprobación visual/comercial del usuario y cualquier integración o publicación está fuera de esta entrega.

No se promete compatibilidad con SVG arbitrarios, eliminación de fondo, recuperación de detalle inexistente, colores de imprenta ni arte final industrial. Son límites explícitos del prototipo.
