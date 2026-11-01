import { MUTACIONES, type IdMutacion, type Mutaciones } from './core/mutaciones';
import { ASPECTO_POR_DEFECTO, normalizarAspecto, type Aspecto } from './game/aspecto';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

/** Récord de un linaje (una partida desde la primera forma hasta donde llegó). */
export interface Record_ {
  /** Identificador del linaje: un mismo linaje solo ocupa una fila. */
  id: number;
  nombre: string;
  etapa: number;
  presas: number;
  adn: number;
  fecha: string;
}

export interface Estadisticas {
  linajes: number;
  etapaMax: number;
  evoluciones: number;
  presas: number;
  alfas: number;
  adnTotal: number;
  caidas: number;
}

const estadisticasNuevas = (): Estadisticas => ({ linajes: 0, etapaMax: 0, evoluciones: 0, presas: 0, alfas: 0, adnTotal: 0, caidas: 0 });

/** Dónde va el linaje actual: «Jugar» continúa desde aquí. */
export interface Avance {
  id: number;
  etapa: number;
  semilla: number;
  mutaciones: Mutaciones;
  presas: number;
  adn: number;
}

export interface Guardado {
  v: 1;
  nombre: string | null;
  avance: Avance | null;
  records: Record_[];
  estadisticas: Estadisticas;
  /** Apariencia de la criatura. */
  aspecto: Aspecto;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-evolution:v1';
const MAX_RECORDS = 10;

export const guardadoNuevo = (): Guardado => ({
  v: 1, nombre: null, avance: null, records: [], estadisticas: estadisticasNuevas(), aspecto: { ...ASPECTO_POR_DEFECTO }, config: configPorDefecto(),
});

/** Linaje nuevo desde la primera forma. */
export const avanceNuevo = (ahora = Date.now()): Avance => ({ id: ahora, etapa: 1, semilla: (ahora * 2654435761) >>> 0, mutaciones: {}, presas: 0, adn: 0 });

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return {
    id: entero(v.id, 0, Number.MAX_SAFE_INTEGER, 0), nombre: v.nombre.slice(0, 20), etapa: entero(v.etapa, 1, 1e6, 1),
    presas: entero(v.presas, 0, 1e7, 0), adn: entero(v.adn, 0, 1e9, 0), fecha: v.fecha,
  };
}

/** Orden de la tabla: más etapas y, a igualdad, más presas. */
const comparar = (a: Record_, b: Record_) => b.etapa - a.etapa || b.presas - a.presas;

function normalizarEstadisticas(v: unknown): Estadisticas {
  const e = estadisticasNuevas();
  if (!esObjeto(v)) return e;
  for (const k of Object.keys(e) as Array<keyof Estadisticas>) e[k] = entero(v[k], 0, 1e9, 0);
  return e;
}

export function normalizarMutaciones(v: unknown): Mutaciones {
  const m: Mutaciones = {};
  if (!esObjeto(v)) return m;
  for (const def of MUTACIONES) {
    const n = entero(v[def.id], 0, def.max, 0);
    if (n > 0) m[def.id as IdMutacion] = n;
  }
  return m;
}

function normalizarAvance(v: unknown): Avance | null {
  if (!esObjeto(v)) return null;
  return {
    id: entero(v.id, 0, Number.MAX_SAFE_INTEGER, 0),
    etapa: entero(v.etapa, 1, 1e6, 1),
    semilla: entero(v.semilla, 0, 0xffffffff, 1),
    mutaciones: normalizarMutaciones(v.mutaciones),
    presas: entero(v.presas, 0, 1e7, 0),
    adn: entero(v.adn, 0, 1e9, 0),
  };
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const records = Array.isArray(entrada.records)
    ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
    : [];
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    avance: normalizarAvance(entrada.avance),
    records,
    estadisticas: normalizarEstadisticas(entrada.estadisticas),
    aspecto: normalizarAspecto(entrada.aspecto),
    config: normalizarConfig(entrada.config),
  };
}

/** Pone al día la fila del linaje en la tabla. Devuelve true si está entre los mejores. */
export function anotarRecord(g: Guardado, a: Avance, nombre: string): boolean {
  const fila: Record_ = { id: a.id, nombre, etapa: a.etapa, presas: a.presas, adn: a.adn, fecha: new Date().toISOString().slice(0, 10) };
  g.records = g.records.filter((r) => r.id !== a.id);
  g.records.push(fila);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return g.records.includes(fila);
}

/** Anota el final de una etapa: al evolucionar, el linaje pasa a la siguiente. */
export function anotarEtapa(g: Guardado, r: { etapa: number; presas: number; adn: number; evoluciona: boolean }, mutaciones: Mutaciones, nombre: string): void {
  const e = g.estadisticas;
  const a = g.avance ?? avanceNuevo();
  e.presas += r.presas;
  e.adnTotal += r.adn;
  a.presas += r.presas;
  a.adn += r.adn;
  if (r.evoluciona) {
    e.evoluciones++;
    e.alfas++;
    a.etapa = r.etapa + 1;
    a.mutaciones = { ...mutaciones };
    a.semilla = (Math.imul(a.semilla ^ a.etapa, 2654435761) + 1) >>> 0;
  } else e.caidas++;
  e.etapaMax = Math.max(e.etapaMax, a.etapa);
  g.avance = a;
  anotarRecord(g, a, nombre);
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}
