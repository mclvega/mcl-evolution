/** Biomas en ciclo: cada etapa ocurre en uno distinto, con su paleta, su vegetación y los colores de su fauna. */
export type IdBioma = 'charca' | 'bosque' | 'pradera' | 'sabana' | 'tundra' | 'volcan' | 'pantano';
export type Vegetacion = 'junco' | 'arbol' | 'flor' | 'acacia' | 'pino' | 'roca' | 'manglar';

export interface Bioma {
  id: IdBioma;
  nombre: string;
  icono: string;
  cielo: number;
  niebla: number;
  luz: number;
  suelo: number;
  /** Manchas del suelo (hierba, arena, nieve…). */
  mancha: number;
  roca: number;
  vegetacion: Vegetacion;
  hoja: number;
  tronco: number;
  /** Colores de piel de la fauna del bioma. */
  fauna: readonly number[];
  /** Comida vegetal: planta, fruto y seta. */
  planta: number;
  fruto: number;
  /** Agua (charcos) en el suelo. */
  agua: number;
}

export const BIOMAS: readonly Bioma[] = [
  { id: 'charca', nombre: 'La charca', icono: '💧', cielo: 0x9fd8f0, niebla: 0xb8e0ec, luz: 0xeaf6ff, suelo: 0x6e9a4a, mancha: 0x58823a, roca: 0x8a8f86, vegetacion: 'junco', hoja: 0x5f9a3a, tronco: 0x7a6a3a, fauna: [0x7fbf4a, 0x4a8f6a, 0xbfa24a, 0x9a6a4a], planta: 0x7ccf4a, fruto: 0xff6a5a, agua: 0x3a8fbf },
  { id: 'bosque', nombre: 'El bosque', icono: '🌳', cielo: 0x9ccbe8, niebla: 0xa8c8b8, luz: 0xf0fff0, suelo: 0x4f7a34, mancha: 0x3f6a2a, roca: 0x7a7f78, vegetacion: 'arbol', hoja: 0x2e6a2e, tronco: 0x5d4037, fauna: [0x8d5a3a, 0x6d4c41, 0xa0784a, 0x4a4a3a], planta: 0x5fbf3a, fruto: 0xe53935, agua: 0x2f7a9a },
  { id: 'pradera', nombre: 'La pradera', icono: '🌼', cielo: 0x8fd0ff, niebla: 0xc8e8ff, luz: 0xffffff, suelo: 0x7fbf4a, mancha: 0x9fd05a, roca: 0x9a9a9a, vegetacion: 'flor', hoja: 0x5fae3a, tronco: 0x6d5a3a, fauna: [0xc8a060, 0xe0d0b0, 0x8a6a4a, 0xd0b080], planta: 0x8fdf5a, fruto: 0xffc83d, agua: 0x4aa0d0 },
  { id: 'sabana', nombre: 'La sabana', icono: '🦒', cielo: 0xffd9a0, niebla: 0xf0d0a0, luz: 0xfff0d0, suelo: 0xc8a85a, mancha: 0xb8964a, roca: 0xa0866a, vegetacion: 'acacia', hoja: 0x7a9a3a, tronco: 0x6d4c2a, fauna: [0xd8a84a, 0xb8864a, 0xe0c080, 0x8a6a3a], planta: 0xa8c84a, fruto: 0xff8a3a, agua: 0x6a9ab0 },
  { id: 'tundra', nombre: 'La tundra', icono: '❄️', cielo: 0xcfe6f5, niebla: 0xe0eef8, luz: 0xf0f8ff, suelo: 0xe8f0f5, mancha: 0xc8d8e0, roca: 0x8a96a0, vegetacion: 'pino', hoja: 0x2e5d4a, tronco: 0x4e3a2a, fauna: [0xf0f0f0, 0xb0b8c0, 0x8a7a6a, 0xd8d0c0], planta: 0x7aa08a, fruto: 0x9a4adf, agua: 0x9fd8ef },
  { id: 'volcan', nombre: 'El volcán', icono: '🌋', cielo: 0x6a4a4a, niebla: 0x5a3a3a, luz: 0xffd0b0, suelo: 0x3e3230, mancha: 0x2a2220, roca: 0x4a3e3a, vegetacion: 'roca', hoja: 0x8a3a2a, tronco: 0x2a2220, fauna: [0x5a3a3a, 0x8a4a2a, 0x3a3a3a, 0xa0603a], planta: 0xd8603a, fruto: 0xffb030, agua: 0xff6a1a },
  { id: 'pantano', nombre: 'El pantano', icono: '🐊', cielo: 0x9aa88a, niebla: 0x8a9a7a, luz: 0xe8f0d8, suelo: 0x4a5a34, mancha: 0x3a4a2a, roca: 0x5a6058, vegetacion: 'manglar', hoja: 0x3a5a2a, tronco: 0x3e3a2a, fauna: [0x5a6a3a, 0x3a5a4a, 0x7a7a4a, 0x4a3a2a], planta: 0x6a9a3a, fruto: 0xc8d84a, agua: 0x4a6a4a },
];

export const biomaDe = (etapa: number): Bioma => BIOMAS[(Math.max(1, Math.floor(etapa)) - 1) % BIOMAS.length];
