/**
 * UI — toda a interface em DOM: menus, seleção de modo, HUD (corações, hotbar
 * com durabilidade), inventário com arrastar-e-soltar, crafting 2×2 e bancada
 * 3×3, catálogo criativo, configurações, toasts e loading.
 */
import { RECIPES, ITEMS, itemDef, matchRecipe, recipeInputs, recipeNeedsTable } from "./blocks";
import type { ItemStack, Recipe } from "./blocks";
import type { Settings, GameMode, WorldMeta } from "./save";
import type { TexturePack } from "./textures";

export interface UIHost {
  settings: Settings;
  seed: number;
  mode: GameMode;
  selectedSlot: number;
  health: number;
  inventory: (ItemStack | null)[];
  craftGrid: (ItemStack | null)[];
  craftGrid3: (ItemStack | null)[];
  applySettings(p: Partial<Settings>): void;
  startContinue(): void;
  newWorld(): void;
  chooseMode(mode: GameMode, action: "play" | "new"): void;
  saveWorld(manual: boolean): void;
  resume(): void;
  toMenu(): void;
  selectSlot(i: number): void;
  invChanged(): void;
  tryCraft(r: Recipe, area: "craft" | "craft3"): boolean;
  creativeTake(itemId: string): void;
  worldName: string | null;
  listWorlds(): WorldMeta[];
  deleteWorld(name: string): void;
  loadNamedWorld(name: string): void;
}

const el = (tag: string, cls = "", html = ""): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function copyIcon(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  c.className = "pixelated";
  c.getContext("2d")!.drawImage(src, 0, 0, size, size);
  return c;
}

/** coração pixelado em SVG (7×6) */
const HEART_PATH = "M1 0h2v1H1zM4 0h2v1H4zM0 1h7v2H0zM1 3h5v1H1zM2 4h3v1H2zM3 5h1v1H3z";
const heartSVG = (color: string): string =>
  `<svg viewBox="0 0 7 6" width="18" height="16" shape-rendering="crispEdges"><path d="${HEART_PATH}" fill="${color}" stroke="none"/></svg>`;

const CONTROLS: [string, string][] = [
  ["W A S D", "mover"], ["Mouse", "olhar"], ["Espaço", "pular / subir"],
  ["Shift", "correr / descer"], ["Botão esq.", "quebrar / atacar"], ["Botão dir.", "colocar / usar"],
  ["1–9 / roda", "hotbar"], ["E", "inventário"], ["F", "voar (criativo)"], ["ESC", "pausa"],
];

type Area = "main" | "craft" | "craft3";

export class UI {
  private root: HTMLElement;
  private host: UIHost;
  private tex: TexturePack;

  private hotbarEl!: HTMLElement;
  private hotSlots: HTMLElement[] = [];
  private heartsEl!: HTMLElement;
  private heartSpans: HTMLElement[] = [];
  private statsEl!: HTMLElement;
  private mineBar!: HTMLElement;
  private crosshair!: HTMLElement;
  private toastBox!: HTMLElement;
  private waterFx!: HTMLElement;
  private damageFx!: HTMLElement;
  private hudEl!: HTMLElement;

  private mainMenu!: HTMLElement;
  private pauseMenu!: HTMLElement;
  private modeScreen!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private invScreen!: HTMLElement;
  private invPanelSurvival!: HTMLElement;
  private invPanelCreative!: HTMLElement;
  private wbScreen!: HTMLElement;
  private loadingEl!: HTMLElement;
  private loadBar!: HTMLElement;
  private loadLabel!: HTMLElement;

  private invSlots = new Map<HTMLElement, { area: Area; index: number }>();
  private resultSlot!: HTMLElement;
  private resultSlot3!: HTMLElement;
  private settingsCtx: "menu" | "pause" = "menu";
  private held: { item: ItemStack; area: Area; index: number } | null = null;
  private dragButton = 0;
  private ghost!: HTMLElement;
  private currentRecipe: Recipe | null = null;
  private currentRecipe3: Recipe | null = null;
  private modeAction: "play" | "new" = "play";

  constructor(container: HTMLElement, host: UIHost, tex: TexturePack) {
    this.root = el("div", "vw-root");
    container.appendChild(this.root);
    this.host = host;
    this.tex = tex;
    this.buildHUD();
    this.buildMenus();
    this.buildModeSelect();
    this.buildInventory();
    this.buildWorkbench();
    this.buildSettings();
    this.buildWorlds();
    this.buildLoading();
    this.ghost = el("div", "drag-ghost");
    this.ghost.style.display = "none";
    this.root.appendChild(this.ghost);

    window.addEventListener("mousemove", this.onDragMove);
    window.addEventListener("mouseup", this.onDragEnd);
  }

  /* ---------------- HUD ---------------- */

  private buildHUD(): void {
    this.hudEl = el("div", "hud");
    this.hudEl.style.display = "none";

    this.crosshair = el("div", "crosshair", `<span class="ch-v"></span><span class="ch-h"></span>`);
    this.mineBar = el("div", "mine-bar", `<div class="mine-fill"></div>`);
    this.statsEl = el("div", "stats");
    this.toastBox = el("div", "toasts");
    this.waterFx = el("div", "water-fx");
    this.damageFx = el("div", "damage-fx");

    // corações (10 → 20 HP)
    this.heartsEl = el("div", "hearts");
    for (let i = 0; i < 10; i++) {
      const h = el("span", "heart");
      h.innerHTML = heartSVG("#3d0f0c") + `<span class="heart-fill">${heartSVG("#e0342b")}</span>`;
      this.heartSpans.push(h);
      this.heartsEl.appendChild(h);
    }

    this.hotbarEl = el("div", "hotbar");
    for (let i = 0; i < 9; i++) {
      const s = el("div", "slot hot-slot");
      s.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-count"></span>`;
      s.addEventListener("click", () => this.host.selectSlot(i));
      this.hotSlots.push(s);
      this.hotbarEl.appendChild(s);
    }
    const hbWrap = el("div", "hb-wrap");
    hbWrap.append(this.heartsEl, this.hotbarEl);

    const hint = el("div", "hint");
    hint.innerHTML = CONTROLS.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join("");

    this.hudEl.append(this.crosshair, this.mineBar, this.statsEl, hbWrap, hint);
    this.root.append(this.hudEl, this.toastBox, this.waterFx, this.damageFx);
  }

  setHUDVisible(v: boolean): void {
    this.hudEl.style.display = v ? "block" : "none";
    this.crosshair.style.display = v ? "flex" : "none";
  }

  setHearts(hp: number, visible: boolean): void {
    this.heartsEl.style.display = visible ? "flex" : "none";
    for (let i = 0; i < 10; i++) {
      const fill = this.heartSpans[i].querySelector(".heart-fill") as HTMLElement;
      const v = hp - i * 2; // 2, 1 ou 0
      fill.style.clipPath = v >= 2 ? "none" : v === 1 ? "inset(0 50% 0 0)" : "inset(0 100% 0 0)";
    }
  }

  flashDamage(): void {
    this.damageFx.style.transition = "none";
    this.damageFx.style.opacity = "1";
    requestAnimationFrame(() => {
      this.damageFx.style.transition = "opacity 0.5s";
      this.damageFx.style.opacity = "0";
    });
  }

  updateHotbar(): void {
    const inv = this.host.inventory;
    for (let i = 0; i < 9; i++) {
      const s = this.hotSlots[i];
      s.classList.toggle("sel", i === this.host.selectedSlot);
      const item = inv[i];
      const old = s.querySelector("canvas");
      if (old) old.remove();
      const oldBar = s.querySelector(".dur-bar");
      if (oldBar) oldBar.remove();
      const countEl = s.querySelector(".slot-count")!;
      if (item) {
        s.appendChild(copyIcon(this.tex.icon(item.id), 34));
        s.title = itemDef(item.id).name;
        countEl.textContent = item.count > 1 ? String(item.count) : "";
        this.drawDurability(s, item);
      } else {
        s.title = "";
        countEl.textContent = "";
      }
    }
  }

  /** barrinha de durabilidade dentro do slot (ferramentas) */
  private drawDurability(slotEl: HTMLElement, item: ItemStack): void {
    const def = itemDef(item.id);
    if (!def?.tool || item.dur === undefined) return;
    const pct = Math.max(0, Math.min(1, item.dur / def.tool.maxDur));
    const bar = el("div", "dur-bar");
    const fill = el("div", "dur-fill");
    fill.style.width = `${Math.round(pct * 100)}%`;
    fill.style.background = pct > 0.5 ? "#79c94e" : pct > 0.25 ? "#f2b23e" : "#e0563f";
    bar.appendChild(fill);
    slotEl.appendChild(bar);
  }

  updateStats(fps: number, x: number, y: number, z: number, chunks: number, dayStr: string, modeStr: string): void {
    this.statsEl.innerHTML =
      `<span class="st-fps">${fps} FPS</span>` +
      `<span>XYZ ${x} / ${y} / ${z}</span>` +
      `<span>${dayStr}</span>` +
      `<span>${chunks} chunks · ${modeStr}</span>`;
  }

  setMineProgress(p: number): void {
    this.mineBar.style.opacity = p > 0 ? "1" : "0";
    (this.mineBar.firstElementChild as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  setWaterOverlay(on: boolean): void {
    this.waterFx.style.opacity = on ? "1" : "0";
  }

  toast(msg: string): void {
    const t = el("div", "toast", msg);
    this.toastBox.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2100);
    setTimeout(() => t.remove(), 2500);
  }

  /* ---------------- Menus ---------------- */

  private buildMenus(): void {
    this.mainMenu = el("div", "screen menu-screen");
    const left = el("div", "menu-left");
    left.innerHTML = `
      <div class="title-block">
        <div class="vw-kicker">sandbox voxel no navegador</div>
        <h1 class="vw-title"><span class="t-voxel">VOXEL</span><span class="t-world">WORLD</span></h1>
        <p class="vw-sub">Minere, construa e explore um mundo infinito de blocos gerado na hora — com cavernas, minérios, árvores, criaturas e ciclo de dia e noite.</p>
      </div>
      <div class="menu-buttons">
        <button class="btn btn-primary" data-act="play"></button>
        <button class="btn" data-act="worlds">Meus Mundos</button>
        <button class="btn" data-act="new">Novo Mundo</button>
        <button class="btn" data-act="settings">Configurações</button>
      </div>
      <div class="menu-footer">versão 2.0 · seed <span class="seed-val"></span> · three.js</div>`;
    const right = el("div", "menu-right");
    right.innerHTML = `<div class="panel controls-panel"><h3>Controles</h3>` +
      CONTROLS.map(([k, v]) => `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join("") + `</div>`;
    this.mainMenu.append(left, right);
    this.mainMenu.querySelector('[data-act="play"]')!.addEventListener("click", () => { this.audioTick(); this.host.startContinue(); });
    this.mainMenu.querySelector('[data-act="worlds"]')!.addEventListener("click", () => { this.audioTick(); this.showWorlds(); });
    this.mainMenu.querySelector('[data-act="new"]')!.addEventListener("click", () => { this.audioTick(); this.host.newWorld(); });
    this.mainMenu.querySelector('[data-act="settings"]')!.addEventListener("click", () => { this.audioTick(); this.openSettings("menu"); });
    (this.mainMenu.querySelector(".seed-val") as HTMLElement).textContent = String(this.host.seed);
    this.root.appendChild(this.mainMenu);

    this.pauseMenu = el("div", "screen pause-screen");
    this.pauseMenu.style.display = "none";
    const card = el("div", "panel pause-panel");
    card.innerHTML = `
      <h2 class="panel-title">Pausado</h2>
      <button class="btn btn-primary" data-p="resume">Voltar ao jogo</button>
      <button class="btn" data-p="settings">Configurações</button>
      <button class="btn" data-p="save">Salvar mundo</button>
      <button class="btn" data-p="menu">Menu principal</button>
      <div class="menu-footer">seed <span class="seed-val"></span></div>`;
    this.pauseMenu.appendChild(card);
    (this.pauseMenu.querySelector(".seed-val") as HTMLElement).textContent = String(this.host.seed);
    this.pauseMenu.querySelector('[data-p="resume"]')!.addEventListener("click", () => { this.audioTick(); this.host.resume(); });
    this.pauseMenu.querySelector('[data-p="settings"]')!.addEventListener("click", () => { this.audioTick(); this.openSettings("pause"); });
    this.pauseMenu.querySelector('[data-p="save"]')!.addEventListener("click", () => { this.audioTick(); this.host.saveWorld(true); });
    this.pauseMenu.querySelector('[data-p="menu"]')!.addEventListener("click", () => { this.audioTick(); this.host.toMenu(); });
    this.root.appendChild(this.pauseMenu);
  }

  private buildModeSelect(): void {
    this.modeScreen = el("div", "screen mode-screen");
    this.modeScreen.style.display = "none";
    const wrap = el("div", "mode-wrap");
    wrap.innerHTML = `<h2 class="panel-title mode-title">Escolha o modo de jogo</h2>`;
    const cards = el("div", "mode-cards");
    const surv = el("button", "mode-card");
    surv.innerHTML = `
      <span class="mode-icon">${heartSVG("#e0342b")}</span>
      <span class="mode-name">Sobrevivência</span>
      <span class="mode-desc">Corações, dano de queda, ferramentas com durabilidade e criaturas hostis à noite. Minere para coletar cada bloco.</span>`;
    const crea = el("button", "mode-card crea");
    crea.innerHTML = `
      <span class="mode-icon">${this.cubeIcon()}</span>
      <span class="mode-name">Criativo</span>
      <span class="mode-desc">Voar com F, blocos infinitos no catálogo, quebra instantânea e sem dano. Construa sem limites.</span>`;
    surv.addEventListener("click", () => { this.audioTick(); this.host.chooseMode("survival", this.modeAction); });
    crea.addEventListener("click", () => { this.audioTick(); this.host.chooseMode("creative", this.modeAction); });
    cards.append(surv, crea);
    wrap.appendChild(cards);
    this.modeScreen.appendChild(wrap);
    this.root.appendChild(this.modeScreen);
  }

  private cubeIcon(): string {
    return `<svg viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges">
      <path d="M8 1L15 4.5V8L8 11.5 1 8V4.5z" fill="#79c94e"/>
      <path d="M1 8l7 3.5V15L1 11.5z" fill="#4e9631"/>
      <path d="M15 8l-7 3.5V15l7-3.5z" fill="#2f611d"/></svg>`;
  }

  showModeSelect(action: "play" | "new"): void {
    this.modeAction = action;
    this.hideAllScreens();
    this.modeScreen.style.display = "flex";
  }

  private audioTick(): void {
    (this.host as unknown as { uiClick?: () => void }).uiClick?.();
  }

  showMainMenu(hasSave: boolean): void {
    this.hideAllScreens();
    this.mainMenu.style.display = "flex";
    const btn = this.mainMenu.querySelector('[data-act="play"]') as HTMLButtonElement;
    btn.textContent = hasSave ? "Continuar" : "Jogar";
    (this.mainMenu.querySelector(".seed-val") as HTMLElement).textContent = String(this.host.seed);
    this.setHUDVisible(false);
  }

  showPause(show: boolean): void {
    if (show) {
      this.hideAllScreens();
      (this.pauseMenu.querySelector(".seed-val") as HTMLElement).textContent = String(this.host.seed);
    }
    this.pauseMenu.style.display = show ? "flex" : "none";
    this.setHUDVisible(!show);
  }

  setLoading(p: number, label: string): void {
    this.loadingEl.style.display = "flex";
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    this.loadLabel.textContent = label;
  }
  hideLoading(): void { this.loadingEl.style.display = "none"; }

  private hideAllScreens(): void {
    this.mainMenu.style.display = "none";
    this.pauseMenu.style.display = "none";
    this.settingsPanel.style.display = "none";
    this.invScreen.style.display = "none";
    this.modeScreen.style.display = "none";
    this.wbScreen.style.display = "none";
  }

  /** Fecha todas as telas (usado ao entrar no jogo). */
  hideScreens(): void { this.hideAllScreens(); }

  fatal(msg: string): void {
    this.hideLoading();
    const s = el("div", "screen");
    s.style.display = "flex";
    s.innerHTML = `<div class="panel pause-panel"><h2 class="panel-title" style="color:#e0563f">Erro</h2>
      <p class="fatal-msg">${msg}</p><p class="fatal-msg">Veja o console (F12) para detalhes.</p></div>`;
    this.root.appendChild(s);
  }

  /* ---------------- Configurações ---------------- */

  private buildSettings(): void {
    this.settingsPanel = el("div", "screen");
    this.settingsPanel.style.display = "none";
    const card = el("div", "panel settings-panel");
    card.innerHTML = `
      <h2 class="panel-title">Configurações</h2>
      ${sliderRow("sens", "Sensibilidade do mouse", 0.2, 3, 0.1)}
      ${sliderRow("fov", "Campo de visão (FOV)", 60, 110, 1)}
      ${sliderRow("rd", "Distância de renderização", 2, 8, 1, " chunks")}
      ${sliderRow("vol", "Volume", 0, 1, 0.05)}
      <label class="set-row"><span>Qualidade gráfica</span>
        <select id="set-q" class="set-select">
          <option value="0">Baixa</option><option value="1">Média</option><option value="2">Alta</option>
        </select></label>
      <button class="btn btn-primary set-close">Concluído</button>`;
    this.settingsPanel.appendChild(card);
    this.root.appendChild(this.settingsPanel);

    const bind = (id: string, fn: (v: number) => void) => {
      const input = card.querySelector("#set-" + id) as HTMLInputElement;
      const out = card.querySelector("#out-" + id) as HTMLElement;
      const label = () => {
        const v = parseFloat(input.value);
        out.textContent = (id === "vol" ? Math.round(v * 100) + "%" : id === "sens" ? v.toFixed(1) : String(v)) + (input.dataset.suffix ?? "");
      };
      input.addEventListener("input", () => { label(); fn(parseFloat(input.value)); });
      return { input, label };
    };
    const s = this.host.settings;
    const b1 = bind("sens", (v) => this.host.applySettings({ sensibilidade: v }));
    const b2 = bind("fov", (v) => this.host.applySettings({ fov: v }));
    const b3 = bind("rd", (v) => this.host.applySettings({ renderDist: v }));
    const b4 = bind("vol", (v) => this.host.applySettings({ volume: v }));
    b1.input.value = String(s.sensibilidade);
    b2.input.value = String(s.fov);
    b3.input.value = String(s.renderDist);
    b3.input.dataset.suffix = " chunks";
    b4.input.value = String(s.volume);
    b1.label(); b2.label(); b3.label(); b4.label();
    const q = card.querySelector("#set-q") as HTMLSelectElement;
    q.value = String(s.qualidade);
    q.addEventListener("change", () => this.host.applySettings({ qualidade: parseInt(q.value, 10) as 0 | 1 | 2 }));
    this.syncSettingsInputs = () => {
      const st = this.host.settings;
      b1.input.value = String(st.sensibilidade); b1.label();
      b2.input.value = String(st.fov); b2.label();
      b3.input.value = String(st.renderDist); b3.label();
      b4.input.value = String(st.volume); b4.label();
      q.value = String(st.qualidade);
    };
    card.querySelector(".set-close")!.addEventListener("click", () => {
      this.audioTick();
      this.closeSettings();
    });
  }

  private syncSettingsInputs: () => void = () => {};

  openSettings(ctx: "menu" | "pause"): void {
    this.settingsCtx = ctx;
    if (ctx === "menu") this.mainMenu.style.display = "none";
    else this.pauseMenu.style.display = "none";
    this.syncSettingsInputs();
    this.settingsPanel.style.display = "flex";
  }

  private closeSettings(): void {
    this.settingsPanel.style.display = "none";
    if (this.settingsCtx === "menu") this.mainMenu.style.display = "flex";
    else this.pauseMenu.style.display = "flex";
  }

  /* ---------------- Meus Mundos ---------------- */

  private worldsScreen!: HTMLElement;
  private worldsList!: HTMLElement;

  private buildWorlds(): void {
    this.worldsScreen = el("div", "screen");
    this.worldsScreen.style.display = "none";
    const card = el("div", "panel settings-panel");
    card.innerHTML = `<h2 class="panel-title">Meus Mundos</h2><div class="worlds-list"></div>
      <button class="btn btn-primary set-close">Voltar</button>`;
    this.worldsList = card.querySelector(".worlds-list")!;
    card.querySelector(".set-close")!.addEventListener("click", () => {
      this.audioTick();
      this.worldsScreen.style.display = "none";
      this.mainMenu.style.display = "flex";
    });
    this.worldsScreen.appendChild(card);
    this.root.appendChild(this.worldsScreen);
  }

  private showWorlds(): void {
    this.mainMenu.style.display = "none";
    this.refreshWorldsList();
    this.worldsScreen.style.display = "flex";
  }

  private refreshWorldsList(): void {
    this.worldsList.innerHTML = "";
    const worlds = this.host.listWorlds();
    if (worlds.length === 0) {
      this.worldsList.appendChild(el("div", "worlds-empty", "Nenhum mundo salvo ainda. Crie um em “Novo Mundo”."));
      return;
    }
    for (const w of worlds) {
      const row = el("div", "world-row");
      const info = el("div", "world-info");
      const name = el("div", "world-name", this.escapeHtml(w.name));
      if (w.name === this.host.worldName) name.appendChild(el("span", "world-current", "atual"));
      const meta = el("div", "world-meta",
        `${w.mode === "creative" ? "Criativo" : "Sobrevivência"} · seed ${w.seed} · ${this.formatDate(w.savedAt)}`);
      info.append(name, meta);

      const play = el("button", "btn btn-primary world-btn", "Jogar");
      play.addEventListener("click", () => { this.audioTick(); this.host.loadNamedWorld(w.name); });

      const del = el("button", "btn world-btn world-del", "Excluir");
      del.addEventListener("click", () => {
        if (del.dataset.confirm) {
          this.audioTick();
          this.host.deleteWorld(w.name);
          this.refreshWorldsList();
        } else {
          del.dataset.confirm = "1";
          del.textContent = "Confirmar?";
          setTimeout(() => { delete del.dataset.confirm; del.textContent = "Excluir"; }, 2500);
        }
      });

      row.append(info, play, del);
      this.worldsList.appendChild(row);
    }
  }

  private formatDate(ts: number): string {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return "—"; }
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  }

  /* ---------------- Inventário + Crafting ---------------- */

  private buildInventory(): void {
    this.invScreen = el("div", "screen inv-screen");
    this.invScreen.style.display = "none";
    const wrap = el("div", "inv-wrap");

    // crafting 2×2
    const craftPanel = el("div", "panel inv-panel");
    craftPanel.innerHTML = `<h3 class="inv-title">Fabricação 2×2</h3>`;
    const craftRow = el("div", "craft-row");
    const grid = el("div", "craft-grid");
    for (let i = 0; i < 4; i++) grid.appendChild(this.makeSlot("craft", i));
    this.resultSlot = this.makeResult("craft");
    craftRow.append(grid, this.arrowEl(), this.resultSlot);
    craftPanel.appendChild(craftRow);

    // receitas
    const recPanel = el("div", "panel inv-panel rec-panel");
    recPanel.innerHTML = `<h3 class="inv-title">Receitas</h3><div class="rec-list"></div>`;
    const recList = recPanel.querySelector(".rec-list")!;
    for (const r of RECIPES) {
      const row = el("div", "rec-row");
      const inputs = Object.entries(recipeInputs(r)).map(([id, n]) => `${n}× ${itemDef(id).name}`).join(" + ");
      const iconWrap = el("span", "rec-icon");
      iconWrap.appendChild(copyIcon(this.tex.icon(r.output.id), 26));
      const needsTable = recipeNeedsTable(r);
      const badge = el("span", "rec-badge" + (needsTable ? " rec-badge-3" : ""), needsTable ? "3×3" : "2×2");
      row.append(el("span", "rec-in", inputs), iconWrap, el("span", "rec-out", `${r.output.count}× ${itemDef(r.output.id).name}`), badge);
      recList.appendChild(row);
    }

    // mochila (sobrevivência)
    this.invPanelSurvival = el("div", "panel inv-panel");
    this.invPanelSurvival.innerHTML = `<h3 class="inv-title">Mochila</h3>`;
    const gridMain = el("div", "inv-grid");
    for (let i = 9; i < 36; i++) gridMain.appendChild(this.makeSlot("main", i));
    this.invPanelSurvival.appendChild(gridMain);
    this.invPanelSurvival.appendChild(el("h3", "inv-title sub", "Hotbar"));
    const hb = el("div", "inv-grid inv-hotbar");
    for (let i = 0; i < 9; i++) hb.appendChild(this.makeSlot("main", i));
    this.invPanelSurvival.appendChild(hb);

    // catálogo (criativo)
    this.invPanelCreative = el("div", "panel inv-panel");
    this.invPanelCreative.innerHTML = `<h3 class="inv-title">Catálogo criativo — clique para encher o slot ${"selecionado"}</h3>`;
    const cat = el("div", "inv-grid cat-grid");
    const ids = Object.keys(ITEMS).sort((a, b) => {
      const ka = ITEMS[a].kind === "block" ? 0 : ITEMS[a].kind === "tool" ? 2 : 1;
      const kb = ITEMS[b].kind === "block" ? 0 : ITEMS[b].kind === "tool" ? 2 : 1;
      return ka - kb || a.localeCompare(b);
    });
    for (const id of ids) {
      const s = el("div", "slot cat-slot");
      s.title = ITEMS[id].name;
      s.appendChild(copyIcon(this.tex.icon(id), 34));
      s.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (this.held) return;
        this.audioTick();
        this.host.creativeTake(id);
      });
      cat.appendChild(s);
    }
    this.invPanelCreative.appendChild(cat);
    this.invPanelCreative.appendChild(el("h3", "inv-title sub", "Hotbar"));
    const hb2 = el("div", "inv-grid inv-hotbar");
    for (let i = 0; i < 9; i++) hb2.appendChild(this.makeSlot("main", i));
    this.invPanelCreative.appendChild(hb2);

    wrap.append(craftPanel, recPanel, this.invPanelSurvival, this.invPanelCreative);
    const esc = el("div", "inv-esc", "E ou ESC fecha · clique pega/solta a pilha · clique direito pega metade ou solta 1 · duplo clique junta pilhas");
    this.invScreen.append(wrap, esc);
    this.root.appendChild(this.invScreen);
  }

  private arrowEl(): HTMLElement {
    return el("div", "craft-arrow", `<svg width="26" height="16" viewBox="0 0 26 16" fill="none"><path d="M1 8h20M15 2l7 6-7 6" stroke="#9fb3a0" stroke-width="2.4" stroke-linecap="square"/></svg>`);
  }

  private makeResult(area: "craft" | "craft3"): HTMLElement {
    const r = el("div", "slot result-slot");
    r.title = "Clique para fabricar";
    r.addEventListener("mouseup", () => {
      if (this.held) return;
      const rec = area === "craft" ? this.currentRecipe : this.currentRecipe3;
      if (rec && this.host.tryCraft(rec, area)) this.refreshInventory();
    });
    return r;
  }

  private buildWorkbench(): void {
    this.wbScreen = el("div", "screen inv-screen");
    this.wbScreen.style.display = "none";
    const wrap = el("div", "inv-wrap");
    const panel = el("div", "panel inv-panel");
    panel.innerHTML = `<h3 class="inv-title">Bancada — Fabricação 3×3</h3>`;
    const row = el("div", "craft-row");
    const grid = el("div", "craft-grid craft-grid-3");
    for (let i = 0; i < 9; i++) grid.appendChild(this.makeSlot("craft3", i));
    this.resultSlot3 = this.makeResult("craft3");
    row.append(grid, this.arrowEl(), this.resultSlot3);
    panel.appendChild(row);
    panel.appendChild(el("div", "inv-esc", "Ferramentas de pedra, ferro e diamante, espadas e a cama só saem aqui."));
    const close = el("button", "btn btn-primary set-close", "Fechar bancada");
    close.addEventListener("click", () => { this.audioTick(); this.host.invChanged(); this.hideAllScreens(); this.host.resume(); });
    wrap.append(panel, close);
    this.wbScreen.appendChild(wrap);
    this.root.appendChild(this.wbScreen);
  }

  private makeSlot(area: Area, index: number): HTMLElement {
    const s = el("div", "slot");
    s.innerHTML = `<span class="slot-count"></span>`;
    this.invSlots.set(s, { area, index });
    s.addEventListener("mousedown", (e) => this.onSlotDown(e, area, index));
    s.addEventListener("dblclick", () => this.onSlotDbl(area, index));
    return s;
  }

  showInventory(show: boolean): void {
    if (show) this.hideAllScreens();
    this.invScreen.style.display = show ? "flex" : "none";
    if (show) {
      this.held = null;
      this.ghost.style.display = "none";
      const creative = this.host.mode === "creative";
      this.invPanelSurvival.style.display = creative ? "none" : "block";
      this.invPanelCreative.style.display = creative ? "block" : "none";
      this.refreshInventory();
    }
  }

  showWorkbench(show: boolean): void {
    if (show) this.hideAllScreens();
    this.wbScreen.style.display = show ? "flex" : "none";
    if (show) {
      this.held = null;
      this.ghost.style.display = "none";
      this.refreshInventory();
    }
  }

  private getSlotStack(area: Area, i: number): ItemStack | null {
    if (area === "main") return this.host.inventory[i];
    if (area === "craft") return this.host.craftGrid[i];
    return this.host.craftGrid3[i];
  }

  private setSlotStack(area: Area, i: number, v: ItemStack | null): void {
    if (area === "main") this.host.inventory[i] = v;
    else if (area === "craft") this.host.craftGrid[i] = v;
    else this.host.craftGrid3[i] = v;
  }

  refreshInventory(): void {
    for (const [s, ref] of this.invSlots) {
      const item = this.getSlotStack(ref.area, ref.index);
      const old = s.querySelector("canvas");
      if (old) old.remove();
      const oldBar = s.querySelector(".dur-bar");
      if (oldBar) oldBar.remove();
      const countEl = s.querySelector(".slot-count")!;
      if (item) {
        s.appendChild(copyIcon(this.tex.icon(item.id), 34));
        s.title = itemDef(item.id).name;
        countEl.textContent = item.count > 1 ? String(item.count) : "";
        this.drawDurability(s, item);
      } else {
        s.title = "";
        countEl.textContent = "";
      }
    }
    this.refreshResult(this.resultSlot, this.host.craftGrid, 2);
    this.refreshResult(this.resultSlot3, this.host.craftGrid3, 3);
    this.currentRecipe = matchRecipe(this.host.craftGrid, 2);
    this.currentRecipe3 = matchRecipe(this.host.craftGrid3, 3);
  }

  private refreshResult(slot: HTMLElement, grid: (ItemStack | null)[], width: number): void {
    const rec = matchRecipe(grid, width);
    const old = slot.querySelector("canvas");
    if (old) old.remove();
    slot.querySelector(".slot-count")?.remove();
    slot.classList.toggle("has-recipe", !!rec);
    if (rec) {
      const out = rec.output;
      slot.appendChild(copyIcon(this.tex.icon(out.id), 38));
      slot.appendChild(el("span", "slot-count", String(out.count)));
      slot.title = `Fabricar: ${out.count}× ${itemDef(out.id).name}`;
    } else {
      slot.title = "Sem receita";
    }
  }

  /* --- drag & drop (modelo clique-pegar / clique-soltar) --- */

  private onSlotDown(e: MouseEvent, area: Area, index: number): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 && e.button !== 2) return;

    // modelo arrastar-e-soltar: mousedown SEMPRE pega (o mouseup solta no destino)
    if (this.held) return;
    const stack = this.getSlotStack(area, index);
    if (!stack) return;
    if (e.button === 0) {
      this.held = { item: { ...stack }, area, index };
      this.setSlotStack(area, index, null);
    } else {
      const half = Math.ceil(stack.count / 2);
      this.held = { item: { id: stack.id, count: half, dur: stack.dur }, area, index };
      const rest = stack.count - half;
      this.setSlotStack(area, index, rest > 0 ? { ...stack, count: rest } : null);
    }
    this.dragButton = e.button;
    this.showGhost();
    this.ghost.style.left = e.clientX + 12 + "px";
    this.ghost.style.top = e.clientY + 12 + "px";
    this.afterMutate();
  }

  private dropOn(area: Area, index: number, single: boolean): void {
    if (!this.held) return;
    const target = this.getSlotStack(area, index);
    const held = this.held.item;
    const max = itemDef(held.id).maxStack;

    if (single) {
      if (!target) {
        this.setSlotStack(area, index, { id: held.id, count: 1, dur: held.dur });
        held.count -= 1;
      } else if (target.id === held.id && target.count < max) {
        target.count += 1;
        held.count -= 1;
      }
      if (held.count <= 0) this.held = null;
    } else {
      if (!target) {
        this.setSlotStack(area, index, { ...held });
        this.held = null;
      } else if (target.id === held.id) {
        const move = Math.min(max - target.count, held.count);
        target.count += move;
        held.count -= move;
        if (held.count <= 0) this.held = null;
      } else {
        this.setSlotStack(area, index, { ...held });
        this.held = { item: { ...target }, area, index };
      }
    }
    this.updateGhost();
    this.afterMutate();
  }

  private onSlotDbl(area: Area, index: number): void {
    if (this.held || area !== "main") return;
    const stack = this.getSlotStack(area, index);
    if (!stack) return;
    const inHotbar = index < 9;
    const range: [number, number] = inHotbar ? [9, 36] : [0, 9];
    const max = itemDef(stack.id).maxStack;
    for (let i = range[0]; i < range[1]; i++) {
      const t = this.host.inventory[i];
      if (t && t.id === stack.id && t.count < max) {
        const move = Math.min(max - t.count, stack.count);
        t.count += move;
        stack.count -= move;
        if (stack.count <= 0) { this.setSlotStack(area, index, null); break; }
      }
    }
    if (this.getSlotStack(area, index)) {
      for (let i = range[0]; i < range[1]; i++) {
        if (!this.host.inventory[i]) {
          this.host.inventory[i] = stack;
          this.setSlotStack(area, index, null);
          break;
        }
      }
    }
    this.afterMutate();
  }

  private onDragMove = (e: MouseEvent): void => {
    if (!this.held) return;
    this.ghost.style.left = e.clientX + 12 + "px";
    this.ghost.style.top = e.clientY + 12 + "px";
  };

  private onDragEnd = (e: MouseEvent): void => {
    if (!this.held) return;
    // solta no slot que estiver sob o cursor (arrastar-e-soltar)
    const under = (e.target as HTMLElement | null)?.closest?.(".slot") as HTMLElement | null;
    const ref = under ? this.invSlots.get(under) : undefined;
    if (ref) {
      this.dropOn(ref.area, ref.index, false);
    }
    // se ainda restou algo na mão (sem drop ou pilha parcial), devolve à origem
    if (this.held) {
      const back = this.getSlotStack(this.held.area, this.held.index);
      if (!back) this.setSlotStack(this.held.area, this.held.index, { ...this.held.item });
      else if (back.id === this.held.item.id) {
        const max = itemDef(back.id).maxStack;
        const move = Math.min(max - back.count, this.held.item.count);
        back.count += move;
        this.held.item.count -= move;
        if (this.held.item.count > 0) this.setSlotStack(this.held.area, this.held.index, { ...this.held.item });
      }
      this.held = null;
    }
    this.ghost.style.display = "none";
    this.afterMutate();
  };

  private showGhost(): void {
    this.ghost.innerHTML = "";
    this.updateGhost();
    this.ghost.style.display = "block";
  }

  private updateGhost(): void {
    if (!this.held) { this.ghost.style.display = "none"; return; }
    this.ghost.innerHTML = "";
    this.ghost.appendChild(copyIcon(this.tex.icon(this.held.item.id), 34));
    if (this.held.item.count > 1) {
      this.ghost.appendChild(el("span", "slot-count", String(this.held.item.count)));
    }
  }

  private afterMutate(): void {
    this.refreshInventory();
    this.host.invChanged();
  }

  /* ---------------- Loading ---------------- */

  private buildLoading(): void {
    this.loadingEl = el("div", "screen loading-screen");
    this.loadingEl.innerHTML = `
      <div class="load-box">
        <div class="vw-title small"><span class="t-voxel">VOXEL</span> <span class="t-world">WORLD</span></div>
        <div class="load-track"><div class="load-fill" style="width:0%"></div></div>
        <div class="load-label">Preparando…</div>
      </div>`;
    this.loadBar = this.loadingEl.querySelector(".load-fill") as HTMLElement;
    this.loadLabel = this.loadingEl.querySelector(".load-label") as HTMLElement;
    this.root.appendChild(this.loadingEl);
  }

  dispose(): void {
    window.removeEventListener("mousemove", this.onDragMove);
    window.removeEventListener("mouseup", this.onDragEnd);
    this.root.remove();
  }
}

function sliderRow(id: string, label: string, min: number, max: number, step: number, suffix = ""): string {
  return `<label class="set-row"><span>${label}</span>
    <span class="set-ctl"><input id="set-${id}" type="range" min="${min}" max="${max}" step="${step}" data-suffix="${suffix}">
    <output id="out-${id}" class="set-out"></output></span></label>`;
}
