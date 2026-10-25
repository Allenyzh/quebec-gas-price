import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(
  fs.readFileSync(new URL('../src/models/api.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function loadApi(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, fetch });
  return module.exports;
}
const destination = { lng: -73, lat: 45 };

test('OSRM null/invalid distances remain unavailable rather than becoming zero', async () => {
  const values = [null, 1200, -1, '400', NaN, Infinity, 0];
  const api = loadApi(async () => ({ ok: true, json: async () => ({ code: 'Ok', distances: [[0, ...values]] }) }));
  const result = await api.fetchOsrmDistances(-73, 45, values.map(() => destination));
  assert.deepEqual(Array.from(result), [null, 1.2, null, null, null, null, 0]);
});

test('OSRM cancellation propagates, with its signal passed to fetch', async () => {
  const controller = new AbortController();
  const error = new Error('cancelled');
  let received;
  const api = loadApi(async (url, { signal }) => {
    received = signal;
    controller.abort();
    throw error;
  });
  await assert.rejects(api.fetchOsrmDistances(-73, 45, [destination], controller.signal), (err) => err === error);
  assert.equal(received, controller.signal);
});

test('OSRM HTTP, network, and malformed responses trigger the existing fallback', async () => {
  for (const response of [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ code: 'NoTable' }) },
    { ok: true, json: async () => ({ code: 'Ok', distances: [] }) },
    { ok: true, json: async () => ({ code: 'Ok', distances: [[0]] }) },
  ]) {
    const api = loadApi(async () => response);
    assert.equal(await api.fetchOsrmDistances(-73, 45, [destination]), null);
  }
  const api = loadApi(async () => { throw new Error('offline'); });
  assert.equal(await api.fetchOsrmDistances(-73, 45, [destination]), null);
});

test('an empty route destination list makes no external request', async () => {
  const api = loadApi(async () => { throw new Error('fetch should not run'); });
  assert.equal((await api.fetchOsrmDistances(-73, 45, [])).length, 0);
});

test('station requests forward cancellation and reject HTTP errors before parsing', async () => {
  const controller = new AbortController();
  let received;
  const api = loadApi(async (url, { signal }) => {
    received = signal;
    return { ok: false, status: 503, json: () => { throw new Error('should not parse'); } };
  });
  await assert.rejects(api.fetchStations(controller.signal), /503/);
  assert.equal(received, controller.signal);
});
