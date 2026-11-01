import { BIOMAS, type Bioma, type IdBioma } from './biomas';
import { bloque, type Bloque } from './fisica';
import { crearRng } from './rng';

export type TipoComida = 'planta' | 'fruto' | 'seta' | 'baya' | 'flor' | 'huevo';
export const TIPOS_COMIDA: readonly TipoComida[] = ['planta', 'fruto', 'seta', 'baya', 'flor', 'huevo'];

export interface SitioComida {
  x: number;
  z: number;
  tipo: TipoComida;
}

export type TipoAdorno = 'arbusto' | 'hierba' | 'piedra' | 'helecho' | 'flor' | 'cana' | 'cactus' | 'setaGigante' | 'cristal';

export interface Adorno {
  x: number;
  z: number;
  escala: number;
  /** Ángulo para que no todos miren igual. */
  giro: number;
  tipo: TipoAdorno;
}

export interface Charco {
  x: number;
  z: number;
  r: number;
}

/** Trozo cuadrado del mundo infinito: se genera igual siempre con la misma semilla. */
export interface Trozo {
  clave: string;
  cx: number;
  cz: number;
  bioma: Bioma;
  /** Árboles (troncos) y rocas que chocan. */
  bloques: Bloque[];
  adornos: Adorno[];
  charcos: Charco[];
  comida: SitioComida[];
}

/** Lado de un trozo, en metros. */
export const TROZO = 32;
/** Lado de las zonas de bioma, en metros. */
const ZONA_BIOMA = 150;
/** Cada cuántos metros desde el origen sube el nivel de la zona (fauna más fuerte). */
const PASO_NIVEL = 180;

export const claveTrozo = (cx: number, cz: number) => `${cx},${cz}`;

/** Número pseudoaleatorio entero a partir de coordenadas y semilla. */
function hash(a: number, b: number, semilla: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(semilla | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Bioma de un punto: zonas grandes de forma irregular (celdas con el centro desplazado, como un Voronoi).
 * Alrededor del origen (90 m) siempre es la charca, para empezar tranquilo.
 */
export function biomaEn(x: number, z: number, semilla: number): Bioma {
  if (x * x + z * z < 90 * 90) return BIOMAS[0];
  const ci = Math.floor(x / ZONA_BIOMA);
  const cj = Math.floor(z / ZONA_BIOMA);
  let mejor = Infinity;
  let bi = 0;
  let bj = 0;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const h = hash(i, j, semilla);
      const px = (i + 0.15 + ((h & 0xffff) / 0xffff) * 0.7) * ZONA_BIOMA;
      const pz = (j + 0.15 + ((h >>> 16) / 0xffff) * 0.7) * ZONA_BIOMA;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < mejor) {
        mejor = d;
        bi = i;
        bj = j;
      }
    }
  }
  return BIOMAS[hash(bi, bj, semilla ^ 0x5bd1e995) % BIOMAS.length];
}

/** Nivel de la zona: sube con la distancia al origen (la fauna es más fuerte y da más ADN). */
export const nivelZona = (x: number, z: number) => Math.floor(Math.hypot(x, z) / PASO_NIVEL);

/** ADN y vida que da cada tipo de comida vegetal. */
export const COMIDA: Record<TipoComida | 'carne', { adn: number; cura: number }> = {
  planta: { adn: 2, cura: 3 },
  fruto: { adn: 4, cura: 8 },
  seta: { adn: 3, cura: 4 },
  baya: { adn: 3, cura: 5 },
  flor: { adn: 2, cura: 2 },
  huevo: { adn: 8, cura: 6 },
  carne: { adn: 0, cura: 15 },
};

/** Reparto de la comida en cada bioma (pesos relativos). */
const PESOS_COMIDA: Record<IdBioma, Partial<Record<TipoComida, number>>> = {
  charca: { planta: 5, flor: 2, baya: 1, fruto: 1, seta: 1, huevo: 0.5 },
  bosque: { planta: 3, baya: 3, seta: 2, fruto: 2, huevo: 0.5 },
  pradera: { planta: 3, flor: 4, fruto: 1, baya: 1, huevo: 0.4 },
  sabana: { planta: 3, fruto: 2, baya: 1, huevo: 1.2 },
  tundra: { planta: 3, baya: 3, seta: 1, huevo: 0.6 },
  volcan: { planta: 3, seta: 3, fruto: 1, huevo: 0.8 },
  pantano: { planta: 3, seta: 4, flor: 1, baya: 1, huevo: 0.5 },
};

/** Decoración propia de cada bioma, además de hierba, arbustos y piedras. */
const ADORNOS_BIOMA: Record<IdBioma, TipoAdorno[]> = {
  charca: ['cana', 'flor', 'hierba'],
  bosque: ['helecho', 'helecho', 'arbusto'],
  pradera: ['flor', 'flor', 'hierba'],
  sabana: ['cactus', 'hierba'],
  tundra: ['cristal', 'piedra'],
  volcan: ['cristal', 'piedra'],
  pantano: ['setaGigante', 'cana', 'helecho'],
};

function sortearPeso<T extends string>(pesos: Partial<Record<T, number>>, azar: number): T {
  const lista = Object.entries(pesos) as Array<[T, number]>;
  let total = 0;
  for (const [, w] of lista) total += w;
  let x = azar * total;
  for (const [k, w] of lista) if ((x -= w) <= 0) return k;
  return lista[0][0];
}

/** Cuánto tarda en volver a crecer la comida vegetal, en segundos. */
export const REBROTE = 25;

/** ADN para llenar la barra en una etapa (antes de la dificultad). */
export const metaAdn = (etapa: number) => Math.round(120 * (1 + Math.max(0, etapa - 1) * 0.12));

/** Genera un trozo del mundo. El trozo del origen deja libre el centro para empezar. */
export function generarTrozo(cx: number, cz: number, semilla: number): Trozo {
  const rng = crearRng(hash(cx, cz, semilla));
  const x0 = cx * TROZO;
  const z0 = cz * TROZO;
  const bioma = biomaEn(x0 + TROZO / 2, z0 + TROZO / 2, semilla);
  const bloques: Bloque[] = [];
  const ocupados: Array<{ x: number; z: number; r: number }> = cx === 0 && cz === 0 ? [{ x: 0, z: 0, r: 6 }] : [];
  // También el centro cuando el origen cae en el borde de otro trozo.
  if (Math.abs(x0) <= TROZO && Math.abs(z0) <= TROZO) ocupados.push({ x: 0, z: 0, r: 6 });
  const libre = (x: number, z: number, r: number) => ocupados.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  const sitio = (r: number): { x: number; z: number } | null => {
    for (let i = 0; i < 12; i++) {
      const x = x0 + rng.rango(r, TROZO - r);
      const z = z0 + rng.rango(r, TROZO - r);
      if (libre(x, z, r)) return { x, z };
    }
    return null;
  };
  const varios = (media: number) => Math.floor(media) + (rng.siguiente() < media % 1 ? 1 : 0);

  // Árboles: un tronco que choca; la copa es decoración.
  const arboles = varios(bioma.vegetacion === 'roca' ? 0.6 : bioma.vegetacion === 'flor' ? 1.3 : 3);
  for (let i = 0; i < arboles; i++) {
    const s = sitio(1.6);
    if (!s) continue;
    bloques.push(bloque('tronco', s.x, s.z, 0.7, 0.7, rng.rango(3, 5.5), 0, rng.entero(0, 2)));
    ocupados.push({ x: s.x, z: s.z, r: 1.6 });
  }
  // Rocas: algunas bajas, a las que se puede subir de un salto.
  const rocas = varios(bioma.vegetacion === 'roca' ? 2.8 : 1.5);
  for (let i = 0; i < rocas; i++) {
    const w = rng.rango(1.2, 4);
    const d = rng.rango(1.2, 4);
    const s = sitio(Math.max(w, d) / 2 + 0.8);
    if (!s) continue;
    bloques.push(bloque('roca', s.x, s.z, w, d, rng.rango(0.8, 2.6), 0, rng.entero(0, 2)));
    ocupados.push({ x: s.x, z: s.z, r: Math.max(w, d) / 2 + 0.8 });
  }

  const charcos: Charco[] = [];
  if (rng.siguiente() < 0.4) {
    const r = rng.rango(2, 4.5);
    const s = sitio(r);
    if (s) {
      charcos.push({ ...s, r });
      ocupados.push({ x: s.x, z: s.z, r });
    }
  }

  const adornos: Adorno[] = [];
  for (let i = 0; i < 14; i++) {
    const s = sitio(0.3);
    if (!s) continue;
    const t = rng.siguiente();
    const tipo: TipoAdorno = t < 0.45 ? rng.elegir(ADORNOS_BIOMA[bioma.id]) : t < 0.65 ? 'hierba' : t < 0.85 ? 'arbusto' : 'piedra';
    adornos.push({ ...s, escala: rng.rango(0.6, 1.4), giro: rng.rango(0, Math.PI * 2), tipo });
  }

  const comida: SitioComida[] = [];
  for (let i = varios(5); i > 0; i--) {
    const s = sitio(0.6);
    if (!s) continue;
    comida.push({ ...s, tipo: sortearPeso(PESOS_COMIDA[bioma.id], rng.siguiente()) });
    ocupados.push({ x: s.x, z: s.z, r: 0.6 });
  }

  return { clave: claveTrozo(cx, cz), cx, cz, bioma, bloques, adornos, charcos, comida };
}
