const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareFacePhoto, base64Bytes, MAX_PHOTO_BYTES } = require('../utils/face-photo.js');

function mock(sizes, width = 3000, height = 4000) {
  const calls = [];
  let index = 0;
  return {
    calls,
    getImageInfo: ({ success }) => success({ width, height }),
    compressImage: (options) => { calls.push(options); options.success({ tempFilePath: `compressed-${index}` }); },
    getFileSystemManager: () => ({ readFile: ({ filePath, success }) => {
      assert.match(filePath, /^compressed-/);
      success({ data: Buffer.alloc(sizes[index++]).toString('base64') });
    } }),
  };
}

test('compresses before reading and preserves aspect ratio', async () => {
  const api = mock([100000]);
  assert.equal(base64Bytes(await prepareFacePhoto('original', api)), 100000);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].compressedWidth, 720);
  assert.equal(api.calls[0].compressedHeight, 960);
});
test('retries oversized photos from original and accepts exact limit', async () => {
  const api = mock([300000, MAX_PHOTO_BYTES]);
  assert.equal(base64Bytes(await prepareFacePhoto('original', api)), MAX_PHOTO_BYTES);
  assert.deepEqual(api.calls.map(v => [v.src, v.quality]), [['original', 70], ['original', 55]]);
});
test('rejects oversize and compression failure instead of uploading originals', async () => {
  const api = mock([300000, 300000, 300000, 300000]);
  await assert.rejects(prepareFacePhoto('original', api), /超过200KB/);
  assert.equal(api.calls.length, 4);
  api.compressImage = ({ fail }) => fail({ errMsg: 'failed' });
  await assert.rejects(prepareFacePhoto('original', api), /压缩失败/);
});
test('does not upscale small pictures and counts base64 padding', async () => {
  const api = mock([10], 320, 240);
  await prepareFacePhoto('original', api);
  assert.equal(api.calls[0].compressedWidth, 320);
  assert.equal(api.calls[0].compressedHeight, 240);
  for (const size of [1, 2, 3, 4, 200, MAX_PHOTO_BYTES]) {
    assert.equal(base64Bytes(Buffer.alloc(size).toString('base64')), size);
  }
});
