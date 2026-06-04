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

- Primitives: `cube`, `sphere`, `cylinder`, `polyhedron`
- 2D/extrusion: `square`, `circle`, `polygon`, `linear_extrude`, `rotate_extrude`, `offset`, 2D `hull`
- Transforms: `translate`, axis-aware `rotate`, `scale`, `mirror`, `color`
- Structure: `union`, `group`, `render`, `children()` / `$children`, forward-referenced user `module` and `function` definitions
- Control flow: `for`, `if`, `assign`; `include`/`use` references are parsed as references
- Basic variables, named arguments, arrays/ranges/indexing, arithmetic, comparisons, ternaries, vector `.x/.y/.z`, and common math functions

## Known Gaps Toward Full Compatibility

- Exact Boolean/tessellation parity for `difference`, `intersection`, `hull`, `offset`, and extrusions
- Remaining list-comprehension edge cases and recursive function edge cases
- Built-ins such as `text`, `minkowski`, `projection`, `surface`, `import`
- Remaining `$fn` / `$fa` / `$fs` tessellation edge cases and numerical edge cases

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

- Official examples: 48 files, official rendered 35, ShapeForge rendered 45, exact model matches 5.
- MCAD libraries: 38 files, official rendered 6, ShapeForge rendered 23, exact model matches 0.

Reports are written to `docs/test/official-corpus-compat.json` and `docs/test/mcad-corpus-compat.json`.
