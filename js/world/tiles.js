// js/world/tiles.js
// Definições de tiles do mundo de Auroria

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
  exit:        { char: "✦", color: "#F39C12", bgColor: "#050200", passable: true, type: "exit" }
};

function makeTile(type) {
  const def = TILES[type];
  if (!def) {
    console.warn(`Tile desconhecido: ${type}`);
    return { char: "?", color: "#FF0000", bgColor: "#000", passable: false, type: "unknown", visible: false, explored: false };
  }
  return { ...def, visible: false, explored: false };
}

// Ruído de cor leve para variação visual nos tiles de terreno
function varyColor(hex, amount = 12) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const vary = () => Math.max(0, Math.min(255, Math.floor(Math.random() * amount * 2 - amount)));
  const toHex = v => v.toString(16).padStart(2, "0");
  return `#${toHex(r + vary())}${toHex(g + vary())}${toHex(b + vary())}`;
}

export { TILES, makeTile, varyColor };
