import { NextRequest, NextResponse } from 'next/server';
import { OpenAIService } from '@/lib/openai/openai-service';
import { repository } from '@/lib/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = body.apiKey || (await repository.getSettings()).openai_api_key || process.env.OPENAI_API_KEY || '';

    if (!key || key.includes('your-openai-api-key')) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se ha provisto una API Key de OpenAI válida (debe empezar con sk-...).',
        },
        { status: 400 }
      );
    }

    // Ping OpenAI Chat Completions API with a minimal 1-token test
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 2,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      return NextResponse.json(
        {
          success: false,
          error: errorData.error?.message || `Error de OpenAI HTTP ${response.status}`,
        },
        { status: 400 }
      );
    }

    // If test succeeded and apiKey was explicitly sent, persist it
    if (body.apiKey) {
      OpenAIService.setApiKey(body.apiKey);
      await repository.updateSettings({ openai_api_key: body.apiKey });
    }

    return NextResponse.json({
      success: true,
      message: 'Conexión con OpenAI verificada exitosamente. El Bot de Visibilidad IA está listo para operar.',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error al conectar con OpenAI',
      },
      { status: 500 }
    );
  }
}
