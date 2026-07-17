// js/systems/combat.js — PATCH v0.0.7
//
// MUDANÇAS v0.0.7:
//  [v0.0.7-B] playerAttack() — golpes elementais (não-físicos) agora rolam
//             aplicação de status effect no alvo, além do dano aditivo puro.
//             Shock: se o alvo já estava eletrizado, este golpe é amplificado
//             (1.5x) e o shock é consumido antes do dano ser aplicado.
//  [v0.0.7-B] entityAttack() — espelha a mesma lógica: inimigos com elementType
//             definido aplicam status no jogador; shock ativo no jogador
//             amplifica o próximo golpe sofrido.
//  [v0.0.7-B] processEnemyTurns() — processa status effects (DoT + decremento
//             de duração) no início do turno, tanto do jogador quanto de cada
//             entidade viva; entidades congeladas/paralisadas pulam a ação.
//  [v0.0.7-B] rollElementalStatus() — helper compartilhado entre playerAttack
//             e entityAttack para não duplicar as regras de chance por
//             elemento (fire/ice/electric/poison) descritas em STATUS_CONFIG.
//
// MUDANÇAS v0.0.6:
//  [v0.0.6-D] playerAttack() — soma elementDamage da arma equipada ao dano físico;
//             exibe tipo no log de combate.
//  [v0.0.6-B] onEnemyDeath() — roll independente de skillLootTable; chance separada
//             do loot comum. Constante SKILL_DROP_CHANCE_CAP nomeada (ajuste fácil).

import {
  STATE, addLog, getPlayerAttack, getPlayerDefense, getPlayerElement, ELEMENTS,
  getEntityAt, removeEntity, playerGainXP, advanceTurn,
  addItemToInventory, STATUS_CONFIG,
  getStatusEffect, removeStatusEffect, applyStatusEffect, processStatusEffects
} from '../core/state.js';
import { computeFOV, chebyshevDist, manhattanDist, hasLineOfSight } from './fov.js';

// [v0.0.6-B] Cap de chance de drop de skill por kill.
// Mantido como constante nomeada para balanceamento futuro sem busca no código.
const SKILL_DROP_CHANCE_CAP = 0.08;

// ── Status Effects: aplicação por elemento (v0.0.7-B) ──────────────────────
// Regras de chance/comportamento por elemento — ver STATUS_CONFIG em state.js
// para os números. Compartilhado entre playerAttack (jogador ataca entidade)
// e entityAttack (entidade ataca jogador) para não duplicar a lógica.
//
// nearbyCandidates: lista de OUTRAS entidades elegíveis para o "spread" do
// shock. Só faz sentido quando é o jogador atacando um inimigo (o choque pode
// pular para inimigos próximos); vazio quando é um inimigo atacando o jogador
// (não existe "jogador próximo" — só há um jogador).
function rollElementalStatus(elementType, elementDamage, target, nearbyCandidates = []) {
  const messages = [];

  switch (elementType) {
    case "fire":
      if (Math.random() < STATUS_CONFIG.burn.chance) {
        applyStatusEffect(target, "burn", { elementDamage });
        messages.push({ type: "burn" });
      }
      break;

    case "ice":
      if (Math.random() < STATUS_CONFIG.slow.chance) {
        const res = applyStatusEffect(target, "slow", {});
        messages.push(res.type === "freeze" ? { type: "freeze" } : { type: "slow", stacks: res.stacks });
      }
      break;

    case "electric": {
      // Shock é garantido em todo golpe elétrico (não é uma chance — é a
      // natureza do elemento). O que É probabilístico são os dois bônus:
      // espalhar para inimigos próximos e paralisar diretamente.
      applyStatusEffect(target, "shock", {});
      messages.push({ type: "shock" });

      if (nearbyCandidates.length > 0 && Math.random() < STATUS_CONFIG.shock.spreadChance) {
        for (const candidate of nearbyCandidates) {
          applyStatusEffect(candidate, "shock", {});
        }
        messages.push({ type: "shock_spread", count: nearbyCandidates.length });
      }

      if (Math.random() < STATUS_CONFIG.shock.paralyzeChance) {
        applyStatusEffect(target, "paralyze", {});
        messages.push({ type: "paralyze" });
      }
      break;
    }

    case "poison":
      if (Math.random() < STATUS_CONFIG.poison.chance) {
        const res = applyStatusEffect(target, "poison", {});
        messages.push({ type: "poison_apply", stacks: res.stacks });
      }
      break;
  }

  return messages;
}

// [v0.0.7-B] Loga a APLICAÇÃO de um status (golpe que causou o efeito) —
// distinto de logStatusTick, que loga o efeito acontecendo no início do turno.
function logElementalApplyMessage(displayName, msg, elementType) {
  const color = ELEMENTS[elementType]?.color || "#BDC3C7";
  switch (msg.type) {
    case "burn":
      addLog(`🔥 ${displayName} está pegando fogo!`, color);
      break;
    case "slow":
      addLog(`❄ ${displayName} está mais lento! (${msg.stacks}/${STATUS_CONFIG.slow.maxStacks} stacks)`, color);
      break;
    case "freeze":
      addLog(`❄ ${displayName} ficou completamente congelado!`, color);
      break;
    case "shock":
      addLog(`⚡ ${displayName} está eletrizado — próximo golpe sofrido será amplificado!`, color);
      break;
    case "shock_spread":
      addLog(`⚡ O choque salta para ${msg.count} inimigo(s) próximo(s)!`, color);
      break;
    case "paralyze":
      addLog(`⚡ ${displayName} foi paralisado pelo choque!`, color);
      break;
    case "poison_apply":
      addLog(`☠ ${displayName} está envenenado! (${msg.stacks} stacks totais)`, color);
      break;
  }
}

// [v0.0.7-B] Loga o TICK de um status (dano de DoT ou skip de turno) no
// início do turno do alvo — chamado a partir de processEnemyTurns().
function logStatusTick(displayName, msg) {
  switch (msg.type) {
    case "burn":
      addLog(`🔥 ${displayName} sofre ${msg.amount} de dano por queimadura.`, ELEMENTS.fire.color);
      break;
    case "poison":
      addLog(`☠ ${displayName} sofre ${msg.amount} de dano por veneno (${msg.stacks} stacks).`, ELEMENTS.poison.color);
      break;
    case "freeze":
      addLog(`❄ ${displayName} está congelado e não pode agir!`, ELEMENTS.ice.color);
      break;
    case "paralyze":
      addLog(`⚡ ${displayName} está paralisado e não pode agir!`, ELEMENTS.electric.color);
      break;
  }
}

// ── Combate: jogador ataca entidade ────────────────────────────────────────
function playerAttack(entity) {
  const atk = getPlayerAttack();
  const def = entity.defId ? (STATE.defs.enemies[entity.defId]?.defense || 0) : 0;
  let dmg = Math.max(1, atk - def + Math.floor(Math.random() * 3) - 1);

  // [v0.0.6-D] Soma dano elemental da arma equipada — puramente aditivo.
  const { elementType, elementDamage } = getPlayerElement();
  let totalDmg = dmg + elementDamage;

  // [v0.0.7-B] Shock: se o alvo já está eletrizado, este golpe é amplificado
  // e o shock é consumido (some após este golpe, independente do resultado).
  let shockAmplified = false;
  if (getStatusEffect(entity, "shock")) {
    totalDmg = Math.round(totalDmg * STATUS_CONFIG.shock.amplifyMult);
    removeStatusEffect(entity, "shock");
    shockAmplified = true;
  }

  entity.hp -= totalDmg;

  const def_data = STATE.defs.enemies[entity.defId];
  const eName    = def_data?.name || entity.defId;
  const ampSuffix = shockAmplified ? " (⚡ amplificado!)" : "";

  // [v0.0.6-D] Log mostra distribuição de dano quando há componente elemental.
  // Corrigido: usa ELEMENTS importado de state.js (fonte única), não mais
  // window._ELEMENTS / STATE._ELEMENTS, que nunca existiram (bug introduzido
  // na primeira escrita deste arquivo, corrigido antes da entrega).
  if (elementDamage > 0) {
    const elLabel = ELEMENTS[elementType]?.label || elementType;
    if (entity.hp <= 0) {
      onEnemyDeath(entity, def_data);
      addLog(`Você derrota ${eName}! (${dmg} físico + ${elementDamage} ${elLabel} = ${totalDmg})${ampSuffix}`, "#E74C3C");
    } else {
      addLog(`Você ataca ${eName}: ${dmg}+${elementDamage}${elLabel}=${totalDmg} dmg.${ampSuffix} (HP:${entity.hp}/${entity.maxHp})`, "#F0B27A");
    }
  } else {
    if (entity.hp <= 0) {
      onEnemyDeath(entity, def_data);
      addLog(`Você derrota o ${eName}! (${totalDmg} dmg)${ampSuffix}`, "#E74C3C");
    } else {
      addLog(`Você ataca ${eName} por ${totalDmg}.${ampSuffix} (HP: ${entity.hp}/${entity.maxHp})`, "#F0B27A");
    }
  }

  // [v0.0.7-B] Rola aplicação de status elemental — só se o alvo sobreviveu
  // ao golpe (aplicar status em uma entidade já removida não faz sentido) e
  // só para elementos não-físicos.
  if (entity.hp > 0 && elementType !== "physical") {
    let nearby = [];
    if (elementType === "electric") {
      nearby = STATE.map.entities.filter(e =>
        e !== entity && e.hp > 0 &&
        chebyshevDist(entity.x, entity.y, e.x, e.y) <= STATUS_CONFIG.shock.spreadRadius
      );
    }
    const statusMsgs = rollElementalStatus(elementType, elementDamage, entity, nearby);
    for (const m of statusMsgs) logElementalApplyMessage(eName, m, elementType);
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

  // [v0.0.7-B] Shock: se o jogador já está eletrizado, este golpe é
  // amplificado e o shock é consumido (aplicado antes da absorção de escudo,
  // já que representa o golpe base ficando mais forte, não um bônus extra).
  let shockAmplified = false;
  if (getStatusEffect(STATE.player, "shock")) {
    dmg = Math.round(dmg * STATUS_CONFIG.shock.amplifyMult);
    removeStatusEffect(STATE.player, "shock");
    shockAmplified = true;
  }

  if (STATE.player.activeShield > 0) {
    const absorbed = Math.min(dmg, STATE.player.activeShield);
    dmg -= absorbed;
    STATE.player.activeShield -= absorbed;
    if (STATE.player.activeShield <= 0) {
      STATE.player.activeShield = 0;
      addLog(`Seu escudo de cristal se estilhaça!`, "#8E44AD");
    }
  }

  const ampSuffix = shockAmplified ? " (⚡ amplificado!)" : "";

  if (dmg > 0) {
    STATE.player.hp = Math.max(0, STATE.player.hp - dmg);
    addLog(`${eName} ataca você por ${dmg}!${ampSuffix} (HP: ${STATE.player.hp}/${STATE.player.maxHp})`, "#E74C3C");
  } else {
    addLog(`${eName} ataca, mas o escudo absorve tudo!`, "#8E44AD");
  }

  if (STATE.player.hp <= 0) {
    STATE.gamePhase = "DEAD";
    addLog("☠ Você foi derrotado nas Planícies Enferrujadas...", "#FF0000");
    return;
  }

  // [v0.0.7-B] Rola aplicação de status elemental do inimigo no jogador —
  // só se o golpe causou dano de fato (0 = totalmente absorvido pelo escudo)
  // e o inimigo tem um elementType não-físico definido. Sem "spread" nesta
  // direção — só existe um jogador, não há "alvos próximos" para o choque saltar.
  const elementType   = def_data?.elementType   || "physical";
  const elementDamage = def_data?.elementDamage || 0;
  if (dmg > 0 && elementType !== "physical") {
    const statusMsgs = rollElementalStatus(elementType, elementDamage, STATE.player, []);
    for (const m of statusMsgs) logElementalApplyMessage("Você", m, elementType);
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

  // [v0.0.7-B] Tick de status effects do jogador no início do turno.
  // Feito aqui (não em movePlayer/playerWait) porque processEnemyTurns já é
  // o hook central chamado uma vez por turno completo, tanto por movimento
  // quanto por skills (ver activateSkill).
  const playerStatus = processStatusEffects(player);
  for (const msg of playerStatus.messages) logStatusTick("Você", msg);
  if (player.hp <= 0) {
    STATE.gamePhase = "DEAD";
    addLog("☠ Os efeitos de status consomem você nas Planícies Enferrujadas...", "#FF0000");
    return; // jogo acabou — não processa turnos de inimigos
  }

  for (const entity of [...map.entities]) {
    if (entity.hp <= 0) continue;
    const def  = defs.enemies[entity.defId];
    if (!def) continue;

    // [v0.0.7-B] Tick de status effects da entidade no início do turno dela.
    const entityStatus = processStatusEffects(entity);
    for (const msg of entityStatus.messages) logStatusTick(def.name, msg);
    if (entity.hp <= 0) { onEnemyDeath(entity, def); continue; }
    if (entityStatus.incapacitated) continue; // congelado/paralisado pula o turno

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
