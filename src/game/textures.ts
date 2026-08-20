/**
 * Texturas 100% procedurais em Canvas (16x16 px por tile, estilo pixel art),
 * empacotadas num atlas 4x5. Sem nenhuma imagem externa.
 * Também gera ícones isométricos dos itens, texturas de ferramentas e
 * geometrias de mini-cubo (itens dropados / na mão do jogador).
 */
import * as THREE from "three";
import { T, ITEMS, blockDef } from "./blocks";
import { rng } from "./noise";

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 5;
const PX = 16;

export interface TexturePack {
  atlas: HTMLCanvasElement;
  atlasTexture: THREE.CanvasTexture;
  waterTexture: THREE.CanvasTexture;
  /** material opaco do atlas (compartilhado por chunks, drops e mão) */
  atlasMaterial: THREE.MeshLambertMaterial;
  /** cor média do bloco (para partículas) */
  blockColor: (blockId: number) => number;
  icon: (itemId: string, size?: number) => HTMLCanvasElement;
  /** textura (fundo transparente) do item — para exibir na mão */
  itemTexture: (itemId: string) => THREE.CanvasTexture;
  /** mini-cubo com as faces cobertas pelo tile do bloco */
  blockCube: (blockId: number, size: number) => THREE.BufferGeometry;
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
  [T.PARALELE]: (c, r) => {
    speckle(c, r, "#7f7f7f", [["#8f8f8f", 0.15], ["#6c6c6c", 0.15]]);
    c.fillStyle = "#5c5c5c";
    // padrão de pedras encaixadas
    const lines = [3, 7, 11];
    for (const y of lines) c.fillRect(0, y, PX, 1);
    c.fillRect(5, 0, 1, 3); c.fillRect(11, 4, 1, 3); c.fillRect(3, 8, 1, 3); c.fillRect(13, 12, 1, 3); c.fillRect(7, 12, 1, 4);
    c.fillStyle = "#9a9a9a";
    c.fillRect(1, 1, 3, 1); c.fillRect(8, 5, 2, 1); c.fillRect(5, 9, 3, 1); c.fillRect(1, 13, 2, 1);
  },
  [T.LA]: (c, r) => {
    speckle(c, r, "#e8e8e2", [["#f4f4ee", 0.2], ["#d5d5cc", 0.16]]);
    c.fillStyle = "#c9c9bf";
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * 13), y = Math.floor(r() * 13);
      c.fillRect(x, y + 2, 3, 1);
      c.fillRect(x + 2, y, 1, 2);
    }
  },
  [T.DIAMANTE]: (c, r) => {
    PAINTERS[T.PEDRA](c, r);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(r() * 12), y = 1 + Math.floor(r() * 12);
      c.fillStyle = "#4aedd9";
      c.fillRect(x, y, 2, 2);
      c.fillStyle = "#a5fff2";
      c.fillRect(x, y, 1, 1);
      c.fillStyle = "#2fbfae";
      c.fillRect(x + 1, y + 1, 1, 1);
    }
  },
  [T.CAMA_TOPO]: (c, r) => {
    speckle(c, r, "#e6e2da", [["#d8d3c8", 0.12], ["#f2efe8", 0.1]]);
    // travesseiro vermelho no topo
    c.fillStyle = "#c0392b";
    c.fillRect(1, 1, 14, 4);
    c.fillStyle = "#e74c3c";
    c.fillRect(2, 1, 12, 2);
    c.fillStyle = "#a93226";
    c.fillRect(1, 4, 14, 1);
  },
  [T.CAMA_LADO]: (c, r) => {
    // colchão branco em cima, madeira embaixo
    speckle(c, r, "#a97e4b", [["#97703f", 0.1]]);
    c.fillStyle = "#e6e2da";
    c.fillRect(0, 0, PX, 5);
    c.fillStyle = "#c0392b";
    c.fillRect(0, 4, PX, 2);
    c.fillStyle = "#d8d3c8";
    for (let x = 1; x < PX; x += 3) c.fillRect(x, 1, 1, 2);
  },
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

  const atlasMaterial = new THREE.MeshLambertMaterial({ map: atlasTexture });

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
    else drawMaterial(g, itemId, size);
    iconCache.set(key, c);
    return c;
  };

  const texCache = new Map<string, THREE.CanvasTexture>();
  const itemTexture = (itemId: string): THREE.CanvasTexture => {
    const hit = texCache.get(itemId);
    if (hit) return hit;
    const t = new THREE.CanvasTexture(icon(itemId, 64));
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(itemId, t);
    return t;
  };

  const cubeCache = new Map<string, THREE.BufferGeometry>();
  const blockCube = (blockId: number, size: number): THREE.BufferGeometry => {
    const key = blockId + "@" + size;
    const hit = cubeCache.get(key);
    if (hit) return hit;
    const bd = blockDef(blockId);
    const g = new THREE.BoxGeometry(size, size, size);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // BoxGeometry: 4 vértices por face, ordem +x,-x,+y,-y,+z,-z
    const faceTiles = [bd.tiles[1], bd.tiles[1], bd.tiles[0], bd.tiles[2], bd.tiles[1], bd.tiles[1]];
    for (let f = 0; f < 6; f++) {
      const tile = faceTiles[f];
      const tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS);
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        const u = uv.getX(i), vv = uv.getY(i);
        uv.setXY(i, (tx + u) / ATLAS_COLS, 1 - (ty + 1 - vv) / ATLAS_ROWS);
      }
    }
    uv.needsUpdate = true;
    cubeCache.set(key, g);
    return g;
  };

  return { atlas, atlasTexture, waterTexture, atlasMaterial, blockColor, icon, itemTexture, blockCube };
}

/** Cubo isométrico usando os tiles reais do atlas. */
function drawIsoCube(g: CanvasRenderingContext2D, atlas: HTMLCanvasElement, blockId: number, size: number) {
  const bd = blockDef(blockId);
  const [top, side] = bd.tiles;
  const k = size / 4;
  const cx = size / 2, ty = size * 0.08;
  const tileSrc = (t: number): [number, number, number, number] =>
    [(t % ATLAS_COLS) * PX, Math.floor(t / ATLAS_COLS) * PX, PX, PX];

  g.setTransform(k, k / 2, -k, k / 2, cx, ty);
  g.drawImage(atlas, ...tileSrc(top), 0, 0, 1, 1);
  g.setTransform(-k, k / 2, 0, k, cx + k, ty + k / 2);
  g.drawImage(atlas, ...tileSrc(side), 0, 0, 1, 1);
  g.globalAlpha = 0.22; g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1); g.globalAlpha = 1;
  g.setTransform(k, k / 2, 0, k, cx - k, ty + k / 2);
  g.drawImage(atlas, ...tileSrc(side), 0, 0, 1, 1);
  g.globalAlpha = 0.38; g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1); g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
}

const TIER_COLORS: Record<string, [string, string]> = {
  madeira: ["#b98a4e", "#8a6234"],
  pedra: ["#9aa3ab", "#6d757d"],
  ferro: ["#e0e0e0", "#a8a8a8"],
  diamante: ["#4aedd9", "#2fbfae"],
};

/** Ferramentas desenhadas vetorialmente em estilo pixel (4 tiers + espada). */
function drawTool(g: CanvasRenderingContext2D, id: string, size: number) {
  const u = size / 16;
  let tier = "madeira";
  for (const t of Object.keys(TIER_COLORS)) if (id.endsWith(t)) tier = t;
  const [head, headDark] = TIER_COLORS[tier];
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
  } else if (id.startsWith("espada")) {
    g.fillStyle = head;
    g.fillRect(-1.2 * u, -8 * u, 2.4 * u, 10 * u);
    g.fillStyle = headDark;
    g.fillRect(0.6 * u, -8 * u, 0.6 * u, 10 * u);
    g.fillStyle = head;
    g.fillRect(-1.2 * u, -8 * u, 0.6 * u, 1.4 * u);
    // guarda
    g.fillStyle = "#6e4d28";
    g.fillRect(-3.4 * u, 1.6 * u, 6.8 * u, 1.6 * u);
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
    g.fillRect(-0.9 * u, -6 * u, 1.8 * u, 12 * u);
    g.fillStyle = "#6e4d28";
    g.fillRect(0.3 * u, -6 * u, 0.6 * u, 12 * u);
    g.restore();
  } else if (id === "diamante") {
    g.fillStyle = "#4aedd9";
    g.fillRect(4 * u, 5 * u, 8 * u, 6 * u);
    g.fillStyle = "#a5fff2";
    g.fillRect(5 * u, 5 * u, 3 * u, 2 * u);
    g.fillStyle = "#2fbfae";
    g.fillRect(4 * u, 9 * u, 8 * u, 2 * u);
    g.fillStyle = "#4aedd9";
    g.fillRect(6 * u, 3 * u, 4 * u, 2 * u);
    g.fillRect(6 * u, 11 * u, 4 * u, 2 * u);
  } else if (id === "minerio_carvao") {
    g.fillStyle = "#3a3a3a";
    g.fillRect(3 * u, 4 * u, 10 * u, 8 * u);
    g.fillStyle = "#1e1e1e";
    g.fillRect(5 * u, 6 * u, 3 * u, 3 * u);
    g.fillRect(9 * u, 8 * u, 2 * u, 2 * u);
    g.fillStyle = "#555";
    g.fillRect(4 * u, 5 * u, 2 * u, 1 * u);
  } else if (id === "minerio_ferro") {
    g.fillStyle = "#8d8d8d";
    g.fillRect(3 * u, 4 * u, 10 * u, 8 * u);
    g.fillStyle = "#d8af93";
    g.fillRect(5 * u, 6 * u, 3 * u, 3 * u);
    g.fillRect(9 * u, 8 * u, 2 * u, 2 * u);
    g.fillStyle = "#a8a8a8";
    g.fillRect(4 * u, 5 * u, 2 * u, 1 * u);
  } else {
    g.fillStyle = "#888";
    g.fillRect(3 * u, 3 * u, 10 * u, 10 * u);
  }
}
