// js/core/save.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-A] Serializa player.skillLoadout (4 slots fixos).
//             Migração: saves antigos com player.skills[] populam skillLoadout
//             com até 4 skills; excedentes vão ao inventário como itens.
//  [v0.0.6-C] Inventário migrado: string[] antigo → {itemId,qty}[] novo.
//             applySave() converte automaticamente o formato antigo.
//  [v0.0.6-F] Serializa STATE.dungeonProgress e STATE.map.dungeonEntrances.
//             Migração: saves sem esses campos recebem defaults seguros ({} / []).

import { STATE, addLog, LOADOUT_SIZE } from './state.js';

const SAVE_VERSION = "0.2.0"; // bump de versão para v0.0.6

function serializeState() {
  return {
    meta: {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      turn: STATE.turn,
      seed: STATE.seed
    },
    // [v0.0.6-A/C] player inclui skillLoadout e inventory no novo formato
    player: JSON.parse(JSON.stringify(STATE.player)),
    map: {
      type:     STATE.map.type,
      id:       STATE.map.id,
      width:    STATE.map.width,
      height:   STATE.map.height,
      tiles: STATE.map.tiles.map(row =>
        row.map(t => ({
          type:     t.type,
          passable: t.passable,
          explored: t.explored,
          char:     t.char,
          color:    t.color,
          bgColor:  t.bgColor,
          biomeId:  t.biomeId || null  // [v0.0.6-G] preserva biomeId no save
        }))
      ),
      entities: JSON.parse(JSON.stringify(STATE.map.entities)),
      items:    JSON.parse(JSON.stringify(STATE.map.items)),
      stairs:   JSON.parse(JSON.stringify(STATE.map.stairs)),
      entrance: { ...STATE.map.entrance },
      // [v0.0.6-F] Entradas de dungeon no overworld
      dungeonEntrances: JSON.parse(JSON.stringify(STATE.map.dungeonEntrances || []))
    },
    dungeon: { ...STATE.dungeon },
    overworldSnapshot: STATE.overworldSnapshot
      ? JSON.parse(JSON.stringify(STATE.overworldSnapshot))
      : null,
    // [v0.0.6-F] Progresso por entrada (tier, timesCompleted)
    dungeonProgress: JSON.parse(JSON.stringify(STATE.dungeonProgress || {})),
    log: STATE.log.slice(0, 20),
    gamePhase: "PLAYING"
  };
}

function exportSave() {
  try {
    const data      = serializeState();
    const json      = JSON.stringify(data, null, 2);
    const blob      = new Blob([json], { type: "application/json" });
    const url       = URL.createObjectURL(blob);
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
  if (!data?.meta?.version) return false;
  if (data.dungeon !== undefined && typeof data.dungeon !== "object") return false;
  return !!(data.player && data.map && Array.isArray(data.map.tiles));
}

function applySave(data, stateRef) {
  stateRef.turn      = data.meta.turn || 0;
  stateRef.seed      = data.meta.seed || 0;
  stateRef.gamePhase = "PLAYING";

  // ── Restaura jogador ──────────────────────────────────────────────────────
  const savedPlayer = data.player;

  // [v0.0.6-C] Migração de inventário: string[] antigo → {itemId,qty}[]
  let inventory = savedPlayer.inventory || [];
  if (inventory.length > 0 && typeof inventory[0] === "string") {
    // Formato antigo: string[] → agrupa em stacks de qty=1 por item
    const grouped = {};
    for (const id of inventory) {
      grouped[id] = (grouped[id] || 0) + 1;
    }
    inventory = Object.entries(grouped).map(([itemId, qty]) => ({ itemId, qty }));
  }
  savedPlayer.inventory = inventory;

  // [v0.0.6-A] Migração de skills: player.skills[] antigo → skillLoadout[4]
  // Salvo novo já tem skillLoadout; save antigo tem skills[].
  // [v0.0.6-A] LOADOUT_SIZE importado de state.js — fonte única de verdade
  if (!savedPlayer.skillLoadout) {
    const oldSkills = Array.isArray(savedPlayer.skills) ? savedPlayer.skills : [];
    // Popula até 4 slots de loadout com as primeiras skills do array antigo
    const loadout = [null, null, null, null];
    for (let i = 0; i < Math.min(oldSkills.length, LOADOUT_SIZE); i++) {
      loadout[i] = oldSkills[i];
    }
    // Skills excedentes (5ª em diante, se houver) vão ao inventário
    for (let i = LOADOUT_SIZE; i < oldSkills.length; i++) {
      savedPlayer.inventory.push({ itemId: oldSkills[i], qty: 1 });
    }
    savedPlayer.skillLoadout = loadout;
    delete savedPlayer.skills; // remove campo legado
  }

  // Garante que skillLoadout tem exatamente 4 slots (defensivo)
  if (!Array.isArray(savedPlayer.skillLoadout) || savedPlayer.skillLoadout.length !== LOADOUT_SIZE) {
    const current = Array.isArray(savedPlayer.skillLoadout) ? savedPlayer.skillLoadout : [];
    savedPlayer.skillLoadout = [
      current[0] || null, current[1] || null,
      current[2] || null, current[3] || null
    ];
  }

  // Garante ui.craftingOpen para saves sem esse campo
  if (!savedPlayer.ui) savedPlayer.ui = {};
  stateRef.ui = Object.assign({
    selectedSkill: null,
    targetingMode: false,
    inventoryOpen: false,
    craftingOpen: false,
    selectedInventoryIdx: 0,
    pauseOpen: false,
    tileInfo: null
  }, stateRef.ui);

  Object.assign(stateRef.player, savedPlayer);

  // ── Restaura mapa ─────────────────────────────────────────────────────────
  stateRef.map.type     = data.map.type;
  stateRef.map.id       = data.map.id;
  stateRef.map.width    = data.map.width;
  stateRef.map.height   = data.map.height;
  stateRef.map.entities = data.map.entities;
  stateRef.map.items    = data.map.items;
  stateRef.map.stairs   = data.map.stairs;
  stateRef.map.entrance = data.map.entrance;

  // [v0.0.6-F] Entradas de dungeon — default [] para saves antigos
  stateRef.map.dungeonEntrances = data.map.dungeonEntrances || [];

  stateRef.map.tiles = data.map.tiles.map(row =>
    row.map(t => ({ ...t, visible: false, entity: null }))
  );

  // ── Restaura estado de expedição ──────────────────────────────────────────
  // [v0.0.6-F] dungeon inclui entranceId (null em saves antigos)
  stateRef.dungeon = data.dungeon
    ? {
        active:     !!data.dungeon.active,
        depth:       data.dungeon.depth      || 0,
        entranceId:  data.dungeon.entranceId || null
      }
    : { active: false, depth: 0, entranceId: null };

  // Restaura snapshot do overworld (inclui dungeonEntrances se presente)
  stateRef.overworldSnapshot = data.overworldSnapshot
    ? {
        ...data.overworldSnapshot,
        tiles: data.overworldSnapshot.tiles.map(row =>
          row.map(t => ({ ...t, visible: false, entity: null }))
        ),
        // [v0.0.6-F] compatibilidade com snapshots antigos sem dungeonEntrances
        dungeonEntrances: data.overworldSnapshot.dungeonEntrances || []
      }
    : null;

  // [v0.0.6-F] Progresso de dungeons — default {} para saves antigos
  stateRef.dungeonProgress = data.dungeonProgress || {};

  stateRef.log = data.log || [];
}

export { exportSave, importSave, applySave, validateSave };
