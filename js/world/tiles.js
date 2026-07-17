// js/world/tiles.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-G] BIOMES — 3 biomas cosméticos para o overworld (plains, forest, desert).
//             tintColor() — aplica tint de bioma sobre cor base de tile.
//  Mantido: varyColor() com fix de clamp do v0.0.5.1.

const TILES = {
  // ── Planície Enferrujada (overworld) ──────────────────────────────────────
  grass:        { char: "·", color: "#5D8A3C", bgColor: "#0a1a05", passable: true,  type: "grass" },
  solar_grass:  { char: ":", color: "#8FBC44", bgColor: "#0e1f05", passable: true,  type: "solar_grass" },
  dry_earth:    { char: "·", color: "#8B6914", bgColor: "#100d05", passable: true,  type: "dry_earth" },
  rust_ground:  { char: "~", color: "#A04000", bgColor: "#120800", passable: true,  type: "rust_ground" },
  crystal_node: { char: "♦", color: "#9B59B6", bgColor: "#0d0512", passable: false, type: "crystal_node" },
  solar_panel:  { char: "═", color: "#5DADE2", bgColor: "#030d12", passable: false, type: "solar_panel" },
  ruins_wall:   { char: "#", color: "#7F8C8D", bgColor: "#050808", passable: false, type: "ruins_wall" },
  vine_wall:    { char: "#", color: "#27AE60", bgColor: "#020e05", passable: false, type: "vine_wall" },
  old_tree:     { char: "T", color: "#1E8449", bgColor: "#020e05", passable: false, type: "old_tree" },
  water:        { char: "≈", color: "#1ABC9C", bgColor: "#021209", passable: false, type: "water" },
  path:         { char: "·", color: "#BDC3C7", bgColor: "#0a0b0b", passable: true,  type: "path" },

  // ── Dungeons ──────────────────────────────────────────────────────────────
  dungeon_floor:  { char: "·", color: "#5D6D7E", bgColor: "#030608", passable: true,  type: "dungeon_floor" },
  dungeon_wall:   { char: "█", color: "#2E4053", bgColor: "#010305", passable: false, type: "dungeon_wall" },
  dungeon_door:   { char: "+", color: "#D4AC0D", bgColor: "#050400", passable: true,  type: "dungeon_door" },
  dungeon_pillar: { char: "O", color: "#808B96", bgColor: "#030408", passable: false, type: "dungeon_pillar" },
  crystal_floor:  { char: "·", color: "#7D3C98", bgColor: "#050108", passable: true,  type: "crystal_floor" },
  lava_crack:     { char: "≋", color: "#E74C3C", bgColor: "#0d0100", passable: false, type: "lava_crack" },

  // ── Especiais ─────────────────────────────────────────────────────────────
  stairs_down: { char: ">", color: "#F1C40F", bgColor: "#050400", passable: true, type: "stairs_down" },
  stairs_up:   { char: "<", color: "#F1C40F", bgColor: "#050400", passable: true, type: "stairs_up" },
  exit:        { char: "✦", color: "#F39C12", bgColor: "#050200", passable: true, type: "exit" },

  // ── Entrada de dungeon no overworld ───────────────────────────────────────
  dungeon_entrance: { char: "▼", color: "#E67E22", bgColor: "#120800", passable: true, type: "dungeon_entrance" }
};

// [v0.0.6-G] Biomas do overworld — cosméticos/de dados nesta versão.
// Cada bioma define: id, label, tint (cor aplicada sobre tiles), e tiles
// característicos que aparecem com mais frequência naquela região.
// Fundação para fase de Crafting & Coleta (recursos por bioma virão depois).
const BIOMES = {
  plains: {
    id: "plains",
    label: "Planícies Enferrujadas",
    tint: null,           // sem tint: cores originais dos tiles
    floorTile: "grass",
    wallTile:  "ruins_wall",
    featureTiles: ["dry_earth", "rust_ground", "crystal_node"]
  },
  forest: {
    id: "forest",
    label: "Floresta de Vinhas",
    tint: "#0a1f08",      // shift verde escuro
    floorTile: "solar_grass",
    wallTile:  "vine_wall",
    featureTiles: ["old_tree", "water", "solar_panel"]
  },
  desert: {
    id: "desert",
    label: "Deserto de Ferrugem",
    tint: "#1a0e00",      // shift laranja escuro
    floorTile: "dry_earth",
    wallTile:  "ruins_wall",
    featureTiles: ["rust_ground", "lava_crack", "crystal_node"]
  }
};

function makeTile(type) {
  const def = TILES[type];
  if (!def) {
    console.warn(`Tile desconhecido: ${type}`);
    return { char: "?", color: "#FF0000", bgColor: "#000", passable: false, type: "unknown", visible: false, explored: false };
  }
  return { ...def, visible: false, explored: false };
}

// Ruído de cor leve para variação visual nos tiles de terreno.
// [v0.0.5.1 — item 7] clamp aplicado à soma final de cada canal.
function varyColor(hex, amount = 12) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const vary  = () => Math.floor(Math.random() * amount * 2 - amount);
  const toHex = v => Math.max(0, Math.min(255, Math.floor(v))).toString(16).padStart(2, "0");
  return `#${toHex(r + vary())}${toHex(g + vary())}${toHex(b + vary())}`;
}

// [v0.0.6-G] Aplica tint de bioma sobre uma cor base de tile.
// Faz blend aditivo leve (média ponderada) entre cor base e tint do bioma.
// Retorna cor original se bioma não tem tint definido.
function tintColor(hex, biomeTint, weight = 0.25) {
  if (!biomeTint) return hex;
  const parse = h => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ];
  const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(biomeTint);
  return `#${toHex(r1*(1-weight)+r2*weight)}${toHex(g1*(1-weight)+g2*weight)}${toHex(b1*(1-weight)+b2*weight)}`;
}

export { TILES, BIOMES, makeTile, varyColor, tintColor };
