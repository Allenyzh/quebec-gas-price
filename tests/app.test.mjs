import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

const source = ts.transpileModule(readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const station = { brand: "Station", address: "1 Main", region: "Montréal", type: "Régulier", price: 150, lat: 45.5, lng: -73.5 };
const stations = [station];
const LOCATION_KEY = "fuel-location-osrm-enabled";

function mountApp(overrides = {}, storageEntries = []) {
  const slots = [];
  const storage = new Map(storageEntries);
  const regionChanges = [];
  const nearbyCalls = [];
  const views = new Map();
  let cursor = 0;
  const state = {
    loading: false, refreshing: false, error: null, hasLoadedData: true,
    lang: "en", setLang() {}, t: (key) => key,
    gasType: "Régulier", setGasType() {}, gasTypes: ["Régulier"], gasTypeCounts: { Régulier: 1 },
    region: "__all__", setRegion: (region) => regionChanges.push(region), regions: ["Montréal"], regionStationCounts: { Montréal: 1 },
    radiusKm: 5, setRadiusKm() {}, gasStations: stations, filteredStations: stations,
    stats: { min: 150, max: 150, avg: 150, total: 1 }, brandAverages: [], distribution: null, refresh() {},
    ...overrides,
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => { slots[index].value = next; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useMemo: (factory) => factory(), useCallback: (callback) => callback,
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name.endsWith("useStations")) return { useStations: () => state };
      if (name.endsWith("useNearby")) return { useNearby: (...args) => {
        nearbyCalls.push(args);
        return { state: { status: "idle" }, geoPos: null, requestLocation() {} };
      } };
      if (name.endsWith("useTable")) return { useTable: () => ({ filtered: stations, totalCount: 1, search: "", sortCol: "price", sortAsc: true }) };
      if (name.endsWith("useNavModal")) return { useNavModal: () => ({ navTarget: null, openNavModal() {}, closeNavModal() {} }) };
      if (name.startsWith("./views/")) {
        const key = name.slice("./views/".length);
        const component = () => null;
        views.set(component, key);
        return { [key]: component };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function allNodes(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(allNodes)];
  }
  let nodes;
  function render(changes = {}) {
    Object.assign(state, changes);
    cursor = 0;
    nodes = allNodes(exports.default());
    return nodes;
  }
  render();
  return {
    render, nearbyCalls, regionChanges, storage,
    view: (name) => nodes.find((node) => views.get(node.type) === name),
    find: (predicate) => nodes.find(predicate),
  };
}

test("refresh errors leave the map and table rendered with a retry notice", () => {
  const app = mountApp({ error: "offline" });
  assert.ok(app.view("StationMap"));
  assert.ok(app.view("StationTable"));
  const notice = app.find((node) => node.props?.role === "alert");
  assert.equal(notice.props.children[0], "refreshFail");
  app.render({ hasLoadedData: false, stats: null });
  assert.equal(app.view("StationMap"), undefined);
  assert.ok(app.find((node) => node.type === "button" && node.props.children === "retry"));
});

test("all-fuel browsing does not render combined comparisons or request nearby rankings", () => {
  const app = mountApp({ gasType: "__all__" });
  assert.equal(app.view("MetricsStrip"), undefined);
  assert.equal(app.view("BrandChart"), undefined);
  assert.equal(app.view("DistributionChart"), undefined);
  assert.equal(app.view("NearbyBanner"), undefined);
  assert.equal(app.nearbyCalls.at(-1)[0].length, 0);
  assert.equal(app.view("StationMap").props.comparePrices, false);
  assert.equal(app.view("StationTable").props.comparePrices, false);
  assert.ok(app.find((node) => node.type === "p" && node.props.children === "allFuelsNotice"));
});

test("manual region selection wins even when the first position result arrives later", () => {
  const app = mountApp();
  app.view("Header").props.onRegionChange("__all__");
  app.nearbyCalls.at(-1)[2]("Montréal");
  assert.deepEqual(app.regionChanges, ["__all__"]);
});

test("location defaults on unless the user previously disabled it", () => {
  for (const [saved, expected] of [[null, true], ["1", true], ["0", false]]) {
    const app = mountApp({}, saved === null ? [] : [[LOCATION_KEY, saved]]);
    assert.equal(app.nearbyCalls.at(-1)[3], expected, `nearby location with saved preference ${saved}`);
    assert.equal(app.view("StationMap").props.routingEnabled, expected, `map routing with saved preference ${saved}`);
    assert.equal(app.view("ConsentBanner").props.locationEnabled, expected, `privacy control with saved preference ${saved}`);
  }
});

test("an explicit location opt-out survives privacy dismissal and reload until re-enabled", () => {
  const app = mountApp({}, [[LOCATION_KEY, "0"]]);
  assert.equal(app.nearbyCalls.at(-1)[3], false);
  assert.equal(app.view("StationMap").props.routingEnabled, false);
  app.view("ConsentBanner").props.onOpenChange(false);
  app.render();
  assert.equal(app.nearbyCalls.at(-1)[3], false);
  app.view("StationMap").props.onLocateRequest();
  app.render();
  assert.equal(app.view("ConsentBanner").props.open, true);
  assert.equal(app.nearbyCalls.at(-1)[3], false);
  app.view("ConsentBanner").props.onLocationEnabledChange(true);
  app.render();
  assert.equal(app.nearbyCalls.at(-1)[3], true);
  assert.equal(app.view("StationMap").props.routingEnabled, true);
  app.view("ConsentBanner").props.onLocationEnabledChange(false);
  app.render();
  assert.equal(app.nearbyCalls.at(-1)[3], false);
  assert.equal(app.view("StationMap").props.routingEnabled, false);
  assert.equal(app.storage.get(LOCATION_KEY), "0");
  const reloaded = mountApp({}, app.storage);
  assert.equal(reloaded.nearbyCalls.at(-1)[3], false);
  assert.equal(reloaded.view("StationMap").props.routingEnabled, false);
  assert.equal(reloaded.view("ConsentBanner").props.locationEnabled, false);
});
