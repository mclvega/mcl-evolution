import { FORMAS, formaRelativa, indiceForma, type IdForma } from './formas';
import type { Rng } from './rng';

/**
 * Papeles de la fauna:
 * - presa: más pequeña que tú y huye;
 * - rival: de tu tamaño, deambula y se defiende si la atacas;
 * - depredador: más grande, te caza si te acercas;
 * - alfa: el jefe de la región, aparece con la barra de ADN llena.
 */
export type Rol = 'presa' | 'rival' | 'depredador' | 'alfa';

export interface DefRol {
  nombre: string;
  /** Tamaño respecto al jugador. */
  escala: number;
  /** Vida, con el jugador inicial en 100. */
  vida: number;
  /** Daño de cada mordisco. */
  dano: number;
  /** Metros por segundo. */
  velocidad: number;
  /** ADN de su carne. */
  adn: number;
  /** Radio de detección (huir o cazar), en metros. */
  deteccion: number;
  /** Segundos de aviso antes de morder. */
  aviso: number;
  /** Segundos entre ataques. */
  recarga: number;
}

export const ROLES: Record<Rol, DefRol> = {
  presa: { nombre: 'Presa', escala: 0.62, vida: 30, dano: 4, velocidad: 5, adn: 12, deteccion: 7, aviso: 0.5, recarga: 1.6 },
  rival: { nombre: 'Rival', escala: 1, vida: 85, dano: 10, velocidad: 4.6, adn: 22, deteccion: 6, aviso: 0.55, recarga: 1.3 },
  depredador: { nombre: 'Depredador', escala: 1.55, vida: 140, dano: 15, velocidad: 6, adn: 40, deteccion: 15, aviso: 0.6, recarga: 1.4 },
  alfa: { nombre: 'Alfa', escala: 2.5, vida: 480, dano: 20, velocidad: 5.4, adn: 0, deteccion: 999, aviso: 0.65, recarga: 1.1 },
};

/**
 * Forma de cada papel en una etapa. Los tamaños son relativos, así que la variedad es amplia:
 * presas de cualquier forma hasta la tuya +1, rivales de tu forma ±1 y depredadores de la tuya hasta +3.
 * El Alfa es siempre dos formas por delante.
 */
export function formaDeRol(etapa: number, rol: Rol, rng: Rng): IdForma {
  const { indice } = indiceForma(etapa);
  const total = FORMAS.length;
  const entre = (a: number, b: number) => FORMAS[Math.max(0, Math.min(total - 1, rng.entero(a, b)))].id;
  switch (rol) {
    case 'presa': return entre(0, Math.min(total - 1, indice + 1));
    case 'rival': return entre(indice - 1, indice + 1);
    case 'depredador': return entre(indice, indice + 3);
    case 'alfa': return formaRelativa(etapa, 2).id;
  }
}

/** Rasgos que cambian a un animal (y su icono sobre la barra de vida). */
export type Rasgo = 'normal' | 'veloz' | 'acorazado' | 'venenoso' | 'gigante' | 'manada';

export const RASGOS: Record<Rasgo, { icono: string; vida: number; velocidad: number; dano: number; escala: number; adn: number }> = {
  normal: { icono: '', vida: 1, velocidad: 1, dano: 1, escala: 1, adn: 1 },
  veloz: { icono: '⚡', vida: 0.7, velocidad: 1.4, dano: 1, escala: 0.95, adn: 1.1 },
  acorazado: { icono: '🛡️', vida: 2, velocidad: 0.65, dano: 0.9, escala: 1.05, adn: 1.5 },
  venenoso: { icono: '🧪', vida: 0.9, velocidad: 1, dano: 0.8, escala: 1, adn: 1.3 },
  gigante: { icono: '⬆️', vida: 1.6, velocidad: 0.95, dano: 1.3, escala: 1.35, adn: 1.6 },
  manada: { icono: '🐾', vida: 0.6, velocidad: 1.1, dano: 0.7, escala: 0.8, adn: 0.7 },
};

/** Rasgo al azar: más probable cuanto más avanzada la etapa. La manada es solo de depredadores. */
export function sortearRasgo(etapa: number, rol: Rol, rng: Rng): Rasgo {
  if (rol === 'alfa') return 'normal';
  const prob = Math.min(0.6, 0.2 + (etapa - 1) * 0.04);
  if (rng.siguiente() > prob) return 'normal';
  const opciones: Rasgo[] = rol === 'depredador' ? ['veloz', 'acorazado', 'venenoso', 'gigante', 'manada'] : rol === 'presa' ? ['veloz', 'acorazado', 'gigante'] : ['veloz', 'acorazado', 'venenoso', 'gigante'];
  return rng.elegir(opciones);
}

/** Fauna que vive a la vez en la región (sin el Alfa). Crece con la etapa, con un tope por rendimiento. */
export function poblacion(etapa: number): Record<Exclude<Rol, 'alfa'>, number> {
  const n = Math.max(0, etapa - 1);
  return {
    presa: Math.min(12, 8 + Math.floor(n / 3)),
    rival: Math.min(7, 3 + Math.floor(n / 3)),
    depredador: Math.min(6, 1 + Math.floor((n + 1) / 2)),
  };
}
