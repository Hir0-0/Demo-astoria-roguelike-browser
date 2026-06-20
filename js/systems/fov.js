// js/systems/fov.js
// Campo de Visão — Shadowcasting recursivo simples
// Baseado no algoritmo clássico de Adam Milazzo

import { STATE, getTileAt } from '../core/state.js';

const FOV_RADIUS = 10;

// Multiplicadores para os 8 octantes
const MULT = [
  [ 1,  0,  0, -1, -1,  0,  0,  1],
  [ 0,  1, -1,  0,  0, -1,  1,  0],
  [ 0,  1,  1,  0,  0, -1, -1,  0],
  [ 1,  0,  0,  1, -1,  0,  0, -1]
];

function computeFOV(originX, originY, radius = FOV_RADIUS) {
  const { map } = STATE;

  // Zera visibilidade (mantém explorado)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y] && map.tiles[y][x]) {
        map.tiles[y][x].visible = false;
      }
    }
  }

  // Tile de origem sempre visível
  markVisible(originX, originY);

  // Executa em 8 octantes
  for (let oct = 0; oct < 8; oct++) {
    castLight(
      originX, originY,
      1, 1.0, 0.0, radius,
      MULT[0][oct], MULT[1][oct],
      MULT[2][oct], MULT[3][oct]
    );
  }
}

function castLight(cx, cy, row, startSlope, endSlope, radius, xx, xy, yx, yy) {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;
    let dx = -i, dy = -i;

    for (; dx <= 0; dx++) {
      const l_slope = (dx - 0.5) / (dy + 0.5);
      const r_slope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < r_slope) continue;
      if (endSlope > l_slope) break;

      const x = cx + dx * xx + dy * xy;
      const y = cy + dx * yx + dy * yy;

      if (x < 0 || y < 0 || x >= STATE.map.width || y >= STATE.map.height) continue;

      const dist2 = dx * dx + dy * dy;
      if (dist2 <= radius * radius) {
        markVisible(x, y);
      }

      const tile = getTileAt(x, y);
      const isWall = tile && !tile.passable;

      if (blocked) {
        if (isWall) {
          nextStartSlope = r_slope;
          continue;
        } else {
          blocked = false;
          startSlope = nextStartSlope;
        }
      } else {
        if (isWall && i < radius) {
          blocked = true;
          castLight(cx, cy, i + 1, startSlope, l_slope, radius, xx, xy, yx, yy);
          nextStartSlope = r_slope;
        }
      }
    }
    if (blocked) break;
  }
}

function markVisible(x, y) {
  const tile = getTileAt(x, y);
  if (tile) {
    tile.visible = true;
    tile.explored = true;
  }
}

// Distância de Chebyshev (útil para IA e skills)
function chebyshevDist(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

// Distância Manhattan
function manhattanDist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

// Linha de visão (para skills de alvo)
function hasLineOfSight(ax, ay, bx, by) {
  let x = ax, y = ay;
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));

  for (let i = 0; i < steps; i++) {
    x += dx;
    y += dy;
    if (x === bx && y === by) return true;
    const tile = getTileAt(x, y);
    if (!tile || !tile.passable) return false;
  }
  return true;
}

export { computeFOV, chebyshevDist, manhattanDist, hasLineOfSight, FOV_RADIUS };
