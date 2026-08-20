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
  PARALELE: 13,
  LA: 14,
  DIAMANTE: 15,
  CAMA: 16,
  LAVA: 17,
  // --- decorativos ---
  PEDRA_POLIDA: 18,
  TIJOLOS: 19,
  ARENITO: 20,
  VIDRO: 21,
  LA_VERMELHA: 22,
  LA_AZUL: 23,
  LA_AMARELA: 24,
  LA_VERDE: 25,
  LA_PRETA: 26,
  NEVE: 27,
  GELO: 28,
  OBSIDIANA: 29,
  LUMINARIA: 30,
  PRATELEIRA: 31,
  BAU: 32,
  BLOCO_FERRO: 33,
  BLOCO_OURO: 34,
  BLOCO_DIAMANTE: 35,
  QUARTZO: 36,
  TERRACOTA: 37,
  CONCRETO: 38,
  AREIA_VERMELHA: 39,
  PARALELE_MUSGO: 40,
  OURO: 41,
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
  /** emite luz (luminária) */
  glow?: boolean;
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
  LAVA: 20,
  PEDRA_POLIDA: 21,
  TIJOLOS: 22,
  ARENITO: 23,
  VIDRO: 24,
  LA_VERMELHA: 25,
  LA_AZUL: 26,
  LA_AMARELA: 27,
  LA_VERDE: 28,
  LA_PRETA: 29,
  NEVE: 30,
  GELO: 31,
  OBSIDIANA: 32,
  LUMINARIA: 33,
  PRATELEIRA: 34,
  BAU_TOPO: 35,
  BAU_LADO: 36,
  BLOCO_FERRO: 37,
  BLOCO_OURO: 38,
  BLOCO_DIAMANTE: 39,
  QUARTZO: 40,
  TERRACOTA: 41,
  CONCRETO: 42,
  AREIA_VERMELHA: 43,
  PARALELE_MUSGO: 44,
  OURO: 45,
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
BLOCKS[B.LA] = def(14, "Lã Branca", [T.LA, T.LA, T.LA], 0.8, null, "la");
BLOCKS[B.DIAMANTE] = def(15, "Minério de Diamante", [T.DIAMANTE, T.DIAMANTE, T.DIAMANTE], 3.0, "picareta", "diamante");
BLOCKS[B.CAMA] = def(16, "Cama", [T.CAMA_TOPO, T.CAMA_LADO, T.TABUAS], 0.2, null, "cama");
BLOCKS[B.LAVA] = def(17, "Lava", [T.LAVA, T.LAVA, T.LAVA], Infinity, null, null, { solid: false, transparent: true, glow: true });
// --- decorativos ---
BLOCKS[B.PEDRA_POLIDA] = def(18, "Pedra Polida", [T.PEDRA_POLIDA, T.PEDRA_POLIDA, T.PEDRA_POLIDA], 1.5, "picareta", "pedra_polida");
BLOCKS[B.TIJOLOS] = def(19, "Tijolos", [T.TIJOLOS, T.TIJOLOS, T.TIJOLOS], 2.0, "picareta", "tijolos");
BLOCKS[B.ARENITO] = def(20, "Arenito", [T.ARENITO, T.ARENITO, T.ARENITO], 0.8, "picareta", "arenito");
BLOCKS[B.VIDRO] = def(21, "Vidro", [T.VIDRO, T.VIDRO, T.VIDRO], 0.3, null, null, { transparent: true });
BLOCKS[B.LA_VERMELHA] = def(22, "Lã Vermelha", [T.LA_VERMELHA, T.LA_VERMELHA, T.LA_VERMELHA], 0.8, null, "la_vermelha");
BLOCKS[B.LA_AZUL] = def(23, "Lã Azul", [T.LA_AZUL, T.LA_AZUL, T.LA_AZUL], 0.8, null, "la_azul");
BLOCKS[B.LA_AMARELA] = def(24, "Lã Amarela", [T.LA_AMARELA, T.LA_AMARELA, T.LA_AMARELA], 0.8, null, "la_amarela");
BLOCKS[B.LA_VERDE] = def(25, "Lã Verde", [T.LA_VERDE, T.LA_VERDE, T.LA_VERDE], 0.8, null, "la_verde");
BLOCKS[B.LA_PRETA] = def(26, "Lã Preta", [T.LA_PRETA, T.LA_PRETA, T.LA_PRETA], 0.8, null, "la_preta");
BLOCKS[B.NEVE] = def(27, "Bloco de Neve", [T.NEVE, T.NEVE, T.NEVE], 0.2, "pa", "neve");
BLOCKS[B.GELO] = def(28, "Gelo", [T.GELO, T.GELO, T.GELO], 0.5, null, null, { transparent: true });
BLOCKS[B.OBSIDIANA] = def(29, "Obsidiana", [T.OBSIDIANA, T.OBSIDIANA, T.OBSIDIANA], 10.0, "picareta", "obsidiana");
BLOCKS[B.LUMINARIA] = def(30, "Luminária", [T.LUMINARIA, T.LUMINARIA, T.LUMINARIA], 0.3, null, "luminaria", { glow: true });
BLOCKS[B.PRATELEIRA] = def(31, "Prateleira", [T.TABUAS, T.PRATELEIRA, T.TABUAS], 1.5, "machado", "prateleira");
BLOCKS[B.BAU] = def(32, "Baú", [T.BAU_TOPO, T.BAU_LADO, T.BAU_TOPO], 2.5, "machado", "bau");
BLOCKS[B.BLOCO_FERRO] = def(33, "Bloco de Ferro", [T.BLOCO_FERRO, T.BLOCO_FERRO, T.BLOCO_FERRO], 5.0, "picareta", "bloco_ferro");
BLOCKS[B.BLOCO_OURO] = def(34, "Bloco de Ouro", [T.BLOCO_OURO, T.BLOCO_OURO, T.BLOCO_OURO], 3.0, "picareta", "bloco_ouro");
BLOCKS[B.BLOCO_DIAMANTE] = def(35, "Bloco de Diamante", [T.BLOCO_DIAMANTE, T.BLOCO_DIAMANTE, T.BLOCO_DIAMANTE], 5.0, "picareta", "bloco_diamante");
BLOCKS[B.QUARTZO] = def(36, "Quartzo", [T.QUARTZO, T.QUARTZO, T.QUARTZO], 0.8, "picareta", "quartzo");
BLOCKS[B.TERRACOTA] = def(37, "Terracota", [T.TERRACOTA, T.TERRACOTA, T.TERRACOTA], 1.2, "picareta", "terracota");
BLOCKS[B.CONCRETO] = def(38, "Concreto Cinza", [T.CONCRETO, T.CONCRETO, T.CONCRETO], 1.8, "picareta", "concreto");
BLOCKS[B.AREIA_VERMELHA] = def(39, "Areia Vermelha", [T.AREIA_VERMELHA, T.AREIA_VERMELHA, T.AREIA_VERMELHA], 0.5, "pa", "areia_vermelha");
BLOCKS[B.PARALELE_MUSGO] = def(40, "Paralele. com Musgo", [T.PARALELE_MUSGO, T.PARALELE_MUSGO, T.PARALELE_MUSGO], 2.0, "picareta", "paralele_musgo");
BLOCKS[B.OURO] = def(41, "Minério de Ouro", [T.OURO, T.OURO, T.OURO], 3.0, "picareta", "ouro");

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

export type ArmorSlot = "capacete" | "peitoral" | "calca" | "botas" | "escudo";

export interface ItemDef {
  id: string;
  name: string;
  kind: "block" | "material" | "tool" | "armor" | "food";
  block?: number;
  tool?: ToolDef;
  /** pontos de armadura (reduzem dano) e slot de equipamento */
  armor?: { slot: ArmorSlot; points: number };
  /** vida restaurada ao comer */
  food?: number;
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

// blocos básicos
ITEMS["grama"] = { id: "grama", name: "Grama", kind: "block", block: B.GRAMA, maxStack: 64 };
ITEMS["terra"] = { id: "terra", name: "Terra", kind: "block", block: B.TERRA, maxStack: 64 };
ITEMS["pedra"] = { id: "pedra", name: "Pedra", kind: "block", block: B.PEDRA, maxStack: 64 };
ITEMS["areia"] = { id: "areia", name: "Areia", kind: "block", block: B.AREIA, maxStack: 64 };
ITEMS["tronco"] = { id: "tronco", name: "Tronco", kind: "block", block: B.TRONCO, maxStack: 64 };
ITEMS["folhas"] = { id: "folhas", name: "Folhas", kind: "block", block: B.FOLHAS, maxStack: 64 };
ITEMS["tabuas"] = { id: "tabuas", name: "Tábuas", kind: "block", block: B.TABUAS, maxStack: 64 };
ITEMS["bancada"] = { id: "bancada", name: "Bancada", kind: "block", block: B.BANCADA, maxStack: 64 };
ITEMS["paralele"] = { id: "paralele", name: "Paralelepípedo", kind: "block", block: B.PARALELE, maxStack: 64 };
ITEMS["la"] = { id: "la", name: "Lã Branca", kind: "block", block: B.LA, maxStack: 64 };
ITEMS["cama"] = { id: "cama", name: "Cama", kind: "block", block: B.CAMA, maxStack: 1 };

// blocos decorativos
const decor: [string, string, number][] = [
  ["pedra_polida", "Pedra Polida", B.PEDRA_POLIDA],
  ["tijolos", "Tijolos", B.TIJOLOS],
  ["arenito", "Arenito", B.ARENITO],
  ["vidro", "Vidro", B.VIDRO],
  ["la_vermelha", "Lã Vermelha", B.LA_VERMELHA],
  ["la_azul", "Lã Azul", B.LA_AZUL],
  ["la_amarela", "Lã Amarela", B.LA_AMARELA],
  ["la_verde", "Lã Verde", B.LA_VERDE],
  ["la_preta", "Lã Preta", B.LA_PRETA],
  ["neve", "Bloco de Neve", B.NEVE],
  ["gelo", "Gelo", B.GELO],
  ["obsidiana", "Obsidiana", B.OBSIDIANA],
  ["luminaria", "Luminária", B.LUMINARIA],
  ["prateleira", "Prateleira", B.PRATELEIRA],
  ["bau", "Baú", B.BAU],
  ["bloco_ferro", "Bloco de Ferro", B.BLOCO_FERRO],
  ["bloco_ouro", "Bloco de Ouro", B.BLOCO_OURO],
  ["bloco_diamante", "Bloco de Diamante", B.BLOCO_DIAMANTE],
  ["quartzo", "Quartzo", B.QUARTZO],
  ["terracota", "Terracota", B.TERRACOTA],
  ["concreto", "Concreto Cinza", B.CONCRETO],
  ["areia_vermelha", "Areia Vermelha", B.AREIA_VERMELHA],
  ["paralele_musgo", "Paralele. com Musgo", B.PARALELE_MUSGO],
];
for (const [id, name, block] of decor) {
  ITEMS[id] = { id, name, kind: "block", block, maxStack: 64 };
}

// materiais
item({ id: "graveto", name: "Graveto", kind: "material", maxStack: 64 });
item({ id: "minerio_carvao", name: "Carvão", kind: "material", maxStack: 64 });
item({ id: "minerio_ferro", name: "Ferro Bruto", kind: "material", maxStack: 64 });
item({ id: "diamante", name: "Diamante", kind: "material", maxStack: 64 });
item({ id: "ouro", name: "Ouro Bruto", kind: "material", maxStack: 64 });

// comida
item({ id: "carne_porco", name: "Carne de Porco", kind: "food", food: 6, maxStack: 64 });
item({ id: "carne_vaca", name: "Bife", kind: "food", food: 8, maxStack: 64 });

// baldes
item({ id: "balde", name: "Balde", kind: "material", maxStack: 16 });
item({ id: "balde_agua", name: "Balde de Água", kind: "material", maxStack: 1 });
item({ id: "balde_lava", name: "Balde de Lava", kind: "material", maxStack: 1 });

// armaduras e escudo
const armorDefs: [string, string, ArmorSlot, number][] = [
  ["capacete_ferro", "Capacete de Ferro", "capacete", 2],
  ["peitoral_ferro", "Peitoral de Ferro", "peitoral", 6],
  ["calca_ferro", "Calça de Ferro", "calca", 5],
  ["botas_ferro", "Botas de Ferro", "botas", 2],
  ["capacete_diamante", "Capacete de Diamante", "capacete", 3],
  ["peitoral_diamante", "Peitoral de Diamante", "peitoral", 8],
  ["calca_diamante", "Calça de Diamante", "calca", 6],
  ["botas_diamante", "Botas de Diamante", "botas", 3],
];
for (const [id, name, slot, points] of armorDefs) {
  item({ id, name, kind: "armor", armor: { slot, points }, maxStack: 1 });
}
item({ id: "escudo", name: "Escudo", kind: "armor", armor: { slot: "escudo", points: 4 }, maxStack: 1 });

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
  { inputs: { areia: 4 }, output: { id: "arenito", count: 1 } },
  { inputs: { pedra: 4 }, output: { id: "pedra_polida", count: 4 } },
  { inputs: { paralele: 4 }, output: { id: "tijolos", count: 4 } },
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
  { inputs: { minerio_ferro: 3 }, output: { id: "balde", count: 1 }, table: true },
  { inputs: { tabuas: 4, minerio_ferro: 2 }, output: { id: "escudo", count: 1 }, table: true },
  // armaduras de ferro
  { inputs: { minerio_ferro: 5 }, output: { id: "capacete_ferro", count: 1 }, table: true },
  { inputs: { minerio_ferro: 8 }, output: { id: "peitoral_ferro", count: 1 }, table: true },
  { inputs: { minerio_ferro: 7 }, output: { id: "calca_ferro", count: 1 }, table: true },
  { inputs: { minerio_ferro: 4 }, output: { id: "botas_ferro", count: 1 }, table: true },
  // armaduras de diamante
  { inputs: { diamante: 5 }, output: { id: "capacete_diamante", count: 1 }, table: true },
  { inputs: { diamante: 8 }, output: { id: "peitoral_diamante", count: 1 }, table: true },
  { inputs: { diamante: 7 }, output: { id: "calca_diamante", count: 1 }, table: true },
  { inputs: { diamante: 4 }, output: { id: "botas_diamante", count: 1 }, table: true },
  // decorativos avançados
  { inputs: { areia: 4, minerio_carvao: 1 }, output: { id: "vidro", count: 4 }, table: true },
  { inputs: { tabuas: 6 }, output: { id: "prateleira", count: 1 }, table: true },
  { inputs: { tabuas: 8 }, output: { id: "bau", count: 1 }, table: true },
  { inputs: { minerio_ferro: 9 }, output: { id: "bloco_ferro", count: 1 }, table: true },
  { inputs: { ouro: 9 }, output: { id: "bloco_ouro", count: 1 }, table: true },
  { inputs: { diamante: 9 }, output: { id: "bloco_diamante", count: 1 }, table: true },
  { inputs: { minerio_carvao: 4, graveto: 1 }, output: { id: "luminaria", count: 4 }, table: true },
  { inputs: { terra: 4 }, output: { id: "terracota", count: 4 }, table: true },
  { inputs: { areia: 4, paralele: 1 }, output: { id: "concreto", count: 4 }, table: true },
  { inputs: { la: 1, terra: 1 }, output: { id: "la_vermelha", count: 1 } },
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
