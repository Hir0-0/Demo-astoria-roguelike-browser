// js/systems/combat.js — PATCH v0.0.6
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-D] playerAttack() — soma elementDamage da arma equipada ao dano físico;
//             exibe tipo no log de combate.
//  [v0.0.6-B] onEnemyDeath() — roll independente de skillLootTable; chance separada
//             do loot comum. Constante SKILL_DROP_CHANCE_CAP nomeada (ajuste fácil).

import {
  STATE, addLog, getPlayerAttack, getPlayerDefense, getPlayerElement, ELEMENTS,
  getEntityAt, removeEntity, playerGainXP, advanceTurn,
  addItemToInventory
} from '../core/state.js';
import { computeFOV, chebyshevDist, manhattanDist, hasLineOfSight } from './fov.js';

// [v0.0.6-B] Cap de chance de drop de skill por kill.
// Mantido como constante nomeada para balanceamento futuro sem busca no código.
const SKILL_DROP_CHANCE_CAP = 0.08;

// ── Combate: jogador ataca entidade ────────────────────────────────────────
function playerAttack(entity) {
  const atk = getPlayerAttack();
  const def = entity.defId ? (STATE.defs.enemies[entity.defId]?.defense || 0) : 0;
  let dmg = Math.max(1, atk - def + Math.floor(Math.random() * 3) - 1);

  // [v0.0.6-D] Soma dano elemental da arma equipada — puramente aditivo.
  // Resistências e fraquezas em inimigos ficam para v0.0.7+.
  const { elementType, elementDamage } = getPlayerElement();
  const totalDmg = dmg + elementDamage;

  entity.hp -= totalDmg;

  const def_data = STATE.defs.enemies[entity.defId];
  const eName    = def_data?.name || entity.defId;

  // [v0.0.6-D] Log mostra distribuição de dano quando há componente elemental.
  // Corrigido: usa ELEMENTS importado de state.js (fonte única), não mais
  // window._ELEMENTS / STATE._ELEMENTS, que nunca existiram (bug introduzido
  // na primeira escrita deste arquivo, corrigido antes da entrega).
  if (elementDamage > 0) {
    const elLabel = ELEMENTS[elementType]?.label || elementType;
    if (entity.hp <= 0) {
      onEnemyDeath(entity, def_data);
      addLog(`Você derrota ${eName}! (${dmg} físico + ${elementDamage} ${elLabel} = ${totalDmg})`, "#E74C3C");
    } else {
      addLog(`Você ataca ${eName}: ${dmg}+${elementDamage}${elLabel}=${totalDmg} dmg. (HP:${entity.hp}/${entity.maxHp})`, "#F0B27A");
    }
  } else {
    if (entity.hp <= 0) {
      onEnemyDeath(entity, def_data);
      addLog(`Você derrota o ${eName}! (${totalDmg} dmg)`, "#E74C3C");
    } else {
      addLog(`Você ataca ${eName} por ${totalDmg}. (HP: ${entity.hp}/${entity.maxHp})`, "#F0B27A");
    }
  }

  return totalDmg;
}

// ── Entidade ataca jogador ─────────────────────────────────────────────────
function entityAttack(entity) {
  const def_data = STATE.defs.enemies[entity.defId];
  const eName    = def_data?.name || entity.defId;
  const atk      = def_data?.attack || 2;
  const pDef     = getPlayerDefense();

  // [v0.0.6-F] Inimigos escalados por tier/depth têm difficultyMult no atributo
  // da entidade de mapa — aplicamos ao ataque para que tier2+ seja perceptível.
  const tierMult = entity.difficultyMult || 1;
  const scaledAtk = Math.round(atk * tierMult);

  let dmg = Math.max(1, scaledAtk - pDef + Math.floor(Math.random() * 3) - 1);

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

  // Roll de loot comum (comportamento inalterado)
  if (def_data?.lootTable) {
    for (const drop of def_data.lootTable) {
      if (Math.random() < drop.chance) {
        const itemDef = STATE.defs.items[drop.id];
        if (itemDef) {
          STATE.map.items.push({
            defId: drop.id,
            x: entity.x, y: entity.y,
            id: `loot_${Date.now()}_${Math.random()}`
          });
          addLog(`${def_data.name} deixou ${itemDef.name}.`, "#D5D8DC");
        }
      }
    }
  }

  // [v0.0.6-B] Roll independente de skill drop.
  // Executa DEPOIS do loot comum — rolls completamente separados.
  // Só um skill pode dropar por kill (primeiro que passar no check).
  if (def_data?.skillLootTable && def_data.skillLootTable.length > 0) {
    for (const drop of def_data.skillLootTable) {
      // Aplica cap: chance efetiva = min(chance configurada, SKILL_DROP_CHANCE_CAP)
      const effectiveChance = Math.min(drop.chance, SKILL_DROP_CHANCE_CAP);
      if (Math.random() < effectiveChance) {
        const skillDef = STATE.defs.skills[drop.id];
        if (skillDef) {
          // Skill dropa como item de mapa — jogador coleta e vai para inventário
          STATE.map.items.push({
            defId:  drop.id,
            kind:   "skill",
            x: entity.x, y: entity.y,
            id: `skill_drop_${Date.now()}_${Math.random()}`
          });
          addLog(`✦ ${def_data.name} deixou a skill: ${skillDef.name}!`, "#F1C40F");
        }
        break; // apenas um skill por kill
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
    const def  = defs.enemies[entity.defId];
    if (!def) continue;
    const dist = manhattanDist(entity.x, entity.y, player.x, player.y);
    const tile = map.tiles[entity.y]?.[entity.x];
    if (!tile?.visible && dist > FOV_AGGRO) continue;
    if (dist <= 1.5) {
      entityAttack(entity);
    } else if (dist <= FOV_AGGRO) {
      moveEntityToward(entity, player.x, player.y);
    }
  }
}

function moveEntityToward(entity, tx, ty) {
  const dx = Math.sign(tx - entity.x), dy = Math.sign(ty - entity.y);
  const moves = [[dx, dy], [dx, 0], [0, dy], [-dy, dx], [dy, -dx]];
  for (const [mx, my] of moves) {
    if (mx === 0 && my === 0) continue;
    const nx = entity.x + mx, ny = entity.y + my;
    const tile = STATE.map.tiles[ny]?.[nx];
    if (!tile || !tile.passable) continue;
    if (STATE.map.entities.some(e => e !== entity && e.hp > 0 && e.x === nx && e.y === ny)) continue;
    if (nx === STATE.player.x && ny === STATE.player.y) continue;
    entity.x = nx; entity.y = ny;
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
    case "solar_burst":    skillSolarBurst(targetX, targetY, skillDef);   break;
    case "crystal_shield": skillCrystalShield(skillDef);                  break;
    case "steam_dash":     skillSteamDash(targetX, targetY, skillDef);    break;
    case "vine_mend":      skillVineMend(skillDef);                       break;
    case "phase_blink":    skillPhaseBlink(targetX, targetY, skillDef);   break;
  }

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
    if (chebyshevDist(tx, ty, entity.x, entity.y) > radius) continue;
    if (!hasLineOfSight(tx, ty, entity.x, entity.y)) continue;
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
  if (hit === 0) addLog(`O pulso solar não atingiu nenhum alvo.`, "#7F8C8D");
}

function skillCrystalShield(def) {
  STATE.player.activeShield = (def.shieldAmount || 10);
  addLog(`◆ Escudo de Cristal ativado! Absorve ${def.shieldAmount} de dano.`, "#8E44AD");
}

function skillSteamDash(tx, ty, def) {
  const dx = Math.sign(tx - STATE.player.x), dy = Math.sign(ty - STATE.player.y);
  const dist = def.distance || 3;
  let moved = 0;
  for (let i = 0; i < dist; i++) {
    const nx = STATE.player.x + dx, ny = STATE.player.y + dy;
    const tile = STATE.map.tiles[ny]?.[nx];
    if (!tile || !tile.passable) break;
    if (getEntityAt(nx, ny)) break;
    STATE.player.x = nx; STATE.player.y = ny;
    moved++;
  }
  addLog(`» Arranco a Vapor! Moveu ${moved} tile(s).`, "#5DADE2");
}

function skillVineMend(def) {
  const heal = def.healAmount || 12;
  STATE.player.hp = Math.min(STATE.player.maxHp, STATE.player.hp + heal);
  addLog(`♣ Cura das Vinhas! Recuperou ${heal} HP.`, "#2ECC71");
}

function skillPhaseBlink(tx, ty, def) {
  const range = def.range || 4;
  if (chebyshevDist(STATE.player.x, STATE.player.y, tx, ty) > range) {
    addLog(`◇ Fragmentação fora de alcance! (máx ${range} tiles)`, "#7F8C8D");
    return;
  }
  const tile = STATE.map.tiles[ty]?.[tx];
  if (!tile || !tile.passable || getEntityAt(tx, ty)) {
    addLog(`◇ Fragmentação falhou — destino bloqueado.`, "#7F8C8D");
    return;
  }
  STATE.player.x = tx; STATE.player.y = ty;
  addLog(`◇ Fragmentação de Cristal! Você atravessa o espaço instantaneamente.`, "#5DADE2");
}

function tickCooldowns() {
  const cd = STATE.player.skillCooldowns;
  for (const key of Object.keys(cd)) {
    if (cd[key] > 0) cd[key]--;
    if (cd[key] <= 0) delete cd[key];
  }
}

export { playerAttack, entityAttack, processEnemyTurns, activateSkill, tickCooldowns, SKILL_DROP_CHANCE_CAP };
