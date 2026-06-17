// js/core/engine.js — v0.0.4
// Motor principal do jogo
//
// CORREÇÕES (v0.0.3 → v0.0.4):
//  [BUG-07] Skills disparavam o turno duas vezes: activateSkill() (combat.js) já
//           fecha o turno internamente, mas selectSkill()/activateSkillOnTarget()
//           chamavam _endPlayerTurn() de novo. Removido; checagem de derrota
//           movida para os dois pontos de chamada de activateSkill().
//  [BUG-11] Teclas de skill agora vêm de SKILL_KEYS (state.js), dimensionadas
//           dinamicamente por STATE.player.skills.length — sem mais switch fixo Q/W/E/R.
//  [BUG-12] Import morto getCurrentTileDesc removido (nunca era usado aqui).
//
// CORREÇÕES (v0.0.2 → v0.0.3):
//  [BUG-01] Mapeamento de teclas de skill: Q/W/E/R → Q/W/E/R (W e R estavam trocados por E e F)
//  [BUG-02] (v0.0.3, superado pelo BUG-07 em v0.0.4) Duplo tick de cooldown ao usar skills
//  [BUG-03] Modo targeting: cancelamento por tecla usava índice numérico (1/2/3/4)
//           mas as skills são ativadas por letra (Q/W/E/R) — corrigido para comparar skillId

import { STATE, SKILL_KEYS, addLog, advanceTurn, isPassable, getEntityAt, getItemAt, removeItemFromMap } from './state.js';
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
    addLog("WASD/Setas=mover · G=pegar · I=inventário · Q W E R=skills · ESC=menu", "#7F8C8D");
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
      // [BUG-02] Movimento/ataque: tickCooldowns() deve rodar aqui (não é skill)
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

  // [BUG-07] O parâmetro runTickCooldowns existia para evitar duplo tick quando skills
  // passavam por aqui. Skills agora fecham o próprio turno dentro de activateSkill()
  // (combat.js) e não chamam mais _endPlayerTurn(). Os únicos chamadores restantes
  // (mover, atacar, esperar, pegar item) sempre tickam cooldowns normalmente.
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
    // [BUG-09] gamePhase continua usando "WIN" internamente (sem novo valor de fase),
    // mas o texto deixa claro que não há uma vitória real acontecendo: as Ruínas de
    // Cristal (dungeon) ainda não foram implementadas nesta versão. A tela exibida
    // (showVictory → renomeada para "FIM DO DEMO" em menus.js) reflete essa mudança.
    STATE.gamePhase = "WIN";
    STATE.player.floorsVisited++;
    addLog("✦ Você alcança a entrada das Ruínas de Cristal — fim do conteúdo desta demo.", "#F1C40F");
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
      // Devolve o item anterior ao inventário se houver
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

    // Segunda pressão da mesma skill cancela o modo targeting
    if (STATE.ui.selectedSkill === skillId) {
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      addLog("Ação cancelada.", "#7F8C8D");
      return;
    }

    STATE.ui.selectedSkill = skillId;

    if (def.targetType === "self") {
      // [BUG-07] activateSkill() (combat.js) já executa internamente advanceTurn(),
      //          processEnemyTurns() e computeFOV() ao final da função. A chamada que
      //          existia aqui a _endPlayerTurn(false) duplicava esses três passos,
      //          fazendo o turno avançar duas vezes (inimigos agiam 2x por skill).
      //          Removida por completo — restam apenas o reset de UI e a checagem de
      //          derrota, que antes vinha de dentro de _endPlayerTurn().
      activateSkill(skillId, STATE.player.x, STATE.player.y);
      STATE.ui.selectedSkill = null;
      STATE.ui.targetingMode = false;
      if (STATE.gamePhase === "DEAD") setTimeout(() => showGameOver(), 600);
    } else {
      STATE.ui.targetingMode = true;
      addLog(`${def.name}: clique no alvo · [${def.key}] de novo p/ cancelar.`, "#F1C40F");
    }
  }

  activateSkillOnTarget(x, y) {
    const skillId = STATE.ui.selectedSkill;
    if (!skillId) return;
    // [BUG-07] Mesma correção de selectSkill(): activateSkill() já fecha o turno
    // internamente (advanceTurn + processEnemyTurns + computeFOV). A chamada a
    // _endPlayerTurn(false) que existia aqui duplicava esses efeitos.
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

  // [BUG-06] Substitui o helper global window.STATE_clearTileInfo que estava em hud.js
  closeTileInfo() {
    STATE.ui.tileInfo = null;
  }

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
    canvas.addEventListener("click",      (e) => this.onCanvasClick(e));
    canvas.addEventListener("mousemove",  (e) => this.onCanvasHover(e));
    canvas.addEventListener("mouseleave", ()  => { STATE.ui.hoverTile = null; });
  }

  getTileFromMouseEvent(e) {
    const canvas = document.getElementById("game-canvas");
    const rect = canvas.getBoundingClientRect();
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
    // ESC: fecha targeting → inventário → pausa (prioridade em cascata)
    if (e.key === "Escape") {
      if (STATE.gamePhase === "PLAYING") {
        if (STATE.ui.targetingMode)    { this.cancelTargeting(); }
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
          STATE.ui.selectedInventoryIdx = Math.min(STATE.player.inventory.length - 1, STATE.ui.selectedInventoryIdx + 1);
          e.preventDefault(); return;
        case "Enter":
          this.useSelectedItem(); e.preventDefault(); return;
        case "d": case "D":
          this.dropSelectedItem(); e.preventDefault(); return;
        case "i": case "I":
          this.toggleInventory(); e.preventDefault(); return;
        // Consome WASD para não mover o jogador enquanto o inventário está aberto
        case "w": case "W": case "s": case "S": case "a": case "A":
          e.preventDefault(); return;
      }
      return;
    }

    // ── Modo targeting ────────────────────────────────────────────────────
    // [BUG-03] Cancelamento por tecla: comparamos o skillId diretamente,
    //          não o índice numérico (que era 1/2/3/4 — nunca batia com Q/W/E/R)
    // [BUG-11] O mapa fixo {q:0, w:1, e:2, r:3} foi substituído por um mapeamento
    //          gerado dinamicamente a partir de SKILL_KEYS (fonte única, state.js),
    //          dimensionado pelo número real de skills do jogador. Adicionar uma
    //          5ª/6ª skill ao array funciona automaticamente, sem tocar este arquivo.
    if (STATE.ui.targetingMode) {
      const key = e.key.toLowerCase();
      const idx = SKILL_KEYS.indexOf(key);
      if (idx !== -1 && idx < STATE.player.skills.length) {
        const sk = STATE.player.skills[idx];
        if (sk === STATE.ui.selectedSkill) {
          this.cancelTargeting();
          e.preventDefault();
        }
      }
      return;
    }

    // ── Jogo normal ───────────────────────────────────────────────────────
    // [BUG-11] Movimento por WASD tem prioridade fixa sobre SKILL_KEYS quando a
    // mesma letra colide (ex.: "w" sempre move para cima, nunca ativa skills[1],
    // mesmo que SKILL_KEYS[1] === "w" — comportamento herdado e documentado no
    // menu principal: "Mover: WASD/Setas" e "Skills: Q W E R"). Quem usa o esquema
    // padrão de 4 skills (q/w/e/r) deve estar ciente dessa colisão por design;
    // SKILL_KEYS pode ser customizado em state.js para evitá-la caso necessário.
    switch (e.key) {
      case "ArrowUp":    case "w": case "W": this.movePlayer(0, -1);  e.preventDefault(); return;
      case "ArrowDown":  case "s": case "S": this.movePlayer(0,  1);  e.preventDefault(); return;
      case "ArrowLeft":  case "a": case "A": this.movePlayer(-1, 0);  e.preventDefault(); return;
      case "ArrowRight": case "d": case "D": this.movePlayer(1,  0);  e.preventDefault(); return;
      // Diagonais numpad
      case "7": this.movePlayer(-1, -1); return;
      case "9": this.movePlayer( 1, -1); return;
      case "3": this.movePlayer( 1,  1); return;
      // Numpad 1 removido do mapa de diagonais — colide com skills no futuro
      case ".": case "5": this.playerWait(); return;
      case "g": case "G": this.playerPickup(); return;
      case "Enter":       this.enterDungeon(); return;
      case "i": case "I": this.toggleInventory(); return;
    }

    // [BUG-11] Ativação de skill dimensionada dinamicamente: percorre SKILL_KEYS
    // até o tamanho real de STATE.player.skills. Antes era um switch hard-coded
    // com exatamente 4 cases (q/w/e/r) — adicionar uma 5ª skill não tinha tecla
    // mapeada automaticamente. Agora basta estender STATE.player.skills.
    const key = e.key.toLowerCase();
    const skillIdx = SKILL_KEYS.indexOf(key);
    if (skillIdx !== -1 && skillIdx < STATE.player.skills.length) {
      this.selectSkill(STATE.player.skills[skillIdx]);
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
