import React from 'react';
import { ExportLogisticsClient } from './logistics-client';

export const metadata = {
  title: 'Export Logistics & Landed Cost | NIU Intelligence OS',
  description: 'Cálculo determinístico de FCL, LCL, Break-even logístico y Landed Cost de exportación.',
};

export default function ExportLogisticsPage() {
  return <ExportLogisticsClient />;
}
