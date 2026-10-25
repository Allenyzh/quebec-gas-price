import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const sourceRoot = resolve(import.meta.dirname, "../src");
const require = createRequire(import.meta.url);

function loadSource(path, globals = {}, reactOverride) {
  const cache = new Map();
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "react" && reactOverride) return reactOverride;
      if (!specifier.startsWith(".")) return require(specifier);
      const base = resolve(dirname(filename), specifier);
      const dependency = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      return load(dependency);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, ...globals }, { filename });
    return module.exports;
  };
  return load(resolve(sourceRoot, path));
}

function modalHarness() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  class Element {
    children = [];
    parentElement = null;
    inert = false;
    isConnected = true;
    tabIndex = 0;
    style = {
      getPropertyValue(property) { return this[property] ?? ""; },
      getPropertyPriority() { return ""; },
      setProperty(property, value) { this[property] = value; },
      removeProperty(property) { delete this[property]; },
    };
    constructor(parent) {
      this.parentElement = parent ?? null;
      if (parent) parent.children.push(this);
    }
    contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
    querySelectorAll() { return this.children; }
    hasAttribute() { return false; }
    getClientRects() { return [{}]; }
    closest() { return this.inert ? this : this.parentElement?.closest() ?? null; }
    focus() {
      document.activeElement = this;
      listeners.get("focusin")?.({ target: this });
    }
  }
  document.body = new Element();
  const background = new Element(document.body);
  const trigger = new Element(background);
  const overlay = new Element(document.body);
  const dialog = new Element(overlay);
  const first = new Element(dialog);
  const last = new Element(dialog);
  const restored = [];
  const window = { scrollX: 0, scrollY: 1420, scrollTo: (position) => restored.push(position) };
  trigger.focus();
  const { activateModal } = loadSource("controllers/useModalFocus.ts", { document, window, HTMLElement: Element });
  let closed = 0;
  const cleanup = activateModal(dialog, () => { closed += 1; });
  const key = (key, shiftKey = false) => {
    let prevented = false;
    listeners.get("keydown")?.({ key, shiftKey, preventDefault: () => { prevented = true; }, stopPropagation() {} });
    return prevented;
  };
  return { document, background, trigger, first, last, restored, key, cleanup, get closed() { return closed; } };
}

test("modal enters focus, isolates the background and cycles Tab in both directions", () => {
  const harness = modalHarness();
  assert.equal(harness.document.activeElement, harness.first);
  assert.equal(harness.background.inert, true);
  harness.last.focus();
  assert.equal(harness.key("Tab"), true);
  assert.equal(harness.document.activeElement, harness.first);
  assert.equal(harness.key("Tab", true), true);
  assert.equal(harness.document.activeElement, harness.last);
  harness.trigger.focus();
  assert.equal(harness.document.activeElement, harness.first);
  harness.cleanup();
});

test("Escape closes the modal; cleanup restores reading position and its trigger", () => {
  const harness = modalHarness();
  assert.equal(harness.document.body.style.top, "-1420px");
  assert.equal(harness.key("Escape"), true);
  assert.equal(harness.closed, 1);
  harness.cleanup();
  assert.equal(harness.background.inert, false);
  assert.equal(harness.document.body.style.position, undefined);
  assert.equal(harness.restored[0].top, 1420);
  assert.equal(harness.document.activeElement, harness.trigger);
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  const children = [node.props?.children].flat(Infinity).flatMap(elements);
  return [node, ...children];
}

const station = { brand: "Example", address: "100 Main", region: "Montréal", type: "Diesel", price: 170, lat: 45.5, lng: -73.6 };
const tableProps = {
  stations: [station], filtered: [station], totalCount: 1, search: "", onSearchChange() {},
  sortCol: "price", sortAsc: false, onSort() {}, avg: 170, min: 170, max: 170,
  region: "__all__", onNavigate() {}, t: (key) => key,
};

test("table sorting uses buttons and exposes the active direction", () => {
  const { StationTable } = loadSource("views/StationTable.tsx");
  let sorted;
  const tree = elements(StationTable({ ...tableProps, onSort: (column) => { sorted = column; } }));
  const priceHeader = tree.find((node) => node.type === "th" && node.props["data-col"] === "price");
  assert.equal(priceHeader.props["aria-sort"], "descending");
  assert.equal(priceHeader.props.children.type, "button");
  priceHeader.props.children.props.onClick();
  assert.equal(sorted, "price");
});

test("all-fuel rows keep their fuel label and omit cross-fuel ranks and price colouring", () => {
  const { StationTable } = loadSource("views/StationTable.tsx");
  let destination;
  const tree = elements(StationTable({ ...tableProps, comparePrices: false, onNavigate: (target) => { destination = target; } }));
  assert.equal(tree.some((node) => ["rank", "vsavg"].includes(node.props?.["data-col"])), false);
  assert.equal(tree.find((node) => node.props?.className === "station-fuel-type").props.children, "Diesel");
  assert.equal(tree.find((node) => node.type === "td" && node.props["data-col"] === "price").props.className, "price-neutral");
  tree.find((node) => node.type === "button" && node.props.className === "nav-link").props.onClick();
  assert.equal(destination.fuelType, "Diesel");
});

test("navigation renders a named dialog, a labelled close control and the selected fuel", () => {
  const { NavModal } = loadSource("views/NavModal.tsx");
  const markup = renderToStaticMarkup(createElement(NavModal, {
    target: { lat: 45.5, lng: -73.6, label: "Example 100 Main", brand: "Example", price: 170, fuelType: "Diesel" },
    t: (key) => key,
    onClose() {},
  }));
  assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
  assert.match(markup, /aria-label="close"/);
  assert.match(markup, /Diesel/);
  assert.match(markup, /170\.0¢\/L/);
});

test("privacy dismissal and reopening do not enable location; only the opt-in does", () => {
  const react = { ...require("react"), useState: (init) => [init(), () => {}], useEffect() {}, useLayoutEffect() {}, useRef: () => ({ current: null }), useId: () => "description" };
  const { ConsentBanner } = loadSource("views/ConsentBanner.tsx", { localStorage: { getItem: () => null, setItem() {} } }, react);
  const changes = [];
  const props = { t: (key) => key, open: true, locationEnabled: false, onOpenChange: (value) => changes.push(["open", value]), onLocationEnabledChange: (value) => changes.push(["location", value]) };
  const tree = elements(ConsentBanner(props));
  assert.equal(tree.find((node) => node.type === "input").props.checked, false);
  tree.find((node) => node.props?.className === "consent-btn").props.onClick();
  tree.find((node) => node.props?.className === "consent-reopen").props.onClick();
  assert.deepEqual(changes, [["open", false], ["open", true]]);
  tree.find((node) => node.type === "input").props.onChange({ target: { checked: true } });
  assert.deepEqual(changes.at(-1), ["location", true]);
});
