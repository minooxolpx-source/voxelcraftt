/**
 * Texturas 100% procedurais em Canvas (16x16 px por tile, estilo pixel art),
 * empacotadas num atlas 4x4. Sem nenhuma imagem externa.
 * Também gera ícones isométricos dos itens para hotbar/inventário.
 */
import * as THREE from "three";
import { T, ITEMS, blockDef } from "./blocks";
import { rng } from "./noise";

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
const PX = 16;

export interface TexturePack {
  atlas: HTMLCanvasElement;
  atlasTexture: THREE.CanvasTexture;
  waterTexture: THREE.CanvasTexture;
  /** cor média do bloco (para partículas) */
  blockColor: (blockId: number) => number;
  icon: (itemId: string, size?: number) => HTMLCanvasElement;
}

type Painter = (ctx: CanvasRenderingContext2D, r: () => number) => void;

function speckle(ctx: CanvasRenderingContext2D, r: () => number, base: string, spots: [string, number][]) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PX, PX);
  for (const [color, prob] of spots) {
    ctx.fillStyle = color;
    for (let y = 0; y < PX; y++)
      for (let x = 0; x < PX; x++)
        if (r() < prob) ctx.fillRect(x, y, 1, 1);
  }
}

const PAINTERS: Record<number, Painter> = {
  [T.GRAMA_TOPO]: (c, r) => speckle(c, r, "#5fae3d", [["#6fc24a", 0.16], ["#4e9631", 0.14], ["#7fd158", 0.05]]),
  [T.GRAMA_LADO]: (c, r) => {
    speckle(c, r, "#8a5c36", [["#9a6b40", 0.14], ["#75492a", 0.12], ["#a5794c", 0.05]]);
    // franja de grama no topo, com borda irregular
    c.fillStyle = "#5fae3d";
    for (let x = 0; x < PX; x++) {
      const d = 3 + Math.floor(r() * 2.4);
      c.fillRect(x, 0, 1, d);
      if (r() < 0.5) { c.fillStyle = "#6fc24a"; c.fillRect(x, d, 1, 1); c.fillStyle = "#5fae3d"; }
    }
  },
  [T.TERRA]: (c, r) => speckle(c, r, "#8a5c36", [["#9a6b40", 0.15], ["#75492a", 0.13], ["#a5794c", 0.06]]),
  [T.PEDRA]: (c, r) => {
    speckle(c, r, "#8d8d8d", [["#9c9c9c", 0.18], ["#7a7a7a", 0.16], ["#a8a8a8", 0.06]]);
    c.fillStyle = "#6e6e6e";
    for (let i = 0; i < 4; i++) c.fillRect(Math.floor(r() * 13), Math.floor(r() * 15), 2 + Math.floor(r() * 3), 1);
  },
  [T.AREIA]: (c, r) => speckle(c, r, "#d9cf9f", [["#e6dda9", 0.18], ["#c4b988", 0.14], ["#f0e8bd", 0.06]]),
  [T.TRONCO_LADO]: (c, r) => {
    speckle(c, r, "#6e4d2a", [["#7d5a33", 0.2], ["#5c3f21", 0.18]]);
    c.fillStyle = "#4f3519";
    for (let x = 1; x < PX; x += 4 + Math.floor(r() * 2)) c.fillRect(x, 0, 1, PX);
  },
  [T.TRONCO_TOPO]: (c, r) => {
    speckle(c, r, "#7d5a33", [["#8d6a3f", 0.12]]);
    c.strokeStyle = "#5c3f21";
    c.strokeRect(1.5, 1.5, 13, 13);
    c.strokeStyle = "#93703f";
    c.strokeRect(3.5, 3.5, 9, 9);
    c.strokeStyle = "#5c3f21";
    c.strokeRect(5.5, 5.5, 5, 5);
    c.fillStyle = "#4f3519";
    c.fillRect(7, 7, 2, 2);
    if (r() < 2) c.fillRect(4, 8, 1, 1);
  },
  [T.FOLHAS]: (c, r) => speckle(c, r, "#3c7a26", [["#2f611d", 0.24], ["#4d9430", 0.18], ["#244d16", 0.1]]),
  [T.AGUA]: (c, r) => {
    speckle(c, r, "#2e6db4", [["#3b7fc7", 0.16], ["#275e9e", 0.14]]);
    c.fillStyle = "#5aa2dd";
    for (let y = 2; y < PX; y += 5)
      for (let x = 0; x < PX; x++)
        if ((x + y * 2 + Math.floor(r() * 2)) % 7 < 2) c.fillRect(x, y, 1, 1);
  },
  [T.CARVAO]: (c, r) => {
    PAINTERS[T.PEDRA](c, r);
    c.fillStyle = "#2b2b2b";
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(r() * 12), y = 1 + Math.floor(r() * 12);
      c.fillRect(x, y, 2, 2);
      c.fillRect(x + 1, y + 2, 1, 1);
    }
  },
  [T.FERRO]: (c, r) => {
    PAINTERS[T.PEDRA](c, r);
    c.fillStyle = "#d8af93";
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(r() * 12), y = 1 + Math.floor(r() * 12);
      c.fillRect(x, y, 2, 2);
      c.fillStyle = "#c39a7d";
      c.fillRect(x + 1, y + 1, 1, 1);
      c.fillStyle = "#d8af93";
    }
  },
  [T.TABUAS]: (c, r) => {
    speckle(c, r, "#a97e4b", [["#b78c58", 0.12], ["#97703f", 0.1]]);
    c.fillStyle = "#7c5a33";
    for (let y = 3; y < PX; y += 4) c.fillRect(0, y, PX, 1);
    c.fillRect(4, 0, 1, 3); c.fillRect(11, 4, 1, 3); c.fillRect(6, 8, 1, 3); c.fillRect(13, 12, 1, 3);
  },
  [T.BANCADA_TOPO]: (c, r) => {
    PAINTERS[T.TABUAS](c, r);
    c.fillStyle = "#6b4c2a";
    c.strokeRect(1.5, 1.5, 13, 13);
    c.strokeStyle = "#6b4c2a";
    c.beginPath(); c.moveTo(8, 1); c.lineTo(8, 15); c.moveTo(1, 8); c.lineTo(15, 8); c.stroke();
  },
  [T.BANCADA_LADO]: (c, r) => {
    PAINTERS[T.TABUAS](c, r);
    c.fillStyle = "#6b4c2a";
    c.fillRect(2, 3, 5, 6); c.fillRect(9, 5, 5, 7);
    c.fillStyle = "#8a6238";
    c.fillRect(3, 4, 3, 4); c.fillRect(10, 6, 3, 5);
  },
  [T.ROCHA]: (c, r) => speckle(c, r, "#3f3f42", [["#55555a", 0.18], ["#2a2a2d", 0.2], ["#6a6a70", 0.05]]),
};

export function makeTextures(): TexturePack {
  const atlas = document.createElement("canvas");
  atlas.width = ATLAS_COLS * PX;
  atlas.height = ATLAS_ROWS * PX;
  const ctx = atlas.getContext("2d")!;

  const avgColors = new Map<number, number>();

  for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
    const painter = PAINTERS[tile];
    if (!painter) continue;
    const tx = (tile % ATLAS_COLS) * PX;
    const ty = Math.floor(tile / ATLAS_COLS) * PX;
    ctx.save();
    ctx.translate(tx, ty);
    painter(ctx, rng(tile * 7919 + 17));
    ctx.restore();

    // cor média do tile (partículas)
    const data = ctx.getImageData(tx, ty, PX, PX).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    const n = data.length / 4;
    avgColors.set(tile, (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n));
  }

  const atlasTexture = new THREE.CanvasTexture(atlas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;

  // textura própria da água (para animar o offset)
  const waterCanvas = document.createElement("canvas");
  waterCanvas.width = PX; waterCanvas.height = PX;
  const wctx = waterCanvas.getContext("2d")!;
  wctx.drawImage(atlas, (T.AGUA % ATLAS_COLS) * PX, Math.floor(T.AGUA / ATLAS_COLS) * PX, PX, PX, 0, 0, PX, PX);
  const waterTexture = new THREE.CanvasTexture(waterCanvas);
  waterTexture.magFilter = THREE.NearestFilter;
  waterTexture.minFilter = THREE.NearestFilter;
  waterTexture.generateMipmaps = false;
  waterTexture.wrapS = THREE.RepeatWrapping;
  waterTexture.wrapT = THREE.RepeatWrapping;
  waterTexture.colorSpace = THREE.SRGBColorSpace;

  const blockColor = (blockId: number): number => {
    const bd = blockDef(blockId);
    // prioriza a cor do topo (grama fica verde, tronco fica marrom etc.)
    return avgColors.get(bd.tiles[0]) ?? 0xffffff;
  };

  const iconCache = new Map<string, HTMLCanvasElement>();
  const icon = (itemId: string, size = 44): HTMLCanvasElement => {
    const key = itemId + "@" + size;
    const hit = iconCache.get(key);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const item = ITEMS[itemId];
    if (item?.kind === "tool") drawTool(g, itemId, size);
    else if (item?.block !== undefined) drawIsoCube(g, atlas, item.block, size);
    else drawMaterial(g, itemId, size); // graveto etc.
    iconCache.set(key, c);
    return c;
  };

  return { atlas, atlasTexture, waterTexture, blockColor, icon };
}

/** Cubo isométrico usando os tiles reais do atlas. */
function drawIsoCube(g: CanvasRenderingContext2D, atlas: HTMLCanvasElement, blockId: number, size: number) {
  const bd = blockDef(blockId);
  const [top, side] = bd.tiles;
  const k = size / 4; // meia-largura do losango
  const cx = size / 2, ty = size * 0.08;
  const tileSrc = (t: number): [number, number, number, number] =>
    [(t % ATLAS_COLS) * PX, Math.floor(t / ATLAS_COLS) * PX, PX, PX];

  // topo
  g.setTransform(k, k / 2, -k, k / 2, cx, ty);
  g.drawImage(atlas, ...tileSrc(top), 0, 0, 1, 1);
  // face direita
  g.setTransform(-k, k / 2, 0, k, cx + k, ty + k / 2);
  g.drawImage(atlas, ...tileSrc(side), 0, 0, 1, 1);
  g.globalAlpha = 0.22; g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1); g.globalAlpha = 1;
  // face esquerda
  g.setTransform(k, k / 2, 0, k, cx - k, ty + k / 2);
  g.drawImage(atlas, ...tileSrc(side), 0, 0, 1, 1);
  g.globalAlpha = 0.38; g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1); g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** Ferramentas desenhadas vetorialmente em estilo pixel. */
function drawTool(g: CanvasRenderingContext2D, id: string, size: number) {
  const u = size / 16;
  const isStone = id.includes("pedra");
  const head = isStone ? "#9aa3ab" : "#b98a4e";
  const headDark = isStone ? "#6d757d" : "#8a6234";
  const handle = "#8a6234";
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(Math.PI / 4);
  // cabo
  g.fillStyle = handle;
  g.fillRect(-1.2 * u, -6.5 * u, 2.4 * u, 13 * u);
  g.fillStyle = "#6e4d28";
  g.fillRect(0.6 * u, -6.5 * u, 0.6 * u, 13 * u);
  if (id.startsWith("picareta")) {
    g.fillStyle = head;
    g.fillRect(-6.5 * u, -7 * u, 13 * u, 2.6 * u);
    g.fillRect(-6.5 * u, -7 * u, 2.6 * u, 4.5 * u);
    g.fillRect(3.9 * u, -7 * u, 2.6 * u, 4.5 * u);
    g.fillStyle = headDark;
    g.fillRect(-6.5 * u, -5 * u, 13 * u, 0.8 * u);
  } else if (id.startsWith("machado")) {
    g.fillStyle = head;
    g.fillRect(0, -7 * u, 4.6 * u, 5.4 * u);
    g.fillRect(-3.4 * u, -7 * u, 3.4 * u, 2.6 * u);
    g.fillStyle = headDark;
    g.fillRect(3.4 * u, -7 * u, 1.2 * u, 5.4 * u);
  } else {
    // pá
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -5.4 * u, 2.6 * u, 3.4 * u, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = headDark;
    g.fillRect(-0.5 * u, -8.4 * u, 1 * u, 2.4 * u);
  }
  g.restore();
}

function drawMaterial(g: CanvasRenderingContext2D, id: string, size: number) {
  const u = size / 16;
  if (id === "graveto") {
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(Math.PI / 4);
    g.fillStyle = "#8a6234";
    g.fillRect(-1 * u, -6 * u, 2 * u, 12 * u);
    g.fillStyle = "#a5794c";
    g.fillRect(-1 * u, -6 * u, 1 * u, 12 * u);
    g.fillStyle = "#6e4d28";
    g.fillRect(-2 * u, -4 * u, 1.4 * u, 1.4 * u);
    g.fillRect(0.8 * u, 2.4 * u, 1.4 * u, 1.4 * u);
    g.restore();
  }
}
