# 🎮 Voxel World

Sandbox voxel 3D no navegador — mineração, construção, inventário, crafting,
ciclo dia/noite, mundo procedural infinito e salvamento automático.

## ▶️ Como rodar (3 passos)

**Requisito:** [Node.js](https://nodejs.org) versão 18 ou superior instalado.

Abra o terminal **dentro da pasta do projeto** (onde está o `package.json`)
e digite **um comando por vez**:

```bash
npm install
```

```bash
npm run dev
```

Depois abra no navegador: **http://localhost:5173**

> ⚠️ Digite cada comando sozinho, em sua própria linha, **sem comentários**.
> `npm install # Install a package` ❌ (o texto depois de `#` quebra o comando no Windows)
> `npm install` ✅
> `npm dev` ❌ — o certo é `npm run dev`

## 📦 Versão de produção (opcional)

```bash
npm run build
```

```bash
npm run preview
```

Abre o jogo compilado em **http://localhost:4173**.

## 🕹️ Controles

| Ação | Tecla |
|---|---|
| Andar | `W A S D` |
| Correr | `Shift` |
| Pular / Nadar | `Espaço` |
| Quebrar bloco | Botão esquerdo (segure) |
| Colocar bloco | Botão direito |
| Hotbar | `1–9` ou roda do mouse |
| Inventário / Crafting | `E` |
| Pausar / Salvar | `ESC` |

## ❓ Problemas comuns

| Sintoma | Solução |
|---|---|
| `npm` não reconhecido | Instale o Node.js e reabra o terminal |
| `Did you mean this?` | Digite o comando exatamente como acima, sem `#...` |
| `EACCES` / permissão | Não use pasta protegida; mova o projeto para `Documentos` ou `Área de Trabalho` |
| Porta 5173 em uso | O Vite mostrará outra porta no terminal (ex.: 5174) |
| Tela preta | Atualize o navegador (Chrome/Edge/Firefox recentes) — precisa de WebGL |

## 🗂️ Estrutura

```text
src/
├── App.tsx            ← monta o jogo
├── index.css          ← HUD, menus, inventário
└── game/
    ├── game.ts        ← loop, input, mineração, save
    ├── world.ts       ← terreno procedural + chunks
    ├── mesher.ts      ← malha otimizada por chunk
    ├── blocks.ts      ← blocos, ferramentas, receitas
    ├── textures.ts    ← texturas pixeladas (canvas)
    ├── player.ts      ← física e colisão
    ├── noise.ts       ← Simplex noise
    ├── sky.ts         ← dia/noite
    ├── particles.ts   ← partículas
    ├── audio.ts       ← sons (Web Audio)
    ├── save.ts        ← localStorage
    └── ui.ts          ← interface DOM
```

O progresso é salvo automaticamente no navegador (`localStorage`) —
feche a aba quando quiser e continue depois. Bom jogo! ⛏️
