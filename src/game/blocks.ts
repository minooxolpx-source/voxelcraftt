/**
 * Registro de blocos e itens do jogo (tudo original, sem assets externos).
 * Blocos são ids numéricos (0–255) guardados em Uint8Array nos chunks.
 * Itens usam string ids e podem ser blocos, materiais ou ferramentas.
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
} as const;

export type BlockId = number;
export type ToolClass = "picareta" | "machado" | "pa" | null;

export interface BlockDef {
  id: number;
  name: string;
  /** tiles [topo, lateral, base] no atlas de texturas */
  tiles: [number, number, number];
  solid: boolean;
  transparent: boolean;
  /** segundos para quebrar com a ferramenta certa (Infinity = inquebrável) */
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
} as const;

const def = (
  id: number, name: string, tiles: [number, number, number],
  hardness: number, tool: ToolClass, drop: string | null,
  opts: Partial<BlockDef> = {},
): BlockDef => ({ id, name, tiles, solid: true, transparent: false, hardness, tool, drop, ...opts });

export const BLOCKS: BlockDef[] = [];
BLOCKS[B.AIR] = def(0, "Ar", [0, 0, 0], 0, null, null, { solid: false, transparent: true });
BLOCKS[B.GRAMA] = def(1, "Grama", [T.GRAMA_TOPO, T.GRAMA_LADO, T.TERRA], 0.5, "pa", "terra");
BLOCKS[B.TERRA] = def(2, "Terra", [T.TERRA, T.TERRA, T.TERRA], 0.45, "pa", "terra");
BLOCKS[B.PEDRA] = def(3, "Pedra", [T.PEDRA, T.PEDRA, T.PEDRA], 1.7, "picareta", "pedra");
BLOCKS[B.AREIA] = def(4, "Areia", [T.AREIA, T.AREIA, T.AREIA], 0.4, "pa", "areia");
BLOCKS[B.TRONCO] = def(5, "Tronco", [T.TRONCO_TOPO, T.TRONCO_LADO, T.TRONCO_TOPO], 1.25, "machado", "tronco");
BLOCKS[B.FOLHAS] = def(6, "Folhas", [T.FOLHAS, T.FOLHAS, T.FOLHAS], 0.25, null, null);
BLOCKS[B.AGUA] = def(7, "Água", [T.AGUA, T.AGUA, T.AGUA], Infinity, null, null, { solid: false, transparent: true });
BLOCKS[B.CARVAO] = def(8, "Minério de Carvão", [T.CARVAO, T.CARVAO, T.CARVAO], 2.3, "picareta", "minerio_carvao");
BLOCKS[B.FERRO] = def(9, "Minério de Ferro", [T.FERRO, T.FERRO, T.FERRO], 2.9, "picareta", "minerio_ferro");
BLOCKS[B.TABUAS] = def(10, "Tábuas", [T.TABUAS, T.TABUAS, T.TABUAS], 1.0, "machado", "tabuas");
BLOCKS[B.BANCADA] = def(11, "Bancada", [T.BANCADA_TOPO, T.BANCADA_LADO, T.TABUAS], 1.3, "machado", "bancada");
BLOCKS[B.ROCHA] = def(12, "Rocha Matriz", [T.ROCHA, T.ROCHA, T.ROCHA], Infinity, null, null);

export function blockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[0];
}

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

export interface ToolDef { class: Exclude<ToolClass, null>; tier: number; speed: number }

export interface ItemDef {
  id: string;
  name: string;
  kind: "block" | "material" | "tool";
  block?: number;
  tool?: ToolDef;
  maxStack: number;
}

export interface ItemStack { id: string; count: number }

export const ITEMS: Record<string, ItemDef> = {};
const item = (d: ItemDef) => (ITEMS[d.id] = d);

// garante item de cada bloco colocável pelo próprio id (grama derruba "terra", etc.)
ITEMS["grama"] = { id: "grama", name: "Grama", kind: "block", block: B.GRAMA, maxStack: 64 };
ITEMS["terra"] = { id: "terra", name: "Terra", kind: "block", block: B.TERRA, maxStack: 64 };
ITEMS["pedra"] = { id: "pedra", name: "Pedra", kind: "block", block: B.PEDRA, maxStack: 64 };
ITEMS["areia"] = { id: "areia", name: "Areia", kind: "block", block: B.AREIA, maxStack: 64 };
ITEMS["tronco"] = { id: "tronco", name: "Tronco", kind: "block", block: B.TRONCO, maxStack: 64 };
ITEMS["folhas"] = { id: "folhas", name: "Folhas", kind: "block", block: B.FOLHAS, maxStack: 64 };
ITEMS["tabuas"] = { id: "tabuas", name: "Tábuas", kind: "block", block: B.TABUAS, maxStack: 64 };
ITEMS["bancada"] = { id: "bancada", name: "Bancada", kind: "block", block: B.BANCADA, maxStack: 64 };
ITEMS["minerio_carvao"] = { id: "minerio_carvao", name: "Minério de Carvão", kind: "block", block: B.CARVAO, maxStack: 64 };
ITEMS["minerio_ferro"] = { id: "minerio_ferro", name: "Minério de Ferro", kind: "block", block: B.FERRO, maxStack: 64 };

item({ id: "graveto", name: "Graveto", kind: "material", maxStack: 64 });
item({ id: "pa_madeira", name: "Pá de Madeira", kind: "tool", tool: { class: "pa", tier: 1, speed: 3 }, maxStack: 1 });
item({ id: "machado_madeira", name: "Machado de Madeira", kind: "tool", tool: { class: "machado", tier: 1, speed: 3 }, maxStack: 1 });
item({ id: "picareta_madeira", name: "Picareta de Madeira", kind: "tool", tool: { class: "picareta", tier: 1, speed: 3 }, maxStack: 1 });
item({ id: "pa_pedra", name: "Pá de Pedra", kind: "tool", tool: { class: "pa", tier: 2, speed: 5 }, maxStack: 1 });
item({ id: "machado_pedra", name: "Machado de Pedra", kind: "tool", tool: { class: "machado", tier: 2, speed: 5 }, maxStack: 1 });
item({ id: "picareta_pedra", name: "Picareta de Pedra", kind: "tool", tool: { class: "picareta", tier: 2, speed: 5 }, maxStack: 1 });

export function itemDef(id: string): ItemDef {
  return ITEMS[id];
}

/** Tempo de quebra considerando a ferramenta na mão do jogador. */
export function breakTime(blockId: number, tool: ToolDef | undefined): number {
  const bd = blockDef(blockId);
  if (!isFinite(bd.hardness)) return Infinity;
  let t = bd.hardness;
  if (tool && bd.tool && tool.class === bd.tool) t /= tool.speed;
  else if (tool) t /= 1.15; // ferramenta errada ajuda só um pouco
  return Math.max(0.08, t);
}

/* ------------------------------------------------------------------ */
/* Receitas (shapeless 2x2)                                            */
/* ------------------------------------------------------------------ */

export interface Recipe { inputs: Record<string, number>; output: ItemStack }

export const RECIPES: Recipe[] = [
  { inputs: { tronco: 1 }, output: { id: "tabuas", count: 4 } },
  { inputs: { tabuas: 2 }, output: { id: "graveto", count: 4 } },
  { inputs: { tabuas: 4 }, output: { id: "bancada", count: 1 } },
  { inputs: { graveto: 1, tabuas: 1 }, output: { id: "pa_madeira", count: 1 } },
  { inputs: { graveto: 1, tabuas: 2 }, output: { id: "machado_madeira", count: 1 } },
  { inputs: { graveto: 1, tabuas: 3 }, output: { id: "picareta_madeira", count: 1 } },
  { inputs: { graveto: 1, pedra: 1 }, output: { id: "pa_pedra", count: 1 } },
  { inputs: { graveto: 1, pedra: 2 }, output: { id: "machado_pedra", count: 1 } },
  { inputs: { graveto: 1, pedra: 3 }, output: { id: "picareta_pedra", count: 1 } },
];

/** Verifica a grade 2x2 (4 slots) contra as receitas. Retorna a receita ou null. */
export function matchRecipe(grid: (ItemStack | null)[]): Recipe | null {
  const counts: Record<string, number> = {};
  for (const s of grid) {
    if (!s) continue;
    counts[s.id] = (counts[s.id] ?? 0) + s.count;
  }
  for (const r of RECIPES) {
    const keys = Object.keys(r.inputs);
    if (keys.length !== Object.keys(counts).length) continue;
    let ok = true;
    for (const k of keys) {
      if (counts[k] !== r.inputs[k]) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}
