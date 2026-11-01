import { biomaDe, type Bioma, type IdBioma } from './biomas';
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

export interface Region {
  etapa: number;
  semilla: number;
  bioma: Bioma;
  /** Radio jugable; el borde es un anillo de rocas. */
  radio: number;
  /** Árboles (troncos) y rocas que chocan. */
  bloques: Bloque[];
  adornos: Adorno[];
  charcos: Charco[];
  comida: SitioComida[];
}

export const RADIO_REGION = 60;

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

/** Genera la región de una etapa: siempre la misma con la misma semilla. El centro queda despejado para empezar. */
export function generarRegion(etapa: number, semilla: number): Region {
  const rng = crearRng((semilla ^ Math.imul(etapa, 0x9e3779b1)) >>> 0);
  const bioma = biomaDe(etapa);
  const radio = RADIO_REGION;
  const bloques: Bloque[] = [];
  const ocupados: Array<{ x: number; z: number; r: number }> = [{ x: 0, z: 0, r: 6 }];
  const libre = (x: number, z: number, r: number) => ocupados.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  const sitio = (r: number, min = 0, max = radio - 4): { x: number; z: number } | null => {
    for (let i = 0; i < 30; i++) {
      const a = rng.rango(0, Math.PI * 2);
      const d = Math.sqrt(rng.rango((min / radio) ** 2, (max / radio) ** 2)) * radio;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (libre(x, z, r)) return { x, z };
    }
    return null;
  };

  // Árboles: un tronco que choca; la copa es decoración.
  const arboles = bioma.vegetacion === 'roca' ? 6 : bioma.vegetacion === 'flor' ? 14 : 34;
  for (let i = 0; i < arboles; i++) {
    const s = sitio(1.6);
    if (!s) continue;
    const alto = rng.rango(3, 5.5);
    bloques.push(bloque('tronco', s.x, s.z, 0.7, 0.7, alto, 0, rng.entero(0, 2)));
    ocupados.push({ x: s.x, z: s.z, r: 1.6 });
  }
  // Rocas: algunas bajas, a las que se puede subir de un salto.
  const rocas = bioma.vegetacion === 'roca' ? 30 : 16;
  for (let i = 0; i < rocas; i++) {
    const w = rng.rango(1.2, 4);
    const d = rng.rango(1.2, 4);
    const s = sitio(Math.max(w, d) / 2 + 0.8);
    if (!s) continue;
    bloques.push(bloque('roca', s.x, s.z, w, d, rng.rango(0.8, 2.6), 0, rng.entero(0, 2)));
    ocupados.push({ x: s.x, z: s.z, r: Math.max(w, d) / 2 + 0.8 });
  }
  // Anillo de rocas grandes en el borde.
  const n = 44;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radio + 2.5;
    bloques.push(bloque('roca', Math.cos(a) * r, Math.sin(a) * r, 6, 6, rng.rango(3, 5), 0, 3));
  }

  const charcos: Charco[] = [];
  for (let i = 0; i < 5; i++) {
    const r = rng.rango(2, 5);
    const s = sitio(r, 10);
    if (!s) continue;
    charcos.push({ ...s, r });
    ocupados.push({ x: s.x, z: s.z, r });
  }

  const adornos: Adorno[] = [];
  for (let i = 0; i < 150; i++) {
    const s = sitio(0.3);
    if (!s) continue;
    const t = rng.siguiente();
    const tipo: TipoAdorno = t < 0.45 ? rng.elegir(ADORNOS_BIOMA[bioma.id]) : t < 0.65 ? 'hierba' : t < 0.85 ? 'arbusto' : 'piedra';
    adornos.push({ ...s, escala: rng.rango(0.6, 1.4), giro: rng.rango(0, Math.PI * 2), tipo });
  }

  const comida: SitioComida[] = [];
  for (let i = 0; i < 54; i++) {
    const s = sitio(0.6, 3);
    if (!s) continue;
    comida.push({ ...s, tipo: sortearPeso(PESOS_COMIDA[bioma.id], rng.siguiente()) });
    ocupados.push({ x: s.x, z: s.z, r: 0.6 });
  }

  return { etapa, semilla, bioma, radio, bloques, adornos, charcos, comida };
}
