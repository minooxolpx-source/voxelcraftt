/**
 * Céu: ciclo dia/noite (10 min = 1 dia), sol, lua, estrelas, neblina e
 * iluminação (DirectionalLight + HemisphereLight) sincronizados.
 */
import * as THREE from "three";

export const DAY_LENGTH = 600; // segundos

export class Sky {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private stars: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private bg = new THREE.Color(0x87c7ea);
  private fog: THREE.Fog;
  time = DAY_LENGTH * 0.08; // começa de manhã

  private cDay = new THREE.Color(0x87c7ea);
  private cNight = new THREE.Color(0x0b1226);
  private cDusk = new THREE.Color(0xe88a4a);
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a3a, 0.65);
    scene.add(this.hemi);

    this.fog = new THREE.Fog(this.bg.clone(), 40, 90);
    scene.fog = this.fog;
    scene.background = this.bg;

    // sol e lua QUADRADOS, como no estilo voxel clássico
    this.sunMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false }),
    );
    scene.add(this.sunMesh);
    this.moonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ color: 0xdfe8f4, fog: false }),
    );
    scene.add(this.moonMesh);

    // estrelas fixas numa cúpula
    const n = 450;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(Math.random() * 0.95);
      const r = 460;
      pos[i * 3] = Math.cos(a) * Math.sin(e) * r;
      pos[i * 3 + 1] = Math.cos(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(g, this.starsMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);
  }

  /** hourOfDay 0–24 (para exibição no HUD). */
  get hourOfDay(): number {
    return ((this.time / DAY_LENGTH) * 24 + 6) % 24;
  }

  get dayNumber(): number {
    return Math.floor((this.time + DAY_LENGTH * 0.25) / DAY_LENGTH) + 1;
  }

  update(dt: number, camPos: THREE.Vector3, underwater: boolean, fogFar: number): void {
    this.time += dt;
    const a = (this.time / DAY_LENGTH) * Math.PI * 2; // 0 = nascer do sol (6h)
    const sinA = Math.sin(a);
    const day = Math.max(0, Math.min(1, sinA * 2.2 + 0.12));
    const duskAmt = Math.max(0, 1 - Math.abs(sinA) * 3.2) * (sinA > -0.25 ? 1 : 0);

    // direção do sol (orbita no plano X/Y com leve inclinação Z)
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.32).normalize();

    if (underwater) {
      this.bg.copy(this.tmp.set(0x14507e));
      this.fog.color.copy(this.bg);
      this.fog.near = 2; this.fog.far = 26;
      this.sun.intensity = 0.35;
      this.hemi.intensity = 0.4;
      this.sunMesh.visible = false;
      this.moonMesh.visible = false;
      this.starsMat.opacity = 0;
      return;
    }

    this.tmp.copy(this.cNight).lerp(this.cDay, day);
    this.bg.copy(this.tmp).lerp(this.cDusk, duskAmt * 0.55);
    this.fog.color.copy(this.bg);
    this.fog.near = Math.max(20, fogFar * 0.55);
    this.fog.far = fogFar;

    this.sun.intensity = 0.16 + day * 1.05;
    this.sun.color.set(day > 0.4 ? 0xfff2d8 : 0xffc07a);
    this.hemi.intensity = 0.3 + day * 0.5;

    this.sun.position.copy(camPos).addScaledVector(dir, 120);
    this.sun.target.position.copy(camPos);

    this.sunMesh.visible = sinA > -0.12;
    this.sunMesh.position.copy(camPos).addScaledVector(dir, 440);
    this.sunMesh.lookAt(camPos);
    this.moonMesh.visible = sinA < 0.12;
    this.moonMesh.position.copy(camPos).addScaledVector(dir, -440);
    this.moonMesh.lookAt(camPos);

    this.stars.position.copy(camPos);
    this.starsMat.opacity = Math.max(0, 1 - day * 1.6);
  }

  dispose(): void {
    this.sunMesh.geometry.dispose();
    this.moonMesh.geometry.dispose();
    this.stars.geometry.dispose();
    this.starsMat.dispose();
  }
}
