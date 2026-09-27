# Design QA - continuidad del drag en mini carruseles

- Scope: drag y encastre de los mini carruseles de Vasos y Potes y bowls.
- Automated browser capture: bloqueada porque la pagina local usa `file://`.

**Cambios implementados**

- Al soltar, el elemento ya no cambia de estado en mitad del recorrido.
- El movimiento completa suavemente el tramo restante hasta el centro durante 280 ms.
- La escala real del producto entrante se interpola dentro del drag, no despues del encastre.
- El recambio del mockup central omite el segundo crossfade y conserva el mismo cuadro visual al soltar.
- Si el gesto no supera el umbral, vuelve a su posicion original durante 220 ms.
- El cambio de producto se ejecuta al final de la interpolacion y los estilos temporales se limpian sin un frame intermedio visible.
- Se conserva la profundidad 3D, el recorrido corto y las imagenes existentes.

**Verification**

- Sintaxis validada con `node --check`; formato validado con `git diff --check`.
- Comparacion visual real pendiente de recargar la pagina local con `Ctrl+F5`.

final result: blocked

## Medidas de pared doble

- Los vasos de pared doble de 8 y 12 oz muestran diámetro y altura.
- Cada mockup usa su propia relación de aspecto y límites transparentes para alinear las reglas con la boca y la altura real del vaso.
- Cotas aplicadas: 8 oz, Ø 78,12 mm × 83 mm; 12 oz, Ø 83,8 mm × 110 mm.

## Tapas viajeras

- Se creó `assets/showroom/lids-traveler-all-v1.png`, composición cuadrada de tres tapas viajeras con transparencia alfa real.
- La disposición replica la jerarquía visual de la categoría existente: perfil superior, pieza central dominante y pieza inferior inclinada.
- “Viajera” se agregó como tercera opción en español, inglés y portugués, con tamaños 8, 12 y 16 oz.
- La imagen original de la categoría Tapas permanece como estado predeterminado.
- El mockup se muestra como opción dentro de la categoría Tapas; no crea una categoría adicional.
- El selector Diseño contiene únicamente Tapa con pico y Tapa viajera.
- Al seleccionar Tapa viajera, la imagen cambia al montaje transparente nuevo y los tamaños pasan a 8, 12 y 16 oz.
