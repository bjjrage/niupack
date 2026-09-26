# Design QA — showroom de potes

- Source visual truth: `C:\Users\User\AppData\Local\Temp\codex-clipboard-b99ae34f-cec6-4d1c-98ee-d016caa48d28.png` y `C:\Users\User\AppData\Local\Temp\codex-clipboard-d1f0deb7-44c0-4b65-98f1-89cd5ceb335c.png`
- Implementation screenshot: no disponible después del cambio; el navegador de automatización bloquea URLs `file://`.
- Viewport: recorte aportado por el usuario; viewport completo no disponible.
- Source pixels: 461 × 300 y 609 × 443.
- Implementation pixels/CSS size/density: no capturados.
- State: showroom “Potes y bowls”, selecciones 3 oz y 20 oz.

**Findings**

- [P1] La diferencia visual entre 3 y 5 oz estaba exagerada. Corregido igualando la escala base y manteniendo sólo la diferencia de proporción propia de cada imagen.
- [P1] La cota vertical era ilegible. Corregido con línea de 2 px, mayor contraste, sombra y puntas más grandes.
- [P1] El 20 oz no activaba cotas. Corregido con cotas aproximadas visibles y una aclaración explícita mientras falta la ficha técnica.

**Required fidelity surfaces**

- Fonts and typography: sin cambios.
- Spacing and layout rhythm: se preservó el showroom; sólo cambian escala del producto y posición de cotas.
- Colors and visual tokens: sin cambios; se reforzó el contraste de la línea vertical.
- Image quality and asset fidelity: se conservan los PNG transparentes existentes.
- Copy and content: se agregó una aclaración traducida para las medidas aproximadas de 20 oz.

**Comparison history**

- Iteración 1: las capturas mostraron escala excesiva, línea vertical invisible y ausencia total de cotas en 20 oz.
- Fixes: escalas 3/5 oz igualadas; línea vertical reforzada; overlay habilitado para 20 oz.
- Post-fix visual evidence: bloqueada por la política del navegador para páginas `file://`.

**Implementation checklist**

- Recargar `index.html` con `Ctrl+F5`.
- Revisar 3, 5, 8 y 20 oz en el mismo viewport.
- Reemplazar las cotas aproximadas de 20 oz al recibir su ficha técnica.

final result: blocked
