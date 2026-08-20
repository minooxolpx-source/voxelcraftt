/**
 * Drops — itens que caem no chão ao quebrar blocos/mobs. Mini-cubos com a
 * textura do bloco (ou forma própria para materiais), com gravidade, giro,
 * flutuação e atração magnética até o jogador.
 */
import * as THREE from "three";
import { itemDef } from "./blocks";
import type { World } from "./world";
import type { TexturePack } from "./textures";

interface Drop {
  mesh: THREE.Mesh;
  id: string;
  count: number;
  vel: THREE.Vector3;
  baseY: number;
  rest: boolean;
  life: number;
  age: number;
}

const MAT_COLORS: Record<string, number> = {
  graveto: 0x8a6234,
  diamante: 0x4aedd9,
  minerio_carvao: 0x3a3a3a,
  minerio_ferro: 0xd8af93,
};

export class Drops {
  private scene: THREE.Scene;
  private world: World;
  private tex: TexturePack;
  private drops: Drop[] = [];
  private matGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);

  constructor(scene: THREE.Scene, world: World, tex: TexturePack) {
    this.scene = scene;
    this.world = world;
    this.tex = tex;
  }

  spawn(x: number, y: number, z: number, itemId: string, count = 1): void {
    if (this.drops.length > 90) return; // limite de segurança
    const def = itemDef(itemId);
    if (!def) return;
    let mesh: THREE.Mesh;
    if (def.block !== undefined) {
      mesh = new THREE.Mesh(this.tex.blockCube(def.block, 0.3), this.tex.atlasMaterial);
    } else {
      mesh = new THREE.Mesh(this.matGeo, new THREE.MeshLambertMaterial({ color: MAT_COLORS[itemId] ?? 0xcccccc }));
    }
    mesh.position.set(x + 0.5, y + 0.45, z + 0.5);
    mesh.castShadow = true;
    const drop: Drop = {
      mesh, id: itemId, count,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4),
      baseY: 0, rest: false, life: 90, age: 0,
    };
    this.drops.push(drop);
    this.scene.add(mesh);
  }

  update(dt: number, playerPos: THREE.Vector3, onCollect: (id: string, count: number) => void): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.life -= dt;
      if (d.life <= 0) { this.remove(i); continue; }

      const p = d.mesh.position;
      const dx = playerPos.x - p.x, dy = playerPos.y + 0.9 - p.y, dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);

      if (d.age > 0.35 && dist < 1.7) {
        // ímã: voa até o jogador
        const s = 11 * dt;
        d.vel.set(dx * 6, dy * 6, dz * 6);
        p.x += dx * s; p.y += dy * s; p.z += dz * s;
        if (dist < 0.7) {
          onCollect(d.id, d.count);
          this.remove(i);
          continue;
        }
      } else if (!d.rest) {
        d.vel.y -= 18 * dt;
        p.x += d.vel.x * dt;
        p.y += d.vel.y * dt;
        p.z += d.vel.z * dt;
        d.vel.x *= 1 - Math.min(1, 3 * dt);
        d.vel.z *= 1 - Math.min(1, 3 * dt);
        // chão
        const gy = Math.floor(p.y - 0.16);
        if (this.world.isSolid(Math.floor(p.x), gy, Math.floor(p.z))) {
          const top = gy + 1 + 0.16;
          if (d.vel.y < -2.5) {
            p.y = top;
            d.vel.y *= -0.32;
          } else {
            p.y = top;
            d.vel.y = 0;
            d.rest = true;
            d.baseY = top;
          }
        }
      } else {
        // flutua e gira no lugar
        p.y = d.baseY + 0.06 + Math.sin(d.age * 2.6) * 0.05;
        d.mesh.rotation.y += dt * 2.2;
      }
    }
  }

  private remove(i: number): void {
    const d = this.drops[i];
    this.scene.remove(d.mesh);
    // cubos de bloco usam geometria/material cacheados no TexturePack (não dispose);
    // materiais brutos têm material próprio por drop
    if (itemDef(d.id)?.block === undefined) {
      (d.mesh.material as THREE.Material).dispose();
    }
    this.drops.splice(i, 1);
  }

  dispose(): void {
    for (let i = this.drops.length - 1; i >= 0; i--) this.remove(i);
    this.matGeo.dispose();
  }
}
