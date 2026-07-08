// js/world/mapGen.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-F] generateOverworld() — 3 entradas de dungeon espalhadas (dungeonEntrances[]).
//             generateDungeon() — parâmetro tier; dificuldade/loot escalam por tier*depth.
//  [v0.0.6-G] generateOverworld() — biomas via noise de baixa frequência.
//             Cada tile recebe biomeId; passe final aplica tint cosmético via tintColor().
//  Mantidas todas as correções v0.0.5.1 (stairs duplo, lava_crack, attempt, varyColor).

import { makeTile, varyColor, BIOMES, tintColor } from './tiles.js';
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
    for (let x = 0; x < width; x++) grid[y][x] = rng();
  }
  const result = [];
  for (let y = 0; y < height; y++) {
    result[y] = [];
    for (let x = 0; x < width; x++) {
      const fx = x * scale, fy = y * scale;
      const x0 = Math.floor(fx) % width,  x1 = (x0 + 1) % width;
      const y0 = Math.floor(fy) % height, y1 = (y0 + 1) % height;
      const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
      const top = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx;
      const bot = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx;
      result[y][x] = top * (1 - ty) + bot * ty;
    }
  }
  return result;
}

// ── Geração do mapa overworld ──────────────────────────────────────────────
// [v0.0.6-F] Gera 3 entradas de dungeon (dungeonEntrances) separadas pelo mapa.
// [v0.0.6-G] Aplica biomas via noise de baixa frequência (scale=0.04).
//            Cada tile recebe biomeId para referência futura (recursos por bioma).
function generateOverworld(seed, width = 80, height = 60) {
  const rng    = createRNG(seed);
  const noise1 = valueNoise(rng, width, height, 0.07);
  const noise2 = valueNoise(rng, width, height, 0.15);
  // [v0.0.6-G] Noise de bioma: frequência muito baixa para regiões amplas e suaves.
  const noiseB = valueNoise(rng, width, height, 0.04);

  // ── Mapa base de tiles ─────────────────────────────────────────────────
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const n = noise1[y][x] * 0.6 + noise2[y][x] * 0.4;
      let tileType;
      if      (n < 0.20) tileType = "water";
      else if (n < 0.35) tileType = "rust_ground";
      else if (n < 0.50) tileType = "dry_earth";
      else if (n < 0.65) tileType = "grass";
      else if (n < 0.78) tileType = "solar_grass";
      else               tileType = "grass";

      const tile = makeTile(tileType);
      if (tile.passable) tile.color = varyColor(tile.color, 8);
      tiles[y][x] = tile;
    }
  }

  // [v0.0.6-G] Passe de bioma: classifica cada tile por região de noise.
  // Plains (0–0.40) | Forest (0.40–0.70) | Desert (0.70–1.0)
  // Aplica tint cosmético e marca biomeId no tile para uso futuro.
  const biomeKeys = Object.keys(BIOMES);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = noiseB[y][x];
      let biomeId;
      if      (b < 0.40) biomeId = "plains";
      else if (b < 0.70) biomeId = "forest";
      else               biomeId = "desert";

      const biome = BIOMES[biomeId];
      const tile  = tiles[y][x];
      tile.biomeId = biomeId;
      // Aplica tint sobre cor atual (blending leve — não esmaga a variação de varyColor)
      if (tile.passable && biome.tint) {
        tile.color = tintColor(tile.color, biome.tint, 0.20);
      }
    }
  }

  // ── Features: ruínas, cristais, painéis, árvores ──────────────────────
  const numRuins = 8 + Math.floor(rng() * 6);
  for (let i = 0; i < numRuins; i++) {
    buildRuinCluster(tiles,
      5 + Math.floor(rng() * (width  - 10)),
      5 + Math.floor(rng() * (height - 10)),
      3 + Math.floor(rng() * 5),
      3 + Math.floor(rng() * 4),
      rng
    );
  }
  const numCrystals = 15 + Math.floor(rng() * 10);
  for (let i = 0; i < numCrystals; i++) {
    const x = 2 + Math.floor(rng() * (width - 4));
    const y = 2 + Math.floor(rng() * (height - 4));
    if (tiles[y][x].passable) tiles[y][x] = makeTile("crystal_node");
  }
  const numPanels = 6 + Math.floor(rng() * 8);
  for (let i = 0; i < numPanels; i++) {
    const x = 2 + Math.floor(rng() * (width - 4));
    const y = 2 + Math.floor(rng() * (height - 4));
    if (tiles[y][x].passable) {
      const len = 2 + Math.floor(rng() * 4);
      for (let j = 0; j < len && x + j < width - 1; j++)
        tiles[y][x + j] = makeTile("solar_panel");
    }
  }
  const numTrees = 20 + Math.floor(rng() * 15);
  for (let i = 0; i < numTrees; i++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));
    if (tiles[y][x].type === "grass" || tiles[y][x].type === "solar_grass")
      tiles[y][x] = makeTile("old_tree");
  }

  // ── Caminho central ───────────────────────────────────────────────────
  const pathY = Math.floor(height / 2) + Math.floor(rng() * 6 - 3);
  for (let x = 0; x < width; x++) {
    if (tiles[pathY][x].passable) tiles[pathY][x] = makeTile("path");
  }

  // ── Spawn do jogador ──────────────────────────────────────────────────
  let spawnX = Math.floor(width * 0.15), spawnY = pathY;
  {
    let attempts = 0;
    while (!tiles[spawnY]?.[spawnX]?.passable && attempts < width) { spawnX++; attempts++; }
    if (!tiles[spawnY]?.[spawnX]?.passable) {
      const fb = findFirstPassableTile(tiles, width, height);
      spawnX = fb.x; spawnY = fb.y;
    }
  }

  // [v0.0.6-F] 3 entradas de dungeon distribuídas: terços esquerdo, central e direito.
  // Cada uma tem um id único usado como chave em STATE.dungeonProgress.
  const entrancePositions = [
    { frac: 0.30, id: "entrance_west"   },
    { frac: 0.55, id: "entrance_center" },
    { frac: 0.78, id: "entrance_east"   }
  ];
  const dungeonEntrances = [];

  for (const ep of entrancePositions) {
    let ex = Math.floor(width * ep.frac), ey = pathY;
    // Garante separação mínima do spawn do jogador (evita colisão visual)
    if (Math.abs(ex - spawnX) < 5) ex += 6;
    let attempts = 0;
    while (!tiles[ey]?.[ex]?.passable && attempts < width) { ex++; attempts++; }
    if (!tiles[ey]?.[ex]?.passable) {
      const fb = findFirstPassableTile(tiles, width, height, spawnX, spawnY);
      ex = fb.x; ey = fb.y;
    }
    // [BUG-17] Garante que não sobrepõe outra entrada já colocada.
    // Antes: entrada era descartada silenciosamente se conflito persistia após fallback
    // (reproduzível em ~0,1% das seeds, ex: seed 66). Agora: tenta deslocar lateralmente
    // até 10 tiles antes de desistir, garantindo 3 entradas na esmagadora maioria dos seeds.
    let finalEx = ex, finalEy = ey, resolved = false;
    for (let offset = 0; offset <= 10 && !resolved; offset++) {
      const cx = ex + offset;
      if (cx < width && tiles[finalEy]?.[cx]?.passable) {
        const conflict = dungeonEntrances.some(
          e => Math.abs(e.x - cx) < 4 && Math.abs(e.y - finalEy) < 4
        );
        if (!conflict) { finalEx = cx; resolved = true; }
      }
    }
    if (resolved) {
      tiles[finalEy][finalEx] = makeTile("dungeon_entrance");
      dungeonEntrances.push({ id: ep.id, x: finalEx, y: finalEy });
    } else {
      // [BUG-17] Fallback esgotado: registra no console sem travar o jogo.
      // O overworld gerado com 2 entradas é preferível a uma exceção não tratada.
      console.warn(`[BUG-17] Entrada ${ep.id} não pôde ser posicionada sem conflito (seed afetada).`);
    }
  }

  // ── Inimigos e itens do overworld ─────────────────────────────────────
  const entities = spawnEnemies(tiles, width, height, rng, spawnX, spawnY);
  const mapItems = spawnItems(tiles, width, height, rng, spawnX, spawnY);

  return {
    tiles,
    entities,
    items: mapItems,
    // O overworld não tem stairs próprios — navegação de dungeon usa dungeonEntrances.
    stairs: [],
    entrance:         { x: spawnX, y: spawnY },
    dungeonEntrances,
    spawnX,
    spawnY
  };
}

function findFirstPassableTile(tiles, width, height, avoidX = -1, avoidY = -1) {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (tiles[y]?.[x]?.passable && !(x === avoidX && y === avoidY)) return { x, y };
  if (tiles[0]?.[0]) tiles[0][0] = makeTile("path");
  return { x: 0, y: 0 };
}

function buildRuinCluster(tiles, cx, cy, w, h, rng) {
  const W = tiles[0].length, H = tiles.length;
  for (let dy = 0; dy <= h; dy++) {
    for (let dx = 0; dx <= w; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const isEdge = dx === 0 || dx === w || dy === 0 || dy === h;
      if (isEdge && rng() > 0.3)
        tiles[y][x] = makeTile(rng() > 0.5 ? "ruins_wall" : "vine_wall");
      else if (!isEdge && rng() > 0.85)
        tiles[y][x] = makeTile("dungeon_pillar");
    }
  }
}

function spawnEnemies(tiles, width, height, rng, spawnX, spawnY) {
  const entities  = [];
  const enemyTypes = ["rust_crawler", "crystal_shade", "steam_golem"];
  const weights    = [0.5, 0.35, 0.15];
  const count      = 18 + Math.floor(rng() * 10);
  for (let i = 0; i < count; i++) {
    let x, y, attempts = 0;
    do {
      x = 2 + Math.floor(rng() * (width - 4));
      y = 2 + Math.floor(rng() * (height - 4));
      attempts++;
    } while (
      (!tiles[y][x].passable ||
       Math.abs(x - spawnX) + Math.abs(y - spawnY) < 8 ||
       entities.some(e => e.x === x && e.y === y)) && attempts < 30
    );
    if (attempts >= 30) continue;
    const roll = rng();
    let cum = 0, typeId = "rust_crawler";
    for (let t = 0; t < enemyTypes.length; t++) {
      cum += weights[t];
      if (roll < cum) { typeId = enemyTypes[t]; break; }
    }
    entities.push({
      defId: typeId, x, y,
      hp:    typeId === "steam_golem" ? 20 : typeId === "crystal_shade" ? 5 : 8,
      maxHp: typeId === "steam_golem" ? 20 : typeId === "crystal_shade" ? 5 : 8,
      id: `${typeId}_${i}`
    });
  }
  return entities;
}

function spawnItems(tiles, width, height, rng, spawnX, spawnY) {
  const items = [];
  const pool  = [
    { id: "health_potion",  weight: 0.30 },
    { id: "rusty_sword",    weight: 0.08 },
    { id: "crystal_dagger", weight: 0.06 },
    { id: "copper_shield",  weight: 0.06 },
    { id: "scrap_metal",    weight: 0.25 },
    { id: "crystal_shard",  weight: 0.15 },
    { id: "gear_fragment",  weight: 0.10 }
  ];
  const count = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < count; i++) {
    let x, y, attempts = 0;
    do {
      x = 2 + Math.floor(rng() * (width - 4));
      y = 2 + Math.floor(rng() * (height - 4));
      attempts++;
    } while ((!tiles[y][x].passable || items.some(it => it.x === x && it.y === y)) && attempts < 30);
    if (attempts >= 30) continue;
    const roll = rng();
    let cum = 0, itemId = "scrap_metal";
    for (const p of pool) { cum += p.weight; if (roll < cum) { itemId = p.id; break; } }
    items.push({ defId: itemId, x, y, id: `item_${i}` });
  }
  return items;
}

// ════════════════════════════════════════════════════════════════════════════
// ── Dungeon: Ruínas de Cristal ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
const MAX_DEPTH = 5;

// [v0.0.6-F] Parâmetro tier: multiplica dificuldade em cima do escalonamento
// por depth. tier=1 (primeira vez) = comportamento idêntico à v0.0.5.
// tier incrementa por expedição completada naquela entrada (engine.js).
function generateDungeon(seed, depth, width = 50, height = 36, attempt = 0, tier = 1) {
  const rng = createRNG(seed + depth * 7919 + tier * 31337);
  const clampedDepth = Math.max(1, Math.min(depth, MAX_DEPTH));
  const clampedTier  = Math.max(1, tier);

  // Base: tudo parede
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) tiles[y][x] = makeTile("dungeon_wall");
  }

  // Grade de salas
  const GRID_COLS = 4, GRID_ROWS = 3;
  const cellW = Math.floor(width  / GRID_COLS);
  const cellH = Math.floor(height / GRID_ROWS);
  const rooms = [];
  const skipChance = attempt < 5 ? 0.18 : 0;

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      if (rng() < skipChance && rooms.length > 0) continue;
      const maxW = Math.max(4, cellW - 3), maxH = Math.max(4, cellH - 3);
      const rw = 4 + Math.floor(rng() * Math.max(1, maxW - 4));
      const rh = 4 + Math.floor(rng() * Math.max(1, maxH - 4));
      const rx = gx * cellW + 1 + Math.floor(rng() * Math.max(1, cellW - rw - 2));
      const ry = gy * cellH + 1 + Math.floor(rng() * Math.max(1, cellH - rh - 2));
      const x0 = Math.max(1, rx), y0 = Math.max(1, ry);
      const x1 = Math.min(width - 2, rx + rw), y1 = Math.min(height - 2, ry + rh);
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;
      rooms.push({ id: rooms.length, x: x0, y: y0, w: x1-x0, h: y1-y0,
        cx: Math.floor((x0+x1)/2), cy: Math.floor((y0+y1)/2) });
    }
  }

  if (rooms.length < 4) return generateDungeon(seed + 104729, depth, width, height, attempt + 1, tier);

  for (const room of rooms) carveRoom(tiles, room, () => pickFloorType(rng, clampedDepth));

  // Árvore geradora
  const visited = [rooms[0]], remaining = rooms.slice(1), edges = [];
  while (remaining.length > 0) {
    let bestI = 0, bestJ = 0, bestDist = Infinity;
    for (let i = 0; i < visited.length; i++)
      for (let j = 0; j < remaining.length; j++) {
        const d = manhattanRoomDist(visited[i], remaining[j]);
        if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
      }
    const from = visited[bestI], to = remaining.splice(bestJ, 1)[0];
    edges.push({ a: from.id, b: to.id });
    visited.push(to);
  }
  for (const edge of edges) {
    const a = rooms[edge.a], b = rooms[edge.b];
    carveCorridor(tiles, a.cx, a.cy, b.cx, b.cy, () => pickFloorType(rng, clampedDepth), rng);
  }

  const adjacency = buildAdjacency(rooms.length, edges);
  const distFromEntrance = bfsDistances(adjacency, rooms[0].id);
  let exitRoomId = rooms[0].id, maxDist = -1;
  for (let i = 0; i < rooms.length; i++)
    if (distFromEntrance[i] > maxDist) { maxDist = distFromEntrance[i]; exitRoomId = i; }

  const entranceRoom = rooms[0], exitRoom = rooms[exitRoomId];
  const mainPathRoomIds = new Set(shortestPathRoomIds(adjacency, entranceRoom.id, exitRoomId));
  const offPathRooms    = rooms.filter(r => !mainPathRoomIds.has(r.id));
  const numOptional     = offPathRooms.length > 0 ? (1 + (offPathRooms.length > 2 && rng() < 0.4 ? 1 : 0)) : 0;
  const optionalRoomIds = new Set();
  {
    const pool = [...offPathRooms];
    for (let i = 0; i < numOptional && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      optionalRoomIds.add(pool[idx].id);
      pool.splice(idx, 1);
    }
  }

  tiles[entranceRoom.cy][entranceRoom.cx] = makeTile("stairs_up");
  const isLastFloor = clampedDepth >= MAX_DEPTH;
  tiles[exitRoom.cy][exitRoom.cx] = makeTile(isLastFloor ? "exit" : "stairs_down");

  // Pilares
  for (const room of rooms) {
    if (room.w < 5 || room.h < 5) continue;
    if (rng() < 0.4) {
      const px = room.x + 1 + Math.floor(rng() * (room.w - 2));
      const py = room.y + 1 + Math.floor(rng() * (room.h - 2));
      if ((px === entranceRoom.cx && py === entranceRoom.cy) || (px === exitRoom.cx && py === exitRoom.cy)) continue;
      tiles[py][px] = makeTile("dungeon_pillar");
    }
  }

  // Lava_crack (fora da rota crítica, frequência cresce com depth)
  const lavaChance = 0.10 + (clampedDepth - 1) * 0.08;
  for (const room of rooms) {
    if (mainPathRoomIds.has(room.id) || room.w < 5 || room.h < 5) continue;
    if (rng() >= lavaChance) continue;
    const numCracks = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < numCracks; i++) {
      const lx = room.x + 1 + Math.floor(rng() * (room.w - 2));
      const ly = room.y + 1 + Math.floor(rng() * (room.h - 2));
      if ((lx === entranceRoom.cx && ly === entranceRoom.cy) || (lx === exitRoom.cx && ly === exitRoom.cy)) continue;
      if (tiles[ly]?.[lx]?.type === "dungeon_pillar") continue;
      tiles[ly][lx] = makeTile("lava_crack");
    }
  }

  // [v0.0.6-F] difficultyMult combina depth e tier para escalar dificuldade
  // de forma independente por entrada. depthMult: escalamento por andar (já existia).
  // tierMult: escalamento por expedições completadas naquela entrada (novo).
  const depthMult = 1 + (clampedDepth - 1) * 0.35;
  const tierMult  = 1 + (clampedTier  - 1) * 0.25;
  const difficultyMult = depthMult * tierMult;

  const entities = spawnDungeonEnemies(tiles, rooms, rng, clampedDepth, entranceRoom.id, optionalRoomIds, difficultyMult);
  const mapItems = spawnDungeonItems(tiles, rooms, rng, clampedDepth, entranceRoom.id, exitRoom.id, optionalRoomIds, clampedTier);

  return {
    tiles, entities, items: mapItems,
    stairs: [
      { x: entranceRoom.cx, y: entranceRoom.cy,
        direction: "up",
        target: clampedDepth === 1 ? "overworld" : `dungeon_depth_${clampedDepth - 1}` },
      { x: exitRoom.cx, y: exitRoom.cy,
        direction: isLastFloor ? "exit" : "down",
        target: isLastFloor ? "overworld" : `dungeon_depth_${clampedDepth + 1}` }
    ],
    entrance: { x: entranceRoom.cx, y: entranceRoom.cy },
    spawnX: entranceRoom.cx,
    spawnY: entranceRoom.cy,
    depth: clampedDepth,
    isLastFloor
  };
}

function carveRoom(tiles, room, floorPicker) {
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++)
      tiles[y][x] = makeTile(floorPicker());
}

function carveCorridor(tiles, x0, y0, x1, y1, floorPicker, rng) {
  if (rng() < 0.5) { carveLine(tiles, x0, y0, x1, y0, floorPicker); carveLine(tiles, x1, y0, x1, y1, floorPicker); }
  else             { carveLine(tiles, x0, y0, x0, y1, floorPicker); carveLine(tiles, x0, y1, x1, y1, floorPicker); }
}

function carveLine(tiles, x0, y0, x1, y1, floorPicker) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  while (true) {
    if (tiles[y]?.[x]) tiles[y][x] = makeTile(floorPicker());
    if (x === x1 && y === y1) break;
    if (x !== x1) x += dx; else if (y !== y1) y += dy;
  }
}

function pickFloorType(rng, depth) {
  const corruption = (depth - 1) / Math.max(1, MAX_DEPTH - 1);
  return rng() < 0.25 + corruption * 0.5 ? "crystal_floor" : "dungeon_floor";
}

function manhattanRoomDist(a, b) { return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy); }

function buildAdjacency(numRooms, edges) {
  const adj = Array.from({ length: numRooms }, () => []);
  for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  return adj;
}

function bfsDistances(adjacency, startId) {
  const dist = new Array(adjacency.length).fill(-1);
  dist[startId] = 0;
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of adjacency[cur]) if (dist[next] === -1) { dist[next] = dist[cur] + 1; queue.push(next); }
  }
  return dist;
}

function shortestPathRoomIds(adjacency, startId, endId) {
  const prev = new Array(adjacency.length).fill(-1);
  const vis  = new Array(adjacency.length).fill(false);
  vis[startId] = true;
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === endId) break;
    for (const next of adjacency[cur]) if (!vis[next]) { vis[next] = true; prev[next] = cur; queue.push(next); }
  }
  const path = []; let cur = endId;
  while (cur !== -1) { path.push(cur); cur = prev[cur]; }
  return path;
}

// [v0.0.6-F] difficultyMult recebido de fora (depth*tier já calculados em generateDungeon)
function spawnDungeonEnemies(tiles, rooms, rng, depth, entranceRoomId, optionalRoomIds, difficultyMult) {
  const entities  = [];
  const enemyPool = Object.keys(STATE.defs.enemies || {});
  if (enemyPool.length === 0) return entities;

  for (const room of rooms) {
    if (room.id === entranceRoomId) continue;
    const isOptional = optionalRoomIds.has(room.id);
    const baseCount  = isOptional ? 1 : (rng() < 0.7 ? 1 : 2);

    for (let i = 0; i < baseCount; i++) {
      let typeId;
      if (isOptional) {
        typeId = enemyPool.reduce((best, id) => {
          const a = STATE.defs.enemies[id], b = STATE.defs.enemies[best];
          return (a.hp + a.attack * 3) > (b.hp + b.attack * 3) ? id : best;
        }, enemyPool[0]);
      } else {
        typeId = enemyPool[Math.floor(rng() * enemyPool.length)];
      }
      const baseDef = STATE.defs.enemies[typeId];
      if (!baseDef) continue;
      const x = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const y = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (!tiles[y]?.[x]?.passable || entities.some(e => e.x === x && e.y === y)) continue;
      const scaledHp = Math.round(baseDef.hp * difficultyMult);
      entities.push({ defId: typeId, x, y, hp: scaledHp, maxHp: scaledHp, difficultyMult,
        id: `${typeId}_d${depth}_${room.id}_${i}` });
    }
  }
  return entities;
}

// [v0.0.6-F] tier passado para incluir armas elementais no pool de loot premium
// a partir do tier 2+ (recompensa perceptível por rejogabilidade).
function spawnDungeonItems(tiles, rooms, rng, depth, entranceRoomId, exitRoomId, optionalRoomIds, tier) {
  const items     = [];
  const itemPool  = Object.keys(STATE.defs.items || {});
  if (itemPool.length === 0) return items;

  // Pool premium: armas elementais disponíveis a partir do tier 2.
  const premiumPool = itemPool.filter(id => {
    const def = STATE.defs.items[id];
    if (tier >= 2 && def.elementDamage > 0) return true;
    return (def.attackBonus || def.defenseBonus || (def.value && def.value >= 20));
  });

  let counter = 0;
  for (const room of rooms) {
    if (room.id === entranceRoomId || room.id === exitRoomId) continue;
    const isOptional = optionalRoomIds.has(room.id);
    if (isOptional) {
      const pool   = premiumPool.length > 0 ? premiumPool : itemPool;
      const itemId = pool[Math.floor(rng() * pool.length)];
      if (tiles[room.cy]?.[room.cx]?.passable)
        items.push({ defId: itemId, x: room.cx, y: room.cy, id: `dungeon_loot_${depth}_${counter++}` });
      continue;
    }
    if (rng() < 0.5) {
      const itemId = itemPool[Math.floor(rng() * itemPool.length)];
      const x = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const y = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (tiles[y]?.[x]?.passable && !items.some(it => it.x === x && it.y === y))
        items.push({ defId: itemId, x, y, id: `dungeon_item_${depth}_${counter++}` });
    }
  }
  return items;
}

export { generateOverworld, generateDungeon, createRNG, MAX_DEPTH };
