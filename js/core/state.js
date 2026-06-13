// js/core/state.js
// Fonte única de verdade do jogo. Nunca modificar diretamente — usar mutadores.

const STATE = {
  // ── Meta ──────────────────────────────────────────────────────────────────
  version: "0.1.0",
  gamePhase: "MENU", // MENU | PLAYING | DEAD | WIN | INVENTORY | SKILL_TARGET

  // ── Turno ─────────────────────────────────────────────────────────────────
  turn: 0,
  seed: 0,

  // ── Mapa atual ────────────────────────────────────────────────────────────
  map: {
    type: "overworld",   // overworld | dungeon
    id: "rusted_plains",
    width: 80,
    height: 60,
    tiles: [],           // Array 2D: { type, passable, visible, explored, char, color, bgColor, entity }
    entities: [],        // [ { ...entityData, x, y } ]
    items: [],           // [ { ...itemData, x, y } ]
    stairs: [],          // [ { x, y, direction, target } ]
    entrance: { x: 0, y: 0 }
  },

  // ── Jogador ───────────────────────────────────────────────────────────────
  player: {
    x: 0,
    y: 0,
    char: "@",
    color: "#F0E68C",
    name: "Explorador",

    // Atributos base (estilo Brogue com toque RPG)
    level: 1,
    xp: 0,
    xpToNext: 30,

    hp: 30,
    maxHp: 30,
    energy: 40,
    maxEnergy: 40,

    attack: 3,
    defense: 1,

    // Equipamentos (bônus aplicados sobre base)
    equipment: {
      weapon: null,
      offhand: null
    },

    // Inventário
    inventory: [],
    maxInventory: 12,

    // Skills
    skills: ["solar_burst", "crystal_shield", "steam_dash", "vine_mend"],
    skillCooldowns: {},
    activeShield: 0,

    // Histórico
    floorsVisited: 0,
    kills: 0,
    itemsFound: 0
  },

  // ── Log de mensagens ──────────────────────────────────────────────────────
  log: [], // [{ text, color, turn }]
  maxLog: 80,

  // ── Dados carregados do JSON ───────────────────────────────────────────────
  defs: {
    enemies: {},
    items: {},
    skills: {}
  },

  // ── Câmera ────────────────────────────────────────────────────────────────
  camera: {
    x: 0,
    y: 0,
    width: 60,
    height: 28
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  ui: {
    selectedSkill: null,
    targetingMode: false,
    targetCallback: null,
    inventoryOpen: false,
    selectedInventoryIdx: 0
  }
};

// ── Mutadores seguros ──────────────────────────────────────────────────────

function addLog(text, color = "#D5D8DC") {
  STATE.log.unshift({ text, color, turn: STATE.turn });
  if (STATE.log.length > STATE.maxLog) STATE.log.pop();
}

function getPlayerAttack() {
  const p = STATE.player;
  const wpnBonus = p.equipment.weapon?.attackBonus || 0;
  return p.attack + wpnBonus;
}

function getPlayerDefense() {
  const p = STATE.player;
  const shBonus = p.equipment.offhand?.defenseBonus || 0;
  return p.defense + shBonus;
}

function getTileAt(x, y) {
  const { map } = STATE;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y][x];
}

function getEntityAt(x, y) {
  return STATE.map.entities.find(e => e.x === x && e.y === y && e.hp > 0) || null;
}

function getItemAt(x, y) {
  return STATE.map.items.find(i => i.x === x && i.y === y) || null;
}

function removeItemFromMap(x, y) {
  const idx = STATE.map.items.findIndex(i => i.x === x && i.y === y);
  if (idx !== -1) STATE.map.items.splice(idx, 1);
}

function removeEntity(entity) {
  const idx = STATE.map.entities.indexOf(entity);
  if (idx !== -1) STATE.map.entities.splice(idx, 1);
}

function isPassable(x, y, ignoreEntities = false) {
  const tile = getTileAt(x, y);
  if (!tile || !tile.passable) return false;
  if (!ignoreEntities && getEntityAt(x, y)) return false;
  return true;
}

function advanceTurn() {
  STATE.turn++;
  // Regeneração lenta de energia
  if (STATE.turn % 4 === 0 && STATE.player.energy < STATE.player.maxEnergy) {
    STATE.player.energy = Math.min(STATE.player.maxEnergy, STATE.player.energy + 1);
  }
}

function playerGainXP(amount) {
  const p = STATE.player;
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = Math.floor(p.xpToNext * 1.6);
    // Level up: aumenta stats
    p.maxHp += 5;
    p.hp = Math.min(p.hp + 5, p.maxHp);
    p.maxEnergy += 5;
    p.attack += 1;
    addLog(`✦ Nível ${p.level}! Poder aumentado!`, "#F1C40F");
  }
}

export {
  STATE, addLog, getPlayerAttack, getPlayerDefense,
  getTileAt, getEntityAt, getItemAt, removeItemFromMap,
  removeEntity, isPassable, advanceTurn, playerGainXP
};
