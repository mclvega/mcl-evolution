import { formaDeEtapa } from './formas';
import type { Rng } from './rng';

/**
 * Mutaciones: al evolucionar se elige 1 de 3 y se suman durante toda la partida.
 * Las pasivas suben de nivel (hasta `max`); las activas dan un botón y, al repetirlas, recargan antes.
 */
export type IdMutacion =
  | 'caparazon' | 'regeneracion' | 'garras' | 'patas' | 'digestion' | 'olfato' | 'pulmones' | 'veneno'
  | 'rugido' | 'escupitajo' | 'embestida';

export interface DefMutacion {
  id: IdMutacion;
  nombre: string;
  icono: string;
  max: number;
  activa: boolean;
  texto: string;
}

export const MUTACIONES: readonly DefMutacion[] = [
  { id: 'caparazon', nombre: 'Caparazón', icono: '🛡️', max: 3, activa: false, texto: 'Recibes un 15 % menos de daño por nivel.' },
  { id: 'regeneracion', nombre: 'Regeneración', icono: '💚', max: 3, activa: false, texto: 'Recuperas 1,5 de vida por segundo por nivel.' },
  { id: 'garras', nombre: 'Garras', icono: '🦷', max: 3, activa: false, texto: 'Tu mordisco hace un 22 % más de daño por nivel.' },
  { id: 'patas', nombre: 'Patas largas', icono: '🦵', max: 3, activa: false, texto: 'Corres un 10 % más rápido y saltas un 15 % más alto por nivel.' },
  { id: 'digestion', nombre: 'Digestión', icono: '🍃', max: 3, activa: false, texto: 'La comida te da un 25 % más de ADN y de vida por nivel.' },
  { id: 'olfato', nombre: 'Olfato', icono: '👃', max: 1, activa: false, texto: 'Ves en el borde de la pantalla dónde está la comida y la presa más cercana.' },
  { id: 'pulmones', nombre: 'Pulmones', icono: '🫁', max: 3, activa: false, texto: 'Un 35 % más de aguante para correr por nivel.' },
  { id: 'veneno', nombre: 'Colmillos venenosos', icono: '🧪', max: 2, activa: false, texto: 'Tus mordiscos envenenan: 6 de daño por segundo durante 3 s por nivel.' },
  { id: 'rugido', nombre: 'Rugido', icono: '📢', max: 3, activa: true, texto: 'Aturde 2,5 s a la fauna cercana. Cada nivel recarga antes.' },
  { id: 'escupitajo', nombre: 'Escupitajo', icono: '💦', max: 3, activa: true, texto: 'Lanza una bola de ácido a distancia. Cada nivel recarga antes.' },
  { id: 'embestida', nombre: 'Embestida', icono: '💥', max: 3, activa: false, texto: 'Al correr golpeas y empujas a lo que te cruzas. Más daño por nivel.' },
];

export type Mutaciones = Partial<Record<IdMutacion, number>>;

export const mutacionPorId = (id: IdMutacion) => MUTACIONES.find((m) => m.id === id)!;
export const nivelMutacion = (m: Mutaciones, id: IdMutacion) => m[id] ?? 0;

/** Estadísticas del jugador en una etapa con sus mutaciones. */
export function statsJugador(etapa: number, m: Mutaciones) {
  const { forma } = formaDeEtapa(etapa);
  const crec = 1 + Math.max(0, etapa - 1) * 0.18;
  const nv = (id: IdMutacion) => nivelMutacion(m, id);
  return {
    vidaMax: Math.round(100 * forma.vida * crec),
    mordisco: 20 * forma.mordisco * crec * (1 + 0.22 * nv('garras')),
    alcance: forma.alcance,
    velocidad: 5.5 * forma.velocidad * (1 + 0.1 * nv('patas')),
    salto: 7 * Math.sqrt(forma.salto * (1 + 0.15 * nv('patas'))),
    armadura: 1 - Math.min(0.6, 0.15 * nv('caparazon')),
    regeneracion: 1.5 * nv('regeneracion') * crec,
    comida: 1 + 0.25 * nv('digestion'),
    aguanteMax: 100 * (1 + 0.35 * nv('pulmones')),
    olfato: nv('olfato') > 0,
    veneno: 6 * nv('veneno') * crec,
    embestida: nv('embestida') ? 20 * crec * (0.5 + 0.25 * nv('embestida')) : 0,
    /** Recarga en segundos (0 = no la tiene). */
    rugido: nv('rugido') ? 14 - 3 * (nv('rugido') - 1) : 0,
    escupitajo: nv('escupitajo') ? 5 - 1.2 * (nv('escupitajo') - 1) : 0,
  };
}

export type StatsJugador = ReturnType<typeof statsJugador>;

/** Tres mutaciones distintas que aún se pueden subir. */
export function sortearMutaciones(m: Mutaciones, rng: Rng, cuantas = 3): IdMutacion[] {
  const disponibles = MUTACIONES.filter((d) => nivelMutacion(m, d.id) < d.max).map((d) => d.id);
  const elegidas: IdMutacion[] = [];
  while (elegidas.length < cuantas && disponibles.length) {
    const i = Math.floor(rng.siguiente() * disponibles.length);
    elegidas.push(disponibles.splice(i, 1)[0]);
  }
  return elegidas;
}

/** Sube una mutación un nivel (sin pasar del máximo). */
export function aplicarMutacion(m: Mutaciones, id: IdMutacion): Mutaciones {
  const def = mutacionPorId(id);
  return { ...m, [id]: Math.min(def.max, nivelMutacion(m, id) + 1) };
}
