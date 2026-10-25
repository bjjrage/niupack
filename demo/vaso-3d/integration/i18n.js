// Shared by the static generator and the browser. User artwork is never translated.
const rows = [
  ['Vista local de integración', 'Local integration preview', 'Prévia local da integração'],
  ['Configuración del envase', 'Container setup', 'Configuração da embalagem'],
  ['Modelo y tamaño', 'Model and size', 'Modelo e tamanho'],
  ['Tipo de envase', 'Container type', 'Tipo de embalagem'],
  ['Tamaño', 'Size', 'Tamanho'],
  ['Vaso · pared simple', 'Cup · single wall', 'Copo · parede simples'],
  ['Vaso · pared doble', 'Cup · double wall', 'Copo · parede dupla'],
  ['Pote · pared simple', 'Pot · single wall', 'Pote · parede simples'],
  ['Vasos · Pared simple', 'Cups · Single wall', 'Copos · Parede simples'],
  ['Vasos · Pared doble', 'Cups · Double wall', 'Copos · Parede dupla'],
  ['Potes · Pared simple', 'Pots · Single wall', 'Potes · Parede simples'],
  ['Vaso', 'Cup', 'Copo'], ['Pote', 'Pot', 'Pote'],
  ['Pared simple', 'Single wall', 'Parede simples'], ['Pared doble', 'Double wall', 'Parede dupla'],
  ['Papel', 'Paper', 'Papel'], ['Blanco', 'White', 'Branco'], ['blanco', 'white', 'branco'],
  ['Aplicación del diseño', 'Artwork placement', 'Aplicação da arte'],
  ['Frente 180°', 'Front 180°', 'Frente 180°'], ['Diseño 360°', '360° wrap', 'Arte 360°'],
  ['Ver medidas y datos del modelo', 'View model dimensions and details', 'Ver medidas e dados do modelo'],
  ['Elegí un vaso o un pote. Tu arte y ajustes 360° se conservan.', 'Choose a cup or pot. Your artwork and 360° settings are preserved.', 'Escolha um copo ou pote. Sua arte e os ajustes 360° são mantidos.'],
  ['Medidas nominales en milímetros', 'Nominal dimensions in millimeters', 'Medidas nominais em milímetros'],
  ['Modelo', 'Model', 'Modelo'], ['Boca', 'Rim', 'Boca'], ['Altura', 'Height', 'Altura'], ['Apoyo', 'Foot', 'Apoio'],
  ['VASOS PERSONALIZADOS', 'CUSTOM CUPS', 'COPOS PERSONALIZADOS'],
  ['Tu marca,', 'Your brand,', 'Sua marca,'], ['en tus manos.', 'in your hands.', 'nas suas mãos.'],
  ['Subí tu diseño. Girá el vaso.', 'Upload your artwork. Rotate the cup.', 'Envie sua arte. Gire o copo.'],
  ['Visualizá tu próxima idea.', 'Preview your next idea.', 'Visualize sua próxima ideia.'],
  ['Vaso 3D. Arrastrá para girar. Flechas izquierda y derecha para rotar; arriba y abajo para inclinar; más y menos para acercar o alejar.', '3D cup. Drag to rotate. Left and right arrows rotate; up and down tilt; plus and minus zoom in or out.', 'Copo 3D. Arraste para girar. Setas esquerda e direita giram; para cima e para baixo inclinam; mais e menos aproximam ou afastam.'],
  ['Preparando tu vaso…', 'Preparing your cup…', 'Preparando seu copo…'],
  ['El visor necesita aceleración 3D.', 'The viewer requires 3D acceleration.', 'O visualizador precisa de aceleração 3D.'],
  ['Probá abrirlo en un navegador actualizado con WebGL 2 habilitado.', 'Try an up-to-date browser with WebGL 2 enabled.', 'Use um navegador atualizado com WebGL 2 habilitado.'],
  ['Volver a cargar', 'Reload', 'Recarregar'],
  ['VASO 12 OZ · PARED SIMPLE', 'CUP 12 OZ · SINGLE WALL', 'COPO 12 OZ · PAREDE SIMPLES'],
  ['Medidas del plano de Ruida', 'Dimensions from the Ruida drawing', 'Medidas do desenho da Ruida'],
  ['Controles de vista', 'View controls', 'Controles de visualização'],
  ['Acercar vaso', 'Zoom in on cup', 'Aproximar copo'], ['Acercar', 'Zoom in', 'Aproximar'],
  ['Alejar vaso', 'Zoom out from cup', 'Afastar copo'], ['Alejar', 'Zoom out', 'Afastar'],
  ['Restablecer vista', 'Reset view', 'Restaurar visualização'],
  ['Arrastrá para girar · Zoom con +/− o dos dedos', 'Drag to rotate · Zoom with +/− or two fingers', 'Arraste para girar · Zoom com +/− ou dois dedos'],
  ['Vistas del vaso', 'Cup views', 'Vistas do copo'], ['Ver frente', 'View front', 'Ver frente'], ['Ver reverso', 'View back', 'Ver verso'],
  ['Vista 3D en vivo', 'Live 3D view', 'Visualização 3D ao vivo'],
  ['Tu diseño', 'Your artwork', 'Sua arte'], ['Restablecer', 'Reset', 'Restaurar'],
  ['Subí tu diseño', 'Upload your artwork', 'Envie sua arte'], ['Subí tu imagen', 'Upload your image', 'Envie sua imagem'],
  ['JPG / PNG · hasta 12 MB · o arrastrala acá', 'JPG / PNG · up to 12 MB · or drag it here', 'JPG / PNG · até 12 MB · ou arraste aqui'],
  ['Diseño de ejemplo', 'Sample artwork', 'Arte de exemplo'],
  ['Probá los controles o subí el tuyo', 'Try the controls or upload your own', 'Teste os controles ou envie sua arte'],
  ['Quitar diseño', 'Remove artwork', 'Remover arte'],
  ['Archivo privado: no se envía a un servidor.', 'Private file: never uploaded to a server.', 'Arquivo privado: não é enviado a um servidor.'],
  ['Ajustá los detalles', 'Adjust the details', 'Ajuste os detalhes'], ['Ajustes de diseño', 'Artwork settings', 'Ajustes da arte'],
  ['Dos mitades completas de 180 grados: frente a la izquierda y reverso a la derecha.', 'Two complete 180-degree halves: front on the left and back on the right.', 'Duas metades completas de 180 graus: frente à esquerda e verso à direita.'],
  ['Banda rectangular del diseño 360 grados: centro al frente y extremos unidos atrás.', 'Rectangular 360-degree artwork band: the center is at the front and the edges meet at the back.', 'Faixa retangular da arte 360 graus: centro na frente e extremidades unidas atrás.'],
  ['Frente · 180°', 'Front · 180°', 'Frente · 180°'], ['Reverso · 180°', 'Back · 180°', 'Verso · 180°'],
  ['Reverso libre · 180°', 'Empty back · 180°', 'Verso livre · 180°'], ['Reverso', 'Back', 'Verso'], ['Frente', 'Front', 'Frente'],
  ['Ajuste a los 180° frontales', 'Fit within the front 180°', 'Ajuste aos 180° frontais'],
  ['Ver todo el arte', 'Fit entire artwork', 'Ver toda a arte'], ['Cubrir los 180°', 'Cover the 180°', 'Cobrir os 180°'],
  ['Imagen completa al 100%. Puede dejar márgenes.', 'Entire image at 100%. Margins may remain.', 'Imagem inteira a 100%. Pode deixar margens.'],
  ['Llena cada mitad al 100%. Recorta bordes, sin deformar.', 'Fills each half at 100%. Crops edges without distortion.', 'Preenche cada metade a 100%. Recorta bordas sem deformar.'],
  ['Tamaño del arte', 'Artwork size', 'Tamanho da arte'], ['Tamaño frontal', 'Front size', 'Tamanho frontal'], ['Rotación', 'Rotation', 'Rotação'],
  ['Duplicar en reverso', 'Duplicate on back', 'Duplicar no verso'], ['Reverso libre', 'Empty back', 'Verso livre'], ['Frente y reverso', 'Front and back', 'Frente e verso'],
  ['Copia los 180° frontales a los 180° posteriores, con la misma orientación y proporciones.', 'Copies the front 180° to the back 180° with the same orientation and proportions.', 'Copia os 180° frontais para os 180° traseiros, com a mesma orientação e proporções.'],
  ['Los cambios del frente se copian igual atrás. Cada mitad recorta el arte en sus propios límites. Pulsá de nuevo para quitar la copia.', 'Front changes are copied exactly to the back. Each half clips artwork within its own boundaries. Click again to remove the copy.', 'As mudanças da frente são copiadas igualmente no verso. Cada metade recorta a arte nos próprios limites. Clique novamente para remover a cópia.'],
  ['Ajustar ancho a 360°', 'Fit width to 360°', 'Ajustar largura a 360°'], ['Libre', 'Free', 'Livre'], ['Ancho 360° activo', '360° width active', 'Largura 360° ativa'],
  ['Conserva la altura elegida; adapta sólo el ancho y no repite el arte.', 'Keeps the chosen height; adjusts only the width without repeating the artwork.', 'Mantém a altura escolhida; adapta apenas a largura, sem repetir a arte.'],
  ['Ayuda de ajustes y formatos', 'Settings and formats help', 'Ajuda sobre ajustes e formatos'],
  ['Ajustá el arte dentro de los 180° frontales. Conserva sus proporciones y se recorta al salir de esa mitad.', 'Adjust artwork within the front 180°. Proportions are preserved and artwork is clipped at the half’s boundaries.', 'Ajuste a arte dentro dos 180° frontais. As proporções são mantidas e a arte é recortada nos limites dessa metade.'],
  ['Diseño continuo sobre el contorno completo. Ajustá tamaño y posición o adaptá el ancho a 360°.', 'Continuous artwork around the full circumference. Adjust size and position or fit the width to 360°.', 'Arte contínua em todo o contorno. Ajuste tamanho e posição ou adapte a largura a 360°.'],
  ['Duplicar en reverso copia exactamente el frente ya ajustado, sin espejo ni superposición. Cubrir los 180° amplía proporcionalmente y recorta bordes; Ver todo el arte puede dejar márgenes. La cobertura inicial se evalúa al 100%, centrado y sin rotación.', 'Duplicate on back copies the adjusted front exactly, without mirroring or overlap. Cover the 180° scales proportionally and crops edges; Fit entire artwork may leave margins. Initial coverage is evaluated at 100%, centered and without rotation.', 'Duplicar no verso copia exatamente a frente já ajustada, sem espelhar nem sobrepor. Cobrir os 180° amplia proporcionalmente e recorta bordas; Ver toda a arte pode deixar margens. A cobertura inicial é avaliada a 100%, centralizada e sem rotação.'],
  ['En Diseño 360°, Ajustar ancho adapta solo el ancho; conserva la altura y no repite el arte. La gráfica se recorta al llegar al borde de impresión.', 'In 360° wrap, Fit width adjusts only the width; it keeps the height without repeating the artwork. Artwork is clipped at the print boundary.', 'Em Arte 360°, Ajustar largura adapta apenas a largura; mantém a altura sem repetir a arte. A arte é recortada no limite de impressão.'],
  ['También podés usar un SVG simple. Subí el diseño plano, sin un vaso de fondo. La rueda desplaza la página; usá +/− o dos dedos para acercar.', 'You can also use a simple SVG. Upload flat artwork without a cup in the background. The mouse wheel scrolls the page; use +/− or two fingers to zoom.', 'Você também pode usar um SVG simples. Envie a arte plana, sem um copo ao fundo. A roda do mouse rola a página; use +/− ou dois dedos para aproximar.'],
  ['El archivo se procesa solo en la memoria de esta pestaña, sin enviarlo a un servidor. Se pierde al cerrar o recargar.', 'The file is processed only in this tab’s memory and is never sent to a server. It is lost when the tab is closed or reloaded.', 'O arquivo é processado apenas na memória desta aba, sem ser enviado a um servidor. Ele é perdido ao fechar ou recarregar.'],
  ['Pedí presupuesto', 'Request a quote', 'Pedir orçamento'],
  ['Pedí presupuesto por WhatsApp (abre en otra pestaña)', 'Request a quote via WhatsApp (opens in a new tab)', 'Pedir orçamento pelo WhatsApp (abre em outra aba)'],
  ['Hola, quiero pedir presupuesto de envases personalizados NIU PACK.', 'Hello, I would like a quote for custom NIU PACK packaging.', 'Olá, gostaria de um orçamento de embalagens personalizadas NIU PACK.'],
  ['Vista ilustrativa · sujeta a revisión de arte final.', 'Illustrative preview · subject to final artwork review.', 'Visualização ilustrativa · sujeita à revisão da arte final.'],
  ['Vasos de NIU PACK en una cafetería', 'NIU PACK cups in a café', 'Copos NIU PACK em uma cafeteria'],
  ['Productos de NIU PACK', 'NIU PACK products', 'Produtos NIU PACK'],
  ['Tu navegador no puede reproducir este video.', 'Your browser cannot play this video.', 'Seu navegador não consegue reproduzir este vídeo.'],
  ['Reproducir video', 'Play video', 'Reproduzir vídeo'], ['Pausar video', 'Pause video', 'Pausar vídeo'],
  ['Consultar este producto en el configurador 3D', 'View this product in the 3D configurator', 'Ver este produto no configurador 3D'],
  ['No pudimos iniciar el configurador. Recargá la página para volver a intentar.', 'The configurator could not start. Reload the page to try again.', 'Não foi possível iniciar o configurador. Recarregue a página para tentar novamente.'],
  ['El visor no pudo iniciar.', 'The viewer could not start.', 'Não foi possível iniciar o visualizador.'],
  ['El configurador 3D está disponible para vasos y potes. Elegí uno de los modelos disponibles.', 'The 3D configurator is available for cups and pots. Choose an available model.', 'O configurador 3D está disponível para copos e potes. Escolha um dos modelos disponíveis.'],
  ['El vaso de 8 oz fue reemplazado por el modelo de 9 oz de Ruida.', 'The 8 oz cup was replaced by the Ruida 9 oz model.', 'O copo de 8 oz foi substituído pelo modelo de 9 oz da Ruida.'],
  ['Ancho ajustado a 360°. Conservamos la altura elegida, sin repetir el arte.', 'Width fitted to 360°. The chosen height is preserved without repeating the artwork.', 'Largura ajustada a 360°. A altura escolhida foi mantida, sem repetir a arte.'],
  ['Ajuste de ancho desactivado. El arte recuperó sus proporciones.', 'Width fitting turned off. Original artwork proportions restored.', 'Ajuste de largura desativado. As proporções originais da arte foram restauradas.'],
  ['Frente duplicado en el reverso. Los cambios se aplican igual en ambas mitades.', 'Front duplicated on the back. Changes apply equally to both halves.', 'Frente duplicada no verso. As mudanças são aplicadas igualmente nas duas metades.'],
  ['Copia posterior desactivada. Conservamos el frente y sus ajustes.', 'Back copy turned off. Front artwork and settings are preserved.', 'Cópia no verso desativada. A frente e seus ajustes foram mantidos.'],
  ['Ajuste para cubrir los 180°. Conservamos las proporciones; los bordes sobrantes se recortan.', 'Fit to cover the 180°. Proportions are preserved; excess edges are cropped.', 'Ajuste para cobrir os 180°. As proporções são mantidas; as bordas excedentes são recortadas.'],
  ['Ajuste para ver el arte completo. Conservamos la posición y el tamaño elegido.', 'Fit to show the entire artwork. Position and chosen size are preserved.', 'Ajuste para ver toda a arte. A posição e o tamanho escolhido foram mantidos.'],
  ['La imagen es pequeña y puede verse pixelada al ampliarla.', 'The image is small and may look pixelated when enlarged.', 'A imagem é pequena e pode ficar pixelada ao ampliar.'],
  ['El fondo del JPG también se aplica. Para un logo sin fondo, usá PNG con transparencia.', 'The JPG background is also applied. For a logo without a background, use a transparent PNG.', 'O fundo do JPG também é aplicado. Para um logo sem fundo, use PNG com transparência.'],
  ['Se redujo la resolución para cuidar el rendimiento del visor.', 'Resolution was reduced to maintain viewer performance.', 'A resolução foi reduzida para manter o desempenho do visualizador.'],
  ['Esperá a que termine de cargar la imagen actual.', 'Wait for the current image to finish loading.', 'Aguarde o carregamento da imagem atual.'],
  ['Preparando tu imagen…', 'Preparing your image…', 'Preparando sua imagem…'],
  ['Tu diseño ya está sobre el vaso.', 'Your artwork is now on the cup.', 'Sua arte já está no copo.'],
  ['No se pudo cargar la imagen.', 'The image could not be loaded.', 'Não foi possível carregar a imagem.'],
  ['Subí una imagen por vez.', 'Upload one image at a time.', 'Envie uma imagem por vez.'],
  ['Ajustes restablecidos.', 'Settings reset.', 'Ajustes restaurados.'],
  ['Diseño eliminado. Podés subir otra imagen.', 'Artwork removed. You can upload another image.', 'Arte removida. Você pode enviar outra imagem.'],
  ['La vista 3D se interrumpió. Estamos intentando recuperarla; tu diseño sigue en esta pestaña.', 'The 3D view was interrupted. We are trying to restore it; your artwork remains in this tab.', 'A visualização 3D foi interrompida. Estamos tentando recuperá-la; sua arte continua nesta aba.'],
  ['Elegí una opción', 'Choose an option', 'Escolha uma opção'],
  ['Pendiente', 'Pending', 'Pendente'],
  ['Abrir menú', 'Open menu', 'Abrir menu'], ['Cerrar menú', 'Close menu', 'Fechar menu'],
  ['HECHO PARA ACOMPAÑARTE', 'MADE TO GO WITH YOU', 'FEITO PARA ACOMPANHAR VOCÊ'],
  ['TU', 'YOUR', 'SUA'], ['MARCA.', 'BRAND.', 'MARCA.'], ['EN CADA MOMENTO.', 'IN EVERY MOMENT.', 'EM CADA MOMENTO.'],
  ['El PNG no tiene una cabecera válida.', 'The PNG header is invalid.', 'O cabeçalho do PNG é inválido.'],
  ['El JPG está incompleto o no tiene dimensiones válidas.', 'The JPG is incomplete or has invalid dimensions.', 'O JPG está incompleto ou tem dimensões inválidas.'],
  ['Usá un JPG, PNG o SVG simple. El contenido del archivo no coincide con una imagen compatible.', 'Use JPG, PNG or a simple SVG. The file content does not match a supported image.', 'Use JPG, PNG ou um SVG simples. O conteúdo do arquivo não corresponde a uma imagem compatível.'],
  ['La imagen no tiene dimensiones válidas.', 'The image dimensions are invalid.', 'A imagem não tem dimensões válidas.'],
  ['La imagen supera 16 megapíxeles o 8192 px por lado. Reducí sus dimensiones y volvé a subirla.', 'The image exceeds 16 megapixels or 8192 px per side. Reduce its dimensions and upload it again.', 'A imagem excede 16 megapixels ou 8192 px por lado. Reduza as dimensões e envie novamente.'],
  ['El SVG es demasiado complejo o contiene declaraciones no admitidas. Exportalo como PNG.', 'The SVG is too complex or contains unsupported declarations. Export it as PNG.', 'O SVG é muito complexo ou contém declarações não permitidas. Exporte como PNG.'],
  ['El SVG no es válido. Exportalo nuevamente o usá PNG.', 'The SVG is invalid. Export it again or use PNG.', 'O SVG é inválido. Exporte novamente ou use PNG.'],
  ['El SVG tiene demasiados elementos. Exportalo como PNG para usarlo aquí.', 'The SVG has too many elements. Export it as PNG to use it here.', 'O SVG tem elementos demais. Exporte como PNG para usá-lo aqui.'],
  ['Usá un SVG de formas simples, con textos convertidos a curvas y sin imágenes, filtros ni recursos externos. También podés subir PNG.', 'Use a simple-shape SVG with text converted to paths, without images, filters or external resources. You can also upload PNG.', 'Use um SVG de formas simples, com textos convertidos em curvas e sem imagens, filtros ou recursos externos. Você também pode enviar PNG.'],
  ['Este SVG usa estilos no compatibles. Exportalo como SVG simple o PNG.', 'This SVG uses unsupported styles. Export it as a simple SVG or PNG.', 'Este SVG usa estilos incompatíveis. Exporte como SVG simples ou PNG.'],
  ['Este SVG contiene atributos no compatibles. Exportalo como SVG simple o PNG.', 'This SVG contains unsupported attributes. Export it as a simple SVG or PNG.', 'Este SVG contém atributos incompatíveis. Exporte como SVG simples ou PNG.'],
  ['El SVG contiene referencias externas o estilos no admitidos. Usá PNG o un SVG autocontenido.', 'The SVG contains external references or unsupported styles. Use PNG or a self-contained SVG.', 'O SVG contém referências externas ou estilos não permitidos. Use PNG ou um SVG autocontido.'],
  ['El viewBox del SVG no es válido.', 'The SVG viewBox is invalid.', 'O viewBox do SVG é inválido.'],
  ['No se pudo abrir la imagen a tiempo. Probá con una versión más pequeña.', 'The image could not be opened in time. Try a smaller version.', 'Não foi possível abrir a imagem a tempo. Tente uma versão menor.'],
  ['No se pudo abrir la imagen. Puede estar dañada o usar características incompatibles. Probá exportarla como PNG o JPG.', 'The image could not be opened. It may be damaged or use unsupported features. Try exporting it as PNG or JPG.', 'Não foi possível abrir a imagem. Ela pode estar danificada ou usar recursos incompatíveis. Tente exportar como PNG ou JPG.'],
  ['Elegí una imagen de hasta 12 MB.', 'Choose an image up to 12 MB.', 'Escolha uma imagem de até 12 MB.'],
  ['Formatos admitidos: JPG, PNG y SVG simple.', 'Supported formats: JPG, PNG and simple SVG.', 'Formatos aceitos: JPG, PNG e SVG simples.'],
  ['La extensión no coincide con el contenido del archivo. Exportalo nuevamente como JPG o PNG.', 'The extension does not match the file content. Export it again as JPG or PNG.', 'A extensão não corresponde ao conteúdo do arquivo. Exporte novamente como JPG ou PNG.'],
  ['Este navegador no pudo preparar la imagen.', 'This browser could not prepare the image.', 'Este navegador não conseguiu preparar a imagem.'],
  ['S: pared simple · D: pared doble. Boca: diámetro exterior del borde. Apoyo: diámetro del pie. Medidas nominales de los planos de Mingyuan y Ruida. El vaso de 9 oz reemplaza al vaso de 8 oz; el pote de 8 oz es un modelo independiente.', 'S: single wall · D: double wall. Rim: outer rim diameter. Foot: foot diameter. Nominal dimensions from Mingyuan and Ruida drawings. The 9 oz cup replaces the 8 oz cup; the 8 oz pot is a separate model.', 'S: parede simples · D: parede dupla. Boca: diâmetro externo da borda. Apoio: diâmetro do pé. Medidas nominais dos desenhos de Mingyuan e Ruida. O copo de 9 oz substitui o copo de 8 oz; o pote de 8 oz é um modelo independente.'],
];
const dictionaries = {
  en: new Map(rows.map(([es, en]) => [es, en])),
  pt: new Map(rows.map(([es, , pt]) => [es, pt])),
};
export function pageLocale(language = typeof document === 'undefined' ? 'es' : document.documentElement.lang) {
  return language.toLowerCase().startsWith('en') ? 'en' : language.toLowerCase().startsWith('pt') ? 'pt' : 'es';
}
export function t(source, language = pageLocale()) {
  const locale = pageLocale(language);
  if (locale === 'es' || !source) return source;
  const value = source.trim();
  let translated = dictionaries[locale].get(value);
  if (translated === undefined) {
    const en = locale === 'en';
    let m;
    if ((m = value.match(/^(Vaso|Pote) (\d+) oz(?: · (Pared simple|Pared doble)| ([SD]))$/))) translated = `${t(m[1], locale)} ${m[2]} oz${m[3] ? ' · ' + t(m[3], locale) : ' ' + m[4]}`;
    else if ((m = value.match(/^(.+)\. Conservamos tu arte y ajustes\.$/))) translated = `${m[1]}. ${en ? 'Your artwork and settings are preserved.' : 'Sua arte e seus ajustes foram mantidos.'}`;
    else if ((m = value.match(/^(.+) · Boca (.+) mm · Alto (.+) mm · Apoyo (.+) mm$/))) translated = en ? `${m[1]} · Rim ${m[2]} mm · Height ${m[3]} mm · Foot ${m[4]} mm` : `${m[1]} · Boca ${m[2]} mm · Altura ${m[3]} mm · Apoio ${m[4]} mm`;
    else if ((m = value.match(/^(.+)\. Medidas del plano de (.+)\. Tu arte y ajustes 360° se conservan\.$/))) translated = en ? `${m[1]}. Dimensions from the ${m[2]} drawing. Your artwork and 360° settings are preserved.` : `${m[1]}. Medidas do desenho de ${m[2]}. Sua arte e os ajustes 360° são mantidos.`;
    else if ((m = value.match(/^Fuente: (.+)$/))) translated = `${en ? 'Source' : 'Fonte'}: ${m[1]}`;
    else if ((m = value.match(/^Ancho completo con altura al (\d+)%\. Pulsá de nuevo para deshacer\. El tamaño ajusta ahora la altura\.$/))) translated = en ? `Full width with height at ${m[1]}%. Click again to undo. Size now adjusts the height.` : `Largura completa com altura em ${m[1]}%. Clique novamente para desfazer. O tamanho agora ajusta a altura.`;
    else if ((m = value.match(/^El (pote|vaso) de (\d+) oz todavía no tiene un modelo 3D disponible\. Elegí otro tamaño en el configurador\.$/))) translated = en ? `The ${m[2]} oz ${m[1] === 'pote' ? 'pot' : 'cup'} does not have a 3D model yet. Choose another size in the configurator.` : `O ${m[1] === 'pote' ? 'pote' : 'copo'} de ${m[2]} oz ainda não tem um modelo 3D disponível. Escolha outro tamanho no configurador.`;
    else if ((m = value.match(/^Hola, quiero pedir presupuesto de un envase personalizado NIU PACK\.\nModelo: (.+)\.\nPapel: (.+)\.$/))) translated = en ? `Hello, I would like a quote for custom NIU PACK packaging.\nModel: ${m[1]}.\nPaper: ${t(m[2], locale)}.` : `Olá, gostaria de um orçamento de uma embalagem personalizada NIU PACK.\nModelo: ${m[1]}.\nPapel: ${t(m[2], locale)}.`;
  }
  return translated === undefined ? source : source.replace(value, () => translated);
}
const escapeHTML = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function translateMarkup(html, locale) {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (whole, tag, text) => {
    if (!tag) return escapeHTML(t(text, locale));
    return tag.replace(/\b(aria-label|title|alt)="([^"]*)"/g, (_, attribute, value) => `${attribute}="${escapeHTML(t(value, locale))}"`)
      .replace(/href="(https:\/\/wa\.me\/595971350619\?text=)([^"]*)"/g, (_, prefix, value) => `href="${prefix}${encodeURIComponent(t(decodeURIComponent(value), locale))}"`);
  });
}
