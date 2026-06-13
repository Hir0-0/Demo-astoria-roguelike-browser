// js/core/engine.js
// Motor principal do jogo — orquestra todos os sistemas

import { STATE, addLog, advanceTurn, isPassable, getEntityAt, getItemAt, removeItemFromMap } from './state.js';
import { exportSave, importSave, applySave } from './save.js';
import { generateOverworld, createRNG } from '../world/mapGen.js';
import { computeFOV } from '../systems/fov.js';
import { initRenderer, render } from '../systems/render.js';
import { initHUD, renderHUD } from '../ui/hud.js';
import { playerAttack, processEnemyTurns, activateSkill, tickCooldowns } from '../systems/combat.js';
import { showMainMenu, showGameOver, showVictory, hideOverlay, showNotification } from '../ui/menus.js';

class Game {
  constructor() {
    this.initialized = false;
    this.running = false;
    this._lastRender = 0;
  }

  async init() {
    // Carrega definições dos JSONs
    await this.loadDefs();

    // Inicializa renderer
    const canvas = document.getElementById("game-canvas");
    initRenderer(canvas);

    // Inicializa HUD
    initHUD();

    // Mostra menu principal
    showMainMenu();

    // Input
    this.bindInput();

    // Loop de render (só visual, não tick de jogo)
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

  startNewGame() {
    // Gera seed aleatória
    STATE.seed = Math.floor(Math.random() * 2147483647);
    STATE.turn = 0;
    STATE.gamePhase = "PLAYING";
    STATE.log = [];

    // Reseta jogador
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
      floorsVisited: 0,
      kills: 0,
      itemsFound: 0
    });

    // Gera mundo
    const result = generateOverworld(STATE.seed, STATE.map.width, STATE.map.height);
    STATE.map.type = "overworld";
    STATE.map.id = "rusted_plains";
    STATE.map.tiles = result.tiles;
    STATE.map.entities = result.entities;
    STATE.map.items = result.items;
    STATE.map.stairs = result.stairs;
    STATE.map.entrance = result.entrance;

    // Posiciona jogador
    STATE.player.x = result.spawnX;
    STATE.player.y = result.spawnY;

    // FOV inicial
    computeFOV(STATE.player.x, STATE.player.y);

    hideOverlay();

    addLog("✦ Bem-vindo às Planícies Enferrujadas de Auroria.", "#F1C40F");
    addLog("Cristais solares pulsam ao seu redor. O ar cheira a vapor e vegetação.", "#8FBC44");
    addLog("Use WASD/setas para mover. [I] inventário. [S] salvar.", "#7F8C8D");
  }

  returnToMenu() {
    STATE.gamePhase = "MENU";
    showMainMenu();
  }

  // ── Movimento e ação do jogador ──────────────────────────────────────────
  movePlayer(dx, dy) {
    if (STATE.gamePhase !== "PLAYING") return;
    if (STATE.ui.targetingMode) return;

    const nx = STATE.player.x + dx;
    const ny = STATE.player.y + dy;

    // Verifica se tem entidade (bump to attack)
    const entity = getEntityAt(nx, ny);
    if (entity && entity.hp > 0) {
      playerAttack(entity);
      advanceTurn();
      tickCooldowns();
      processEnemyTurns();
      computeFOV(STATE.player.x, STATE.player.y);
      this.checkGameOver();
      return;
    }

    // Verifica passabilidade
    if (!isPassable(nx, ny)) {
      return;
    }

    // Move
    STATE.player.x = nx;
    STATE.player.y = ny;

    // Verifica item no chão
    const item = getItemAt(nx, ny);
    if (item) {
      const def = STATE.defs.items[item.defId];
      addLog(`Você vê ${def?.name || item.defId} no chão. [G] para pegar.`, "#BDC3C7");
    }

    // Verifica escada
    const stair = STATE.map.stairs.find(s => s.x === nx && s.y === ny);
    if (stair) {
      addLog("✦ Você encontra a entrada para as Ruínas de Cristal!", "#F1C40F");
      addLog("[Enter] para entrar na dungeon.", "#7F8C8D");
    }

    // Avança turno e processa IA
    advanceTurn();
    tickCooldowns();
    processEnemyTurns();
    computeFOV(STATE.player.x, STATE.player.y);
    this.checkGameOver();
  }

  playerWait() {
    if (STATE.gamePhase !== "PLAYING") return;
    addLog("Você aguarda...", "#7F8C8D");
    advanceTurn();
    tickCooldowns();
    processEnemyTurns();
    computeFOV(STATE.player.x, STATE.player.y);
    this.checkGameOver();
  }

  playerPickup() {
    if (STATE.gamePhase !== "PLAYING") return;
    const { x, y } = STATE.player;
    const item = getItemAt(x, y);
    if (!item) {
      addLog("Não há nada para pegar aqui.", "#7F8C8D");
      return;
    }

    if (STATE.player.inventory.length >= STATE.player.maxInventory) {
      addLog("Inventário cheio!", "#E74C3C");
      return;
    }

    const def = STATE.defs.items[item.defId];
    removeItemFromMap(x, y);
    STATE.player.inventory.push(item.defId);
    STATE.player.itemsFound++;
    addLog(`Você pegou: ${def?.name || item.defId}.`, "#D4AC0D");

    advanceTurn();
    tickCooldowns();
    processEnemyTurns();
    computeFOV(STATE.player.x, STATE.player.y);
    this.checkGameOver();
  }

  enterDungeon() {
    if (STATE.gamePhase !== "PLAYING") return;
    const stair = STATE.map.stairs.find(s => s.x === STATE.player.x && s.y === STATE.player.y);
    if (!stair) {
      addLog("Não há entrada aqui.", "#7F8C8D");
      return;
    }
    // MVP: vitória ao chegar na dungeon
    STATE.gamePhase = "WIN";
    STATE.player.floorsVisited++;
    addLog("✦ Você adentra as Ruínas de Cristal... Vitória!", "#F1C40F");
    setTimeout(() => showVictory(), 800);
  }

  // ── Inventário ────────────────────────────────────────────────────────────
  toggleInventory() {
    STATE.ui.inventoryOpen = !STATE.ui.inventoryOpen;
    STATE.ui.selectedInventoryIdx = 0;
  }

  selectInventoryItem(idx) {
    STATE.ui.selectedInventoryIdx = idx;
  }

  useSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx = STATE.ui.selectedInventoryIdx;
    const itemId = STATE.player.inventory[idx];
    if (!itemId) return;

    const def = STATE.defs.items[itemId];
    if (!def) return;

    if (def.type === "consumable") {
      if (def.effect === "heal") {
        STATE.player.hp = Math.min(STATE.player.maxHp, STATE.player.hp + def.value);
        addLog(`Você usa ${def.name}. +${def.value} HP.`, "#2ECC71");
      }
      STATE.player.inventory.splice(idx, 1);
      STATE.ui.selectedInventoryIdx = Math.max(0, idx - 1);
    } else if (def.type === "weapon") {
      STATE.player.equipment.weapon = itemId;
      addLog(`Você equipa ${def.name}.`, "#D4AC0D");
    } else if (def.type === "armor") {
      STATE.player.equipment.offhand = itemId;
      addLog(`Você equipa ${def.name}.`, "#E67E22");
    } else {
      addLog(`${def.name} não pode ser usado diretamente.`, "#7F8C8D");
    }

    advanceTurn();
    tickCooldowns();
    processEnemyTurns();
    computeFOV(STATE.player.x, STATE.player.y);
  }

  dropSelectedItem() {
    if (!STATE.ui.inventoryOpen) return;
    const idx = STATE.ui.selectedInventoryIdx;
    const itemId = STATE.player.inventory[idx];
    if (!itemId) return;
    const def = STATE.defs.items[itemId];
    STATE.player.inventory.splice(idx, 1);
    STATE.map.items.push({ defId: itemId, x: STATE.player.x, y: STATE.player.y, id: `drop_${Date.now()}` });
    addLog(`Você larga ${def?.name || itemId}.`, "#7F8C8D");
    STATE.ui.selectedInventoryIdx = Math.max(0, idx - 1);
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  selectSkill(skillId) {
    const def = STATE.defs.skills[skillId];
    if (!def) return;

    if (STATE.player.skillCooldowns[skillId] > 0) {
      showNotification(`${def.name} em recarga!`, "#E74C3C");
      return;
    }
    if (STATE.player.energy < def.energyCost) {
      showNotification("Energia insuficiente!", "#E74C3C");
      return;
    }

    if (STATE.ui.selectedSkill === skillId) {
      // Segunda pressão: cancela ou usa em self
      if (def.targetType === "self") {
        activateSkill(skillId, STATE.player.x, STATE.player.y);
        this.checkGameOver();
      }
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      return;
    }

    STATE.ui.selectedSkill = skillId;

    if (def.targetType === "self") {
      // Self-target: usa imediatamente
      activateSkill(skillId, STATE.player.x, STATE.player.y);
      STATE.ui.selectedSkill = null;
      this.checkGameOver();
    } else {
      // Requer targeting
      STATE.ui.targetingMode = true;
      addLog(`${def.name}: clique no alvo ou pressione [${def.key}] de novo para cancelar.`, "#F1C40F");
    }
  }

  activateSkillOnTarget(x, y) {
    const skillId = STATE.ui.selectedSkill;
    if (!skillId) return;
    activateSkill(skillId, x, y);
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    this.checkGameOver();
  }

  cancelTargeting() {
    STATE.ui.selectedSkill = null;
    STATE.ui.targetingMode = false;
    addLog("Ação cancelada.", "#7F8C8D");
  }

  // ── Check de game over ────────────────────────────────────────────────────
  checkGameOver() {
    if (STATE.gamePhase === "DEAD") {
      setTimeout(() => showGameOver(), 800);
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  bindInput() {
    document.addEventListener("keydown", (e) => this.onKey(e));

    // Click no canvas para targeting
    const canvas = document.getElementById("game-canvas");
    canvas.addEventListener("click", (e) => this.onCanvasClick(e));
  }

  onKey(e) {
    if (STATE.gamePhase === "DEAD" || STATE.gamePhase === "WIN" || STATE.gamePhase === "MENU") return;

    // Inventário aberto: navegar com setas
    if (STATE.ui.inventoryOpen) {
      switch (e.key) {
        case "ArrowUp":   case "w": case "W":
          STATE.ui.selectedInventoryIdx = Math.max(0, STATE.ui.selectedInventoryIdx - 1);
          e.preventDefault(); return;
        case "ArrowDown": case "s": case "S":
          STATE.ui.selectedInventoryIdx = Math.min(STATE.player.inventory.length - 1, STATE.ui.selectedInventoryIdx + 1);
          e.preventDefault(); return;
        case "Enter":
          this.useSelectedItem();
          e.preventDefault(); return;
        case "d": case "D":
          this.dropSelectedItem();
          e.preventDefault(); return;
        case "i": case "I": case "Escape":
          this.toggleInventory();
          e.preventDefault(); return;
      }
    }

    // Modo de targeting: Escape cancela
    if (STATE.ui.targetingMode && e.key === "Escape") {
      this.cancelTargeting();
      return;
    }

    // Cancela skill repetindo a tecla
    if (STATE.ui.targetingMode) {
      const skillKeys = { "1": 0, "2": 1, "3": 2, "4": 3 };
      if (skillKeys[e.key] !== undefined) {
        const skillId = STATE.player.skills[skillKeys[e.key]];
        if (skillId === STATE.ui.selectedSkill) {
          this.cancelTargeting();
          return;
        }
      }
    }

    switch (e.key) {
      // Movimento
      case "ArrowUp":    case "w": case "W": this.movePlayer(0, -1);  e.preventDefault(); break;
      case "ArrowDown":  case "s": case "S": this.movePlayer(0,  1);  e.preventDefault(); break;
      case "ArrowLeft":  case "a": case "A": this.movePlayer(-1, 0);  e.preventDefault(); break;
      case "ArrowRight": case "d": case "D": this.movePlayer(1,  0);  e.preventDefault(); break;

      // Diagonais
      case "q": case "Q": this.movePlayer(-1, -1); break;
      case "e": case "E": this.movePlayer(1, -1);  break;
      case "z": case "Z": this.movePlayer(-1, 1);  break;
      case "c": case "C": this.movePlayer(1, 1);   break;

      // Ações
      case ".": this.playerWait(); break;
      case "g": case "G": this.playerPickup(); break;
      case "Enter": this.enterDungeon(); break;
      case "i": case "I": this.toggleInventory(); break;

      // Skills
      case "1": this.selectSkill(STATE.player.skills[0]); break;
      case "2": this.selectSkill(STATE.player.skills[1]); break;
      case "3": this.selectSkill(STATE.player.skills[2]); break;
      case "4": this.selectSkill(STATE.player.skills[3]); break;

      // Save
      case "s": case "S":
        if (!STATE.ui.inventoryOpen) exportSave();
        break;

      case "Escape":
        if (STATE.ui.targetingMode) this.cancelTargeting();
        else if (STATE.ui.inventoryOpen) this.toggleInventory();
        break;
    }
  }

  onCanvasClick(e) {
    if (!STATE.ui.targetingMode) return;
    const canvas = document.getElementById("game-canvas");
    const rect = canvas.getBoundingClientRect();

    // Calcula posição do tile pelo tamanho da câmera
    const cw = canvas.width / STATE.camera.width;
    const ch = canvas.height / STATE.camera.height;

    const cx = Math.floor((e.clientX - rect.left) / cw);
    const cy = Math.floor((e.clientY - rect.top) / ch);
    const wx = STATE.camera.x + cx;
    const wy = STATE.camera.y + cy;

    this.activateSkillOnTarget(wx, wy);
  }

  async loadFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await importSave(file);
      applySave(data, STATE);
      await this.loadDefs(); // Recarrega defs (seguro, são imutáveis)
      hideOverlay();
      computeFOV(STATE.player.x, STATE.player.y);
      addLog("💾 Save carregado com sucesso!", "#2ECC71");
    } catch (err) {
      showNotification(`Erro: ${err.message}`, "#E74C3C", 3000);
      console.error(err);
    }
    input.value = "";
  }

  // ── Render loop (rAF — 60fps visual, turno-based para lógica) ─────────────
  startRenderLoop() {
    const loop = (timestamp) => {
      render();
      renderHUD();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export default Game;
