import type { ZiweiChart } from './types';
import { detectPatterns, getMingGongSummary } from './patterns';
import {
  HEMING_METHODOLOGY,
  MARRIAGE_STARS_BRIEF,
  SIHUA_IN_FUQI_GU,
  STAR_IN_FUQI_GU,
} from './heming-knowledge';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ANSWER_RULES = `你是紫微斗数学习助手。请使用简体中文回答，直接给出有结构的内容。
只依据用户提供的命盘、规则和语料进行分析，不要编造未提供的星曜、宫位、四化或引文。
必须区分通用规则与具体命例，不得把同盘其他宫位的结论归因于单一主星。
不知道或资料不足时明确说明。不要调用任何工具，不要读取或修改文件，不要执行命令。
内容仅供学习参考；涉及医疗、法律、投资或重大人生决策时，不作确定性承诺。`;

function chartKnowledge(chart: ZiweiChart): string {
  try {
    return JSON.stringify({
      mingGong: getMingGongSummary(chart),
      patterns: detectPatterns(chart),
    });
  } catch {
    return '{}';
  }
}

function latestMessage(messages: AiMessage[]): string {
  return messages[messages.length - 1]?.content.trim() ?? '';
}

export function buildInterpretPrompt(
  chart: ZiweiChart,
  messages: AiMessage[],
  followUp = false,
): string {
  if (followUp) {
    return `${ANSWER_RULES}\n\n这是同一张命盘的追问。请沿用已有上下文，只回答最新问题：\n${latestMessage(messages)}`;
  }

  const history = messages.map(message =>
    `<message role="${message.role}">\n${message.content}\n</message>`,
  ).join('\n');

  return `${ANSWER_RULES}

以下是截至当前问题的完整资料。请回答 messages 中最后一个 user 问题，不要逐条重复回答历史问题。

<chart format="json">
${JSON.stringify(chart)}
</chart>

<local-rules format="json">
${chartKnowledge(chart)}
</local-rules>

<messages>
${history}
</messages>`;
}

export function buildHemingPrompt(
  chartA: ZiweiChart,
  chartB: ZiweiChart,
  question?: string,
  followUp = false,
): string {
  const currentQuestion = question?.trim() || '请综合分析两人的感情匹配、相处模式、潜在矛盾与合作建议。';
  if (followUp) {
    return `${ANSWER_RULES}\n\n这是同一组双盘的追问。请沿用已有上下文，只回答最新问题：\n${currentQuestion}`;
  }

  return `${ANSWER_RULES}

请根据双盘和下列本地知识进行合盘分析。先列双方关键宫位，再分析匹配点、风险与相处建议，避免只给吉凶结论。

<chart-a format="json">
${JSON.stringify(chartA)}
</chart-a>

<chart-b format="json">
${JSON.stringify(chartB)}
</chart-b>

<methodology>
${HEMING_METHODOLOGY}
</methodology>

<reference format="json">
${JSON.stringify({ STAR_IN_FUQI_GU, SIHUA_IN_FUQI_GU, MARRIAGE_STARS_BRIEF })}
</reference>

<question>
${currentQuestion}
</question>`;
}
