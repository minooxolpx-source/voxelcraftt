/**
 * Game — orquestrador principal: renderer Three.js, loop, input (Pointer Lock),
 * mineração/construção, inventário, salvamento e máquina de estados
 * (carregando → menu → jogando → pausado → inventário).
 */
import * as THREE from "three";
import { B, ITEMS, blockDef, breakTime, itemDef } from "./blocks";
import type { ItemStack, Recipe } from "./blocks";
import { makeTextures } from "./textures";
import type { TexturePack } from "./textures";
import { AudioManager } from "./audio";
import { SaveManager, DEFAULT_SETTINGS } from "./save";
import type { Settings, SaveData } from "./save";
import { World } from "./world";
import { CHUNK, HEIGHT, SEA } from "./mesher";
import { Player } from "./player";
import { ParticleSystem } from "./particles";
import { Sky, DAY_LENGTH } from "./sky";
import { UI } from "./ui";
import type { UIHost } from "./ui";

type State = "loading" | "menu" | "playing" | "paused" | "inventory";

export class Game implements UIHost {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private tex!: TexturePack;
  private ui!: UI;
  private audio = new AudioManager();
  private world!: World;
  private sky!: Sky;
  private particles!: ParticleSystem;
  private player = new Player();
  private highlight!: THREE.LineSegments;

  private state: State = "loading";
  settings: Settings = { ...DEFAULT_SETTINGS };
  inventory: (ItemStack | null)[] = new Array(36).fill(null);
  craftGrid: (ItemStack | null)[] = new Array(4).fill(null);
  selectedSlot = 0;
  private expectUnlock = false;
  private started = false; // já entrou em jogo ao menos uma vez
  private spawn = new THREE.Vector3(8.5, 40, 8.5);

  // input
  private keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
  private mouseL = false;
  private mouseR = false;

  // mineração / construção
  private mineKey = "";
  private mineProgress = 0;
  private placeCd = 0;
  private digTickCd = 0;
  private lastHit: { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number } | null = null;

  // stats / autosave
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private statsTimer = 0;
  private saveTimer = 0;
  private lastTime = 0;
  private orbitAngle = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    try {
      this.init();
    } catch (e) {
      console.error("[Game] Falha na inicialização:", e);
      const msg = e instanceof Error ? e.message : String(e);
      container.innerHTML = `<div style="color:#e8efe6;font-family:monospace;padding:2rem;background:#0d120f;height:100vh">
        <h2>Erro ao iniciar o jogo</h2><p>${msg}</p><p>Verifique se seu navegador suporta WebGL.</p></div>`;
    }
  }

  get seed(): number { return this.world?.seed ?? 0; }

  /* ================================================================ */
  /* Inicialização                                                     */
  /* ================================================================ */

  private init(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.rotation.order = "YXZ";

    this.tex = makeTextures();

    const save = SaveManager.load();
    const seed = save?.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.world = new World(this.scene, this.tex, seed);
    if (save) {
      this.world.loadDeltas(save.deltas ?? {});
      this.settings = this.sanitizeSettings({ ...DEFAULT_SETTINGS, ...save.settings });
      // inventário: aceita apenas itens válidos do registro
      this.inventory = save.inventory.slice(0, 36).map((it) => {
        if (!it || typeof it.id !== "string" || !ITEMS[it.id]) return null;
        const max = ITEMS[it.id].maxStack;
        const count = Math.max(1, Math.min(max, Math.floor(it.count) || 1));
        return { id: it.id, count };
      });
      while (this.inventory.length < 36) this.inventory.push(null);
      // posição: só usa se todos os números forem finitos
      const pp = save.player;
      if (pp && [pp.x, pp.y, pp.z, pp.yaw, pp.pitch].every((v) => typeof v === "number" && isFinite(v))) {
        this.player.pos.set(pp.x, pp.y, pp.z);
        this.player.yaw = pp.yaw;
        this.player.pitch = pp.pitch;
      } else {
        this.hasSavedPos = false;
      }
      if (typeof save.timeOfDay === "number" && isFinite(save.timeOfDay)) this.skyTime0 = save.timeOfDay;
    }

    this.sky = new Sky(this.scene);
    if (this.skyTime0 !== null) this.sky.time = this.skyTime0;
    this.particles = new ParticleSystem(this.scene);

    // contorno do bloco mirado
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // UI por último: os sliders de configuração disparam applySettings(),
    // então o host (mundo, câmera, renderer) já precisa estar pronto
    this.ui = new UI(this.container, this, this.tex);

    this.applySettings({}); // aplica qualidade/pixel ratio/FOV iniciais
    this.bindInput();
    this.bindPlayerHooks();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("beforeunload", this.onBeforeUnload);

    this.renderer.setAnimationLoop(this.loop);
    void this.bootWorld(!!save);
  }

  private skyTime0: number | null = null;
  private hasSavedPos = true;

  /** Valida valores vindos do localStorage (nunca confia em dado salvo). */
  private sanitizeSettings(s: Settings): Settings {
    const num = (v: unknown, min: number, max: number, dflt: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
    const q = Math.round(num(s.qualidade, 0, 2, 1));
    return {
      sensibilidade: num(s.sensibilidade, 0.2, 3, 1),
      fov: num(s.fov, 60, 110, 75),
      renderDist: num(s.renderDist, 2, 8, 5),
      volume: num(s.volume, 0, 1, 0.7),
      qualidade: (q === 0 || q === 1 || q === 2 ? q : 1),
    };
  }

  /** Encontra um ponto de spawn em terra firme (espiral a partir do centro). */
  private findLandSpot(cx: number, cz: number): { x: number; z: number } {
    if (this.world.heightAt(cx, cz) > SEA + 1) return { x: cx, z: cz };
    for (let r = 1; r <= 9; r++) {
      for (let a = 0; a < 8 * r; a++) {
        const ang = (a / (8 * r)) * Math.PI * 2;
        const x = cx + Math.round(Math.cos(ang) * r * 6);
        const z = cz + Math.round(Math.sin(ang) * r * 6);
        if (this.world.heightAt(x, z) > SEA + 1) return { x, z };
      }
    }
    return { x: cx, z: cz };
  }

  private async bootWorld(hasSave: boolean): Promise<void> {
    this.ui.setLoading(0.05, "Gerando terreno…");
    const rd = this.effectiveRenderDist();
    // com save, carrega em volta da posição salva; sem save, procura terra firme perto da origem
    let sx: number, sz: number;
    if (hasSave && this.hasSavedPos) {
      sx = Math.floor(this.player.pos.x);
      sz = Math.floor(this.player.pos.z);
    } else {
      const spot = this.findLandSpot(8, 8);
      sx = spot.x; sz = spot.z;
    }
    await this.world.initialLoad(Math.max(3, rd), sx, sz, (p) =>
      this.ui.setLoading(0.05 + p * 0.9, p < 0.7 ? "Gerando terreno…" : "Construindo meshes…"),
    );
    if (this.disposed) return;
    const topY = this.world.surfaceHeight(sx, sz);
    this.spawn.set(sx + 0.5, topY, sz + 0.5);
    if (!hasSave || !this.hasSavedPos) this.player.pos.set(this.spawn.x, topY + 0.05, this.spawn.z);
    this.ui.hideLoading();
    this.state = "menu";
    this.ui.showMainMenu(hasSave);
  }

  /* ================================================================ */
  /* UIHost                                                            */
  /* ================================================================ */

  uiClick(): void { this.audio.unlock(); this.audio.uiClick(); }

  applySettings(p: Partial<Settings>): void {
    this.settings = { ...this.settings, ...p };
    const s = this.settings;
    if (this.camera) {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    this.audio.setVolume(s.volume);
    // world pode não existir ainda durante a inicialização da UI
    if (this.world) this.world.renderDist = this.effectiveRenderDist();
    const caps = [0.85, 1.5, 2];
    if (this.renderer) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, caps[s.qualidade]));
  }

  private effectiveRenderDist(): number {
    const mult = [0.7, 1, 1.25][this.settings.qualidade];
    return Math.max(2, Math.min(10, Math.round(this.settings.renderDist * mult)));
  }

  startContinue(): void {
    this.audio.unlock();
    this.enterPlay();
  }

  newWorld(): void {
    this.audio.unlock();
    SaveManager.clear();
    // recria o mundo com nova seed
    this.world.dispose();
    const seed = (Math.random() * 2 ** 31) | 0;
    this.world = new World(this.scene, this.tex, seed);
    this.world.renderDist = this.effectiveRenderDist();
    this.inventory = new Array(36).fill(null);
    this.craftGrid = new Array(4).fill(null);
    this.player = new Player();
    this.bindPlayerHooks();
    this.ui.setLoading(0.05, "Criando novo mundo…");
    const spot = this.findLandSpot(8, 8);
    const sx = spot.x, sz = spot.z;
    void this.world.initialLoad(Math.max(3, this.effectiveRenderDist()), sx, sz, (p) =>
      this.ui.setLoading(0.05 + p * 0.9, "Criando novo mundo…"),
    ).then(() => {
      if (this.disposed) return;
      const topY = this.world.surfaceHeight(sx, sz);
      this.spawn.set(sx + 0.5, topY, sz + 0.5);
      this.player.pos.set(this.spawn.x, topY + 0.05, this.spawn.z);
      this.player.yaw = 0; this.player.pitch = 0;
      this.sky.time = DAY_LENGTH * 0.08;
      this.ui.hideLoading();
      this.ui.toast("Novo mundo criado");
      this.enterPlay();
    });
  }

  saveWorld(manual: boolean): void {
    if (!this.world) return;
    const data: SaveData = {
      version: 1,
      seed: this.world.seed,
      player: {
        x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
        yaw: this.player.yaw, pitch: this.player.pitch,
      },
      inventory: this.inventory,
      deltas: this.world.serializeDeltas(),
      settings: this.settings,
      timeOfDay: this.sky.time % DAY_LENGTH,
    };
    const ok = SaveManager.save(data);
    if (manual) this.ui.toast(ok ? "Mundo salvo" : "Erro ao salvar (veja o console)");
  }

  resume(): void { this.enterPlay(); }

  toMenu(): void {
    this.saveWorld(false);
    this.state = "menu";
    // o menu orbital passa a girar em volta de onde o jogador está
    this.spawn.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.ui.showPause(false);
    this.ui.showMainMenu(true);
  }

  selectSlot(i: number): void {
    if (i === this.selectedSlot) return;
    this.selectedSlot = i;
    this.audio.uiClick();
    this.ui.updateHotbar();
  }

  invChanged(): void {
    this.ui.updateHotbar();
  }

  tryCraft(r: Recipe): boolean {
    // consome os insumos da grade
    const need = { ...r.inputs };
    for (let i = 0; i < 4; i++) {
      const s = this.craftGrid[i];
      if (!s) continue;
      const take = Math.min(s.count, need[s.id] ?? 0);
      s.count -= take;
      need[s.id] -= take;
      if (s.count <= 0) this.craftGrid[i] = null;
    }
    for (const k of Object.keys(need)) if (need[k] > 0) return false;
    this.giveItem(r.output.id, r.output.count);
    this.audio.craft();
    return true;
  }

  /* ================================================================ */
  /* Fluxo de estados                                                  */
  /* ================================================================ */

  private enterPlay(): void {
    this.started = true;
    this.state = "playing";
    this.ui.showPause(false);
    this.ui.showInventory(false);
    this.ui.setHUDVisible(true);
    this.ui.updateHotbar();
    this.requestLock(4);
  }

  private requestLock(retries: number): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          if (retries > 0 && !this.disposed) setTimeout(() => this.requestLock(retries - 1), 400);
        });
      }
    } catch {
      if (retries > 0 && !this.disposed) setTimeout(() => this.requestLock(retries - 1), 400);
    }
  }

  private get locked(): boolean { return document.pointerLockElement === this.canvas; }

  private openInventory(): void {
    this.state = "inventory";
    this.mouseL = false; this.mouseR = false;
    this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
    this.ui.showInventory(true);
    this.ui.setMineProgress(0);
    if (this.locked) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }

  private closeInventory(): void {
    this.state = "playing";
    this.ui.showInventory(false);
    this.requestLock(4);
  }

  /* ================================================================ */
  /* Input                                                             */
  /* ================================================================ */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    this.audio.unlock();
    switch (e.code) {
      case "KeyW": this.keys.w = true; break;
      case "KeyA": this.keys.a = true; break;
      case "KeyS": this.keys.s = true; break;
      case "KeyD": this.keys.d = true; break;
      case "Space": this.keys.space = true; e.preventDefault(); break;
      case "ShiftLeft": case "ShiftRight": this.keys.shift = true; break;
      case "KeyE":
        if (this.state === "playing") this.openInventory();
        else if (this.state === "inventory") this.closeInventory();
        break;
      case "Escape":
        if (this.state === "inventory") { e.preventDefault(); this.closeInventory(); }
        break;
      default: {
        if (e.code.startsWith("Digit") && this.state === "playing") {
          const n = parseInt(e.code.slice(5), 10);
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        }
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "KeyW": this.keys.w = false; break;
      case "KeyA": this.keys.a = false; break;
      case "KeyS": this.keys.s = false; break;
      case "KeyD": this.keys.d = false; break;
      case "Space": this.keys.space = false; break;
      case "ShiftLeft": case "ShiftRight": this.keys.shift = false; break;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.state !== "playing") return;
    const sens = 0.0022 * this.settings.sensibilidade;
    this.player.yaw -= e.movementX * sens;
    this.player.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.01;
    this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.audio.unlock();
    // cliques na UI (hotbar, telas) não são ações de jogo
    const t = e.target as HTMLElement | null;
    if (t && t.closest && t.closest(".hotbar, .screen, .toasts")) return;
    if (this.state === "playing" && !this.locked) {
      this.requestLock(4);
      return;
    }
    if (this.state !== "playing" || !this.locked) return;
    if (e.button === 0) { this.mouseL = true; }
    else if (e.button === 2) {
      this.mouseR = true;
      this.tryPlace();
    } else if (e.button === 1) {
      e.preventDefault();
      this.pickBlock();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) { this.mouseL = false; this.mineProgress = 0; this.mineKey = ""; this.ui.setMineProgress(0); }
    if (e.button === 2) this.mouseR = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.state !== "playing") return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectSlot((this.selectedSlot + dir + 9) % 9);
  };

  private onLockChange = (): void => {
    if (this.locked) {
      if (this.state === "paused" || this.state === "menu") {
        this.state = "playing";
        this.ui.showPause(false);
        this.ui.setHUDVisible(true);
      }
      return;
    }
    if (this.expectUnlock) { this.expectUnlock = false; return; }
    if (this.state === "playing") {
      this.state = "paused";
      this.mouseL = false; this.mouseR = false;
      this.ui.setMineProgress(0);
      this.ui.showPause(true);
    }
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onBeforeUnload = (): void => {
    if (this.started && this.world) this.saveWorld(false);
  };

  private bindInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  private onContextMenu = (e: Event): void => {
    // botão direito é ação de jogo — bloqueia o menu de contexto durante a partida
    if (this.state === "playing" || this.state === "inventory") e.preventDefault();
  };

  private bindPlayerHooks(): void {
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = (imp) => { if (imp > 0.25) this.audio.land(); };
    this.player.onSplash = () => this.audio.splash();
    this.player.onStep = (surface) => {
      if (surface === "agua") this.audio.swim();
      else this.audio.step(surface as "grama" | "terra" | "pedra" | "areia" | "madeira" | "areia_fofa");
    };
  }

  /* ================================================================ */
  /* Mineração / construção                                            */
  /* ================================================================ */

  private raycastFromCamera(): ReturnType<World["raycast"]> {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const o = this.camera.position;
    return this.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 6);
  }

  private heldTool() {
    const sel = this.inventory[this.selectedSlot];
    return sel ? itemDef(sel.id).tool : undefined;
  }

  private updateMining(dt: number): void {
    const hit = this.raycastFromCamera();
    this.lastHit = hit;

    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    if (!this.mouseL || !hit) {
      this.mineProgress = 0;
      this.mineKey = "";
      this.ui.setMineProgress(0);
      return;
    }

    const bd = blockDef(hit.id);
    if (!isFinite(bd.hardness)) {
      this.ui.setMineProgress(0);
      return;
    }

    const key = hit.x + "," + hit.y + "," + hit.z;
    if (key !== this.mineKey) {
      this.mineKey = key;
      this.mineProgress = 0;
    }

    const total = breakTime(hit.id, this.heldTool());
    this.mineProgress += dt / total;
    this.digTickCd -= dt;
    if (this.digTickCd <= 0) { this.audio.digTick(); this.digTickCd = 0.22; }
    this.ui.setMineProgress(Math.min(1, this.mineProgress));

    if (this.mineProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, hit.id);
      this.mineProgress = 0;
      this.mineKey = "";
    }
  }

  private breakBlock(x: number, y: number, z: number, id: number): void {
    const bd = blockDef(id);
    this.world.setBlock(x, y, z, B.AIR);
    this.particles.emit(x, y, z, this.tex.blockColor(id), id === B.FOLHAS ? 10 : 16);
    this.audio.breakBlock(bd.hardness);
    if (bd.drop) this.giveItem(bd.drop, 1);
    else if (id === B.FOLHAS && Math.random() < 0.12) this.giveItem("graveto", 1);
  }

  private tryPlace(): void {
    if (this.placeCd > 0) return;
    const hit = this.lastHit ?? this.raycastFromCamera();
    if (!hit) return;
    const sel = this.inventory[this.selectedSlot];
    if (!sel) { this.audio.denied(); return; }
    const def = itemDef(sel.id);
    if (def.kind !== "block" || def.block === undefined) { this.audio.denied(); return; }

    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    if (py < 1 || py >= HEIGHT) return;
    const cur = this.world.getBlock(px, py, pz);
    if (cur !== B.AIR && cur !== B.AGUA) return;
    if (this.player.intersectsCell(px, py, pz)) return;

    this.world.setBlock(px, py, pz, def.block);
    sel.count -= 1;
    if (sel.count <= 0) this.inventory[this.selectedSlot] = null;
    this.ui.updateHotbar();
    this.audio.place();
    this.placeCd = 0.23;
  }

  private pickBlock(): void {
    const hit = this.lastHit;
    if (!hit) return;
    const itemId = Object.values(ITEMS).find((it) => it.kind === "block" && it.block === hit.id)?.id;
    if (!itemId) return;
    const hot = this.inventory.findIndex((s, i) => i < 9 && s?.id === itemId);
    if (hot >= 0) { this.selectSlot(hot); return; }
    const main = this.inventory.findIndex((s) => s?.id === itemId);
    if (main >= 0) {
      const tmp = this.inventory[this.selectedSlot];
      this.inventory[this.selectedSlot] = this.inventory[main];
      this.inventory[main] = tmp;
      this.ui.updateHotbar();
      return;
    }
    this.ui.toast("Você não tem esse bloco");
  }

  giveItem(id: string, count: number): void {
    const def = itemDef(id);
    if (!def) { console.error("[Game] Item desconhecido:", id); return; }
    let left = count;
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && s.count < def.maxStack) {
        const mv = Math.min(def.maxStack - s.count, left);
        s.count += mv; left -= mv;
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.inventory[i]) {
        const mv = Math.min(def.maxStack, left);
        this.inventory[i] = { id, count: mv };
        left -= mv;
      }
    }
    if (left > 0) this.ui.toast("Inventário cheio — item perdido");
    else this.audio.pickup();
    this.ui.updateHotbar();
  }

  /* ================================================================ */
  /* Loop principal                                                    */
  /* ================================================================ */

  private loop = (time: number): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;

    // céu sempre anima (dia/noite continua até no menu)
    this.sky.update(dt, this.camera.position, this.state === "playing" && this.player.eyesInWater, this.world.renderDist * CHUNK + 10);

    // água animada
    const wt = time * 0.001;
    this.tex.waterTexture.offset.set(wt * 0.015 % 1, wt * 0.009 % 1);
    this.world.waterMaterial.opacity = 0.7 + Math.sin(wt * 1.4) * 0.04;

    if (this.state === "playing") {
      this.updatePlaying(dt);
    } else if (this.state === "menu") {
      // câmera orbital sobre o spawn
      this.orbitAngle += dt * 0.06;
      const r = 34;
      const c = this.spawn;
      this.camera.position.set(c.x + Math.cos(this.orbitAngle) * r, c.y + 14 + Math.sin(wt * 0.2) * 2, c.z + Math.sin(this.orbitAngle) * r);
      this.camera.lookAt(c.x, c.y + 2, c.z);
      this.highlight.visible = false;
      // mantém mundo carregado em volta do spawn
      this.world.update(c.x, c.z, time);
    } else if (this.state === "paused" || this.state === "inventory") {
      this.world.update(this.player.pos.x, this.player.pos.z, time);
      this.highlight.visible = false;
    }

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);

    // FPS / stats
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.statsTimer += dt;
    if (this.statsTimer >= 0.25 && this.state === "playing") {
      this.statsTimer = 0;
      const p = this.player.pos;
      const h = this.sky.hourOfDay;
      const hh = String(Math.floor(h)).padStart(2, "0");
      const mm = String(Math.floor((h % 1) * 60)).padStart(2, "0");
      this.ui.updateStats(this.fps, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z),
        this.world.loadedCount, `Dia ${this.sky.dayNumber} · ${hh}:${mm}`);
    }

    // autosave
    if (this.started && (this.state === "playing" || this.state === "paused" || this.state === "inventory")) {
      this.saveTimer += dt;
      if (this.saveTimer > 45) {
        this.saveTimer = 0;
        this.saveWorld(false);
      }
    }
  };

  private updatePlaying(dt: number): void {
    const fwd = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0);
    const strafe = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
    this.player.update(dt, {
      forward: fwd, strafe,
      jump: this.keys.space,
      sprint: this.keys.shift,
    }, this.world);

    // câmera
    const eye = this.player.eyePosition;
    this.camera.position.copy(eye);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

    // FOV de corrida
    const sprinting = this.keys.shift && fwd > 0 && !this.player.inWater;
    const targetFov = this.settings.fov + (sprinting ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 10 * dt);
      this.camera.updateProjectionMatrix();
    }

    this.ui.setWaterOverlay(this.player.eyesInWater);

    this.placeCd -= dt;
    if (this.mouseR && this.placeCd <= 0) this.tryPlace();

    this.updateMining(dt);
    this.world.update(this.player.pos.x, this.player.pos.z, performance.now());
  }

  /* ================================================================ */

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (this.world) this.world.dispose();
    if (this.sky) this.sky.dispose();
    if (this.particles) this.particles.dispose();
    if (this.ui) this.ui.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
