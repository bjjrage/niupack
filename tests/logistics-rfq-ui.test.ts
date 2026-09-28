import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { RoadPanel } from '@/components/logistics/LogisticsWorkspace';

describe('road RFQ form labels', () => {
  it('renders visible labels for every RFQ field', () => {
    const html = renderToStaticMarkup(createElement(RoadPanel, { rfqs: [], quotes: [], suppliers: [], reload: async () => undefined, setFeedback: () => undefined }));

    for (const label of [
      'País de origen',
      'Ciudad de origen',
      'País de destino',
      'Ciudad de destino',
      'Fecha de carga *',
      'Entrega objetivo (opcional)',
      'Descripción de la carga',
      'Tipo de equipo',
      'Peso (kg)',
      'Volumen (m³)',
      'Pallets',
      'Condición comercial',
      'Fecha límite para cotizar',
    ]) {
      expect(html).toContain(label);
    }

    expect(html).toContain('name="delivery_target_date"');
    expect(html).not.toContain('name="delivery_target_date" required');
  });
});
