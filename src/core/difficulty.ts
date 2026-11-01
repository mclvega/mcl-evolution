export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Multiplicador de la vida de la fauna. */
  vida: number;
  /** Multiplicador del daño de la fauna. */
  dano: number;
  /** Multiplicador del ADN ganado. */
  adn: number;
  /** Multiplicador del radio con el que los depredadores te detectan. */
  deteccion: number;
  /** Multiplicador de la vida del Alfa. */
  alfa: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', vida: 0.55, dano: 0.4, adn: 1.4, deteccion: 0.6, alfa: 0.5 },
  facil: { nombre: 'Fácil', vida: 0.75, dano: 0.7, adn: 1.2, deteccion: 0.8, alfa: 0.75 },
  normal: { nombre: 'Normal', vida: 1, dano: 1, adn: 1, deteccion: 1, alfa: 1 },
  desafio: { nombre: 'Desafío', vida: 1.3, dano: 1.35, adn: 0.85, deteccion: 1.25, alfa: 1.35 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

/** Escala de la fauna según la etapa (no hay final: crece sin límite). */
export function escalaEtapa(etapa: number) {
  const n = Math.max(0, etapa - 1);
  return { vida: 1 + n * 0.26, dano: 1 + n * 0.2, meta: 1 + n * 0.12 };
}
