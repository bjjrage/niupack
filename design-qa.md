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

final result: blocked
