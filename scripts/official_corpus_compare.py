#!/usr/bin/env python3
import argparse
import json
import math
import os
import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(cmd, timeout):
    try:
        return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        class TimeoutResult:
            returncode = 124
            stdout = exc.stdout.decode("utf-8", errors="ignore") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            stderr = exc.stderr.decode("utf-8", errors="ignore") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return TimeoutResult()


def stl_stats(path):
    data = Path(path).read_bytes()
    vertices = []
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            offset = 84
            for _ in range(count):
                offset += 12
                for _ in range(3):
                    vertices.append(struct.unpack_from("<fff", data, offset))
                    offset += 12
                offset += 2
            return bounds_stats(count, vertices)
    text = data.decode("utf-8", errors="ignore")
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 4 and parts[0].lower() == "vertex":
            vertices.append(tuple(float(x) for x in parts[1:]))
    return bounds_stats(len(vertices) // 3, vertices)


def bounds_stats(triangles, vertices):
    if not vertices:
        return {"triangles": 0, "bounds": None}
    mins = [min(v[i] for v in vertices) for i in range(3)]
    maxs = [max(v[i] for v in vertices) for i in range(3)]
    return {"triangles": triangles, "bounds": {"min": mins, "max": maxs}}


def close_bounds(a, b, tolerance):
    if not a or not b:
        return a == b
    for side in ("min", "max"):
        for x, y in zip(a[side], b[side]):
            if math.isfinite(x) and math.isfinite(y):
                if abs(x - y) > tolerance:
                    return False
            elif x != y:
                return False
    return True


def compare_file(scad, args, tmpdir):
    official_stl = tmpdir / (scad.stem + ".stl")
    official = run(["openscad", "-o", str(official_stl), str(scad)], args.timeout)
    shape = run([
        "node",
        str(ROOT / "scripts/shape_eval.js"),
        "--lib",
        "/usr/share/openscad/libraries",
        str(scad),
    ], args.timeout)
    result = {"file": str(scad)}
    if official.returncode != 0:
        result["official_ok"] = False
        result["official_error"] = (official.stderr or official.stdout).strip()[-1200:]
    else:
        result["official_ok"] = True
        result["official"] = stl_stats(official_stl)
    try:
        shape_json = json.loads(shape.stdout.strip().splitlines()[-1])
    except Exception:
        shape_json = {"ok": False, "error": (shape.stderr or shape.stdout).strip()[-1200:]}
    result["shape"] = shape_json
    if result.get("official_ok") and shape_json.get("ok"):
        result["match"] = (
            result["official"]["triangles"] == shape_json["triangles"]
            and close_bounds(result["official"]["bounds"], shape_json["bounds"], args.tolerance)
        )
    else:
        result["match"] = False
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default="/usr/share/openscad/examples")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--tolerance", type=float, default=1e-4)
    parser.add_argument("--output", default="docs/test/official-corpus-compat.json")
    args = parser.parse_args()

    files = sorted(Path(args.corpus).rglob("*.scad"))
    if args.limit:
        files = files[: args.limit]
    out_path = ROOT / args.output
    out_path.parent.mkdir(parents=True, exist_ok=True)
    results = []
    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        for scad in files:
            results.append(compare_file(scad, args, tmpdir))
    summary = {
        "corpus": str(Path(args.corpus).resolve()),
        "total": len(results),
        "official_ok": sum(1 for r in results if r.get("official_ok")),
        "shape_ok": sum(1 for r in results if r.get("shape", {}).get("ok")),
        "match": sum(1 for r in results if r.get("match")),
    }
    payload = {"summary": summary, "results": results}
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["match"] == summary["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
