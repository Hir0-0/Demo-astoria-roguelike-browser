# Auroria — Ruínas do Mundo Solar

RPG de exploração ASCII em browser, ambientado num continente solarpunk onde cristais solares alimentam máquinas a vapor sobre as ruínas de uma civilização perdida.

**Versão atual: 0.0.4**

## Estado atual do escopo

- ✅ Overworld **Planície Enferrujada** totalmente jogável: geração procedural, combate (bump-to-attack + 4 skills), inventário/equipamento, inimigos com IA de perseguição, sistema de save/load manual via JSON.
- 🚧 Dungeon **Ruínas de Cristal** ainda **não implementada**. Pisar na escada de descida encerra a sessão atual com uma tela de "Fim do Demo" (ver nota de escopo abaixo) em vez de abrir um mapa novo — não há `generateDungeon()` neste ciclo.

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
│   │   ├── mapGen.js     geração procedural do bioma overworld
│   │   └── tiles.js      definições de tipos de tile e cores
│   ├── systems/
│   │   ├── combat.js     bump-to-attack, skills, IA de inimigos
│   │   ├── fov.js        campo de visão (shadowcasting) e utilitários de distância
│   │   └── render.js     câmera e renderização ASCII em canvas
│   └── ui/
│       ├── hud.js         stats, barra de skills, log, inventário, painel de pausa
│       └── menus.js       tela inicial, game over, fim de demo
└── data/
    ├── enemies.json     configuração de inimigos
    ├── items.json       configuração de itens
    └── skills.json       configuração de skills
```

**Responsabilidade de cada camada:**

- **`core/`** — estado e ciclo de vida do jogo. `state.js` é a única fonte de verdade (`STATE`); nenhum outro módulo deve guardar estado próprio de jogo. `engine.js` orquestra input, turnos e transições de fase. `save.js` serializa/restaura `STATE` em JSON.
- **`world/`** — tudo relacionado à geração e definição do mapa físico (tiles, ruído, posicionamento de spawn/escada/inimigos/itens).
- **`systems/`** — regras de jogo que operam sobre o `STATE`: combate, campo de visão, renderização. Não manipulam DOM (exceto `render.js`, que desenha no canvas).
- **`ui/`** — única camada que manipula o DOM (HTML/innerHTML) fora do canvas. `hud.js` para elementos persistentes durante o jogo, `menus.js` para telas de overlay (menu, derrota, fim de demo).
- **`data/`** — configuração externa em JSON, carregada via `fetch()` em `engine.js`. Permite balancear o jogo sem tocar em código.

## Como adicionar conteúdo novo

**Novo inimigo:** edite `data/enemies.json`. Copie um inimigo existente como modelo (`hp`, `attack`, `defense`, `xp`, `char`, `color`, `ai`, `lootTable` opcional) e adicione o `id` em `spawnEnemies()` (`js/world/mapGen.js`) na lista `enemyTypes`/`weights` se quiser que ele apareça na geração do mapa.

**Novo item:** edite `data/items.json`. Defina `type` (`consumable`, `weapon`, `armor` ou `material`) e os campos correspondentes (`effect`/`value` para consumíveis, `attackBonus` para armas, `defenseBonus` para armaduras). Para aparecer no chão do overworld, adicione-o ao `pool` de `spawnItems()` (`js/world/mapGen.js`).

**Nova skill:** edite `data/skills.json` definindo `key`, `char`, `color`, `targetType` (`self`, `aoe` ou `directional`), `energyCost`, `cooldown` e os campos de efeito (`damage`, `healAmount`, `shieldAmount` ou `distance`, dependendo do tipo). Em seguida, adicione um `case` correspondente no `switch` dentro de `activateSkill()` (`js/systems/combat.js`) chamando a função de efeito.

Graças à constante `SKILL_KEYS` (`js/core/state.js`), **nada mais precisa ser tocado em `engine.js` ou `hud.js`** — tecla e label de uma 5ª/6ª skill aparecem automaticamente, desde que o `id` da nova skill seja adicionado ao array `STATE.player.skills`.

## Controles

| Ação            | Tecla(s)              |
|------------------|------------------------|
| Mover            | WASD / Setas           |
| Skills           | Q W E R (dinâmico — ver `SKILL_KEYS`) |
| Inventário       | I                       |
| Pegar item       | G                       |
| Aguardar         | . (ponto) ou 5 (numpad)|
| Entrar na escada | Enter                  |
| Menu / Pausar    | ESC                     |
| Inspecionar tile | Clique no mapa          |
| Cancelar alvo de skill | tecla da própria skill de novo, ou ESC |
