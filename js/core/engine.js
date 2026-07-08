// js/core/engine.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-A] Skills são itens: playerPickup() diferencia kind:"skill" vs kind:"item".
//             equipSkillToLoadout() / unequipSkillFromLoadout(): novos métodos.
//             selectSkill() / targeting: usa LOADOUT_KEYS + skillLoadout[] em vez de
//             player.skills[].
//  [v0.0.6-C] useSelectedItem() / dropSelectedItem() / unequipSlot(): reescritos para
//             inventário {itemId,qty}[] com helpers de state.js.
//  [v0.0.6-E] craftItem(): executa receitas de CRAFT_RECIPES. Tecla C abre painel.
//  [v0.0.6-F] _enterDungeonFromOverworld(): identifica entrada por posição,
//             lê/cria dungeonProgress[entranceId]; gera dungeon com tier correto.
//             _completeExpedition(): incrementa tier e timesCompleted.
//             _restoreOverworldSnapshot(): restaura dungeonEntrances.
//             startNewGame(): reseta dungeonProgress e dungeonEntrances.

import {
  STATE, SKILL_KEYS, LOADOUT_KEYS, CRAFT_RECIPES,
  addLog, advanceTurn, isPassable, getEntityAt, getItemAt, removeItemFromMap,
  addItemToInventory, removeItemFromInventorySlot, getInventoryItemCount, consumeInventoryItem
} from './state.js';
import { exportSave, importSave, applySave } from './save.js';
import { generateOverworld, generateDungeon, MAX_DEPTH } from '../world/mapGen.js';
import { computeFOV } from '../systems/fov.js';
import { initRenderer, render } from '../systems/render.js';
import { initHUD, renderHUD } from '../ui/hud.js';
import { playerAttack, processEnemyTurns, activateSkill, tickCooldowns } from '../systems/combat.js';
import { showMainMenu, showGameOver, showExpeditionReturn, hideOverlay, showNotification } from '../ui/menus.js';

class Game {
  constructor() { this.initialized = false; }

  async init() {
    await this.loadDefs();
    const canvas = document.getElementById("game-canvas");
    initRenderer(canvas);
    initHUD();
    showMainMenu();
    this.bindInput();
    this.startRenderLoop();
    this.initialized = true;
    window.GAME = this;
  }

  async loadDefs() {
    const [enemies, items, skills] = await Promise.all([
      fetch("data/enemies.json").then(r => r.json()),
      fetch("data/items.json").then(r => r.json()),
      fetch("data/skills.json").then(r => r.json()),
    ]);
    STATE.defs.enemies = enemies.enemies;
    STATE.defs.items   = items.items;
    STATE.defs.skills  = skills.skills;
  }

  // ── Nova partida ──────────────────────────────────────────────────────────
  startNewGame() {
    STATE.seed      = Math.floor(Math.random() * 2147483647);
    STATE.turn      = 0;
    STATE.gamePhase = "PLAYING";
    STATE.log       = [];

    // [v0.0.6-F] Reseta progresso de dungeons e entrâncias
    STATE.dungeon           = { active: false, depth: 0, entranceId: null };
    STATE.overworldSnapshot = null;
    STATE.dungeonProgress   = {};

    Object.assign(STATE.player, {
      x: 0, y: 0,
      level: 1, xp: 0, xpToNext: 30,
      hp: 30, maxHp: 30,
      energy: 40, maxEnergy: 40,
      attack: 3, defense: 1,
      equipment: { weapon: null, offhand: null },
      // [v0.0.6-C] Inventário como {itemId,qty}[]
      inventory: [],
      // [v0.0.6-A] 4 slots fixos de loadout; começa com solar_burst e crystal_shield
      skillLoadout: ["solar_burst", "crystal_shield", null, null],
      skillCooldowns: {},
      activeShield: 0,
      floorsVisited: 0, kills: 0, itemsFound: 0
    });

    const result = generateOverworld(STATE.seed, STATE.map.width, STATE.map.height);
    Object.assign(STATE.map, {
      type: "overworld", id: "rusted_plains",
      tiles: result.tiles, entities: result.entities,
      items: result.items, stairs: result.stairs,
      entrance: result.entrance,
      // [v0.0.6-F] Entradas de dungeon no overworld
      dungeonEntrances: result.dungeonEntrances || []
    });

    STATE.player.x = result.spawnX;
    STATE.player.y = result.spawnY;
    STATE.ui.pauseOpen      = false;
    STATE.ui.inventoryOpen  = false;
    STATE.ui.craftingOpen   = false;
    STATE.ui.tileInfo       = null;

    computeFOV(STATE.player.x, STATE.player.y);
    hideOverlay();

    addLog("✦ Bem-vindo às Planícies Enferrujadas de Auroria.", "#F1C40F");
    addLog("Cristais solares pulsam ao seu redor. O ar cheira a vapor e vegetação.", "#8FBC44");
    addLog("Setas=mover · G=pegar · I=inventário · Q W E R=skills · C=crafting · ESC=menu", "#7F8C8D");
  }

  returnToMenu() {
    STATE.gamePhase = "MENU";
    STATE.ui.pauseOpen     = false;
    STATE.ui.inventoryOpen = false;
    STATE.ui.craftingOpen  = false;
    showMainMenu();
  }

  // ── Movimento ─────────────────────────────────────────────────────────────
  movePlayer(dx, dy) {
    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.targetingMode || STATE.ui.pauseOpen ||
        STATE.ui.inventoryOpen || STATE.ui.craftingOpen) return;

    const nx = STATE.player.x + dx;
    const ny = STATE.player.y + dy;

    const entity = getEntityAt(nx, ny);
    if (entity && entity.hp > 0) {
      playerAttack(entity);
      this._endPlayerTurn();
      return;
    }

    if (!isPassable(nx, ny)) return;

    STATE.player.x = nx;
    STATE.player.y = ny;

    // Informa item no chão
    const item = getItemAt(nx, ny);
    if (item) {
      const def = STATE.defs.items[item.defId] || STATE.defs.skills[item.defId];
      addLog(`Você vê ${def?.name || item.defId} no chão. [G] para pegar.`, "#BDC3C7");
    }

    // Informa escada / entrada de dungeon
    const stair = STATE.map.stairs.find(s => s.x === nx && s.y === ny);
    if (stair) {
      const stairTile = STATE.map.tiles[ny]?.[nx];
      if (stairTile?.type === "stairs_up") {
        if (STATE.dungeon.depth === 1) {
          addLog("✦ Saída à vista! [Enter] para retornar ao overworld.", "#F1C40F");
        } else {
          addLog("Escada para cima — sem função nesta expedição.", "#7F8C8D");
        }
      } else if (stairTile?.type === "exit") {
        addLog("✦ O coração das Ruínas pulsa adiante! [Enter] para concluir a expedição.", "#F1C40F");
      } else {
        addLog("✦ Uma passagem para baixo! [Enter] para descer.", "#F1C40F");
      }
    }

    // [v0.0.6-F] Informa entrada de dungeon no overworld
    const entrance = STATE.map.dungeonEntrances?.find(e => e.x === nx && e.y === ny);
    if (entrance) {
      const prog = STATE.dungeonProgress[entrance.id];
      const tierLabel = prog ? ` (Tier ${prog.tier})` : " (Tier 1)";
      addLog(`✦ Entrada de dungeon${tierLabel}. [Enter] para explorar.`, "#E67E22");
    }

    this._endPlayerTurn();
  }

  _endPlayerTurn() {
    advanceTurn();
    tickCooldowns();
    processEnemyTurns();
    computeFOV(STATE.player.x, STATE.player.y);
    if (STATE.gamePhase === "DEAD") setTimeout(() => showGameOver(), 600);
  }

  playerWait() {
    if (STATE.gamePhase !== "PLAYING") return;
    addLog("Você aguarda...", "#7F8C8D");
    this._endPlayerTurn();
  }

  // [v0.0.6-A/C] Pickup diferencia skill drop de item comum.
  // Skills vão para o inventário como item (isItem:true), não direto ao loadout.
  playerPickup() {
    if (STATE.gamePhase !== "PLAYING") return;
    const { x, y } = STATE.player;
    const mapItem = getItemAt(x, y);
    if (!mapItem) { addLog("Não há nada para pegar aqui.", "#7F8C8D"); return; }

    const isSkill = mapItem.kind === "skill";
    const defId   = mapItem.defId;
    const def     = isSkill
      ? STATE.defs.skills[defId]
      : STATE.defs.items[defId];

    if (!def) { addLog("Item desconhecido.", "#E74C3C"); return; }

    const added = addItemToInventory(defId, 1);
    if (!added) { addLog("Inventário cheio!", "#E74C3C"); return; }

    removeItemFromMap(x, y, mapItem.id);
    STATE.player.itemsFound++;

    if (isSkill) {
      addLog(`✦ Você coletou a skill: ${def.name}! Equipe em Q/W/E/R via inventário.`, "#F1C40F");
    } else {
      addLog(`Você pegou: ${def.name}.`, "#D4AC0D");
    }
    this._endPlayerTurn();
  }

  // ── Expedição à Dungeon ───────────────────────────────────────────────────
  useStairs() {
    if (STATE.gamePhase !== "PLAYING") return;

    // [v0.0.6-F] No overworld, usa dungeonEntrances em vez de stairs
    if (STATE.map.type === "overworld") {
      const { x, y } = STATE.player;
      const entrance = STATE.map.dungeonEntrances?.find(e => e.x === x && e.y === y);
      if (entrance) {
        this._enterDungeonFromOverworld(entrance);
        return;
      }
      addLog("Não há entrada aqui.", "#7F8C8D");
      return;
    }

    // Dentro da dungeon: usa stairs normalmente
    const stair = STATE.map.stairs.find(
      s => s.x === STATE.player.x && s.y === STATE.player.y
    );
    if (!stair) { addLog("Não há entrada aqui.", "#7F8C8D"); return; }

    const tile = STATE.map.tiles[STATE.player.y]?.[STATE.player.x];
    if (tile?.type === "stairs_up") {
      if (STATE.dungeon.depth === 1) {
        this._returnToOverworld();
      } else {
        addLog("Não é possível retornar a andares anteriores nesta expedição.", "#7F8C8D");
      }
      return;
    }
    if (tile?.type === "stairs_down") { this._descendDungeon(); return; }
    if (tile?.type === "exit")        { this._completeExpedition(); return; }
  }

  // [v0.0.6-F] Identifica a entrada pelo id; cria dungeonProgress se não existir.
  // Passa tier para generateDungeon para escalar dificuldade/loot.
  _enterDungeonFromOverworld(entrance) {
    // Snapshot profundo do overworld (inclui dungeonEntrances para restauração fiel)
    STATE.overworldSnapshot = {
      type:     STATE.map.type,
      id:       STATE.map.id,
      width:    STATE.map.width,
      height:   STATE.map.height,
      tiles:    STATE.map.tiles.map(row => row.map(t => ({ ...t }))),
      entities: JSON.parse(JSON.stringify(STATE.map.entities)),
      items:    JSON.parse(JSON.stringify(STATE.map.items)),
      stairs:   JSON.parse(JSON.stringify(STATE.map.stairs)),
      entrance: { ...STATE.map.entrance },
      dungeonEntrances: JSON.parse(JSON.stringify(STATE.map.dungeonEntrances || [])),
      playerX:  STATE.player.x,
      playerY:  STATE.player.y
    };

    // Cria progresso para esta entrada se for a primeira visita
    if (!STATE.dungeonProgress[entrance.id]) {
      STATE.dungeonProgress[entrance.id] = { tier: 1, timesCompleted: 0 };
    }
    const progress = STATE.dungeonProgress[entrance.id];

    STATE.dungeon.entranceId = entrance.id;

    const dungeonSeed = STATE.seed + entrance.id.charCodeAt(0) * 997;
    const result = generateDungeon(dungeonSeed, 1, 50, 36, 0, progress.tier);
    this._applyDungeonResult(result, 1);

    addLog(`✦ Você entra nas Ruínas de Cristal. Andar 1 · Tier ${progress.tier}.`, "#F1C40F");
  }

  _descendDungeon() {
    const nextDepth  = STATE.dungeon.depth + 1;
    const entranceId = STATE.dungeon.entranceId;
    const progress   = STATE.dungeonProgress[entranceId] || { tier: 1, timesCompleted: 0 };
    const dungeonSeed = STATE.seed + (entranceId?.charCodeAt(0) || 0) * 997;
    const result = generateDungeon(dungeonSeed, nextDepth, 50, 36, 0, progress.tier);
    this._applyDungeonResult(result, nextDepth);
    addLog(`✦ Você desce mais fundo. Andar ${nextDepth} · Tier ${progress.tier}.`, "#F1C40F");
  }

  _applyDungeonResult(result, depth) {
    Object.assign(STATE.map, {
      type: "dungeon", id: `ruins_dungeon_d${depth}`,
      width:    result.tiles[0].length,
      height:   result.tiles.length,
      tiles:    result.tiles,
      entities: result.entities,
      items:    result.items,
      stairs:   result.stairs,
      entrance: result.entrance,
      dungeonEntrances: [] // sem entradas dentro da dungeon
    });
    STATE.player.x = result.spawnX;
    STATE.player.y = result.spawnY;
    STATE.dungeon  = { active: true, depth, entranceId: STATE.dungeon.entranceId };
    STATE.player.floorsVisited++;
    STATE.ui.tileInfo = null;
    computeFOV(STATE.player.x, STATE.player.y);
  }

  _returnToOverworld() {
    this._restoreOverworldSnapshot();
    addLog("✦ Você retorna às Planícies Enferrujadas.", "#8FBC44");
  }

  // [v0.0.6-F] Incrementa tier e timesCompleted da entrada usada.
  _completeExpedition() {
    const entranceId = STATE.dungeon.entranceId;
    if (entranceId && STATE.dungeonProgress[entranceId]) {
      STATE.dungeonProgress[entranceId].tier++;
      STATE.dungeonProgress[entranceId].timesCompleted++;
      const t = STATE.dungeonProgress[entranceId].tier;
      addLog(`✦ Expedição concluída! Próxima visita: Tier ${t}.`, "#F1C40F");
    } else {
      addLog(`✦ Você alcança o coração das Ruínas de Cristal — expedição concluída!`, "#F1C40F");
    }
    STATE.gamePhase = "WIN";
    setTimeout(() => showExpeditionReturn(), 800);
  }

  returnFromExpedition() {
    this._restoreOverworldSnapshot();
    STATE.gamePhase = "PLAYING";
    hideOverlay();
  }

  // [v0.0.6-F] Restaura dungeonEntrances junto com o resto do snapshot.
  _restoreOverworldSnapshot() {
    const snap = STATE.overworldSnapshot;
    if (!snap) {
      addLog("⚠ Overworld não encontrado — gerando um novo.", "#E74C3C");
      const result = generateOverworld(STATE.seed, STATE.map.width, STATE.map.height);
      Object.assign(STATE.map, {
        type: "overworld", id: "rusted_plains",
        tiles: result.tiles, entities: result.entities,
        items: result.items, stairs: result.stairs,
        entrance: result.entrance,
        dungeonEntrances: result.dungeonEntrances || []
      });
      STATE.player.x = result.spawnX;
      STATE.player.y = result.spawnY;
    } else {
      Object.assign(STATE.map, {
        type: snap.type, id: snap.id, width: snap.width, height: snap.height,
        tiles: snap.tiles, entities: snap.entities,
        items: snap.items, stairs: snap.stairs,
        entrance: snap.entrance,
        dungeonEntrances: snap.dungeonEntrances || []
      });
      STATE.player.x = snap.playerX;
      STATE.player.y = snap.playerY;
    }
    STATE.dungeon = { active: false, depth: 0, entranceId: null };
    STATE.ui.tileInfo = null;
    computeFOV(STATE.player.x, STATE.player.y);
  }

  // ── Inventário ────────────────────────────────────────────────────────────
  toggleInventory() {
    if (STATE.ui.craftingOpen) { STATE.ui.craftingOpen = false; return; }
    STATE.ui.inventoryOpen = !STATE.ui.inventoryOpen;
    STATE.ui.pauseOpen     = false;
    STATE.ui.selectedInventoryIdx = 0;
  }

  // [v0.0.6-E] Painel de crafting
  toggleCrafting() {
    STATE.ui.craftingOpen  = !STATE.ui.craftingOpen;
    STATE.ui.inventoryOpen = false;
    STATE.ui.pauseOpen     = false;
  }

  selectInventoryItem(idx) {
    STATE.ui.selectedInventoryIdx = idx;
  }

  // [v0.0.6-C] useSelectedItem reescrito para inventário {itemId,qty}[].
  // [v0.0.6-A] Skills no inventário: Enter equipa no primeiro slot livre;
  //            se todos ocupados, avisa o jogador.
  useSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx  = STATE.ui.selectedInventoryIdx;
    const slot = STATE.player.inventory[idx];
    if (!slot) return;

    const { itemId } = slot;

    // Verifica se é uma skill (definida em skills.json com isItem:true)
    const skillDef = STATE.defs.skills[itemId];
    if (skillDef?.isItem) {
      this.equipSkillToLoadout(idx);
      return;
    }

    const def = STATE.defs.items[itemId];
    if (!def) return;

    if (def.type === "consumable") {
      if (def.effect === "heal") {
        const healed = Math.min(def.value, STATE.player.maxHp - STATE.player.hp);
        STATE.player.hp = Math.min(STATE.player.maxHp, STATE.player.hp + def.value);
        addLog(`Você usa ${def.name}. +${healed} HP.`, "#2ECC71");
      } else if (def.effect === "energy") {
        const restored = Math.min(def.value, STATE.player.maxEnergy - STATE.player.energy);
        STATE.player.energy = Math.min(STATE.player.maxEnergy, STATE.player.energy + def.value);
        addLog(`Você usa ${def.name}. +${restored} Energia.`, "#5DADE2");
      } else if (def.effect === "heal_energy") {
        // [v0.0.6-E] crystal_infusion: cura HP e energia simultaneamente
        const healed   = Math.min(def.value,       STATE.player.maxHp     - STATE.player.hp);
        const restored = Math.min(def.energyValue, STATE.player.maxEnergy - STATE.player.energy);
        STATE.player.hp     = Math.min(STATE.player.maxHp,     STATE.player.hp     + def.value);
        STATE.player.energy = Math.min(STATE.player.maxEnergy, STATE.player.energy + def.energyValue);
        addLog(`Você usa ${def.name}. +${healed} HP, +${restored} Energia.`, "#9B59B6");
      } else if (def.effect === "reset_cooldowns") {
        // [v0.0.6-E] overcharged_core: reseta todos os cooldowns de skill
        STATE.player.skillCooldowns = {};
        addLog(`Você usa ${def.name}. Todos os cooldowns foram resetados!`, "#F39C12");
      }
      removeItemFromInventorySlot(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));

    } else if (def.type === "weapon") {
      const prev = STATE.player.equipment.weapon;
      if (prev && prev !== itemId) {
        addItemToInventory(prev, 1);
        addLog(`Você desequipa ${STATE.defs.items[prev]?.name}.`, "#7F8C8D");
      }
      STATE.player.equipment.weapon = itemId;
      removeItemFromInventorySlot(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
      const elemLabel = def.elementDamage > 0 ? ` +${def.elementDamage} ${def.elementType}` : "";
      addLog(`Você equipa ${def.name}. +${def.attackBonus || 0} ataque${elemLabel}.`, "#D4AC0D");

    } else if (def.type === "armor") {
      const prev = STATE.player.equipment.offhand;
      if (prev && prev !== itemId) {
        addItemToInventory(prev, 1);
        addLog(`Você desequipa ${STATE.defs.items[prev]?.name}.`, "#7F8C8D");
      }
      STATE.player.equipment.offhand = itemId;
      removeItemFromInventorySlot(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
      addLog(`Você equipa ${def.name}. +${def.defenseBonus || 0} defesa.`, "#E67E22");

    } else {
      addLog(`${def.name}: ${def.description || "Não pode ser usado diretamente."}`, "#7F8C8D");
    }
  }

  // [v0.0.6-C] Drop reescrito para {itemId,qty}[]: remove 1 unidade do slot.
  dropSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx  = STATE.ui.selectedInventoryIdx;
    const slot = STATE.player.inventory[idx];
    if (!slot) return;
    const def = STATE.defs.items[slot.itemId] || STATE.defs.skills[slot.itemId];
    removeItemFromInventorySlot(idx, 1);
    STATE.map.items.push({
      defId: slot.itemId,
      kind:  STATE.defs.skills[slot.itemId] ? "skill" : "item",
      x: STATE.player.x, y: STATE.player.y,
      id: `drop_${Date.now()}`
    });
    STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
    addLog(`Você larga ${def?.name || slot.itemId}.`, "#7F8C8D");
  }

  // [v0.0.6-C] unequipSlot usa addItemToInventory em vez de push direto.
  unequipSlot(slot) {
    const itemId = STATE.player.equipment[slot];
    if (!itemId) return;
    const added = addItemToInventory(itemId, 1);
    if (!added) { addLog("Inventário cheio para desequipar!", "#E74C3C"); return; }
    STATE.player.equipment[slot] = null;
    const def = STATE.defs.items[itemId];
    addLog(`Você desequipa ${def?.name || itemId}.`, "#7F8C8D");
  }

  // ── Loadout de Skills ─────────────────────────────────────────────────────

  // [v0.0.6-A] Equipa skill do inventário (slotIdx) no primeiro slot de loadout livre.
  // Se todos ocupados, oferece troca pelo slot Q (idx 0) como fallback com aviso.
  equipSkillToLoadout(inventorySlotIdx) {
    const slot = STATE.player.inventory[inventorySlotIdx];
    if (!slot) return;
    const skillId  = slot.itemId;
    const skillDef = STATE.defs.skills[skillId];
    if (!skillDef?.isItem) return;

    // Verifica se já está equipada em algum slot
    const alreadyAt = STATE.player.skillLoadout.indexOf(skillId);
    if (alreadyAt !== -1) {
      addLog(`${skillDef.name} já está equipada no slot ${LOADOUT_KEYS[alreadyAt].toUpperCase()}.`, "#7F8C8D");
      return;
    }

    // Procura slot vazio
    const emptySlot = STATE.player.skillLoadout.indexOf(null);
    if (emptySlot !== -1) {
      STATE.player.skillLoadout[emptySlot] = skillId;
      removeItemFromInventorySlot(inventorySlotIdx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(inventorySlotIdx, STATE.player.inventory.length - 1));
      addLog(`${skillDef.name} equipada no slot ${LOADOUT_KEYS[emptySlot].toUpperCase()}.`, "#F1C40F");
    } else {
      addLog(`Loadout cheio! Desequipe uma skill primeiro (U no inventário com skill selecionada no loadout).`, "#E74C3C");
    }
  }

  // [v0.0.6-A] Desequipa skill do loadoutSlotIdx (0-3) → volta ao inventário.
  unequipSkillFromLoadout(loadoutSlotIdx) {
    const skillId = STATE.player.skillLoadout[loadoutSlotIdx];
    if (!skillId) return;
    const skillDef = STATE.defs.skills[skillId];
    const added = addItemToInventory(skillId, 1);
    if (!added) { addLog("Inventário cheio para desequipar skill!", "#E74C3C"); return; }
    STATE.player.skillLoadout[loadoutSlotIdx] = null;
    // Limpa cooldown da skill desequipada
    delete STATE.player.skillCooldowns[skillId];
    addLog(`${skillDef?.name || skillId} desequipada e devolvida ao inventário.`, "#7F8C8D");
  }

  // ── Crafting ──────────────────────────────────────────────────────────────

  // [v0.0.6-E] Executa a receita de índice recipeIdx em CRAFT_RECIPES.
  // Verifica ingredientes, consome e adiciona o resultado ao inventário.
  craftItem(recipeIdx) {
    const recipe = CRAFT_RECIPES[recipeIdx];
    if (!recipe) { addLog("Receita inválida.", "#E74C3C"); return; }

    // 1. Verifica todos os ingredientes
    for (const ing of recipe.ingredients) {
      if (getInventoryItemCount(ing.itemId) < ing.qty) {
        addLog(`Faltam materiais: precisa de ${ing.qty}× ${ing.itemId}, tem ${getInventoryItemCount(ing.itemId)}.`, "#E74C3C");
        return;
      }
    }

    // 2. [BUG-16] Verifica espaço para o resultado ANTES de consumir qualquer ingrediente.
    //    Sem esta verificação, os ingredientes eram destruídos mesmo quando addItemToInventory()
    //    retornava false (inventário cheio), causando perda permanente de recursos.
    const def       = STATE.defs.items[recipe.resultId];
    const stackable = def?.stackable !== false;
    const stackCap  = def?.stackCap || 99;
    const existingSlot = stackable
      ? STATE.player.inventory.find(s => s.itemId === recipe.resultId && s.qty < stackCap)
      : null;
    const hasSpace = existingSlot !== undefined && existingSlot !== null
      ? true
      : STATE.player.inventory.length < STATE.player.maxInventory;
    if (!hasSpace) {
      addLog("Inventário cheio — libere espaço antes de fabricar.", "#E74C3C");
      return;
    }

    // 3. Espaço garantido — agora é seguro consumir os ingredientes
    for (const ing of recipe.ingredients) {
      consumeInventoryItem(ing.itemId, ing.qty);
    }

    // 4. Adiciona resultado (não pode falhar: espaço verificado no passo 2)
    addItemToInventory(recipe.resultId, recipe.resultQty);
    const resultDef = STATE.defs.items[recipe.resultId];
    addLog(`✦ Fabricado: ${resultDef?.name || recipe.resultId}!`, "#D4AC0D");
  }

  // ── Skills (loadout) ──────────────────────────────────────────────────────

  // [v0.0.6-A] selectSkill agora lê de skillLoadout[] em vez de player.skills[].
  selectSkill(loadoutIdx) {
    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.inventoryOpen || STATE.ui.pauseOpen || STATE.ui.craftingOpen) return;

    const skillId = STATE.player.skillLoadout[loadoutIdx];
    if (!skillId) { addLog(`Slot ${LOADOUT_KEYS[loadoutIdx].toUpperCase()} vazio.`, "#7F8C8D"); return; }

    const def = STATE.defs.skills[skillId];
    if (!def) return;

    if (STATE.player.skillCooldowns[skillId] > 0) {
      showNotification(`${def.name} em recarga! (${STATE.player.skillCooldowns[skillId]} turnos)`, "#E74C3C");
      return;
    }
    if (STATE.player.energy < def.energyCost) {
      showNotification("Energia insuficiente!", "#E74C3C"); return;
    }

    // Segunda pressão cancela targeting
    if (STATE.ui.selectedSkill === skillId) {
      STATE.ui.selectedSkill  = null;
      STATE.ui.targetingMode  = false;
      addLog("Ação cancelada.", "#7F8C8D");
      return;
    }

    STATE.ui.selectedSkill = skillId;

    if (def.targetType === "self") {
      activateSkill(skillId, STATE.player.x, STATE.player.y);
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      if (STATE.gamePhase === "DEAD") setTimeout(() => showGameOver(), 600);
    } else {
      STATE.ui.targetingMode = true;
      addLog(`${def.name}: clique no alvo · [${LOADOUT_KEYS[loadoutIdx].toUpperCase()}] de novo p/ cancelar.`, "#F1C40F");
    }
  }

  activateSkillOnTarget(x, y) {
    const skillId = STATE.ui.selectedSkill;
    if (!skillId) return;
    activateSkill(skillId, x, y);
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    if (STATE.gamePhase === "DEAD") setTimeout(() => showGameOver(), 600);
  }

  cancelTargeting() {
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    addLog("Ação cancelada.", "#7F8C8D");
  }

  // ── Pausa ─────────────────────────────────────────────────────────────────
  togglePause() {
    if (STATE.gamePhase !== "PLAYING") return;
    STATE.ui.pauseOpen     = !STATE.ui.pauseOpen;
    STATE.ui.inventoryOpen = false;
    STATE.ui.craftingOpen  = false;
    STATE.ui.targetingMode = false;
    STATE.ui.selectedSkill = null;
  }

  pauseSave()  { exportSave(); }
  pauseLoad()  { document.getElementById("file-input-pause").click(); }

  // ── Tile Info ─────────────────────────────────────────────────────────────
  closeTileInfo() { STATE.ui.tileInfo = null; }

  inspectTile(wx, wy) {
    const tile = STATE.map.tiles[wy]?.[wx];
    if (!tile || !tile.explored) { STATE.ui.tileInfo = null; return; }
    const entity = tile.visible ? STATE.map.entities.find(e => e.x === wx && e.y === wy && e.hp > 0) : null;
    const item   = tile.visible ? STATE.map.items.find(i => i.x === wx && i.y === wy) : null;
    STATE.ui.tileInfo = { tile, entity, item, x: wx, y: wy };
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  bindInput() {
    document.addEventListener("keydown", (e) => this.onKey(e));
    const canvas = document.getElementById("game-canvas");
    canvas.addEventListener("click",      (e) => this.onCanvasClick(e));
    canvas.addEventListener("mousemove",  (e) => this.onCanvasHover(e));
    canvas.addEventListener("mouseleave", ()  => { STATE.ui.hoverTile = null; });
  }

  getTileFromMouseEvent(e) {
    const canvas = document.getElementById("game-canvas");
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top)  * scaleY;
    const cw = canvas.width  / STATE.camera.width;
    const ch = canvas.height / STATE.camera.height;
    return {
      wx: STATE.camera.x + Math.floor(px / cw),
      wy: STATE.camera.y + Math.floor(py / ch)
    };
  }

  onCanvasClick(e) {
    const { wx, wy } = this.getTileFromMouseEvent(e);
    if (STATE.ui.targetingMode) { this.activateSkillOnTarget(wx, wy); }
    else                        { this.inspectTile(wx, wy); }
  }

  onCanvasHover(e) {
    const { wx, wy } = this.getTileFromMouseEvent(e);
    STATE.ui.hoverTile = { wx, wy };
  }

  onKey(e) {
    if (e.key === "Escape") {
      if (STATE.gamePhase === "PLAYING") {
        if (STATE.ui.targetingMode)      { this.cancelTargeting(); }
        else if (STATE.ui.craftingOpen)  { this.toggleCrafting(); }
        else if (STATE.ui.inventoryOpen) { this.toggleInventory(); }
        else                             { this.togglePause(); }
      }
      e.preventDefault(); return;
    }

    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.pauseOpen) return;

    // ── Inventário aberto ─────────────────────────────────────────────────
    if (STATE.ui.inventoryOpen) {
      switch (e.key) {
        case "ArrowUp": case "k":
          STATE.ui.selectedInventoryIdx = Math.max(0, STATE.ui.selectedInventoryIdx - 1);
          e.preventDefault(); return;
        case "ArrowDown": case "j":
          STATE.ui.selectedInventoryIdx = Math.min(
            STATE.player.inventory.length - 1,
            STATE.ui.selectedInventoryIdx + 1
          );
          e.preventDefault(); return;
        case "Enter":
          this.useSelectedItem(); e.preventDefault(); return;
        case "d": case "D":
          this.dropSelectedItem(); e.preventDefault(); return;
        case "i": case "I":
          this.toggleInventory(); e.preventDefault(); return;
      }
      return;
    }

    // ── Modo targeting ────────────────────────────────────────────────────
    if (STATE.ui.targetingMode) {
      const key = e.key.toLowerCase();
      const idx = LOADOUT_KEYS.indexOf(key);
      if (idx !== -1) {
        const sk = STATE.player.skillLoadout[idx];
        if (sk && sk === STATE.ui.selectedSkill) {
          this.cancelTargeting();
          e.preventDefault();
        }
      }
      return;
    }

    // ── Jogo normal ───────────────────────────────────────────────────────
    switch (e.key) {
      case "ArrowUp":    this.movePlayer(0, -1);  e.preventDefault(); return;
      case "ArrowDown":  this.movePlayer(0,  1);  e.preventDefault(); return;
      case "ArrowLeft":  this.movePlayer(-1, 0);  e.preventDefault(); return;
      case "ArrowRight": this.movePlayer(1,  0);  e.preventDefault(); return;
      case "7": this.movePlayer(-1, -1); return;
      case "9": this.movePlayer( 1, -1); return;
      case "3": this.movePlayer( 1,  1); return;
      case ".": case "5": this.playerWait(); return;
      case "g": case "G": this.playerPickup(); return;
      case "Enter":       this.useStairs(); return;
      case "i": case "I": this.toggleInventory(); return;
      // [v0.0.6-E] Tecla C abre painel de crafting
      case "c": case "C": this.toggleCrafting(); return;
    }

    // [v0.0.6-A] Skills via LOADOUT_KEYS (Q/W/E/R fixos)
    const key = e.key.toLowerCase();
    const loadoutIdx = LOADOUT_KEYS.indexOf(key);
    if (loadoutIdx !== -1) {
      this.selectSkill(loadoutIdx);
    }
  }

  async loadFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await importSave(file);
      applySave(data, STATE);
      await this.loadDefs();
      STATE.ui.pauseOpen     = false;
      STATE.ui.inventoryOpen = false;
      STATE.ui.craftingOpen  = false;
      hideOverlay();
      computeFOV(STATE.player.x, STATE.player.y);
      addLog("💾 Save carregado com sucesso!", "#2ECC71");
    } catch (err) {
      showNotification(`Erro: ${err.message}`, "#E74C3C", 3000);
    }
    input.value = "";
  }

  startRenderLoop() {
    const loop = () => { render(); renderHUD(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

export default Game;
