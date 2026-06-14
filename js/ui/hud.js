// js/ui/hud.js — v0.2.0
// HUD completo: barras de HP/Energia/XP, skills bar, log, tile info, inventário, pausa

import { STATE } from '../core/state.js';

let hudEl, logEl, statsEl, skillsEl, inventoryEl, pauseEl, tileInfoEl;

function initHUD() {
  hudEl        = document.getElementById("hud");
  logEl        = document.getElementById("message-log");
  statsEl      = document.getElementById("stats-panel");
  skillsEl     = document.getElementById("skills-bar");
  inventoryEl  = document.getElementById("inventory-panel");
  pauseEl      = document.getElementById("pause-panel");
  tileInfoEl   = document.getElementById("tile-info");
}

function renderHUD() {
  if (!hudEl) return;
  renderStats();
  renderSkillsBar();
  renderLog();
  renderTileInfo();
  renderInventory();
  renderPause();
}

// ── Stats Panel ──────────────────────────────────────────────────────────────
function renderStats() {
  if (!statsEl) return;
  const p = STATE.player;
  const hpPct  = Math.max(0, p.hp / p.maxHp);
  const enPct  = Math.max(0, p.energy / p.maxEnergy);
  const xpPct  = Math.min(1, p.xp / p.xpToNext);
  const hpColor = hpPct > 0.6 ? "#2ECC71" : hpPct > 0.3 ? "#F39C12" : "#E74C3C";

  const wpnId  = p.equipment.weapon;
  const offId  = p.equipment.offhand;
  const wpnDef = wpnId ? STATE.defs.items[wpnId] : null;
  const offDef = offId ? STATE.defs.items[offId] : null;

  const atkTotal = p.attack + (wpnDef?.attackBonus || 0);
  const defTotal = p.defense + (offDef?.defenseBonus || 0);
  const shieldStr = p.activeShield > 0
    ? `<span style="color:#8E44AD;font-size:0.6rem"> ◆${p.activeShield}</span>` : "";

  statsEl.innerHTML = `
    <div class="stat-name">
      <span style="color:#F0E68C">@ ${p.name}</span>
      <span style="color:#7F8C8D;font-size:0.65rem"> Nv.${p.level}</span>
    </div>

    <div class="stat-row">
      <span style="color:${hpColor}">❤</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(hpPct*100).toFixed(1)}%;background:${hpColor}"></div></div>
      <span class="bar-label" style="color:${hpColor}">${p.hp}/${p.maxHp}${shieldStr}</span>
    </div>

    <div class="stat-row">
      <span style="color:#5DADE2">⚡</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(enPct*100).toFixed(1)}%;background:#5DADE2"></div></div>
      <span class="bar-label" style="color:#5DADE2">${p.energy}/${p.maxEnergy}</span>
    </div>

    <div class="stat-row">
      <span style="color:#F1C40F">✦</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(xpPct*100).toFixed(1)}%;background:#F1C40F"></div></div>
      <span class="bar-label" style="color:#F1C40F">${p.xp}/${p.xpToNext}</span>
    </div>

    <div class="stat-divider"></div>

    <div class="stat-item"><span class="stat-label">⚔ Ataque</span><span style="color:#F0B27A">${atkTotal}</span></div>
    <div class="stat-item"><span class="stat-label">🛡 Defesa</span><span style="color:#85C1E9">${defTotal}</span></div>

    <div class="stat-divider"></div>

    <div class="stat-item equip-row" onclick="window.GAME?.unequipSlot('weapon')" title="Clique para desequipar">
      <span class="stat-label">🗡 Arma</span>
      <span style="color:${wpnDef ? '#D4AC0D' : '#4A4A4A'}">${wpnDef ? wpnDef.name : '—'}</span>
    </div>
    <div class="stat-item equip-row" onclick="window.GAME?.unequipSlot('offhand')" title="Clique para desequipar">
      <span class="stat-label">🛡 Escudo</span>
      <span style="color:${offDef ? '#E67E22' : '#4A4A4A'}">${offDef ? offDef.name : '—'}</span>
    </div>

    <div class="stat-divider"></div>

    <div class="stat-item"><span class="stat-label">Turno</span><span>${STATE.turn}</span></div>
    <div class="stat-item"><span class="stat-label">Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
    <div class="stat-item"><span class="stat-label">Andar</span><span>${p.floorsVisited + 1}</span></div>
    <div class="stat-item"><span class="stat-label">Itens</span><span style="color:#D4AC0D">${p.inventory.length}/${p.maxInventory}</span></div>

    <div class="stat-divider"></div>
    <div style="color:#4A4A4A;font-size:0.6rem;text-align:center;line-height:1.6">
      WASD/setas=mover<br>
      Q W E R=skills<br>
      G=pegar · I=inventário<br>
      .=esperar · Enter=entrar<br>
      ESC=menu
    </div>
  `;
}

// ── Skills Bar ────────────────────────────────────────────────────────────────
function renderSkillsBar() {
  if (!skillsEl) return;
  const p = STATE.player;
  const keyLabels = ["Q","W","E","R"];

  skillsEl.innerHTML = p.skills.map((skillId, i) => {
    const def = STATE.defs.skills[skillId];
    if (!def) return "";
    const cd = p.skillCooldowns[skillId] || 0;
    const canUse = cd === 0 && p.energy >= def.energyCost;
    const active = STATE.ui.selectedSkill === skillId;

    return `
      <div class="skill-slot ${active ? "skill-active" : ""} ${!canUse ? "skill-disabled" : ""}"
           onclick="window.GAME?.selectSkill('${skillId}')"
           title="${def.description}&#10;Custo: ${def.energyCost}⚡  Recarga: ${def.cooldown} turnos">
        <div class="skill-key">[${keyLabels[i]}]</div>
        <div class="skill-char" style="color:${canUse ? def.color : '#444'}">${def.char}</div>
        <div class="skill-info">
          <div class="skill-name">${def.name}</div>
          <div class="skill-cost">⚡${def.energyCost}</div>
        </div>
        ${cd > 0 ? `<div class="skill-cd-overlay">${cd}</div>` : ""}
      </div>`;
  }).join("");
}

// ── Message Log ───────────────────────────────────────────────────────────────
function renderLog() {
  if (!logEl) return;
  logEl.innerHTML = STATE.log.slice(0, 14).map((entry, i) => {
    const opacity = Math.max(0.25, 1 - i * 0.065);
    return `<div class="log-line" style="color:${entry.color};opacity:${opacity}">${entry.text}</div>`;
  }).join("");
}

// ── Tile Info Panel ───────────────────────────────────────────────────────────
function renderTileInfo() {
  if (!tileInfoEl) return;

  // Descrição do tile que o jogador está pisando (sempre visível)
  const { player, defs, ui } = STATE;
  const currentTile = STATE.map.tiles[player.y]?.[player.x];

  const TILE_NAMES = {
    grass: "Grama Solar", solar_grass: "Grama Luminosa", dry_earth: "Terra Ressecada",
    rust_ground: "Chão Enferrujado", path: "Caminho Antigo", water: "Água",
    ruins_wall: "Muro em Ruínas", vine_wall: "Muro de Vinhas", old_tree: "Árvore Antiga",
    crystal_node: "Nódulo de Cristal", solar_panel: "Painel Solar",
    dungeon_floor: "Piso de Pedra", dungeon_wall: "Parede", dungeon_door: "Porta",
    crystal_floor: "Piso de Cristal", stairs_down: "Descida ›",
    stairs_up: "Subida ‹", exit: "Saída ✦"
  };
  const TILE_DESCS = {
    grass: "Vegetação nutrida por energia solar.",
    solar_grass: "Brotos que brilham com energia fotovoltaica.",
    dry_earth: "Solo endurecido pelo abandono.",
    rust_ground: "Metal oxidado misturado à terra das ruínas.",
    path: "Uma trilha pavimentada que cruzava as planícies.",
    water: "Águas paradas de tom esverdeado.",
    ruins_wall: "Muro de pedra e metal corroído.",
    vine_wall: "Muros tomados por vegetação solarpunk.",
    old_tree: "Uma árvore ancient de raízes profundas.",
    crystal_node: "Cristal solar comprimido. Emite calor sutil.",
    solar_panel: "Painel de captação solar. Ainda funciona parcialmente.",
    dungeon_floor: "Blocos de pedra talhados com precisão mecânica.",
    crystal_floor: "Painéis de cristal solar ainda pulsando.",
    stairs_down: "Entrada para as Ruínas de Cristal. [Enter] para entrar.",
    stairs_up: "Retorno para as planícies acima.",
    dungeon_door: "Uma porta de metal reforçado.",
  };

  let standingHtml = "";
  if (currentTile) {
    const name = TILE_NAMES[currentTile.type] || currentTile.type;
    const desc = TILE_DESCS[currentTile.type] || "";
    standingHtml = `
      <div class="tile-standing">
        <span style="color:${currentTile.color}">${currentTile.char}</span>
        <span class="tile-stand-name">${name}</span>
      </div>
      ${desc ? `<div class="tile-desc">${desc}</div>` : ""}
    `;
  }

  // Info do tile clicado
  let clickedHtml = "";
  if (ui.tileInfo) {
    const { tile, entity, item, x, y } = ui.tileInfo;
    const tileName = TILE_NAMES[tile.type] || tile.type;
    const tileDesc = TILE_DESCS[tile.type] || "";

    let entityHtml = "";
    if (entity) {
      const edef = defs.enemies[entity.defId];
      if (edef) {
        const hpPct = entity.hp / entity.maxHp;
        const hpColor = hpPct > 0.6 ? "#2ECC71" : hpPct > 0.3 ? "#F39C12" : "#E74C3C";
        entityHtml = `
          <div class="tileinfo-entity">
            <span style="color:${edef.color}">${edef.char}</span>
            <span style="color:${edef.color}">${edef.name}</span>
            <span style="color:${hpColor};font-size:0.65rem">${entity.hp}/${entity.maxHp}❤</span>
          </div>
          <div class="tile-desc" style="color:#BDC3C7">${edef.description || ""}</div>
          <div class="tile-desc">⚔${edef.attack} 🛡${edef.defense} ✦${edef.xp}xp</div>
        `;
      }
    }

    let itemHtml = "";
    if (item) {
      const idef = defs.items[item.defId];
      if (idef) {
        itemHtml = `
          <div class="tileinfo-entity">
            <span style="color:${idef.color}">${idef.char}</span>
            <span style="color:${idef.color}">${idef.name}</span>
            <span style="color:#7F8C8D;font-size:0.6rem">${idef.type}</span>
          </div>
          <div class="tile-desc" style="color:#BDC3C7">${idef.description || ""}</div>
        `;
      }
    }

    clickedHtml = `
      <div class="tile-divider"></div>
      <div class="tileinfo-header">Inspecionando (${x},${y})</div>
      <div class="tile-standing">
        <span style="color:${tile.color}">${tile.char}</span>
        <span class="tile-stand-name">${tileName}</span>
      </div>
      ${tileDesc ? `<div class="tile-desc">${tileDesc}</div>` : ""}
      ${entityHtml}
      ${itemHtml}
      ${!entity && !item ? `<div class="tile-desc" style="color:#4A4A4A">Nada de especial.</div>` : ""}
      <div class="tile-close" onclick="STATE_clearTileInfo()">✕</div>
    `;
  }

  tileInfoEl.innerHTML = standingHtml + clickedHtml;
}

// Inventário ──────────────────────────────────────────────────────────────────
function renderInventory() {
  if (!inventoryEl) return;
  if (!STATE.ui.inventoryOpen) {
    inventoryEl.style.display = "none";
    return;
  }
  inventoryEl.style.display = "flex";

  const p = STATE.player;
  const items = p.inventory;
  const sel = STATE.ui.selectedInventoryIdx;

  const wpnId = p.equipment.weapon;
  const offId = p.equipment.offhand;

  const equippedHtml = (wpnId || offId) ? `
    <div class="inv-section-title">— Equipado —</div>
    ${wpnId ? `
      <div class="inv-slot inv-equipped" onclick="window.GAME?.unequipSlot('weapon')">
        <span class="inv-char" style="color:${STATE.defs.items[wpnId]?.color}">${STATE.defs.items[wpnId]?.char}</span>
        <span class="inv-name">${STATE.defs.items[wpnId]?.name}</span>
        <span class="inv-tag" style="color:#D4AC0D">arma</span>
        <span class="inv-hint">clique=desequipar</span>
      </div>` : ""}
    ${offId ? `
      <div class="inv-slot inv-equipped" onclick="window.GAME?.unequipSlot('offhand')">
        <span class="inv-char" style="color:${STATE.defs.items[offId]?.color}">${STATE.defs.items[offId]?.char}</span>
        <span class="inv-name">${STATE.defs.items[offId]?.name}</span>
        <span class="inv-tag" style="color:#E67E22">escudo</span>
        <span class="inv-hint">clique=desequipar</span>
      </div>` : ""}
    <div class="tile-divider"></div>
  ` : "";

  const selDef = items[sel] ? STATE.defs.items[items[sel]] : null;
  const detailHtml = selDef ? `
    <div class="inv-detail">
      <span style="color:${selDef.color};font-size:1.1rem">${selDef.char}</span>
      <div class="inv-detail-info">
        <div style="color:${selDef.color}">${selDef.name}</div>
        <div style="color:#7F8C8D;font-size:0.65rem">${selDef.description || ""}</div>
        ${selDef.attackBonus ? `<div style="color:#F0B27A;font-size:0.65rem">+${selDef.attackBonus} ataque</div>` : ""}
        ${selDef.defenseBonus ? `<div style="color:#85C1E9;font-size:0.65rem">+${selDef.defenseBonus} defesa</div>` : ""}
        ${selDef.value ? `<div style="color:#2ECC71;font-size:0.65rem">+${selDef.value} HP</div>` : ""}
      </div>
    </div>
    <div class="inv-actions">
      <button class="inv-btn inv-btn-use" onclick="window.GAME?.useSelectedItem()">
        ${selDef.type === 'consumable' ? '✦ Usar' : selDef.type === 'weapon' ? '⚔ Equipar' : selDef.type === 'armor' ? '🛡 Equipar' : '? Usar'}
      </button>
      <button class="inv-btn inv-btn-drop" onclick="window.GAME?.dropSelectedItem()">⬇ Largar</button>
    </div>
  ` : "";

  inventoryEl.innerHTML = `
    <div class="inv-header">
      🎒 Inventário
      <span style="color:#7F8C8D;font-size:0.65rem">${items.length}/${p.maxInventory}</span>
      <button class="inv-close-btn" onclick="window.GAME?.toggleInventory()">✕</button>
    </div>
    <div class="inv-controls-hint">↑↓ navegar · Enter usar · D largar · I fechar</div>
    ${equippedHtml}
    ${items.length === 0 ? '<div class="inv-empty">Inventário vazio.</div>' : ""}
    <div class="inv-list">
      ${items.map((itemId, i) => {
        const def = STATE.defs.items[itemId];
        if (!def) return "";
        const isSelected = i === sel;
        return `
          <div class="inv-slot ${isSelected ? "inv-selected" : ""}"
               onclick="window.GAME?.selectInventoryItem(${i})">
            <span class="inv-char" style="color:${def.color}">${def.char}</span>
            <span class="inv-name">${def.name}</span>
            <span class="inv-tag">${def.type}</span>
          </div>`;
      }).join("")}
    </div>
    ${detailHtml}
  `;
}

// Pause Menu ──────────────────────────────────────────────────────────────────
function renderPause() {
  if (!pauseEl) return;
  if (!STATE.ui.pauseOpen) {
    pauseEl.style.display = "none";
    return;
  }
  pauseEl.style.display = "flex";
  pauseEl.innerHTML = `
    <div class="pause-box">
      <div class="pause-title">
        <span style="color:#8E44AD">◆</span>
        PAUSA
        <span style="color:#8E44AD">◆</span>
      </div>
      <div class="pause-subtitle">Auroria — Planície Enferrujada · Nv.${STATE.player.level} · T:${STATE.turn}</div>

      <div class="pause-buttons">
        <button class="pause-btn pause-continue" onclick="window.GAME?.togglePause()">
          ▶ Continuar
        </button>
        <button class="pause-btn" onclick="window.GAME?.pauseSave()">
          💾 Salvar Jogo
        </button>
        <button class="pause-btn" onclick="window.GAME?.pauseLoad()">
          📂 Carregar Save
        </button>
        <button class="pause-btn pause-menu-btn" onclick="window.GAME?.returnToMenu()">
          ← Menu Principal
        </button>
      </div>

      <div class="pause-hint">ESC para continuar</div>

      <input type="file" id="file-input-pause" accept=".json" style="display:none"
             onchange="window.GAME?.loadFromFile(this)">
    </div>
  `;
}

// helper global para fechar tile info
window.STATE_clearTileInfo = () => { STATE.ui.tileInfo = null; };

export { initHUD, renderHUD };
