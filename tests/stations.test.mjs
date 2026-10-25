import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    AbortController,
    document: { documentElement: {} },
    setTimeout: (callback) => queueMicrotask(callback),
    ...globals,
  });
  return exports;
}

const model = load("../src/models/stations.ts");
const regular = { brand: "Station", address: "1 Main", region: "Montréal", type: "Régulier", price: 150, lat: 45.5, lng: -73.5 };
const diesel = { ...regular, type: "Diesel", price: 180 };
const fixture = [regular, diesel];

function mountStations() {
  const slots = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
  };
  const { useStations } = load("../src/controllers/useStations.ts", {
    react,
    "../models/stations": model,
    "../models/i18n": { getTranslator: () => (key) => key, getSavedLang: () => "en", saveLang() {} },
    "../models/api": {
      fetchStations: (signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
    },
  });
  function read() { cursor = 0; return useStations(); }
  read();
  const cleanups = effects.splice(0).map((effect) => effect());
  return {
    read, requests,
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

test("refresh preserves an available selected fuel and region", async () => {
  const hook = mountStations();
  hook.requests[0].resolve(fixture);
  await hook.settle();
  assert.equal(hook.read().gasType, "Régulier");
  hook.read().setGasType("Diesel");
  hook.read().setRegion("Montréal");
  const refreshing = hook.read().refresh();
  hook.requests[1].resolve([regular, { ...diesel, price: 190 }]);
  await refreshing;
  assert.equal(hook.read().gasType, "Diesel");
  assert.equal(hook.read().region, "Montréal");
  assert.equal(hook.read().filteredStations[0].price, 190);
  hook.unmount();
});

test("refresh preserves all fuels and falls back only when a selected fuel disappears", async () => {
  const hook = mountStations();
  hook.requests[0].resolve(fixture);
  await hook.settle();
  hook.read().setGasType("__all__");
  let refreshing = hook.read().refresh();
  hook.requests[1].resolve(fixture);
  await refreshing;
  assert.equal(hook.read().gasType, "__all__");
  hook.read().setGasType("Diesel");
  refreshing = hook.read().refresh();
  hook.requests[2].resolve([regular]);
  await refreshing;
  assert.equal(hook.read().gasType, "Régulier");
  hook.unmount();
});

test("failed refresh keeps the loaded data usable and retry can recover", async () => {
  const hook = mountStations();
  hook.requests[0].resolve(fixture);
  await hook.settle();
  const refreshing = hook.read().refresh();
  hook.requests[1].reject(new Error("offline"));
  await refreshing;
  assert.equal(hook.read().hasLoadedData, true);
  assert.equal(hook.read().allStations.length, 2);
  assert.equal(hook.read().stats.min, 150);
  assert.equal(hook.read().loading, false);
  assert.equal(hook.read().refreshing, false);
  assert.match(hook.read().error, /offline/);
  const retry = hook.read().refresh();
  assert.equal(hook.read().error, null);
  hook.requests[2].resolve([{ ...regular, price: 155 }]);
  await retry;
  assert.equal(hook.read().stats.min, 155);
  hook.unmount();
});

test("initial errors can retry with a loading state and obsolete loads cannot publish", async () => {
  const hook = mountStations();
  hook.requests[0].reject(new Error("offline"));
  await hook.settle();
  assert.equal(hook.read().hasLoadedData, false);
  assert.equal(hook.read().loading, false);
  const firstRetry = hook.read().refresh();
  assert.equal(hook.read().loading, true);
  const latestRetry = hook.read().refresh();
  assert.equal(hook.requests[1].signal.aborted, true);
  hook.requests[2].resolve([{ ...regular, price: 160 }]);
  await latestRetry;
  hook.requests[1].resolve([{ ...regular, price: 120 }]);
  await firstRetry;
  assert.equal(hook.read().stats.min, 160);
  assert.equal(hook.read().error, null);
  hook.unmount();
  assert.equal(hook.requests[2].signal.aborted, true);
});
