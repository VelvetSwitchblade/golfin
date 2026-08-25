from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import compile_legacy_goodwood


def main() -> None:
    parser = argparse.ArgumentParser(description="Golfin course compiler")
    subcommands = parser.add_subparsers(dest="command", required=True)

    goodwood = subcommands.add_parser("compile-goodwood", help="Compile the current Goodwood prototype hole package")
    goodwood.add_argument("--source", default="public/courses/goodwood-downs-1/hole.json", type=Path)
    goodwood.add_argument("--out", default="public/courses/goodwood-downs-1/package", type=Path)
    goodwood.add_argument("--dtm", default="compiler/fixtures/goodwood-downs-1-dtm.asc", type=Path)

    args = parser.parse_args()

    if args.command == "compile-goodwood":
        result = compile_legacy_goodwood(args.source, args.out, args.dtm)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
