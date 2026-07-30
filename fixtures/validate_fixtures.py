import json, sys
from pathlib import Path

def validate(path):
    data = json.load(open(path))
    rows, cols = data["boardRows"], data["boardCols"]
    grid = data["solution"]["grid"]
    assert len(grid) == rows, f"{path}: filas no coinciden"
    assert all(len(r) == cols for r in grid), f"{path}: columnas no coinciden"

    counts = {}
    for r in range(rows):
        for c in range(cols):
            name = grid[r][c]
            counts.setdefault(name, []).append((r, c))

    total_cells = rows * cols
    assert total_cells % 5 == 0, f"{path}: total de celdas no es multiplo de 5"

    for name, cells in counts.items():
        assert len(cells) == 5, f"{path}: pieza {name} tiene {len(cells)} celdas, deberia tener 5"

    assert sum(len(v) for v in counts.values()) == total_cells, f"{path}: no cubre el tablero completo"

    print(f"OK  {path.name}  ({len(counts)} piezas, {rows}x{cols}={total_cells} celdas)")

for f in sorted(Path("/home/claude/fixtures/expected").glob("*.json")):
    validate(f)

print("Todos los fixtures son internamente consistentes.")
