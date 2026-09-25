'use client';

import React from 'react';
import { CopilotProvider } from './CopilotContext';
import { NiuCopilotDrawer } from './NiuCopilotDrawer';

export const CopilotLayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <CopilotProvider>
      {children}
      <NiuCopilotDrawer />
    </CopilotProvider>
  );
};
