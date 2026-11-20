import type { ZiweiChart } from '@/lib/ziwei/types';
import { buildInterpretPrompt, type AiMessage } from '@/lib/ziwei/ai-prompt';
import { createKimiCodeSseResponse, kimiCodeErrorResponse } from '@/lib/kimi-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isChart(value: unknown): value is ZiweiChart {
  if (!value || typeof value !== 'object') return false;
  const chart = value as Partial<ZiweiChart>;
  return !!chart.birthInfo && typeof chart.birthInfo === 'object' && Array.isArray(chart.palaces);
}

function parseMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value)) throw new Error('messages 必须是对话数组');
  const messages = value.slice(-24).map(message => {
    if (!message || typeof message !== 'object') throw new Error('对话消息格式无效');
    const { role, content } = message as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      throw new Error('对话消息格式无效');
    }
    if (content.length > 12000) throw new Error('单条对话内容过长');
    return { role: role as AiMessage['role'], content };
  });
  if (!messages.length || messages[messages.length - 1].role !== 'user' || !messages[messages.length - 1].content.trim()) {
    throw new Error('最后一条消息必须是有效的用户问题');
  }
  return messages;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      chart?: unknown;
      messages?: unknown;
      conversationId?: unknown;
    };
    if (!isChart(body.chart)) throw new Error('命盘数据格式无效');
    const messages = parseMessages(body.messages);

    return await createKimiCodeSseResponse({
      conversationId: body.conversationId,
      signal: request.signal,
      prompt: buildInterpretPrompt(body.chart, messages),
      followUpPrompt: buildInterpretPrompt(body.chart, messages, true),
    });
  } catch (error) {
    return kimiCodeErrorResponse(error);
  }
}
