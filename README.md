# ShapeForge

Small Android APK with a CAD script editor, local mesh preview, and STL export.

The app is intentionally self-contained: it uses a Java `WebView` shell and bundled HTML/CSS/JavaScript assets, following the lightweight Gradle project layout used by `ime-console`.

## Compatibility Policy

ShapeForge is an independent implementation. It must not copy or embed source code from the upstream desktop CAD project. Compatibility is a behavior target: syntax, evaluation rules, module/function semantics, geometry output, and export behavior should converge through clean-room implementation and compatibility tests.

The app should fail clearly for unsupported language features instead of producing knowingly incorrect geometry.

## Localization

The UI supports Japanese and English, with automatic language selection from the device/browser locale.

## Official References

The app links to the upstream project documentation and cheat sheet so users can look up official syntax and code examples while editing:

- https://openscad.org/documentation.html
- https://openscad.org/cheatsheet/index.html

These links are references only. ShapeForge does not copy or embed upstream source code.

## Current Surface

- Primitives: `cube`, `sphere`, `cylinder`
- Transforms: `translate`, `rotate`, `scale`, `mirror`, `color`
- Structure: `union`, `group`, user `module` definitions
- Basic variables, named arguments, arrays, arithmetic, and common math functions

## Known Gaps Toward Full Compatibility

- Boolean CSG: `difference`, `intersection`
- Control flow: `for`, `if`, `let`, `assign`, list comprehensions
- User-defined `function` evaluation
- Built-ins such as `polygon`, `polyhedron`, `text`, `hull`, `minkowski`, `offset`, `projection`, `surface`, `import`
- Exact `$fn` / `$fa` / `$fs` tessellation behavior and numerical edge cases

## Build

```sh
./gradlew :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/ShapeForge-0.1.0-debug.apk`.

## Compatibility Tests

Install the official CLI, then compare official STL output against ShapeForge's headless evaluator:

```sh
sudo apt-get install openscad
scripts/official_corpus_compare.py --corpus /usr/share/openscad/examples
scripts/official_corpus_compare.py --corpus /usr/share/openscad/libraries
```

Latest local results:

- Official examples: 48 files, official rendered 42, ShapeForge rendered 11, exact model matches 0.
- MCAD libraries: 38 files, official rendered 6, ShapeForge rendered 11, exact model matches 0.

Reports are written to `docs/test/official-corpus-compat.json` and `docs/test/mcad-corpus-compat.json`.
