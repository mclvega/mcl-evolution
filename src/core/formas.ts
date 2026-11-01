/**
 * Formas de la evolución: cada etapa es una forma nueva. Tras el dragón el ciclo vuelve a empezar
 * («Gusano +1»), con más púas y cuernos. Las medidas son relativas: el jugador siempre tiene más o menos
 * el mismo tamaño en el mundo, y la fauna se mide respecto a él.
 */
export type IdForma = 'gusano' | 'escarabajo' | 'rana' | 'lagarto' | 'zorro' | 'felino' | 'oso' | 'dino' | 'mamut' | 'dragon';

export interface Forma {
  id: IdForma;
  nombre: string;
  icono: string;
  /** Multiplicadores sobre el jugador base. */
  velocidad: number;
  vida: number;
  mordisco: number;
  /** Alcance del mordisco, en metros (con escala 1). */
  alcance: number;
  salto: number;
  /** Radio y alto del cuerpo físico (con escala 1). */
  radio: number;
  alto: number;
}

export const FORMAS: readonly Forma[] = [
  { id: 'gusano', nombre: 'Gusano', icono: '🪱', velocidad: 0.85, vida: 0.8, mordisco: 0.8, alcance: 1.1, salto: 0.6, radio: 0.4, alto: 0.4 },
  { id: 'escarabajo', nombre: 'Escarabajo', icono: '🪲', velocidad: 0.9, vida: 1.1, mordisco: 0.9, alcance: 1.1, salto: 0.8, radio: 0.45, alto: 0.5 },
  { id: 'rana', nombre: 'Rana', icono: '🐸', velocidad: 0.95, vida: 0.9, mordisco: 0.95, alcance: 1.6, salto: 1.5, radio: 0.45, alto: 0.6 },
  { id: 'lagarto', nombre: 'Lagarto', icono: '🦎', velocidad: 1.1, vida: 1, mordisco: 1, alcance: 1.3, salto: 0.9, radio: 0.45, alto: 0.5 },
  { id: 'zorro', nombre: 'Zorro', icono: '🦊', velocidad: 1.2, vida: 1, mordisco: 1.05, alcance: 1.3, salto: 1.1, radio: 0.45, alto: 0.9 },
  { id: 'felino', nombre: 'Felino', icono: '🐆', velocidad: 1.3, vida: 1.05, mordisco: 1.15, alcance: 1.4, salto: 1.2, radio: 0.5, alto: 0.95 },
  { id: 'oso', nombre: 'Oso', icono: '🐻', velocidad: 1, vida: 1.35, mordisco: 1.25, alcance: 1.5, salto: 0.9, radio: 0.6, alto: 1.2 },
  { id: 'dino', nombre: 'Dinosaurio', icono: '🦖', velocidad: 1.1, vida: 1.3, mordisco: 1.35, alcance: 1.7, salto: 1, radio: 0.55, alto: 1.5 },
  { id: 'mamut', nombre: 'Mamut', icono: '🦣', velocidad: 0.95, vida: 1.55, mordisco: 1.3, alcance: 1.8, salto: 0.8, radio: 0.7, alto: 1.5 },
  { id: 'dragon', nombre: 'Dragón', icono: '🐉', velocidad: 1.2, vida: 1.4, mordisco: 1.45, alcance: 1.8, salto: 1.4, radio: 0.6, alto: 1.3 },
];

export const formaPorId = (id: IdForma): Forma => FORMAS.find((f) => f.id === id) ?? FORMAS[0];

/** Índice de la forma (0 a 9) y vuelta del ciclo (0 la primera vez). */
export function indiceForma(etapa: number): { indice: number; ciclo: number } {
  const n = Math.max(0, Math.floor(etapa) - 1);
  return { indice: n % FORMAS.length, ciclo: Math.floor(n / FORMAS.length) };
}

/** Forma del jugador en una etapa. */
export function formaDeEtapa(etapa: number): { forma: Forma; ciclo: number; nombre: string } {
  const { indice, ciclo } = indiceForma(etapa);
  const forma = FORMAS[indice];
  return { forma, ciclo, nombre: ciclo ? `${forma.nombre} +${ciclo}` : forma.nombre };
}

/** Forma desplazada `d` puestos respecto a la del jugador, sin salir de la lista. */
export function formaRelativa(etapa: number, d: number): Forma {
  const { indice } = indiceForma(etapa);
  return FORMAS[Math.max(0, Math.min(FORMAS.length - 1, indice + d))];
}
