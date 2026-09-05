const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(matched = false) {
  const timers = [];
  const played = [];
  const audio = { stop() {}, destroy() { this.destroyed = true; }, onError() {}, play() { played.push(this.src); } };
  let definition;
  const requests = [], calls = [];
  const api = { getSelectedProject: () => ({ id: 'project' }), prepareFacePhoto: async () => 'photo', recognizeAttendancePoint: async (...args) => { calls.push(args); return { matched, worker_name: "测试工人", direction: 0 }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/attendance-machine/camera.js'), 'utf8'), {
    Page: value => { definition = value; }, require: () => api,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    wx: { createInnerAudioContext: () => audio, getMenuButtonBoundingClientRect: () => ({ bottom: 60 }), getLocation: options => requests.push(options), showToast: () => {} },
  });
  const page = { ...definition, data: { ...definition.data, pointId: 'point', cameraReady: true },
    setData(values) { Object.assign(this.data, values); },
    cameraContext: { takePhoto: options => options.success({ tempImagePath: 'image' }) } };
  page.loadTodayRecords = () => {};
  return { page, requests, calls, timers, played, audio };
}
test('entering camera refreshes location; every punch sends the snapshot', async () => {
  const { page, requests, calls } = setup();
  page.onShow();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, 'gcj02');
  await page.captureAndRecognize();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3].location, null);
  calls.length = 0;
  requests[0].success({ latitude: 30.1, longitude: 120.2, accuracy: 8 });
  await page.captureAndRecognize();
  await page.captureAndRecognize();
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call[3].location.latitude, 30.1);
    assert.equal(call[3].location.longitude, 120.2);
    assert.ok(call[3].location.captured_at);
  }
});
test('refresh failure clears previous location but allows punches', async () => {
  const { page, requests, calls } = setup();
  page.refreshLocation();
  requests[0].success({ latitude: 30, longitude: 120, accuracy: 10 });
  page.refreshLocation();
  requests[1].fail();
  await page.captureAndRecognize();
  assert.equal(page.data.location, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3].location, null);
});
test('ignores stale location callbacks after hiding or starting another request', () => {
  const { page, requests } = setup();
  page.refreshLocation();
  page.refreshLocation();
  requests[0].success({ latitude: 30, longitude: 120 });
  assert.equal(page.data.location, null);
  page.onHide();
  requests[1].success({ latitude: 30, longitude: 120 });
  assert.equal(page.data.location, null);
});

test('successful punch shows centered confirmation then dismisses it', async () => {
  const { page, timers } = setup(true);
  await page.captureAndRecognize();
  assert.equal(page.data.successVisible, true);
  assert.match(page.data.successName, /测试工人/);
  timers.at(-1)();
  assert.equal(page.data.successVisible, false);
});

test('voice follows actual punch result and is stopped on leaving the page', async () => {
  for (const matched of [true, false]) {
    const { page, played, audio } = setup(matched);
    await page.captureAndRecognize();
    assert.deepEqual(played, [matched ? '/assets/audio/pass.wav' : '/assets/audio/retry.wav']);
    page.onHide();
    page.playPunchPrompt(true);
    assert.equal(played.length, 1);
    page.onUnload();
    assert.equal(audio.destroyed, true);
  }
});
test('audio playback failure cannot change a successful punch', async () => {
  const { page, audio } = setup(true);
  audio.play = () => { throw new Error('speaker unavailable'); };
  await page.captureAndRecognize();
  assert.equal(page.data.lastResult.ok, true);
});
