// js/core/engine.js — v0.2.0
// Motor principal do jogo

import { STATE, addLog, advanceTurn, isPassable, getEntityAt, getItemAt, removeItemFromMap, getCurrentTileDesc } from './state.js';
import { exportSave, importSave, applySave } from './save.js';
import { generateOverworld } from '../world/mapGen.js';
import { computeFOV } from '../systems/fov.js';
import { initRenderer, render } from '../systems/render.js';
import { initHUD, renderHUD } from '../ui/hud.js';
import { playerAttack, processEnemyTurns, activateSkill, tickCooldowns } from '../systems/combat.js';
import { showMainMenu, showGameOver, showVictory, hideOverlay, showNotification } from '../ui/menus.js';

class Game {
  constructor() {
    this.initialized = false;
  }

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

  // ── Nova partida ─────────────────────────────────────────────────────────
  startNewGame() {
    STATE.seed = Math.floor(Math.random() * 2147483647);
    STATE.turn = 0;
    STATE.gamePhase = "PLAYING";
    STATE.log = [];

    Object.assign(STATE.player, {
      x: 0, y: 0,
      level: 1, xp: 0, xpToNext: 30,
      hp: 30, maxHp: 30,
      energy: 40, maxEnergy: 40,
      attack: 3, defense: 1,
      equipment: { weapon: null, offhand: null },
      inventory: [],
      skillCooldowns: {},
      activeShield: 0,
      floorsVisited: 0, kills: 0, itemsFound: 0
    });

    const result = generateOverworld(STATE.seed, STATE.map.width, STATE.map.height);
    Object.assign(STATE.map, {
      type: "overworld", id: "rusted_plains",
      tiles: result.tiles, entities: result.entities,
      items: result.items, stairs: result.stairs,
      entrance: result.entrance
    });

    STATE.player.x = result.spawnX;
    STATE.player.y = result.spawnY;
    STATE.ui.pauseOpen = false;
    STATE.ui.inventoryOpen = false;
    STATE.ui.tileInfo = null;

    computeFOV(STATE.player.x, STATE.player.y);
    hideOverlay();

    addLog("✦ Bem-vindo às Planícies Enferrujadas de Auroria.", "#F1C40F");
    addLog("Cristais solares pulsam ao seu redor. O ar cheira a vapor e vegetação.", "#8FBC44");
    addLog("WASD/Setas=mover · G=pegar · I=inventário · 1-4=skills · ESC=menu", "#7F8C8D");
  }

  returnToMenu() {
    STATE.gamePhase = "MENU";
    STATE.ui.pauseOpen = false;
    STATE.ui.inventoryOpen = false;
    showMainMenu();
  }

  // ── Movimento ─────────────────────────────────────────────────────────────
  movePlayer(dx, dy) {
    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.targetingMode || STATE.ui.pauseOpen || STATE.ui.inventoryOpen) return;

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
      const def = STATE.defs.items[item.defId];
      addLog(`Você vê ${def?.name || item.defId} no chão. [G] para pegar.`, "#BDC3C7");
    }

    // Informa escada
    const stair = STATE.map.stairs.find(s => s.x === nx && s.y === ny);
    if (stair) {
      addLog("✦ Entrada para as Ruínas de Cristal! [Enter] para entrar.", "#F1C40F");
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

  playerPickup() {
    if (STATE.gamePhase !== "PLAYING") return;
    const { x, y } = STATE.player;
    const item = getItemAt(x, y);
    if (!item) { addLog("Não há nada para pegar aqui.", "#7F8C8D"); return; }
    if (STATE.player.inventory.length >= STATE.player.maxInventory) {
      addLog("Inventário cheio!", "#E74C3C"); return;
    }
    const def = STATE.defs.items[item.defId];
    removeItemFromMap(x, y, item.id);
    STATE.player.inventory.push(item.defId);
    STATE.player.itemsFound++;
    addLog(`Você pegou: ${def?.name || item.defId}.`, "#D4AC0D");
    this._endPlayerTurn();
  }

  enterDungeon() {
    if (STATE.gamePhase !== "PLAYING") return;
    const stair = STATE.map.stairs.find(s => s.x === STATE.player.x && s.y === STATE.player.y);
    if (!stair) { addLog("Não há entrada aqui.", "#7F8C8D"); return; }
    STATE.gamePhase = "WIN";
    STATE.player.floorsVisited++;
    addLog("✦ Você adentra as Ruínas de Cristal!", "#F1C40F");
    setTimeout(() => showVictory(), 800);
  }

  // ── Inventário ────────────────────────────────────────────────────────────
  toggleInventory() {
    STATE.ui.inventoryOpen = !STATE.ui.inventoryOpen;
    STATE.ui.pauseOpen = false;
    STATE.ui.selectedInventoryIdx = 0;
  }

  selectInventoryItem(idx) {
    STATE.ui.selectedInventoryIdx = idx;
  }

  useSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx = STATE.ui.selectedInventoryIdx;
    const itemId = STATE.player.inventory[idx];
    if (itemId === undefined) return;
    const def = STATE.defs.items[itemId];
    if (!def) return;

    if (def.type === "consumable") {
      if (def.effect === "heal") {
        const healed = Math.min(def.value, STATE.player.maxHp - STATE.player.hp);
        STATE.player.hp = Math.min(STATE.player.maxHp, STATE.player.hp + def.value);
        addLog(`Você usa ${def.name}. +${healed} HP.`, "#2ECC71");
      }
      STATE.player.inventory.splice(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
    } else if (def.type === "weapon") {
      // Desequipa o anterior de volta ao inventário se houver
      const prev = STATE.player.equipment.weapon;
      if (prev && prev !== itemId) {
        STATE.player.inventory.push(prev);
        addLog(`Você desequipa ${STATE.defs.items[prev]?.name}.`, "#7F8C8D");
      }
      STATE.player.equipment.weapon = itemId;
      STATE.player.inventory.splice(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
      addLog(`Você equipa ${def.name}. +${def.attackBonus || 0} ataque.`, "#D4AC0D");
    } else if (def.type === "armor") {
      const prev = STATE.player.equipment.offhand;
      if (prev && prev !== itemId) {
        STATE.player.inventory.push(prev);
        addLog(`Você desequipa ${STATE.defs.items[prev]?.name}.`, "#7F8C8D");
      }
      STATE.player.equipment.offhand = itemId;
      STATE.player.inventory.splice(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
      addLog(`Você equipa ${def.name}. +${def.defenseBonus || 0} defesa.`, "#E67E22");
    } else {
      addLog(`${def.name}: ${def.description || "Não pode ser usado diretamente."}`, "#7F8C8D");
    }
  }

  dropSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx = STATE.ui.selectedInventoryIdx;
    const itemId = STATE.player.inventory[idx];
    if (itemId === undefined) return;
    const def = STATE.defs.items[itemId];
    STATE.player.inventory.splice(idx, 1);
    STATE.map.items.push({ defId: itemId, x: STATE.player.x, y: STATE.player.y, id: `drop_${Date.now()}` });
    STATE.ui.selectedInventoryIdx = Math.max(0, Math.min(idx, STATE.player.inventory.length - 1));
    addLog(`Você larga ${def?.name || itemId}.`, "#7F8C8D");
  }

  unequipSlot(slot) {
    const itemId = STATE.player.equipment[slot];
    if (!itemId) return;
    if (STATE.player.inventory.length >= STATE.player.maxInventory) {
      addLog("Inventário cheio para desequipar!", "#E74C3C"); return;
    }
    STATE.player.inventory.push(itemId);
    STATE.player.equipment[slot] = null;
    const def = STATE.defs.items[itemId];
    addLog(`Você desequipa ${def?.name || itemId}.`, "#7F8C8D");
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  selectSkill(skillId) {
    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.inventoryOpen || STATE.ui.pauseOpen) return;
    const def = STATE.defs.skills[skillId];
    if (!def) return;

    if (STATE.player.skillCooldowns[skillId] > 0) {
      showNotification(`${def.name} em recarga! (${STATE.player.skillCooldowns[skillId]} turnos)`, "#E74C3C");
      return;
    }
    if (STATE.player.energy < def.energyCost) {
      showNotification("Energia insuficiente!", "#E74C3C"); return;
    }

    if (STATE.ui.selectedSkill === skillId) {
      // Segunda pressão cancela
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      addLog("Ação cancelada.", "#7F8C8D");
      return;
    }

    STATE.ui.selectedSkill = skillId;

    if (def.targetType === "self") {
      activateSkill(skillId, STATE.player.x, STATE.player.y);
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      this._endPlayerTurn();
    } else {
      STATE.ui.targetingMode = true;
      addLog(`${def.name}: mova o cursor e clique, ou aperte [${def.key}] de novo p/ cancelar.`, "#F1C40F");
    }
  }

  activateSkillOnTarget(x, y) {
    const skillId = STATE.ui.selectedSkill;
    if (!skillId) return;
    activateSkill(skillId, x, y);
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    this._endPlayerTurn();
  }

  cancelTargeting() {
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    addLog("Ação cancelada.", "#7F8C8D");
  }

  // ── Menu de Pausa ─────────────────────────────────────────────────────────
  togglePause() {
    if (STATE.gamePhase !== "PLAYING") return;
    STATE.ui.pauseOpen = !STATE.ui.pauseOpen;
    STATE.ui.inventoryOpen = false;
    STATE.ui.targetingMode = false;
    STATE.ui.selectedSkill = null;
  }

  pauseSave() {
    exportSave();
  }

  pauseLoad() {
    document.getElementById("file-input-pause").click();
  }

  // ── Tile Info (clique no mapa) ─────────────────────────────────────────────
  inspectTile(wx, wy) {
    const tile = STATE.map.tiles[wy]?.[wx];
    if (!tile || !tile.explored) { STATE.ui.tileInfo = null; return; }
    const entity = tile.visible ? STATE.map.entities.find(e => e.x === wx && e.y === wy && e.hp > 0) : null;
    const item = tile.visible ? STATE.map.items.find(i => i.x === wx && i.y === wy) : null;
    STATE.ui.tileInfo = { tile, entity, item, x: wx, y: wy };
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  bindInput() {
    document.addEventListener("keydown", (e) => this.onKey(e));
    const canvas = document.getElementById("game-canvas");
    canvas.addEventListener("click", (e) => this.onCanvasClick(e));
    canvas.addEventListener("mousemove", (e) => this.onCanvasHover(e));
    canvas.addEventListener("mouseleave", () => { STATE.ui.hoverTile = null; });
  }

  getTileFromMouseEvent(e) {
    const canvas = document.getElementById("game-canvas");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const cw = canvas.width / STATE.camera.width;
    const ch = canvas.height / STATE.camera.height;
    const cx = Math.floor(px / cw);
    const cy = Math.floor(py / ch);
    return { wx: STATE.camera.x + cx, wy: STATE.camera.y + cy };
  }

  onCanvasClick(e) {
    const { wx, wy } = this.getTileFromMouseEvent(e);
    if (STATE.ui.targetingMode) {
      this.activateSkillOnTarget(wx, wy);
    } else {
      this.inspectTile(wx, wy);
    }
  }

  onCanvasHover(e) {
    const { wx, wy } = this.getTileFromMouseEvent(e);
    STATE.ui.hoverTile = { wx, wy };
  }

  onKey(e) {
    // Pausa: ESC abre/fecha, independente de tudo
    if (e.key === "Escape") {
      if (STATE.gamePhase === "PLAYING") {
        if (STATE.ui.targetingMode) { this.cancelTargeting(); }
        else if (STATE.ui.inventoryOpen) { this.toggleInventory(); }
        else { this.togglePause(); }
      } else if (STATE.gamePhase === "MENU" || STATE.gamePhase === "DEAD" || STATE.gamePhase === "WIN") {
        // nada
      }
      e.preventDefault(); return;
    }

    // Bloqueia input de jogo se fases não-playing
    if (STATE.gamePhase !== "PLAYING") return;

    // Menu de pausa aberto: só fecha com ESC (já tratado) ou botões
    if (STATE.ui.pauseOpen) return;

    // Inventário aberto
    if (STATE.ui.inventoryOpen) {
      switch (e.key) {
        case "ArrowUp": case "k":
          STATE.ui.selectedInventoryIdx = Math.max(0, STATE.ui.selectedInventoryIdx - 1);
          e.preventDefault(); return;
        case "ArrowDown": case "j":
          STATE.ui.selectedInventoryIdx = Math.min(STATE.player.inventory.length - 1, STATE.ui.selectedInventoryIdx + 1);
          e.preventDefault(); return;
        case "Enter":
          this.useSelectedItem(); e.preventDefault(); return;
        case "d": case "D":
          this.dropSelectedItem(); e.preventDefault(); return;
        case "i": case "I":
          this.toggleInventory(); e.preventDefault(); return;
        case "w": case "W": case "s": case "S": case "a": case "A":
          e.preventDefault(); return; // consome wasd no inventário
      }
      return;
    }

    // Modo targeting: só aceita ESC (já tratado) e teclas de skill para cancelar
    if (STATE.ui.targetingMode) {
      const skMap = { "1": 0, "2": 1, "3": 2, "4": 3 };
      if (skMap[e.key] !== undefined) {
        const sk = STATE.player.skills[skMap[e.key]];
        if (sk === STATE.ui.selectedSkill) { this.cancelTargeting(); e.preventDefault(); }
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp":    case "w": case "W": this.movePlayer(0, -1);  e.preventDefault(); break;
      case "ArrowDown":  case "s": case "S": this.movePlayer(0,  1);  e.preventDefault(); break;
      case "ArrowLeft":  case "a": case "A": this.movePlayer(-1, 0);  e.preventDefault(); break;
      case "ArrowRight": case "d": case "D": this.movePlayer(1,  0);  e.preventDefault(); break;
      // Diagonais numpad
      case "7": this.movePlayer(-1, -1); break;
      case "9": this.movePlayer(1, -1);  break;
      case "1": this.movePlayer(-1, 1);  break;  // cuidado com skills
      case "3": this.movePlayer(1, 1);   break;
      case ".": case "5": this.playerWait(); break;
      case "g": case "G": this.playerPickup(); break;
      case "Enter":       this.enterDungeon(); break;
      case "i": case "I": this.toggleInventory(); break;
      // Skills [Q W E R]
      case "q": case "Q": this.selectSkill(STATE.player.skills[0]); break;
      case "e": case "E": this.selectSkill(STATE.player.skills[1]); break;
      case "r": case "R": this.selectSkill(STATE.player.skills[2]); break;
      case "f": case "F": this.selectSkill(STATE.player.skills[3]); break;
    }
  }

  async loadFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await importSave(file);
      applySave(data, STATE);
      await this.loadDefs();
      STATE.ui.pauseOpen = false;
      STATE.ui.inventoryOpen = false;
      hideOverlay();
      computeFOV(STATE.player.x, STATE.player.y);
      addLog("💾 Save carregado com sucesso!", "#2ECC71");
    } catch (err) {
      showNotification(`Erro: ${err.message}`, "#E74C3C", 3000);
    }
    input.value = "";
  }

  startRenderLoop() {
    const loop = () => {
      render();
      renderHUD();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export default Game;
