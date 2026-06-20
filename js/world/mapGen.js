// js/world/mapGen.js
// Geradores procedurais: bioma Planície Enferrujada (overworld) e Ruínas de Cristal (dungeon)
//
// CORREÇÕES (v0.0.3 → v0.0.4):
//  [BUG-08] Busca de spawnX/stairX sem limite de borda podia exceder a largura do
//           mapa e lançar TypeError (tile undefined), travando a inicialização.
//           Adicionado limite de tentativas + fallback de varredura total do mapa.
//
// NOVO (v0.0.4 → v0.0.5):
//  generateDungeon(seed, depth, width, height) — gerador de andares da dungeon
//  "Ruínas de Cristal", em grafo de salas conectadas (não corredor único), com
//  sala(s) opcional(is) de risco/recompensa, dificuldade escalando por depth, e
//  visual progressivamente mais corrompido (mais crystal_floor/lava_crack).
//  Ver detalhes de design nos comentários da própria função, mais abaixo.

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
  // [BUG-08] Os laços originais (`while (!tiles[y][x].passable) x++;`) não tinham
  // limite de borda: se a linha pathY sorteada não tivesse nenhum tile passável
  // até o fim da largura, x excedia `width`, tiles[y][x] retornava undefined e
  // `.passable` lançava TypeError, travando a inicialização do jogo.
  // Correção: contador de tentativas limitado a `width`; se esgotar, cai no
  // fallback findFirstPassableTile(), que varre o mapa inteiro linha a linha.
  let spawnX = Math.floor(width * 0.15);
  let spawnY = pathY;
  {
    let attempts = 0;
    while (!tiles[spawnY]?.[spawnX]?.passable && attempts < width) {
      spawnX++;
      attempts++;
    }
    if (!tiles[spawnY]?.[spawnX]?.passable) {
      const fallback = findFirstPassableTile(tiles, width, height);
      spawnX = fallback.x;
      spawnY = fallback.y;
    }
  }

  // ── Posição da escada para dungeon ────────────────────────────────────────
  // [BUG-08] Mesma correção aplicada à busca da escada de descida.
  let stairX = Math.floor(width * 0.75);
  let stairY = pathY;
  {
    let attempts = 0;
    while (!tiles[stairY]?.[stairX]?.passable && attempts < width) {
      stairX++;
      attempts++;
    }
    if (!tiles[stairY]?.[stairX]?.passable) {
      // Evita colocar a escada exatamente sobre o spawn do jogador
      const fallback = findFirstPassableTile(tiles, width, height, spawnX, spawnY);
      stairX = fallback.x;
      stairY = fallback.y;
    }
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

// [BUG-08] Fallback de segurança: varredura linha a linha do mapa inteiro em busca
// do primeiro tile passável. Usado quando a busca local (na linha do caminho) não
// encontra nada dentro do limite de tentativas. Garante que, em nenhum cenário de
// seed, generateOverworld trave ou lance exceção por falta de tile válido.
// Parâmetro opcional avoidX/avoidY evita reusar a mesma posição do spawn do jogador.
function findFirstPassableTile(tiles, width, height, avoidX = -1, avoidY = -1) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]?.[x]?.passable && !(x === avoidX && y === avoidY)) {
        return { x, y };
      }
    }
  }
  // Último recurso absoluto: nenhum tile passável existe no mapa inteiro.
  // Força o tile (0,0) a ser caminhável para impedir um estado irrecuperável.
  if (tiles[0]?.[0]) {
    tiles[0][0] = makeTile("path");
  }
  return { x: 0, y: 0 };
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

// ════════════════════════════════════════════════════════════════════════
// ── Geração da Dungeon: Ruínas de Cristal (grafo de salas conectadas) ────
// ════════════════════════════════════════════════════════════════════════
//
// Profundidade máxima configurável — ainda não confirmada pelo diretor do
// projeto, mantida como constante única e exportada para fácil ajuste.
const MAX_DEPTH = 5;

// Estratégia de geração (resumo para quem for mexer aqui depois):
//   1. Particiona o retângulo do andar em uma grade lógica de células e
//      sorteia uma sala dentro de cada célula visitada (room placement por
//      grade evita sobreposição sem precisar de colisão custosa).
//   2. Constrói uma árvore geradora (spanning tree) ligando as salas em
//      sequência — garante que TODAS as salas estejam alcançáveis a partir
//      da entrada, formando o "esqueleto" da rota principal.
//   3. Marca 1–2 salas da árvore (que não sejam entrada/saída) como sala(s)
//      "opcional(is) de risco/recompensa": ficam num ramo lateral, não no
//      caminho mais curto entrada→saída, com inimigo mais forte e/ou item
//      melhor que a média do andar — para criar a bifurcação real exigida.
//   4. Liga entrada→saída pela rota mais curta dentro da árvore (sempre
//      existe, pois a árvore é conexa) — garante que a rota direta nunca
//      seja bloqueada por uma sala opcional.
//   5. Esculpe corredores retos (em L) entre salas conectadas na árvore.
//   6. Preenche dificuldade/visual conforme `depth`.
function generateDungeon(seed, depth, width = 50, height = 36) {
  const rng = createRNG(seed + depth * 7919); // offset por andar — cada profundidade tem layout distinto mesmo com a mesma seed base
  const clampedDepth = Math.max(1, Math.min(depth, MAX_DEPTH));

  // ── 1. Base do andar: tudo parede sólida, esculpimos salas/corredores nela ──
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = makeTile("dungeon_wall");
    }
  }

  // ── 2. Posiciona salas numa grade lógica (evita sobreposição sem colisão) ──
  const GRID_COLS = 4, GRID_ROWS = 3;
  const cellW = Math.floor(width  / GRID_COLS);
  const cellH = Math.floor(height / GRID_ROWS);
  const rooms = []; // { id, x, y, w, h, cx, cy } — cx/cy = centro (para corredores)

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      // Nem toda célula da grade vira sala — gera variação orgânica de layout
      if (rng() < 0.18 && rooms.length > 0) continue;

      const maxW = Math.max(4, cellW - 3);
      const maxH = Math.max(4, cellH - 3);
      const rw = 4 + Math.floor(rng() * Math.max(1, maxW - 4));
      const rh = 4 + Math.floor(rng() * Math.max(1, maxH - 4));
      const rx = gx * cellW + 1 + Math.floor(rng() * Math.max(1, cellW - rw - 2));
      const ry = gy * cellH + 1 + Math.floor(rng() * Math.max(1, cellH - rh - 2));

      const x0 = Math.max(1, rx), y0 = Math.max(1, ry);
      const x1 = Math.min(width - 2, rx + rw), y1 = Math.min(height - 2, ry + rh);
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;

      rooms.push({
        id: rooms.length,
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        cx: Math.floor((x0 + x1) / 2), cy: Math.floor((y0 + y1) / 2)
      });
    }
  }

  // Garante um mínimo de salas para sempre existir bifurcação possível
  if (rooms.length < 4) {
    return generateDungeon(seed + 104729, depth, width, height); // re-sorteia com offset determinístico
  }

  // Esculpe o piso de cada sala
  const floorType = pickFloorType(rng, clampedDepth);
  for (const room of rooms) {
    carveRoom(tiles, room, () => pickFloorType(rng, clampedDepth));
  }

  // ── 3. Árvore geradora: conecta as salas em sequência (garante conectividade total) ──
  // Ordena salas por proximidade ao ponto anterior (nearest-neighbor simples) para
  // produzir uma árvore mais "orgânica" que uma simples lista em ordem de criação.
  const visited = [rooms[0]];
  const remaining = rooms.slice(1);
  const edges = []; // { a: roomId, b: roomId }

  while (remaining.length > 0) {
    let bestI = 0, bestJ = 0, bestDist = Infinity;
    for (let i = 0; i < visited.length; i++) {
      for (let j = 0; j < remaining.length; j++) {
        const d = manhattanRoomDist(visited[i], remaining[j]);
        if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
      }
    }
    const from = visited[bestI];
    const to = remaining.splice(bestJ, 1)[0];
    edges.push({ a: from.id, b: to.id });
    visited.push(to);
  }

  // Esculpe corredor (em L) para cada aresta da árvore
  for (const edge of edges) {
    const a = rooms[edge.a], b = rooms[edge.b];
    carveCorridor(tiles, a.cx, a.cy, b.cx, b.cy, () => pickFloorType(rng, clampedDepth), rng);
  }

  // ── 4. Define entrada e saída: salas mais distantes entre si na árvore ──
  // (aproximação simples: primeira sala = entrada; sala mais longe dela por
  // distância de grafo (BFS) = saída — garante que a rota principal percorra
  // boa parte do andar, em vez de entrada/saída ficarem coladas.)
  const adjacency = buildAdjacency(rooms.length, edges);
  const distFromEntrance = bfsDistances(adjacency, rooms[0].id);
  let exitRoomId = rooms[0].id, maxDist = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (distFromEntrance[i] > maxDist) { maxDist = distFromEntrance[i]; exitRoomId = i; }
  }
  const entranceRoom = rooms[0];
  const exitRoom = rooms[exitRoomId];

  // Caminho mais curto entrada→saída na árvore (única rota possível numa árvore,
  // mas calculamos explicitamente para marcar quais salas NÃO estão nela —
  // essas são candidatas a sala opcional).
  const mainPathRoomIds = new Set(shortestPathRoomIds(adjacency, entranceRoom.id, exitRoomId));

  // ── 3b. Sala(s) opcional(is) de risco/recompensa ──
  // Candidatas: salas fora da rota principal (não entrada, não saída, não no
  // caminho direto) — visitar exige um desvio real, não é obrigatório.
  const offPathRooms = rooms.filter(r => !mainPathRoomIds.has(r.id));
  const numOptionalRooms = offPathRooms.length > 0 ? (1 + (offPathRooms.length > 2 && rng() < 0.4 ? 1 : 0)) : 0;
  const optionalRoomIds = new Set();
  {
    const pool = [...offPathRooms];
    for (let i = 0; i < numOptionalRooms && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      optionalRoomIds.add(pool[idx].id);
      pool.splice(idx, 1);
    }
  }

  // ── 5. Tile de entrada (stairs_up) e saída (stairs_down ou exit no MAX_DEPTH) ──
  tiles[entranceRoom.cy][entranceRoom.cx] = makeTile("stairs_up");
  const isLastFloor = clampedDepth >= MAX_DEPTH;
  tiles[exitRoom.cy][exitRoom.cx] = makeTile(isLastFloor ? "exit" : "stairs_down");

  // ── 6. Pilares decorativos esparsos (não bloqueiam rota — checagem de conectividade) ──
  for (const room of rooms) {
    if (room.w < 5 || room.h < 5) continue; // salas pequenas demais ficam livres
    const numPillars = rng() < 0.4 ? 1 : 0;
    for (let i = 0; i < numPillars; i++) {
      const px = room.x + 1 + Math.floor(rng() * (room.w - 2));
      const py = room.y + 1 + Math.floor(rng() * (room.h - 2));
      // Nunca sobrepõe entrada/saída
      if ((px === entranceRoom.cx && py === entranceRoom.cy) || (px === exitRoom.cx && py === exitRoom.cy)) continue;
      tiles[py][px] = makeTile("dungeon_pillar");
    }
  }

  // ── 7. Dificuldade escalando por depth, lida de STATE.defs.enemies ──────
  const entities = spawnDungeonEnemies(tiles, rooms, rng, clampedDepth, entranceRoom.id, optionalRoomIds);

  // ── 8. Itens: distribuição normal nas salas da rota + recompensa garantida nas opcionais ──
  const mapItems = spawnDungeonItems(tiles, rooms, rng, clampedDepth, entranceRoom.id, exitRoom.id, optionalRoomIds);

  return {
    tiles,
    entities,
    items: mapItems,
    stairs: [{
      x: exitRoom.cx, y: exitRoom.cy,
      direction: isLastFloor ? "exit" : "down",
      target: isLastFloor ? "overworld" : `dungeon_depth_${clampedDepth + 1}`
    }],
    entrance: { x: entranceRoom.cx, y: entranceRoom.cy },
    spawnX: entranceRoom.cx,
    spawnY: entranceRoom.cy,
    depth: clampedDepth,
    isLastFloor
  };
}

// Esculpe o retângulo de uma sala com o tipo de piso fornecido (callback,
// pois o piso pode variar tile a tile para o efeito de "corrupção crescente").
function carveRoom(tiles, room, floorPicker) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[y][x] = makeTile(floorPicker());
    }
  }
}

// Esculpe um corredor em "L" entre dois pontos (primeiro eixo X, depois Y) —
// simples, legível, e suficiente para conectar salas numa grade.
function carveCorridor(tiles, x0, y0, x1, y1, floorPicker, rng) {
  const horizontalFirst = rng() < 0.5;
  if (horizontalFirst) {
    carveLine(tiles, x0, y0, x1, y0, floorPicker);
    carveLine(tiles, x1, y0, x1, y1, floorPicker);
  } else {
    carveLine(tiles, x0, y0, x0, y1, floorPicker);
    carveLine(tiles, x0, y1, x1, y1, floorPicker);
  }
}

function carveLine(tiles, x0, y0, x1, y1, floorPicker) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  // Corredor de espessura 1; suficiente para o estilo ASCII do jogo
  while (true) {
    if (tiles[y]?.[x]) tiles[y][x] = makeTile(floorPicker());
    if (x === x1 && y === y1) break;
    if (x !== x1) x += dx;
    else if (y !== y1) y += dy;
  }
}

// [Visual de corrupção] Proporção de crystal_floor/lava_crack cresce com depth.
// lava_crack é decorativo/obstáculo (passable:false em tiles.js) — usado com
// baixa probabilidade para não fechar rotas acidentalmente; carveRoom/Corridor
// nunca o usam como piso base de corredor (só dungeon_floor/crystal_floor),
// evitando bloquear a única rota entre duas salas.
function pickFloorType(rng, depth) {
  const corruption = (depth - 1) / Math.max(1, MAX_DEPTH - 1); // 0 no andar 1 → 1 no andar MAX_DEPTH
  const roll = rng();
  if (roll < 0.25 + corruption * 0.5) return "crystal_floor";
  return "dungeon_floor";
}

// Distância Manhattan entre centros de duas salas (heurística para a árvore geradora)
function manhattanRoomDist(a, b) {
  return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
}

function buildAdjacency(numRooms, edges) {
  const adj = Array.from({ length: numRooms }, () => []);
  for (const e of edges) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  return adj;
}

// BFS simples a partir de uma sala de origem — usado para achar a sala mais
// distante (vira a saída) e para reconstruir o caminho principal.
function bfsDistances(adjacency, startId) {
  const dist = new Array(adjacency.length).fill(-1);
  dist[startId] = 0;
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of adjacency[cur]) {
      if (dist[next] === -1) {
        dist[next] = dist[cur] + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

function shortestPathRoomIds(adjacency, startId, endId) {
  const prev = new Array(adjacency.length).fill(-1);
  const visited = new Array(adjacency.length).fill(false);
  visited[startId] = true;
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === endId) break;
    for (const next of adjacency[cur]) {
      if (!visited[next]) {
        visited[next] = true;
        prev[next] = cur;
        queue.push(next);
      }
    }
  }
  const path = [];
  let cur = endId;
  while (cur !== -1) {
    path.push(cur);
    cur = prev[cur];
  }
  return path;
}

// ── Inimigos da dungeon: densidade e atributos escalam com `depth`, lidos a
// partir de STATE.defs.enemies (data/enemies.json) em vez de hardcoded — mesmo
// princípio já usado no overworld, aplicando multiplicador limpo por andar. ──
function spawnDungeonEnemies(tiles, rooms, rng, depth, entranceRoomId, optionalRoomIds) {
  const entities = [];
  const enemyPool = Object.keys(STATE.defs.enemies || {});
  if (enemyPool.length === 0) return entities; // defs ainda não carregadas (ex.: testes isolados)

  // Multiplicador de dificuldade por profundidade: cresce linearmente, suave
  // o bastante para não tornar o andar 5 injogável, perceptível o bastante
  // para o critério de aceite "inimigos do andar 5 mais fortes que andar 1".
  const difficultyMult = 1 + (depth - 1) * 0.35;

  for (const room of rooms) {
    if (room.id === entranceRoomId) continue; // sala de entrada fica segura

    const isOptional = optionalRoomIds.has(room.id);
    // Salas opcionais têm inimigo perceptivelmente mais forte que a média do
    // andar (risco real) — sorteado entre os tipos mais fortes do pool.
    const baseCount = isOptional ? 1 : (rng() < 0.7 ? 1 : 2);

    for (let i = 0; i < baseCount; i++) {
      let typeId;
      if (isOptional) {
        // Pega o inimigo de maior "poder" disponível no pool (hp+attack como proxy)
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
      if (!tiles[y]?.[x]?.passable) continue;
      if (entities.some(e => e.x === x && e.y === y)) continue;

      const scaledHp = Math.round(baseDef.hp * difficultyMult);
      entities.push({
        defId: typeId,
        x, y,
        hp: scaledHp,
        maxHp: scaledHp,
        // attack/defense efetivos de combate são lidos de STATE.defs.enemies[defId]
        // diretamente em combat.js — aqui só escalamos hp (vida) por simplicidade
        // e por ser o atributo que mais comunica "inimigo mais forte" ao jogador.
        // Guardamos o multiplicador para eventuais sistemas futuros consultarem.
        difficultyMult,
        id: `${typeId}_d${depth}_${room.id}_${i}`
      });
    }
  }
  return entities;
}

// ── Itens da dungeon: distribuição padrão + recompensa garantida nas salas
// opcionais (melhor que a média do andar — completa o par risco/recompensa). ──
function spawnDungeonItems(tiles, rooms, rng, depth, entranceRoomId, exitRoomId, optionalRoomIds) {
  const items = [];
  const itemPool = Object.keys(STATE.defs.items || {});
  if (itemPool.length === 0) return items;

  // Itens "premium" (armas/armaduras/consumíveis fortes) usados como recompensa
  // garantida nas salas opcionais — heurística simples por presença de bônus.
  const premiumPool = itemPool.filter(id => {
    const def = STATE.defs.items[id];
    return (def.attackBonus || def.defenseBonus || (def.value && def.value >= 20));
  });

  let itemCounter = 0;
  for (const room of rooms) {
    if (room.id === entranceRoomId || room.id === exitRoomId) continue;

    const isOptional = optionalRoomIds.has(room.id);

    if (isOptional) {
      // Recompensa garantida e perceptível — melhor que a média do andar.
      const pool = premiumPool.length > 0 ? premiumPool : itemPool;
      const itemId = pool[Math.floor(rng() * pool.length)];
      const x = room.cx, y = room.cy;
      if (tiles[y]?.[x]?.passable) {
        items.push({ defId: itemId, x, y, id: `dungeon_loot_${depth}_${itemCounter++}` });
      }
      continue;
    }

    // Distribuição normal: chance moderada de item comum por sala
    if (rng() < 0.5) {
      const itemId = itemPool[Math.floor(rng() * itemPool.length)];
      const x = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const y = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (tiles[y]?.[x]?.passable && !items.some(it => it.x === x && it.y === y)) {
        items.push({ defId: itemId, x, y, id: `dungeon_item_${depth}_${itemCounter++}` });
      }
    }
  }
  return items;
}

export { generateOverworld, generateDungeon, createRNG, MAX_DEPTH };
