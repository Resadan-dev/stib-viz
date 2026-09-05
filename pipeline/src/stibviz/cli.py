"""Command line entry point.

Milestone M0: only ``--version`` exists. The ``fetch``, ``build``, ``check`` and ``index``
commands arrive with milestone M1 (see ARCHITECTURE.md, section 4.4).
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from stibviz import __version__


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser for the ``stibviz`` command."""
    parser = argparse.ArgumentParser(
        prog="stibviz",
        description="Turn the STIB GTFS feed into trajectories for the stib-viz website.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command and return its exit code."""
    parser = build_parser()
    parser.parse_args(argv)
    parser.print_help()
    return 0
