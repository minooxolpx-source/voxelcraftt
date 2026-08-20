/**
 * Mesher de chunks — gera UM BufferGeometry por chunk (opaco) e outro para água,
 * descartando faces entre blocos sólidos vizinhos (occlusion culling de faces).
 * Evita milhares de THREE.Mesh: cada chunk vira no máximo 2 draw calls.
 */
import * as THREE from "three";
import { B, blockDef } from "./blocks";
import { ATLAS_COLS, ATLAS_ROWS } from "./textures";

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 20;

interface Corner { pos: [number, number, number]; uv: [number, number] }
interface Face { dir: [number, number, number]; corners: Corner[]; shade: number }

// Tabela clássica de faces (ordem dos vértices + índices 0,1,2 / 2,1,3 → normal p/ fora)
const FACES: Face[] = [
  { dir: [-1, 0, 0], shade: 0.72, corners: [{ pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] }] },
  { dir: [1, 0, 0], shade: 0.72, corners: [{ pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] }] },
  { dir: [0, -1, 0], shade: 0.52, corners: [{ pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] }] },
  { dir: [0, 1, 0], shade: 1.0, corners: [{ pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] }] },
  { dir: [0, 0, -1], shade: 0.86, corners: [{ pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] }] },
  { dir: [0, 0, 1], shade: 0.86, corners: [{ pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] }] },
];

export type BlockGetter = (x: number, y: number, z: number) => number;

export interface ChunkMeshData {
  opaque: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

class GeoBuf {
  pos: number[] = [];
  norm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  count = 0;

  addFace(x: number, y: number, z: number, face: Face, tile: number, shade: number, topY = 1): void {
    const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
    const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
    const du = 1 / ATLAS_COLS;
    const dv = 1 / ATLAS_ROWS;
    const e = 0.0006; // epsilon anti-sangramento entre tiles
    const ndx = this.count;
    for (const c of face.corners) {
      this.pos.push(x + c.pos[0], y + Math.min(c.pos[1], 1) * topY, z + c.pos[2]);
      this.norm.push(face.dir[0], face.dir[1], face.dir[2]);
      const u = u0 + e + c.uv[0] * (du - 2 * e);
      const v = v0 + e + c.uv[1] * (dv - 2 * e);
      this.uv.push(u, v);
      this.col.push(shade, shade, shade);
    }
    this.idx.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
    this.count += 4;
  }

  build(): THREE.BufferGeometry | null {
    if (this.count === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const isOpaque = (id: number) => id !== B.AIR && id !== B.AGUA;

/**
 * Constroi as geometrias de um chunk em (cx, cz).
 * `local` é o array do próprio chunk (leitura direta, rápida); `get` só é
 * consultado para células fora do chunk / acima-abaixo do mundo.
 */
export function buildChunkMesh(cx: number, cz: number, local: Uint8Array, get: BlockGetter): ChunkMeshData {
  const solid = new GeoBuf();
  const water = new GeoBuf();
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;

  const read = (wx: number, wy: number, wz: number): number => {
    if (wy < 0 || wy >= HEIGHT) return get(wx, wy, wz);
    const lx = wx - x0, lz = wz - z0;
    if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) return local[(wy * CHUNK + lz) * CHUNK + lx];
    return get(wx, wy, wz);
  };

  for (let ly = 0; ly < HEIGHT; ly++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = x0 + lx, wy = ly, wz = z0 + lz;
        const id = local[(ly * CHUNK + lz) * CHUNK + lx];
        if (id === B.AIR) continue;
        const bd = blockDef(id);

        if (id === B.AGUA) {
          const above = read(wx, wy + 1, wz);
          for (const face of FACES) {
            const n = read(wx + face.dir[0], wy + face.dir[1], wz + face.dir[2]);
            // água: só desenha face contra ar (superfície + bordas visíveis)
            if (n !== B.AIR) continue;
            const topY = above === B.AIR ? 0.88 : 1;
            water.addFace(wx, wy, wz, face, bd.tiles[face.dir[1] === 1 ? 0 : face.dir[1] === -1 ? 2 : 1], face.shade, topY);
          }
          continue;
        }

        for (const face of FACES) {
          const n = read(wx + face.dir[0], wy + face.dir[1], wz + face.dir[2]);
          if (isOpaque(n)) continue; // face oculta
          const tile = face.dir[1] === 1 ? bd.tiles[0] : face.dir[1] === -1 ? bd.tiles[2] : bd.tiles[1];
          solid.addFace(wx, wy, wz, face, tile, face.shade);
        }
      }
    }
  }

  return { opaque: solid.build(), water: water.build() };
}

/** Índice local de um bloco dentro do chunk (x rápido, depois z, depois y). */
export function localIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK + lz) * CHUNK + lx;
}
