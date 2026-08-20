/**
 * Registro de blocos e itens do jogo (tudo original, sem assets externos).
 * Blocos são ids numéricos (0–255) guardados em Uint8Array nos chunks.
 * Tempos de quebra seguem a lógica do Minecraft clássico:
 *   ferramenta certa → dureza / velocidade da ferramenta
 *   bloco de picareta sem ferramenta → dureza × 5
 *   demais blocos sem ferramenta → dureza × 1.5
 */

export const B = {
  AIR: 0,
  GRAMA: 1,
  TERRA: 2,
  PEDRA: 3,
  AREIA: 4,
  TRONCO: 5,
  FOLHAS: 6,
  AGUA: 7,
  CARVAO: 8,
  FERRO: 9,
  TABUAS: 10,
  BANCADA: 11,
  ROCHA: 12, // rocha matriz — inquebrável, fundo do mundo
  PARALELE: 13, // paralelepípedo (pedra quebrada)
  LA: 14,
  DIAMANTE: 15, // minério de diamante
  CAMA: 16,
} as const;

export type BlockId = number;
export type ToolClass = "picareta" | "machado" | "pa" | "espada" | null;

export interface BlockDef {
  id: number;
  name: string;
  /** tiles [topo, lateral, base] no atlas de texturas */
  tiles: [number, number, number];
  solid: boolean;
  transparent: boolean;
  /** dureza base em segundos (Infinity = inquebrável) */
  hardness: number;
  tool: ToolClass;
  /** item derrubado ao quebrar (null = nada) */
  drop: string | null;
}

export const T = {
  GRAMA_TOPO: 0,
  GRAMA_LADO: 1,
  TERRA: 2,
  PEDRA: 3,
  AREIA: 4,
  TRONCO_LADO: 5,
  TRONCO_TOPO: 6,
  FOLHAS: 7,
  AGUA: 8,
  CARVAO: 9,
  FERRO: 10,
  TABUAS: 11,
  BANCADA_TOPO: 12,
  BANCADA_LADO: 13,
  ROCHA: 14,
  PARALELE: 15,
  LA: 16,
  DIAMANTE: 17,
  CAMA_TOPO: 18,
  CAMA_LADO: 19,
} as const;

const def = (
  id: number, name: string, tiles: [number, number, number],
  hardness: number, tool: ToolClass, drop: string | null,
  opts: Partial<BlockDef> = {},
): BlockDef => ({ id, name, tiles, solid: true, transparent: false, hardness, tool, drop, ...opts });

export const BLOCKS: BlockDef[] = [];
BLOCKS[B.AIR] = def(0, "Ar", [0, 0, 0], 0, null, null, { solid: false, transparent: true });
BLOCKS[B.GRAMA] = def(1, "Grama", [T.GRAMA_TOPO, T.GRAMA_LADO, T.TERRA], 0.6, "pa", "terra");
BLOCKS[B.TERRA] = def(2, "Terra", [T.TERRA, T.TERRA, T.TERRA], 0.5, "pa", "terra");
BLOCKS[B.PEDRA] = def(3, "Pedra", [T.PEDRA, T.PEDRA, T.PEDRA], 1.5, "picareta", "paralele");
BLOCKS[B.AREIA] = def(4, "Areia", [T.AREIA, T.AREIA, T.AREIA], 0.5, "pa", "areia");
BLOCKS[B.TRONCO] = def(5, "Tronco", [T.TRONCO_TOPO, T.TRONCO_LADO, T.TRONCO_TOPO], 2.0, "machado", "tronco");
BLOCKS[B.FOLHAS] = def(6, "Folhas", [T.FOLHAS, T.FOLHAS, T.FOLHAS], 0.2, null, null);
BLOCKS[B.AGUA] = def(7, "Água", [T.AGUA, T.AGUA, T.AGUA], Infinity, null, null, { solid: false, transparent: true });
BLOCKS[B.CARVAO] = def(8, "Minério de Carvão", [T.CARVAO, T.CARVAO, T.CARVAO], 3.0, "picareta", "minerio_carvao");
BLOCKS[B.FERRO] = def(9, "Minério de Ferro", [T.FERRO, T.FERRO, T.FERRO], 3.0, "picareta", "minerio_ferro");
BLOCKS[B.TABUAS] = def(10, "Tábuas", [T.TABUAS, T.TABUAS, T.TABUAS], 2.0, "machado", "tabuas");
BLOCKS[B.BANCADA] = def(11, "Bancada", [T.BANCADA_TOPO, T.BANCADA_LADO, T.TABUAS], 2.5, "machado", "bancada");
BLOCKS[B.ROCHA] = def(12, "Rocha Matriz", [T.ROCHA, T.ROCHA, T.ROCHA], Infinity, null, null);
BLOCKS[B.PARALELE] = def(13, "Paralelepípedo", [T.PARALELE, T.PARALELE, T.PARALELE], 2.0, "picareta", "paralele");
BLOCKS[B.LA] = def(14, "Lã", [T.LA, T.LA, T.LA], 0.8, null, "la");
BLOCKS[B.DIAMANTE] = def(15, "Minério de Diamante", [T.DIAMANTE, T.DIAMANTE, T.DIAMANTE], 3.0, "picareta", "diamante");
BLOCKS[B.CAMA] = def(16, "Cama", [T.CAMA_TOPO, T.CAMA_LADO, T.TABUAS], 0.2, null, "cama");

export function blockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[0];
}

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

export interface ToolDef {
  class: Exclude<ToolClass, null>;
  tier: number;
  speed: number;
  damage: number;
  maxDur: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "block" | "material" | "tool";
  block?: number;
  tool?: ToolDef;
  maxStack: number;
}

export interface ItemStack {
  id: string;
  count: number;
  /** durabilidade restante (apenas ferramentas) */
  dur?: number;
}

export const ITEMS: Record<string, ItemDef> = {};
const item = (d: ItemDef) => (ITEMS[d.id] = d);

ITEMS["grama"] = { id: "grama", name: "Grama", kind: "block", block: B.GRAMA, maxStack: 64 };
ITEMS["terra"] = { id: "terra", name: "Terra", kind: "block", block: B.TERRA, maxStack: 64 };
ITEMS["pedra"] = { id: "pedra", name: "Pedra", kind: "block", block: B.PEDRA, maxStack: 64 };
ITEMS["areia"] = { id: "areia", name: "Areia", kind: "block", block: B.AREIA, maxStack: 64 };
ITEMS["tronco"] = { id: "tronco", name: "Tronco", kind: "block", block: B.TRONCO, maxStack: 64 };
ITEMS["folhas"] = { id: "folhas", name: "Folhas", kind: "block", block: B.FOLHAS, maxStack: 64 };
ITEMS["tabuas"] = { id: "tabuas", name: "Tábuas", kind: "block", block: B.TABUAS, maxStack: 64 };
ITEMS["bancada"] = { id: "bancada", name: "Bancada", kind: "block", block: B.BANCADA, maxStack: 64 };
ITEMS["paralele"] = { id: "paralele", name: "Paralelepípedo", kind: "block", block: B.PARALELE, maxStack: 64 };
ITEMS["la"] = { id: "la", name: "Lã", kind: "block", block: B.LA, maxStack: 64 };
ITEMS["cama"] = { id: "cama", name: "Cama", kind: "block", block: B.CAMA, maxStack: 1 };

item({ id: "graveto", name: "Graveto", kind: "material", maxStack: 64 });
item({ id: "minerio_carvao", name: "Carvão", kind: "material", maxStack: 64 });
item({ id: "minerio_ferro", name: "Ferro Bruto", kind: "material", maxStack: 64 });
item({ id: "diamante", name: "Diamante", kind: "material", maxStack: 64 });

/** velocidades: madeira 2, pedra 4, ferro 6, diamante 8 · durabilidades: 59/131/250/1561 */
const TIERS: [string, string, number, number][] = [
  ["madeira", "Madeira", 2, 59],
  ["pedra", "Pedra", 4, 131],
  ["ferro", "Ferro", 6, 250],
  ["diamante", "Diamante", 8, 1561],
];
const TOOL_DMG: Record<string, number> = { pa: 2, machado: 3, picareta: 2, espada: 0 };
const SWORD_DMG = [4, 5, 6, 7];

for (let t = 0; t < TIERS.length; t++) {
  const [slug, label, speed, dur] = TIERS[t];
  for (const cls of ["pa", "machado", "picareta", "espada"] as const) {
    const names: Record<string, string> = { pa: "Pá", machado: "Machado", picareta: "Picareta", espada: "Espada" };
    item({
      id: `${cls}_${slug}`,
      name: `${names[cls]} de ${label}`,
      kind: "tool",
      tool: { class: cls, tier: t + 1, speed, damage: cls === "espada" ? SWORD_DMG[t] : TOOL_DMG[cls], maxDur: dur },
      maxStack: 1,
    });
  }
}

export function itemDef(id: string): ItemDef {
  return ITEMS[id];
}

/** Tempo de quebra (s) considerando a ferramenta na mão. */
export function breakTime(blockId: number, tool: ToolDef | undefined): number {
  const bd = blockDef(blockId);
  if (!isFinite(bd.hardness)) return Infinity;
  if (tool && bd.tool && tool.class === bd.tool) {
    return Math.max(0.05, bd.hardness / tool.speed);
  }
  // sem a ferramenta certa: pedra/minérios ×5, resto ×1.5 (como no original)
  if (bd.tool === "picareta") return bd.hardness * 5;
  return bd.hardness * 1.5;
}

/* ------------------------------------------------------------------ */
/* Receitas (shapeless — a posição não importa, só os itens e quantidades) */
/* ------------------------------------------------------------------ */

export interface Recipe {
  inputs: Record<string, number>;
  output: ItemStack;
  /** exige bancada 3×3? */
  table?: boolean;
}

export const RECIPES: Recipe[] = [
  // --- grade 2×2 (inventário) ---
  { inputs: { tronco: 1 }, output: { id: "tabuas", count: 4 } },
  { inputs: { tabuas: 2 }, output: { id: "graveto", count: 4 } },
  { inputs: { tabuas: 4 }, output: { id: "bancada", count: 1 } },
  { inputs: { graveto: 1, tabuas: 1 }, output: { id: "pa_madeira", count: 1 } },
  { inputs: { graveto: 1, tabuas: 2 }, output: { id: "espada_madeira", count: 1 } },
  { inputs: { graveto: 2, tabuas: 2 }, output: { id: "machado_madeira", count: 1 } },
  { inputs: { graveto: 2, tabuas: 3 }, output: { id: "picareta_madeira", count: 1 } },
  // --- bancada 3×3 ---
  { inputs: { graveto: 1, paralele: 1 }, output: { id: "pa_pedra", count: 1 }, table: true },
  { inputs: { graveto: 1, paralele: 2 }, output: { id: "espada_pedra", count: 1 }, table: true },
  { inputs: { graveto: 2, paralele: 2 }, output: { id: "machado_pedra", count: 1 }, table: true },
  { inputs: { graveto: 2, paralele: 3 }, output: { id: "picareta_pedra", count: 1 }, table: true },
  { inputs: { graveto: 1, minerio_ferro: 1 }, output: { id: "pa_ferro", count: 1 }, table: true },
  { inputs: { graveto: 1, minerio_ferro: 2 }, output: { id: "espada_ferro", count: 1 }, table: true },
  { inputs: { graveto: 2, minerio_ferro: 2 }, output: { id: "machado_ferro", count: 1 }, table: true },
  { inputs: { graveto: 2, minerio_ferro: 3 }, output: { id: "picareta_ferro", count: 1 }, table: true },
  { inputs: { graveto: 1, diamante: 1 }, output: { id: "pa_diamante", count: 1 }, table: true },
  { inputs: { graveto: 1, diamante: 2 }, output: { id: "espada_diamante", count: 1 }, table: true },
  { inputs: { graveto: 2, diamante: 2 }, output: { id: "machado_diamante", count: 1 }, table: true },
  { inputs: { graveto: 2, diamante: 3 }, output: { id: "picareta_diamante", count: 1 }, table: true },
  { inputs: { la: 3, tabuas: 3 }, output: { id: "cama", count: 1 }, table: true },
];

/**
 * Verifica a grade contra as receitas. Aceita quantidades MAIORES que o
 * necessário (o excedente fica na grade) — sem itens extras de outro tipo.
 */
export function matchRecipe(grid: (ItemStack | null)[], allowTable: boolean): Recipe | null {
  const counts: Record<string, number> = {};
  for (const s of grid) {
    if (!s) continue;
    counts[s.id] = (counts[s.id] ?? 0) + s.count;
  }
  for (const r of RECIPES) {
    if (r.table && !allowTable) continue;
    const keys = Object.keys(r.inputs);
    if (keys.length !== Object.keys(counts).length) continue;
    let ok = true;
    for (const k of keys) {
      if ((counts[k] ?? 0) < r.inputs[k]) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}
