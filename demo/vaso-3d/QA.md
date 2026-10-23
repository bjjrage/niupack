# Evidencia de validación · 23 de octubre de 2026

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
