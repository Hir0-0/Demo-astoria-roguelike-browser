// js/core/save.js — v0.0.3
// Sistema de save manual via JSON — export/import de arquivo
//
// CORREÇÕES (v0.0.2 → v0.0.3):
//  [BUG-04] validateSave: `!data?.player?.hp !== undefined` aplicava `!` antes de `?.`,
//           tornando a guarda de versão futura sempre verdadeira (nunca entrava no bloco).
//           Corrigido para `data?.player?.hp !== undefined`.

import { STATE, addLog } from './state.js';

const SAVE_VERSION = "0.1.0";

function serializeState() {
  return {
    meta: {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      turn: STATE.turn,
      seed: STATE.seed
    },
    player: JSON.parse(JSON.stringify(STATE.player)),
    map: {
      type:     STATE.map.type,
      id:       STATE.map.id,
      width:    STATE.map.width,
      height:   STATE.map.height,
      tiles:    STATE.map.tiles.map(row =>
        row.map(t => ({
          type:     t.type,
          passable: t.passable,
          explored: t.explored,
          char:     t.char,
          color:    t.color,
          bgColor:  t.bgColor
        }))
      ),
      entities: JSON.parse(JSON.stringify(STATE.map.entities)),
      items:    JSON.parse(JSON.stringify(STATE.map.items)),
      stairs:   JSON.parse(JSON.stringify(STATE.map.stairs)),
      entrance: { ...STATE.map.entrance }
    },
    log: STATE.log.slice(0, 20),
    gamePhase: "PLAYING"
  };
}

function exportSave() {
  try {
    const data     = serializeState();
    const json     = JSON.stringify(data, null, 2);
    const blob     = new Blob([json], { type: "application/json" });
    const url      = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename  = `auroria-save-${timestamp}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog(`💾 Jogo salvo: ${filename}`, "#2ECC71");
    return true;
  } catch (e) {
    console.error("Erro ao salvar:", e);
    addLog("⚠ Erro ao salvar o jogo.", "#E74C3C");
    return false;
  }
}

function importSave(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!validateSave(data)) {
          reject(new Error("Arquivo de save inválido ou incompatível."));
          return;
        }
        resolve(data);
      } catch (err) {
        reject(new Error("Arquivo JSON corrompido."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
    reader.readAsText(file);
  });
}

function validateSave(data) {
  // Versão obrigatória presente
  if (!data?.meta?.version) return false;

  // [BUG-04] Operador `!` aplicado erroneamente antes de `?.`:
  //   ANTES:  if (!data?.player?.hp !== undefined)  → sempre false (nunca entrava)
  //   DEPOIS: if (data?.player?.hp !== undefined)   → guarda correta para migração futura
  if (data?.player?.hp !== undefined) {
    // Placeholder para migração de saves de versões futuras
  }

  // Campos mínimos obrigatórios
  return !!(data.player && data.map && Array.isArray(data.map.tiles));
}

function applySave(data, stateRef) {
  stateRef.turn      = data.meta.turn || 0;
  stateRef.seed      = data.meta.seed || 0;
  stateRef.gamePhase = "PLAYING";

  // Restaura jogador
  Object.assign(stateRef.player, data.player);

  // Restaura mapa
  stateRef.map.type     = data.map.type;
  stateRef.map.id       = data.map.id;
  stateRef.map.width    = data.map.width;
  stateRef.map.height   = data.map.height;
  stateRef.map.entities = data.map.entities;
  stateRef.map.items    = data.map.items;
  stateRef.map.stairs   = data.map.stairs;
  stateRef.map.entrance = data.map.entrance;

  // Restaura tiles; flags de visibilidade resetam (fog recomeça)
  stateRef.map.tiles = data.map.tiles.map(row =>
    row.map(t => ({
      ...t,
      visible: false,
      entity:  null
    }))
  );

  // Restaura log
  stateRef.log = data.log || [];
}

export { exportSave, importSave, applySave, validateSave };
