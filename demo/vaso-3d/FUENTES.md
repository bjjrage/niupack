# Modelos de proveedor · 24 de octubre de 2026

Se revisaron localmente las diez fichas PDF de las carpetas `Downloads/Moldes/Mingyaun` y `Downloads/Moldes/Ruida`. Por indicación del usuario se toman como fuente vigente, reemplazando las medidas del showroom y las bases estimadas anteriores. La carpeta original se llama Mingyaun; el fabricante se identifica como Mingyuan.

Las cotas en `data/supplier-models.json` están expresadas en mm. Cada registro conserva nombre exacto del PDF, página, fecha, revisión y SHA-256 del archivo revisado. No se distribuyen los PDF ni sus datos de contacto. El importador valida los registros antes de generar `src/catalog-data.mts`.

| Modelo | Proveedor | Pared | Boca exterior Ø | Pie de apoyo Ø | Altura total |
|---|---|---|---:|---:|---:|
| Pote 3 oz | Mingyuan | Simple | 70,4 | 57,84 | 40 |
| Pote 5 oz | Mingyuan | Simple | 71,6 | 57,8 | 46 |
| Pote 8 oz | Mingyuan | Simple | 97,01 | 78,36 | 54 |
| Vaso 6 oz | Mingyuan | Simple | 71,99 | 49,34 | 76,5 |
| Vaso 9 oz | Ruida | Simple | 77,8 | 54,94 | 87 |
| Vaso 12 oz | Ruida | Simple | 83,2 | 55,3 | 109 |
| Vaso 16 oz | Ruida | Simple | 89,7 | 61,46 | 124,5 |
| Vaso 21 oz | Ruida | Simple | 89,7 | 60,63 | 166 |
| Vaso 9 oz | Ruida | Doble | 77,83 | 54,94 | 87 |
| Vaso 12 oz | Ruida | Doble | 83,21 | 55,3 | 109 |

El vaso de 8 oz se reemplaza comercialmente por el de 9 oz. El pote de 8 oz es un modelo distinto. No hay planos de 4 ni 24 oz en estas carpetas: quedan deshabilitados, sin extrapolación.

## Interpretación del plano

- El diámetro exterior del borde enrollado no define el diámetro de toda la pared. La pared se construye desde el pie con el ángulo acotado y termina debajo del borde.
- El pie de apoyo, el diámetro de formado a la altura del fondo elevado y el diámetro del disco de corte son cotas distintas. El fondo se coloca a su elevación real. Como verificación independiente, pie + inclinación + elevación − espesor reproducen el diámetro de formado acotado con una diferencia menor que 0,025 mm en todos los modelos.
- Los vasos dobles usan el vaso interior correspondiente, la manga con su propio ángulo, su espesor y su rulo inferior. El vaso queda expuesto 12 mm debajo de la manga. En el doble de 12 oz se usa el diámetro inferior de manga de 60,77 mm. En el doble de 9 oz se deriva esa cota a partir del ángulo, altura y unión superior con el espesor indicado; no se usa una relación de base estimada.
- Los radios y ángulos del desarrollo de troquel se guardan aparte. Sus márgenes de formado y solapes no pertenecen al frustum visible ni al mapa comercial 360°.
- La ficha doble de 12 oz tiene un solape anotado de 6,5 mm y una revisión que indica 8,5 mm; se conserva esa discrepancia en las notas de fuente. No afecta la silueta ensamblada y no se genera un troquel de producción a partir de ella.

La geometría reproduce las cotas nominales y el perfil de las fichas. El material, iluminación y textura de papel son representaciones de pantalla; las tolerancias físicas y el proceso de formado no se simulan. Frente 180° ajusta y recorta una composición por mitad, con duplicación posterior opcional. Diseño 360° conserva su banda continua y el ajuste independiente de ancho.
