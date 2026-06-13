// js/ui/menus.js
// Telas de menu: início, game over, vitória

import { STATE } from '../core/state.js';

function showMainMenu() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="menu-box">
      <div class="menu-logo">
        <div class="logo-crystal">◆✦◆</div>
        <div class="logo-title">A U R O R I A</div>
        <div class="logo-sub">Ruínas do Mundo Solar</div>
      </div>

      <div class="menu-ascii-art">
<pre style="color:#5D8A3C;font-size:10px;line-height:1.2">
  ≈≈≈≈≈·:·:·#···T···≈≈≈≈
  ≈≈·:·:·#···♦···T·:·:·≈
  :·═══·#·r···s·#·═══··:
  ·:·T·#·G···r···#·T·:··
  ·:·:·#·····s···#·:·:··
  :·═══·#···♦···#·═══··:
  ≈≈·:·:·T·······:·:·:≈≈
</pre>
      </div>

      <div class="menu-world-desc" style="color:#8FBC44; font-size:0.8rem; margin-bottom: 1rem; text-align:center; max-width: 320px">
        Um continente onde cristais solares alimentam máquinas a vapor<br>
        e vinhas solarpunk crescem sobre as ruínas de uma civilização perdida.
      </div>

      <div class="menu-buttons">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">
          ✦ Nova Jornada
        </button>
        <button class="menu-btn menu-btn-secondary" id="load-btn" onclick="document.getElementById('file-input').click()">
          💾 Carregar Save
        </button>
      </div>

      <input type="file" id="file-input" accept=".json" style="display:none"
             onchange="window.GAME?.loadFromFile(this)">

      <div class="menu-controls">
        <div class="controls-title">Controles</div>
        <div class="controls-grid">
          <span>Mover</span><span style="color:#F0E68C">↑↓←→ / WASD</span>
          <span>Skills</span><span style="color:#F0E68C">1 2 3 4</span>
          <span>Inventário</span><span style="color:#F0E68C">I</span>
          <span>Pegar item</span><span style="color:#F0E68C">G</span>
          <span>Aguardar</span><span style="color:#F0E68C">. (ponto)</span>
          <span>Salvar</span><span style="color:#F0E68C">S</span>
        </div>
      </div>

      <div style="color:#4A4A4A; font-size:0.65rem; margin-top: 1rem">v0.1.0 MVP · Planície Enferrujada</div>
    </div>
  `;
}

function showGameOver() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  const p = STATE.player;
  overlay.innerHTML = `
    <div class="menu-box">
      <div style="color:#E74C3C; font-size:2.5rem; margin-bottom: 0.5rem">☠</div>
      <div class="logo-title" style="color:#E74C3C">DERROTA</div>
      <div style="color:#7F8C8D; margin: 1rem 0; font-size:0.85rem">
        ${p.name} caiu nas Planícies Enferrujadas.
      </div>
      <div class="death-stats">
        <div class="death-stat"><span>Nível</span><span style="color:#F0E68C">${p.level}</span></div>
        <div class="death-stat"><span>Turno</span><span style="color:#F0E68C">${STATE.turn}</span></div>
        <div class="death-stat"><span>Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
        <div class="death-stat"><span>HP restante</span><span style="color:#E74C3C">${Math.max(0, p.hp)}</span></div>
      </div>
      <div class="menu-buttons" style="margin-top: 1.5rem">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">
          ↺ Tentar Novamente
        </button>
        <button class="menu-btn menu-btn-secondary" onclick="window.GAME?.returnToMenu()">
          ← Menu Principal
        </button>
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
      <div style="color:#F1C40F; font-size:2.5rem; margin-bottom: 0.5rem">✦</div>
      <div class="logo-title" style="color:#F1C40F">VITÓRIA!</div>
      <div style="color:#8FBC44; margin: 1rem 0; font-size:0.85rem">
        ${p.name} sobreviveu às Planícies Enferrujadas!<br>
        <small style="color:#7F8C8D">Novos biomas aguardam além do horizonte...</small>
      </div>
      <div class="death-stats">
        <div class="death-stat"><span>Nível</span><span style="color:#F0E68C">${p.level}</span></div>
        <div class="death-stat"><span>Turno</span><span style="color:#F0E68C">${STATE.turn}</span></div>
        <div class="death-stat"><span>Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
        <div class="death-stat"><span>HP restante</span><span style="color:#2ECC71">${p.hp}</span></div>
      </div>
      <div class="menu-buttons" style="margin-top: 1.5rem">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.startNewGame()">
          ✦ Nova Jornada
        </button>
      </div>
    </div>
  `;
}

function hideOverlay() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "none";
}

function showNotification(text, color = "#F1C40F", duration = 2000) {
  const notif = document.getElementById("notification");
  if (!notif) return;
  notif.textContent = text;
  notif.style.color = color;
  notif.style.opacity = "1";
  clearTimeout(notif._timeout);
  notif._timeout = setTimeout(() => {
    notif.style.opacity = "0";
  }, duration);
}

export { showMainMenu, showGameOver, showVictory, hideOverlay, showNotification };
