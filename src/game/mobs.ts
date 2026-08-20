/**
 * Mobs — criaturas voxel simples: porco e ovelha (passivos, vagam de dia) e
 * sombra (hostil, caça o jogador à noite e queima de dia).
 * Cada mob é um THREE.Group de caixas coloridas; IA de vagar/caçar com
 * gravidade, pulo de obstáculos e dano por contato.
 */
import * as THREE from "three";
import { B } from "./blocks";
import type { World } from "./world";

export type MobType = "porco" | "ovelha" | "sombra";

export class Mob {
  type: MobType;
  pos: THREE.Vector3;
  vel = new THREE.Vector3();
  yaw = 0;
  targetYaw = 0;
  health: number;
  maxHealth: number;
  onGround = false;
  attackCd = 0;
  wanderT = 0;
  walkSpeed = 0;
  flashT = 0;
  legPhase = 0;
  group: THREE.Group;
  legs: THREE.Mesh[] = [];

  constructor(type: MobType, x: number, y: number, z: number) {
    this.type = type;
    this.pos = new THREE.Vector3(x, y, z);
    this.maxHealth = this.health = type === "sombra" ? 20 : type === "porco" ? 10 : 8;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.buildMesh();
  }

  get height(): number { return this.type === "sombra" ? 1.8 : 1.0; }
  get radius(): number { return 0.4; }

  private mat(color: number): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({ color });
  }

  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, leg = false): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(x, y, z);
    this.group.add(m);
    if (leg) this.legs.push(m);
    return m;
  }

  private buildMesh(): void {
    if (this.type === "porco") {
      this.box(0.55, 0.85, 0.55, 0xe8a2a8, 0, 0.62, 0);      // corpo
      const head = this.box(0.45, 0.45, 0.45, 0xe8a2a8, 0, 0.95, -0.42); // cabeça (frente = -Z)
      head.position.z = -0.45;
      this.box(0.22, 0.16, 0.08, 0xd68b92, 0, 0.88, -0.7);    // focinho
      this.box(0.18, 0.38, 0.18, 0xdb939b, -0.16, 0.19, -0.18, true);
      this.box(0.18, 0.38, 0.18, 0xdb939b, 0.16, 0.19, -0.18, true);
      this.box(0.18, 0.38, 0.18, 0xdb939b, -0.16, 0.19, 0.18, true);
      this.box(0.18, 0.38, 0.18, 0xdb939b, 0.16, 0.19, 0.18, true);
    } else if (this.type === "ovelha") {
      this.box(0.6, 0.95, 0.62, 0xe8e8e2, 0, 0.68, 0);        // lã do corpo
      this.box(0.4, 0.4, 0.4, 0xd9d9d2, 0, 1.0, -0.45);       // cabeça
      this.box(0.24, 0.16, 0.06, 0x8a8a82, 0, 0.98, -0.68);   // face
      this.box(0.16, 0.42, 0.16, 0xcfcfc8, -0.17, 0.21, -0.18, true);
      this.box(0.16, 0.42, 0.16, 0xcfcfc8, 0.17, 0.21, -0.18, true);
      this.box(0.16, 0.42, 0.16, 0xcfcfc8, -0.17, 0.21, 0.18, true);
      this.box(0.16, 0.42, 0.16, 0xcfcfc8, 0.17, 0.21, 0.18, true);
    } else {
      // sombra — zumbi: pele verde, braços estendidos
      this.box(0.5, 0.72, 0.28, 0x2e6b62, 0, 1.06, 0);        // torso (camisa)
      this.box(0.5, 0.5, 0.5, 0x5a8f4a, 0, 1.62, 0);          // cabeça
      this.box(0.1, 0.08, 0.02, 0x111111, -0.12, 1.66, -0.26); // olho
      this.box(0.1, 0.08, 0.02, 0x111111, 0.12, 1.66, -0.26);  // olho
      const armL = this.box(0.2, 0.2, 0.66, 0x5a8f4a, -0.35, 1.3, -0.3); // braços p/ frente
      const armR = this.box(0.2, 0.2, 0.66, 0x5a8f4a, 0.35, 1.3, -0.3);
      armL.rotation.x = 0; armR.rotation.x = 0;
      this.box(0.2, 0.7, 0.2, 0x3a4a8a, -0.14, 0.35, 0, true);
      this.box(0.2, 0.7, 0.2, 0x3a4a8a, 0.14, 0.35, 0, true);
    }
  }

  /** flash vermelho ao levar dano */
  setFlash(): void {
    this.flashT = 0.25;
  }
}

const MOB_DROP: Record<MobType, string | null> = { porco: null, ovelha: "la", sombra: null };

export class Mobs {
  mobs: Mob[] = [];
  private scene: THREE.Scene;
  private world: World;
  private spawnT = 3;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
  }

  dropFor(type: MobType): string | null { return MOB_DROP[type]; }

  /** Ray-AABB contra todos os mobs; retorna o mais próximo dentro de maxDist. */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): Mob | null {
    let best: Mob | null = null;
    let bestT = maxDist;
    for (const m of this.mobs) {
      const min = new THREE.Vector3(m.pos.x - m.radius, m.pos.y, m.pos.z - m.radius);
      const max = new THREE.Vector3(m.pos.x + m.radius, m.pos.y + m.height, m.pos.z + m.radius);
      const t = rayAABB(ox, oy, oz, dx, dy, dz, min, max);
      if (t !== null && t < bestT) { bestT = t; best = m; }
    }
    return best;
  }

  /** Aplica dano; retorna true se o mob morreu. */
  hurt(mob: Mob, dmg: number, fromX: number, fromZ: number): boolean {
    mob.health -= dmg;
    mob.setFlash();
    const dx = mob.pos.x - fromX, dz = mob.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    mob.vel.x += (dx / len) * 6;
    mob.vel.z += (dz / len) * 6;
    mob.vel.y = Math.max(mob.vel.y, 4);
    if (mob.health <= 0) {
      this.remove(mob);
      return true;
    }
    return false;
  }

  private remove(mob: Mob): void {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
    this.scene.remove(mob.group);
    mob.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  update(dt: number, playerPos: THREE.Vector3, isNight: boolean, damagePlayer: (dmg: number, kx: number, kz: number) => void): void {
    // spawn / despawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      if (this.mobs.length < 8) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * 20;
        const x = playerPos.x + Math.cos(ang) * dist;
        const z = playerPos.z + Math.sin(ang) * dist;
        const y = this.world.surfaceHeight(Math.floor(x), Math.floor(z));
        const below = this.world.getBlock(Math.floor(x), y - 1, Math.floor(z));
        if (below !== B.AGUA && y > 2) { // nunca dentro d'água
          const type: MobType = isNight
            ? (Math.random() < 0.75 ? "sombra" : "porco")
            : (Math.random() < 0.5 ? "porco" : "ovelha");
          const mob = new Mob(type, x, y, z);
          this.mobs.push(mob);
          this.scene.add(mob.group);
        }
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const distP = m.pos.distanceTo(playerPos);
      if (distP > 64) { this.remove(m); continue; }

      m.attackCd -= dt;
      m.flashT = Math.max(0, m.flashT - dt);
      m.wanderT -= dt;

      let speed = 0;
      let chase = false;

      if (m.type === "sombra") {
        if (isNight) {
          if (distP < 22) {
            chase = true;
            speed = 3.0;
            m.targetYaw = Math.atan2(-(playerPos.x - m.pos.x), -(playerPos.z - m.pos.z));
            if (distP < 1.6 && m.attackCd <= 0) {
              m.attackCd = 1.1;
              const dx = playerPos.x - m.pos.x, dz = playerPos.z - m.pos.z;
              const l = Math.hypot(dx, dz) || 1;
              damagePlayer(3, dx / l, dz / l);
            }
          }
        } else {
          // queima de dia
          m.health -= dt * 2.5;
          speed = 3.6;
          if (m.wanderT <= 0) { m.wanderT = 1.5; m.targetYaw = Math.random() * Math.PI * 2; }
          if (m.health <= 0) { this.remove(m); continue; }
        }
      } else {
        // passivos: alterna caminhar e ficar parado
        if (m.wanderT <= 0) {
          m.wanderT = 2 + Math.random() * 4;
          m.walkSpeed = Math.random() < 0.35 ? 0 : m.type === "ovelha" ? 0.9 : 1.1;
          if (m.walkSpeed > 0) m.targetYaw = Math.random() * Math.PI * 2;
        }
        speed = m.walkSpeed;
      }

      // virar suavemente
      let dy = m.targetYaw - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, 5 * dt);

      const wantX = -Math.sin(m.yaw) * speed;
      const wantZ = -Math.cos(m.yaw) * speed;
      const k = 1 - Math.exp(-8 * dt);
      m.vel.x += (wantX - m.vel.x) * k;
      m.vel.z += (wantZ - m.vel.z) * k;
      m.vel.y -= 24 * dt;

      // colisão simples por eixo + pulo de obstáculos
      m.onGround = false;
      this.moveMob(m, "x", m.vel.x * dt);
      this.moveMob(m, "z", m.vel.z * dt);
      this.moveMob(m, "y", m.vel.y * dt);
      if (m.onGround && (Math.abs(m.vel.x) > 0.5 || Math.abs(m.vel.z) > 0.5)) {
        if (this.blockedAhead(m)) m.vel.y = 7.5;
      }

      // animação das pernas + flash
      if (Math.hypot(m.vel.x, m.vel.z) > 0.4) m.legPhase += dt * 9;
      m.legs.forEach((leg, idx) => {
        leg.rotation.x = Math.sin(m.legPhase + (idx % 2) * Math.PI) * 0.55;
      });
      const flash = m.flashT > 0;
      m.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshLambertMaterial;
          mat.emissive.setHex(flash ? 0x8a1a10 : 0x000000);
        }
      });

      m.group.position.copy(m.pos);
      // frente da mesh = -Z do grupo, mesma convenção do yaw do jogador
      m.group.rotation.y = m.yaw;
    }
  }

  private blockedAhead(m: Mob): boolean {
    const ax = m.pos.x - Math.sin(m.yaw) * 0.5;
    const az = m.pos.z - Math.cos(m.yaw) * 0.5;
    return this.world.isSolid(Math.floor(ax), Math.floor(m.pos.y + 0.3), Math.floor(az));
  }

  private moveMob(m: Mob, axis: "x" | "y" | "z", amount: number): void {
    if (amount === 0) return;
    m.pos[axis] += amount;
    const r = m.radius, h = m.height;
    const minX = Math.floor(m.pos.x - r), maxX = Math.floor(m.pos.x + r);
    const minY = Math.floor(m.pos.y), maxY = Math.floor(m.pos.y + h);
    const minZ = Math.floor(m.pos.z - r), maxZ = Math.floor(m.pos.z + r);
    for (let bx = minX; bx <= maxX; bx++)
      for (let by = minY; by <= maxY; by++)
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!this.world.isSolid(bx, by, bz)) continue;
          if (
            m.pos.x + r <= bx || m.pos.x - r >= bx + 1 ||
            m.pos.y + h <= by || m.pos.y >= by + 1 ||
            m.pos.z + r <= bz || m.pos.z - r >= bz + 1
          ) continue;
          if (axis === "x") { m.pos.x = amount > 0 ? bx - r - 0.001 : bx + 1 + r + 0.001; m.vel.x = 0; }
          else if (axis === "z") { m.pos.z = amount > 0 ? bz - r - 0.001 : bz + 1 + r + 0.001; m.vel.z = 0; }
          else {
            if (amount > 0) m.pos.y = by - h - 0.001;
            else { m.pos.y = by + 1; m.onGround = true; }
            m.vel.y = 0;
          }
        }
  }

  dispose(): void {
    for (const m of [...this.mobs]) this.remove(m);
  }
}

/** Interseção raio-AABB (slab method). Retorna t ou null. */
function rayAABB(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, min: THREE.Vector3, max: THREE.Vector3): number | null {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [min.x, min.y, min.z], mx = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-10) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : tmax > 0 ? 0 : null;
}
