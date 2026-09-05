"""Point d'entrée en ligne de commande.

Jalon M0 : seule l'option ``--version`` existe. Les commandes ``fetch``, ``build``, ``check``
et ``index`` arrivent avec le jalon M1 (voir ARCHITECTURE.md, section 4.4).
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from stibviz import __version__


def build_parser() -> argparse.ArgumentParser:
    """Construit l'analyseur d'arguments de la commande ``stibviz``."""
    parser = argparse.ArgumentParser(
        prog="stibviz",
        description="Transforme le GTFS STIB en trajectoires pour le site stib-viz.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Exécute la commande et renvoie le code de sortie."""
    parser = build_parser()
    parser.parse_args(argv)
    parser.print_help()
    return 0
