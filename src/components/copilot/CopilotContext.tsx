'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotScreenContext, CopilotAction } from '@/types';

interface CopilotContextType {
  isOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  screenContext: CopilotScreenContext;
  updateScreenContext: (ctx: Partial<CopilotScreenContext>) => void;
  executeAction: (action: CopilotAction) => void;
  registerActionHandler: (handler: (action: CopilotAction) => void) => () => void;
}

const defaultContext: CopilotScreenContext = {
  route: '/',
  module: 'general',
  sku: 'CUP-12OZ-SW',
  market: 'BR',
  volume: 300000,
  unitCostUSD: 0.04609,
  benchmarkUSD: 0.0490,
  gapPercent: -5.94,
};

const CopilotContext = createContext<CopilotContextType | undefined>(undefined);

export const CopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [screenContext, setScreenContext] = useState<CopilotScreenContext>({
    ...defaultContext,
    route: pathname,
    module: deriveModuleFromRoute(pathname),
  });

  // Action handlers registered by active pages
  const handlersRef = useRef<Set<(action: CopilotAction) => void>>(new Set());

  // Update route/module automatically on route change
  useEffect(() => {
    setScreenContext((prev) => ({
      ...prev,
      route: pathname,
      module: deriveModuleFromRoute(pathname),
    }));
  }, [pathname]);

  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const updateScreenContext = useCallback((updates: Partial<CopilotScreenContext>) => {
    setScreenContext((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const registerActionHandler = useCallback((handler: (action: CopilotAction) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const executeAction = useCallback(async (action: CopilotAction) => {
    // Notify server of action status update
    try {
      await fetch('/api/copilot/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id, status: 'CONFIRMED' }),
      });
    } catch (err) {
      console.error('Error confirming action:', err);
    }

    // Call all registered page handlers
    handlersRef.current.forEach((handler) => {
      try {
        handler(action);
      } catch (err) {
        console.error('Error in action handler:', err);
      }
    });
  }, []);

  return (
    <CopilotContext.Provider
      value={{
        isOpen,
        toggleDrawer,
        openDrawer,
        closeDrawer,
        screenContext,
        updateScreenContext,
        executeAction,
        registerActionHandler,
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
};

export const useCopilot = () => {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error('useCopilot must be used within a CopilotProvider');
  }
  return ctx;
};

function deriveModuleFromRoute(route: string): string {
  if (route.startsWith('/cost')) return 'cost';
  if (route.startsWith('/pricing')) return 'pricing';
  if (route.startsWith('/market')) return 'market';
  if (route.startsWith('/rfq')) return 'rfq';
  if (route.startsWith('/visibility')) return 'visibility';
  if (route.startsWith('/strategy')) return 'strategy';
  return 'general';
}
