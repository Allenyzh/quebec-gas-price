import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function compile(file, replacements = []) {
  let source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const routeModule = { exports: {} };
vm.runInNewContext(compile("../src/models/mapRoutes.ts"), {
  exports: routeModule.exports,
  AbortController,
  fetch: (...args) => globalThis.fetch(...args),
});
const { createMapRouteLoader } = routeModule.exports;
const origin = { lat: 45, lng: -73 };
const response = (latitude) => ({
  ok: true,
  json: async () => ({ code: "Ok", routes: [{ geometry: { coordinates: [[-73, 45], [-73, latitude]] } }] }),
});

test("a late route cannot overwrite the newer popup's route", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = (_url, options) => new Promise((resolve) => requests.push({ resolve, signal: options.signal }));
  const loader = createMapRouteLoader();
  const first = loader.load(origin, { lat: 46, lng: -73 });
  const second = loader.load(origin, { lat: 47, lng: -73 });
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(response(47));
  assert.equal((await second)[1][0], 47);
  requests[0].resolve(response(46));
  assert.equal(await first, null);
});

test("closing a popup invalidates an in-flight route even if fetch ignores abort", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let finish;
  let signal;
  globalThis.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  };
  const loader = createMapRouteLoader();
  const route = loader.load(origin, { lat: 46, lng: -73 });
  loader.cancel();
  assert.equal(signal.aborted, true);
  finish(response(46));
  assert.equal(await route, null);
});

test("cached route completion is also invalidated when a popup closes", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount++; return response(46); };
  const loader = createMapRouteLoader();
  await loader.load(origin, { lat: 46, lng: -73 });
  const cached = loader.load(origin, { lat: 46, lng: -73 });
  loader.cancel();
  assert.equal(await cached, null);
  assert.equal(fetchCount, 1);
});

function mountMap(overrides = {}) {
  const effects = [];
  const markers = [];
  const layers = new Set();
  const events = {};
  const clicks = {};
  let tree;
  const map = {
    setView() { return this; },
    getContainer: () => ({ addEventListener: (event, fn) => { clicks[event] = fn; } }),
    on: (event, fn) => { events[event] = fn; },
    addLayer: (layer) => { layers.add(layer); },
    removeLayer: (layer) => { layers.delete(layer); },
    invalidateSize() {}, fitBounds() {}, remove() {},
  };
  const leaflet = {
    map: () => map,
    divIcon: (options) => options,
    marker: (coordinates, options) => {
      const marker = {
        coordinates, options,
        bindPopup(html) { this.html = html; return this; },
        addTo(target) { target.addLayer(this); return this; },
      };
      markers.push(marker);
      return marker;
    },
    layerGroup: () => ({
      markers: [],
      addLayer(marker) { this.markers.push(marker); return this; },
      addTo(target) { target.addLayer(this); return this; },
    }),
    latLngBounds: (points) => points,
  };
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compile("../src/views/StationMap.tsx", [["import.meta.env.VITE_CARTO_API_KEY?.trim()", "undefined"]]), {
    exports,
    require: (name) => {
      if (name === "react") return {
        useEffect: (effect) => effects.push(effect),
        useRef: (value) => ({ current: value }),
        useState: (value) => [typeof value === "function" ? value() : value, () => {}],
        useCallback: (callback) => callback,
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "leaflet") return leaflet;
      if (name === "../models/geo") return { priceToColor: () => "rgb(55,140,80)" };
      if (name === "../models/mapRoutes") return { createMapRouteLoader };
      return {};
    },
  });
  const stations = [
    { brand: "Brand", address: "Street", region: "Region", type: "Regular", price: 150, lat: 45, lng: -73 },
    { brand: "Brand", address: "Street", region: "Region", type: "Diesel", price: 170, lat: 45, lng: -73 },
  ];
  tree = exports.StationMap({
    stations,
    stats: { min: 150, max: 170, avg: 160, total: 2 },
    t: (key) => key,
    onNavigate() {},
    geoPos: origin,
    ...overrides,
  });
  // The DOM ref gets assigned by React before mount effects run.
  const mapContainer = findNode(tree, (node) => node.props.id === "map");
  mapContainer.props.ref.current = {};
  const cleanups = effects.map((effect) => effect());
  return { markers, events, clicks, tree, layers, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (node.props && predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

test("all-fuels mode exposes colocated fuels in one neutral popup and preserves navigation fuel", () => {
  let target;
  const view = mountMap({ comparePrices: false, routingEnabled: false, onNavigate: (value) => { target = value; } });
  assert.equal(view.markers.length, 1);
  const html = view.markers[0].html;
  assert.match(html, /Regular/);
  assert.match(html, /Diesel/);
  assert.match(html, /data-nav-type="Diesel"/);
  assert.doesNotMatch(html, /map-popup-rank/);
  assert.match(view.markers[0].options.icon.html, /#64748b/);
  view.clicks.click({ target: { closest: () => ({ dataset: { navLat: "45", navLng: "-73", navPrice: "170", navType: "Diesel" } }) }, preventDefault() {} });
  assert.equal(target.fuelType, "Diesel");
  view.unmount();
});

test("disabled location sharing makes no route request or user marker and locate delegates to the parent", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let fetchCount = 0;
  let locateRequests = 0;
  globalThis.fetch = async () => { fetchCount++; return response(46); };
  const view = mountMap({ routingEnabled: false, onLocateRequest: () => { locateRequests++; } });
  view.events.popupopen({ popup: { getLatLng: () => ({ lat: 46, lng: -73 }), isOpen: () => true } });
  await Promise.resolve();
  assert.equal(fetchCount, 0);
  assert.equal(view.markers.filter((marker) => marker.options.interactive === false).length, 0);
  findNode(view.tree, (node) => node.props["aria-label"] === "myLocation").props.onClick();
  assert.equal(locateRequests, 1);
  assert.equal(fetchCount, 0);
  view.unmount();
});

test("a busy locate button remains focusable but ignores repeat requests", () => {
  let requests = 0;
  const view = mountMap({ locating: true, onLocateRequest: () => { requests++; } });
  const button = findNode(view.tree, (node) => node.props["aria-label"] === "myLocation");
  assert.equal(button.props["aria-disabled"], true);
  assert.equal(button.props.disabled, undefined);
  button.props.onClick();
  assert.equal(requests, 0);
  view.unmount();
});

test("map popup close and unmount abort their active route requests", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = (_url, options) => new Promise((resolve) => requests.push({ resolve, signal: options.signal }));
  const view = mountMap();
  const popup = { getLatLng: () => ({ lat: 46, lng: -73 }), isOpen: () => true };
  view.events.popupopen({ popup });
  view.events.popupclose();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(response(46));
  await Promise.resolve();
  view.events.popupopen({ popup });
  view.unmount();
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(response(46));
  await Promise.resolve();
});
