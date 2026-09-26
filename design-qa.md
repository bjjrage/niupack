# Design QA - restauracion de categoria y drag del mini carrusel

- Scope: categoria Vasos y carrusel interno de tamanos.
- Automated browser capture: bloqueada porque la pagina local usa `file://`.

**Fixes implemented**

- Se restauro en los tres idiomas la imagen original `assets/Imagenes/VASOS ULTIMOS.png` como estado de categoria.
- Los mockups rojos y blancos quedan limitados a los tamanos individuales.
- Los vasos laterales pasan de centros aproximados 31/69 a 25/75 para evitar superposicion excesiva.
- `pointermove` ahora interpola en tiempo real posicion horizontal, profundidad, rotacion, escala, opacidad, brillo y desenfoque.
- El vaso destino avanza desde `translateZ(-220px)` hasta `150px` mientras el central retrocede.
- Al soltar, la transicion se reactiva un frame antes de limpiar los estilos del drag, evitando el salto brusco.
- La duracion del carrusel interno sube a 680 ms con la misma curva 3D del carrusel principal y un recorrido horizontal menor.

**Verification**

- Sintaxis validada con `node --check`; formato validado con `git diff --check`.
- Comparacion visual real bloqueada hasta recargar la pagina local.

final result: blocked
