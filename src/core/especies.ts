import { formaRelativa, type IdForma } from './formas';
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

/** Forma que tiene cada papel en una etapa: presas de formas anteriores, depredadores y Alfa de las siguientes. */
export function formaDeRol(etapa: number, rol: Rol, rng: Rng): IdForma {
  switch (rol) {
    case 'presa': return formaRelativa(etapa, -rng.entero(1, 2)).id;
    case 'rival': return formaRelativa(etapa, 0).id;
    case 'depredador': return formaRelativa(etapa, rng.entero(1, 2)).id;
    case 'alfa': return formaRelativa(etapa, 2).id;
  }
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
