// js/ui/menus.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-E] Controle "Crafting" (tecla C) adicionado à lista de controles
//             do menu principal. Rodapé de versão atualizado para v0.0.6.
//
// PATCH v0.0.5.1 (reprovação → correção):
//  [item 2] Controles do menu principal ajustados: "Mover" agora lista apenas
//           Setas direcionais (WASD removido do movimento).
//
// NOVO (v0.0.4 → v0.0.5):
//  showExpeditionReturn() substitui showVictory() (que exibia "FIM DO DEMO"
//  ao pisar na escada, antes da dungeon existir de fato). Agora comunica
//  retorno de expedição bem-sucedida — o jogo continua no overworld restaurado,
//  não reinicia nem volta ao menu principal.

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
          <span>Mover</span><span>Setas direcionais</span>
          <span>Skills</span><span>Q W E R</span>
          <span>Inventário</span><span>I</span>
          <span>Crafting</span><span>C</span>
          <span>Pegar item</span><span>G</span>
          <span>Aguardar</span><span>. (ponto)</span>
          <span>Entrar dungeon</span><span>Enter</span>
          <span>Menu / Salvar</span><span>ESC</span>
          <span>Inspecionar</span><span>Clique no mapa</span>
        </div>
      </div>

      <div style="color:#333;font-size:0.6rem;margin-top:10px">v0.0.6 · Planície Enferrujada</div>
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

function showExpeditionReturn() {
  const overlay = document.getElementById("overlay");
  overlay.style.display = "flex";
  const p = STATE.player;
  overlay.innerHTML = `
    <div class="menu-box">
      <div style="color:#F1C40F;font-size:2.5rem;margin-bottom:4px">✦</div>
      <div class="logo-title" style="color:#F1C40F;font-size:1.6rem">EXPEDIÇÃO CONCLUÍDA</div>
      <div style="color:#8FBC44;font-size:0.8rem;margin:8px 0;text-align:center">
        ${p.name} alcançou o coração das Ruínas de Cristal e retorna vitorioso!<br>
        <span style="color:#7F8C8D">As Planícies Enferrujadas aguardam — a jornada continua.</span>
      </div>
      <div class="death-stats">
        <div class="death-stat"><span>Nível</span><span style="color:#F0E68C">${p.level}</span></div>
        <div class="death-stat"><span>Andares</span><span style="color:#F0E68C">${p.floorsVisited}</span></div>
        <div class="death-stat"><span>Abates</span><span style="color:#E74C3C">${p.kills}</span></div>
        <div class="death-stat"><span>HP</span><span style="color:#2ECC71">${p.hp}/${p.maxHp}</span></div>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn menu-btn-primary" onclick="window.GAME?.returnFromExpedition()">✦ Retornar ao Overworld</button>
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

export { showMainMenu, showGameOver, showExpeditionReturn, hideOverlay, showNotification };
