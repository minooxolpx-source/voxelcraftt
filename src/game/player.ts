/**
 * Player — física em primeira pessoa: gravidade, pulo, corrida, natação e
 * colisão AABB (0.6 x 1.8) resolvida por eixo (X, depois Z, depois Y).
 */
import * as THREE from "three";
import { B, blockDef } from "./blocks";
import type { World } from "./world";

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  jump: boolean;
  sprint: boolean;
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
  fallStart = 0;

  readonly halfW = 0.3;
  readonly height = 1.8;
  readonly eye = 1.62;

  onJump: (() => void) | null = null;
  onLand: ((impact: number) => void) | null = null;
  onSplash: (() => void) | null = null;
  onStep: ((surface: string) => void) | null = null;

  private stepAcc = 0;

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  update(dt: number, input: MoveInput, world: World): void {
    // ---- entrada de movimento relativa ao yaw ----
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
    this.inWater = bodyBlock === B.AGUA || headBlock === B.AGUA;
    this.eyesInWater = headBlock === B.AGUA;
    if (this.inWater && !this.wasInWater && this.vel.y < -4) this.onSplash?.();
    this.wasInWater = this.inWater;

    const sprinting = input.sprint && f > 0 && !this.inWater;
    const speed = this.inWater ? 3.1 : sprinting ? 6.3 : 4.2;

    // aceleração horizontal (suave no chão, menos controle no ar)
    const rate = this.onGround ? 16 : this.inWater ? 8 : 4.5;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    // gravidade / pulo / natação
    if (this.inWater) {
      this.vel.y -= 7 * dt;
      this.vel.y = Math.max(this.vel.y, -3.2);
      if (input.jump) { this.vel.y = 3.6; }
    } else {
      this.vel.y -= 26 * dt;
      if (input.jump && this.onGround) {
        this.vel.y = 8.7;
        this.onJump?.();
        this.fallStart = this.pos.y;
      }
    }
    if (this.vel.y > 0 && !this.inWater) this.fallStart = Math.max(this.fallStart, this.pos.y);

    // ---- integração + colisão por eixo ----
    this.onGround = false;
    this.moveAxis("x", this.vel.x * dt, world);
    this.moveAxis("z", this.vel.z * dt, world);
    const vyBefore = this.vel.y;
    this.moveAxis("y", this.vel.y * dt, world);

    // aterrissagem
    if (this.onGround && vyBefore < -6) {
      this.onLand?.(Math.min(1, (this.fallStart - this.pos.y) / 12));
      this.fallStart = this.pos.y;
    }
    if (this.onGround) this.fallStart = this.pos.y;

    // passos
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed > 1.2) {
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
    if (name.includes("pedra") || name.includes("minério") || name.includes("rocha")) return "pedra";
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
          // AABB do bloco vs AABB do jogador
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

  /** AABB do jogador intersecta a célula (x,y,z)? (usado para impedir colocar bloco dentro do corpo) */
  intersectsCell(x: number, y: number, z: number): boolean {
    return (
      this.pos.x + this.halfW > x && this.pos.x - this.halfW < x + 1 &&
      this.pos.y + this.height > y && this.pos.y < y + 1 &&
      this.pos.z + this.halfW > z && this.pos.z - this.halfW < z + 1
    );
  }
}
