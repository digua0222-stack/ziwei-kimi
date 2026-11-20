import assert from 'node:assert/strict';
import { consumeSseResponse, readApiError } from '../../lib/sse-client';

function responseFor(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

async function consume(chunks: Uint8Array[]): Promise<string> {
  let text = '';
  await consumeSseResponse(responseFor(chunks), delta => { text += delta; });
  return text;
}

async function main() {
  for (const ending of ['\n', '\r\n']) {
    const bytes = new TextEncoder().encode(
      `data: {"delta":{"text":"你好"}}${ending}${ending}` +
      `data: {"delta":{"text":"世界"}}${ending}${ending}` +
      `data: [DONE]${ending}${ending}`,
    );
    assert.equal(await consume([bytes]), '你好世界');
    for (let cut = 1; cut < bytes.length; cut++) {
      assert.equal(await consume([bytes.slice(0, cut), bytes.slice(cut)]), '你好世界', `byte split ${cut}`);
    }
    assert.equal(await consume(Array.from(bytes, byte => Uint8Array.of(byte))), '你好世界');
  }

  const errorBytes = new TextEncoder().encode('data: {"error":"请设置 Token"}\n\n');
  await assert.rejects(consume([errorBytes]), /请设置 Token/);

  const errorResponse = Response.json({ error: '本地服务未启动' }, { status: 503 });
  assert.equal(await readApiError(errorResponse, '请求失败'), '本地服务未启动');

  console.log('SSE byte-fragment, CRLF and error-message regressions passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
