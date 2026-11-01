import { biomaDe, type Bioma } from './biomas';
import { bloque, type Bloque } from './fisica';
import { crearRng } from './rng';

export type TipoComida = 'planta' | 'fruto' | 'seta';

export interface SitioComida {
  x: number;
  z: number;
  tipo: TipoComida;
}

export interface Adorno {
  x: number;
  z: number;
  escala: number;
  /** Ángulo para que no todos miren igual. */
  giro: number;
  tipo: 'arbusto' | 'hierba' | 'piedra';
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
  carne: { adn: 0, cura: 15 },
};

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
  for (let i = 0; i < 110; i++) {
    const s = sitio(0.3);
    if (!s) continue;
    const t = rng.siguiente();
    adornos.push({ ...s, escala: rng.rango(0.6, 1.4), giro: rng.rango(0, Math.PI * 2), tipo: t < 0.45 ? 'hierba' : t < 0.8 ? 'arbusto' : 'piedra' });
  }

  const comida: SitioComida[] = [];
  for (let i = 0; i < 46; i++) {
    const s = sitio(0.6, 3);
    if (!s) continue;
    const t = rng.siguiente();
    comida.push({ ...s, tipo: t < 0.6 ? 'planta' : t < 0.85 ? 'fruto' : 'seta' });
    ocupados.push({ x: s.x, z: s.z, r: 0.6 });
  }

  return { etapa, semilla, bioma, radio, bloques, adornos, charcos, comida };
}
