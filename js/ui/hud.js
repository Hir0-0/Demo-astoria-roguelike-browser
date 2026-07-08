// js/ui/hud.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-A] renderSkillsBar() — 4 slots fixos Q/W/E/R lidos de skillLoadout[].
//             Slot vazio exibe placeholder clicável. Label fixo LOADOUT_KEYS.
//             Equip/unequip via botão no slot.
//  [v0.0.6-C] renderInventory() — exibe qty por slot; distingue skills de itens.
//             Botão "Equipar Skill" para skills no inventário.
//  [v0.0.6-D] renderStats() — exibe elementType/elementDamage da arma equipada.
//             renderTileInfo() — exibe biomeId do tile atual.
//  [v0.0.6-E] renderCrafting() — painel de crafting com 3 receitas, ingredientes
//             e botão de fabricar.
//  [v0.0.6-F] renderStats() — exibe tier da entrada atual quando em expedição.
//
// Mantidas todas as correções v0.0.5 / v0.0.5.1:
//  [BUG-05] hudEl removido. [BUG-06] closeTileInfo via GAME.
//  [BUG-10] pauseBuilt flag. [BUG-11] labels dinâmicos (agora fixos em LOADOUT_KEYS).
//  [item 3] texto de stairs_up sensível ao depth.

import { STATE, LOADOUT_KEYS, CRAFT_RECIPES, ELEMENTS } from '../core/state.js';
import { MAX_DEPTH } from '../world/mapGen.js';

// Referências cacheadas aos elementos do DOM — populadas em initHUD()
let logEl, statsEl, skillsEl, inventoryEl, pauseEl, tileInfoEl, craftingEl;

function initHUD() {
  logEl       = document.getElementById("message-log");
  statsEl     = document.getElementById("stats-panel");
  skillsEl    = document.getElementById("skills-bar");
  inventoryEl = document.getElementById("inventory-panel");
  pauseEl     = document.getElementById("pause-panel");
  tileInfoEl  = document.getElementById("tile-info");
  // [v0.0.6-E] Painel de crafting — pode ser criado inline se não existir no HTML
  craftingEl  = document.getElementById("crafting-panel");
}

function renderHUD() {
  if (!statsEl) return;
  renderStats();
  renderSkillsBar();
  renderLog();
  renderTileInfo();
  renderInventory();
  renderCrafting();
  renderPause();
}

// ── Stats Panel ───────────────────────────────────────────────────────────────
function renderStats() {
  if (!statsEl) return;
  const p      = STATE.player;
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

  // [v0.0.6-D] Exibe affix elemental da arma equipada se houver
  let weaponHtml;
  if (wpnDef) {
    const elDmg  = wpnDef.elementDamage || 0;
    const elType = wpnDef.elementType   || "physical";
    const elInfo = elDmg > 0
      ? ` <span style="color:${ELEMENTS[elType]?.color || '#BDC3C7'};font-size:0.6rem">+${elDmg} ${ELEMENTS[elType]?.label || elType}</span>`
      : "";
    weaponHtml = `<span style="color:#D4AC0D">${wpnDef.name}${elInfo}</span>`;
  } else {
    weaponHtml = `<span style="color:#4A4A4A">—</span>`;
  }

  // [v0.0.6-F] Tier da entrada ativa quando em expedição
  let expeditionHtml = "";
  if (STATE.dungeon.active) {
    const entranceId = STATE.dungeon.entranceId;
    const prog = entranceId ? (STATE.dungeonProgress[entranceId] || { tier: 1 }) : { tier: 1 };
    expeditionHtml = `
    <div class="stat-divider"></div>
    <div class="stat-item" style="color:#7D3C98">
      <span class="stat-label" style="color:#7D3C98">◆ Expedição</span>
      <span style="color:#9B59B6">Andar ${STATE.dungeon.depth}/${MAX_DEPTH} · Tier ${prog.tier}</span>
    </div>`;
  }

  // [v0.0.6-C] Inventário conta slots usados (não itens totais)
  const invSlots = p.inventory.length;

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
      ${weaponHtml}
    </div>
    <div class="stat-item equip-row" onclick="window.GAME?.unequipSlot('offhand')" title="Clique para desequipar">
      <span class="stat-label">🛡 Escudo</span>
      <span style="color:${offDef ? '#E67E22' : '#4A4A4A'}">${offDef ? offDef.name : '—'}</span>
    </div>

    <div class="stat-divider"></div>

    <div class="stat-item"><span class="stat-label">Turno</span><span>${STATE.turn}</span></div>
    <div class="stat-item"><span class="stat-label">Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
    <div class="stat-item"><span class="stat-label">Andares</span><span>${p.floorsVisited}</span></div>
    <div class="stat-item"><span class="stat-label">Itens</span><span style="color:#D4AC0D">${invSlots}/${p.maxInventory}</span></div>

    ${expeditionHtml}

    <div class="stat-divider"></div>
    <div style="color:#4A4A4A;font-size:0.6rem;text-align:center;line-height:1.6">
      Setas=mover<br>
      Q W E R=4 skills<br>
      G=pegar · I=inventário<br>
      C=crafting · .=esperar<br>
      Enter=entrar · ESC=menu
    </div>
  `;
}

// ── Skills Bar ────────────────────────────────────────────────────────────────
// [v0.0.6-A] 4 slots fixos mapeados a LOADOUT_KEYS (Q/W/E/R).
// Slot vazio exibe placeholder. Clique no char ativa/seleciona a skill.
// Botão "×" desequipa skill de volta ao inventário.
function renderSkillsBar() {
  if (!skillsEl) return;
  const p = STATE.player;

  skillsEl.innerHTML = LOADOUT_KEYS.map((key, i) => {
    const skillId = p.skillLoadout[i];
    const label   = key.toUpperCase();

    if (!skillId) {
      // Slot vazio
      return `
        <div class="skill-slot skill-empty" title="Slot vazio — equipe uma skill do inventário">
          <div class="skill-key">[${label}]</div>
          <div class="skill-char" style="color:#333">·</div>
          <div class="skill-info">
            <div class="skill-name" style="color:#333">vazio</div>
          </div>
        </div>`;
    }

    const def    = STATE.defs.skills[skillId];
    if (!def) return "";
    const cd     = p.skillCooldowns[skillId] || 0;
    const canUse = cd === 0 && p.energy >= def.energyCost;
    const active = STATE.ui.selectedSkill === skillId;

    return `
      <div class="skill-slot ${active ? "skill-active" : ""} ${!canUse ? "skill-disabled" : ""}"
           title="${def.description}&#10;Custo: ${def.energyCost}⚡  Recarga: ${def.cooldown} turnos">
        <div class="skill-key" onclick="window.GAME?.selectSkill(${i})">[${label}]</div>
        <div class="skill-char" style="color:${canUse ? def.color : '#444'}"
             onclick="window.GAME?.selectSkill(${i})">${def.char}</div>
        <div class="skill-info" onclick="window.GAME?.selectSkill(${i})">
          <div class="skill-name">${def.name}</div>
          <div class="skill-cost">⚡${def.energyCost}</div>
        </div>
        <div class="skill-unequip-btn" onclick="window.GAME?.unequipSkillFromLoadout(${i})" title="Desequipar">×</div>
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
  const { player, defs, ui } = STATE;
  const currentTile = STATE.map.tiles[player.y]?.[player.x];

  const TILE_NAMES = {
    grass: "Grama Solar", solar_grass: "Grama Luminosa",
    dry_earth: "Terra Ressecada", rust_ground: "Chão Enferrujado",
    path: "Caminho Antigo", water: "Água",
    ruins_wall: "Muro em Ruínas", vine_wall: "Muro de Vinhas",
    old_tree: "Árvore Antiga", crystal_node: "Nódulo de Cristal",
    solar_panel: "Painel Solar", dungeon_floor: "Piso de Pedra",
    dungeon_wall: "Parede", dungeon_door: "Porta",
    dungeon_pillar: "Pilar Antigo", crystal_floor: "Piso de Cristal",
    lava_crack: "Fenda de Lava", stairs_down: "Descida ›",
    stairs_up: "Subida ‹", exit: "Saída ✦",
    dungeon_entrance: "Entrada de Dungeon ▼"
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
    dungeon_pillar: "Uma coluna que ainda sustenta o teto desmoronado.",
    lava_crack: "Uma fenda incandescente. Melhor não tocar.",
    dungeon_entrance: "Entrada para as Ruínas de Cristal. [Enter] para explorar.",
    stairs_down: STATE.map.type === "overworld"
      ? "Entrada para as Ruínas de Cristal. [Enter] para descer."
      : "Uma passagem mais funda na dungeon. [Enter] para descer.",
    stairs_up: STATE.map.type === "dungeon" && STATE.dungeon.depth === 1
      ? "Retorno para as Planícies Enferrujadas. [Enter] para subir."
      : "Não é possível retornar a andares anteriores nesta expedição.",
    exit: "O coração pulsante das Ruínas. [Enter] para concluir a expedição.",
    dungeon_door: "Uma porta de metal reforçado."
  };

  // [v0.0.6-G] Exibe biomeId do tile atual se disponível
  let biomeHtml = "";
  if (currentTile?.biomeId) {
    const biomeLabels = { plains: "Planícies Enferrujadas", forest: "Floresta de Vinhas", desert: "Deserto de Ferrugem" };
    biomeHtml = `<div class="tile-desc" style="color:#7F8C8D;font-size:0.6rem">Bioma: ${biomeLabels[currentTile.biomeId] || currentTile.biomeId}</div>`;
  }

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
      ${biomeHtml}
    `;
  }

  let clickedHtml = "";
  if (ui.tileInfo) {
    const { tile, entity, item, x, y } = ui.tileInfo;
    const tileName = TILE_NAMES[tile.type] || tile.type;
    const tileDesc = TILE_DESCS[tile.type] || "";

    let entityHtml = "";
    if (entity) {
      const edef = defs.enemies[entity.defId];
      if (edef) {
        const hpPct   = entity.hp / entity.maxHp;
        const hpColor = hpPct > 0.6 ? "#2ECC71" : hpPct > 0.3 ? "#F39C12" : "#E74C3C";
        // [v0.0.6-F] Mostra mult de dificuldade se escalado por tier
        const tierStr = entity.difficultyMult && entity.difficultyMult > 1
          ? ` <span style="color:#E74C3C;font-size:0.55rem">×${entity.difficultyMult.toFixed(1)}</span>` : "";
        entityHtml = `
          <div class="tileinfo-entity">
            <span style="color:${edef.color}">${edef.char}</span>
            <span style="color:${edef.color}">${edef.name}${tierStr}</span>
            <span style="color:${hpColor};font-size:0.65rem">${entity.hp}/${entity.maxHp}❤</span>
          </div>
          <div class="tile-desc" style="color:#BDC3C7">${edef.description || ""}</div>
          <div class="tile-desc">⚔${edef.attack} 🛡${edef.defense || 0} ✦${edef.xp}xp</div>
        `;
      }
    }

    let itemHtml = "";
    if (item) {
      // [v0.0.6-A] Distingue skill drop de item comum no tile info
      const idef = item.kind === "skill"
        ? defs.skills[item.defId]
        : defs.items[item.defId];
      if (idef) {
        const tag = item.kind === "skill" ? "✦ skill" : idef.type;
        // [v0.0.6-D] Mostra affix elemental se presente
        let elemStr = "";
        if (idef.elementDamage > 0) {
          const elColor = ELEMENTS[idef.elementType]?.color || "#BDC3C7";
          elemStr = ` <span style="color:${elColor}">+${idef.elementDamage} ${ELEMENTS[idef.elementType]?.label}</span>`;
        }
        itemHtml = `
          <div class="tileinfo-entity">
            <span style="color:${idef.color}">${idef.char}</span>
            <span style="color:${idef.color}">${idef.name}${elemStr}</span>
            <span class="inv-tag">${tag}</span>
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
      <div class="tile-close" onclick="window.GAME && (window.GAME.closeTileInfo())">✕</div>
    `;
  }

  tileInfoEl.innerHTML = standingHtml + clickedHtml;
}

// ── Inventário ────────────────────────────────────────────────────────────────
// [v0.0.6-C] Exibe qty por slot. [v0.0.6-A] Skills mostram botão "Equipar".
function renderInventory() {
  if (!inventoryEl) return;
  if (!STATE.ui.inventoryOpen) { inventoryEl.style.display = "none"; return; }
  inventoryEl.style.display = "flex";

  const p   = STATE.player;
  const inv = p.inventory; // {itemId, qty}[]
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

  // Detalhe do slot selecionado
  const selSlot = inv[sel];
  const selDef  = selSlot
    ? (STATE.defs.skills[selSlot.itemId] || STATE.defs.items[selSlot.itemId])
    : null;
  const isSkill = selSlot ? !!STATE.defs.skills[selSlot.itemId] : false;

  let detailHtml = "";
  if (selDef && selSlot) {
    // [v0.0.6-D] Tooltip elemental no detalhe
    let elemLine = "";
    if (selDef.elementDamage > 0) {
      const elColor = ELEMENTS[selDef.elementType]?.color || "#BDC3C7";
      elemLine = `<div style="color:${elColor};font-size:0.65rem">+${selDef.elementDamage} ${ELEMENTS[selDef.elementType]?.label || selDef.elementType}</div>`;
    }

    let actionBtn = "";
    if (isSkill) {
      // [v0.0.6-A] Skill no inventário: botão de equipar no loadout
      actionBtn = `<button class="inv-btn inv-btn-use" onclick="window.GAME?.equipSkillToLoadout(${sel})">✦ Equipar skill</button>`;
    } else if (selDef.type === "consumable") {
      actionBtn = `<button class="inv-btn inv-btn-use" onclick="window.GAME?.useSelectedItem()">✦ Usar</button>`;
    } else if (selDef.type === "weapon") {
      actionBtn = `<button class="inv-btn inv-btn-use" onclick="window.GAME?.useSelectedItem()">⚔ Equipar</button>`;
    } else if (selDef.type === "armor") {
      actionBtn = `<button class="inv-btn inv-btn-use" onclick="window.GAME?.useSelectedItem()">🛡 Equipar</button>`;
    } else {
      actionBtn = `<button class="inv-btn inv-btn-use" onclick="window.GAME?.useSelectedItem()">? Usar</button>`;
    }

    detailHtml = `
      <div class="inv-detail">
        <span style="color:${selDef.color};font-size:1.1rem">${selDef.char}</span>
        <div class="inv-detail-info">
          <div style="color:${selDef.color}">${selDef.name}</div>
          <div style="color:#7F8C8D;font-size:0.65rem">${selDef.description || ""}</div>
          ${selDef.attackBonus  ? `<div style="color:#F0B27A;font-size:0.65rem">+${selDef.attackBonus} ataque</div>`  : ""}
          ${selDef.defenseBonus ? `<div style="color:#85C1E9;font-size:0.65rem">+${selDef.defenseBonus} defesa</div>` : ""}
          ${selDef.value        ? `<div style="color:#2ECC71;font-size:0.65rem">+${selDef.value} HP</div>`            : ""}
          ${selDef.energyCost   ? `<div style="color:#5DADE2;font-size:0.65rem">Custo: ${selDef.energyCost}⚡  CD: ${selDef.cooldown}t</div>` : ""}
          ${elemLine}
          ${selSlot.qty > 1 ? `<div style="color:#D4AC0D;font-size:0.65rem">Quantidade: ${selSlot.qty}</div>` : ""}
        </div>
      </div>
      <div class="inv-actions">
        ${actionBtn}
        <button class="inv-btn inv-btn-drop" onclick="window.GAME?.dropSelectedItem()">⬇ Largar</button>
      </div>
    `;
  }

  inventoryEl.innerHTML = `
    <div class="inv-header">
      🎒 Inventário
      <span style="color:#7F8C8D;font-size:0.65rem">${inv.length}/${p.maxInventory}</span>
      <button class="inv-close-btn" onclick="window.GAME?.toggleInventory()">✕</button>
    </div>
    <div class="inv-controls-hint">↑↓ navegar · Enter usar · D largar · I fechar</div>
    ${equippedHtml}
    ${inv.length === 0 ? '<div class="inv-empty">Inventário vazio.</div>' : ""}
    <div class="inv-list">
      ${inv.map((slot, i) => {
        const def = STATE.defs.skills[slot.itemId] || STATE.defs.items[slot.itemId];
        if (!def) return "";
        const isSelected = i === sel;
        const isSkillSlot = !!STATE.defs.skills[slot.itemId];
        // [v0.0.6-C] Exibe qty; skills sempre qty=1 não precisam de badge
        const qtyBadge = (!isSkillSlot && slot.qty > 1)
          ? `<span class="inv-qty">${slot.qty}</span>` : "";
        const typeLabel = isSkillSlot ? "skill" : def.type;
        return `
          <div class="inv-slot ${isSelected ? "inv-selected" : ""}"
               onclick="window.GAME?.selectInventoryItem(${i})">
            <span class="inv-char" style="color:${def.color}">${def.char}</span>
            <span class="inv-name">${def.name}</span>
            ${qtyBadge}
            <span class="inv-tag">${typeLabel}</span>
          </div>`;
      }).join("")}
    </div>
    ${detailHtml}
  `;
}

// ── Crafting Panel ────────────────────────────────────────────────────────────
// [v0.0.6-E] Painel de 3 receitas fixas. Mostra ingredientes e qtd disponível.
// Nota: prévia mínima de crafting — sistema completo vem em fase futura do roadmap.
function renderCrafting() {
  if (!craftingEl) {
    // Cria o elemento inline se não existir no HTML
    craftingEl = document.getElementById("crafting-panel");
    if (!craftingEl) return;
  }
  if (!STATE.ui.craftingOpen) { craftingEl.style.display = "none"; return; }
  craftingEl.style.display = "flex";

  const recipesHtml = CRAFT_RECIPES.map((recipe, i) => {
    const resultDef = STATE.defs.items[recipe.resultId];
    if (!resultDef) return "";

    const ingredientsHtml = recipe.ingredients.map(ing => {
      const ingDef  = STATE.defs.items[ing.itemId];
      const have    = STATE.player.inventory
        .filter(s => s.itemId === ing.itemId)
        .reduce((sum, s) => sum + s.qty, 0);
      const enough  = have >= ing.qty;
      return `
        <div class="craft-ing ${enough ? "craft-ing-ok" : "craft-ing-miss"}">
          <span style="color:${ingDef?.color || '#BDC3C7'}">${ingDef?.char || "?"}</span>
          <span>${ingDef?.name || ing.itemId}</span>
          <span class="craft-ing-qty">${have}/${ing.qty}</span>
        </div>`;
    }).join("");

    const canCraft = recipe.ingredients.every(ing => {
      const have = STATE.player.inventory
        .filter(s => s.itemId === ing.itemId)
        .reduce((sum, s) => sum + s.qty, 0);
      return have >= ing.qty;
    });

    return `
      <div class="craft-recipe">
        <div class="craft-result">
          <span style="color:${resultDef.color};font-size:1rem">${resultDef.char}</span>
          <span style="color:${resultDef.color}">${resultDef.name}</span>
          <span style="color:#7F8C8D;font-size:0.6rem">${resultDef.type}</span>
        </div>
        <div class="craft-desc">${resultDef.description || ""}</div>
        <div class="craft-ings">${ingredientsHtml}</div>
        <button class="craft-btn ${canCraft ? "craft-btn-ok" : "craft-btn-disabled"}"
                onclick="window.GAME?.craftItem(${i})"
                ${canCraft ? "" : "disabled"}>
          ${canCraft ? "✦ Fabricar" : "✗ Materiais insuficientes"}
        </button>
      </div>`;
  }).join("");

  craftingEl.innerHTML = `
    <div class="inv-header">
      ⚙ Crafting
      <span style="color:#7F8C8D;font-size:0.6rem">prévia — sistema completo em breve</span>
      <button class="inv-close-btn" onclick="window.GAME?.toggleCrafting()">✕</button>
    </div>
    <div class="craft-list">${recipesHtml}</div>
  `;
}

// ── Pause Menu ────────────────────────────────────────────────────────────────
let pauseBuilt     = false;
let pauseSubtitleEl = null;

function renderPause() {
  if (!pauseEl) return;
  if (!STATE.ui.pauseOpen) {
    pauseEl.style.display = "none";
    pauseBuilt = false;
    return;
  }
  pauseEl.style.display = "flex";

  if (!pauseBuilt) {
    pauseEl.innerHTML = `
      <div class="pause-box">
        <div class="pause-title">
          <span style="color:#8E44AD">◆</span> PAUSA <span style="color:#8E44AD">◆</span>
        </div>
        <div class="pause-subtitle" id="pause-subtitle"></div>
        <div class="pause-buttons">
          <button class="pause-btn pause-continue" onclick="window.GAME?.togglePause()">▶ Continuar</button>
          <button class="pause-btn" onclick="window.GAME?.pauseSave()">💾 Salvar Jogo</button>
          <button class="pause-btn" onclick="window.GAME?.pauseLoad()">📂 Carregar Save</button>
          <button class="pause-btn pause-menu-btn" onclick="window.GAME?.returnToMenu()">← Menu Principal</button>
        </div>
        <div class="pause-hint">ESC para continuar</div>
        <input type="file" id="file-input-pause" accept=".json" style="display:none"
               onchange="window.GAME?.loadFromFile(this)">
      </div>
    `;
    pauseSubtitleEl = document.getElementById("pause-subtitle");
    pauseBuilt = true;
  }

  if (pauseSubtitleEl) {
    pauseSubtitleEl.textContent =
      `Auroria — Planície Enferrujada · Nv.${STATE.player.level} · T:${STATE.turn}`;
  }
}

export { initHUD, renderHUD };
