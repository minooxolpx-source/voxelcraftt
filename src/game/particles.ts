/**
 * Partículas de quebra de bloco — um único THREE.Points reaproveitado (pool),
 * sem alocar objetos por partícula. Caem com gravidade e somem rápido.
 */
import * as THREE from "three";

const CAP = 600;

export class ParticleSystem {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(CAP * 3).fill(-999);
    this.col = new Float32Array(CAP * 3);
    this.vel = new Float32Array(CAP * 3);
    this.life = new Float32Array(CAP);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Emite partículas na cor média do bloco, espalhadas pelo volume do cubo. */
  emit(x: number, y: number, z: number, color: number, count = 16): void {
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % CAP;
      const j = idx * 3;
      this.pos[j] = x + 0.15 + Math.random() * 0.7;
      this.pos[j + 1] = y + 0.15 + Math.random() * 0.7;
      this.pos[j + 2] = z + 0.15 + Math.random() * 0.7;
      this.vel[j] = (Math.random() - 0.5) * 4.5;
      this.vel[j + 1] = 2 + Math.random() * 3.5;
      this.vel[j + 2] = (Math.random() - 0.5) * 4.5;
      const shade = 0.75 + Math.random() * 0.35;
      this.col[j] = Math.min(1, r * shade);
      this.col[j + 1] = Math.min(1, g * shade);
      this.col[j + 2] = Math.min(1, b * shade);
      this.life[idx] = 0.45 + Math.random() * 0.35;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -999;
        continue;
      }
      this.vel[j + 1] -= 16 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
