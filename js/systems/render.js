// js/systems/render.js
// Renderizador ASCII com câmera seguindo o jogador

import { STATE } from '../core/state.js';

let canvas, ctx;
let CELL_W = 12, CELL_H = 18;
let FONT = `${CELL_H}px "Courier New", "Lucida Console", monospace`;

// Paleta de cores de memória (tiles explorados mas não visíveis)
const MEMORY_DARKEN = 0.3;

function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  ctx.font = FONT;
  ctx.textBaseline = "top";
  // Detecta tamanho ideal da célula baseado no canvas
  fitCellSize();
}

function fitCellSize() {
  // Mantém proporção fixa: câmera de 60x28 tiles
  const cam = STATE.camera;
  CELL_W = Math.floor(canvas.width / cam.width);
  CELL_H = Math.floor(canvas.height / cam.height);
  FONT = `bold ${CELL_H - 2}px "Courier New", monospace`;
  ctx.font = FONT;
}

function updateCamera() {
  const { player, map, camera } = STATE;
  // Centraliza câmera no jogador
  camera.x = Math.max(0, Math.min(map.width - camera.width, player.x - Math.floor(camera.width / 2)));
  camera.y = Math.max(0, Math.min(map.height - camera.height, player.y - Math.floor(camera.height / 2)));
}

function render() {
  if (!canvas || !ctx) return;
  updateCamera();

  const { map, player, camera } = STATE;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── Renderiza tiles ──────────────────────────────────────────────────────
  for (let cy = 0; cy < camera.height; cy++) {
    for (let cx = 0; cx < camera.width; cx++) {
      const mx = camera.x + cx;
      const my = camera.y + cy;

      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) {
        drawCell(cx, cy, " ", "#000", "#000");
        continue;
      }

      const tile = map.tiles[my]?.[mx];
      if (!tile) continue;

      const px = cx * CELL_W;
      const py = cy * CELL_H;

      if (tile.visible) {
        // Tile visível: cor completa
        ctx.fillStyle = tile.bgColor || "#050505";
        ctx.fillRect(px, py, CELL_W, CELL_H);
        ctx.fillStyle = tile.color;
        ctx.font = FONT;
        ctx.fillText(tile.char, px + 1, py);
      } else if (tile.explored) {
        // Tile na memória: escurecido
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, CELL_W, CELL_H);
        ctx.fillStyle = darkenColor(tile.color, MEMORY_DARKEN);
        ctx.font = FONT;
        ctx.fillText(tile.char, px + 1, py);
      } else {
        // Não explorado: escuridão
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, CELL_W, CELL_H);
      }
    }
  }

  // ── Renderiza itens no chão ───────────────────────────────────────────────
  for (const item of map.items) {
    const cx = item.x - camera.x;
    const cy = item.y - camera.y;
    if (cx < 0 || cy < 0 || cx >= camera.width || cy >= camera.height) continue;
    const tile = map.tiles[item.y]?.[item.x];
    if (!tile?.visible) continue;

    const def = STATE.defs.items[item.defId];
    if (!def) continue;

    const px = cx * CELL_W;
    const py = cy * CELL_H;
    ctx.fillStyle = def.color || "#F1C40F";
    ctx.font = FONT;
    ctx.fillText(def.char, px + 1, py);
  }

  // ── Renderiza entidades ───────────────────────────────────────────────────
  for (const entity of map.entities) {
    if (entity.hp <= 0) continue;
    const cx = entity.x - camera.x;
    const cy = entity.y - camera.y;
    if (cx < 0 || cy < 0 || cx >= camera.width || cy >= camera.height) continue;
    const tile = map.tiles[entity.y]?.[entity.x];
    if (!tile?.visible) continue;

    const def = STATE.defs.enemies[entity.defId];
    if (!def) continue;

    const px = cx * CELL_W;
    const py = cy * CELL_H;

    // Sombra/brilho de fundo para o inimigo
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(px, py, CELL_W, CELL_H);
    ctx.fillStyle = def.color;
    ctx.font = FONT;
    ctx.fillText(def.char, px + 1, py);
  }

  // ── Renderiza jogador ─────────────────────────────────────────────────────
  {
    const cx = player.x - camera.x;
    const cy = player.y - camera.y;
    const px = cx * CELL_W;
    const py = cy * CELL_H;

    // Halo do escudo
    if (player.activeShield > 0) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#8E44AD";
    }
    ctx.fillStyle = player.color;
    ctx.font = `bold ${CELL_H - 2}px "Courier New", monospace`;
    ctx.fillText(player.char, px + 1, py);
    ctx.shadowBlur = 0;
  }

  // ── Efeito de targeting ───────────────────────────────────────────────────
  if (STATE.ui.targetingMode) {
    renderTargetingOverlay();
  }
}

function renderTargetingOverlay() {
  const { camera } = STATE;
  // Pulso visual no modo de targeting (borda do canvas)
  ctx.strokeStyle = "#F1C40F";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function darkenColor(hex, factor) {
  if (!hex || !hex.startsWith("#")) return "#222";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = v => Math.max(0, Math.floor(v * factor)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function drawCell(cx, cy, char, fg, bg) {
  const px = cx * CELL_W;
  const py = cy * CELL_H;
  ctx.fillStyle = bg;
  ctx.fillRect(px, py, CELL_W, CELL_H);
  if (char !== " ") {
    ctx.fillStyle = fg;
    ctx.fillText(char, px + 1, py);
  }
}

// Renderiza uma célula de destaque para targeting
function highlightCell(wx, wy, color = "#F1C40F") {
  const { camera } = STATE;
  const cx = wx - camera.x;
  const cy = wy - camera.y;
  if (cx < 0 || cy < 0 || cx >= camera.width || cy >= camera.height) return;
  const px = cx * CELL_W;
  const py = cy * CELL_H;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL_W - 1, CELL_H - 1);
}

export { initRenderer, render, highlightCell, CELL_W, CELL_H };
