export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {}
  return fallback;
}

export async function consumeSseResponse(
  response: Response,
  onDelta: (text: string) => void,
): Promise<void> {
  if (!response.body) throw new Error('服务没有返回数据流');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let finished = false;

  const processLine = (rawLine: string): void => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trimStart();
    if (data === '[DONE]') {
      finished = true;
      return;
    }
    if (!data) return;

    let payload: { delta?: { text?: unknown }; error?: unknown };
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof payload.error === 'string' && payload.error) {
      throw new Error(payload.error);
    }
    const delta = payload.delta?.text;
    if (typeof delta === 'string' && delta) onDelta(delta);
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line);
      if (finished) break;
    }
  }

  if (!finished) {
    pending += decoder.decode();
    if (pending) processLine(pending);
  }

  if (finished) await reader.cancel().catch(() => {});
}
