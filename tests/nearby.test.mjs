import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(
  fs.readFileSync(new URL('../src/controllers/useNearby.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const regular = [{ brand: 'Regular station', address: 'A', region: 'Montréal', type: 'Régulier', price: 150, lat: 45, lng: -73 }];
const premium = [{ ...regular[0], brand: 'Premium station', type: 'Super', price: 190 }];

// Run the actual hook with controlled effect commits and browser/network callbacks.
function createNearby(initial = {}) {
  let props = { stations: regular, radius: 5, enabled: true, onRegionDetected: undefined, ...initial };
  const slots = [];
  const positions = [];
  const routes = [];
  let cursor = 0;
  let pending = [];
  let dirty = false;
  let output;
  let updates = 0;
  const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initialValue) {
      const i = cursor++;
      slots[i] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[i].value, (next) => {
        slots[i].value = typeof next === 'function' ? next(slots[i].value) : next;
        dirty = true;
        updates++;
      }];
    },
    useRef(value) {
      const i = cursor++;
      slots[i] ??= { value: { current: value } };
      return slots[i].value;
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) pending.push({ i, effect, deps });
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports,
    AbortController,
    navigator: { geolocation: { getCurrentPosition(success, failure) { positions.push({ success, failure }); } } },
    require(name) {
      if (name === 'react') return react;
      if (name === '../models/geo') return { haversine: () => 1 };
      if (name === '../models/api') return {
        fetchOsrmDistances(lng, lat, destinations, signal) {
          return new Promise((resolve, reject) => routes.push({ lng, lat, destinations, signal, resolve, reject }));
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render(changes = {}) {
    props = { ...props, ...changes };
    cursor = 0;
    pending = [];
    dirty = false;
    output = module.exports.useNearby(props.stations, props.radius, props.onRegionDetected, props.enabled);
    return output;
  }
  function commit() {
    const effects = pending;
    pending = [];
    for (const { i } of effects) slots[i]?.cleanup?.();
    for (const { i, effect, deps } of effects) slots[i] = { deps, cleanup: effect() };
  }
  function flush() {
    for (let attempts = 0; dirty; attempts++) {
      assert.ok(attempts < 20, 'Hook should settle without a render loop');
      render();
      commit();
    }
    return output;
  }
  function update(changes) { render(changes); commit(); return flush(); }
  async function settle() { await new Promise((resolve) => setImmediate(resolve)); return flush(); }
  render();
  commit();
  flush();
  return {
    positions, routes, render, commit, flush, update, settle,
    get output() { return output; },
    get updates() { return updates; },
    locate(index = positions.length - 1, lat = 45, lng = -73) {
      positions[index].success({ coords: { latitude: lat, longitude: lng } });
      return flush();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('changing fuel/radius hides old results immediately and ignores late responses', async () => {
  const hook = createNearby();
  hook.locate();
  const oldRequest = hook.routes[0];
  oldRequest.resolve([1]);
  await hook.settle();
  assert.equal(hook.output.state.top5[0].type, 'Régulier');

  const firstRender = hook.render({ stations: premium, radius: 10 });
  assert.equal(firstRender.state.status, 'loading', 'Old prices disappear before effects commit');
  hook.commit();
  assert.equal(oldRequest.signal.aborted, true);
  const currentRequest = hook.routes[1];
  currentRequest.resolve([2]);
  await hook.settle();
  assert.equal(hook.output.state.top5[0].type, 'Super');
  assert.equal(hook.output.state.radiusKm, 10);

  hook.update({ stations: regular, radius: 5 });
  const olderPendingRequest = hook.routes[2];
  hook.update({ stations: premium, radius: 10 });
  const latestRequest = hook.routes[3];
  latestRequest.resolve([3]);
  await hook.settle();
  olderPendingRequest.resolve([0.5]);
  await hook.settle();
  assert.equal(olderPendingRequest.signal.aborted, true);
  assert.equal(hook.output.state.top5[0].type, 'Super');
  assert.equal(hook.output.state.top5[0].dist, 3);
});

test('location remains inactive until enabled and rejects callbacks after disabling', async () => {
  const hook = createNearby({ enabled: false });
  assert.equal(hook.positions.length, 0);
  assert.equal(hook.routes.length, 0);
  assert.equal(hook.output.state.status, 'idle');
  assert.equal(hook.output.geoPos, null);
  hook.output.requestLocation();
  assert.equal(hook.positions.length, 0);

  hook.update({ enabled: true });
  assert.equal(hook.positions.length, 1);
  const oldSetter = hook.output.setGeoPos;
  hook.update({ enabled: false });
  const updates = hook.updates;
  hook.locate(0);
  hook.positions[0].failure({ code: 1 });
  oldSetter({ lat: 46, lng: -72 });
  assert.equal(hook.updates, updates);
  assert.equal(hook.output.geoPos, null);
  assert.equal(hook.routes.length, 0);

  hook.update({ enabled: true });
  assert.equal(hook.output.geoPos, null, 'Re-enabling must not expose an earlier location');
  hook.locate(1);
  const request = hook.routes[0];
  hook.update({ enabled: false });
  assert.equal(request.signal.aborted, true);
  request.resolve([1]);
  await hook.settle();
  assert.equal(hook.output.state.status, 'idle');
  assert.equal(hook.output.geoPos, null);
});

test('only the newest explicit location request can update the position', async () => {
  const hook = createNearby();
  hook.output.requestLocation();
  assert.equal(hook.positions.length, 2);
  hook.locate(1, 46, -72);
  hook.locate(0, 45, -73);
  assert.equal(hook.output.geoPos.lat, 46);
  assert.equal(hook.routes.length, 1);
  hook.routes[0].resolve([1]);
  await hook.settle();
  assert.equal(hook.output.state.status, 'ok');
});

test('region initializes once and empty station data immediately clears recommendations', async () => {
  const regions = [];
  const hook = createNearby({ onRegionDetected: (region) => regions.push(region) });
  hook.locate();
  hook.routes[0].resolve([1]);
  await hook.settle();
  hook.update({ radius: 10, stations: premium });
  hook.routes[1].resolve([2]);
  await hook.settle();
  assert.deepEqual(regions, ['Montréal']);
  assert.equal(hook.render({ stations: [] }).state.status, 'idle');
  hook.commit();
  assert.equal(hook.routes[1].signal.aborted, true);
});

test('unreachable and invalid route distances cannot become nearby recommendations', async () => {
  const stations = [
    ...regular,
    { ...regular[0], brand: 'Reachable station', price: 160 },
    { ...regular[0], brand: 'Invalid station', price: 170 },
  ];
  const hook = createNearby({ stations });
  hook.locate();
  hook.routes[0].resolve([null, 1.2, NaN]);
  await hook.settle();
  assert.equal(hook.output.state.status, 'ok');
  assert.equal(hook.output.state.top5.length, 1);
  assert.equal(hook.output.state.top5[0].brand, 'Reachable station');
  assert.equal(hook.output.state.top5[0].dist, 1.2);
  hook.update({ radius: 10 });
  hook.routes[1].resolve([null, null, null]);
  await hook.settle();
  assert.equal(hook.output.state.status, 'none');
});

test('route failures retain labelled straight-line fallback and aborts do not publish one', async () => {
  const hook = createNearby();
  hook.locate();
  hook.routes[0].resolve(null);
  await hook.settle();
  assert.equal(hook.output.state.straightLine, true);
  hook.update({ radius: 10 });
  const request = hook.routes[1];
  hook.unmount();
  const updates = hook.updates;
  request.reject(new Error('aborted'));
  await hook.settle();
  hook.positions[0].failure({ code: 1 });
  assert.equal(request.signal.aborted, true);
  assert.equal(hook.updates, updates);
});
