import { CALIDADES, LIMITES_FPS, type Calidad, type LimiteFps } from './rendimiento';
import { DIFICULTADES, type Dificultad } from './core/difficulty';

export type TamanoTexto = 'normal' | 'grande' | 'muyGrande';
export type Tema = 'claro' | 'oscuro';

export interface Configuracion {
  dificultad: Dificultad;
  /** Sensibilidad de la cámara, de 1 a 10. */
  sensibilidad: number;
  /** Fija solo el animal más cercano (la cámara lo sigue). */
  objetivoAuto: boolean;
  /** Vibración al recibir mordiscos y al evolucionar. */
  vibracion: boolean;
  volumenGeneral: number;
  volumenEfectos: number;
  tema: Tema;
  tamanoTexto: TamanoTexto;
  animacionesReducidas: boolean;
  pantallaCompleta: boolean;
  mostrarFps: boolean;
  /** Calidad gráfica: «auto» ajusta la resolución según los FPS. */
  calidad: Calidad;
  limiteFps: LimiteFps;
}

function prefiereMenosMovimiento(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function esTactil(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function configPorDefecto(): Configuracion {
  return {
    dificultad: 'normal',
    sensibilidad: 5,
    objetivoAuto: esTactil(),
    vibracion: true,
    volumenGeneral: 70,
    volumenEfectos: 70,
    tema: 'oscuro',
    tamanoTexto: 'normal',
    animacionesReducidas: prefiereMenosMovimiento(),
    pantallaCompleta: true,
    mostrarFps: false,
    calidad: 'auto',
    limiteFps: 60,
  };
}

const uno = <T>(valor: unknown, opciones: readonly T[], porDefecto: T): T => (opciones.includes(valor as T) ? (valor as T) : porDefecto);
const bool = (valor: unknown, porDefecto: boolean) => (typeof valor === 'boolean' ? valor : porDefecto);
const num = (valor: unknown, min: number, max: number, porDefecto: number) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : porDefecto;

/** Valida una configuración guardada (posiblemente incompleta o de otra versión). */
export function normalizarConfig(entrada: unknown): Configuracion {
  const d = configPorDefecto();
  const c = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
  return {
    dificultad: uno(c.dificultad, DIFICULTADES, d.dificultad),
    sensibilidad: num(c.sensibilidad, 1, 10, d.sensibilidad),
    objetivoAuto: bool(c.objetivoAuto, d.objetivoAuto),
    vibracion: bool(c.vibracion, d.vibracion),
    volumenGeneral: num(c.volumenGeneral, 0, 100, d.volumenGeneral),
    volumenEfectos: num(c.volumenEfectos, 0, 100, d.volumenEfectos),
    tema: uno(c.tema, ['claro', 'oscuro'] as const, d.tema),
    tamanoTexto: uno(c.tamanoTexto, ['normal', 'grande', 'muyGrande'] as const, d.tamanoTexto),
    animacionesReducidas: bool(c.animacionesReducidas, d.animacionesReducidas),
    pantallaCompleta: bool(c.pantallaCompleta, d.pantallaCompleta),
    mostrarFps: bool(c.mostrarFps, d.mostrarFps),
    calidad: uno(c.calidad, CALIDADES.map(([v]) => v), d.calidad),
    limiteFps: uno(c.limiteFps, LIMITES_FPS.map(([v]) => v), d.limiteFps),
  };
}

/** Aplica al documento las opciones visuales. */
export function aplicarConfigVisual(c: Configuracion): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.texto = c.tamanoTexto;
  html.dataset.theme = c.tema === 'claro' ? 'light' : 'dark';
  html.dataset.animaciones = c.animacionesReducidas ? 'reducidas' : 'completas';
}
