// js/ui/menus.js — v0.2.0

import { STATE } from '../core/state.js';

function showMainMenu() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="menu-box">
      <div style="text-align:center;margin-bottom:6px">
        <div class="logo-crystal">◆✦◆</div>
        <div class="logo-title">A U R O R I A</div>
        <div class="logo-sub">Ruínas do Mundo Solar</div>
      </div>

      <pre style="color:#4A7A3C;font-size:9px;line-height:1.25;opacity:0.7;margin:4px 0">
  ≈≈≈·:·#···T···♦···≈≈≈
  ≈·:·:#··r·····s··:·:≈
  :·═══#·G·····r·#═══··
  ·:·T·#·····s···#·T·:·
  ≈·:·:#·crystal·#·:·:≈
  ≈≈≈·:·T·······:·:·≈≈≈</pre>

      <div style="color:#8FBC44;font-size:0.72rem;text-align:center;margin:4px 0;max-width:300px;line-height:1.5">
        Um continente onde cristais solares alimentam máquinas a vapor<br>
        e vinhas solarpunk crescem sobre ruínas de uma civilização perdida.
      </div>

      <div class="menu-buttons">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">✦ Nova Jornada</button>
        <button class="menu-btn menu-btn-secondary" onclick="document.getElementById('file-input').click()">💾 Carregar Save</button>
      </div>

      <div class="menu-controls" style="margin-top:14px">
        <div class="controls-title">CONTROLES</div>
        <div class="controls-grid">
          <span>Mover</span><span>WASD / Setas</span>
          <span>Skills</span><span>Q W E R</span>
          <span>Inventário</span><span>I</span>
          <span>Pegar item</span><span>G</span>
          <span>Aguardar</span><span>. (ponto)</span>
          <span>Entrar dungeon</span><span>Enter</span>
          <span>Menu / Salvar</span><span>ESC</span>
          <span>Inspecionar</span><span>Clique no mapa</span>
        </div>
      </div>

      <div style="color:#333;font-size:0.6rem;margin-top:10px">v0.2.0 · Planície Enferrujada</div>
    </div>
  `;
}

function showGameOver() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  const p = STATE.player;
  overlay.innerHTML = `
    <div class="menu-box">
      <div style="color:#E74C3C;font-size:2.5rem;margin-bottom:4px">☠</div>
      <div class="logo-title" style="color:#E74C3C;font-size:1.6rem">DERROTA</div>
      <div style="color:#7F8C8D;font-size:0.8rem;margin:8px 0;text-align:center">
        ${p.name} caiu nas Planícies Enferrujadas.
      </div>
      <div class="death-stats">
        <div class="death-stat"><span>Nível</span><span style="color:#F0E68C">${p.level}</span></div>
        <div class="death-stat"><span>Turno</span><span style="color:#F0E68C">${STATE.turn}</span></div>
        <div class="death-stat"><span>Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
        <div class="death-stat"><span>Itens</span><span style="color:#D4AC0D">${p.itemsFound}</span></div>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">↺ Tentar Novamente</button>
        <button class="menu-btn menu-btn-secondary" onclick="window.GAME?.returnToMenu()">← Menu Principal</button>
      </div>
    </div>
  `;
}

function showVictory() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  const p = STATE.player;
  overlay.innerHTML = `
    <div class="menu-box">
      <div style="color:#F1C40F;font-size:2.5rem;margin-bottom:4px">✦</div>
      <div class="logo-title" style="color:#F1C40F;font-size:1.6rem">VITÓRIA</div>
      <div style="color:#8FBC44;font-size:0.8rem;margin:8px 0;text-align:center">
        ${p.name} sobreviveu às Planícies Enferrujadas!<br>
        <span style="color:#7F8C8D">Novos biomas aguardam além do horizonte...</span>
      </div>
      <div class="death-stats">
        <div class="death-stat"><span>Nível</span><span style="color:#F0E68C">${p.level}</span></div>
        <div class="death-stat"><span>Turno</span><span style="color:#F0E68C">${STATE.turn}</span></div>
        <div class="death-stat"><span>Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
        <div class="death-stat"><span>HP</span><span style="color:#2ECC71">${p.hp}/${p.maxHp}</span></div>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">✦ Nova Jornada</button>
        <button class="menu-btn menu-btn-secondary" onclick="window.GAME?.returnToMenu()">← Menu Principal</button>
      </div>
    </div>
  `;
}

function hideOverlay() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "none";
}

function showNotification(text, color = "#F1C40F", duration = 2200) {
  const notif = document.getElementById("notification");
  if (!notif) return;
  notif.textContent = text;
  notif.style.color = color;
  notif.style.borderColor = color + "44";
  notif.style.opacity = "1";
  clearTimeout(notif._t);
  notif._t = setTimeout(() => { notif.style.opacity = "0"; }, duration);
}

export { showMainMenu, showGameOver, showVictory, hideOverlay, showNotification };
