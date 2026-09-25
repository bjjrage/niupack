import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { GmailClient } from '@/lib/gmail/gmail-client';

export async function GET() {
  try {
    const settings = await repository.getSettings();
    const auditEvents = await repository.getAuditEvents();
    const callLogs = OpenAIService.getLogs();
    const totalSpend = OpenAIService.getTotalSpend();
    const isOpenAIConfigured = OpenAIService.isConfigured();
    const gmailStatus = await GmailClient.getStatus();

    return NextResponse.json({
      settings: {
        ...settings,
        gmail_connected: gmailStatus.status === 'CONNECTED',
      },
      auditEvents,
      callLogs,
      telemetry: {
        totalSpendUSD: Number(totalSpend.toFixed(4)),
        isOpenAIConfigured,
        gmailStatus,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error fetching settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await repository.getSettings();

    const updated = await repository.updateSettings({
      max_queries_per_run: body.max_queries_per_run !== undefined ? Number(body.max_queries_per_run) : current.max_queries_per_run,
      max_concurrency: body.max_concurrency !== undefined ? Number(body.max_concurrency) : current.max_concurrency,
      max_spend_per_run_usd: body.max_spend_per_run_usd !== undefined ? Number(body.max_spend_per_run_usd) : current.max_spend_per_run_usd,
      max_monthly_spend_usd: body.max_monthly_spend_usd !== undefined ? Number(body.max_monthly_spend_usd) : current.max_monthly_spend_usd,
      openai_model_visibility: body.openai_model_visibility || current.openai_model_visibility,
      openai_model_analysis: body.openai_model_analysis || current.openai_model_analysis,
      openai_api_key: body.openai_api_key !== undefined ? body.openai_api_key : current.openai_api_key,
      smtp_host: body.smtp_host !== undefined ? body.smtp_host : current.smtp_host,
      smtp_port: body.smtp_port !== undefined ? Number(body.smtp_port) : current.smtp_port,
      smtp_user: body.smtp_user !== undefined ? body.smtp_user : current.smtp_user,
      smtp_pass: body.smtp_pass !== undefined ? body.smtp_pass : current.smtp_pass,
      smtp_secure: body.smtp_secure !== undefined ? Boolean(body.smtp_secure) : current.smtp_secure,
      smtp_from_email: body.smtp_from_email !== undefined ? body.smtp_from_email : current.smtp_from_email,
      smtp_from_name: body.smtp_from_name !== undefined ? body.smtp_from_name : current.smtp_from_name,
    });

    if (body.openai_api_key) {
      OpenAIService.setApiKey(body.openai_api_key);
    }

    await repository.logAuditEvent({
      event_type: 'budget_exceeded',
      target_entity: 'system_settings',
      entity_id: 'settings-001',
      actor_id: 'admin@niupack.com.py',
      metadata: {
        updates: body,
        previous: {
          max_spend_per_run_usd: current.max_spend_per_run_usd,
          max_monthly_spend_usd: current.max_monthly_spend_usd,
        },
      },
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error updating settings' }, { status: 500 });
  }
}
