/**
 * SaveManager — persistência em localStorage.
 * Guarda: posição, inventário, configurações, seed e os "deltas" de terreno
 * (blocos removidos/colocados pelo jogador), permitindo mundos infinitos salvos.
 */
import type { ItemStack } from "./blocks";

export interface Settings {
  sensibilidade: number; // 0.2 – 3
  fov: number; // 60 – 110
  renderDist: number; // 2 – 8 chunks
  volume: number; // 0 – 1
  qualidade: 0 | 1 | 2; // baixa, média, alta
}

export const DEFAULT_SETTINGS: Settings = {
  sensibilidade: 1,
  fov: 75,
  renderDist: 5,
  volume: 0.7,
  qualidade: 1,
};

export type GameMode = "survival" | "creative";

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
}

const KEY = "voxelworld_save_v1";

export const SaveManager = {
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (!data || data.version !== 1 || !Array.isArray(data.inventory)) return null;
      return data;
    } catch (e) {
      console.error("[SaveManager] Falha ao ler save:", e);
      return null;
    }
  },

  save(data: SaveData): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("[SaveManager] Falha ao salvar (armazenamento cheio?):", e);
      return false;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      console.error("[SaveManager] Falha ao limpar save:", e);
    }
  },

  hasSave(): boolean {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  },
};
