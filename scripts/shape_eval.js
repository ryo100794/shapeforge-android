#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

if (process.argv.length < 3) {
  console.error("usage: shape_eval.js FILE.scad");
  process.exit(2);
}

function element(id) {
  return {
    id,
    value: "",
    textContent: "",
    style: {},
    options: [{}, {}, {}, {}],
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setPointerCapture() {},
    getContext() { return canvasContext; },
    getBoundingClientRect() { return { width: 800, height: 600 }; }
  };
}

const elements = new Map();
const canvasContext = {
  clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  closePath() {}, fill() {}, stroke() {}
};

const documentStub = {
  body: { appendChild() {} },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  },
  querySelector(selector) {
    return {
      textContent: "",
      classList: { toggle() {} },
      dataset: { mode: selector.includes("editor") ? "editor" : selector.includes("preview") ? "preview" : "both" }
    };
  },
  querySelectorAll(selector) {
    if (selector === ".mode-tab") {
      return ["both", "editor", "preview"].map(mode => ({
        textContent: "",
        dataset: { mode },
        classList: { toggle() {} },
        addEventListener() {}
      }));
    }
    return [];
  },
  createElement() {
    return { style: {}, remove() {}, click() {} };
  }
};

const html = fs.readFileSync(path.join(__dirname, "../app/src/main/assets/index.html"), "utf8");
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error("script block not found");

const capture = `
globalThis.__shapeForge = {
  loadSource,
  renderScad,
  getMeshes: () => meshes,
  getStatus: () => statusEl.textContent,
  getStatusColor: () => statusEl.style.color,
  getMeshInfo: () => meshInfoEl.textContent
};
`;

const context = {
  console,
  require,
  TextDecoder,
  Uint8Array,
  DataView,
  ArrayBuffer,
  Math,
  Number,
  String,
  JSON,
  RegExp,
  Blob: function Blob() {},
  URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
  navigator: { language: "en-US" },
  window: { innerWidth: 1024, addEventListener() {}, open() {} },
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() {} },
  setInterval() {},
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle() { return { color: "rgb(111, 168, 220)" }; }
};
context.globalThis = context;

try {
  vm.runInNewContext(match[1] + capture, context, { filename: "index.html" });
  const file = process.argv[2];
  const source = fs.readFileSync(file, "utf8");
  context.__shapeForge.loadSource(path.basename(file), source);
  const status = context.__shapeForge.getStatus();
  const statusColor = context.__shapeForge.getStatusColor();
  if (statusColor === "var(--bad)") {
    throw new Error(status || "ShapeForge render failed");
  }
  const meshes = context.__shapeForge.getMeshes();
  const triangles = meshes.reduce((n, m) => n + m.tris.length, 0);
  const points = [];
  for (const mesh of meshes) for (const tri of mesh.tris) for (const p of tri) points.push(p);
  const bounds = points.length ? points.reduce((b, p) => ({
    min: b.min.map((v, i) => Math.min(v, p[i])),
    max: b.max.map((v, i) => Math.max(v, p[i]))
  }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }) : null;
  console.log(JSON.stringify({ ok: true, triangles, meshes: meshes.length, bounds, status }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) }));
  process.exit(1);
}
