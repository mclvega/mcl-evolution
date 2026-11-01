import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** Geometría fusionada de varias piezas (para las instancias de la comida). */
function unir(...piezas: THREE.Mesh[]): THREE.BufferGeometry {
  const geos = piezas.map((m) => {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    m.geometry.dispose();
    return g.applyMatrix4(m.matrix);
  });
  return mergeGeometries(geos);
}

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(60, 1, 0.1, 220);
  private escena = new THREE.Scene();
  private estatico = new THREE.Group();
  private partida: Partida | null = null;
  private oscuro = false;
  private jugador: Modelo | null = null;
  private claveJugador = '';
  private fauna = new Map<Fauna, Modelo>();
  private vegetal: Record<'planta' | 'fruto' | 'seta', THREE.InstancedMesh> | null = null;
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
  private miraX = 0;
  private miraZ = 0;

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
    this.escena.add(this.hemi, this.sol, this.sol.target, this.estatico, this.camara);
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

  /** Cielo y niebla: en el tema oscuro, negro puro (pantallas AMOLED). */
  private cielo(p: Partida) {
    const b = p.region.bioma;
    const color = this.oscuro ? 0x000000 : b.cielo;
    this.escena.background = new THREE.Color(color);
    this.escena.fog = new THREE.Fog(this.oscuro ? 0x000000 : b.niebla, 34, 95);
  }

  /** Región nueva: suelo, charcos, rocas, árboles y decoración, fusionados por material. */
  private construirRegion(p: Partida) {
    liberar(this.estatico);
    this.estatico.clear();
    for (const m of this.fauna.values()) {
      this.escena.remove(m.contenedor);
      liberar(m.contenedor);
    }
    this.fauna.clear();
    const r = p.region;
    const b = r.bioma;
    this.cielo(p);
    this.hemi.color.setHex(b.luz);

    const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const fijo = (...ms: THREE.Mesh[]) => {
      for (const m of ms) {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        if (g !== m.geometry) m.geometry.dispose();
        g.applyMatrix4(m.matrix);
        const material = m.material as THREE.Material;
        if (!porMaterial.has(material)) porMaterial.set(material, []);
        porMaterial.get(material)!.push(g);
      }
    };
    const suelo = malla(new THREE.CircleGeometry(r.radio + 40, 56).rotateX(-Math.PI / 2), mat(b.suelo), 0, 0, 0, false);
    suelo.receiveShadow = true;
    this.estatico.add(suelo);
    // Manchas del suelo (deterministas por la semilla de la región).
    let s = r.semilla || 1;
    const azar = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 40; i++) {
      const a = azar() * Math.PI * 2;
      const d = Math.sqrt(azar()) * (r.radio + 10);
      fijo(malla(new THREE.CircleGeometry(2 + azar() * 5, 9).rotateX(-Math.PI / 2), mat(b.mancha), Math.cos(a) * d, 0.01, Math.sin(a) * d, false));
    }
    for (const c of r.charcos) fijo(malla(new THREE.CircleGeometry(c.r, 20).rotateX(-Math.PI / 2), mat(b.agua, b.id === 'volcan'), c.x, 0.03, c.z, false));

    for (const bl of r.bloques) {
      const alto = bl.y1 - bl.y0;
      if (bl.tipo === 'roca') {
        const m = malla(new THREE.DodecahedronGeometry(0.5, 0), mat(b.roca), bl.x, alto * 0.45, bl.z);
        m.scale.set(bl.w * 1.15, alto * 1.1, bl.d * 1.15);
        m.rotation.y = bl.x * 0.37;
        fijo(m);
        continue;
      }
      // Árbol: tronco y copa según la vegetación del bioma.
      const tronco = mat(b.tronco);
      const hoja = mat(b.hoja);
      switch (b.vegetacion) {
        case 'pino':
          fijo(malla(new THREE.CylinderGeometry(0.2, 0.3, alto * 0.4, 6), tronco, bl.x, alto * 0.2, bl.z));
          for (let k = 0; k < 3; k++) fijo(malla(new THREE.ConeGeometry(1.6 - k * 0.4, 1.8, 7), hoja, bl.x, alto * 0.4 + k * 1.1, bl.z), malla(new THREE.ConeGeometry(0.9 - k * 0.2, 0.5, 7), mat(0xf7fbff), bl.x, alto * 0.4 + k * 1.1 + 0.7, bl.z));
          break;
        case 'acacia':
          fijo(malla(new THREE.CylinderGeometry(0.15, 0.25, alto, 6), tronco, bl.x, alto / 2, bl.z), malla(new THREE.CylinderGeometry(2.6, 2.2, 0.6, 8), hoja, bl.x, alto + 0.2, bl.z));
          break;
        case 'junco':
        case 'manglar':
          fijo(malla(new THREE.CylinderGeometry(0.18, 0.35, alto, 6), tronco, bl.x, alto / 2, bl.z), malla(new THREE.DodecahedronGeometry(1.5, 0), hoja, bl.x, alto + 0.3, bl.z));
          for (const [dx, dz] of [[0.5, 0.3], [-0.4, 0.4], [0, -0.5]]) fijo(malla(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 4), tronco, bl.x + dx, 0.5, bl.z + dz));
          break;
        case 'roca': {
          const m = malla(new THREE.ConeGeometry(0.7, alto, 5), mat(0x1e1a1a), bl.x, alto / 2, bl.z);
          fijo(m, malla(new THREE.OctahedronGeometry(0.3, 0), mat(0xff7a2a, true), bl.x, alto * 0.7, bl.z - 0.45, false));
          break;
        }
        default:
          fijo(malla(new THREE.CylinderGeometry(0.22, 0.32, alto * 0.65, 6), tronco, bl.x, alto * 0.32, bl.z));
          fijo(malla(new THREE.IcosahedronGeometry(1.5, 0), hoja, bl.x, alto * 0.75, bl.z), malla(new THREE.IcosahedronGeometry(1.1, 0), hoja, bl.x + 0.7, alto * 0.6, bl.z + 0.4));
          if (b.vegetacion === 'flor') fijo(malla(new THREE.SphereGeometry(0.2, 6, 4), mat(b.fruto), bl.x + 0.9, alto * 0.8, bl.z - 0.6));
      }
    }
    for (const d of r.adornos) {
      const e = d.escala;
      if (d.tipo === 'hierba') {
        for (let k = 0; k < 3; k++) fijo(malla(new THREE.ConeGeometry(0.06 * e, 0.45 * e, 3), mat(b.vegetacion === 'roca' ? 0x5a3a2a : b.hoja), d.x + Math.cos(d.giro + k * 2.1) * 0.12, 0.22 * e, d.z + Math.sin(d.giro + k * 2.1) * 0.12, false));
      } else if (d.tipo === 'arbusto') {
        const m = malla(new THREE.DodecahedronGeometry(0.5 * e, 0), mat(b.vegetacion === 'roca' ? 0x2a2220 : b.hoja), d.x, 0.3 * e, d.z);
        m.scale.y = 0.7;
        fijo(m);
        if (b.vegetacion === 'flor') fijo(malla(new THREE.SphereGeometry(0.1, 5, 4), mat([0xff6ab0, 0xffffff, 0xffd23f][Math.floor(d.giro) % 3]), d.x, 0.62 * e, d.z, false));
      } else {
        const m = malla(new THREE.DodecahedronGeometry(0.25 * e, 0), mat(b.roca), d.x, 0.1 * e, d.z, false);
        m.rotation.y = d.giro;
        fijo(m);
      }
    }
    for (const [material, geos] of porMaterial) {
      const m = malla(mergeGeometries(geos), material, 0, 0, 0, !(material instanceof THREE.MeshBasicMaterial));
      m.receiveShadow = true;
      this.estatico.add(m);
      for (const g of geos) g.dispose();
    }
    this.construirComida(p);
  }

  /** Comida con instancias: una llamada de dibujo por tipo. */
  private construirComida(p: Partida) {
    const b = p.region.bioma;
    if (this.vegetal) for (const m of Object.values(this.vegetal)) this.escena.remove(m);
    if (this.carne) this.escena.remove(this.carne);
    const planta = unir(
      malla(new THREE.ConeGeometry(0.12, 0.5, 4), mat(0), 0, 0.25, 0),
      malla(new THREE.ConeGeometry(0.1, 0.4, 4), mat(0), 0.12, 0.2, 0.05),
      malla(new THREE.ConeGeometry(0.1, 0.4, 4), mat(0), -0.1, 0.2, -0.06),
      malla(new THREE.SphereGeometry(0.12, 6, 4), mat(0), 0, 0.5, 0),
    );
    const fruto = unir(malla(new THREE.SphereGeometry(0.2, 8, 6), mat(0), 0, 0.22, 0), malla(new THREE.ConeGeometry(0.04, 0.1, 4), mat(0), 0, 0.45, 0));
    const seta = unir(malla(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), mat(0), 0, 0.12, 0), malla(new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0), 0, 0.24, 0));
    const crear = (geo: THREE.BufferGeometry, color: number, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat(color), n);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      this.escena.add(m);
      return m;
    };
    this.vegetal = { planta: crear(planta, b.planta, MAX_VEGETAL), fruto: crear(fruto, b.fruto, MAX_VEGETAL), seta: crear(seta, 0xe0503a, MAX_VEGETAL) };
    this.carne = crear(unir(malla(new THREE.DodecahedronGeometry(0.25, 0), mat(0), 0, 0.18, 0), malla(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), mat(0), 0, 0.2, 0)).rotateZ(0.2), 0xc0392b, MAX_CARNE);
  }

  private dibujarComida(p: Partida) {
    if (!this.vegetal || !this.carne) return;
    const cuentas = { planta: 0, fruto: 0, seta: 0 };
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
      const i = cuentas[c.tipo as keyof typeof cuentas];
      if (i >= MAX_VEGETAL) continue;
      this.esc.setScalar(brillo);
      this.m4.compose(this.pos.set(c.x, 0, c.z), this.q, this.esc);
      this.vegetal[c.tipo as keyof typeof cuentas].setMatrixAt(i, this.m4);
      cuentas[c.tipo as keyof typeof cuentas]++;
    }
    for (const [tipo, n] of Object.entries(cuentas) as Array<[keyof typeof cuentas, number]>) {
      this.vegetal[tipo].count = n;
      this.vegetal[tipo].instanceMatrix.needsUpdate = true;
    }
    this.carne.count = carnes;
    this.carne.instanceMatrix.needsUpdate = true;
  }

  private modeloFauna(f: Fauna): Modelo {
    let m = this.fauna.get(f);
    if (m) return m;
    const c = crearCriatura(f.forma, aspectoFauna(f.color, f.rol, f.id), f.rol === 'alfa' ? 1 : 0);
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

  dibujar(p: Partida, aspecto: Aspecto, oscuro: boolean, efectos: boolean, dt: number) {
    if (p !== this.partida) {
      this.partida = p;
      this.oscuro = oscuro;
      this.construirRegion(p);
    } else if (oscuro !== this.oscuro) {
      this.oscuro = oscuro;
      this.cielo(p);
    }
    const j = p.jugador;
    const mj = this.modeloJugador(p, aspecto);
    mj.contenedor.position.set(j.cuerpo.x, j.cuerpo.y, j.cuerpo.z);
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
    let mx = j.cuerpo.x;
    let mz = j.cuerpo.z;
    if (p.fijado) {
      mx = (j.cuerpo.x * 2 + p.fijado.cuerpo.x) / 3;
      mz = (j.cuerpo.z * 2 + p.fijado.cuerpo.z) / 3;
    }
    const k = Math.min(1, dt * (efectos ? 6 : 3));
    this.miraX += (mx - this.miraX) * k;
    this.miraZ += (mz - this.miraZ) * k;
    if (Math.hypot(this.miraX - mx, this.miraZ - mz) > 8) {
      this.miraX = mx;
      this.miraZ = mz;
    }
    const camY = Math.max(0.35, j.cuerpo.y + alto * 0.7 + dist * Math.sin(p.camPitch));
    this.camara.position.set(j.cuerpo.x + Math.sin(p.camYaw) * dist * cp, camY, j.cuerpo.z + Math.cos(p.camYaw) * dist * cp);
    this.camara.lookAt(this.miraX, j.cuerpo.y + alto * 0.75, this.miraZ);
    this.sol.position.set(j.cuerpo.x + 14, 40, j.cuerpo.z + 10);
    this.sol.target.position.set(j.cuerpo.x, 0, j.cuerpo.z);

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
    m.contenedor.position.set(f.cuerpo.x, f.cuerpo.y, f.cuerpo.z);
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

