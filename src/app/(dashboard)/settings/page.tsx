import React from 'react';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { GmailClient } from '@/lib/gmail/gmail-client';
import SettingsClient from './settings-client';

export const revalidate = 0;

export default async function SettingsPage() {
  const [settings, auditEvents] = await Promise.all([
    repository.getSettings(),
    repository.getAuditEvents(),
  ]);

  const callLogs = OpenAIService.getLogs();
  const totalSpend = OpenAIService.getTotalSpend();
  const isOpenAIConfigured = OpenAIService.isConfigured();
  const gmailStatus = await GmailClient.getStatus();

  return (
    <SettingsClient
      initialSettings={settings}
      initialAuditEvents={auditEvents}
      initialCallLogs={callLogs}
      telemetry={{
        totalSpendUSD: totalSpend,
        isOpenAIConfigured,
        gmailStatus,
      }}
    />
  );
}
