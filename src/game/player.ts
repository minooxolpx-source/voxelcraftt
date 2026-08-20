/**
 * Player — física em primeira pessoa: gravidade, pulo, corrida, natação,
 * VOO (criativo) e colisão AABB (0.6 x 1.8) resolvida por eixo (X, Z, Y).
 */
import * as THREE from "three";
import { B, blockDef } from "./blocks";
import type { World } from "./world";

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  jump: boolean;
  sprint: boolean; // Ctrl
  crouch: boolean; // Shift
}

export class Player {
  pos = new THREE.Vector3(0, 40, 0); // pés, centro
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;

  onGround = false;
  inWater = false;
  eyesInWater = false;
  wasInWater = false;
  /** modo voo (criativo) */
  fly = false;
  /** agachado (Shift) — anda devagar e abaixa a câmera */
  crouching = false;
  /** distância acumulada da queda atual (para dano) */
  fallDist = 0;

  readonly halfW = 0.3;
  readonly height = 1.8;
  readonly eye = 1.62;

  onJump: (() => void) | null = null;
  /** chamado ao aterrissar, com a distância total da queda */
  onLand: ((fallDist: number) => void) | null = null;
  onSplash: (() => void) | null = null;
  onStep: ((surface: string) => void) | null = null;

  private stepAcc = 0;

  get eyePosition(): THREE.Vector3 {
    const eyeY = this.eye - (this.crouching ? 0.28 : 0);
    return new THREE.Vector3(this.pos.x, this.pos.y + eyeY, this.pos.z);
  }

  update(dt: number, input: MoveInput, world: World): void {
    const f = input.forward, s = input.strafe;
    let wx = 0, wz = 0;
    if (f !== 0 || s !== 0) {
      const len = Math.hypot(f, s);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wx = ((-sin * f + cos * s) / len);
      wz = ((-cos * f - sin * s) / len);
    }

    // água?
    const bodyBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z));
    const headBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.eye), Math.floor(this.pos.z));
    this.inWater = !this.fly && (bodyBlock === B.AGUA || headBlock === B.AGUA);
    this.eyesInWater = headBlock === B.AGUA;
    if (this.inWater && !this.wasInWater && this.vel.y < -4) this.onSplash?.();
    this.wasInWater = this.inWater;

    // agachar (Shift) — no chão, fora d'água e sem voar
    this.crouching = input.crouch && this.onGround && !this.inWater && !this.fly;

    const sprinting = input.sprint && f > 0 && !this.inWater && !this.fly && !this.crouching;
    const baseSpeed = this.crouching ? 1.7 : sprinting ? 6.3 : 4.2;
    const speed = this.fly ? (input.crouch ? 5 : 9.5) : this.inWater ? 3.1 : baseSpeed;

    const rate = this.fly ? 12 : this.onGround ? 16 : this.inWater ? 8 : 4.5;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    if (this.fly) {
      // voo criativo: espaço sobe, Shift (agachar) desce
      const vy = input.jump ? 1 : input.crouch ? -1 : 0;
      this.vel.y += (vy * 9 - this.vel.y) * (1 - Math.exp(-10 * dt));
      this.fallDist = 0;
    } else if (this.inWater) {
      this.vel.y -= 7 * dt;
      this.vel.y = Math.max(this.vel.y, -3.2);
      if (input.jump) {
        // perto da superfície dá um impulso maior para conseguir sair da água
        const above = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.height + 0.2), Math.floor(this.pos.z));
        this.vel.y = above === B.AIR || above === B.AGUA ? 5.6 : 3.6;
      }
      this.fallDist = 0;
    } else {
      this.vel.y -= 26 * dt;
      if (input.jump && this.onGround) {
        this.vel.y = 8.7;
        this.onJump?.();
      }
      if (this.vel.y < 0 && !this.onGround) this.fallDist += -this.vel.y * dt;
    }

    // ---- integração + colisão por eixo ----
    this.onGround = false;
    this.moveAxis("x", this.vel.x * dt, world);
    this.moveAxis("z", this.vel.z * dt, world);
    this.moveAxis("y", this.vel.y * dt, world);

    if (this.onGround) {
      if (this.fallDist > 0.4) this.onLand?.(this.fallDist);
      this.fallDist = 0;
    }

    // passos
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.fly && this.onGround && hSpeed > 1.2) {
      this.stepAcc += hSpeed * dt;
      const stride = sprinting ? 2.6 : 2.2;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.onStep?.(this.surfaceBelow(world));
      }
    } else if (this.inWater && hSpeed > 1) {
      this.stepAcc += hSpeed * dt;
      if (this.stepAcc > 3) { this.stepAcc = 0; this.onStep?.("agua"); }
    }
  }

  private surfaceBelow(world: World): string {
    const id = world.getBlockPhysics(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    const name = blockDef(id).name.toLowerCase();
    if (name.includes("grama")) return "grama";
    if (name.includes("areia")) return "areia";
    if (name.includes("pedra") || name.includes("minério") || name.includes("rocha") || name.includes("paralele")) return "pedra";
    if (name.includes("tábua") || name.includes("tronco") || name.includes("bancada")) return "madeira";
    return "terra";
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number, world: World): void {
    if (amount === 0) return;
    this.pos[axis] += amount;

    const minX = Math.floor(this.pos.x - this.halfW);
    const maxX = Math.floor(this.pos.x + this.halfW);
    const minY = Math.floor(this.pos.y);
    const maxY = Math.floor(this.pos.y + this.height);
    const minZ = Math.floor(this.pos.z - this.halfW);
    const maxZ = Math.floor(this.pos.z + this.halfW);

    for (let bx = minX; bx <= maxX; bx++)
      for (let by = minY; by <= maxY; by++)
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!blockDef(world.getBlockPhysics(bx, by, bz)).solid) continue;
          if (
            this.pos.x + this.halfW <= bx || this.pos.x - this.halfW >= bx + 1 ||
            this.pos.y + this.height <= by || this.pos.y >= by + 1 ||
            this.pos.z + this.halfW <= bz || this.pos.z - this.halfW >= bz + 1
          ) continue;

          if (axis === "x") {
            this.pos.x = amount > 0 ? bx - this.halfW - 0.001 : bx + 1 + this.halfW + 0.001;
            this.vel.x = 0;
          } else if (axis === "z") {
            this.pos.z = amount > 0 ? bz - this.halfW - 0.001 : bz + 1 + this.halfW + 0.001;
            this.vel.z = 0;
          } else {
            if (amount > 0) {
              this.pos.y = by - this.height - 0.001;
            } else {
              this.pos.y = by + 1;
              this.onGround = true;
            }
            this.vel.y = 0;
          }
        }
  }

  /** AABB do jogador intersecta a célula (x,y,z)? */
  intersectsCell(x: number, y: number, z: number): boolean {
    return (
      this.pos.x + this.halfW > x && this.pos.x - this.halfW < x + 1 &&
      this.pos.y + this.height > y && this.pos.y < y + 1 &&
      this.pos.z + this.halfW > z && this.pos.z - this.halfW < z + 1
    );
  }
}
