// js/core/state.js — PATCH v0.0.7
// Fonte única de verdade. Nunca modificar diretamente — usar mutadores.
//
// MUDANÇAS v0.0.7:
//  [v0.0.7-A] STATUS_CONFIG — constantes nomeadas de balanceamento para os
//             status effects elementais (burn/slow/freeze/shock/paralyze/poison).
//  [v0.0.7-A] player.statusEffects[] — lista de status effects ativos no jogador.
//             Entidades de mapa recebem o campo de forma preguiçosa via
//             ensureStatusEffects() (não requer alterar mapGen.js).
//  [v0.0.7-A] applyStatusEffect / processStatusEffects / getStatusEffect /
//             removeStatusEffect — motor genérico de status, usado tanto para
//             o jogador quanto para entidades (combat.js integra a aplicação).
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

// [v0.0.7-A] Configuração de status effects elementais. Constantes nomeadas
// para fácil rebalanceamento — valores conforme especificação de design:
//
//  burn (fire):     40% de chance no golpe. DoT por 3 turnos. Dano/turno =
//                    metade do elementDamage do golpe que aplicou (mín. 1).
//                    Reaplicar reseta a duração para 3 turnos (não estica).
//
//  slow (ice):      30% de chance no golpe. Empilha até 4 stacks; cada
//                    aplicação bem-sucedida soma 1 stack E renova a duração
//                    para 4 turnos. "Slow" em si não tem efeito mecânico
//                    isolado nesta versão — é um contador de progressão em
//                    direção ao freeze (não há sistema de velocidade/AP no
//                    motor de turnos atual para um debuff de "lentidão" ter
//                    efeito próprio; ver README/relatório de entrega).
//                    Ao atingir 4 stacks: aplica freeze e reseta os stacks.
//
//  freeze:          Alvo pula o turno inteiro (sem mover, sem atacar) por
//                    2 turnos. Disparado ao estourar o cap de stacks de slow.
//
//  shock (electric): Todo golpe elétrico aplica shock (sem chance — é
//                    garantido, conforme o golpe é elétrico). Shock amplifica
//                    em 1.5x o próximo golpe sofrido pelo alvo e é consumido
//                    nesse golpe. Se ninguém acertar o alvo em até
//                    maxDuration turnos, o shock expira sem efeito.
//                    Adicionalmente, cada aplicação de shock tem:
//                      - 50% de chance de se espalhar para inimigos próximos
//                        (raio 2, só quando é o jogador atacando um inimigo —
//                        não há "inimigos próximos" quando quem ataca é um
//                        inimigo elétrico contra o jogador);
//                      - 20% de chance (independente) de aplicar paralyze
//                        diretamente no alvo.
//
//  paralyze:        Alvo pula o turno inteiro por 1 turno (efeito bônus do
//                    shock, mais curto que freeze por ser probabilidade menor
//                    e cumulativo com o shock base).
//
//  poison:          75% de chance no golpe. Cada aplicação bem-sucedida soma
//                    5 stacks de uma vez (não é 1 stack com 75% repetido).
//                    Cada stack causa 2 de dano/turno. Empilha infinitamente
//                    (sem cap) e não expira naturalmente — só some com a
//                    morte do alvo.
const STATUS_CONFIG = {
  burn:     { chance: 0.40, duration: 3, damageRatio: 0.5 },
  slow:     { chance: 0.30, duration: 4, maxStacks: 4 },
  freeze:   { duration: 2 },
  shock:    { amplifyMult: 1.5, maxDuration: 5, spreadChance: 0.50, spreadRadius: 2, paralyzeChance: 0.20 },
  paralyze: { duration: 1 },
  poison:   { chance: 0.75, stacksPerProc: 5, damagePerStack: 2 }
};

const STATE = {
  version: "0.0.7",
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
    itemsFound: 0,

    // [v0.0.7-A] Status effects ativos no jogador (burn/slow/freeze/shock/
    // paralyze/poison). Ver STATUS_CONFIG para regras de cada tipo.
    statusEffects: []
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

// ── Status Effects (v0.0.7-A) ───────────────────────────────────────────────
// Motor genérico: funciona tanto para STATE.player quanto para qualquer
// entidade de STATE.map.entities. Não assume forma prévia do objeto alvo —
// ensureStatusEffects() inicializa o array preguiçosamente, cobrindo tanto
// entidades geradas antes desta versão quanto players restaurados de saves
// antigos (sem precisar alterar mapGen.js ou save.js).

function ensureStatusEffects(target) {
  if (!Array.isArray(target.statusEffects)) target.statusEffects = [];
  return target.statusEffects;
}

function getStatusEffect(target, type) {
  return ensureStatusEffects(target).find(s => s.type === type) || null;
}

function removeStatusEffect(target, type) {
  const list = ensureStatusEffects(target);
  const idx = list.findIndex(s => s.type === type);
  if (idx !== -1) list.splice(idx, 1);
}

// [v0.0.7-A] Aplica um status effect a um alvo. context.elementDamage é usado
// apenas por "burn" (define o dano/turno). Retorna um resumo do resultado
// ({type, stacks?}) para o chamador (combat.js) montar a mensagem de log —
// null se o tipo não for reconhecido.
function applyStatusEffect(target, type, context = {}) {
  const list = ensureStatusEffects(target);

  switch (type) {
    case "burn": {
      const cfg = STATUS_CONFIG.burn;
      const dmg = Math.max(1, Math.ceil((context.elementDamage || 0) * cfg.damageRatio));
      let effect = list.find(s => s.type === "burn");
      if (!effect) {
        effect = { type: "burn", turnsLeft: cfg.duration, damagePerTurn: dmg };
        list.push(effect);
      } else {
        effect.turnsLeft = cfg.duration; // reaplicar reseta a duração (não estica)
        effect.damagePerTurn = dmg;
      }
      return { type: "burn" };
    }

    case "slow": {
      const cfg = STATUS_CONFIG.slow;
      let effect = list.find(s => s.type === "slow");
      if (!effect) {
        effect = { type: "slow", stacks: 0, turnsLeft: cfg.duration };
        list.push(effect);
      }
      effect.stacks = Math.min(cfg.maxStacks, effect.stacks + 1);
      effect.turnsLeft = cfg.duration;
      if (effect.stacks >= cfg.maxStacks) {
        removeStatusEffect(target, "slow");
        applyStatusEffect(target, "freeze", context);
        return { type: "freeze" };
      }
      return { type: "slow", stacks: effect.stacks };
    }

    case "freeze": {
      let effect = list.find(s => s.type === "freeze");
      if (!effect) {
        effect = { type: "freeze", turnsLeft: STATUS_CONFIG.freeze.duration };
        list.push(effect);
      } else {
        effect.turnsLeft = STATUS_CONFIG.freeze.duration;
      }
      return { type: "freeze" };
    }

    case "shock": {
      let effect = list.find(s => s.type === "shock");
      if (!effect) {
        effect = { type: "shock", turnsLeft: STATUS_CONFIG.shock.maxDuration };
        list.push(effect);
      } else {
        effect.turnsLeft = STATUS_CONFIG.shock.maxDuration; // reaplicar renova
      }
      return { type: "shock" };
    }

    case "paralyze": {
      let effect = list.find(s => s.type === "paralyze");
      if (!effect) {
        effect = { type: "paralyze", turnsLeft: STATUS_CONFIG.paralyze.duration };
        list.push(effect);
      } else {
        effect.turnsLeft = STATUS_CONFIG.paralyze.duration;
      }
      return { type: "paralyze" };
    }

    case "poison": {
      const cfg = STATUS_CONFIG.poison;
      let effect = list.find(s => s.type === "poison");
      if (!effect) {
        effect = { type: "poison", stacks: 0, damagePerStack: cfg.damagePerStack };
        list.push(effect);
      }
      effect.stacks += cfg.stacksPerProc; // infinito, sem cap, sem expiração
      return { type: "poison", stacks: effect.stacks };
    }

    default:
      return null;
  }
}

// [v0.0.7-A] Processa todos os status effects de um alvo no início do turno
// dele: aplica dano de DoT (burn, poison), decrementa temporizadores e remove
// os expirados. Chamado uma vez por turno para o jogador e uma vez por turno
// para cada entidade viva, a partir de processEnemyTurns() em combat.js.
// Retorna { incapacitated, damageDealt, messages[] }. `messages` traz um item
// por efeito que gerou algo visível neste tick (dano ou incapacitação) — o
// chamador decide cor/texto exato do log.
function processStatusEffects(target) {
  const list = ensureStatusEffects(target);
  let damageDealt = 0;
  let incapacitated = false;
  const messages = [];

  for (const effect of [...list]) {
    switch (effect.type) {
      case "burn":
        target.hp -= effect.damagePerTurn;
        damageDealt += effect.damagePerTurn;
        messages.push({ type: "burn", amount: effect.damagePerTurn });
        effect.turnsLeft--;
        if (effect.turnsLeft <= 0) removeStatusEffect(target, "burn");
        break;

      case "poison": {
        const dmg = effect.stacks * effect.damagePerStack;
        target.hp -= dmg;
        damageDealt += dmg;
        messages.push({ type: "poison", amount: dmg, stacks: effect.stacks });
        // Sem expiração natural — persiste até a morte do alvo.
        break;
      }

      case "slow":
        effect.turnsLeft--;
        if (effect.turnsLeft <= 0) removeStatusEffect(target, "slow");
        break;

      case "freeze":
        incapacitated = true;
        messages.push({ type: "freeze" });
        effect.turnsLeft--;
        if (effect.turnsLeft <= 0) removeStatusEffect(target, "freeze");
        break;

      case "paralyze":
        incapacitated = true;
        messages.push({ type: "paralyze" });
        effect.turnsLeft--;
        if (effect.turnsLeft <= 0) removeStatusEffect(target, "paralyze");
        break;

      case "shock":
        effect.turnsLeft--;
        if (effect.turnsLeft <= 0) removeStatusEffect(target, "shock"); // expirou sem ser consumido
        break;
    }
  }

  return { incapacitated, damageDealt, messages };
}

export {
  STATE, SKILL_KEYS, LOADOUT_KEYS, LOADOUT_SIZE, ELEMENTS, CRAFT_RECIPES,
  STATUS_CONFIG,
  addLog, getPlayerAttack, getPlayerDefense, getPlayerElement,
  getTileAt, getEntityAt, getItemAt, removeItemFromMap,
  removeEntity, isPassable, advanceTurn, playerGainXP,
  addItemToInventory, removeItemFromInventorySlot,
  getInventoryItemCount, consumeInventoryItem,
  ensureStatusEffects, getStatusEffect, removeStatusEffect,
  applyStatusEffect, processStatusEffects
};
