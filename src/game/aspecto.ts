/**
 * Apariencia de la criatura del jugador (sin three.js, para que el guardado no arrastre el motor al menú).
 * Los colores son de paletas fijas, así se pueden validar al cargar.
 */
export type Patron = 'liso' | 'manchas' | 'rayas' | 'escamas';
export type Ojos = 'pequenos' | 'normales' | 'grandes';
export type Cuernos = 'ninguno' | 'cortos' | 'largos' | 'curvos';
export type Cola = 'corta' | 'larga' | 'mazo';

export interface Aspecto {
  piel: number;
  vientre: number;
  patron: Patron;
  colorPatron: number;
  ojos: Ojos;
  colorOjos: number;
  cuernos: Cuernos;
  cola: Cola;
}

export const COLORES_PIEL = [0x7fbf4a, 0x3f8f5a, 0x2e7d9a, 0x5a6ad0, 0x8e5ad0, 0xd05a9a, 0xe0503a, 0xf08a2a, 0xf0c83a, 0xa07850, 0x6d4c41, 0x9e9e9e, 0x3a3a3a, 0xf0f0f0] as const;
export const COLORES_OJOS = [0xffd23f, 0xff5a3a, 0x4ad1ff, 0x7aff5a, 0xd06aff, 0xffffff, 0x222222] as const;

export const ASPECTO_OPCIONES = {
  patron: [
    { id: 'liso', nombre: 'Liso' },
    { id: 'manchas', nombre: 'Manchas' },
    { id: 'rayas', nombre: 'Rayas' },
    { id: 'escamas', nombre: 'Escamas' },
  ],
  ojos: [
    { id: 'pequenos', nombre: 'Pequeños' },
    { id: 'normales', nombre: 'Normales' },
    { id: 'grandes', nombre: 'Grandes' },
  ],
  cuernos: [
    { id: 'ninguno', nombre: 'Ninguno' },
    { id: 'cortos', nombre: 'Cortos' },
    { id: 'largos', nombre: 'Largos' },
    { id: 'curvos', nombre: 'Curvos' },
  ],
  cola: [
    { id: 'corta', nombre: 'Corta' },
    { id: 'larga', nombre: 'Larga' },
    { id: 'mazo', nombre: 'De mazo' },
  ],
} as const;

export const ASPECTO_COLORES = {
  piel: COLORES_PIEL,
  vientre: COLORES_PIEL,
  colorPatron: COLORES_PIEL,
  colorOjos: COLORES_OJOS,
} as const;

export const ASPECTO_POR_DEFECTO: Aspecto = {
  piel: 0x2e7d9a, vientre: 0xf0c83a, patron: 'manchas', colorPatron: 0xf0f0f0, ojos: 'grandes', colorOjos: 0xffd23f, cuernos: 'cortos', cola: 'larga',
};

export function aspectoAleatorio(azar: () => number = Math.random): Aspecto {
  const uno = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
  return {
    piel: uno(COLORES_PIEL),
    vientre: uno(COLORES_PIEL),
    patron: uno(ASPECTO_OPCIONES.patron).id,
    colorPatron: uno(COLORES_PIEL),
    ojos: uno(ASPECTO_OPCIONES.ojos).id,
    colorOjos: uno(COLORES_OJOS),
    cuernos: uno(ASPECTO_OPCIONES.cuernos).id,
    cola: uno(ASPECTO_OPCIONES.cola).id,
  };
}

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarAspecto(entrada: unknown): Aspecto {
  const a: Aspecto = { ...ASPECTO_POR_DEFECTO };
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return a;
  const e = entrada as Record<string, unknown>;
  const r = a as unknown as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(ASPECTO_OPCIONES)) {
    if ((opciones as readonly { id: string }[]).some((o) => o.id === e[clave])) r[clave] = e[clave];
  }
  for (const [clave, colores] of Object.entries(ASPECTO_COLORES)) {
    if ((colores as readonly number[]).includes(e[clave] as number)) r[clave] = e[clave];
  }
  return a;
}
