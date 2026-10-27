import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiImage } from '../../src/services/gemini.js';

test('image generation sends the Interactions API response format', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let requestBody;
  process.env.GEMINI_API_KEY = 'test-image-key';
  global.fetch = async (_url, init = {}) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      id: 'interaction-test',
      model: 'gemini-3.1-flash-image',
      output_image: { data: 'aGVsbG8=', mime_type: 'image/jpeg' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateGeminiImage({ prompt: 'A pixel-art study companion', imageSize: '0.5K' });
    assert.equal(requestBody.response_format.type, 'image');
    assert.equal(requestBody.response_format.mime_type, 'image/jpeg');
    assert.equal(requestBody.response_format.delivery, 'inline');
    assert.equal(requestBody.response_format.image_size, '512');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.data, 'aGVsbG8=');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
