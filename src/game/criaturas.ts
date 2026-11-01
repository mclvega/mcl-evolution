import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rasgo, Rol } from '../core/especies';
import type { IdForma } from '../core/formas';
import type { Aspecto } from './aspecto';

/*
 * Criaturas low-poly con el estilo de los personajes del Arcade: primitivas, materiales Lambert y ojos esféricos.
 * Miran hacia -z y apoyan en y = 0. Las partes que no se mueven se fusionan por material para dibujar poco.
 */

const cacheMat = new Map<string, THREE.Material>();
export function mat(color: number, basico = false, opacidad = 1): THREE.Material {
  const clave = `${color}|${basico}|${opacidad}`;
  let m = cacheMat.get(clave);
  if (!m) {
    const o = { color, transparent: opacidad < 1, opacity: opacidad, depthWrite: opacidad >= 1 };
    m = basico ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o);
    cacheMat.set(clave, m);
  }
  return m;
}

/** Material de dos caras (alas). */
function matDoble(color: number): THREE.Material {
  const clave = `doble|${color}`;
  let m = cacheMat.get(clave);
  if (!m) cacheMat.set(clave, (m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })));
  return m;
}

export function malla(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sombra = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = sombra;
  m.receiveShadow = false;
  return m;
}

/** Une las mallas hijas directas de un grupo por material (menos llamadas de dibujo). */
export function fusionar(g: THREE.Object3D) {
  const porMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const hijo of [...g.children]) {
    if (!(hijo instanceof THREE.Mesh)) continue;
    hijo.updateMatrix();
    const geo = hijo.geometry.index ? hijo.geometry.toNonIndexed() : hijo.geometry.clone();
    hijo.geometry.dispose();
    geo.applyMatrix4(hijo.matrix);
    const material = hijo.material as THREE.Material;
    if (!porMat.has(material)) porMat.set(material, []);
    porMat.get(material)!.push(geo);
    g.remove(hijo);
  }
  for (const [material, geos] of porMat) {
    const unida = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (geos.length > 1) for (const x of geos) x.dispose();
    const basico = material instanceof THREE.MeshBasicMaterial;
    g.add(malla(unida, material, 0, 0, 0, !basico));
  }
}

const mezclar = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

/** Apariencia de un animal de la fauna: color del bioma con un tono propio y rasgos sorteados con su id. */
export function aspectoFauna(color: number, rol: Rol, id: number, rasgo: Rasgo = 'normal'): Aspecto {
  let semilla = Math.imul(id + 1, 2654435761) >>> 0;
  const azar = () => ((semilla = (Math.imul(semilla, 1103515245) + 12345) >>> 0) / 4294967296);
  const uno = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
  const piel = mezclar(color, azar() < 0.5 ? 0xffffff : 0x000000, azar() * 0.3);
  const alfa = rol === 'alfa';
  return {
    piel,
    vientre: mezclar(piel, 0xffffff, 0.3 + azar() * 0.3),
    patron: alfa || rasgo === 'acorazado' ? 'escamas' : uno(['liso', 'manchas', 'rayas', 'escamas'] as const),
    colorPatron: rasgo === 'venenoso' ? 0x9ad13c : mezclar(piel, azar() < 0.7 ? 0x000000 : 0xffffff, 0.4),
    ojos: rol === 'presa' ? uno(['normales', 'grandes'] as const) : uno(['pequenos', 'normales', 'grandes'] as const),
    colorOjos: alfa ? 0xff2a2a : rasgo === 'venenoso' ? 0x7aff5a : rol === 'depredador' ? 0xff8a1a : rol === 'rival' ? 0xffd23f : 0x222222,
    cuernos: alfa ? 'largos' : rol === 'presa' ? uno(['ninguno', 'ninguno', 'cortos'] as const) : uno(['ninguno', 'cortos', 'largos', 'curvos'] as const),
    cola: alfa ? 'mazo' : uno(['corta', 'larga', 'larga', 'mazo'] as const),
  };
}

export interface ModeloCriatura {
  grupo: THREE.Group;
  forma: IdForma;
  patas: THREE.Object3D[];
  cola: THREE.Object3D | null;
  alas: THREE.Object3D[];
  cabeza: THREE.Object3D;
  /** Segmentos del gusano (se ondulan). */
  segmentos: THREE.Object3D[];
  /** Tamaño aproximado (para colocar anillos y estrellas). */
  alto: number;
}

const TAM_OJOS = { pequenos: 0.7, normales: 1, grandes: 1.4 } as const;

class Constructor {
  readonly grupo = new THREE.Group();
  readonly cuerpo = new THREE.Group();
  readonly cabeza = new THREE.Group();
  patas: THREE.Object3D[] = [];
  cola: THREE.Object3D | null = null;
  alas: THREE.Object3D[] = [];
  segmentos: THREE.Object3D[] = [];

  constructor(readonly a: Aspecto, readonly pinchos: number) {
    this.grupo.add(this.cuerpo);
    this.cuerpo.add(this.cabeza);
  }

  /** Pieza estática con escala propia. */
  pieza(destino: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const m = malla(geo, mat(color), x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    destino.add(m);
    return m;
  }

  /** Ojos con pupila, a los lados de la cabeza. */
  ojos(x: number, y: number, z: number, sep: number, r: number) {
    const k = r * TAM_OJOS[this.a.ojos];
    for (const s of [-1, 1]) {
      this.cabeza.add(malla(new THREE.SphereGeometry(k, 8, 6), mat(this.a.colorOjos, true), x + s * sep, y, z, false));
      this.cabeza.add(malla(new THREE.SphereGeometry(k * 0.5, 6, 4), mat(0x111111, true), x + s * (sep + k * 0.15), y, z - k * 0.7, false));
    }
  }

  /** Cuernos sobre la cabeza, según el aspecto. */
  cuernos(x: number, y: number, z: number, sep: number, t: number) {
    const color = 0xf2e8d0;
    for (const s of [-1, 1]) {
      switch (this.a.cuernos) {
        case 'cortos':
          this.pieza(this.cabeza, new THREE.ConeGeometry(0.06 * t, 0.16 * t, 5), color, x + s * sep, y + 0.07 * t, z, 1, 1, 1, -0.3, 0, -s * 0.25);
          break;
        case 'largos':
          this.pieza(this.cabeza, new THREE.ConeGeometry(0.07 * t, 0.36 * t, 5), color, x + s * sep, y + 0.14 * t, z + 0.06 * t, 1, 1, 1, 0.5, 0, -s * 0.35);
          break;
        case 'curvos':
          this.pieza(this.cabeza, new THREE.TorusGeometry(0.13 * t, 0.035 * t, 4, 8, Math.PI * 1.2), color, x + s * (sep + 0.06 * t), y + 0.04 * t, z + 0.04 * t, 1, 1, 1, 0, Math.PI / 2, s > 0 ? 0 : Math.PI);
          break;
      }
    }
  }

  /** Dibujo del lomo (manchas, rayas o escamas) y púas de las vueltas del ciclo. */
  lomo(y: number, z0: number, z1: number, ancho: number, destino: THREE.Object3D = this.cuerpo) {
    const c = this.a.colorPatron;
    const largo = z1 - z0;
    switch (this.a.patron) {
      case 'manchas':
        for (let i = 0; i < 5; i++) {
          const z = z0 + largo * (0.12 + i * 0.19);
          this.pieza(destino, new THREE.SphereGeometry(ancho * 0.22, 6, 4), c, (i % 2 ? 1 : -1) * ancho * 0.22, y, z, 1, 0.3, 1);
        }
        break;
      case 'rayas':
        for (let i = 0; i < 4; i++) this.pieza(destino, new THREE.BoxGeometry(ancho * 1.02, 0.03, largo * 0.07), c, 0, y, z0 + largo * (0.2 + i * 0.2));
        break;
      case 'escamas':
        for (let i = 0; i < 5; i++) this.pieza(destino, new THREE.OctahedronGeometry(ancho * 0.12, 0), c, 0, y + 0.02, z0 + largo * (0.1 + i * 0.2), 1, 0.8, 1.4);
        break;
    }
    const n = this.pinchos * 3;
    for (let i = 0; i < n; i++) this.pieza(destino, new THREE.ConeGeometry(ancho * 0.1, ancho * 0.35, 4), 0xe8e0d0, 0, y + ancho * 0.12, z0 + largo * ((i + 0.5) / n), 1, 1, 1, 0.3, 0, 0);
  }

  /** Pata que cuelga de un pivote (se balancea en x). */
  pata(x: number, y: number, z: number, largo: number, grosor: number, color = this.a.piel, abierta = 0) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const interior = new THREE.Group();
    interior.rotation.z = abierta;
    this.pieza(interior, new THREE.BoxGeometry(grosor, largo, grosor), color, 0, -largo / 2, 0);
    this.pieza(interior, new THREE.BoxGeometry(grosor * 1.25, grosor * 0.5, grosor * 1.5), this.a.vientre, 0, -largo + grosor * 0.2, -grosor * 0.2);
    fusionar(interior);
    p.add(interior);
    this.cuerpo.add(p);
    this.patas.push(p);
    return p;
  }

  /** Cola que sale hacia atrás (+z), con mazo si el aspecto lo pide. */
  colaEn(x: number, y: number, z: number, largo: number, grosor: number, subida = 0.2) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const l = this.a.cola === 'corta' ? largo * 0.55 : largo;
    this.pieza(p, new THREE.ConeGeometry(grosor, l, 6), this.a.piel, 0, 0, l / 2, 1, 1, 1, Math.PI / 2 - subida, 0, 0);
    if (this.a.cola === 'mazo') this.pieza(p, new THREE.DodecahedronGeometry(grosor * 1.4, 0), this.a.colorPatron, 0, Math.sin(subida) * l, l * 0.95);
    fusionar(p);
    this.cuerpo.add(p);
    this.cola = p;
  }

  terminar(forma: IdForma, alto: number): ModeloCriatura {
    fusionar(this.cabeza);
    fusionar(this.cuerpo);
    for (const s of this.segmentos) fusionar(s);
    for (const a of this.alas) fusionar(a);
    return { grupo: this.grupo, forma, patas: this.patas, cola: this.cola, alas: this.alas, cabeza: this.cabeza, segmentos: this.segmentos, alto };
  }
}

const esfera = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const caja = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function gusano(b: Constructor) {
  const a = b.a;
  const radios = [0.22, 0.21, 0.19, 0.17, 0.14];
  radios.forEach((r, i) => {
    const s = new THREE.Group();
    s.position.set(0, r, -0.42 + i * 0.22);
    s.userData.y = r;
    const color = a.patron === 'rayas' && i % 2 ? a.colorPatron : a.piel;
    b.pieza(s, esfera(r), color, 0, 0, 0);
    b.pieza(s, esfera(r * 0.8, 8, 6), a.vientre, 0, -r * 0.35, 0, 1, 0.6, 1);
    if (a.patron === 'manchas') b.pieza(s, esfera(r * 0.35, 6, 4), a.colorPatron, r * 0.3, r * 0.75, 0, 1, 0.5, 1);
    if (a.patron === 'escamas') b.pieza(s, new THREE.OctahedronGeometry(r * 0.3, 0), a.colorPatron, 0, r * 0.95, 0);
    for (let k = 0; k < b.pinchos; k++) b.pieza(s, new THREE.ConeGeometry(r * 0.2, r * 0.6, 4), 0xe8e0d0, 0, r * 1.1, 0);
    if (i === 4 && a.cola === 'mazo') b.pieza(s, new THREE.DodecahedronGeometry(r * 0.8, 0), a.colorPatron, 0, 0, r * 1.2);
    b.cuerpo.add(s);
    b.segmentos.push(s);
  });
  b.cabeza.position.set(0, 0.22, -0.42);
  b.ojos(0, 0.08, -0.15, 0.09, 0.06);
  b.cuernos(0, 0.16, -0.05, 0.08, 0.7);
  // La cabeza viaja con el primer segmento.
  b.cuerpo.remove(b.cabeza);
  b.segmentos[0].add(b.cabeza);
  b.cabeza.position.set(0, 0, 0);
  return 0.45;
}

function escarabajo(b: Constructor) {
  const a = b.a;
  b.pieza(b.cuerpo, esfera(0.35), a.piel, 0, 0.3, 0.05, 1, 0.62, 1.3);
  b.pieza(b.cuerpo, esfera(0.3), a.vientre, 0, 0.22, 0.05, 1, 0.4, 1.2);
  b.pieza(b.cuerpo, caja(0.02, 0.05, 0.8), 0x111111, 0, 0.51, 0.08);
  b.lomo(0.48, -0.2, 0.4, 0.5);
  b.cabeza.position.set(0, 0.27, -0.42);
  b.pieza(b.cabeza, esfera(0.18), a.piel, 0, 0, 0);
  b.ojos(0, 0.05, -0.12, 0.1, 0.05);
  if (a.cuernos === 'ninguno') for (const s of [-1, 1]) b.pieza(b.cabeza, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), 0x222222, s * 0.07, 0.17, -0.15, 1, 1, 1, -0.6, 0, s * 0.3);
  else if (a.cuernos === 'largos') b.pieza(b.cabeza, new THREE.ConeGeometry(0.06, 0.38, 5), 0x3a2a1a, 0, 0.16, -0.18, 1, 1, 1, -0.7, 0, 0);
  else b.cuernos(0, 0.1, -0.05, 0.08, 0.8);
  for (const [z, ab] of [[-0.2, 0.9], [0.05, 1], [0.3, 0.9]] as const) {
    for (const s of [-1, 1]) b.pata(s * 0.28, 0.24, z, 0.32, 0.05, 0x2a2a2a, s * ab);
  }
  return 0.5;
}

function rana(b: Constructor) {
  const a = b.a;
  b.pieza(b.cuerpo, esfera(0.34), a.piel, 0, 0.32, 0.08, 1.1, 0.8, 1.15);
  b.pieza(b.cuerpo, esfera(0.3), a.vientre, 0, 0.25, 0.02, 1, 0.65, 1.05);
  b.lomo(0.55, -0.15, 0.35, 0.45);
  b.cabeza.position.set(0, 0.4, -0.25);
  b.pieza(b.cabeza, esfera(0.26), a.piel, 0, 0, 0, 1.15, 0.75, 1);
  b.pieza(b.cabeza, caja(0.36, 0.02, 0.05), 0x2a1a1a, 0, -0.04, -0.24);
  b.ojos(0, 0.2, -0.05, 0.14, 0.08);
  b.cuernos(0, 0.18, 0.05, 0.12, 0.7);
  for (const s of [-1, 1]) b.pata(s * 0.2, 0.25, -0.22, 0.25, 0.07, a.piel, s * 0.3);
  for (const s of [-1, 1]) b.pata(s * 0.3, 0.3, 0.3, 0.3, 0.12, a.piel, s * 0.5);
  return 0.62;
}

function lagarto(b: Constructor, dragon = false) {
  const a = b.a;
  const k = dragon ? 1.35 : 1;
  const y = 0.32 * k;
  b.pieza(b.cuerpo, caja(0.42 * k, 0.26 * k, 1 * k), a.piel, 0, y, 0);
  b.pieza(b.cuerpo, caja(0.36 * k, 0.06, 0.9 * k), a.vientre, 0, y - 0.13 * k, 0);
  b.lomo(y + 0.13 * k, -0.45 * k, 0.45 * k, 0.42 * k);
  if (dragon) b.pieza(b.cuerpo, caja(0.24, 0.24, 0.5), a.piel, 0, y + 0.2, -0.62, 1, 1, 1, 0.55, 0, 0);
  b.cabeza.position.set(0, y + (dragon ? 0.42 : 0.05), -0.62 * k - (dragon ? 0.25 : 0));
  b.pieza(b.cabeza, caja(0.32 * k, 0.22 * k, 0.4 * k), a.piel, 0, 0, 0);
  b.pieza(b.cabeza, caja(0.24 * k, 0.12 * k, 0.24 * k), a.vientre, 0, -0.05 * k, -0.28 * k);
  b.ojos(0, 0.08 * k, -0.08 * k, 0.15 * k, 0.05 * k);
  b.cuernos(0, 0.11 * k, 0.08 * k, 0.1 * k, dragon ? 1.4 : 0.8);
  if (dragon) for (const s of [-1, 1]) b.pieza(b.cabeza, new THREE.ConeGeometry(0.03, 0.08, 4), 0xffffff, s * 0.08, -0.13, -0.42, 1, 1, 1, Math.PI, 0, 0);
  for (const z of [-0.32 * k, 0.32 * k]) for (const s of [-1, 1]) b.pata(s * 0.24 * k, y, z, 0.3 * k, 0.1 * k, a.piel, s * 0.6);
  b.colaEn(0, y, 0.5 * k, 1.1 * k, 0.13 * k, 0.05);
  if (dragon) {
    for (const s of [-1, 1]) {
      const ala = new THREE.Group();
      ala.position.set(s * 0.25, y + 0.2, -0.1);
      const forma = new THREE.Shape();
      forma.moveTo(0, 0);
      forma.lineTo(1.3, 0.35);
      forma.lineTo(1.1, -0.15);
      forma.lineTo(0.8, -0.05);
      forma.lineTo(0.55, -0.35);
      forma.lineTo(0.3, -0.1);
      forma.lineTo(0, -0.45);
      const geo = new THREE.ShapeGeometry(forma);
      geo.rotateX(-Math.PI / 2);
      if (s < 0) {
        // El espejo invierte el orden de los vértices: se corrige para que la cara de arriba siga siendo la de delante.
        geo.scale(-1, 1, 1);
        const idx = geo.index!;
        for (let i = 0; i < idx.count; i += 3) {
          const t = idx.getX(i + 1);
          idx.setX(i + 1, idx.getX(i + 2));
          idx.setX(i + 2, t);
        }
      }
      const m = malla(geo, matDoble(a.colorPatron), 0, 0, 0);
      ala.add(m);
      b.pieza(ala, new THREE.CylinderGeometry(0.03, 0.03, 1.35, 4), a.piel, s * 0.65, 0.01, -0.17, 1, 1, 1, 0, 0, Math.PI / 2 - s * 0.26);
      b.cuerpo.add(ala);
      b.alas.push(ala);
    }
  }
  return dragon ? 1.3 : 0.5;
}

/** Cuadrúpedo con patas largas: zorro, felino y oso. */
function cuadrupedo(b: Constructor, tipo: 'zorro' | 'felino' | 'oso') {
  const a = b.a;
  const m = {
    zorro: { w: 0.38, h: 0.38, l: 0.9, y: 0.62, pata: 0.48, g: 0.1, cab: 0.32 },
    felino: { w: 0.36, h: 0.36, l: 1.05, y: 0.64, pata: 0.5, g: 0.11, cab: 0.3 },
    oso: { w: 0.7, h: 0.62, l: 1.1, y: 0.78, pata: 0.5, g: 0.22, cab: 0.44 },
  }[tipo];
  b.pieza(b.cuerpo, caja(m.w, m.h, m.l), a.piel, 0, m.y, 0);
  b.pieza(b.cuerpo, caja(m.w * 0.9, 0.06, m.l * 0.8), a.vientre, 0, m.y - m.h / 2, 0);
  if (tipo === 'oso') b.pieza(b.cuerpo, esfera(m.w * 0.55), a.piel, 0, m.y + 0.12, -0.25, 1, 0.8, 1.2);
  b.lomo(m.y + m.h / 2, -m.l * 0.4, m.l * 0.4, m.w);
  b.cabeza.position.set(0, m.y + m.h * 0.45, -m.l / 2 - m.cab * 0.3);
  if (tipo === 'felino') b.pieza(b.cabeza, esfera(m.cab * 0.75), a.piel, 0, 0, 0);
  else b.pieza(b.cabeza, caja(m.cab, m.cab * 0.9, m.cab), a.piel, 0, 0, 0);
  // Hocico.
  const hocico = tipo === 'zorro' ? [0.18, 0.14, 0.28] : tipo === 'felino' ? [0.18, 0.12, 0.12] : [0.24, 0.2, 0.2];
  b.pieza(b.cabeza, caja(hocico[0], hocico[1], hocico[2]), a.vientre, 0, -m.cab * 0.18, -m.cab * 0.5 - hocico[2] / 2 + 0.04);
  b.pieza(b.cabeza, esfera(0.04, 6, 4), 0x111111, 0, -m.cab * 0.1, -m.cab * 0.5 - hocico[2] + 0.02);
  b.ojos(0, m.cab * 0.15, -m.cab * 0.45, m.cab * 0.3, 0.045 * (tipo === 'oso' ? 1.2 : 1));
  // Orejas.
  for (const s of [-1, 1]) {
    if (tipo === 'zorro') b.pieza(b.cabeza, new THREE.ConeGeometry(0.08, 0.2, 4), a.piel, s * 0.11, m.cab * 0.55, 0.02);
    else b.pieza(b.cabeza, esfera(tipo === 'oso' ? 0.1 : 0.07, 6, 4), a.piel, s * m.cab * 0.38, m.cab * 0.42, 0.02, 1, 1, 0.5);
  }
  b.cuernos(0, m.cab * 0.45, 0, m.cab * 0.22, tipo === 'oso' ? 1.2 : 1);
  for (const z of [-m.l * 0.36, m.l * 0.36]) for (const s of [-1, 1]) b.pata(s * (m.w / 2 - m.g / 2), m.y - m.h * 0.2, z, m.pata, m.g);
  if (tipo === 'oso') b.colaEn(0, m.y + 0.1, m.l / 2, 0.25, 0.1, 0.5);
  else if (tipo === 'zorro') {
    b.colaEn(0, m.y + 0.1, m.l / 2, 0.7, 0.14, 0.4);
    b.pieza(b.cola!, esfera(0.09, 6, 4), a.vientre, 0, Math.sin(0.4) * 0.65, 0.68);
    fusionar(b.cola!);
  } else b.colaEn(0, m.y + 0.12, m.l / 2, 0.9, 0.06, 0.7);
  return m.y + m.h;
}

function dino(b: Constructor) {
  const a = b.a;
  const y = 1;
  b.pieza(b.cuerpo, esfera(0.42), a.piel, 0, y, 0, 1, 1, 1.5, -0.2, 0, 0);
  b.pieza(b.cuerpo, esfera(0.36), a.vientre, 0, y - 0.12, -0.08, 0.95, 0.85, 1.35, -0.2, 0, 0);
  b.lomo(y + 0.42, -0.45, 0.4, 0.5);
  b.pieza(b.cuerpo, caja(0.26, 0.4, 0.26), a.piel, 0, y + 0.35, -0.45, 1, 1, 1, 0.5, 0, 0);
  b.cabeza.position.set(0, y + 0.55, -0.68);
  b.pieza(b.cabeza, caja(0.36, 0.3, 0.55), a.piel, 0, 0, -0.1);
  b.pieza(b.cabeza, caja(0.32, 0.1, 0.45), a.vientre, 0, -0.18, -0.12);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.pieza(b.cabeza, new THREE.ConeGeometry(0.025, 0.07, 4), 0xffffff, s * 0.14, -0.1, -0.3 + i * 0.09, 1, 1, 1, Math.PI, 0, 0);
  b.ojos(0, 0.1, -0.12, 0.18, 0.05);
  b.cuernos(0, 0.15, 0.05, 0.12, 1.2);
  for (const s of [-1, 1]) {
    const brazo = b.pata(s * 0.32, y + 0.05, -0.35, 0.25, 0.06, a.piel, s * 0.2);
    brazo.rotation.x = -0.8;
    b.patas.pop();
  }
  for (const s of [-1, 1]) b.pata(s * 0.26, y - 0.1, 0.1, 0.85, 0.17);
  b.colaEn(0, y, 0.5, 1.3, 0.22, 0.05);
  return 1.6;
}

function mamut(b: Constructor) {
  const a = b.a;
  const y = 1.05;
  b.pieza(b.cuerpo, caja(0.9, 0.85, 1.2), a.piel, 0, y, 0);
  b.pieza(b.cuerpo, esfera(0.5), a.piel, 0, y + 0.35, -0.3, 1, 0.8, 1.1);
  b.lomo(y + 0.62, -0.4, 0.5, 0.8);
  b.cabeza.position.set(0, y + 0.25, -0.75);
  b.pieza(b.cabeza, esfera(0.42), a.piel, 0, 0, 0);
  for (const s of [-1, 1]) b.pieza(b.cabeza, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), a.colorPatron, s * 0.4, 0, 0.1, 1, 1, 1, 0, 0, Math.PI / 2);
  // Trompa y colmillos.
  b.pieza(b.cabeza, new THREE.CylinderGeometry(0.1, 0.13, 0.5, 6), a.piel, 0, -0.35, -0.38, 1, 1, 1, 0.3, 0, 0);
  b.pieza(b.cabeza, new THREE.CylinderGeometry(0.07, 0.1, 0.4, 6), a.piel, 0, -0.72, -0.45, 1, 1, 1, -0.2, 0, 0);
  for (const s of [-1, 1]) b.pieza(b.cabeza, new THREE.TorusGeometry(0.3, 0.05, 5, 10, Math.PI * 0.8), 0xf2e8d0, s * 0.2, -0.35, -0.45, 1, 1, 1, 0, Math.PI / 2, Math.PI * 0.9);
  b.ojos(0, 0.12, -0.32, 0.25, 0.05);
  b.cuernos(0, 0.35, 0, 0.18, 1.2);
  for (const z of [-0.4, 0.4]) for (const s of [-1, 1]) b.pata(s * 0.3, y - 0.3, z, 0.75, 0.26);
  b.colaEn(0, y + 0.2, 0.6, 0.4, 0.06, 1);
  return 1.6;
}

/** Modelo de una forma con un aspecto. `pinchos`: vueltas del ciclo de formas (más púas). */
export function crearCriatura(forma: IdForma, aspecto: Aspecto, pinchos = 0): ModeloCriatura {
  const b = new Constructor(aspecto, Math.min(3, pinchos));
  let alto: number;
  switch (forma) {
    case 'gusano': alto = gusano(b); break;
    case 'escarabajo': alto = escarabajo(b); break;
    case 'rana': alto = rana(b); break;
    case 'lagarto': alto = lagarto(b); break;
    case 'dragon': alto = lagarto(b, true); break;
    case 'zorro': case 'felino': case 'oso': alto = cuadrupedo(b, forma); break;
    case 'dino': alto = dino(b); break;
    case 'mamut': alto = mamut(b); break;
  }
  return b.terminar(forma, alto);
}

/**
 * Anima la criatura: patas en diagonal, gusano que ondula, cola que se mece, alas que baten
 * y cabeza que baja al morder (`mordisco` de 0 a 1).
 */
export function animarCriatura(m: ModeloCriatura, t: number, andando: boolean, rapidez = 1, mordisco = 0) {
  const fase = t * 7 * rapidez;
  const amp = andando ? 0.65 : 0;
  m.patas.forEach((p, i) => {
    const contraria = (i % 2) ^ (Math.floor(i / 2) % 2);
    p.rotation.x = Math.sin(fase + (contraria ? Math.PI : 0)) * amp;
  });
  m.segmentos.forEach((s, i) => {
    s.position.x = Math.sin(fase * 0.8 - i * 1.1) * (andando ? 0.07 : 0.02);
    s.position.y = (s.userData.y as number) + Math.max(0, Math.sin(fase * 0.8 - i * 1.1)) * (andando ? 0.05 : 0);
  });
  if (m.cola) m.cola.rotation.y = Math.sin(t * (andando ? 6 : 2.5)) * 0.3;
  m.alas.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * (Math.sin(t * 3) * 0.25 + 0.15)));
  m.cabeza.rotation.x = -Math.sin(Math.min(1, mordisco) * Math.PI) * 0.45;
}
