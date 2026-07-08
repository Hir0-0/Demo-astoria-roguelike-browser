# Auroria — Ruínas do Mundo Solar

RPG de exploração ASCII em browser, ambientado num continente solarpunk onde cristais solares alimentam máquinas a vapor sobre as ruínas de uma civilização perdida.

**Versão atual: 0.0.6**

## Estado atual do escopo

- ✅ Overworld **Planície Enferrujada** totalmente jogável: geração procedural com 3 biomas cosméticos (plains/forest/desert), combate (bump-to-attack + 4 skills em loadout fixo Q/W/E/R), inventário stackável `{itemId, qty}[]`, equipamento, inimigos com IA de perseguição, sistema de save/load manual via JSON.
- ✅ **3 entradas de dungeon** no overworld com `dungeonProgress` independente por entrada — cada entrada escala em dificuldade e loot conforme o número de expedições completadas (sistema de tier).
- ✅ Dungeon **Ruínas de Cristal** implementada como **expedição**: o jogador desce até 5 andares gerados proceduralmente (salas conectadas em grafo, com bifurcações e salas opcionais de risco/recompensa), com dificuldade crescente por profundidade e tier, e retorna ao mesmo overworld de onde saiu — o overworld é persistente e nunca é regenerado.
- ✅ **Sistema elemental**: 5 elementos (physical/fire/ice/electric/poison) como affix de arma. Armas elementais somam `elementDamage` ao dano base. Log de combate exibe o breakdown.
- ✅ **Crafting (prévia)**: 3 receitas via tecla C. Sistema completo (bancadas, árvores de receitas) vem em ciclo futuro do roadmap.
- ✅ **Skills como itens droppáveis**: inimigos têm `skillLootTable` individual. Skills encontradas no mundo vão ao inventário e podem ser equipadas nos 4 slots fixos.
- 🚧 Fora de escopo nesta versão: confronto de chefe roteirizado no andar final, descida além do andar 5, resistências/fraquezas elementais, economia, facções, vila/fazenda ou ranking.

## Changelog

### v0.0.6
- Inventário refatorado para `{itemId, qty}[]` com `stackCap` por item
- Loadout fixo de 4 skills (Q/W/E/R) — skills são itens droppáveis e equipáveis
- Sistema elemental: 5 elementos como affix de arma, exibido no log de combate
- 3 entradas de dungeon por overworld com `dungeonProgress[entranceId]` e tier de dificuldade
- Crafting (prévia): 3 receitas em `CRAFT_RECIPES`, tecla C
- Biomas cosméticos: plains/forest/desert via noise com `tintColor()`
- Migração de save retroativa: saves da v0.0.5 carregam corretamente
- **BUG-16** (crítico): corrigido — crafting verificava espaço após consumir ingredientes; agora verifica antes
- **BUG-17** (médio): corrigido — fallback lateral garante 3 entradas mesmo em seeds com conflito de posição

### v0.0.5.1
- BUG-14: stairs_up ausente do array stairs (crítico)
- BUG-15: WASD removido do movimento (conflito com crystal_shield)

## Como executar localmente

O projeto usa ES Modules (`import`/`export`) e `fetch()` para carregar os arquivos `data/*.json`. Isso **exige um servidor HTTP local** — abrir `index.html` diretamente como `file://` não funciona (CORS bloqueia o `fetch`).

Qualquer servidor estático simples resolve. Exemplos:

```bash
# Opção 1 — Node (sem instalar nada globalmente)
npx serve .

# Opção 2 — Python 3 (já vem instalado na maioria dos sistemas)
python3 -m http.server

# Opção 3 — PHP
php -S localhost:8000
```

Depois, abra o endereço indicado pelo terminal (ex.: `http://localhost:8000` ou `http://localhost:3000`) no navegador.

## Estrutura de pastas

```
auroria/
├── index.html          entrada única da aplicação
├── css/
│   └── style.css        tema visual, cores, efeito CRT
├── js/
│   ├── core/
│   │   ├── engine.js     game loop, input, orquestração de turno
│   │   ├── state.js      estado global único (STATE) + mutadores + constantes
│   │   └── save.js       export/import de save em JSON
│   ├── world/
│   │   ├── mapGen.js     geração procedural do overworld E da dungeon (generateOverworld/generateDungeon)
│   │   └── tiles.js      definições de tipos de tile e cores
│   ├── systems/
│   │   ├── combat.js     bump-to-attack, skills, IA de inimigos
│   │   ├── fov.js        campo de visão (shadowcasting) e utilitários de distância
│   │   └── render.js     câmera e renderização ASCII em canvas
│   └── ui/
│       ├── hud.js         stats, indicador de expedição, barra de skills, log, inventário, painel de pausa
│       └── menus.js       tela inicial, game over, retorno de expedição
└── data/
    ├── enemies.json     configuração de inimigos
    ├── items.json       configuração de itens
    └── skills.json       configuração de skills
```

**Responsabilidade de cada camada:**

- **`core/`** — estado e ciclo de vida do jogo. `state.js` é a única fonte de verdade (`STATE`); nenhum outro módulo deve guardar estado próprio de jogo. Inclui `STATE.dungeon` (expedição em curso) e `STATE.overworldSnapshot` (overworld preservado durante a expedição). `engine.js` orquestra input, turnos, transições de fase e o fluxo de entrada/descida/subida/conclusão da dungeon (`useStairs()`). `save.js` serializa/restaura `STATE` em JSON, incluindo o estado de expedição quando ativo.
- **`world/`** — geração procedural de mapas. `generateOverworld()` gera o bioma persistente; `generateDungeon(seed, depth, width, height)` gera um andar da dungeon como grafo de salas conectadas (não corredor único), com sala(s) opcional(is) de risco/recompensa e dificuldade escalando por `depth`.
- **`systems/`** — regras de jogo que operam sobre o `STATE`: combate, campo de visão, renderização. Não manipulam DOM (exceto `render.js`, que desenha no canvas).
- **`ui/`** — única camada que manipula o DOM (HTML/innerHTML) fora do canvas. `hud.js` para elementos persistentes durante o jogo (inclui indicador "Andar X de 5" quando em expedição). `menus.js` para telas de overlay (menu, derrota, retorno de expedição).
- **`data/`** — configuração externa em JSON, carregada via `fetch()` em `engine.js`. Permite balancear o jogo sem tocar em código.

## Como adicionar conteúdo novo

**Novo inimigo:** edite `data/enemies.json`. Copie um inimigo existente como modelo (`hp`, `attack`, `defense`, `xp`, `char`, `color`, `ai`, `lootTable` opcional) e adicione o `id` em `spawnEnemies()` (`js/world/mapGen.js`) na lista `enemyTypes`/`weights` se quiser que ele apareça na geração do mapa.

**Novo item:** edite `data/items.json`. Defina `type` (`consumable`, `weapon`, `armor` ou `material`) e os campos correspondentes (`effect`/`value` para consumíveis, `attackBonus` para armas, `defenseBonus` para armaduras). Para aparecer no chão do overworld, adicione-o ao `pool` de `spawnItems()` (`js/world/mapGen.js`).

**Nova skill:** edite `data/skills.json` definindo `key`, `char`, `color`, `targetType` (`self`, `aoe` ou `directional`), `energyCost`, `cooldown` e os campos de efeito (`damage`, `healAmount`, `shieldAmount` ou `distance`, dependendo do tipo). Em seguida, adicione um `case` correspondente no `switch` dentro de `activateSkill()` (`js/systems/combat.js`) chamando a função de efeito.

Graças à constante `SKILL_KEYS` (`js/core/state.js`), **nada mais precisa ser tocado em `engine.js` ou `hud.js`** — tecla e label de uma 5ª/6ª skill aparecem automaticamente, desde que o `id` da nova skill seja adicionado ao array `STATE.player.skills`.

## Dungeon "Ruínas de Cristal" — como funciona

A dungeon é uma **expedição**, não um mundo separado: o overworld nunca é regenerado.

- **Entrar:** pisar no `stairs_down` do overworld e pressionar `Enter` salva um snapshot completo do overworld em `STATE.overworldSnapshot` e gera o andar 1 via `generateDungeon()`.
- **Descer:** pisar no `stairs_down` de um andar (`depth < MAX_DEPTH`) gera o próximo andar e substitui `STATE.map` — andares anteriores não ficam acumulados em memória.
- **Subir/sair antecipadamente:** pisar no `stairs_up` do andar 1 restaura `STATE.overworldSnapshot` exatamente como estava (mesmos tiles explorados, entidades, itens, posição do jogador). O tile `stairs_up` também existe em andares intermediários (faz parte da geração de cada andar, e seu registro agora está sempre presente no array `stairs`), mas pisar nele em `depth > 1` não tem ação implementada — apenas avisa o jogador, sem permitir subir entre andares da dungeon.
- **Concluir a expedição:** alcançar o tile `exit` no andar `MAX_DEPTH` (constante exportada por `mapGen.js`, hoje `5`) mostra a tela de retorno de expedição (`showExpeditionReturn()`); ao fechá-la, o overworld salvo é restaurado e a partida continua.
- **Geração de cada andar:** salas posicionadas em uma grade lógica, conectadas por uma árvore geradora (garante que toda sala seja alcançável), com 1–2 salas marcadas como "opcionais" (fora da rota direta entrada→saída) contendo inimigo mais forte e item melhor que a média do andar — risco e recompensa reais, nunca obrigatórios para progredir.
- **Save durante uma expedição:** `STATE.dungeon` (`active`/`depth`) e `STATE.overworldSnapshot` são incluídos no save sempre que uma expedição está em curso — recarregar restaura o andar exato e o overworld salvo, não um novo.

## Controles

| Ação            | Tecla(s)              |
|------------------|------------------------|
| Mover            | Setas direcionais       |
| Skills           | Q W E R F (dinâmico — ver `SKILL_KEYS`) |
| Inventário       | I                       |
| Pegar item       | G                       |
| Aguardar         | . (ponto) ou 5 (numpad)|
| Usar escada (entrar/descer/subir/concluir) | Enter |
| Menu / Pausar    | ESC                     |
| Inspecionar tile | Clique no mapa          |
| Cancelar alvo de skill | tecla da própria skill de novo, ou ESC |
