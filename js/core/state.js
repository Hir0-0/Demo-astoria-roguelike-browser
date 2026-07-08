// js/core/state.js — PATCH v0.0.6
// Fonte única de verdade. Nunca modificar diretamente — usar mutadores.
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-A] LOADOUT_KEYS / LOADOUT_SIZE — 4 slots fixos Q/W/E/R para skills.
//             SKILL_KEYS mantido por compatibilidade mas não cresce mais.
//  [v0.0.6-A] player.skillLoadout — array fixo de 4 slots (null = vazio).
//             Substitui player.skills para skills ativas. Skills são agora itens.
//  [v0.0.6-C] player.inventory — muda de string[] para {itemId,qty}[].
//             Helpers addItemToInventory/removeItemFromInventorySlot gerenciam stacks.
//  [v0.0.6-D] ELEMENTS — 5 elementos de dano nomeados.
//  [v0.0.6-E] CRAFT_RECIPES — 3 receitas mínimas de crafting.
//  [v0.0.6-F] STATE.dungeonProgress — progresso por entranceId { tier, timesCompleted }.
//             STATE.map.dungeonEntrances — array de entradas no overworld.
//             STATE.dungeon.entranceId — qual entrada está em uso na expedição atual.

// [v0.0.6-A] Slots fixos de loadout: sempre 4, mapeados a Q/W/E/R.
// SKILL_KEYS mantido para não quebrar referências legadas em hud/engine que
// ainda usam o nome antigo em contextos não-skill.
const LOADOUT_KEYS = ["q", "w", "e", "r"];
const LOADOUT_SIZE = 4;
const SKILL_KEYS   = LOADOUT_KEYS; // alias de compatibilidade

// [v0.0.6-D] Elementos de dano — puramente aditivo nesta versão.
// Resistências e fraquezas ficam para v0.0.7+.
const ELEMENTS = {
  physical: { label: "Físico",   color: "#BDC3C7" },
  fire:     { label: "Fogo",     color: "#E74C3C" },
  ice:      { label: "Gelo",     color: "#85C1E9" },
  electric: { label: "Elétrico", color: "#F1C40F" },
  poison:   { label: "Veneno",   color: "#27AE60" }
};

// [v0.0.6-E] Receitas de mini-crafting. Prévia mínima para dar utilidade aos
// materiais inertes (gear_fragment, crystal_shard, scrap_metal).
// Sistema completo de Crafting & Coleta fica para fase própria do roadmap.
const CRAFT_RECIPES = [
  {
    id: "recipe_gearplate",
    resultId: "lubricated_gearplate",
    resultQty: 1,
    ingredients: [
      { itemId: "gear_fragment",  qty: 3 },
      { itemId: "crystal_shard", qty: 2 }
    ]
  },
  {
    id: "recipe_crystal_infusion",
    resultId: "crystal_infusion",
    resultQty: 1,
    ingredients: [
      { itemId: "crystal_shard", qty: 3 },
      { itemId: "scrap_metal",   qty: 1 }
    ]
  },
  {
    id: "recipe_overcharged_core",
    resultId: "overcharged_core",
    resultQty: 1,
    ingredients: [
      { itemId: "gear_fragment",  qty: 2 },
      { itemId: "crystal_shard", qty: 2 },
      { itemId: "scrap_metal",   qty: 1 }
    ]
  }
];

const STATE = {
  version: "0.0.6",
  gamePhase: "MENU", // MENU | PLAYING | DEAD | WIN | PAUSE

  turn: 0,
  seed: 0,

  // [v0.0.5] Rastreia a expedição em curso.
  // [v0.0.6-F] Adicionado entranceId — qual entrada do overworld está sendo usada.
  dungeon: { active: false, depth: 0, entranceId: null },

  // [v0.0.5] Snapshot completo do overworld salvo ao entrar na dungeon.
  overworldSnapshot: null,

  // [v0.0.6-F] Progresso por entrada de dungeon.
  // Chave: entranceId (string). Valor: { tier, timesCompleted }.
  // Persistido no save separadamente do overworldSnapshot.
  dungeonProgress: {},

  map: {
    type: "overworld",
    id: "rusted_plains",
    width: 80,
    height: 60,
    tiles: [],
    entities: [],
    items: [],
    stairs: [],
    entrance: { x: 0, y: 0 },
    // [v0.0.6-F] Array de entradas de dungeon no overworld: [{id, x, y}]
    dungeonEntrances: []
  },

  player: {
    x: 0, y: 0,
    char: "@",
    color: "#F0E68C",
    name: "Explorador",
    level: 1,
    xp: 0,
    xpToNext: 30,
    hp: 30,    maxHp: 30,
    energy: 40, maxEnergy: 40,
    attack: 3,
    defense: 1,
    equipment: { weapon: null, offhand: null },

    // [v0.0.6-C] Inventário: {itemId: string, qty: number}[]
    // Skills também ficam aqui quando desequipadas (isItem:true, qty sempre 1).
    inventory: [],
    maxInventory: 20,

    // [v0.0.6-A] 4 slots fixos de loadout de skill. null = slot vazio.
    // Substitui o antigo player.skills (string[]).
    skillLoadout: [null, null, null, null],

    skillCooldowns: {},
    activeShield: 0,
    floorsVisited: 0,
    kills: 0,
    itemsFound: 0
  },

  log: [],
  maxLog: 80,

  defs: { enemies: {}, items: {}, skills: {} },

  camera: { x: 0, y: 0, width: 60, height: 28 },

  ui: {
    selectedSkill: null,
    targetingMode: false,
    inventoryOpen: false,
    craftingOpen: false,   // [v0.0.6-E] painel de crafting
    selectedInventoryIdx: 0,
    pauseOpen: false,
    tileInfo: null
  }
};

// ── Mutadores ──────────────────────────────────────────────────────────────

function addLog(text, color = "#D5D8DC") {
  STATE.log.unshift({ text, color, turn: STATE.turn });
  if (STATE.log.length > STATE.maxLog) STATE.log.pop();
}

// [v0.0.6-D] getPlayerAttack agora também retorna o dano elemental da arma
// para uso separado em combat.js. getPlayerElement() expõe apenas o elemento.
function getPlayerAttack() {
  const p   = STATE.player;
  const wpnId = p.equipment.weapon;
  const wpn   = wpnId ? STATE.defs.items[wpnId] : null;
  return p.attack + (wpn?.attackBonus || 0);
}

// [v0.0.6-D] Retorna { elementType, elementDamage } da arma equipada, ou
// { elementType:"physical", elementDamage:0 } se não houver arma/affix.
function getPlayerElement() {
  const wpnId = STATE.player.equipment.weapon;
  const wpn   = wpnId ? STATE.defs.items[wpnId] : null;
  return {
    elementType:   wpn?.elementType   || "physical",
    elementDamage: wpn?.elementDamage || 0
  };
}

function getPlayerDefense() {
  const p     = STATE.player;
  const offId = p.equipment.offhand;
  const offBonus = offId ? (STATE.defs.items[offId]?.defenseBonus || 0) : 0;
  return p.defense + offBonus;
}

function getTileAt(x, y) {
  const { map } = STATE;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y]?.[x] || null;
}

function getEntityAt(x, y) {
  return STATE.map.entities.find(e => e.x === x && e.y === y && e.hp > 0) || null;
}

function getItemAt(x, y) {
  return STATE.map.items.find(i => i.x === x && i.y === y) || null;
}

function removeItemFromMap(x, y, itemId) {
  const idx = STATE.map.items.findIndex(
    i => i.x === x && i.y === y && (!itemId || i.id === itemId)
  );
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
  if (STATE.turn % 4 === 0 && STATE.player.energy < STATE.player.maxEnergy) {
    STATE.player.energy = Math.min(STATE.player.maxEnergy, STATE.player.energy + 1);
  }
}

function playerGainXP(amount) {
  const p = STATE.player;
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp   -= p.xpToNext;
    p.level++;
    p.xpToNext  = Math.floor(p.xpToNext * 1.6);
    p.maxHp    += 5;
    p.hp        = Math.min(p.hp + 5, p.maxHp);
    p.maxEnergy += 5;
    p.attack   += 1;
    addLog(`✦ Nível ${p.level}! Poder aumentado!`, "#F1C40F");
  }
}

// [v0.0.6-C] Adiciona item ao inventário com suporte a stacking.
// Retorna true se adicionado, false se inventário cheio.
// Skills (isItem:true) sempre ocupam um slot individual (qty=1, stackable:false).
function addItemToInventory(itemId, qty = 1) {
  const p    = STATE.player;
  const def  = STATE.defs.items[itemId] || STATE.defs.skills[itemId];
  if (!def) return false;

  const stackable = def.stackable !== false; // default true para itens normais
  const stackCap  = def.stackCap || 99;

  if (stackable) {
    // Procura slot existente com espaço
    const slot = p.inventory.find(s => s.itemId === itemId && s.qty < stackCap);
    if (slot) {
      const space = stackCap - slot.qty;
      const adding = Math.min(qty, space);
      slot.qty += adding;
      qty -= adding;
      if (qty <= 0) return true;
    }
  }

  // Precisa de slot novo (item não-stackable ou stack cheio)
  while (qty > 0) {
    if (p.inventory.length >= p.maxInventory) return false;
    const adding = stackable ? Math.min(qty, stackCap) : 1;
    p.inventory.push({ itemId, qty: adding });
    qty -= adding;
  }
  return true;
}

// [v0.0.6-C] Remove qty unidades do slot de índice slotIdx.
// Se qty >= slot.qty, remove o slot inteiro. Retorna qtd efetivamente removida.
function removeItemFromInventorySlot(slotIdx, qty = 1) {
  const p = STATE.player;
  const slot = p.inventory[slotIdx];
  if (!slot) return 0;
  const removed = Math.min(qty, slot.qty);
  slot.qty -= removed;
  if (slot.qty <= 0) p.inventory.splice(slotIdx, 1);
  return removed;
}

// [v0.0.6-C] Conta total de unidades de itemId no inventário.
function getInventoryItemCount(itemId) {
  return STATE.player.inventory
    .filter(s => s.itemId === itemId)
    .reduce((sum, s) => sum + s.qty, 0);
}

// [v0.0.6-C] Consome qty unidades de itemId do inventário (de múltiplos slots
// se necessário). Retorna true se havia quantidade suficiente, false caso contrário.
function consumeInventoryItem(itemId, qty = 1) {
  if (getInventoryItemCount(itemId) < qty) return false;
  let remaining = qty;
  for (let i = STATE.player.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = STATE.player.inventory[i];
    if (slot.itemId !== itemId) continue;
    const take = Math.min(slot.qty, remaining);
    slot.qty  -= take;
    remaining -= take;
    if (slot.qty <= 0) STATE.player.inventory.splice(i, 1);
  }
  return true;
}

export {
  STATE, SKILL_KEYS, LOADOUT_KEYS, LOADOUT_SIZE, ELEMENTS, CRAFT_RECIPES,
  addLog, getPlayerAttack, getPlayerDefense, getPlayerElement,
  getTileAt, getEntityAt, getItemAt, removeItemFromMap,
  removeEntity, isPassable, advanceTurn, playerGainXP,
  addItemToInventory, removeItemFromInventorySlot,
  getInventoryItemCount, consumeInventoryItem
};
