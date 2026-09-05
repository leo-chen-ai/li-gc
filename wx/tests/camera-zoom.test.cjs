const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function cameraPage(saved = {}) {
  let definition;
  const storage = { preference: saved };
  const requested = [];
  const context = {
    setZoom(options) {
      requested.push(options.zoom);
      options.success({ zoom: options.zoom });
      options.complete();
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/attendance-machine/camera.js'), 'utf8'), {
    Page(value) { definition = value; },
    require() { return {}; },
    wx: {
      getMenuButtonBoundingClientRect: () => ({ bottom: 60 }),
      createCameraContext: () => context,
      getStorageSync: (key) => storage[key],
      setStorageSync: (key, value) => { storage[key] = value; },
    },
  });
  const page = { ...definition, data: { ...definition.data }, _zoomStorageKey: 'preference',
    setData(values) { Object.assign(this.data, values); },
  };
  return { page, storage, requested };
}

test('restores saved camera zoom and clamps to device limit without overwriting preference', () => {
  const { page, storage, requested } = cameraPage({ front: 3 });
  page.onCameraInitDone({ detail: { maxZoom: 2 } });
  assert.equal(page.data.zoom, 2);
  assert.equal(requested[0], 2);
  assert.equal(storage.preference.front, 3);
});

test('remembers front and back independently after successful zoom selection', () => {
  const { page, storage } = cameraPage({ back: 3 });
  page.onCameraInitDone({ detail: { maxZoom: 3 } });
  page.selectZoom({ currentTarget: { dataset: { zoom: 2 } } });
  assert.equal(storage.preference.front, 2);
  assert.equal(storage.preference.back, 3);
  page.data.cameraPosition = 'back';
  page.onCameraInitDone({ detail: { maxZoom: 3 } });
  assert.equal(page.data.zoom, 3);
});

test('ignores unsupported magnification and blocks changes while recognizing', () => {
  const { page, requested } = cameraPage();
  page.onCameraInitDone({ detail: { maxZoom: 1 } });
  page.selectZoom({ currentTarget: { dataset: { zoom: 3 } } });
  assert.equal(requested.length, 1);
  page.data.maxZoom = 3;
  page.data.recognizing = true;
  page.selectZoom({ currentTarget: { dataset: { zoom: 2 } } });
  assert.equal(requested.length, 1);
});
