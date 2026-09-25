// three.js 2D 렌더러: 스프라이트 일괄 그리기, HDR bloom, 화면 후처리 체인.
// 1) 월드 sprite를 화면 해상도 RGBA8 target에 render_order 순서로 그린다(엔진과 같은 감마 공간 합성).
// 2) HDR bloom source(Rgba16F)에 발광 점과 alpha mask를 그린다.
// 3) 후처리: HDR bloom → 화면 bloom(threshold 0.8) → 두드림 일렁임 → 수중 픽셀 후처리(캔버스로 출력).

import * as THREE from "three";

import type { BlendMode, BloomSettings, Frame, Layer, Material, ScreenPost, Sprite } from "./draw";
import { worldToScreen } from "./draw";
import bloomFrag from "./shaders/bloom.frag?raw";
import bloomSourceFrag from "./shaders/bloom_source.frag?raw";
import fullscreenVert from "./shaders/fullscreen.vert?raw";
import litFrag from "./shaders/lit.frag?raw";
import pulseFrag from "./shaders/pulse.frag?raw";
import silhouetteFrag from "./shaders/silhouette.frag?raw";
import wavyFrag from "./shaders/wavy.frag?raw";
import solidFrag from "./shaders/solid.frag?raw";
import spriteVert from "./shaders/sprite.vert?raw";
import textureFrag from "./shaders/texture.frag?raw";
import underwaterFrag from "./shaders/underwater.frag?raw";

const MIP_FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2];
const KERNEL_RADII = [3, 5, 7, 9, 11];
const BLOOM_CLAMP = 65472;

/// 한 draw 단위(엔진의 legacy mesh 또는 bindless instance 하나)다.
interface Element {
  order: number;
  seq: number;
  material: Material;
  blend: BlendMode;
  sprites: Sprite[];
}

/// 재사용하는 동적 geometry다.
class BatchMesh {
  readonly geometry = new THREE.BufferGeometry();
  readonly mesh: THREE.Mesh;
  private capacity = 0;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private colors = new Uint8Array(0);
  private indices = new Uint32Array(0);

  constructor() {
    this.mesh = new THREE.Mesh(this.geometry);
    this.mesh.frustumCulled = false;
  }

  ensure(vertices: number, indices: number): void {
    if (vertices <= this.capacity && indices <= this.indices.length) return;
    this.capacity = Math.max(vertices, this.capacity * 2, 64);
    const indexCapacity = Math.max(indices, this.indices.length * 2, 96);
    this.positions = new Float32Array(this.capacity * 2);
    this.uvs = new Float32Array(this.capacity * 2);
    this.colors = new Uint8Array(this.capacity * 4);
    this.indices = new Uint32Array(indexCapacity);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4, true).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1).setUsage(THREE.DynamicDrawUsage));
  }

  /// sprite 목록으로 정점을 채운다. 좌표는 월드 → 창 논리 좌표로 바꾼다(엔진 quad_batch와 같은 식).
  fill(sprites: Sprite[], camera: Frame["camera"]): void {
    let vertexCount = 0;
    let indexCount = 0;
    for (const sprite of sprites) {
      const n = sprite.shape.kind === "quad" ? 4 : 1 + clampSegments(sprite.shape.segments);
      vertexCount += n;
      indexCount += sprite.shape.kind === "quad" ? 6 : clampSegments(sprite.shape.segments) * 3;
    }
    this.ensure(vertexCount, indexCount);
    let v = 0;
    let i = 0;
    const zoom = camera.zoom;
    for (const sprite of sprites) {
      const [cx, cy] = worldToScreen(camera, sprite.cx, sprite.cy);
      const sx = sprite.w * zoom;
      const sy = sprite.h * zoom;
      const sin = Math.sin(sprite.rotation);
      const cos = Math.cos(sprite.rotation);
      const base = v;
      const put = (lx: number, ly: number) => {
        // local은 y 위가 +다. 화면은 y 아래가 +라서 축을 바꿔 돌린다.
        this.positions[v * 2] = cx + (lx * cos - ly * sin);
        this.positions[v * 2 + 1] = cy + (-lx * sin - ly * cos);
        const rx = sx === 0 ? 0.5 : lx / sx + 0.5;
        const ry = sy === 0 ? 0.5 : ly / sy + 0.5;
        const [u0, v0, u1, v1] = sprite.uv;
        this.uvs[v * 2] = u0 + (u1 - u0) * rx;
        this.uvs[v * 2 + 1] = v0 + (v1 - v0) * ry;
        this.colors.set(sprite.color, v * 4);
        v++;
      };
      if (sprite.shape.kind === "quad") {
        const hx = sx * 0.5;
        const hy = sy * 0.5;
        put(-hx, hy);
        put(hx, hy);
        put(hx, -hy);
        put(-hx, -hy);
        this.indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i);
        i += 6;
      } else {
        const segments = clampSegments(sprite.shape.segments);
        put(0, 0);
        for (let s = 0; s < segments; s++) {
          const angle = (Math.PI * 2 * s) / segments;
          put(Math.cos(angle) * sx * 0.5, Math.sin(angle) * sy * 0.5);
        }
        for (let s = 0; s < segments; s++) {
          this.indices.set([base, base + 1 + ((s + 1) % segments), base + 1 + s], i);
          i += 3;
        }
      }
    }
    for (const name of ["position", "uv", "color"]) (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.index!.needsUpdate = true;
    this.geometry.setDrawRange(0, i);
  }
}

function clampSegments(segments: number): number {
  return Math.min(1024, Math.max(3, segments));
}

function applyBlend(material: THREE.RawShaderMaterial, mode: BlendMode | "hdr"): void {
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  switch (mode) {
    case "alpha":
      material.blendSrc = THREE.SrcAlphaFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
      break;
    case "additive":
      material.blendSrc = THREE.SrcAlphaFactor;
      material.blendDst = THREE.OneFactor;
      break;
    case "multiply":
      material.blendSrc = THREE.DstColorFactor;
      material.blendDst = THREE.ZeroFactor;
      break;
    case "hdr":
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneFactor;
      break;
  }
}

function makeTarget(width: number, height: number, type: THREE.TextureDataType): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type,
    format: THREE.RGBAFormat,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new THREE.Scene();
  private readonly pool: BatchMesh[] = [];
  private readonly materials = new Map<string, THREE.RawShaderMaterial>();
  private readonly textureIds = new WeakMap<THREE.Texture, number>();
  private nextTextureId = 1;
  private readonly shared = {
    uViewport: { value: new THREE.Vector2(1, 1) },
    uScreen: { value: new THREE.Vector2(1, 1) },
    uSun: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPixel: { value: 1 },
  };
  private readonly quad: THREE.Mesh;
  private readonly bloomMaterial: THREE.RawShaderMaterial;
  private readonly bloomComposite: THREE.RawShaderMaterial;
  private readonly pulseMaterial: THREE.RawShaderMaterial;
  private readonly underwaterMaterial: THREE.RawShaderMaterial;
  private size: [number, number] = [0, 0];
  private sceneA!: THREE.WebGLRenderTarget;
  private sceneB!: THREE.WebGLRenderTarget;
  private hdr!: THREE.WebGLRenderTarget;
  private levels: { bright: THREE.WebGLRenderTarget; scratch: THREE.WebGLRenderTarget; size: [number, number] }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.three.autoClear = false;
    this.three.sortObjects = false;
    this.three.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
    this.quad.frustumCulled = false;
    const fullscreen = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blend: "none" | "add") => {
      const material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fullscreenVert, fragmentShader, uniforms, depthTest: false, depthWrite: false });
      if (blend === "add") {
        material.transparent = true;
        material.blending = THREE.CustomBlending;
        material.blendSrc = THREE.OneFactor;
        material.blendDst = THREE.OneFactor;
        material.blendSrcAlpha = THREE.OneFactor;
        material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      } else {
        material.blending = THREE.NoBlending;
      }
      return material;
    };
    const bloomUniforms = () => ({
      uSource: { value: null },
      uMode: { value: 0 },
      uTexelThreshold: { value: new THREE.Vector4() },
      uDirectionWeight: { value: new THREE.Vector4() },
      uTintClamp: { value: new THREE.Vector4(1, 1, 1, BLOOM_CLAMP) },
    });
    this.bloomMaterial = fullscreen(bloomFrag, bloomUniforms(), "none");
    this.bloomComposite = fullscreen(bloomFrag, bloomUniforms(), "add");
    const screenUniforms = () => ({
      uSource: { value: null },
      uDims: { value: new THREE.Vector2() },
      uCenterRadiusAspect: { value: new THREE.Vector4() },
      uDirectionProgressIntensity: { value: new THREE.Vector4() },
      uBandOffsetEdgeDesaturation: { value: new THREE.Vector4() },
    });
    this.pulseMaterial = fullscreen(pulseFrag, screenUniforms(), "none");
    this.underwaterMaterial = fullscreen(underwaterFrag, screenUniforms(), "none");
  }

  /// 물리 픽셀 크기와 target을 맞춘다.
  resize(width: number, height: number, pixelRatio: number, cssWidth: number, cssHeight: number): void {
    this.three.setPixelRatio(pixelRatio);
    this.three.setSize(cssWidth, cssHeight, false);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    for (const target of [this.sceneA, this.sceneB, this.hdr, ...this.levels.flatMap((l) => [l.bright, l.scratch])]) target?.dispose();
    this.sceneA = makeTarget(w, h, THREE.UnsignedByteType);
    this.sceneB = makeTarget(w, h, THREE.UnsignedByteType);
    this.hdr = makeTarget(w, h, THREE.HalfFloatType);
    this.levels = [];
    let divisor = 2;
    for (let level = 0; level < 5; level++) {
      const size: [number, number] = [Math.max(1, Math.floor(w / divisor)), Math.max(1, Math.floor(h / divisor))];
      this.levels.push({ bright: makeTarget(size[0], size[1], THREE.HalfFloatType), scratch: makeTarget(size[0], size[1], THREE.HalfFloatType), size });
      divisor *= 2;
    }
  }

  private textureId(texture: THREE.Texture): number {
    let id = this.textureIds.get(texture);
    if (id === undefined) {
      id = this.nextTextureId++;
      this.textureIds.set(texture, id);
    }
    return id;
  }

  private materialKey(material: Material, blend: BlendMode): string {
    switch (material.kind) {
      case "solid":
        return `solid:${blend}`;
      case "texture":
        return `tex:${blend}:${this.textureId(material.texture)}`;
      case "silhouette":
        return `sil:${blend}:${this.textureId(material.texture)}`;
      case "wavy":
        return `wavy:${blend}:${this.textureId(material.texture)}:${material.amplitude}`;
      case "lit":
        return `lit:${blend}:${this.textureId(material.texture)}:${this.textureId(material.normal)}:${material.variant ?? 0}`;
    }
  }

  private material(material: Material, blend: BlendMode): THREE.RawShaderMaterial {
    const key = this.materialKey(material, blend);
    let cached = this.materials.get(key);
    if (cached) return cached;
    const { uViewport, uScreen, uSun, uPixel } = this.shared;
    let fragmentShader: string;
    let uniforms: Record<string, THREE.IUniform>;
    switch (material.kind) {
      case "solid":
        fragmentShader = solidFrag;
        uniforms = { uViewport };
        break;
      case "texture":
        fragmentShader = textureFrag;
        uniforms = { uViewport, uMap: { value: material.texture } };
        break;
      case "silhouette":
        fragmentShader = silhouetteFrag;
        uniforms = { uViewport, uMap: { value: material.texture } };
        break;
      case "wavy":
        fragmentShader = wavyFrag;
        uniforms = { uViewport, uSun, uMap: { value: material.texture }, uAmp: { value: material.amplitude } };
        break;
      case "lit":
        fragmentShader = litFrag;
        uniforms = { uViewport, uScreen, uSun, uPixel, uMap: { value: material.texture }, uNormal: { value: material.normal }, uVariant: { value: material.variant ?? 0 } };
        break;
    }
    cached = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: spriteVert, fragmentShader, uniforms });
    applyBlend(cached, blend);
    this.materials.set(key, cached);
    return cached;
  }

  private bloomSourceMaterial(mask: THREE.Texture | null, intensity: number): THREE.RawShaderMaterial {
    const key = `bloom:${mask ? this.textureId(mask) : 0}:${intensity}`;
    let cached = this.materials.get(key);
    if (cached) return cached;
    cached = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: spriteVert,
      fragmentShader: bloomSourceFrag,
      uniforms: { uViewport: this.shared.uViewport, uMask: { value: mask }, uUseMask: { value: mask ? 1 : 0 }, uIntensity: { value: intensity } },
    });
    applyBlend(cached, "hdr");
    this.materials.set(key, cached);
    return cached;
  }

  /// 그리기 순서: texture quad layer는 sprite마다, 나머지 layer는 통째로 가장 낮은 order에 놓고 (order, sequence)로 정렬한다.
  private elements(layers: Layer[]): Element[] {
    const elements: Element[] = [];
    let seq = 0;
    for (const layer of layers) {
      if (layer.sprites.length === 0) continue;
      const virtual = layer.material.kind === "texture" && layer.sprites.every((s) => s.shape.kind === "quad");
      if (virtual) {
        for (const sprite of layer.sprites) {
          elements.push({ order: sprite.order, seq: seq++, material: layer.material, blend: layer.blend, sprites: [sprite] });
        }
      } else {
        const sprites = [...layer.sprites].sort((a, b) => a.order - b.order);
        elements.push({ order: sprites[0].order, seq: seq++, material: layer.material, blend: layer.blend, sprites });
      }
    }
    elements.sort((a, b) => a.order - b.order || a.seq - b.seq);
    return elements;
  }

  /// draw 목록을 같은 재료끼리 묶어 한 scene에 순서대로 넣는다.
  private drawBatches(batches: { material: THREE.RawShaderMaterial; sprites: Sprite[] }[], frame: Frame, target: THREE.WebGLRenderTarget, clear: [number, number, number, number] | null): void {
    this.scene.clear();
    batches.forEach((batch, index) => {
      if (!this.pool[index]) this.pool.push(new BatchMesh());
      const mesh = this.pool[index];
      mesh.fill(batch.sprites, frame.camera);
      mesh.mesh.material = batch.material;
      this.scene.add(mesh.mesh);
    });
    this.three.setRenderTarget(target);
    if (clear) {
      this.three.setClearColor(new THREE.Color(clear[0], clear[1], clear[2]), clear[3]);
      this.three.clear(true, false, false);
    }
    this.three.render(this.scene, this.camera);
    this.scene.clear();
  }

  render(frame: Frame): void {
    const [w, h] = this.size;
    this.shared.uViewport.value.set(frame.camera.viewportW, frame.camera.viewportH);
    this.shared.uScreen.value.set(w, h);
    this.shared.uSun.value.set(frame.dirLight[0], frame.dirLight[1], frame.dirLight[2], frame.time);
    this.shared.uPixel.value = Math.max(h / 270, 1);

    // 1) 월드 pass
    const batches: { material: THREE.RawShaderMaterial; sprites: Sprite[] }[] = [];
    let last: string | null = null;
    for (const element of this.elements(frame.layers)) {
      const key = `${this.materialKey(element.material, element.blend)}`;
      if (key === last) {
        batches[batches.length - 1].sprites.push(...element.sprites);
      } else {
        batches.push({ material: this.material(element.material, element.blend), sprites: [...element.sprites] });
        last = key;
      }
    }
    this.drawBatches(batches, frame, this.sceneA, [0, 0, 0, 1]);

    let current = this.sceneA;
    let other = this.sceneB;
    for (const effect of frame.post) {
      if (effect.kind === "bloom-hdr") {
        // HDR source: 단색 layer 다음 alpha mask layer(가산이라 순서는 결과에 영향이 없다).
        const sources = [
          ...frame.bloomLayers.filter((l) => l.sprites.length > 0).map((l) => ({ material: this.bloomSourceMaterial(null, l.intensity), sprites: l.sprites })),
          ...frame.alphaMaskBloomLayers.filter((l) => l.sprites.length > 0).map((l) => ({ material: this.bloomSourceMaterial(l.texture, l.intensity), sprites: l.sprites })),
        ];
        this.drawBatches(sources, frame, this.hdr, [0, 0, 0, 0]);
        this.bloom(effect.settings, this.hdr.texture, current);
      } else if (effect.kind === "bloom-frame") {
        this.bloom(effect.settings, current.texture, current);
      } else if (effect.effect.kind === "pulse") {
        this.screenPass(this.pulseMaterial, effect.effect, current, other);
        [current, other] = [other, current];
      } else {
        this.screenPass(this.underwaterMaterial, effect.effect, current, null);
      }
    }
  }

  private screenPass(material: THREE.RawShaderMaterial, effect: ScreenPost, source: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget | null): void {
    const u = material.uniforms;
    u.uSource.value = source.texture;
    (u.uDims.value as THREE.Vector2).set(this.size[0], this.size[1]);
    (u.uCenterRadiusAspect.value as THREE.Vector4).set(effect.centerUv[0], effect.centerUv[1], effect.radiusUv, Math.max(effect.aspect, 0.000001));
    (u.uDirectionProgressIntensity.value as THREE.Vector4).set(effect.direction[0], effect.direction[1], effect.progress, effect.intensity);
    (u.uBandOffsetEdgeDesaturation.value as THREE.Vector4).set(effect.bandWidth, effect.offsetStrength, effect.edgeOpacity, effect.desaturation);
    if (effect.kind === "underwater") {
      // CRT 세기는 aspect 자리에 담는다(0이면 끔). 엔진은 aspect를 1e-6 아래로 내리지 않는다.
      (u.uCenterRadiusAspect.value as THREE.Vector4).w = effect.aspect;
    }
    this.fullscreen(material, target);
  }

  private fullscreen(material: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.scene.clear();
    this.scene.add(this.quad);
    this.three.setRenderTarget(target);
    this.three.render(this.scene, this.camera);
    this.scene.clear();
  }

  /// bloom: threshold → level별 가로·세로 Gaussian → additive 합성.
  private bloom(settings: BloomSettings, source: THREE.Texture, destination: THREE.WebGLRenderTarget): void {
    const m = this.bloomMaterial;
    const u = m.uniforms;
    const texel = (size: [number, number]) => [1 / size[0], 1 / size[1]];
    const [tx0, ty0] = texel(this.levels[0].size);
    u.uSource.value = source;
    u.uMode.value = 0;
    (u.uTexelThreshold.value as THREE.Vector4).set(tx0, ty0, settings.threshold, settings.softKnee);
    this.clearTarget(this.levels[0].bright);
    this.fullscreen(m, this.levels[0].bright);
    this.levels.forEach((level, index) => {
      const [tx, ty] = texel(level.size);
      u.uMode.value = 1;
      (u.uTexelThreshold.value as THREE.Vector4).set(tx, ty, settings.threshold, settings.softKnee);
      u.uSource.value = index === 0 ? this.levels[0].bright.texture : this.levels[index - 1].bright.texture;
      (u.uDirectionWeight.value as THREE.Vector4).set(1, 0, 0, KERNEL_RADII[index]);
      this.fullscreen(m, level.scratch);
      u.uSource.value = level.scratch.texture;
      (u.uDirectionWeight.value as THREE.Vector4).set(0, 1, 0, KERNEL_RADII[index]);
      this.fullscreen(m, level.bright);
    });
    const c = this.bloomComposite;
    c.uniforms.uMode.value = 2;
    this.levels.forEach((level, index) => {
      const factor = MIP_FACTORS[index];
      const weight = settings.intensity * ((1 - settings.radius) * factor + settings.radius * (1.2 - factor));
      c.uniforms.uSource.value = level.bright.texture;
      (c.uniforms.uDirectionWeight.value as THREE.Vector4).set(0, 0, weight, 0);
      this.fullscreen(c, destination);
    });
  }

  private clearTarget(target: THREE.WebGLRenderTarget): void {
    this.three.setRenderTarget(target);
    this.three.setClearColor(0x000000, 0);
    this.three.clear(true, false, false);
  }
}
