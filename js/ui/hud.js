// js/ui/hud.js
// Interface: HUD com barra de status, skills e log de mensagens

import { STATE } from '../core/state.js';

let hudEl, logEl, statsEl, skillsEl, inventoryEl;

function initHUD() {
  hudEl       = document.getElementById("hud");
  logEl       = document.getElementById("message-log");
  statsEl     = document.getElementById("stats-panel");
  skillsEl    = document.getElementById("skills-bar");
  inventoryEl = document.getElementById("inventory-panel");
}

function renderHUD() {
  if (!hudEl) return;
  renderStats();
  renderSkillsBar();
  renderLog();
  renderInventory();
}

// ── Painel de Stats ──────────────────────────────────────────────────────
function renderStats() {
  if (!statsEl) return;
  const p = STATE.player;
  const hpPct = Math.max(0, p.hp / p.maxHp);
  const enPct = Math.max(0, p.energy / p.maxEnergy);
  const xpPct = p.xp / p.xpToNext;

  const hpColor = hpPct > 0.6 ? "#2ECC71" : hpPct > 0.3 ? "#F39C12" : "#E74C3C";

  const wpn = p.equipment.weapon ? STATE.defs.items[p.equipment.weapon]?.name || "—" : "—";
  const off = p.equipment.offhand ? STATE.defs.items[p.equipment.offhand]?.name || "—" : "—";
  const shieldStr = p.activeShield > 0 ? `<span style="color:#8E44AD"> ◆${p.activeShield}</span>` : "";

  statsEl.innerHTML = `
    <div class="stat-name">⚔ <span style="color:#F0E68C">${p.name}</span> <small style="color:#7F8C8D">Nv.${p.level}</small></div>

    <div class="stat-row">
      <span style="color:${hpColor}">❤ HP</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(hpPct*100).toFixed(1)}%;background:${hpColor}"></div>
      </div>
      <span class="bar-label" style="color:${hpColor}">${p.hp}/${p.maxHp}${shieldStr}</span>
    </div>

    <div class="stat-row">
      <span style="color:#5DADE2">⚡ EN</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(enPct*100).toFixed(1)}%;background:#5DADE2"></div>
      </div>
      <span class="bar-label" style="color:#5DADE2">${p.energy}/${p.maxEnergy}</span>
    </div>

    <div class="stat-row">
      <span style="color:#F1C40F">✦ XP</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(xpPct*100).toFixed(1)}%;background:#F1C40F"></div>
      </div>
      <span class="bar-label" style="color:#F1C40F">${p.xp}/${p.xpToNext}</span>
    </div>

    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-label">⚔ Ataque</span><span>${p.attack + (STATE.defs.items[p.equipment.weapon]?.attackBonus || 0)}</span></div>
    <div class="stat-item"><span class="stat-label">🛡 Defesa</span><span>${p.defense + (STATE.defs.items[p.equipment.offhand]?.defenseBonus || 0)}</span></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-label">🗡 Arma</span><span style="color:#D4AC0D">${wpn}</span></div>
    <div class="stat-item"><span class="stat-label">🛡 Escudo</span><span style="color:#E67E22">${off}</span></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-label">Turno</span><span>${STATE.turn}</span></div>
    <div class="stat-item"><span class="stat-label">Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
    <div class="stat-item"><span class="stat-label">Andar</span><span>${p.floorsVisited + 1}</span></div>
  `;
}

// ── Barra de Skills ───────────────────────────────────────────────────────
function renderSkillsBar() {
  if (!skillsEl) return;
  const p = STATE.player;
  const keys = ["1","2","3","4"];

  skillsEl.innerHTML = p.skills.map((skillId, i) => {
    const def = STATE.defs.skills[skillId];
    if (!def) return "";
    const cd = p.skillCooldowns[skillId] || 0;
    const canUse = cd === 0 && p.energy >= def.energyCost;
    const active = STATE.ui.selectedSkill === skillId;

    return `
      <div class="skill-slot ${active ? "skill-active" : ""} ${!canUse ? "skill-disabled" : ""}"
           onclick="window.GAME?.selectSkill('${skillId}')"
           title="${def.description}">
        <div class="skill-key">[${keys[i]}]</div>
        <div class="skill-char" style="color:${def.color}">${def.char}</div>
        <div class="skill-name">${def.name}</div>
        <div class="skill-cost" style="color:#5DADE2">⚡${def.energyCost}</div>
        ${cd > 0 ? `<div class="skill-cd">${cd}</div>` : ""}
      </div>`;
  }).join("");
}

// ── Log de Mensagens ──────────────────────────────────────────────────────
function renderLog() {
  if (!logEl) return;
  const visible = STATE.log.slice(0, 12);
  logEl.innerHTML = visible.map((entry, i) => {
    const opacity = Math.max(0.3, 1 - i * 0.07);
    return `<div class="log-line" style="color:${entry.color};opacity:${opacity}">${entry.text}</div>`;
  }).join("");
}

// ── Inventário ────────────────────────────────────────────────────────────
function renderInventory() {
  if (!inventoryEl) return;
  if (!STATE.ui.inventoryOpen) {
    inventoryEl.style.display = "none";
    return;
  }

  inventoryEl.style.display = "block";
  const p = STATE.player;
  const items = p.inventory;

  inventoryEl.innerHTML = `
    <div class="inv-header">🎒 Inventário (${items.length}/${p.maxInventory}) <small style="color:#7F8C8D">[I] fechar · [↑↓] navegar · [Enter] usar/equipar · [D] largar</small></div>
    ${items.length === 0 ? '<div class="inv-empty" style="color:#7F8C8D">Inventário vazio.</div>' : ""}
    ${items.map((itemId, i) => {
      const def = STATE.defs.items[itemId];
      if (!def) return "";
      const selected = i === STATE.ui.selectedInventoryIdx;
      const isEquipped =
        p.equipment.weapon === itemId ||
        p.equipment.offhand === itemId;
      return `
        <div class="inv-slot ${selected ? "inv-selected" : ""}"
             onclick="window.GAME?.selectInventoryItem(${i})">
          <span style="color:${def.color}">${def.char}</span>
          <span class="inv-name">${def.name}${isEquipped ? ' <span style="color:#F1C40F">[EQ]</span>' : ""}</span>
          <span class="inv-type" style="color:#7F8C8D">${def.type}</span>
        </div>`;
    }).join("")}
    ${p.equipment.weapon || p.equipment.offhand ? `
    <div class="stat-divider"></div>
    <div class="inv-header" style="font-size:0.75rem">Equipado:</div>
    ${p.equipment.weapon ? `<div style="color:#D4AC0D; font-size:0.75rem; padding: 2px 4px">🗡 ${STATE.defs.items[p.equipment.weapon]?.name}</div>` : ""}
    ${p.equipment.offhand ? `<div style="color:#E67E22; font-size:0.75rem; padding: 2px 4px">🛡 ${STATE.defs.items[p.equipment.offhand]?.name}</div>` : ""}
    ` : ""}
  `;
}

export { initHUD, renderHUD };
