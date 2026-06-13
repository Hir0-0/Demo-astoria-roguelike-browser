// js/world/mapGen.js
// Gerador procedural do bioma Planície Enferrujada (overworld)

import { makeTile, varyColor } from './tiles.js';
import { STATE } from '../core/state.js';

// ── PRNG simples (Mulberry32 — determinístico por seed) ────────────────────
function createRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Noise de valor simples para terreno ────────────────────────────────────
function valueNoise(rng, width, height, scale = 0.08) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = rng();
    }
  }
  // Interpola suavemente (bilinear)
  const result = [];
  for (let y = 0; y < height; y++) {
    result[y] = [];
    for (let x = 0; x < width; x++) {
      const fx = x * scale;
      const fy = y * scale;
      const x0 = Math.floor(fx) % width;
      const x1 = (x0 + 1) % width;
      const y0 = Math.floor(fy) % height;
      const y1 = (y0 + 1) % height;
      const tx = fx - Math.floor(fx);
      const ty = fy - Math.floor(fy);
      const top = grid[y0 % height][x0 % width] * (1 - tx) + grid[y0 % height][x1 % width] * tx;
      const bot = grid[y1 % height][x0 % width] * (1 - tx) + grid[y1 % height][x1 % width] * tx;
      result[y][x] = top * (1 - ty) + bot * ty;
    }
  }
  return result;
}

// ── Geração do mapa overworld: Planície Enferrujada ───────────────────────
function generateOverworld(seed, width = 80, height = 60) {
  const rng = createRNG(seed);
  const noise1 = valueNoise(rng, width, height, 0.07);
  const noise2 = valueNoise(rng, width, height, 0.15);

  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const n = noise1[y][x] * 0.6 + noise2[y][x] * 0.4;
      let tileType;

      if (n < 0.20) tileType = "water";
      else if (n < 0.35) tileType = "rust_ground";
      else if (n < 0.50) tileType = "dry_earth";
      else if (n < 0.65) tileType = "grass";
      else if (n < 0.78) tileType = "solar_grass";
      else tileType = "grass";

      const tile = makeTile(tileType);
      // Variação sutil de cor para textura viva
      if (tile.passable) {
        tile.color = varyColor(tile.color, 8);
      }
      tiles[y][x] = tile;
    }
  }

  // ── Insere ruínas solares e features ────────────────────────────────────
  const numRuins = 8 + Math.floor(rng() * 6);
  for (let i = 0; i < numRuins; i++) {
    const cx = 5 + Math.floor(rng() * (width - 10));
    const cy = 5 + Math.floor(rng() * (height - 10));
    const w = 3 + Math.floor(rng() * 5);
    const h = 3 + Math.floor(rng() * 4);
    buildRuinCluster(tiles, cx, cy, w, h, rng);
  }

  // ── Cristais espalhados ───────────────────────────────────────────────────
  const numCrystals = 15 + Math.floor(rng() * 10);
  for (let i = 0; i < numCrystals; i++) {
    const x = 2 + Math.floor(rng() * (width - 4));
    const y = 2 + Math.floor(rng() * (height - 4));
    if (tiles[y][x].passable) {
      tiles[y][x] = makeTile("crystal_node");
    }
  }

  // ── Painéis solares antigos ───────────────────────────────────────────────
  const numPanels = 6 + Math.floor(rng() * 8);
  for (let i = 0; i < numPanels; i++) {
    const x = 2 + Math.floor(rng() * (width - 4));
    const y = 2 + Math.floor(rng() * (height - 4));
    if (tiles[y][x].passable) {
      const len = 2 + Math.floor(rng() * 4);
      for (let j = 0; j < len; j++) {
        if (x + j < width - 1) tiles[y][x + j] = makeTile("solar_panel");
      }
    }
  }

  // ── Árvores velhas ────────────────────────────────────────────────────────
  const numTrees = 20 + Math.floor(rng() * 15);
  for (let i = 0; i < numTrees; i++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));
    if (tiles[y][x].type === "grass" || tiles[y][x].type === "solar_grass") {
      tiles[y][x] = makeTile("old_tree");
    }
  }

  // ── Caminho central ────────────────────────────────────────────────────────
  const pathY = Math.floor(height / 2) + Math.floor(rng() * 6 - 3);
  for (let x = 0; x < width; x++) {
    if (tiles[pathY][x].passable) {
      tiles[pathY][x] = makeTile("path");
    }
  }

  // ── Spawn do jogador (posição segura) ────────────────────────────────────
  let spawnX = Math.floor(width * 0.15);
  let spawnY = pathY;
  while (!tiles[spawnY][spawnX].passable) {
    spawnX++;
  }

  // ── Posição da escada para dungeon ────────────────────────────────────────
  let stairX = Math.floor(width * 0.75);
  let stairY = pathY;
  while (!tiles[stairY][stairX].passable) {
    stairX++;
  }
  tiles[stairY][stairX] = makeTile("stairs_down");

  // ── Inimigos ─────────────────────────────────────────────────────────────
  const entities = spawnEnemies(tiles, width, height, rng, spawnX, spawnY);

  // ── Itens no chão ─────────────────────────────────────────────────────────
  const mapItems = spawnItems(tiles, width, height, rng, spawnX, spawnY);

  return {
    tiles,
    entities,
    items: mapItems,
    stairs: [{ x: stairX, y: stairY, direction: "down", target: "ruins_dungeon" }],
    entrance: { x: spawnX, y: spawnY },
    spawnX,
    spawnY
  };
}

function buildRuinCluster(tiles, cx, cy, w, h, rng) {
  const W = tiles[0].length;
  const H = tiles.length;
  for (let dy = 0; dy <= h; dy++) {
    for (let dx = 0; dx <= w; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const isEdge = dx === 0 || dx === w || dy === 0 || dy === h;
      if (isEdge && rng() > 0.3) {
        tiles[y][x] = makeTile(rng() > 0.5 ? "ruins_wall" : "vine_wall");
      } else if (!isEdge && rng() > 0.85) {
        tiles[y][x] = makeTile("dungeon_pillar");
      }
    }
  }
}

function spawnEnemies(tiles, width, height, rng, spawnX, spawnY) {
  const entities = [];
  const enemyTypes = ["rust_crawler", "crystal_shade", "steam_golem"];
  const weights = [0.5, 0.35, 0.15];
  const count = 18 + Math.floor(rng() * 10);

  for (let i = 0; i < count; i++) {
    let x, y, attempts = 0;
    do {
      x = 2 + Math.floor(rng() * (width - 4));
      y = 2 + Math.floor(rng() * (height - 4));
      attempts++;
    } while (
      (!tiles[y][x].passable ||
      Math.abs(x - spawnX) + Math.abs(y - spawnY) < 8 ||
      entities.some(e => e.x === x && e.y === y)) &&
      attempts < 30
    );

    if (attempts >= 30) continue;

    // Escolha por peso
    const roll = rng();
    let cum = 0, typeId = "rust_crawler";
    for (let t = 0; t < enemyTypes.length; t++) {
      cum += weights[t];
      if (roll < cum) { typeId = enemyTypes[t]; break; }
    }

    // Instancia entidade (dados base virão dos defs, mas copiamos para o mapa)
    entities.push({
      defId: typeId,
      x, y,
      hp: typeId === "steam_golem" ? 20 : typeId === "crystal_shade" ? 5 : 8,
      maxHp: typeId === "steam_golem" ? 20 : typeId === "crystal_shade" ? 5 : 8,
      id: `${typeId}_${i}`
    });
  }
  return entities;
}

function spawnItems(tiles, width, height, rng, spawnX, spawnY) {
  const items = [];
  const pool = [
    { id: "health_potion", weight: 0.35 },
    { id: "rusty_sword",   weight: 0.10 },
    { id: "crystal_dagger",weight: 0.08 },
    { id: "copper_shield", weight: 0.08 },
    { id: "scrap_metal",   weight: 0.20 },
    { id: "crystal_shard", weight: 0.19 }
  ];
  const count = 10 + Math.floor(rng() * 8);

  for (let i = 0; i < count; i++) {
    let x, y, attempts = 0;
    do {
      x = 2 + Math.floor(rng() * (width - 4));
      y = 2 + Math.floor(rng() * (height - 4));
      attempts++;
    } while (
      (!tiles[y][x].passable || items.some(it => it.x === x && it.y === y)) &&
      attempts < 30
    );
    if (attempts >= 30) continue;

    const roll = rng();
    let cum = 0, itemId = "scrap_metal";
    for (const p of pool) {
      cum += p.weight;
      if (roll < cum) { itemId = p.id; break; }
    }
    items.push({ defId: itemId, x, y, id: `item_${i}` });
  }
  return items;
}

export { generateOverworld, createRNG };
