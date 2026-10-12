import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Device } from "../types.ts";
import { buildModel, setHighlight, type Model } from "./model.ts";

export type View = "angle" | "top" | "bottom";

const VIEWS: Record<View, { phi: number; theta: number }> = {
  angle: { phi: 0.85, theta: 0.45 },
  top: { phi: 0.0001, theta: 0 },
  // theta = PI keeps the USB end at the top and mirrors left/right, like a flipped board.
  bottom: { phi: Math.PI - 0.0001, theta: Math.PI },
};

export interface ViewerOptions {
  onSelect: (key: string | null) => void;
  onHover?: (key: string | null) => void;
}

export class Viewer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  private controls: OrbitControls;
  private model: Model;
  private labelLayer: HTMLDivElement;
  private labels = new Map<string, HTMLSpanElement>();
  private raycaster = new THREE.Raycaster();
  private hits: THREE.Object3D[];
  private hovered: string | null = null;
  private selected: string | null = null;
  private showLabels = true;
  private distance = 1;
  private tween: { from: THREE.Spherical; to: THREE.Spherical; t0: number } | null = null;
  private resizeObserver: ResizeObserver;
  private down: { x: number; y: number } | null = null;
  private container: HTMLElement;
  private opts: ViewerOptions;

  constructor(container: HTMLElement, device: Device, opts: ViewerOptions) {
    this.container = container;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    container.append(this.canvas);

    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "viewer-labels";
    container.append(this.labelLayer);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();

    this.model = buildModel(device);
    this.scene.add(this.model.root);
    this.hits = [...this.model.parts.values()].map((p) => p.hit);

    const span = Math.max(this.model.size.x, this.model.size.z);
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(-span, span * 2, span * 1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -span;
    sc.right = sc.top = span;
    sc.near = 0.1;
    sc.far = span * 6;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#ffffff", 0.5);
    fill.position.set(span, -span * 1.5, -span);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;

    for (const po of this.model.parts.values()) {
      if (po.part.kind !== "pin") continue;
      const el = document.createElement("span");
      el.className = "pin-label";
      el.textContent = po.part.label;
      this.labelLayer.append(el);
      this.labels.set(po.part.key, el);
    }

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setView("angle", false);
    this.renderer.setAnimationLoop(this.frame);
  }

  setView(view: View, animate = true): void {
    const v = VIEWS[view];
    const to = new THREE.Spherical(this.distance, v.phi, v.theta);
    this.controls.target.set(0, 0, 0);
    if (!animate) {
      this.camera.position.setFromSpherical(to);
      this.camera.lookAt(0, 0, 0);
      this.controls.update();
      return;
    }
    const from = new THREE.Spherical().setFromVector3(this.camera.position);
    // Rotate the short way round.
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2;
    while (from.theta - to.theta > Math.PI) to.theta += Math.PI * 2;
    this.tween = { from, to, t0: performance.now() };
  }

  setLabels(on: boolean): void {
    this.showLabels = on;
  }

  select(key: string | null): void {
    if (this.selected === key) return;
    const prev = this.selected;
    this.selected = key;
    this.refresh(prev);
    this.refresh(key);
  }

  hover(key: string | null): void {
    if (this.hovered === key) return;
    const prev = this.hovered;
    this.hovered = key;
    this.refresh(prev);
    this.refresh(key);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.labelLayer.remove();
  }

  private refresh(key: string | null): void {
    if (!key) return;
    const po = this.model.parts.get(key);
    if (!po) return;
    setHighlight(po, key === this.selected ? 2 : key === this.hovered ? 1 : 0);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the model in whichever field of view is tighter.
    const radius = this.model.size.length() / 2;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fit = radius / Math.sin(Math.min(vfov, hfov) / 2);
    const ratio = this.camera.position.length() / this.distance;
    this.distance = fit * 0.92;
    this.camera.near = this.distance / 100;
    this.camera.far = this.distance * 10;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = this.distance * 0.25;
    this.controls.maxDistance = this.distance * 3;
    if (Number.isFinite(ratio) && ratio > 0) this.camera.position.setLength(this.distance * ratio);
  }

  private frame = (): void => {
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / 600);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const { from, to } = this.tween;
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(from.radius, to.radius, e),
        THREE.MathUtils.lerp(from.phi, to.phi, e),
        THREE.MathUtils.lerp(from.theta, to.theta, e),
      );
      this.camera.position.setFromSpherical(s);
      this.camera.lookAt(this.controls.target);
      if (k === 1) this.tween = null;
    } else {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateLabels(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    const centre = new THREE.Vector3(0, 0, 0).project(this.camera);
    const fromAbove = this.camera.position.y >= 0;
    const v = new THREE.Vector3();
    for (const [key, el] of this.labels) {
      const po = this.model.parts.get(key)!;
      const facing = po.part.shape === "castellated" || (po.part.side === "top") === fromAbove;
      const visible = (this.showLabels && facing) || key === this.selected;
      el.hidden = !visible;
      if (!visible) continue;
      v.copy(po.anchor).project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const left = v.x < centre.x;
      el.style.transform = `translate(${x}px, ${y}px) translate(${left ? "calc(-100% - 6px)" : "6px"}, -50%)`;
      el.classList.toggle("selected", key === this.selected);
      el.classList.toggle("hovered", key === this.hovered);
    }
  }

  private pick(e: PointerEvent): string | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hits, false)[0];
    return (hit?.object.userData.key as string | undefined) ?? null;
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.buttons) return;
    const key = this.pick(e);
    this.canvas.style.cursor = key ? "pointer" : "grab";
    if (key !== this.hovered) {
      this.hover(key);
      this.opts.onHover?.(key);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY };
    this.tween = null;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 4) return;
    this.opts.onSelect(this.pick(e));
  };

  private onPointerLeave = (): void => {
    if (this.hovered) {
      this.hover(null);
      this.opts.onHover?.(null);
    }
  };
}
