/**
 * World — armazenamento de chunks, geração procedural de terreno
 * (colinas, montanhas, praias, água, cavernas, minérios, árvores),
 * carregamento/descarregamento dinâmico por distância, meshes por chunk
 * e raycasting voxel (DDA de Amanatides & Woo).
 */
import * as THREE from "three";
import { B, blockDef } from "./blocks";
import { Simplex, hash2, rng } from "./noise";
import { CHUNK, HEIGHT, SEA, buildChunkMesh, localIndex } from "./mesher";
import type { TexturePack } from "./textures";

export { CHUNK, HEIGHT, SEA };

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  mesh: THREE.Mesh | null;
  waterMesh: THREE.Mesh | null;
  glassMesh: THREE.Mesh | null;
  needsMesh: boolean;
}

export interface RayHit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  id: number;
  dist: number;
}

const chunkKey = (cx: number, cz: number) => cx + "," + cz;

export class World {
  seed: number;
  chunks = new Map<string, Chunk>();
  /** modificações do jogador: chunkKey → (localIndex → blockId) */
  deltas = new Map<string, Map<number, number>>();

  private noise: Simplex;
  private scene: THREE.Scene;
  private tex: TexturePack;
  private opaqueMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private genQueue: { cx: number; cz: number; d: number }[] = [];
  private lastQueueUpdate = 0;
  private playerChunk = { cx: 1e9, cz: 1e9 };

  renderDist = 5;

  constructor(scene: THREE.Scene, tex: TexturePack, seed: number) {
    this.scene = scene;
    this.tex = tex;
    this.seed = seed;
    this.noise = new Simplex(seed);
    this.opaqueMat = new THREE.MeshLambertMaterial({ map: tex.atlasTexture, vertexColors: true });
    this.waterMat = new THREE.MeshLambertMaterial({
      map: tex.waterTexture, transparent: true, opacity: 0.72,
      depthWrite: false, vertexColors: true, side: THREE.DoubleSide,
    });
  }

  get waterMaterial(): THREE.MeshLambertMaterial { return this.waterMat; }

  /* ---------------------------------------------------------------- */
  /* Acesso a blocos                                                   */
  /* ---------------------------------------------------------------- */

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.ROCHA;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return B.AIR;
    return c.blocks[localIndex(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  /** Para física: chunks ainda não carregados contam como sólidos (não cair do mundo). */
  getBlockPhysics(x: number, y: number, z: number): number {
    if (y < 0) return B.ROCHA;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return B.PEDRA;
    return c.blocks[localIndex(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  isSolid(x: number, y: number, z: number): boolean {
    return blockDef(this.getBlockPhysics(x, y, z)).solid;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (y < 1 || y >= HEIGHT) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    c.blocks[localIndex(lx, y, lz)] = id;

    // registra delta para salvamento
    const key = chunkKey(cx, cz);
    let d = this.deltas.get(key);
    if (!d) { d = new Map(); this.deltas.set(key, d); }
    d.set(localIndex(lx, y, lz), id);

    this.remeshChunk(cx, cz);
    // bordas do chunk: vizinhos precisam re-meshar (faces antes ocultas/expostas)
    if (lx === 0) this.remeshChunk(cx - 1, cz);
    if (lx === CHUNK - 1) this.remeshChunk(cx + 1, cz);
    if (lz === 0) this.remeshChunk(cx, cz - 1);
    if (lz === CHUNK - 1) this.remeshChunk(cx, cz + 1);
  }

  serializeDeltas(): Record<string, [number, number][]> {
    const out: Record<string, [number, number][]> = {};
    for (const [k, m] of this.deltas) {
      out[k] = Array.from(m.entries());
    }
    return out;
  }

  loadDeltas(data: Record<string, [number, number][]>): void {
    this.deltas.clear();
    if (!data || typeof data !== "object") return;
    for (const k of Object.keys(data)) {
      const arr = data[k];
      if (!Array.isArray(arr)) continue;
      const m = new Map<number, number>();
      for (const pair of arr) {
        if (Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && Number.isInteger(pair[1]) && pair[1] >= 0 && pair[1] <= 255) {
          m.set(pair[0], pair[1]);
        }
      }
      if (m.size > 0) this.deltas.set(k, m);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Geração procedural                                                */
  /* ---------------------------------------------------------------- */

  heightAt(x: number, z: number): number {
    const n = this.noise;
    const hills = n.fbm2(x * 0.011, z * 0.011, 4) * 0.5 + 0.5; // 0..1
    const ridge = n.fbm2(x * 0.0035 + 100, z * 0.0035 + 100, 3) * 0.5 + 0.5;
    const mask = smoothstep(0.52, 0.8, ridge); // onde nascem montanhas
    const rough = n.fbm2(x * 0.021 - 50, z * 0.021 - 50, 3) * 0.5 + 0.5;
    const h = 13 + hills * 13 + mask * (6 + rough * 26);
    return Math.max(3, Math.min(HEIGHT - 8, Math.round(h)));
  }

  generateChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // coluna por coluna: pedra / terra / topo + água + cavernas
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        const beach = h <= SEA + 1;
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let id: number = B.AIR;
          if (y === 0) id = B.ROCHA;
          else if (y <= h) {
            if (y === h) id = beach ? B.AREIA : B.GRAMA;
            else if (y >= h - 3) id = beach ? B.AREIA : B.TERRA;
            else id = B.PEDRA;
          } else if (y <= SEA) id = B.AGUA;
          blocks[localIndex(lx, y, lz)] = id;
        }
        // cavernas (ruído 3D) — nunca na rocha matriz nem nas 2 camadas do topo
        for (let y = 2; y <= h - 3; y++) {
          const cv = this.noise.fbm3(wx * 0.075, y * 0.11, wz * 0.075, 2);
          if (cv > 0.55) blocks[localIndex(lx, y, lz)] = B.AIR;
        }
      }
    }

    // minérios (blobs determinísticos por chunk)
    const r = rng((cx * 73856093) ^ (cz * 19349663) ^ this.seed);
    this.oreBlobs(blocks, x0, z0, r, B.CARVAO, 9, 5, 38, 4);
    this.oreBlobs(blocks, x0, z0, r, B.FERRO, 6, 4, 24, 3);
    this.oreBlobs(blocks, x0, z0, r, B.DIAMANTE, 3, 2, 12, 3); // raro e profundo

    const chunk: Chunk = { cx, cz, blocks, mesh: null, waterMesh: null, glassMesh: null, needsMesh: true };
    this.chunks.set(key, chunk);

    // árvores: considera troncos numa margem expandida p/ folhas cruzarem chunks
    this.plantTrees(chunk);

    // aplica modificações salvas do jogador
    const d = this.deltas.get(key);
    if (d) for (const [idx, id] of d) blocks[idx] = id;

    return chunk;
  }

  private oreBlobs(blocks: Uint8Array, x0: number, z0: number, r: () => number, ore: number, blobs: number, yMax: number, yMin: number, size: number): void {
    for (let i = 0; i < blobs; i++) {
      const lx = Math.floor(r() * CHUNK), lz = Math.floor(r() * CHUNK);
      const y = yMin + Math.floor(r() * (yMax - yMin));
      for (let dy = 0; dy < size; dy++) {
        const ox = lx + Math.floor(r() * 2.4 - 0.7);
        const oy = y + Math.floor(r() * 2.4 - 0.7);
        const oz = lz + Math.floor(r() * 2.4 - 0.7);
        if (ox < 0 || ox >= CHUNK || oz < 0 || oz >= CHUNK || oy < 1 || oy >= HEIGHT) continue;
        const idx = localIndex(ox, oy, oz);
        if (blocks[idx] === B.PEDRA) blocks[idx] = ore;
      }
    }
  }

  private plantTrees(chunk: Chunk): void {
    // margem de ±3 para folhas de árvores vizinhas cruzarem a fronteira do chunk
    const x0 = chunk.cx * CHUNK, z0 = chunk.cz * CHUNK;
    for (let wz = z0 - 3; wz < z0 + CHUNK + 3; wz++) {
      for (let wx = x0 - 3; wx < x0 + CHUNK + 3; wx++) {
        if (hash2(wx, wz, this.seed) >= 0.011) continue;
        const h = this.heightAt(wx, wz);
        // superfície é determinística pelo heightAt: acima de SEA+1 é sempre grama
        // (cavernas não tocam o topo e deltas do jogador são aplicados depois)
        if (h <= SEA + 1 || h > HEIGHT - 12) continue;
        const th = 4 + Math.floor(hash2(wz, wx, this.seed ^ 0x5f3) * 3); // 4–6
        this.writeTree(chunk, wx, h + 1, wz, th);
      }
    }
  }

  private writeTree(chunk: Chunk, tx: number, baseY: number, tz: number, th: number): void {
    const set = (wx: number, wy: number, wz: number, id: number, onlyIfAir = false) => {
      const lx = wx - chunk.cx * CHUNK, lz = wz - chunk.cz * CHUNK;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || wy < 1 || wy >= HEIGHT) return;
      const idx = localIndex(lx, wy, lz);
      if (onlyIfAir && chunk.blocks[idx] !== B.AIR) return;
      chunk.blocks[idx] = id;
    };
    const topY = baseY + th - 1;
    // copa: 2 camadas largas + 2 estreitas
    for (let dy = th - 3; dy <= th; dy++) {
      const y = baseY + dy;
      const rad = dy <= th - 2 ? 2 : 1;
      for (let ox = -rad; ox <= rad; ox++)
        for (let oz = -rad; oz <= rad; oz++) {
          if (Math.abs(ox) === rad && Math.abs(oz) === rad && hash2(tx + ox + y, tz + oz, this.seed) < 0.45) continue;
          if (ox === 0 && oz === 0 && dy <= th - 1) continue; // tronco atravessa
          set(tx + ox, y, tz + oz, B.FOLHAS, true);
        }
    }
    set(tx, topY + 1, tz, B.FOLHAS, true);
    // tronco
    for (let y = baseY; y < baseY + th; y++) set(tx, y, tz, B.TRONCO);
  }

  /* ---------------------------------------------------------------- */
  /* Carga/descarga dinâmica                                           */
  /* ---------------------------------------------------------------- */

  /** Atualiza filas de geração/mesh em torno do jogador. Chamar todo frame. */
  update(playerX: number, playerZ: number, now: number, meshBudget = 3): void {
    const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
    const rd = this.renderDist;

    if (now - this.lastQueueUpdate > 400 || pcx !== this.playerChunk.cx || pcz !== this.playerChunk.cz) {
      this.playerChunk = { cx: pcx, cz: pcz };
      this.lastQueueUpdate = now;
      const need: { cx: number; cz: number; d: number }[] = [];
      for (let dz = -rd; dz <= rd; dz++)
        for (let dx = -rd; dx <= rd; dx++) {
          const cx = pcx + dx, cz = pcz + dz;
          if (!this.chunks.has(chunkKey(cx, cz))) need.push({ cx, cz, d: dx * dx + dz * dz });
        }
      need.sort((a, b) => a.d - b.d);
      this.genQueue = need;

      // descarrega chunks distantes (libera memória + GPU)
      const unload = rd + 2;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > unload || Math.abs(c.cz - pcz) > unload) {
          this.disposeChunk(c);
          this.chunks.delete(k);
        }
      }
    }

    // geração: até 2 por frame
    let gen = 0;
    while (this.genQueue.length > 0 && gen < 2) {
      const n = this.genQueue.shift()!;
      if (!this.chunks.has(chunkKey(n.cx, n.cz))) {
        this.generateChunk(n.cx, n.cz);
        gen++;
      }
    }

    // mesh: prioridade = distância ao jogador
    let meshed = 0;
    let best: Chunk | null = null;
    let bestD = Infinity;
    for (const c of this.chunks.values()) {
      if (!c.needsMesh) continue;
      const d = (c.cx - pcx) ** 2 + (c.cz - pcz) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    while (best && meshed < meshBudget) {
      this.meshChunk(best);
      meshed++;
      best = null; bestD = Infinity;
      for (const c of this.chunks.values()) {
        if (!c.needsMesh) continue;
        const d = (c.cx - pcx) ** 2 + (c.cz - pcz) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
    }
  }

  /** Gera + mesha tudo num raio (usado na carga inicial, de forma assíncrona). */
  async initialLoad(radius: number, playerX: number, playerZ: number, onProgress: (p: number) => void): Promise<void> {
    const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
    const list: { cx: number; cz: number }[] = [];
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++)
        list.push({ cx: pcx + dx, cz: pcz + dz });
    list.sort((a, b) => ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2));
    for (let i = 0; i < list.length; i++) {
      const { cx, cz } = list[i];
      this.generateChunk(cx, cz);
      if (i % 8 === 7) {
        onProgress((i + 1) / list.length * 0.7);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    for (let i = 0; i < list.length; i++) {
      const c = this.chunks.get(chunkKey(list[i].cx, list[i].cz));
      if (c) this.meshChunk(c);
      if (i % 6 === 5) {
        onProgress(0.7 + (i + 1) / list.length * 0.3);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress(1);
  }

  private meshChunk(chunk: Chunk): void {
    chunk.needsMesh = false;
    const data = buildChunkMesh(chunk.cx, chunk.cz, chunk.blocks, (x, y, z) => this.getBlock(x, y, z));

    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }
    if (chunk.glassMesh) {
      this.scene.remove(chunk.glassMesh);
      chunk.glassMesh.geometry.dispose();
      chunk.glassMesh = null;
    }
    if (data.opaque) {
      chunk.mesh = new THREE.Mesh(data.opaque, this.opaqueMat);
      chunk.mesh.matrixAutoUpdate = false;
      chunk.mesh.updateMatrix();
      chunk.mesh.castShadow = true;
      chunk.mesh.receiveShadow = true;
      this.scene.add(chunk.mesh);
    }
    if (data.water) {
      chunk.waterMesh = new THREE.Mesh(data.water, this.waterMat);
      chunk.waterMesh.matrixAutoUpdate = false;
      chunk.waterMesh.updateMatrix();
      chunk.waterMesh.renderOrder = 2;
      this.scene.add(chunk.waterMesh);
    }
    if (data.glass) {
      chunk.glassMesh = new THREE.Mesh(data.glass, this.tex.glassMaterial);
      chunk.glassMesh.matrixAutoUpdate = false;
      chunk.glassMesh.updateMatrix();
      chunk.glassMesh.renderOrder = 3;
      chunk.glassMesh.receiveShadow = true;
      this.scene.add(chunk.glassMesh);
    }
  }

  private remeshChunk(cx: number, cz: number): void {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.needsMesh = true;
  }

  private disposeChunk(c: Chunk): void {
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    if (c.waterMesh) { this.scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
    if (c.glassMesh) { this.scene.remove(c.glassMesh); c.glassMesh.geometry.dispose(); }
  }

  get loadedCount(): number { return this.chunks.size; }

  /** Altura do topo sólido numa coluna (para spawn). */
  surfaceHeight(x: number, z: number): number {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (blockDef(id).solid) return y + 1;
    }
    return SEA + 2;
  }

  /* ---------------------------------------------------------------- */
  /* Raycast voxel (DDA)                                               */
  /* ---------------------------------------------------------------- */

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) < 1e-10 ? Infinity : Math.abs(1 / dx);
    const tdy = Math.abs(dy) < 1e-10 ? Infinity : Math.abs(1 / dy);
    const tdz = Math.abs(dz) < 1e-10 ? Infinity : Math.abs(1 / dz);
    let tmx = tdx === Infinity ? Infinity : (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx;
    let tmy = tdy === Infinity ? Infinity : (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy;
    let tmz = tdz === Infinity ? Infinity : (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    for (let i = 0; i < 256; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && id !== B.AGUA) {
        return { x, y, z, nx, ny, nz, id, dist: t };
      }
      if (tmx < tmy && tmx < tmz) {
        if (tmx > maxDist) return null;
        x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0;
      } else if (tmy < tmz) {
        if (tmy > maxDist) return null;
        y += stepY; t = tmy; tmy += tdy; nx = 0; ny = -stepY; nz = 0;
      } else {
        if (tmz > maxDist) return null;
        z += stepZ; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  dispose(): void {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.opaqueMat.dispose();
    this.waterMat.dispose();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
