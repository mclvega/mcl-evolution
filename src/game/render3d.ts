import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TIPOS_COMIDA, TROZO, type TipoComida, type Trozo } from '../core/mundo';
import { liberar } from '../rendimiento';
import type { Aspecto } from './aspecto';
import { animarCriatura, aspectoFauna, crearCriatura, malla, mat, type ModeloCriatura } from './criaturas';
import type { Efecto, Fauna, Partida } from './logica';

interface Modelo {
  contenedor: THREE.Group;
  criatura: ModeloCriatura;
  anillo: THREE.Mesh;
  estrellas: THREE.Group;
  /** Escala del modelo (para el crecimiento del jugador). */
  escala: number;
}

const MAX_VEGETAL = 80;
const MAX_CARNE = 40;
const DISTANCIA_VISIBLE = 72;

/** Anillo, estrellas de aturdido y, en el Alfa, corona. */
function extras(c: ModeloCriatura, alfa: boolean): Omit<Modelo, 'criatura' | 'escala'> {
  const contenedor = new THREE.Group();
  contenedor.add(c.grupo);
  const anillo = malla(new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2), mat(0xffd23f, true, 0.85), 0, 0.05, 0, false);
  anillo.visible = false;
  const estrellas = new THREE.Group();
  for (let i = 0; i < 3; i++) estrellas.add(malla(new THREE.OctahedronGeometry(0.08, 0), mat(0xffe27a, true), Math.cos((i / 3) * Math.PI * 2) * 0.3, 0, Math.sin((i / 3) * Math.PI * 2) * 0.3, false));
  estrellas.position.y = c.alto + 0.2;
  estrellas.visible = false;
  contenedor.add(anillo, estrellas);
  if (alfa) {
    const corona = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      corona.add(malla(new THREE.ConeGeometry(0.05, 0.16, 4), mat(0xffc83d, true), Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13, false));
    }
    corona.add(malla(new THREE.TorusGeometry(0.14, 0.03, 4, 12).rotateX(Math.PI / 2), mat(0xffc83d, true), 0, 0, 0, false));
    corona.position.y = c.alto + 0.05;
    contenedor.add(corona);
  }
  return { contenedor, anillo, estrellas };
}

/** Una pieza de un modelo de comida con su color. */
type Pieza = [THREE.BufferGeometry, number, number, number, number];

/** Geometría fusionada con colores por vértice: una sola instancia dibuja una comida de varios colores. */
function unir(...piezas: Pieza[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = piezas.map(([geo, color, x, y, z]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.translate(x, y, z);
    c.setHex(color);
    const n = g.getAttribute('position').count;
    const colores = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colores.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    return g;
  });
  return mergeGeometries(geos);
}

const matVertices = new THREE.MeshLambertMaterial({ vertexColors: true });
const matBrillo = new THREE.MeshBasicMaterial({ vertexColors: true });

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(60, 1, 0.1, 220);
  private escena = new THREE.Scene();
  /** Un grupo de mallas por trozo cargado del mundo. */
  private grupos = new Map<string, THREE.Group>();
  private versionTrozos = -1;
  private colorCielo = new THREE.Color();
  private colorLuz = new THREE.Color();
  private objetivo = new THREE.Color();
  private partida: Partida | null = null;
  private oscuro = false;
  private jugador: Modelo | null = null;
  private claveJugador = '';
  private fauna = new Map<Fauna, Modelo>();
  private vegetal: Record<TipoComida, THREE.InstancedMesh> | null = null;
  private carne: THREE.InstancedMesh | null = null;
  private proyectiles: THREE.Mesh[] = [];
  private efectos = new Map<Efecto, THREE.Object3D>();
  private marcaFijado: THREE.Mesh;
  private sol: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private tamSombras = -1;
  private vp = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private eje = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private esc = new THREE.Vector3();
  /** Desplazamiento suavizado de la cámara hacia el objetivo fijado. */
  private desvioX = 0;
  private desvioZ = 0;
  private ip = { x: 0, y: 0, z: 0 };
  private alfa = 1;

  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x445566, 1.5);
    this.sol = new THREE.DirectionalLight(0xfff1d6, 1.7);
    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sol.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
    this.sol.position.set(14, 40, 10);
    this.escena.add(this.hemi, this.sol, this.sol.target, this.camara);
    this.escena.background = this.colorCielo;
    this.escena.fog = new THREE.Fog(0x000000, 34, 95);
    this.construirComida();
    this.marcaFijado = malla(new THREE.TorusGeometry(1, 0.05, 4, 28).rotateX(Math.PI / 2), mat(0xffffff, true, 0.8), 0, 0.06, 0, false);
    this.escena.add(this.marcaFijado);
  }

  sombras(tam: number) {
    if (tam === this.tamSombras) return;
    this.tamSombras = tam;
    this.renderer.shadowMap.enabled = tam > 0;
    if (tam > 0) {
      this.sol.shadow.mapSize.set(tam, tam);
      this.sol.shadow.map?.dispose();
      this.sol.shadow.map = null;
    }
    this.escena.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  ajustar(ancho: number, alto: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  /**
   * Cielo, niebla y luz del bioma donde está el jugador, con transición suave al cambiar de bioma.
   * En el tema oscuro, cielo y niebla en negro puro (pantallas AMOLED).
   */
  private cielo(p: Partida, dt: number, inmediato: boolean) {
    const b = p.bioma;
    const k = inmediato ? 1 : Math.min(1, dt * 1.5);
    this.colorCielo.lerp(this.objetivo.setHex(this.oscuro ? 0x000000 : b.cielo), k);
    (this.escena.fog as THREE.Fog).color.lerp(this.objetivo.setHex(this.oscuro ? 0x000000 : b.niebla), k);
    this.colorLuz.lerp(this.objetivo.setHex(b.luz), k);
    this.hemi.color.copy(this.colorLuz);
  }

  /** Pone al día los trozos dibujados: crea los nuevos y libera los que ya no están cargados. */
  private sincronizarTrozos(p: Partida) {
    if (p.version === this.versionTrozos) return;
    this.versionTrozos = p.version;
    for (const [clave, g] of this.grupos) {
      if (p.trozos.has(clave)) continue;
      this.escena.remove(g);
      liberar(g);
      this.grupos.delete(clave);
    }
    for (const [clave, t] of p.trozos) {
      if (this.grupos.has(clave)) continue;
      const g = this.construirTrozo(t);
      this.grupos.set(clave, g);
      this.escena.add(g);
    }
  }

  /** Un trozo: suelo, charcos, rocas, árboles y decoración, fusionados con colores por vértice (2 o 3 mallas). */
  private construirTrozo(t: Trozo): THREE.Group {
    const grupo = new THREE.Group();
    const b = t.bioma;
    const r = t;
    const conColor = (m: THREE.Mesh): THREE.BufferGeometry => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      if (g !== m.geometry) m.geometry.dispose();
      g.applyMatrix4(m.matrix);
      const color = ((m.material as THREE.MeshLambertMaterial).color ?? new THREE.Color(0xffffff)) as THREE.Color;
      const n = g.getAttribute('position').count;
      const colores = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colores.set([color.r, color.g, color.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
      for (const nombre of Object.keys(g.attributes)) if (nombre !== 'position' && nombre !== 'normal' && nombre !== 'color') g.deleteAttribute(nombre);
      return g;
    };
    const solidas: THREE.BufferGeometry[] = [];
    const brillos: THREE.BufferGeometry[] = [];
    const suelos: THREE.BufferGeometry[] = [];
    const fijo = (...ms: THREE.Mesh[]) => {
      for (const m of ms) (m.material instanceof THREE.MeshBasicMaterial ? brillos : solidas).push(conColor(m));
    };
    // Suelo del trozo con manchas (deterministas por su posición).
    const x0 = t.cx * TROZO;
    const z0 = t.cz * TROZO;
    suelos.push(conColor(malla(new THREE.PlaneGeometry(TROZO, TROZO).rotateX(-Math.PI / 2), mat(b.suelo), x0 + TROZO / 2, 0, z0 + TROZO / 2, false)));
    let sem = (Math.imul(t.cx, 73856093) ^ Math.imul(t.cz, 19349663)) >>> 0 || 1;
    const azar = () => ((sem = (Math.imul(sem, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 3; i++) {
      const rr = 2 + azar() * 4;
      suelos.push(conColor(malla(new THREE.CircleGeometry(rr, 9).rotateX(-Math.PI / 2), mat(b.mancha), x0 + rr + azar() * (TROZO - 2 * rr), 0.01, z0 + rr + azar() * (TROZO - 2 * rr), false)));
    }
    for (const c of r.charcos) suelos.push(conColor(malla(new THREE.CircleGeometry(c.r, 20).rotateX(-Math.PI / 2), mat(b.agua), c.x, 0.03, c.z, false)));

    for (const bl of r.bloques) {
      const alto = bl.y1 - bl.y0;
      if (bl.tipo === 'roca') {
        const m = malla(new THREE.DodecahedronGeometry(0.5, 0), mat(b.roca), bl.x, alto * 0.45, bl.z);
        m.scale.set(bl.w * 1.15, alto * 1.1, bl.d * 1.15);
        m.rotation.y = bl.x * 0.37;
        fijo(m);
        continue;
      }
      // Árbol: tronco y copa según la vegetación del bioma; `estilo` elige entre varios modelos.
      const tronco = mat(b.tronco);
      const hoja = mat(b.hoja);
      const v = bl.estilo % 3;
      switch (b.vegetacion) {
        case 'pino': {
          const pisos = v === 1 ? 2 : 3;
          const ancho = v === 2 ? 1.25 : 1;
          fijo(malla(new THREE.CylinderGeometry(0.2, 0.3, alto * 0.4, 6), tronco, bl.x, alto * 0.2, bl.z));
          for (let k = 0; k < pisos; k++) fijo(malla(new THREE.ConeGeometry((1.6 - k * 0.4) * ancho, 1.8, 7), hoja, bl.x, alto * 0.4 + k * 1.1, bl.z), malla(new THREE.ConeGeometry((0.9 - k * 0.2) * ancho, 0.5, 7), mat(0xf7fbff), bl.x, alto * 0.4 + k * 1.1 + 0.7, bl.z));
          break;
        }
        case 'acacia':
          if (v === 1) {
            // Palmera: tronco inclinado y hojas en estrella.
            const t = malla(new THREE.CylinderGeometry(0.14, 0.22, alto, 6), tronco, bl.x + 0.3, alto / 2, bl.z);
            t.rotation.z = -0.12;
            fijo(t);
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              const h = malla(new THREE.BoxGeometry(1.8, 0.06, 0.4), hoja, bl.x + 0.55 + Math.cos(a) * 0.8, alto - 0.1, bl.z + Math.sin(a) * 0.8);
              h.rotation.set(0, -a, -0.35);
              fijo(h);
            }
          } else fijo(malla(new THREE.CylinderGeometry(0.15, 0.25, alto, 6), tronco, bl.x, alto / 2, bl.z), malla(new THREE.CylinderGeometry(v === 2 ? 1.8 : 2.6, v === 2 ? 1.5 : 2.2, 0.6, 8), hoja, bl.x, alto + 0.2, bl.z));
          break;
        case 'junco':
        case 'manglar':
          if (v === 1) {
            // Sauce: copa colgante.
            fijo(malla(new THREE.CylinderGeometry(0.2, 0.35, alto, 6), tronco, bl.x, alto / 2, bl.z), malla(new THREE.ConeGeometry(1.8, alto * 0.8, 8), hoja, bl.x, alto * 0.65, bl.z));
          } else {
            fijo(malla(new THREE.CylinderGeometry(0.18, 0.35, alto, 6), tronco, bl.x, alto / 2, bl.z), malla(new THREE.DodecahedronGeometry(1.5, 0), hoja, bl.x, alto + 0.3, bl.z));
            for (const [dx, dz] of [[0.5, 0.3], [-0.4, 0.4], [0, -0.5]]) fijo(malla(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 4), tronco, bl.x + dx, 0.5, bl.z + dz));
          }
          break;
        case 'roca': {
          const m = malla(new THREE.ConeGeometry(v === 1 ? 0.5 : 0.7, alto * (v === 2 ? 0.7 : 1), 5), mat(0x1e1a1a), bl.x, alto / 2, bl.z);
          fijo(m, malla(new THREE.OctahedronGeometry(0.3, 0), mat(0xff7a2a, true), bl.x, alto * 0.6, bl.z - 0.45, false));
          break;
        }
        default:
          fijo(malla(new THREE.CylinderGeometry(0.22, 0.32, alto * 0.65, 6), tronco, bl.x, alto * 0.32, bl.z));
          if (v === 1) {
            // Árbol de copas apiladas.
            fijo(malla(new THREE.SphereGeometry(1.3, 7, 5), hoja, bl.x, alto * 0.7, bl.z), malla(new THREE.SphereGeometry(0.9, 7, 5), hoja, bl.x, alto * 0.7 + 1.2, bl.z));
          } else if (v === 2) {
            fijo(malla(new THREE.ConeGeometry(1.4, alto * 0.9, 7), hoja, bl.x, alto * 0.75, bl.z));
          } else fijo(malla(new THREE.IcosahedronGeometry(1.5, 0), hoja, bl.x, alto * 0.75, bl.z), malla(new THREE.IcosahedronGeometry(1.1, 0), hoja, bl.x + 0.7, alto * 0.6, bl.z + 0.4));
          if (b.vegetacion === 'flor' || v === 0) fijo(malla(new THREE.SphereGeometry(0.2, 6, 4), mat(b.fruto), bl.x + 0.9, alto * 0.8, bl.z - 0.6));
      }
    }
    // Nenúfares sobre los charcos (no en la lava).
    if (b.id !== 'volcan') {
      for (const c of r.charcos) {
        for (let k = 0; k < 3; k++) {
          const a = c.x + k * 2.1;
          fijo(malla(new THREE.CircleGeometry(0.35, 7).rotateX(-Math.PI / 2), mat(0x4f9a3a), c.x + Math.cos(a) * c.r * 0.5, 0.05, c.z + Math.sin(a) * c.r * 0.5, false));
        }
      }
    }
    const COLORES_FLOR = [0xff6ab0, 0xffffff, 0xffd23f, 0xb06aff, 0xff7a3a];
    for (const d of r.adornos) {
      const e = d.escala;
      const cx = (k: number, r2: number) => d.x + Math.cos(d.giro + k * 2.1) * r2;
      const cz = (k: number, r2: number) => d.z + Math.sin(d.giro + k * 2.1) * r2;
      switch (d.tipo) {
        case 'hierba':
          for (let k = 0; k < 3; k++) fijo(malla(new THREE.ConeGeometry(0.06 * e, 0.45 * e, 3), mat(b.vegetacion === 'roca' ? 0x5a3a2a : b.hoja), cx(k, 0.12), 0.22 * e, cz(k, 0.12), false));
          break;
        case 'arbusto': {
          const m = malla(new THREE.DodecahedronGeometry(0.5 * e, 0), mat(b.vegetacion === 'roca' ? 0x2a2220 : b.hoja), d.x, 0.3 * e, d.z);
          m.scale.y = 0.7;
          fijo(m);
          break;
        }
        case 'helecho':
          for (let k = 0; k < 5; k++) {
            const a = d.giro + k * 1.26;
            const h = malla(new THREE.ConeGeometry(0.12 * e, 0.9 * e, 3), mat(0x3f8a3a), d.x + Math.cos(a) * 0.25 * e, 0.3 * e, d.z + Math.sin(a) * 0.25 * e, false);
            h.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
            fijo(h);
          }
          break;
        case 'flor': {
          const color = COLORES_FLOR[Math.floor(d.giro * 3) % COLORES_FLOR.length];
          for (let k = 0; k < 3; k++) fijo(malla(new THREE.CylinderGeometry(0.015, 0.015, 0.35 * e, 3), mat(0x4f9a3a), cx(k, 0.15), 0.17 * e, cz(k, 0.15), false), malla(new THREE.SphereGeometry(0.07 * e, 5, 3), mat(color), cx(k, 0.15), 0.36 * e, cz(k, 0.15), false));
          break;
        }
        case 'cana':
          for (let k = 0; k < 4; k++) fijo(malla(new THREE.CylinderGeometry(0.03, 0.04, 1.4 * e, 4), mat(0x8a9a4a), cx(k, 0.18), 0.7 * e, cz(k, 0.18), false), malla(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 5), mat(0x6d4c2a), cx(k, 0.18), 1.35 * e, cz(k, 0.18), false));
          break;
        case 'cactus':
          fijo(malla(new THREE.CylinderGeometry(0.22 * e, 0.25 * e, 1.6 * e, 7), mat(0x4f8a3a), d.x, 0.8 * e, d.z));
          for (const sgn of [-1, 1]) fijo(malla(new THREE.CylinderGeometry(0.12 * e, 0.12 * e, 0.6 * e, 6), mat(0x4f8a3a), d.x + sgn * 0.35 * e, (0.9 + (sgn > 0 ? 0.2 : 0)) * e, d.z, false));
          break;
        case 'setaGigante':
          fijo(malla(new THREE.CylinderGeometry(0.12 * e, 0.18 * e, 1.3 * e, 6), mat(0xe8dcc8), d.x, 0.65 * e, d.z), malla(new THREE.SphereGeometry(0.7 * e, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat([0xc0392b, 0x8e5ad0, 0xe08a2a][Math.floor(d.giro) % 3]), d.x, 1.25 * e, d.z));
          break;
        case 'cristal': {
          const brillo = b.id === 'volcan' ? 0xff7a2a : 0x9fe8ff;
          for (let k = 0; k < 3; k++) {
            const c2 = malla(new THREE.OctahedronGeometry(0.18 * e * (1 + k * 0.3), 0), mat(brillo, true), cx(k, 0.15), 0.25 * e * (1 + k * 0.3), cz(k, 0.15), false);
            c2.scale.y = 2;
            fijo(c2);
          }
          break;
        }
        default: {
          const m = malla(new THREE.DodecahedronGeometry(0.25 * e, 0), mat(b.roca), d.x, 0.1 * e, d.z, false);
          m.rotation.y = d.giro;
          fijo(m);
        }
      }
    }
    const unirEn = (geos: THREE.BufferGeometry[], material: THREE.Material, sombra: boolean, recibe: boolean) => {
      if (!geos.length) return;
      const m = malla(mergeGeometries(geos), material, 0, 0, 0, sombra);
      m.receiveShadow = recibe;
      grupo.add(m);
      for (const g of geos) g.dispose();
    };
    unirEn(suelos, matVertices, false, true);
    unirEn(solidas, matVertices, true, true);
    unirEn(brillos, matBrillo, false, false);
    return grupo;
  }

  /** Comida con instancias y colores por vértice: una llamada de dibujo por tipo. */
  private construirComida() {
    const b = { planta: 0x7ccf4a, fruto: 0xff5a4a };
    const hoja = 0x4f9a3a;
    const anillo = (n: number, r: number, y: number, tam: number, color: number): Pieza[] =>
      Array.from({ length: n }, (_, k): Pieza => [new THREE.SphereGeometry(tam, 5, 4), color, Math.cos((k / n) * Math.PI * 2) * r, y + (k % 2) * 0.06, Math.sin((k / n) * Math.PI * 2) * r]);
    const modelos: Record<TipoComida, THREE.BufferGeometry> = {
      planta: unir(
        [new THREE.ConeGeometry(0.12, 0.5, 4), b.planta, 0, 0.25, 0],
        [new THREE.ConeGeometry(0.1, 0.4, 4), b.planta, 0.12, 0.2, 0.05],
        [new THREE.ConeGeometry(0.1, 0.4, 4), b.planta, -0.1, 0.2, -0.06],
        [new THREE.SphereGeometry(0.12, 6, 4), 0xffffff, 0, 0.5, 0],
      ),
      fruto: unir([new THREE.SphereGeometry(0.2, 8, 6), b.fruto, 0, 0.22, 0], [new THREE.ConeGeometry(0.04, 0.1, 4), 0x6d4c2a, 0, 0.45, 0], [new THREE.ConeGeometry(0.06, 0.15, 3).rotateZ(1.2), hoja, 0.08, 0.44, 0]),
      seta: unir(
        [new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), 0xf2e8d0, 0, 0.12, 0],
        [new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0503a, 0, 0.24, 0],
        [new THREE.SphereGeometry(0.04, 4, 3), 0xffffff, 0.08, 0.38, 0.05],
        [new THREE.SphereGeometry(0.035, 4, 3), 0xffffff, -0.07, 0.36, -0.06],
      ),
      baya: unir([new THREE.DodecahedronGeometry(0.26, 0), hoja, 0, 0.22, 0], ...anillo(5, 0.2, 0.28, 0.06, 0x5a2a9a)),
      flor: unir([new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), hoja, 0, 0.22, 0], ...anillo(5, 0.1, 0.45, 0.08, 0xff6ab0), [new THREE.SphereGeometry(0.06, 5, 3), 0xffd23f, 0, 0.5, 0]),
      huevo: unir(
        [new THREE.TorusGeometry(0.22, 0.07, 4, 10).rotateX(Math.PI / 2), 0x8a6a3a, 0, 0.06, 0],
        [new THREE.SphereGeometry(0.11, 7, 5).scale(1, 1.3, 1), 0xf2e8d0, -0.06, 0.15, 0],
        [new THREE.SphereGeometry(0.1, 7, 5).scale(1, 1.3, 1), 0xbfe0f0, 0.08, 0.14, 0.04],
      ),
    };
    const crear = (geo: THREE.BufferGeometry, n: number): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, matVertices, n);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      this.escena.add(m);
      return m;
    };
    this.vegetal = Object.fromEntries(TIPOS_COMIDA.map((t) => [t, crear(modelos[t], MAX_VEGETAL)])) as Record<TipoComida, THREE.InstancedMesh>;
    this.carne = crear(unir([new THREE.DodecahedronGeometry(0.25, 0), 0xc0392b, 0, 0.18, 0], [new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4).rotateZ(0.2), 0xf2e8d0, 0, 0.2, 0]), MAX_CARNE);
  }

  private dibujarComida(p: Partida) {
    if (!this.vegetal || !this.carne) return;
    const cuentas = Object.fromEntries(TIPOS_COMIDA.map((t) => [t, 0])) as Record<TipoComida, number>;
    let carnes = 0;
    for (const c of p.comida) {
      if (!c.activa) continue;
      const giro = p.tiempo * 0.8 + c.id;
      this.q.setFromAxisAngle(this.eje, giro);
      const brillo = 1 + Math.sin(p.tiempo * 4 + c.id) * 0.06;
      if (c.tipo === 'carne') {
        if (carnes >= MAX_CARNE) continue;
        this.esc.setScalar(c.escala * Math.min(1, c.t / 2));
        this.m4.compose(this.pos.set(c.x, 0, c.z), this.q, this.esc);
        this.carne.setMatrixAt(carnes++, this.m4);
        continue;
      }
      const i = cuentas[c.tipo];
      if (i >= MAX_VEGETAL) continue;
      this.esc.setScalar(brillo);
      this.m4.compose(this.pos.set(c.x, 0, c.z), this.q, this.esc);
      this.vegetal[c.tipo].setMatrixAt(i, this.m4);
      cuentas[c.tipo]++;
    }
    for (const t of TIPOS_COMIDA) {
      this.vegetal[t].count = cuentas[t];
      this.vegetal[t].instanceMatrix.needsUpdate = true;
    }
    this.carne.count = carnes;
    this.carne.instanceMatrix.needsUpdate = true;
  }

  private modeloFauna(f: Fauna): Modelo {
    let m = this.fauna.get(f);
    if (m) return m;
    const c = crearCriatura(f.forma, aspectoFauna(f.color, f.rol, f.id, f.rasgo), f.rol === 'alfa' ? 1 : 0);
    m = { ...extras(c, f.rol === 'alfa'), criatura: c, escala: f.escala };
    m.contenedor.scale.setScalar(f.escala);
    this.fauna.set(f, m);
    this.escena.add(m.contenedor);
    return m;
  }

  private modeloJugador(p: Partida, aspecto: Aspecto): Modelo {
    const clave = `${p.forma.id}|${p.ciclo}|${JSON.stringify(aspecto)}`;
    if (this.jugador && clave === this.claveJugador) return this.jugador;
    if (this.jugador) {
      this.escena.remove(this.jugador.contenedor);
      liberar(this.jugador.contenedor);
    }
    this.claveJugador = clave;
    const c = crearCriatura(p.forma.id, aspecto, p.ciclo);
    this.jugador = { ...extras(c, false), criatura: c, escala: 1 };
    this.escena.add(this.jugador.contenedor);
    return this.jugador;
  }

  /** Posición entre el paso anterior y el actual (movimiento suave a cualquier FPS). */
  private interpolar(c: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }) {
    const k = this.alfa;
    this.ip.x = a.x + (c.x - a.x) * k;
    this.ip.y = a.y + (c.y - a.y) * k;
    this.ip.z = a.z + (c.z - a.z) * k;
    return this.ip;
  }

  /** `alfa`: fracción del paso de simulación siguiente (1 = posición actual). */
  dibujar(p: Partida, aspecto: Aspecto, oscuro: boolean, efectos: boolean, dt: number, alfa = 1) {
    this.alfa = Math.min(1, Math.max(0, alfa));
    const nueva = p !== this.partida || oscuro !== this.oscuro;
    if (p !== this.partida) {
      // Otro linaje: se vacía el mundo dibujado.
      this.partida = p;
      this.versionTrozos = -1;
      for (const g of this.grupos.values()) {
        this.escena.remove(g);
        liberar(g);
      }
      this.grupos.clear();
      for (const m of this.fauna.values()) {
        this.escena.remove(m.contenedor);
        liberar(m.contenedor);
      }
      this.fauna.clear();
    }
    this.oscuro = oscuro;
    this.cielo(p, dt, nueva);
    this.sincronizarTrozos(p);
    const j = p.jugador;
    const mj = this.modeloJugador(p, aspecto);
    const pj = this.interpolar(j.cuerpo, j.anterior);
    const jx = pj.x;
    const jy = pj.y;
    const jz = pj.z;
    mj.contenedor.position.set(jx, jy, jz);
    mj.contenedor.rotation.y = j.yaw;
    mj.contenedor.scale.setScalar(j.crecimiento);
    mj.contenedor.visible = j.estado !== 'muerto' || p.tiempo % 0.2 < 0.1;
    if (j.estado === 'muerto') mj.criatura.grupo.rotation.z = Math.min(1, j.t * 2) * (Math.PI / 2);
    else mj.criatura.grupo.rotation.z = 0;
    const mordisco = j.estado === 'mordiendo' ? j.t / 0.3 : 0;
    animarCriatura(mj.criatura, p.tiempo, j.moviendose && j.cuerpo.enSuelo, j.corriendo ? 1.5 : 1, mordisco);
    // Parpadeo al recibir daño.
    if (j.invulnerable > 0 && efectos) mj.contenedor.visible = p.tiempo % 0.1 < 0.07;

    // Cámara detrás de la criatura; con un objetivo fijado mira entre los dos.
    const alto = p.forma.alto * j.crecimiento;
    const dist = 3.4 + alto * 3;
    const cp = Math.cos(p.camPitch);
    // La cámara se coloca y mira desde el mismo punto: solo se suaviza el desvío hacia el objetivo fijado.
    let dx = 0;
    let dz = 0;
    if (p.fijado) {
      dx = (p.fijado.cuerpo.x - j.cuerpo.x) / 3;
      dz = (p.fijado.cuerpo.z - j.cuerpo.z) / 3;
    }
    const k = Math.min(1, dt * 4);
    this.desvioX += (dx - this.desvioX) * k;
    this.desvioZ += (dz - this.desvioZ) * k;
    const fx = jx + this.desvioX;
    const fz = jz + this.desvioZ;
    const camY = Math.max(0.35, jy + alto * 0.7 + dist * Math.sin(p.camPitch));
    this.camara.position.set(fx + Math.sin(p.camYaw) * dist * cp, camY, fz + Math.cos(p.camYaw) * dist * cp);
    this.camara.lookAt(fx, jy + alto * 0.75, fz);
    // Las sombras se recolocan a saltos de 4 m: si siguieran al jugador en cada cuadro, sus bordes temblarían.
    const sx = Math.round(jx / 4) * 4;
    const sz = Math.round(jz / 4) * 4;
    this.sol.position.set(sx + 14, 40, sz + 10);
    this.sol.target.position.set(sx, 0, sz);

    const vivos = new Set(p.fauna);
    for (const [f, m] of this.fauna) {
      if (!vivos.has(f)) {
        this.escena.remove(m.contenedor);
        liberar(m.contenedor);
        this.fauna.delete(f);
      }
    }
    for (const f of p.fauna) this.animarFauna(p, f, this.modeloFauna(f));

    this.marcaFijado.visible = !!p.fijado;
    if (p.fijado) {
      this.marcaFijado.position.set(p.fijado.cuerpo.x, p.fijado.cuerpo.y + 0.06, p.fijado.cuerpo.z);
      this.marcaFijado.scale.setScalar(p.fijado.cuerpo.radio + 0.45);
      this.marcaFijado.rotation.y = p.tiempo * 2;
    }
    this.dibujarComida(p);
    this.dibujarProyectiles(p);
    this.dibujarEfectos(p, efectos);
    this.renderer.render(this.escena, this.camara);
  }

  private animarFauna(p: Partida, f: Fauna, m: Modelo) {
    const j = p.jugador.cuerpo;
    m.contenedor.visible = Math.hypot(f.cuerpo.x - j.x, f.cuerpo.z - j.z) < DISTANCIA_VISIBLE;
    if (!m.contenedor.visible) return;
    const pf = this.interpolar(f.cuerpo, f.anterior);
    m.contenedor.position.set(pf.x, pf.y, pf.z);
    m.contenedor.rotation.y = f.yaw;
    m.estrellas.visible = f.estado === 'aturdido';
    m.estrellas.rotation.y = p.tiempo * 5;
    const avisa = f.estado === 'aviso' || f.estado === 'carga';
    m.anillo.visible = avisa;
    if (avisa) {
      const color = f.ataque === 'mordisco' ? 0xffd23f : 0xff3030;
      m.anillo.material = mat(color, true, 0.85);
      // El pisotón marca su radio en el suelo.
      const r = f.ataque === 'pisoton' ? 2.2 : f.cuerpo.radio / f.escala + 0.2;
      m.anillo.scale.setScalar(r * (1 + Math.sin(p.tiempo * 20) * 0.06));
    }
    const g = m.criatura.grupo;
    if (f.estado === 'muerto') {
      g.rotation.z = Math.min(1, f.muerteT * 3) * (Math.PI / 2);
      g.position.y = -Math.max(0, f.muerteT - 1.2) * 0.8;
      return;
    }
    g.rotation.z = 0;
    g.position.y = 0;
    const anda = f.estado === 'deambular' || f.estado === 'huir' || f.estado === 'perseguir' || f.estado === 'carga';
    const rapidez = f.estado === 'huir' || f.estado === 'carga' ? 1.6 : f.estado === 'perseguir' ? 1.2 : 0.7;
    const mordisco = f.estado === 'aviso' ? Math.min(1, f.t / f.d.aviso) * 0.5 : f.estado === 'recuperar' ? 0.5 + Math.min(0.5, f.t) : 0;
    animarCriatura(m.criatura, p.tiempo + f.id, anda && (f.estado !== 'deambular' || f.t < 6), rapidez, mordisco);
    // Agachado antes de la carga del Alfa.
    g.rotation.x = f.estado === 'aviso' && f.ataque === 'carga' ? 0.15 : 0;
  }

  private dibujarProyectiles(p: Partida) {
    while (this.proyectiles.length < p.proyectiles.length) {
      const m = malla(new THREE.IcosahedronGeometry(0.22, 0), mat(0x9ad13c, true), 0, 0, 0, false);
      this.proyectiles.push(m);
      this.escena.add(m);
    }
    this.proyectiles.forEach((m, i) => {
      const pr = p.proyectiles[i];
      m.visible = !!pr;
      if (pr) {
        m.position.set(pr.x, pr.y, pr.z);
        m.rotation.set(p.tiempo * 9, p.tiempo * 7, 0);
      }
    });
  }

  private dibujarEfectos(p: Partida, completos: boolean) {
    const activos = new Set(p.efectos);
    for (const [ef, o] of this.efectos) {
      if (!activos.has(ef)) {
        this.escena.remove(o);
        liberar(o);
        this.efectos.delete(ef);
      }
    }
    for (const ef of p.efectos) {
      let o = this.efectos.get(ef);
      const k = 1 - ef.t / ef.total;
      if (!o) {
        o = this.crearEfecto(ef, completos);
        this.efectos.set(ef, o);
        this.escena.add(o);
      }
      if (ef.tipo === 'onda') {
        o.scale.setScalar(Math.max(0.1, ef.r * (0.3 + k * 0.7)));
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      } else if (ef.tipo === 'adn') {
        // Hélice que sube.
        o.position.y = ef.y + k * 1.2;
        o.rotation.y = k * 6;
        o.scale.setScalar(Math.max(0.05, 1 - k * 0.7));
      } else {
        o.children.forEach((c) => {
          const v = c.userData.v as THREE.Vector3 | undefined;
          if (!v) return;
          c.position.set(v.x * k, v.y * k - 3 * k * k, v.z * k);
          c.scale.setScalar(Math.max(0.05, 1 - k));
        });
      }
    }
  }

  private crearEfecto(ef: Efecto, completos: boolean): THREE.Object3D {
    if (ef.tipo === 'onda') {
      return malla(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), ef.x, ef.y, ef.z, false);
    }
    const g = new THREE.Group();
    g.position.set(ef.x, ef.y, ef.z);
    if (ef.tipo === 'adn') {
      for (let i = 0; i < (completos ? 6 : 3); i++) {
        const a = i * 1.2;
        g.add(malla(new THREE.SphereGeometry(0.06, 5, 4), mat(i % 2 ? 0x4ad1ff : 0x7aff5a, true), Math.cos(a) * 0.15, i * 0.1, Math.sin(a) * 0.15, false));
      }
      return g;
    }
    const color = { mordisco: 0xffffff, sangre: 0xb71c1c, comer: 0x7aff5a, veneno: 0x9ad13c, polvo: 0xb8a888 }[ef.tipo];
    const n = completos ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const c = malla(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat(color, true), 0, 0, 0, false);
      c.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2, (Math.random() - 0.5) * 2.4);
      g.add(c);
    }
    return g;
  }

  /** Proyecta un punto del mundo a la pantalla (barras, números y avisos). */
  proyectar(x: number, y: number, z: number, ancho: number, alto: number): { x: number; y: number; visible: boolean; detras: boolean } {
    const v = this.vp.set(x, y, z).project(this.camara);
    const detras = v.z > 1;
    return { x: ((v.x + 1) / 2) * ancho, y: ((1 - v.y) / 2) * alto, visible: !detras && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, detras };
  }
}

