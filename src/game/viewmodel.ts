/**
 * ViewModel — braço em primeira pessoa + item na mão, filho da câmera.
 * Animações: balanço de caminhada, golpe contínuo ao minerar, empurrão ao
 * colocar/atacar. Exibe bloco (mini-cubo texturizado) ou ferramenta (plano
 * com a textura pixel da ferramenta).
 */
import * as THREE from "three";
import { itemDef } from "./blocks";
import type { TexturePack } from "./textures";

export class ViewModel {
  group = new THREE.Group();
  private pivot = new THREE.Group();
  private itemAnchor = new THREE.Group();
  private itemMesh: THREE.Mesh | null = null;
  private currentItem: string | null = null;
  private tex: TexturePack;

  private t = 0;
  private mining = false;
  private swingT = -1; // golpe único (colocar/atacar)
  private moveAmt = 0; // 0..1 intensidade do balanço

  constructor(tex: TexturePack) {
    this.tex = tex;
    // braço
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b58f });
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x3f8f7a });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.58, 0.22), skin);
    arm.position.y = -0.24;
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.25), sleeve);
    cuff.position.y = 0.05;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), skin);
    hand.position.y = -0.56;
    this.pivot.add(arm, cuff, hand, this.itemAnchor);
    this.itemAnchor.position.set(0, -0.66, -0.08);
    this.pivot.position.set(0.56, -0.52, -0.62);
    this.pivot.rotation.set(-0.35, 0.12, 0.18);
    this.group.add(this.pivot);
    this.group.position.set(0, 0, 0);
  }

  /** Atualiza o item exibido (null = mão vazia). */
  setItem(itemId: string | null): void {
    if (itemId === this.currentItem) return;
    this.currentItem = itemId;
    if (this.itemMesh) {
      this.itemAnchor.remove(this.itemMesh);
      if (this.isPlane(this.itemMesh)) {
        // plano de ferramenta: geometria e material próprios (cubo usa cache compartilhado)
        this.itemMesh.geometry.dispose();
        (this.itemMesh.material as THREE.Material).dispose();
      }
      this.itemMesh = null;
    }
    if (!itemId) return;
    const def = itemDef(itemId);
    if (!def) return;
    if (def.block !== undefined) {
      this.itemMesh = new THREE.Mesh(this.tex.blockCube(def.block, 0.34), this.tex.atlasMaterial);
      this.itemMesh.rotation.set(0.15, 0.55, 0);
      this.itemMesh.position.set(0.02, -0.08, -0.12);
    } else {
      const geo = new THREE.PlaneGeometry(0.5, 0.5);
      const mat = new THREE.MeshBasicMaterial({ map: this.tex.itemTexture(itemId), transparent: true, side: THREE.DoubleSide });
      this.itemMesh = new THREE.Mesh(geo, mat);
      this.itemMesh.rotation.set(0, -0.5, 0.5);
      this.itemMesh.position.set(0.03, -0.1, -0.14);
    }
    this.itemAnchor.add(this.itemMesh);
  }

  private isPlane(m: THREE.Mesh): boolean {
    return (m.geometry as THREE.BufferGeometry).type === "PlaneGeometry";
  }

  triggerSwing(): void { this.swingT = 0; }

  update(dt: number, moving: boolean, mining: boolean): void {
    this.t += dt;
    this.mining = mining;
    const targetMove = moving ? 1 : 0;
    this.moveAmt += (targetMove - this.moveAmt) * Math.min(1, 8 * dt);

    // balanço de caminhada
    const bob = Math.sin(this.t * 8.5) * 0.028 * this.moveAmt;
    const sway = Math.cos(this.t * 4.25) * 0.02 * this.moveAmt;

    let rx = -0.35 + bob * 0.6;
    let rz = 0.18 + sway;
    let py = -0.52 + bob;
    let px = 0.56 + sway * 0.5;
    let pz = -0.62;

    // golpe de mineração (contínuo) ou swing único
    if (this.mining) {
      const ph = (this.t * 6.5) % 1;
      const s = Math.sin(ph * Math.PI);
      rx -= s * 0.85;
      rz += s * 0.3;
      pz += s * 0.06;
    }
    if (this.swingT >= 0) {
      this.swingT += dt;
      const ph = Math.min(1, this.swingT / 0.26);
      const s = Math.sin(ph * Math.PI);
      rx -= s * 0.7;
      rz -= s * 0.25;
      pz += s * 0.1;
      if (ph >= 1) this.swingT = -1;
    }

    this.pivot.rotation.set(rx, 0.12, rz);
    this.pivot.position.set(px, py, pz);
  }

  dispose(): void {
    if (this.itemMesh && this.isPlane(this.itemMesh)) {
      this.itemMesh.geometry.dispose();
      (this.itemMesh.material as THREE.Material).dispose();
    }
  }
}
