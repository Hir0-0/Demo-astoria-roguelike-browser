// js/systems/combat.js
// Sistema de combate: bump-to-attack + skills

import {
  STATE, addLog, getPlayerAttack, getPlayerDefense,
  getEntityAt, removeEntity, playerGainXP, advanceTurn
} from '../core/state.js';
import { computeFOV, chebyshevDist, manhattanDist } from './fov.js';

// ── Combate: jogador ataca entidade ────────────────────────────────────────
function playerAttack(entity) {
  const atk = getPlayerAttack();
  const def = entity.defId ? (STATE.defs.enemies[entity.defId]?.defense || 0) : 0;
  let dmg = Math.max(1, atk - def + Math.floor(Math.random() * 3) - 1);

  // Absorção do escudo de cristal
  if (STATE.player.activeShield > 0) {
    // Shield não afeta ataque, apenas defesa — mas mantemos a flag
  }

  entity.hp -= dmg;

  const def_data = STATE.defs.enemies[entity.defId];
  const eName = def_data?.name || entity.defId;
  const colorEnemy = def_data?.color || "#CD7F32";

  if (entity.hp <= 0) {
    // Mata inimigo
    onEnemyDeath(entity, def_data);
    addLog(`Você derrota o ${eName}! (${dmg} dmg)`, "#E74C3C");
  } else {
    addLog(`Você ataca ${eName} por ${dmg}. (HP: ${entity.hp}/${entity.maxHp})`, "#F0B27A");
  }

  return dmg;
}

// ── Entidade ataca jogador ─────────────────────────────────────────────────
function entityAttack(entity) {
  const def_data = STATE.defs.enemies[entity.defId];
  const eName = def_data?.name || entity.defId;
  const atk = def_data?.attack || 2;
  const pDef = getPlayerDefense();

  let dmg = Math.max(1, atk - pDef + Math.floor(Math.random() * 3) - 1);

  // Escudo de cristal absorve dano primeiro
  if (STATE.player.activeShield > 0) {
    const absorbed = Math.min(dmg, STATE.player.activeShield);
    dmg -= absorbed;
    STATE.player.activeShield -= absorbed;
    if (STATE.player.activeShield <= 0) {
      STATE.player.activeShield = 0;
      addLog(`Seu escudo de cristal se estilhaça!`, "#8E44AD");
    }
  }

  if (dmg > 0) {
    STATE.player.hp = Math.max(0, STATE.player.hp - dmg);
    addLog(`${eName} ataca você por ${dmg}! (HP: ${STATE.player.hp}/${STATE.player.maxHp})`, "#E74C3C");
  } else {
    addLog(`${eName} ataca, mas o escudo absorve tudo!`, "#8E44AD");
  }

  if (STATE.player.hp <= 0) {
    STATE.gamePhase = "DEAD";
    addLog("☠ Você foi derrotado nas Planícies Enferrujadas...", "#FF0000");
  }
}

function onEnemyDeath(entity, def_data) {
  removeEntity(entity);
  STATE.player.kills++;

  const xpGain = def_data?.xp || 10;
  playerGainXP(xpGain);

  // Drop de loot
  if (def_data?.lootTable) {
    for (const drop of def_data.lootTable) {
      if (Math.random() < drop.chance) {
        const itemDef = STATE.defs.items[drop.id];
        if (itemDef) {
          STATE.map.items.push({ defId: drop.id, x: entity.x, y: entity.y, id: `loot_${Date.now()}_${Math.random()}` });
          addLog(`${def_data.name} deixou ${itemDef.name}.`, "#D5D8DC");
        }
      }
    }
  }
}

// ── IA dos inimigos ────────────────────────────────────────────────────────
function processEnemyTurns() {
  const { player, map, defs } = STATE;
  const FOV_AGGRO = 10;

  for (const entity of [...map.entities]) {
    if (entity.hp <= 0) continue;

    const def = defs.enemies[entity.defId];
    if (!def) continue;

    const dist = manhattanDist(entity.x, entity.y, player.x, player.y);

    // Só age se o tile do inimigo foi explorado (está no campo de visão atual)
    const tile = map.tiles[entity.y]?.[entity.x];
    if (!tile?.visible && dist > FOV_AGGRO) continue;

    // Perseguição simples (chase AI)
    if (dist <= 1.5) {
      // Adjacente: ataca
      entityAttack(entity);
    } else if (dist <= FOV_AGGRO) {
      // Move em direção ao jogador (pathfinding simples)
      moveEntityToward(entity, player.x, player.y);
    }
  }
}

function moveEntityToward(entity, tx, ty) {
  const dx = Math.sign(tx - entity.x);
  const dy = Math.sign(ty - entity.y);

  // Tenta movimento direto, depois alternativas
  const moves = [
    [dx, dy], [dx, 0], [0, dy],
    [-dy, dx], [dy, -dx] // perpendiculares
  ];

  for (const [mx, my] of moves) {
    if (mx === 0 && my === 0) continue;
    const nx = entity.x + mx;
    const ny = entity.y + my;
    const tile = STATE.map.tiles[ny]?.[nx];
    if (!tile || !tile.passable) continue;
    const blocked = STATE.map.entities.some(e => e !== entity && e.hp > 0 && e.x === nx && e.y === ny);
    if (blocked) continue;
    if (nx === STATE.player.x && ny === STATE.player.y) continue;
    entity.x = nx;
    entity.y = ny;
    break;
  }
}

// ── Sistema de Skills ──────────────────────────────────────────────────────
function activateSkill(skillId, targetX, targetY) {
  const skillDef = STATE.defs.skills[skillId];
  if (!skillDef) return false;

  const cooldownLeft = STATE.player.skillCooldowns[skillId] || 0;
  if (cooldownLeft > 0) {
    addLog(`${skillDef.name} em recarga! (${cooldownLeft} turnos)`, "#7F8C8D");
    return false;
  }

  if (STATE.player.energy < skillDef.energyCost) {
    addLog(`Energia insuficiente para ${skillDef.name}!`, "#E74C3C");
    return false;
  }

  STATE.player.energy -= skillDef.energyCost;
  STATE.player.skillCooldowns[skillId] = skillDef.cooldown;

  switch (skillDef.id) {
    case "solar_burst": skillSolarBurst(targetX, targetY, skillDef); break;
    case "crystal_shield": skillCrystalShield(skillDef); break;
    case "steam_dash": skillSteamDash(targetX, targetY, skillDef); break;
    case "vine_mend": skillVineMend(skillDef); break;
  }

  // Skill usa o turno
  advanceTurn();
  tickCooldowns();
  processEnemyTurns();
  computeFOV(STATE.player.x, STATE.player.y);
  return true;
}

function skillSolarBurst(tx, ty, def) {
  addLog(`☀ Pulso Solar! Energia solar explode em área!`, "#F1C40F");
  const radius = def.range || 2;
  let hit = 0;
  for (const entity of [...STATE.map.entities]) {
    if (entity.hp <= 0) continue;
    const d = chebyshevDist(tx, ty, entity.x, entity.y);
    if (d <= radius) {
      const dmg = def.damage || 8;
      entity.hp -= dmg;
      const eDef = STATE.defs.enemies[entity.defId];
      if (entity.hp <= 0) {
        onEnemyDeath(entity, eDef);
        addLog(`${eDef?.name || entity.defId} destruído pelo Pulso! (${dmg})`, "#F39C12");
      } else {
        addLog(`${eDef?.name || entity.defId} atingido por ${dmg} de energia solar.`, "#F39C12");
      }
      hit++;
    }
  }
  if (hit === 0) addLog(`O pulso solar não atingiu nenhum alvo.`, "#7F8C8D");
}

function skillCrystalShield(def) {
  STATE.player.activeShield = (def.shieldAmount || 10);
  addLog(`◆ Escudo de Cristal ativado! Absorve ${def.shieldAmount} de dano.`, "#8E44AD");
}

function skillSteamDash(tx, ty, def) {
  const dx = Math.sign(tx - STATE.player.x);
  const dy = Math.sign(ty - STATE.player.y);
  const dist = def.distance || 3;
  let moved = 0;

  for (let i = 0; i < dist; i++) {
    const nx = STATE.player.x + dx;
    const ny = STATE.player.y + dy;
    const tile = STATE.map.tiles[ny]?.[nx];
    if (!tile || !tile.passable) break;
    if (getEntityAt(nx, ny)) break;
    STATE.player.x = nx;
    STATE.player.y = ny;
    moved++;
  }

  addLog(`» Arranco a Vapor! Moveu ${moved} tile(s).`, "#5DADE2");
}

function skillVineMend(def) {
  const heal = def.healAmount || 12;
  STATE.player.hp = Math.min(STATE.player.maxHp, STATE.player.hp + heal);
  addLog(`♣ Cura das Vinhas! Recuperou ${heal} HP.`, "#2ECC71");
}

function tickCooldowns() {
  const cd = STATE.player.skillCooldowns;
  for (const key of Object.keys(cd)) {
    if (cd[key] > 0) cd[key]--;
    if (cd[key] <= 0) delete cd[key];
  }
  // Tick do escudo (reduz 1 por turno de duração)
  // O escudo dura até ser absorvido — sem tick de duração no MVP
}

export { playerAttack, entityAttack, processEnemyTurns, activateSkill, tickCooldowns };
