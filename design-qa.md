# Design QA - mini carrusel de potes y bowls

- Scope: categoria Potes y bowls y sus tamanos 3, 5, 8 y 20 oz.
- Automated browser capture: bloqueada porque la pagina local usa `file://`.

**Cambios implementados**

- La imagen original de categoria permanece intacta como estado por defecto.
- Elegir un tamano activa el mismo mini carrusel 3D utilizado por Vasos.
- Los potes vecinos aparecen separados a ambos lados y el seleccionado ocupa claramente el frente.
- Flechas, contador, clic lateral y selector se mantienen sincronizados.
- El drag interpola posicion, profundidad, rotacion, escala, opacidad, brillo y desenfoque en tiempo real.
- Cambiar de categoria cierra el mini carrusel y devuelve cada categoria a su imagen general.
- No se modificaron los mockups, colores ni dimensiones existentes de los potes.

**Verification**

- Sintaxis validada con `node --check`; formato validado con `git diff --check`.
- Comparacion visual real pendiente de recargar la pagina local con `Ctrl+F5`.

final result: blocked
