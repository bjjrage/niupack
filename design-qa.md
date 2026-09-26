# Design QA - continuidad del drag en mini carruseles

- Scope: drag y encastre de los mini carruseles de Vasos y Potes y bowls.
- Automated browser capture: bloqueada porque la pagina local usa `file://`.

**Cambios implementados**

- Al soltar, el elemento ya no cambia de estado en mitad del recorrido.
- El movimiento completa suavemente el tramo restante hasta el centro durante 280 ms.
- Si el gesto no supera el umbral, vuelve a su posicion original durante 220 ms.
- El cambio de producto se ejecuta al final de la interpolacion y los estilos temporales se limpian sin un frame intermedio visible.
- Se conserva la profundidad 3D, el recorrido corto y las imagenes existentes.

**Verification**

- Sintaxis validada con `node --check`; formato validado con `git diff --check`.
- Comparacion visual real pendiente de recargar la pagina local con `Ctrl+F5`.

final result: blocked
