#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");

function parseArgs(argv) {
  const libs = [];
  let file = null;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--lib") {
      if (i + 1 >= argv.length) throw new Error("--lib requires a path");
      libs.push(argv[++i]);
    } else if (arg.startsWith("--lib=")) {
      libs.push(arg.slice("--lib=".length));
    } else if (!file) {
      file = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return { file, libs };
}

let args;
try {
  args = parseArgs(process.argv);
} catch (error) {
  console.error(String(error && error.message || error));
  process.exit(2);
}

if (!args.file) {
  console.error("usage: shape_eval.js [--lib PATH] FILE.scad");
  process.exit(2);
}

const defaultLibDirs = [
  "/usr/share/openscad/libraries",
  "/usr/share/openscad/examples"
];

function existingDirs(dirs) {
  return dirs
    .map(dir => path.resolve(dir))
    .filter((dir, index, all) => all.indexOf(dir) === index && fs.existsSync(dir));
}

function resolveScadPath(request, fromDir, libDirs) {
  const candidates = [
    path.resolve(fromDir, request),
    ...libDirs.map(dir => path.resolve(dir, request))
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function maskCommentsAndStrings(source) {
  const chars = source.split("");
  let state = "code";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === "line") {
      if (ch === "\n") state = "code";
      else chars[i] = " ";
    } else if (state === "block") {
      chars[i] = " ";
      if (ch === "*" && next === "/") {
        chars[++i] = " ";
        state = "code";
      }
    } else if (state === "string") {
      chars[i] = ch === "\n" ? "\n" : " ";
      if (ch === "\\") {
        if (next !== undefined) chars[++i] = next === "\n" ? "\n" : " ";
      } else if (ch === "\"") {
        state = "code";
      }
    } else if (ch === "/" && next === "/") {
      chars[i] = chars[++i] = " ";
      state = "line";
    } else if (ch === "/" && next === "*") {
      chars[i] = chars[++i] = " ";
      state = "block";
    } else if (ch === "\"") {
      chars[i] = " ";
      state = "string";
    }
  }
  return chars.join("");
}

function isWordBoundary(masked, index) {
  return index < 0 || index >= masked.length || !/[A-Za-z0-9_$]/.test(masked[index]);
}

function findDefinitionEnd(masked, start) {
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = start; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "{" && parenDepth === 0 && bracketDepth === 0) {
      let braceDepth = 1;
      for (let j = i + 1; j < masked.length; j++) {
        if (masked[j] === "{") braceDepth++;
        else if (masked[j] === "}") {
          braceDepth--;
          if (braceDepth === 0) return j + 1;
        }
      }
      return masked.length;
    } else if (ch === ";" && parenDepth === 0 && bracketDepth === 0) {
      return i + 1;
    }
  }
  return masked.length;
}

function topLevelDefinitions(source) {
  const masked = maskCommentsAndStrings(source);
  const definitions = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (braceDepth !== 0 || parenDepth !== 0 || bracketDepth !== 0) continue;
    const keyword = masked.startsWith("module", i) ? "module" : masked.startsWith("function", i) ? "function" : null;
    if (!keyword || !isWordBoundary(masked, i - 1) || !isWordBoundary(masked, i + keyword.length)) continue;

    const end = findDefinitionEnd(masked, i);
    definitions.push(source.slice(i, end));
    i = end - 1;
  }
  return definitions.join("\n\n");
}

function parseStlMesh(filePath) {
  const data = fs.readFileSync(filePath);
  const tris = [];
  if (data.length >= 84) {
    const count = data.readUInt32LE(80);
    if (84 + count * 50 === data.length) {
      let offset = 84;
      for (let i = 0; i < count; i++) {
        offset += 12;
        const tri = [];
        for (let v = 0; v < 3; v++) {
          tri.push([data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8)]);
          offset += 12;
        }
        offset += 2;
        tris.push(tri);
      }
      return { tris };
    }
  }
  const vertices = [];
  for (const line of data.toString("utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/i);
    if (match) vertices.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }
  for (let i = 0; i + 2 < vertices.length; i += 3) tris.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
  return { tris };
}

function preprocessScad(source, filePath, libDirs, seen = new Set()) {
  const absolutePath = path.resolve(filePath);
  if (seen.has(absolutePath)) return "";
  seen.add(absolutePath);

  const fromDir = path.dirname(absolutePath);
  const lines = source.split(/(\r?\n)/);
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const match = line.match(/^(\s*)(include|use)\s*<([^>]+)>\s*;?\s*(\/\/.*)?$/);
    if (!match) continue;
    const [, indent, directive, request, comment = ""] = match;
    const resolved = resolveScadPath(request.trim(), fromDir, libDirs);
    if (!resolved) {
      lines[i] = `${indent}// unresolved ${directive} <${request}>${comment ? ` ${comment}` : ""}`;
      continue;
    }
    const includedSource = fs.readFileSync(resolved, "utf8");
    const expanded = preprocessScad(includedSource, resolved, libDirs, seen);
    const replacement = directive === "include" ? expanded : topLevelDefinitions(expanded);
    lines[i] = `${indent}// expanded ${directive} <${request}> from ${resolved}\n${replacement}`;
  }
  seen.delete(absolutePath);
  return lines.join("");
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

async function main() {
try {
  const manifoldPath = path.join(__dirname, "../app/src/main/assets/vendor/manifold-3d/manifold.js");
  if (fs.existsSync(manifoldPath)) {
    const moduleFactory = (await import(pathToFileURL(manifoldPath).href)).default;
    const manifold = await moduleFactory();
    manifold.setup();
    context.ShapeForgeManifold = manifold;
    context.window.ShapeForgeManifold = manifold;
  }
  vm.runInNewContext(match[1] + capture, context, { filename: "index.html" });
  const file = path.resolve(args.file);
  const libDirs = existingDirs([...args.libs, ...defaultLibDirs]);
  const importCache = new Map();
  const importResolver = request => {
    const resolved = resolveScadPath(request, path.dirname(file), libDirs);
    if (!resolved || path.extname(resolved).toLowerCase() !== ".stl") return null;
    if (!importCache.has(resolved)) importCache.set(resolved, parseStlMesh(resolved));
    return importCache.get(resolved);
  };
  context.ShapeForgeImportResolver = importResolver;
  context.window.ShapeForgeImportResolver = importResolver;
  const source = preprocessScad(fs.readFileSync(file, "utf8"), file, libDirs);
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
}

main();
