/**
 * SaveManager — persistência em localStorage com suporte a MÚLTIPLOS MUNDOS.
 * Registro: voxelworld_worlds_v1 = { [nome]: SaveData }
 * Mundo atual: voxelworld_current_v1 = nome
 * Saves antigos (voxelworld_save_v1) são migrados automaticamente como "Mundo 1".
 */
import type { ItemStack } from "./blocks";

export type GameMode = "survival" | "creative";

/** modos de pós-processamento (shaders) */
export type ShaderMode = "off" | "vinheta" | "cartoon" | "retro";

export interface Settings {
  sensibilidade: number; // 0.2 – 3
  fov: number; // 60 – 110
  renderDist: number; // 2 – 32 chunks
  volume: number; // 0 – 1
  qualidade: 0 | 1 | 2; // baixa, média, alta
  fpsLimit: number; // 0 = ilimitado · 20 – 240
  shader: ShaderMode;
}

export const DEFAULT_SETTINGS: Settings = {
  sensibilidade: 1,
  fov: 75,
  renderDist: 5,
  volume: 0.7,
  qualidade: 1,
  fpsLimit: 0,
  shader: "off",
};

export interface SaveData {
  version: number;
  seed: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: (ItemStack | null)[]; // 36 slots (0–8 hotbar)
  /** deltas[chunkKey] = [[localIndex, blockId], ...] */
  deltas: Record<string, [number, number][]>;
  settings: Settings;
  timeOfDay: number;
  mode?: GameMode;
  health?: number;
  bedSpawn?: { x: number; y: number; z: number } | null;
  /** timestamp da última gravação (para ordenar a lista) */
  savedAt?: number;
}

export interface WorldMeta {
  name: string;
  seed: number;
  mode: GameMode;
  savedAt: number;
}

const REG_KEY = "voxelworld_worlds_v1";
const CUR_KEY = "voxelworld_current_v1";
const LEGACY_KEY = "voxelworld_save_v1";

function readRegistry(): Record<string, SaveData> {
  try {
    const raw = localStorage.getItem(REG_KEY);
    if (raw) {
      const reg = JSON.parse(raw);
      if (reg && typeof reg === "object") return reg;
    }
  } catch (e) {
    console.error("[SaveManager] Registro corrompido:", e);
  }
  // migração do save único antigo
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = JSON.parse(legacy) as SaveData;
      if (data && data.version === 1 && Array.isArray(data.inventory)) {
        return { "Mundo 1": data };
      }
    }
  } catch {
    /* legado inválido — ignora */
  }
  return {};
}

function writeRegistry(reg: Record<string, SaveData>): boolean {
  try {
    localStorage.setItem(REG_KEY, JSON.stringify(reg));
    return true;
  } catch (e) {
    console.error("[SaveManager] Falha ao salvar (armazenamento cheio?):", e);
    return false;
  }
}

export const SaveManager = {
  listWorlds(): WorldMeta[] {
    const reg = readRegistry();
    return Object.entries(reg)
      .map(([name, d]) => ({
        name,
        seed: d.seed,
        mode: (d.mode ?? "survival") as GameMode,
        savedAt: d.savedAt ?? 0,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  },

  loadWorld(name: string): SaveData | null {
    try {
      const data = readRegistry()[name];
      if (!data || data.version !== 1 || !Array.isArray(data.inventory)) return null;
      return data;
    } catch (e) {
      console.error("[SaveManager] Falha ao ler mundo:", e);
      return null;
    }
  },

  saveWorld(name: string, data: SaveData): boolean {
    const reg = readRegistry();
    reg[name] = { ...data, savedAt: Date.now() };
    const ok = writeRegistry(reg);
    if (ok) this.setCurrent(name);
    return ok;
  },

  deleteWorld(name: string): void {
    const reg = readRegistry();
    delete reg[name];
    writeRegistry(reg);
    if (this.currentName() === name) {
      try { localStorage.removeItem(CUR_KEY); } catch { /* noop */ }
    }
  },

  /** Próximo nome livre no formato "Mundo N". */
  nextWorldName(): string {
    const reg = readRegistry();
    let n = Object.keys(reg).length + 1;
    while (reg["Mundo " + n]) n++;
    return "Mundo " + n;
  },

  setCurrent(name: string): void {
    try { localStorage.setItem(CUR_KEY, name); } catch { /* noop */ }
  },

  currentName(): string | null {
    try { return localStorage.getItem(CUR_KEY); } catch { return null; }
  },

  hasSave(): boolean {
    return Object.keys(readRegistry()).length > 0;
  },
};
