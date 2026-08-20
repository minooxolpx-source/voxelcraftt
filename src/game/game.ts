/**
 * Game — orquestrador principal: renderer Three.js, loop, input (Pointer Lock
 * + fallback de arrastar), modos sobrevivência/criativo, mineração com tempos
 * estilo Minecraft, durabilidade de ferramentas, mobs, drops no chão, bancada
 * 3×3, cama, voo criativo, mão em primeira pessoa e salvamento.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { B, ITEMS, blockDef, breakTime, itemDef, gridBounds, patternBounds, RECIPES, recipeInputs } from "./blocks";
import type { ItemStack, Recipe } from "./blocks";
import { makeTextures } from "./textures";
import type { TexturePack } from "./textures";
import { AudioManager } from "./audio";
import { SaveManager, DEFAULT_SETTINGS } from "./save";
import type { Settings, SaveData, GameMode, ShaderMode } from "./save";
import { World } from "./world";
import { CHUNK, HEIGHT, SEA } from "./mesher";
import { Player } from "./player";
import { ParticleSystem } from "./particles";
import { Sky, DAY_LENGTH } from "./sky";
import { UI } from "./ui";
import type { UIHost } from "./ui";
import { Mobs } from "./mobs";
import { Drops } from "./drops";
import { ViewModel } from "./viewmodel";

type State = "loading" | "menu" | "playing" | "paused" | "inventory" | "crafting";

const MOB_COLORS: Record<string, number> = { porco: 0xe8a2a8, ovelha: 0xe8e8e2, sombra: 0x5a8f4a };

/* ------------------------------------------------------------------ */
/* Shaders de pós-processamento (opções gráficas)                      */
/* ------------------------------------------------------------------ */

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Vinheta + leve gradação de cor cinematográfica. */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.85 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.82, 0.3, length(d) * 1.32);
      c.rgb *= mix(1.0, vig, amount);
      c.rgb = pow(c.rgb, vec3(0.985, 1.0, 1.045)); // leve calor
      gl_FragColor = c;
    }`,
};

/** Cartoon: contorno escuro por detecção de bordas (Sobel) + posterização. */
const CartoonShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, strength: { value: 1.15 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float strength;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 tx = 1.0 / resolution;
      float tl = luma(texture2D(tDiffuse, vUv + tx * vec2(-1.0,  1.0)).rgb);
      float t  = luma(texture2D(tDiffuse, vUv + tx * vec2( 0.0,  1.0)).rgb);
      float tr = luma(texture2D(tDiffuse, vUv + tx * vec2( 1.0,  1.0)).rgb);
      float l  = luma(texture2D(tDiffuse, vUv + tx * vec2(-1.0,  0.0)).rgb);
      float r  = luma(texture2D(tDiffuse, vUv + tx * vec2( 1.0,  0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, vUv + tx * vec2(-1.0, -1.0)).rgb);
      float b  = luma(texture2D(tDiffuse, vUv + tx * vec2( 0.0, -1.0)).rgb);
      float br = luma(texture2D(tDiffuse, vUv + tx * vec2( 1.0, -1.0)).rgb);
      float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
      float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
      float edge = clamp(length(vec2(gx, gy)) * strength, 0.0, 1.0);
      vec4 c = texture2D(tDiffuse, vUv);
      // posterização suave (cara de cartoon)
      c.rgb = mix(floor(c.rgb * 7.0) / 7.0, c.rgb, 0.35);
      c.rgb = mix(c.rgb, vec3(0.043, 0.055, 0.05), edge);
      gl_FragColor = c;
    }`,
};

/** Retrô: pixelização forte + scanlines sutis (CRT). */
const RetroShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, pixels: { value: 260.0 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixels;
    varying vec2 vUv;
    void main() {
      vec2 grid = vec2(pixels * resolution.x / resolution.y, pixels);
      vec2 cell = floor(vUv * grid);
      vec2 uv = (cell + 0.5) / grid;
      vec4 c = texture2D(tDiffuse, uv);
      float scan = 0.94 + 0.06 * step(0.5, fract(vUv.y * grid.y));
      c.rgb *= scan;
      gl_FragColor = c;
    }`,
};

export class Game implements UIHost {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  // pós-processamento (shaders)
  private composer: EffectComposer | null = null;
  private vignettePass!: ShaderPass;
  private cartoonPass!: ShaderPass;
  private retroPass!: ShaderPass;
  private composerActive = false;
  // limite de FPS
  private lastFrameTime = 0;
  private tex!: TexturePack;
  private ui!: UI;
  private audio = new AudioManager();
  private world!: World;
  private sky!: Sky;
  private particles!: ParticleSystem;
  private mobs!: Mobs;
  private drops!: Drops;
  private view!: ViewModel;
  private player = new Player();
  private highlight!: THREE.LineSegments;

  private state: State = "loading";
  mode: GameMode = "survival";
  settings: Settings = { ...DEFAULT_SETTINGS };
  inventory: (ItemStack | null)[] = new Array(36).fill(null);
  craftGrid: (ItemStack | null)[] = new Array(9).fill(null); // 3×3 (quadrada)
  craftGrid3: (ItemStack | null)[] = new Array(9).fill(null);
  selectedSlot = 0;
  health = 20;
  private bedSpawn: { x: number; y: number; z: number } | null = null;

  private expectUnlock = false;
  private started = false;
  private spawn = new THREE.Vector3(8.5, 40, 8.5);
  /** nome do mundo ativo (sistema de múltiplos mundos salvos) */
  worldName: string | null = null;

  // input
  private keys = { w: false, a: false, s: false, d: false, space: false, shift: false, ctrl: false };
  private mouseL = false;
  private mouseR = false;
  private lockUnavailable = false;
  private rDownX = 0;
  private rDownY = 0;
  private lastSpaceTap = 0;

  // mineração / construção / combate
  private mineKey = "";
  private mineProgress = 0;
  private placeCd = 0;
  private digTickCd = 0;
  private attackCd = 0;
  private lastHit: { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number } | null = null;

  // sobrevivência
  private noDamageT = 99;
  private regenT = 0;

  // stats / autosave
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private statsTimer = 0;
  private saveTimer = 0;
  private lastTime = 0;
  private orbitAngle = 0;
  private disposed = false;
  private skyTime0: number | null = null;
  private hasSavedPos = true;

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
    this.scene.add(this.camera); // necessário para a mão (filha da câmera) renderizar

    this.tex = makeTextures();

    // mundo atual = último jogado (ou o primeiro da lista); save antigo é migrado
    const worlds = SaveManager.listWorlds();
    const cur = SaveManager.currentName();
    this.worldName = cur && worlds.some((w) => w.name === cur) ? cur : worlds[0]?.name ?? null;
    const save = this.worldName ? SaveManager.loadWorld(this.worldName) : null;
    const seed = save?.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.world = new World(this.scene, this.tex, seed);
    if (save) this.applySave(save);

    this.sky = new Sky(this.scene);
    if (this.skyTime0 !== null) this.sky.time = this.skyTime0;
    this.particles = new ParticleSystem(this.scene);
    this.mobs = new Mobs(this.scene, this.world);
    this.drops = new Drops(this.scene, this.world, this.tex);
    this.view = new ViewModel(this.tex);
    this.camera.add(this.view.group);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // UI por último: os controles disparam applySettings() no host já pronto
    this.ui = new UI(this.container, this, this.tex);

    // pós-processamento: vinheta / cartoon / retrô (desligado por padrão)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.vignettePass = new ShaderPass(VignetteShader);
    this.cartoonPass = new ShaderPass(CartoonShader);
    this.retroPass = new ShaderPass(RetroShader);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(this.cartoonPass);
    this.composer.addPass(this.retroPass);

    this.applySettings({});
    this.bindInput();
    this.bindPlayerHooks();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("beforeunload", this.onBeforeUnload);

    this.renderer.setAnimationLoop(this.loop);
    void this.bootWorld(!!save);
  }

  private sanitizeSettings(s: Settings): Settings {
    const num = (v: unknown, min: number, max: number, dflt: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
    const q = Math.round(num(s.qualidade, 0, 2, 1));
    let fps = Math.round(num(s.fpsLimit, 0, 240, 0));
    if (fps > 0 && fps < 20) fps = 20;
    const shaderOk: ShaderMode[] = ["off", "vinheta", "cartoon", "retro"];
    const shader = shaderOk.includes(s.shader as ShaderMode) ? (s.shader as ShaderMode) : "off";
    return {
      sensibilidade: num(s.sensibilidade, 0.2, 3, 1),
      fov: num(s.fov, 60, 110, 75),
      renderDist: num(s.renderDist, 2, 32, 5),
      volume: num(s.volume, 0, 1, 0.7),
      qualidade: (q === 0 || q === 1 || q === 2 ? q : 1),
      fpsLimit: fps,
      shader,
    };
  }

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
    if (this.world) this.world.renderDist = this.effectiveRenderDist();
    if (this.renderer) {
      const caps = [0.85, 1.5, 2];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, caps[s.qualidade]));
    }
    this.syncComposerSize();
    this.applyShaderSetting();
  }

  /** Liga/desliga os passes de shader conforme a opção escolhida. */
  private applyShaderSetting(): void {
    const s = this.settings.shader;
    if (this.vignettePass) this.vignettePass.enabled = s === "vinheta";
    if (this.cartoonPass) this.cartoonPass.enabled = s === "cartoon";
    if (this.retroPass) this.retroPass.enabled = s === "retro";
    this.composerActive = s !== "off" && this.composer !== null;
  }

  /** Mantém o composer no mesmo tamanho/pixelRatio do renderer. */
  private syncComposerSize(): void {
    if (!this.composer) return;
    const caps = [0.85, 1.5, 2];
    const pr = Math.min(window.devicePixelRatio || 1, caps[this.settings.qualidade]);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    const w = window.innerWidth * pr, h = window.innerHeight * pr;
    if (this.cartoonPass) (this.cartoonPass.uniforms["resolution"].value as THREE.Vector2).set(w, h);
    if (this.retroPass) (this.retroPass.uniforms["resolution"].value as THREE.Vector2).set(w, h);
  }

  private effectiveRenderDist(): number {
    const mult = [0.7, 1, 1.25][this.settings.qualidade];
    return Math.max(2, Math.min(32, Math.round(this.settings.renderDist * mult)));
  }

  /** Restaura todo o estado do jogo a partir de um save (com validação). */
  private applySave(save: SaveData): void {
    this.world.loadDeltas(save.deltas ?? {});
    this.settings = this.sanitizeSettings({ ...DEFAULT_SETTINGS, ...save.settings });
    this.mode = save.mode === "creative" ? "creative" : "survival";
    this.health = typeof save.health === "number" && isFinite(save.health) ? Math.max(1, Math.min(20, Math.round(save.health))) : 20;
    const bs = save.bedSpawn;
    this.bedSpawn = bs && [bs.x, bs.y, bs.z].every((v) => typeof v === "number" && isFinite(v)) ? { x: bs.x, y: bs.y, z: bs.z } : null;
    // inventário: aceita apenas itens válidos; ferramentas ganham durabilidade
    this.inventory = save.inventory.slice(0, 36).map((it) => {
      if (!it || typeof it.id !== "string" || !ITEMS[it.id]) return null;
      const def = ITEMS[it.id];
      const max = def.maxStack;
      const count = Math.max(1, Math.min(max, Math.floor(it.count) || 1));
      const stack: ItemStack = { id: it.id, count };
      if (def.tool) stack.dur = typeof it.dur === "number" && it.dur > 0 ? Math.min(def.tool.maxDur, Math.floor(it.dur)) : def.tool.maxDur;
      return stack;
    });
    while (this.inventory.length < 36) this.inventory.push(null);
    const pp = save.player;
    this.hasSavedPos = true;
    if (pp && [pp.x, pp.y, pp.z, pp.yaw, pp.pitch].every((v) => typeof v === "number" && isFinite(v))) {
      this.player.pos.set(pp.x, pp.y, pp.z);
      this.player.yaw = pp.yaw;
      this.player.pitch = pp.pitch;
    } else {
      this.hasSavedPos = false;
    }
    if (typeof save.timeOfDay === "number" && isFinite(save.timeOfDay)) {
      if (this.sky) this.sky.time = save.timeOfDay;
      else this.skyTime0 = save.timeOfDay;
    }
  }

  startContinue(): void {
    this.audio.unlock();
    if (SaveManager.hasSave() && this.started) {
      this.enterPlay();
    } else if (SaveManager.hasSave()) {
      this.enterPlay();
    } else {
      this.ui.showModeSelect("play");
    }
  }

  newWorld(): void {
    this.audio.unlock();
    this.ui.showModeSelect("new");
  }

  chooseMode(mode: GameMode, action: "play" | "new"): void {
    this.mode = mode;
    if (action === "new") {
      this.doNewWorld();
      return;
    }
    if (mode === "creative") this.creativeStarterHotbar();
    this.player.fly = false;
    this.enterPlay();
  }

  private doNewWorld(): void {
    this.worldName = SaveManager.nextWorldName();
    this.mobs.dispose();
    this.drops.dispose();
    this.world.dispose();
    const seed = (Math.random() * 2 ** 31) | 0;
    this.world = new World(this.scene, this.tex, seed);
    this.world.renderDist = this.effectiveRenderDist();
    this.mobs = new Mobs(this.scene, this.world);
    this.drops = new Drops(this.scene, this.world, this.tex);
    this.inventory = new Array(36).fill(null);
    this.craftGrid = new Array(9).fill(null);
    this.craftGrid3 = new Array(9).fill(null);
    this.health = 20;
    this.bedSpawn = null;
    this.player = new Player();
    this.bindPlayerHooks();
    if (this.mode === "creative") this.creativeStarterHotbar();
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
      this.saveWorld(false); // registra o mundo novo na lista de saves
      this.ui.hideLoading();
      this.ui.toast(this.mode === "creative" ? "Mundo criativo criado — F para voar" : "Mundo de sobrevivência criado");
      this.enterPlay();
    });
  }

  private creativeStarterHotbar(): void {
    const start = ["grama", "terra", "pedra", "paralele", "tronco", "tabuas", "areia", "la", "folhas"];
    for (let i = 0; i < 36; i++) this.inventory[i] = null;
    start.forEach((id, i) => { this.inventory[i] = { id, count: 64 }; });
    this.selectedSlot = 0;
  }

  saveWorld(manual: boolean): void {
    if (!this.world) return;
    if (!this.worldName) this.worldName = SaveManager.nextWorldName();
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
      mode: this.mode,
      health: this.health,
      bedSpawn: this.bedSpawn,
    };
    const ok = SaveManager.saveWorld(this.worldName, data);
    if (manual) this.ui.toast(ok ? `Mundo "${this.worldName}" salvo` : "Erro ao salvar (veja o console)");
  }

  /** Lista de mundos salvos (para a aba "Meus Mundos" do menu). */
  listWorlds() { return SaveManager.listWorlds(); }

  /** Exclui um mundo salvo. */
  deleteWorld(name: string): void {
    SaveManager.deleteWorld(name);
    if (this.worldName === name) this.worldName = null;
  }

  /** Carrega um mundo salvo pelo nome (trocando o mundo ativo). */
  loadNamedWorld(name: string): void {
    const data = SaveManager.loadWorld(name);
    if (!data) { this.ui.toast("Falha ao carregar o mundo"); return; }
    this.audio.unlock();
    if (this.started) this.saveWorld(false); // preserva o mundo anterior
    this.worldName = name;
    this.mobs.dispose(); this.drops.dispose(); this.world.dispose();
    this.world = new World(this.scene, this.tex, data.seed);
    this.world.renderDist = this.effectiveRenderDist();
    this.mobs = new Mobs(this.scene, this.world);
    this.drops = new Drops(this.scene, this.world, this.tex);
    this.player = new Player();
    this.bindPlayerHooks();
    this.craftGrid = new Array(9).fill(null);
    this.craftGrid3 = new Array(9).fill(null);
    this.applySave(data);
    this.started = true;
    this.ui.setLoading(0.05, "Carregando mundo…");
    const sx = Math.floor(this.player.pos.x), sz = Math.floor(this.player.pos.z);
    void this.world.initialLoad(Math.max(3, this.effectiveRenderDist()), sx, sz, (p) =>
      this.ui.setLoading(0.05 + p * 0.9, "Carregando mundo…"),
    ).then(() => {
      if (this.disposed) return;
      this.spawn.set(sx + 0.5, this.world.surfaceHeight(sx, sz), sz + 0.5);
      this.ui.hideLoading();
      this.ui.hideScreens();
      this.enterPlay();
      this.ui.toast(`Mundo "${name}" carregado`);
    });
  }

  resume(): void {
    if (this.state === "crafting") { this.closeWorkbench(); return; }
    this.enterPlay();
  }

  toMenu(): void {
    this.saveWorld(false);
    this.state = "menu";
    this.player.fly = false;
    this.spawn.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.ui.showPause(false);
    this.ui.showMainMenu(true);
  }

  selectSlot(i: number): void {
    if (i === this.selectedSlot) return;
    this.selectedSlot = i;
    this.audio.uiClick();
    this.ui.updateHotbar();
    this.updateHeldItem();
  }

  invChanged(): void {
    this.ui.updateHotbar();
    this.updateHeldItem();
  }

  tryCraft(r: Recipe, area: "craft" | "craft3"): boolean {
    const grid = area === "craft" ? this.craftGrid : this.craftGrid3;
    const width = 3; // as duas grades agora são 3×3
    const b = gridBounds(grid, width);
    if (!b) return false;
    const pb = patternBounds(r);
    const gw = b.maxX - b.minX + 1, gh = b.maxY - b.minY + 1;
    // consome exatamente 1 item de cada célula ocupada pelo padrão
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = (b.minY + y) * width + (b.minX + x);
        const cell = grid[idx];
        const ch = r.pattern[pb.minY + y][pb.minX + x];
        if (ch !== " " && cell) {
          cell.count -= 1;
          if (cell.count <= 0) grid[idx] = null;
        }
      }
    }
    this.giveItem(r.output.id, r.output.count);
    this.audio.craft();
    return true;
  }

  /**
   * Craft rápido: clique direito num item do inventário → se existir receita
   * que o produz e houver materiais na mochila, crafta na hora.
   */
  quickCraft(itemId: string): boolean {
    if (this.mode === "creative") return false;
    const recipe = RECIPES.find((r) => r.output.id === itemId);
    if (!recipe) return false;
    const need = recipeInputs(recipe);
    const avail: Record<string, number> = {};
    for (const s of this.inventory) if (s) avail[s.id] = (avail[s.id] ?? 0) + s.count;
    for (const k of Object.keys(need)) if ((avail[k] ?? 0) < need[k]) return false;
    // consome os materiais (varre a mochila inteira)
    const left = { ...need };
    for (let i = 0; i < this.inventory.length; i++) {
      const s = this.inventory[i];
      if (!s || !(left[s.id] > 0)) continue;
      const take = Math.min(s.count, left[s.id]);
      s.count -= take;
      left[s.id] -= take;
      if (s.count <= 0) this.inventory[i] = null;
    }
    this.giveItem(recipe.output.id, recipe.output.count);
    this.audio.craft();
    this.ui.toast(`Craftado: ${recipe.output.count}× ${itemDef(itemId).name}`);
    return true;
  }

  creativeTake(itemId: string): void {
    const def = itemDef(itemId);
    if (!def) return;
    const stack: ItemStack = { id: itemId, count: def.kind === "tool" ? 1 : 64 };
    if (def.tool) stack.dur = def.tool.maxDur;
    this.inventory[this.selectedSlot] = stack;
    this.ui.updateHotbar();
    this.updateHeldItem();
    this.audio.pickup();
  }

  /* ================================================================ */
  /* Fluxo de estados                                                  */
  /* ================================================================ */

  private enterPlay(): void {
    this.started = true;
    this.state = "playing";
    this.ui.hideScreens();
    this.ui.setHUDVisible(true);
    this.ui.updateHotbar();
    this.ui.setHearts(this.health, this.mode === "survival");
    this.updateHeldItem();
    this.requestLock(4);
  }

  private requestLock(retries: number): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          this.lockUnavailable = true;
          if (retries > 0 && !this.disposed) setTimeout(() => this.requestLock(retries - 1), 400);
        });
      }
    } catch {
      this.lockUnavailable = true;
      if (retries > 0 && !this.disposed) setTimeout(() => this.requestLock(retries - 1), 400);
    }
  }

  private get locked(): boolean { return document.pointerLockElement === this.canvas; }

  private releaseLock(): void {
    if (this.locked) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }

  private clearKeys(): void {
    this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false, ctrl: false };
  }

  private openInventory(): void {
    this.state = "inventory";
    this.mouseL = false; this.mouseR = false;
    this.clearKeys();
    this.ui.showInventory(true);
    this.ui.setMineProgress(0);
    this.releaseLock();
  }

  private closeInventory(): void {
    // devolve os itens da grade 3×3 ao inventário
    for (let i = 0; i < 9; i++) {
      const s = this.craftGrid[i];
      if (s) { this.giveItem(s.id, s.count); this.craftGrid[i] = null; }
    }
    this.state = "playing";
    this.ui.showInventory(false);
    this.requestLock(4);
  }

  private openWorkbench(): void {
    this.state = "crafting";
    this.mouseL = false; this.mouseR = false;
    this.clearKeys();
    this.ui.showWorkbench(true);
    this.ui.setMineProgress(0);
    this.releaseLock();
  }

  private closeWorkbench(): void {
    // devolve os itens da grade 3×3 ao inventário
    for (let i = 0; i < 9; i++) {
      const s = this.craftGrid3[i];
      if (s) { this.giveItem(s.id, s.count); this.craftGrid3[i] = null; }
    }
    this.state = "playing";
    this.ui.showWorkbench(false);
    this.requestLock(4);
  }

  private toggleFly(): void {
    if (this.mode !== "creative") return;
    this.player.fly = !this.player.fly;
    this.ui.toast(this.player.fly ? "Voo ativado — espaço sobe, shift desce" : "Voo desativado");
  }

  /* ================================================================ */
  /* Input                                                             */
  /* ================================================================ */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    this.audio.unlock();

    // Controles de jogo só capturam o teclado DURANTE a partida (mouse preso).
    // Nos menus / inventário as teclas seguem para o navegador normalmente.
    const inGame = this.state === "playing" && this.locked;

    // Bloqueia atalhos do navegador (Ctrl+W, Ctrl+F, Ctrl+S, Cmd+...) enquanto joga,
    // para que correr (Ctrl) + andar não feche a aba nem abra busca.
    if (inGame && (e.ctrlKey || e.metaKey)) e.preventDefault();

    switch (e.code) {
      // ---- movimentação / ação: só dentro do jogo, sempre com preventDefault ----
      case "KeyW": case "KeyA": case "KeyS": case "KeyD":
      case "Space": case "ShiftLeft": case "ShiftRight":
      case "ControlLeft": case "ControlRight":
        if (inGame) {
          e.preventDefault(); // impede scroll da página e atalhos Ctrl+tecla
          switch (e.code) {
            case "KeyW": this.keys.w = true; break;
            case "KeyA": this.keys.a = true; break;
            case "KeyS": this.keys.s = true; break;
            case "KeyD": this.keys.d = true; break;
            case "Space": this.keys.space = true; break;
            case "ShiftLeft": case "ShiftRight": this.keys.shift = true; break;
            case "ControlLeft": case "ControlRight": this.keys.ctrl = true; break;
          }
          if (e.code === "Space" && !e.repeat && this.mode === "creative") {
            const now = performance.now();
            if (now - this.lastSpaceTap < 300) this.toggleFly();
            this.lastSpaceTap = now;
          }
        }
        break;

      case "KeyF":
        if (inGame) { e.preventDefault(); this.toggleFly(); }
        break;

      case "KeyE":
        if (this.state === "playing" && this.locked) { e.preventDefault(); this.openInventory(); }
        else if (this.state === "inventory") { e.preventDefault(); this.closeInventory(); }
        else if (this.state === "crafting") { e.preventDefault(); this.closeWorkbench(); }
        break;

      case "Escape":
        if (this.state === "inventory") { e.preventDefault(); this.closeInventory(); }
        else if (this.state === "crafting") { e.preventDefault(); this.closeWorkbench(); }
        else if (this.state === "playing" && !this.locked) {
          this.state = "paused";
          this.mouseL = false; this.mouseR = false;
          this.ui.setMineProgress(0);
          this.ui.showPause(true);
        }
        break;

      default: {
        if (e.code.startsWith("Digit") && inGame) {
          const n = parseInt(e.code.slice(5), 10);
          if (n >= 1 && n <= 9) { e.preventDefault(); this.selectSlot(n - 1); }
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
      case "ControlLeft": case "ControlRight": this.keys.ctrl = false; break;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.state !== "playing") return;
    const dragging = !this.locked && (this.mouseL || this.mouseR);
    if (!this.locked && !dragging) return;
    const sens = 0.0022 * this.settings.sensibilidade;
    this.player.yaw -= e.movementX * sens;
    this.player.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.01;
    this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.audio.unlock();
    const t = e.target as HTMLElement | null;
    if (t && t.closest && t.closest(".hotbar, .screen, .toasts, .drag-ghost")) return;
    if (this.state !== "playing") return;
    if (!this.locked && !this.lockUnavailable) this.requestLock(2);
    if (e.button === 0) {
      this.mouseL = true;
      this.tryAttackMob();
    } else if (e.button === 2) {
      this.mouseR = true;
      if (this.locked) this.interact();
      else { this.rDownX = e.clientX; this.rDownY = e.clientY; }
    } else if (e.button === 1) {
      e.preventDefault();
      this.pickBlock();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) { this.mouseL = false; this.mineProgress = 0; this.mineKey = ""; this.ui.setMineProgress(0); }
    if (e.button === 2) {
      if (!this.locked && this.mouseR && this.state === "playing") {
        const dx = e.clientX - this.rDownX, dy = e.clientY - this.rDownY;
        if (dx * dx + dy * dy < 64) this.interact();
      }
      this.mouseR = false;
    }
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
      this.clearKeys();
      this.ui.setMineProgress(0);
      this.ui.showPause(true);
    }
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.syncComposerSize();
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
    if (this.state === "playing" || this.state === "inventory" || this.state === "crafting") e.preventDefault();
  };

  private bindPlayerHooks(): void {
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = (fallDist) => {
      if (fallDist > 0.3) this.audio.land();
      if (this.mode === "survival" && fallDist > 3) {
        this.damage(Math.floor(fallDist - 3), "queda");
      }
    };
    this.player.onSplash = () => this.audio.splash();
    this.player.onStep = (surface) => {
      if (surface === "agua") this.audio.swim();
      else this.audio.step(surface as "grama" | "terra" | "pedra" | "areia" | "madeira" | "areia_fofa");
    };
  }

  /* ================================================================ */
  /* Combate / dano / vida                                             */
  /* ================================================================ */

  private isNight(): boolean {
    const h = this.sky.hourOfDay;
    return h < 6 || h >= 18;
  }

  private damage(n: number, cause: string): void {
    if (this.mode === "creative" || n <= 0) return;
    this.health = Math.max(0, this.health - n);
    this.noDamageT = 0;
    this.ui.setHearts(this.health, true);
    this.ui.flashDamage();
    this.audio.hurt();
    if (this.health <= 0) this.die(cause);
  }

  private die(cause: string): void {
    this.ui.toast(`Você morreu (${cause})! Respawnando…`);
    const p = this.bedSpawn ?? { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z };
    const topY = this.bedSpawn ? this.bedSpawn.y : this.spawn.y;
    this.player.pos.set(p.x + 0.001, topY + 0.05, p.z + 0.001);
    this.player.vel.set(0, 0, 0);
    this.player.fallDist = 0;
    this.health = 20;
    this.ui.setHearts(this.health, true);
  }

  private tryAttackMob(): void {
    if (this.attackCd > 0) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const o = this.camera.position;
    const mob = this.mobs.rayHit(o.x, o.y, o.z, dir.x, dir.y, dir.z, 4);
    if (!mob) return;
    this.attackCd = 0.38;
    this.view.triggerSwing();
    const tool = this.heldTool();
    const dmg = tool ? tool.damage : 1;
    this.audio.mobHit();
    const dead = this.mobs.hurt(mob, dmg, this.player.pos.x, this.player.pos.z);
    if (tool) this.consumeDurability(1);
    if (dead) {
      this.audio.mobDie();
      this.particles.emit(Math.floor(mob.pos.x), Math.floor(mob.pos.y + 0.5), Math.floor(mob.pos.z), MOB_COLORS[mob.type] ?? 0xffffff, 18);
      const drop = this.mobs.dropFor(mob.type);
      if (drop && this.mode === "survival") {
        this.drops.spawn(Math.floor(mob.pos.x), Math.floor(mob.pos.y), Math.floor(mob.pos.z), drop, mob.type === "ovelha" ? 1 + Math.floor(Math.random() * 2) : 1);
      }
    }
  }

  /* ================================================================ */
  /* Mineração / construção / interação                                */
  /* ================================================================ */

  private raycastFromCamera() {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const o = this.camera.position;
    return this.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 6);
  }

  private heldTool() {
    const sel = this.inventory[this.selectedSlot];
    return sel ? itemDef(sel.id).tool : undefined;
  }

  private updateHeldItem(): void {
    const sel = this.inventory[this.selectedSlot];
    this.view.setItem(sel?.id ?? null);
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

    const total = this.mode === "creative" ? 0.06 : breakTime(hit.id, this.heldTool());
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
    if (this.mode !== "survival") return;
    // drop no chão (só sobrevivência)
    if (bd.drop) this.drops.spawn(x, y, z, bd.drop, 1);
    else if (id === B.FOLHAS && Math.random() < 0.12) this.drops.spawn(x, y, z, "graveto", 1);
    // desgaste da ferramenta
    this.consumeDurability(1);
  }

  /** Reduz a durabilidade da ferramenta na mão; quebra a ferramenta ao zerar. */
  private consumeDurability(n: number): void {
    const sel = this.inventory[this.selectedSlot];
    if (!sel) return;
    const def = itemDef(sel.id);
    if (!def?.tool || this.mode === "creative") return;
    const dur = (sel.dur ?? def.tool.maxDur) - n;
    if (dur <= 0) {
      this.inventory[this.selectedSlot] = null;
      this.audio.toolBreak();
      this.ui.toast(`${def.name} quebrou!`);
      this.updateHeldItem();
    } else {
      sel.dur = dur;
    }
    this.ui.updateHotbar();
  }

  /** Botão direito: usa bancada/cama ou coloca bloco. */
  private interact(): void {
    if (this.placeCd > 0) return;
    const hit = this.lastHit ?? this.raycastFromCamera();
    if (!hit) return;
    if (hit.id === B.BANCADA) {
      this.placeCd = 0.3;
      this.openWorkbench();
      return;
    }
    if (hit.id === B.CAMA) {
      this.placeCd = 0.3;
      this.bedSpawn = { x: hit.x, y: hit.y, z: hit.z };
      if (this.isNight()) {
        this.sky.time = (DAY_LENGTH / 24) * 1.5; // amanhecer (~7h30)
        this.ui.toast("Você dormiu. Spawn definido na cama.");
      } else {
        this.ui.toast("Spawn definido na cama.");
      }
      return;
    }
    this.tryPlace();
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
    if (this.mode === "survival") {
      sel.count -= 1;
      if (sel.count <= 0) this.inventory[this.selectedSlot] = null;
    }
    this.ui.updateHotbar();
    this.updateHeldItem();
    this.audio.place();
    this.view.triggerSwing();
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
      this.updateHeldItem();
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
    this.updateHeldItem();
  }

  /* ================================================================ */
  /* Loop principal                                                    */
  /* ================================================================ */

  private loop = (time: number): void => {
    if (this.disposed) return;
    // limite de FPS: pula o frame se ainda não passou o intervalo mínimo
    const limit = this.settings.fpsLimit;
    if (limit > 0) {
      const minInterval = 1000 / limit;
      if (time - this.lastFrameTime < minInterval - 0.6) return;
      this.lastFrameTime = time;
    }
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;

    this.sky.update(dt, this.camera.position, this.state === "playing" && this.player.eyesInWater, this.world.renderDist * CHUNK + 10);

    if (this.state === "playing") {
      this.updatePlaying(dt);
    } else if (this.state === "menu") {
      this.orbitAngle += dt * 0.06;
      const r = 34;
      const c = this.spawn;
      const wt = time * 0.001;
      this.camera.position.set(c.x + Math.cos(this.orbitAngle) * r, c.y + 14 + Math.sin(wt * 0.2) * 2, c.z + Math.sin(this.orbitAngle) * r);
      this.camera.lookAt(c.x, c.y + 2, c.z);
      this.highlight.visible = false;
      this.world.update(c.x, c.z, time);
    } else if (this.state === "paused" || this.state === "inventory" || this.state === "crafting") {
      this.world.update(this.player.pos.x, this.player.pos.z, time);
      this.highlight.visible = false;
    }

    this.particles.update(dt);
    // com shader ativo, renderiza pelo composer; senão, direto (mais rápido)
    if (this.composerActive && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

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
        this.world.loadedCount, `Dia ${this.sky.dayNumber} · ${hh}:${mm}`,
        this.mode === "creative" ? "Criativo" : "Sobrevivência");
    }

    if (this.started && (this.state === "playing" || this.state === "paused" || this.state === "inventory" || this.state === "crafting")) {
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
      sprint: this.keys.ctrl, // Ctrl = correr
      crouch: this.keys.shift, // Shift = agachar
    }, this.world);

    const eye = this.player.eyePosition;
    this.camera.position.copy(eye);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

    const sprinting = this.keys.ctrl && fwd > 0 && !this.player.inWater && !this.player.fly && !this.keys.shift;
    const targetFov = this.settings.fov + (sprinting ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 10 * dt);
      this.camera.updateProjectionMatrix();
    }

    this.ui.setWaterOverlay(this.player.eyesInWater);

    this.placeCd -= dt;
    this.attackCd -= dt;
    if (this.mouseR && this.placeCd <= 0 && this.locked) this.interact();

    this.updateMining(dt);

    // mundo vivo
    this.mobs.update(dt, this.player.pos, this.isNight(), (dmg, kx, kz) => {
      if (this.mode === "creative") return;
      this.player.vel.x += kx * 6;
      this.player.vel.z += kz * 6;
      this.player.vel.y = Math.max(this.player.vel.y, 4.5);
      this.damage(dmg, "ataque de sombra");
    });
    this.drops.update(dt, this.player.pos, (id, count) => {
      if (this.mode === "survival") this.giveItem(id, count);
    });

    // regeneração (sobrevivência)
    if (this.mode === "survival") {
      this.noDamageT += dt;
      if (this.noDamageT > 6 && this.health < 20 && this.health > 0) {
        this.regenT += dt;
        if (this.regenT > 2.5) {
          this.regenT = 0;
          this.health = Math.min(20, this.health + 1);
          this.ui.setHearts(this.health, true);
        }
      }
    }

    // mão / braço
    const hSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
    this.view.update(dt, hSpeed > 1.5 && (this.player.onGround || this.player.fly), this.mouseL && !!this.lastHit);

    this.world.update(this.player.pos.x, this.player.pos.z, performance.now());
  }

  /* ================================================================ */

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    if (this.composer) this.composer.dispose();
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
    if (this.mobs) this.mobs.dispose();
    if (this.drops) this.drops.dispose();
    if (this.view) this.view.dispose();
    if (this.ui) this.ui.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
