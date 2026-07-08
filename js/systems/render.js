// js/systems/render.js — v0.2.0
// Renderizador ASCII com câmera e hover/targeting visual

import { STATE } from '../core/state.js';

let canvas, ctx;
const MEMORY_FACTOR = 0.28;

function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
}

function getCellSize() {
  return {
    cw: canvas.width  / STATE.camera.width,
    ch: canvas.height / STATE.camera.height
  };
}

function getFont(ch) {
  return `bold ${Math.floor(ch - 2)}px "Courier New", monospace`;
}

function updateCamera() {
  const { player, map, camera } = STATE;
  camera.x = Math.max(0, Math.min(map.width  - camera.width,  player.x - Math.floor(camera.width  / 2)));
  camera.y = Math.max(0, Math.min(map.height - camera.height, player.y - Math.floor(camera.height / 2)));
}

function render() {
  if (!canvas || !ctx) return;
  updateCamera();

  const { map, player, camera, ui } = STATE;
  const { cw, ch } = getCellSize();
  const font = getFont(ch);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;

  // ── Tiles ────────────────────────────────────────────────────────────────
  for (let cy = 0; cy < camera.height; cy++) {
    for (let cx2 = 0; cx2 < camera.width; cx2++) {
      const mx = camera.x + cx2;
      const my = camera.y + cy;
      const px = Math.floor(cx2 * cw);
      const py = Math.floor(cy * ch);
      const pw = Math.ceil(cw);
      const ph = Math.ceil(ch);

      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) {
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, pw, ph);
        continue;
      }

      const tile = map.tiles[my]?.[mx];
      if (!tile) { ctx.fillStyle="#000"; ctx.fillRect(px,py,pw,ph); continue; }

      if (tile.visible) {
        ctx.fillStyle = tile.bgColor || "#050505";
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = tile.color;
        ctx.fillText(tile.char, px + 1, py);
      } else if (tile.explored) {
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = darkenColor(tile.color, MEMORY_FACTOR);
        ctx.fillText(tile.char, px + 1, py);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  // ── Itens no chão ────────────────────────────────────────────────────────
  for (const item of map.items) {
    const cx2 = item.x - camera.x;
    const cy  = item.y - camera.y;
    if (cx2 < 0 || cy < 0 || cx2 >= camera.width || cy >= camera.height) continue;
    const tile = map.tiles[item.y]?.[item.x];
    if (!tile?.visible) continue;
    const def = STATE.defs.items[item.defId];
    if (!def) continue;
    const px = Math.floor(cx2 * cw);
    const py = Math.floor(cy  * ch);
    ctx.fillStyle = def.color || "#F1C40F";
    ctx.fillText(def.char, px + 1, py);
  }

  // ── Entidades ────────────────────────────────────────────────────────────
  for (const entity of map.entities) {
    if (entity.hp <= 0) continue;
    const cx2 = entity.x - camera.x;
    const cy  = entity.y - camera.y;
    if (cx2 < 0 || cy < 0 || cx2 >= camera.width || cy >= camera.height) continue;
    const tile = map.tiles[entity.y]?.[entity.x];
    if (!tile?.visible) continue;
    const def = STATE.defs.enemies[entity.defId];
    if (!def) continue;
    const px = Math.floor(cx2 * cw);
    const py = Math.floor(cy  * ch);
    // Fundo escuro sob o inimigo
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(px, py, Math.ceil(cw), Math.ceil(ch));
    ctx.fillStyle = def.color;
    ctx.fillText(def.char, px + 1, py);
  }

  // ── Jogador ──────────────────────────────────────────────────────────────
  {
    const cx2 = player.x - camera.x;
    const cy  = player.y - camera.y;
    const px  = Math.floor(cx2 * cw);
    const py  = Math.floor(cy  * ch);

    if (player.activeShield > 0) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#8E44AD";
    }
    ctx.fillStyle = player.color;
    ctx.font = `bold ${Math.floor(ch - 1)}px "Courier New", monospace`;
    ctx.fillText(player.char, px + 1, py);
    ctx.shadowBlur = 0;
    ctx.font = font;
  }

  // ── Hover highlight ──────────────────────────────────────────────────────
  if (ui.hoverTile) {
    const { wx, wy } = ui.hoverTile;
    const tile = map.tiles[wy]?.[wx];
    if (tile?.explored) {
      const cx2 = wx - camera.x;
      const cy  = wy - camera.y;
      if (cx2 >= 0 && cy >= 0 && cx2 < camera.width && cy < camera.height) {
        const px = Math.floor(cx2 * cw);
        const py = Math.floor(cy  * ch);
        ctx.strokeStyle = ui.targetingMode ? "rgba(241,196,15,0.8)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, Math.ceil(cw) - 1, Math.ceil(ch) - 1);
      }
    }
  }

  // ── Tile info clicado highlight ──────────────────────────────────────────
  if (ui.tileInfo) {
    const { x, y } = ui.tileInfo;
    const cx2 = x - camera.x;
    const cy  = y - camera.y;
    if (cx2 >= 0 && cy >= 0 && cx2 < camera.width && cy < camera.height) {
      const px = Math.floor(cx2 * cw);
      const py = Math.floor(cy  * ch);
      ctx.strokeStyle = "rgba(212,172,13,0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(px + 1, py + 1, Math.ceil(cw) - 2, Math.ceil(ch) - 2);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
  }

  // ── Targeting mode border ────────────────────────────────────────────────
  if (ui.targetingMode) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
    ctx.strokeStyle = `rgba(241,196,15,${0.4 + pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.lineWidth = 1;

    // Label
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, 20);
    ctx.fillStyle = "#F1C40F";
    ctx.font = `11px "Courier New", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText("▶ MODO ALVO — clique no alvo · tecla da skill para cancelar", 8, 4);
    ctx.font = font;
  }
}

function darkenColor(hex, factor) {
  if (!hex || !hex.startsWith("#")) return "#1a1a1a";
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const h = v => Math.max(0,Math.floor(v*factor)).toString(16).padStart(2,"0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export { initRenderer, render };
