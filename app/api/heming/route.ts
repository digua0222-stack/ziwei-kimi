import type { ZiweiChart } from '@/lib/ziwei/types';
import { buildHemingPrompt } from '@/lib/ziwei/ai-prompt';
import { createKimiCodeSseResponse, kimiCodeErrorResponse } from '@/lib/kimi-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isChart(value: unknown): value is ZiweiChart {
  if (!value || typeof value !== 'object') return false;
  const chart = value as Partial<ZiweiChart>;
  return !!chart.birthInfo && typeof chart.birthInfo === 'object' && Array.isArray(chart.palaces);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      chartA?: unknown;
      chartB?: unknown;
      question?: unknown;
      conversationId?: unknown;
    };
    if (!isChart(body.chartA) || !isChart(body.chartB)) {
      throw new Error('双方命盘数据格式无效');
    }
    if (body.question !== undefined && typeof body.question !== 'string') {
      throw new Error('合盘问题格式无效');
    }
    if (body.question && body.question.length > 12000) {
      throw new Error('合盘问题内容过长');
    }

    return await createKimiCodeSseResponse({
      conversationId: body.conversationId,
      signal: request.signal,
      prompt: buildHemingPrompt(body.chartA, body.chartB, body.question),
      followUpPrompt: buildHemingPrompt(body.chartA, body.chartB, body.question, true),
    });
  } catch (error) {
    return kimiCodeErrorResponse(error);
  }
}
