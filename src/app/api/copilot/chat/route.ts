import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { ContextBuilder } from '@/lib/copilot/context-builder';
import { CopilotAction, CopilotScreenContext } from '@/types';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { message, screenContext, threadId: requestedThreadId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ success: false, error: 'Mensaje requerido' }, { status: 400 });
    }

    const context: CopilotScreenContext = screenContext || {
      route: '/',
      module: 'dashboard',
    };

    // 1. Thread handling: retrieve existing or create new
    let threadId = requestedThreadId;
    if (!threadId) {
      const thread = await repository.createCopilotThread({
        user_id: 'user-op',
        organization_id: 'org-niupack',
        route: context.route,
        module: context.module,
        title: message.slice(0, 45) + (message.length > 45 ? '...' : ''),
      });
      threadId = thread.id;
    }

    // Record user message in repository
    await repository.addCopilotMessage({
      thread_id: threadId,
      role: 'user',
      content: message,
      context_snapshot: context,
    });

    // 2. Build context-aware prompt package
    const promptPackage = ContextBuilder.buildPrompt(message, context);

    let assistantContent = '';
    let proposedActions: CopilotAction[] = [];
    let tokensUsed = 0;
    let costUSD = 0;
    let modelName = 'local-engine';

    // 3. Check if OpenAI is configured and available
    const isConfigured = OpenAIService.isConfigured();
    const apiKey = OpenAIService.getApiKey();

    if (isConfigured && apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: promptPackage.systemPrompt },
              { role: 'user', content: promptPackage.userMessage },
            ],
            temperature: 0.2, // Low temperature for high numerical precision
            max_tokens: 800,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const rawReply = data.choices?.[0]?.message?.content || '';
          modelName = data.model || 'gpt-4o-mini';

          const inputTokens = data.usage?.prompt_tokens || 0;
          const outputTokens = data.usage?.completion_tokens || 0;
          tokensUsed = inputTokens + outputTokens;

          // Estimate cost using gpt-4o-mini pricing
          costUSD = Number((inputTokens * 0.00000015 + outputTokens * 0.0000006).toFixed(6));

          // Log in OpenAIService tracking
          OpenAIService.recordCall({
            timestamp: new Date().toISOString(),
            purpose: `NIU Copilot: ${context.module} query`,
            model: modelName,
            tokens_input: inputTokens,
            tokens_output: outputTokens,
            total_tokens: tokensUsed,
            estimated_cost_usd: costUSD,
            latency_ms: Date.now() - startTime,
            status: 'SUCCESS',
          });

          // Parse proposed actions if tagged
          const actionMatch = rawReply.match(/\[PROPOSED_ACTIONS\]([\s\S]*?)\[\/PROPOSED_ACTIONS\]/);
          if (actionMatch && actionMatch[1]) {
            try {
              const parsed = JSON.parse(actionMatch[1].trim());
              if (Array.isArray(parsed)) {
                proposedActions = parsed.map((a: any, i: number) => ({
                  id: `action-${Date.now()}-${i}`,
                  thread_id: threadId,
                  action_type: a.action_type,
                  label: a.label,
                  payload: a.payload || {},
                  status: 'PROPOSED',
                }));
              }
            } catch (err) {
              console.warn('Could not parse proposed actions JSON from reply');
            }
          }

          // Remove the actions tag from the clean user-facing text
          assistantContent = rawReply.replace(/\[PROPOSED_ACTIONS\][\s\S]*?\[\/PROPOSED_ACTIONS\]/, '').trim();
        } else {
          console.warn(`OpenAI call returned ${response.status}. Falling back to local engine.`);
          const local = ContextBuilder.generateLocalAnalysis(message, context);
          assistantContent = local.text;
          proposedActions = local.proposedActions.map((a) => ({ ...a, thread_id: threadId }));
        }
      } catch (err) {
        console.warn('OpenAI request error. Falling back to local engine:', err);
        const local = ContextBuilder.generateLocalAnalysis(message, context);
        assistantContent = local.text;
        proposedActions = local.proposedActions.map((a) => ({ ...a, thread_id: threadId }));
      }
    } else {
      // Local deterministic analytical engine
      const local = ContextBuilder.generateLocalAnalysis(message, context);
      assistantContent = local.text;
      proposedActions = local.proposedActions.map((a) => ({ ...a, thread_id: threadId }));
    }

    // Persist proposed actions in repository
    for (const act of proposedActions) {
      await repository.addCopilotAction(act);
    }

    // Record assistant message
    const savedAssistantMsg = await repository.addCopilotMessage({
      thread_id: threadId,
      role: 'assistant',
      content: assistantContent,
      context_snapshot: context,
      tokens: tokensUsed,
      cost_usd: costUSD,
      latency_ms: Date.now() - startTime,
      model: modelName,
      proposed_actions: proposedActions,
    });

    return NextResponse.json({
      success: true,
      message: savedAssistantMsg,
      threadId,
      proposedActions,
      latency_ms: Date.now() - startTime,
      model: modelName,
      cost_usd: costUSD,
    });
  } catch (error: any) {
    console.error('Error in Copilot chat route:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al procesar consulta de Copilot' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId');

    if (threadId) {
      const messages = await repository.getCopilotMessages(threadId);
      const actions = await repository.getCopilotActions(threadId);
      return NextResponse.json({ success: true, messages, actions });
    }

    const threads = await repository.getCopilotThreads();
    return NextResponse.json({ success: true, threads });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error al obtener historial' },
      { status: 500 }
    );
  }
}
