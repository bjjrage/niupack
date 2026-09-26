# Design QA - carrusel interno de vasos

- Visual target: showroom existente de NIU PACK y comportamiento solicitado por el usuario.
- Primary state: categoria Vasos, seleccion de tipo y tamano.
- Automated browser capture: bloqueada porque la politica del navegador no admite la pagina local `file://`.

**Interaction implemented**

- La imagen general de la categoria permanece como estado inicial.
- Elegir un tamano con mock disponible activa un carrusel interno.
- El vaso elegido permanece centrado y los tamanos anterior y siguiente aparecen en perspectiva.
- Las categorias vecinas desaparecen mientras el carrusel interno esta activo.
- Flechas y gesto horizontal recorren los tamanos y mantienen sincronizado el selector.
- El contador cambia de categorias a progreso dentro de la familia.
- Elegir `Todos` o cambiar de categoria restaura el carrusel principal.
- Funciona con los siete vasos de pared simple y los dos mocks disponibles de pared doble.

**Verification**

- JavaScript validado con `node --check`.
- Diff validado con `git diff --check`.
- Estados de entrada, avance circular, salida y cambio de categoria revisados en codigo.
- Comparacion visual e interaccion real: bloqueadas hasta que el usuario recargue la pagina local.

**Compact orbit iteration**

- Los vasos vecinos pasan de una orbita amplia a centros aproximados de 31% y 69% del escenario.
- La profundidad baja de `-260px` a `-120px` y la rotacion de 28 a 16 grados.
- La escala lateral sube de `.72` a `.82`, formando un grupo visual continuo alrededor del vaso central.
- La transicion se reduce de 720 a 560 ms para que el giro corto responda con mayor agilidad.

**Depth hierarchy correction**

- Source screenshot: `C:\Users\User\AppData\Local\Temp\codex-clipboard-59b1ce85-5231-4b60-afed-08ff6666e302.png`.
- Finding [P1]: el vaso lateral de 24 oz conservaba una escala tan grande que parecia estar delante del vaso central de 4 oz.
- Los previews laterales ahora normalizan el 75% de la diferencia extrema de escala respecto del seleccionado.
- El producto central avanza a `translateZ(150px)` y `z-index: 5`; los laterales retroceden a `translateZ(-220px)` y `z-index: 1`.
- Los laterales bajan a 46% de opacidad, con menor brillo, saturacion y un desenfoque de 1 px.
- El producto central recibe sombra mas definida y un leve aumento de brillo para fijar el foco frontal.

final result: blocked
