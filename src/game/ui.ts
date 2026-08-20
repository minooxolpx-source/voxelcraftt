/**
 * UI — toda a interface em DOM (menus, HUD, hotbar, inventário com
 * arrastar-e-soltar, crafting 2x2, configurações, toasts e loading).
 */
import { RECIPES, itemDef, matchRecipe } from "./blocks";
import type { ItemStack, Recipe } from "./blocks";
import type { Settings } from "./save";
import type { TexturePack } from "./textures";

export interface UIHost {
  settings: Settings;
  seed: number;
  selectedSlot: number;
  inventory: (ItemStack | null)[];
  craftGrid: (ItemStack | null)[];
  applySettings(p: Partial<Settings>): void;
  startContinue(): void;
  newWorld(): void;
  saveWorld(manual: boolean): void;
  resume(): void;
  toMenu(): void;
  selectSlot(i: number): void;
  invChanged(): void;
  tryCraft(r: Recipe): boolean;
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

const CONTROLS: [string, string][] = [
  ["W A S D", "mover"], ["Mouse", "olhar"], ["Espaço", "pular / nadar"],
  ["Shift", "correr"], ["Botão esq.", "quebrar bloco"], ["Botão dir.", "colocar bloco"],
  ["1–9 / roda", "hotbar"], ["E", "inventário"], ["ESC", "pausa"],
];

export class UI {
  private root: HTMLElement;
  private host: UIHost;
  private tex: TexturePack;

  private hotbarEl!: HTMLElement;
  private hotSlots: HTMLElement[] = [];
  private statsEl!: HTMLElement;
  private mineBar!: HTMLElement;
  private crosshair!: HTMLElement;
  private toastBox!: HTMLElement;
  private waterFx!: HTMLElement;
  private hudEl!: HTMLElement;

  private mainMenu!: HTMLElement;
  private pauseMenu!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private invScreen!: HTMLElement;
  private loadingEl!: HTMLElement;
  private loadBar!: HTMLElement;
  private loadLabel!: HTMLElement;

  private invSlots = new Map<HTMLElement, { area: "main" | "craft"; index: number }>();
  private resultSlot!: HTMLElement;
  private settingsCtx: "menu" | "pause" = "menu";
  private held: { item: ItemStack; area: "main" | "craft"; index: number } | null = null;
  private ghost!: HTMLElement;
  private currentRecipe: Recipe | null = null;

  constructor(container: HTMLElement, host: UIHost, tex: TexturePack) {
    this.root = el("div", "vw-root");
    container.appendChild(this.root);
    this.host = host;
    this.tex = tex;
    this.buildHUD();
    this.buildMenus();
    this.buildInventory();
    this.buildSettings();
    this.buildLoading();
    this.ghost = el("div", "drag-ghost");
    this.ghost.style.display = "none";
    this.root.appendChild(this.ghost);

    window.addEventListener("mousemove", this.onDragMove);
    window.addEventListener("mouseup", this.onDragEnd);
  }

  get canvasHost(): HTMLElement { return this.root; }

  /* ---------------- HUD ---------------- */

  private buildHUD(): void {
    this.hudEl = el("div", "hud");
    this.hudEl.style.display = "none";

    this.crosshair = el("div", "crosshair", `<span class="ch-v"></span><span class="ch-h"></span>`);
    this.mineBar = el("div", "mine-bar", `<div class="mine-fill"></div>`);
    this.statsEl = el("div", "stats");
    this.toastBox = el("div", "toasts");
    this.waterFx = el("div", "water-fx");

    this.hotbarEl = el("div", "hotbar");
    for (let i = 0; i < 9; i++) {
      const s = el("div", "slot hot-slot");
      s.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-count"></span>`;
      s.addEventListener("click", () => this.host.selectSlot(i));
      this.hotSlots.push(s);
      this.hotbarEl.appendChild(s);
    }

    const hint = el("div", "hint");
    hint.innerHTML = CONTROLS.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join("");

    this.hudEl.append(this.crosshair, this.mineBar, this.statsEl, this.hotbarEl, hint);
    this.root.append(this.hudEl, this.toastBox, this.waterFx);
  }

  setHUDVisible(v: boolean): void {
    this.hudEl.style.display = v ? "block" : "none";
    this.crosshair.style.display = v ? "flex" : "none";
  }

  updateHotbar(): void {
    const inv = this.host.inventory;
    for (let i = 0; i < 9; i++) {
      const s = this.hotSlots[i];
      s.classList.toggle("sel", i === this.host.selectedSlot);
      const item = inv[i];
      const old = s.querySelector("canvas");
      if (old) old.remove();
      const countEl = s.querySelector(".slot-count")!;
      if (item) {
        s.appendChild(copyIcon(this.tex.icon(item.id), 34));
        s.title = itemDef(item.id).name;
        countEl.textContent = item.count > 1 ? String(item.count) : "";
      } else {
        s.title = "";
        countEl.textContent = "";
      }
    }
  }

  updateStats(fps: number, x: number, y: number, z: number, chunks: number, dayStr: string): void {
    this.statsEl.innerHTML =
      `<span class="st-fps">${fps} FPS</span>` +
      `<span>XYZ ${x} / ${y} / ${z}</span>` +
      `<span>${dayStr}</span>` +
      `<span>${chunks} chunks</span>`;
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
    // --- menu principal ---
    this.mainMenu = el("div", "screen menu-screen");
    const left = el("div", "menu-left");
    left.innerHTML = `
      <div class="title-block">
        <div class="vw-kicker">sandbox voxel no navegador</div>
        <h1 class="vw-title"><span class="t-voxel">VOXEL</span><span class="t-world">WORLD</span></h1>
        <p class="vw-sub">Minere, construa e explore um mundo infinito de blocos gerado na hora — com cavernas, minérios, árvores e ciclo de dia e noite.</p>
      </div>
      <div class="menu-buttons">
        <button class="btn btn-primary" data-act="play"></button>
        <button class="btn" data-act="new">Novo Mundo</button>
        <button class="btn" data-act="settings">Configurações</button>
      </div>
      <div class="menu-footer">versão 1.0 · seed <span class="seed-val"></span> · three.js</div>`;
    const right = el("div", "menu-right");
    right.innerHTML = `<div class="panel controls-panel"><h3>Controles</h3>` +
      CONTROLS.map(([k, v]) => `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join("") + `</div>`;
    this.mainMenu.append(left, right);
    this.mainMenu.querySelector('[data-act="play"]')!.addEventListener("click", () => { this.audioTick(); this.host.startContinue(); });
    this.mainMenu.querySelector('[data-act="new"]')!.addEventListener("click", () => { this.audioTick(); this.host.newWorld(); });
    this.mainMenu.querySelector('[data-act="settings"]')!.addEventListener("click", () => { this.audioTick(); this.openSettings("menu"); });
    (this.mainMenu.querySelector(".seed-val") as HTMLElement).textContent = String(this.host.seed);
    this.root.appendChild(this.mainMenu);

    // --- pausa ---
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
  }

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
      // label() só atualiza o texto; upd() também aplica no jogo
      const label = () => {
        const v = parseFloat(input.value);
        out.textContent = (id === "vol" ? Math.round(v * 100) + "%" : id === "sens" ? v.toFixed(1) : String(v)) + (input.dataset.suffix ?? "");
      };
      const upd = () => { label(); fn(parseFloat(input.value)); };
      input.addEventListener("input", upd);
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
    // sincroniza apenas os rótulos — sem disparar applySettings na construção
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
    else { this.pauseMenu.style.display = "flex"; }
  }

  /* ---------------- Inventário + Crafting ---------------- */

  private buildInventory(): void {
    this.invScreen = el("div", "screen inv-screen");
    this.invScreen.style.display = "none";
    const wrap = el("div", "inv-wrap");

    // crafting
    const craftPanel = el("div", "panel inv-panel");
    craftPanel.innerHTML = `<h3 class="inv-title">Fabricação 2×2</h3>`;
    const craftRow = el("div", "craft-row");
    const grid = el("div", "craft-grid");
    for (let i = 0; i < 4; i++) grid.appendChild(this.makeSlot("craft", i));
    this.resultSlot = el("div", "slot result-slot");
    this.resultSlot.title = "Clique para fabricar";
    this.resultSlot.addEventListener("mouseup", () => {
      if (this.held) return; // dropando algo aqui — o onDragEnd devolve à origem
      if (this.currentRecipe && this.host.tryCraft(this.currentRecipe)) this.refreshInventory();
    });
    const arrow = el("div", "craft-arrow", `<svg width="26" height="16" viewBox="0 0 26 16" fill="none"><path d="M1 8h20M15 2l7 6-7 6" stroke="#9fb3a0" stroke-width="2.4" stroke-linecap="square"/></svg>`);
    craftRow.append(grid, arrow, this.resultSlot);
    craftPanel.appendChild(craftRow);

    // receitas
    const recPanel = el("div", "panel inv-panel rec-panel");
    recPanel.innerHTML = `<h3 class="inv-title">Receitas</h3><div class="rec-list"></div>`;
    const recList = recPanel.querySelector(".rec-list")!;
    for (const r of RECIPES) {
      const row = el("div", "rec-row");
      const inputs = Object.entries(r.inputs).map(([id, n]) => `${n}× ${itemDef(id).name}`).join(" + ");
      const iconWrap = el("span", "rec-icon");
      iconWrap.appendChild(copyIcon(this.tex.icon(r.output.id), 26));
      row.append(el("span", "rec-in", inputs), iconWrap, el("span", "rec-out", `${r.output.count}× ${itemDef(r.output.id).name}`));
      recList.appendChild(row);
    }

    // mochila
    const invPanel = el("div", "panel inv-panel");
    invPanel.innerHTML = `<h3 class="inv-title">Mochila</h3>`;
    const gridMain = el("div", "inv-grid");
    for (let i = 9; i < 36; i++) gridMain.appendChild(this.makeSlot("main", i));
    invPanel.appendChild(gridMain);
    const hb = el("div", "inv-grid inv-hotbar");
    for (let i = 0; i < 9; i++) hb.appendChild(this.makeSlot("main", i));
    invPanel.appendChild(el("h3", "inv-title sub", "Hotbar"));
    invPanel.appendChild(hb);

    wrap.append(craftPanel, recPanel, invPanel);
    const esc = el("div", "inv-esc", "E ou ESC para fechar · arraste com o mouse · clique direito divide/coloca 1 · duplo clique move entre hotbar e mochila");
    this.invScreen.append(wrap, esc);
    this.root.appendChild(this.invScreen);
  }

  private makeSlot(area: "main" | "craft", index: number): HTMLElement {
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
      this.refreshInventory();
    }
  }

  private getSlotStack(area: "main" | "craft", i: number): ItemStack | null {
    return area === "main" ? this.host.inventory[i] : this.host.craftGrid[i];
  }

  private setSlotStack(area: "main" | "craft", i: number, v: ItemStack | null): void {
    if (area === "main") this.host.inventory[i] = v;
    else this.host.craftGrid[i] = v;
  }

  refreshInventory(): void {
    for (const [s, ref] of this.invSlots) {
      const item = this.getSlotStack(ref.area, ref.index);
      const old = s.querySelector("canvas");
      if (old) old.remove();
      const countEl = s.querySelector(".slot-count")!;
      if (item) {
        s.appendChild(copyIcon(this.tex.icon(item.id), 34));
        s.title = itemDef(item.id).name;
        countEl.textContent = item.count > 1 ? String(item.count) : "";
      } else {
        s.title = "";
        countEl.textContent = "";
      }
    }
    this.refreshResult();
  }

  private refreshResult(): void {
    this.currentRecipe = matchRecipe(this.host.craftGrid);
    const old = this.resultSlot.querySelector("canvas");
    if (old) old.remove();
    const cnt = this.resultSlot.querySelector(".slot-count") as HTMLElement | null;
    cnt?.remove();
    this.resultSlot.classList.toggle("has-recipe", !!this.currentRecipe);
    if (this.currentRecipe) {
      const out = this.currentRecipe.output;
      this.resultSlot.appendChild(copyIcon(this.tex.icon(out.id), 38));
      const c = el("span", "slot-count", String(out.count));
      this.resultSlot.appendChild(c);
      this.resultSlot.title = `Fabricar: ${out.count}× ${itemDef(out.id).name}`;
    } else {
      this.resultSlot.title = "Sem receita";
    }
  }

  /* --- drag & drop --- */

  private onSlotDown(e: MouseEvent, area: "main" | "craft", index: number): void {
    e.preventDefault();
    if (e.button !== 0 && e.button !== 2) return;
    if (this.held) return; // soltar (mouseup) é que faz o drop — modelo "arrastar e soltar"
    const stack = this.getSlotStack(area, index);
    if (!stack) return;
    if (e.button === 0) {
      this.held = { item: { ...stack }, area, index };
      this.setSlotStack(area, index, null);
    } else {
      // botão direito pega metade da pilha
      const half = Math.ceil(stack.count / 2);
      this.held = { item: { id: stack.id, count: half }, area, index };
      const rest = stack.count - half;
      this.setSlotStack(area, index, rest > 0 ? { id: stack.id, count: rest } : null);
    }
    this.showGhost();
    this.ghost.style.left = e.clientX + 12 + "px";
    this.ghost.style.top = e.clientY + 12 + "px";
    this.afterMutate();
  }

  private dropOn(area: "main" | "craft", index: number, single: boolean): void {
    if (!this.held) return;
    const target = this.getSlotStack(area, index);
    const held = this.held.item;
    const max = itemDef(held.id).maxStack;

    if (single) {
      if (!target) {
        this.setSlotStack(area, index, { id: held.id, count: 1 });
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
        const room = max - target.count;
        const move = Math.min(room, held.count);
        target.count += move;
        held.count -= move;
        if (held.count <= 0) this.held = null;
      } else {
        // troca
        this.setSlotStack(area, index, { ...held });
        this.held = { item: { ...target }, area, index };
      }
    }
    this.updateGhost();
    this.afterMutate();
  }

  private onSlotDbl(area: "main" | "craft", index: number): void {
    if (this.held || area === "craft") return;
    const stack = this.getSlotStack(area, index);
    if (!stack) return;
    const inHotbar = index < 9;
    const range = inHotbar ? [9, 36] : [0, 9];
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
    // caiu em cima de um slot? → drop
    const slotEl = (e.target as HTMLElement | null)?.closest?.(".slot") as HTMLElement | null;
    const ref = slotEl ? this.invSlots.get(slotEl) : undefined;
    if (ref) this.dropOn(ref.area, ref.index, e.button === 2);
    // sobras voltam para a origem (ou o stack inteiro, se não houve drop)
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
      const c = el("span", "slot-count", String(this.held.item.count));
      this.ghost.style.position = "fixed";
      this.ghost.appendChild(c);
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
