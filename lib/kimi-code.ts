import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://127.0.0.1:58627';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED_SESSIONS = 50;
const DISABLED_TOOLS = [
  'Agent', 'AgentSwarm', 'AskUserQuestion', 'Bash', 'CreateGoal', 'CronCreate',
  'CronDelete', 'CronList', 'Edit', 'ExitPlanMode', 'FetchURL', 'GetGoal', 'Glob',
  'Grep', 'Read', 'ReadMediaFile', 'SetGoalBudget', 'Skill', 'TaskList', 'TaskOutput',
  'TaskStop', 'TodoList', 'UpdateGoal', 'WaitFor', 'WebSearch', 'Write',
];

interface KimiCodeEnv {
  [key: string]: string | undefined;
  KIMI_CODE_TOKEN?: string;
  KIMI_CODE_LOCAL_URL?: string;
  KIMI_CODE_TIMEOUT_MS?: string;
}

interface KimiCodeConfig {
  baseUrl: string;
  wsUrl: string;
  token: string;
  timeoutMs: number;
}

interface Envelope<T> {
  code: number;
  msg?: string;
  data: T;
}

interface KimiFrame {
  type?: string;
  request_id?: string;
  code?: number;
  msg?: string;
  turn_id?: string;
  item_id?: string;
  field?: string;
  delta?: unknown;
  text?: unknown;
  status?: string;
  turn?: {
    turn_id?: string;
    kind?: string;
    outcome?: string;
    error?: { message?: string };
  };
  item?: {
    item_id?: string;
    type?: string;
    text?: string;
  };
  payload?: { delta?: unknown; text?: unknown };
}

export type KimiTurnEvent =
  | { type: 'none' }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class KimiCodeTurnParser {
  private turnId = '';
  private assistantItems = new Map<string, boolean>();

  accept(frame: KimiFrame): KimiTurnEvent {
    if (frame.type === 'turn.started' && frame.turn?.kind !== 'system') {
      this.turnId = frame.turn?.turn_id ?? '';
      return { type: 'none' };
    }

    if (frame.type === 'item.started' && frame.turn_id === this.turnId) {
      const item = frame.item;
      if (item?.type !== 'assistant_message' || !item.item_id) return { type: 'none' };
      this.assistantItems.set(item.item_id, false);
      if (item.text) {
        this.assistantItems.set(item.item_id, true);
        return { type: 'delta', text: item.text };
      }
      return { type: 'none' };
    }

    if (frame.type === 'item.delta' && frame.turn_id === this.turnId) {
      if (frame.field !== 'text' || !frame.item_id || !this.assistantItems.has(frame.item_id)) {
        return { type: 'none' };
      }
      if (typeof frame.delta !== 'string' || !frame.delta) return { type: 'none' };
      this.assistantItems.set(frame.item_id, true);
      return { type: 'delta', text: frame.delta };
    }

    if (frame.type === 'item.ended' && frame.turn_id === this.turnId) {
      const item = frame.item;
      if (item?.type !== 'assistant_message' || !item.item_id) return { type: 'none' };
      const alreadyStreamed = this.assistantItems.get(item.item_id);
      this.assistantItems.set(item.item_id, true);
      if (!alreadyStreamed && item.text) return { type: 'delta', text: item.text };
      return { type: 'none' };
    }

    if (frame.type === 'turn.ended' && frame.turn?.turn_id === this.turnId) {
      const outcome = frame.turn.outcome;
      if (outcome && outcome !== 'completed') {
        return {
          type: 'error',
          message: frame.turn.error?.message || `Kimi Code 回答中断（${outcome}）`,
        };
      }
      return { type: 'done' };
    }

    if (frame.type === 'turns.failed') {
      return { type: 'error', message: frame.msg || 'Kimi Code 会话加载失败' };
    }
    if (frame.type === 'interaction' && frame.status === 'pending') {
      return { type: 'error', message: '问答模式不允许工具或交互操作，请直接根据已提供资料回答' };
    }
    if (frame.type === 'response' && frame.code !== undefined && frame.code !== 0) {
      return { type: 'error', message: frame.msg || `Kimi Code 本地服务错误（${frame.code}）` };
    }

    if (frame.type === 'assistant.delta') {
      const values = [frame.delta, frame.text, frame.payload?.delta, frame.payload?.text];
      const text = values.find(value => typeof value === 'string');
      if (typeof text === 'string' && text) return { type: 'delta', text };
    }

    return { type: 'none' };
  }
}

export class KimiCodeError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'KimiCodeError';
  }
}

export function getKimiCodeConfig(env: KimiCodeEnv = process.env): KimiCodeConfig {
  const token = env.KIMI_CODE_TOKEN?.trim();
  if (!token) {
    throw new KimiCodeError(
      '尚未设置 Kimi Code Token。请在 .env.local 中填写 KIMI_CODE_TOKEN，然后重启服务。',
      503,
    );
  }

  let url: URL;
  try {
    url = new URL(env.KIMI_CODE_LOCAL_URL?.trim() || DEFAULT_BASE_URL);
  } catch {
    throw new KimiCodeError('KIMI_CODE_LOCAL_URL 不是有效地址', 500);
  }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (!loopback || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new KimiCodeError('为避免泄露 Token，KIMI_CODE_LOCAL_URL 仅允许本机 HTTP 地址', 500);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new KimiCodeError('KIMI_CODE_LOCAL_URL 只能包含协议、主机和端口', 500);
  }

  const requestedTimeout = Number(env.KIMI_CODE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout >= 1000
    ? Math.min(requestedTimeout, 30 * 60 * 1000)
    : 10 * 60 * 1000;
  const baseUrl = url.origin;
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return {
    baseUrl,
    wsUrl: `${wsProtocol}//${url.host}/api/v1/ws`,
    token,
    timeoutMs,
  };
}

function mapServiceError(status: number, envelope?: Partial<Envelope<unknown>>): KimiCodeError {
  const code = envelope?.code;
  const detail = envelope?.msg?.trim();
  if (status === 401 || code === 40101) {
    return new KimiCodeError('Kimi Code Token 无效，请检查 .env.local 中的 KIMI_CODE_TOKEN', 502, code);
  }
  if (code !== undefined && [40110, 40111, 40112, 40113].includes(code)) {
    return new KimiCodeError('Kimi Code 尚未登录或模型不可用，请先在 Kimi Code CLI 中完成登录', 503, code);
  }
  if (code === 40401) {
    return new KimiCodeError('Kimi Code 会话已失效，请重新提问', 502, code);
  }
  if (code === 40931) {
    return new KimiCodeError('Kimi Code 会话正被另一个客户端使用，请稍后重试', 409, code);
  }
  return new KimiCodeError(
    `Kimi Code 本地服务请求失败${code ? `（${code}）` : ''}${detail ? `：${detail.slice(0, 300)}` : ''}`,
    502,
    code,
  );
}

async function kimiRequest<T>(
  config: KimiCodeConfig,
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${config.token}`);
    headers.set('Content-Type', 'application/json');
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new KimiCodeError(
      `无法连接 Kimi Code 本地服务（${config.baseUrl}）。请运行 kimi web --no-open --port 58627。`,
      503,
    );
  }

  let envelope: Partial<Envelope<T>> = {};
  try {
    envelope = await response.json() as Partial<Envelope<T>>;
  } catch {
    if (!response.ok) throw mapServiceError(response.status);
    throw new KimiCodeError('Kimi Code 本地服务返回了无效 JSON', 502);
  }
  if (!response.ok || envelope.code !== 0) throw mapServiceError(response.status, envelope);
  return envelope.data as T;
}

const sessionCache = new Map<string, { sessionId: string; usedAt: number }>();

function pruneSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, value] of sessionCache) {
    if (value.usedAt < cutoff) sessionCache.delete(key);
  }
  while (sessionCache.size >= MAX_CACHED_SESSIONS) {
    const oldest = sessionCache.keys().next().value as string | undefined;
    if (!oldest) break;
    sessionCache.delete(oldest);
  }
}

function normalizeConversationId(value: unknown): string {
  if (value === undefined || value === null || value === '') return randomUUID();
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new KimiCodeError('conversationId 格式无效', 400);
  }
  return value;
}

function encodeSse(payload: unknown): Uint8Array {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

export function kimiCodeErrorResponse(error: unknown): Response {
  const status = error instanceof KimiCodeError ? error.status : 400;
  const message = error instanceof Error ? error.message : '请求处理失败';
  return Response.json({ error: message }, { status });
}

export async function createKimiCodeSseResponse(options: {
  conversationId?: unknown;
  prompt: string;
  followUpPrompt?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const config = getKimiCodeConfig();
  const conversationId = normalizeConversationId(options.conversationId);
  const cacheKey = `${config.baseUrl}:${conversationId}`;
  pruneSessions();

  const cached = sessionCache.get(cacheKey);
  let sessionId = cached?.sessionId ?? '';
  const followUp = !!cached;
  if (!sessionId) {
    const session = await kimiRequest<{ id?: string }>(config, '/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: '紫微斗数问答',
        metadata: { cwd: process.cwd(), source: 'ziwei-doushu' },
      }),
    }, options.signal);
    if (!session.id) throw new KimiCodeError('Kimi Code 没有返回会话 ID', 502);
    sessionId = session.id;
  }
  sessionCache.set(cacheKey, { sessionId, usedAt: Date.now() });

  const prompt = followUp ? options.followUpPrompt ?? options.prompt : options.prompt;
  const parser = new KimiCodeTurnParser();
  let cancelStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let socket: WebSocket | undefined;
      let promptId = '';
      let finished = false;
      let aborted = false;
      let wroteText = false;

      const abortPrompt = () => {
        if (!promptId) return;
        void kimiRequest(config, `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts/${encodeURIComponent(promptId)}:abort`, {
          method: 'POST',
          body: '{}',
        }).catch(() => {});
      };

      const close = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
        try { socket?.close(); } catch {}
        try { controller.close(); } catch {}
      };

      const fail = (error: unknown) => {
        if (finished) return;
        sessionCache.delete(cacheKey);
        abortPrompt();
        if (!aborted) {
          const message = error instanceof Error ? error.message : 'Kimi Code 回答失败';
          try { controller.enqueue(encodeSse({ error: message })); } catch {}
        }
        close();
      };

      const succeed = () => {
        if (finished) return;
        if (!wroteText) {
          fail(new Error('Kimi Code 没有返回文字回答'));
          return;
        }
        try { controller.enqueue(encodeSse('[DONE]')); } catch {}
        close();
      };

      const onAbort = () => {
        aborted = true;
        abortPrompt();
        close();
      };
      cancelStream = onAbort;

      const handleFrame = (frame: KimiFrame) => {
        if (frame.type === 'ping') {
          try { socket?.send(JSON.stringify({ type: 'pong' })); } catch {}
          return;
        }
        const event = parser.accept(frame);
        if (event.type === 'delta') {
          wroteText = true;
          try { controller.enqueue(encodeSse({ delta: { text: event.text } })); } catch {}
        } else if (event.type === 'error') {
          fail(new Error(event.message));
        } else if (event.type === 'done') {
          succeed();
        }
      };

      const timeout = setTimeout(() => {
        fail(new Error('等待 Kimi Code 回答超时，请重试'));
      }, config.timeoutMs);

      if (options.signal?.aborted) {
        onAbort();
        return;
      }
      options.signal?.addEventListener('abort', onAbort, { once: true });

      const run = async () => {
        let markSubscribed: () => void = () => {};
        let rejectSubscription: (error: Error) => void = () => {};
        const subscribed = new Promise<void>((resolve, reject) => {
          markSubscribed = resolve;
          rejectSubscription = reject;
        });

        socket = new WebSocket(config.wsUrl, [`kimi-code.bearer.${config.token}`]);
        socket.onopen = () => {
          socket?.send(JSON.stringify({
            type: 'subscribe',
            request_id: 'ziwei-subscribe',
            session_id: sessionId,
          }));
        };
        socket.onmessage = event => {
          if (typeof event.data !== 'string') return;
          let frame: KimiFrame;
          try { frame = JSON.parse(event.data) as KimiFrame; } catch { return; }
          if (frame.type === 'response' && frame.request_id === 'ziwei-subscribe' && frame.code === 0) {
            markSubscribed();
          }
          if (frame.type === 'response' && frame.request_id === 'ziwei-subscribe' && frame.code !== 0) {
            rejectSubscription(new Error(frame.msg || 'Kimi Code 订阅失败'));
          }
          handleFrame(frame);
        };
        socket.onerror = () => {
          const error = new Error('Kimi Code WebSocket 连接失败，请确认本地服务和 Token 是否正确');
          rejectSubscription(error);
          if (finished) return;
          fail(error);
        };
        socket.onclose = () => {
          if (!finished) fail(new Error('Kimi Code WebSocket 连接已中断'));
        };

        await subscribed;
        const accepted = await kimiRequest<{ prompt_id?: string; status?: string }>(
          config,
          `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts`,
          {
            method: 'POST',
            body: JSON.stringify({
              prompt_id: randomUUID(),
              content: [{ type: 'text', text: prompt }],
              permission_mode: 'manual',
              disabled_tools: DISABLED_TOOLS,
            }),
          },
          options.signal,
        );
        if (accepted.status === 'blocked' || accepted.status === 'failed') {
          throw new Error('Kimi Code 未能接受该问题，请检查登录状态和模型配置');
        }
        promptId = accepted.prompt_id ?? '';
      };

      void run().catch(error => {
        if (aborted || options.signal?.aborted) close();
        else fail(error);
      });
    },
    cancel() {
      cancelStream();
      sessionCache.delete(cacheKey);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
