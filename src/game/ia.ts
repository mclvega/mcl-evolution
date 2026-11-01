import { angulo, enArco, yawHacia } from '../core/combate';
import type { Fauna, Partida } from './logica';

/** Segundos de aviso de cada ataque del Alfa. */
const AVISO_CARGA = 0.9;
const AVISO_PISOTON = 1.1;
const DURACION_CARGA = 1.1;

function girarHacia(f: Fauna, yaw: number, dt: number, rapidez = 8) {
  f.yaw += angulo(yaw - f.yaw) * Math.min(1, dt * rapidez);
}

/** Avanza mirando hacia donde va. */
function andar(p: Partida, f: Fauna, dirYaw: number, velocidad: number, dt: number) {
  girarHacia(f, dirYaw, dt);
  p.mover(f.cuerpo, -Math.sin(f.yaw) * velocidad * dt, -Math.cos(f.yaw) * velocidad * dt, dt);
}

/** Siguiente sitio al que pasear. Si se aleja mucho del jugador, vuelve hacia él (así sigue habiendo fauna cerca). */
function nuevoDestino(p: Partida, f: Fauna) {
  const j = p.jugador.cuerpo;
  const lejos = Math.hypot(f.cuerpo.x - j.x, f.cuerpo.z - j.z) > 50;
  const a = lejos ? Math.atan2(j.z - f.cuerpo.z, j.x - f.cuerpo.x) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
  const d = 4 + Math.random() * 10;
  f.destino = { x: f.cuerpo.x + Math.cos(a) * d, z: f.cuerpo.z + Math.sin(a) * d };
  f.t = 3 + Math.random() * 5;
}

/** Alcance del mordisco de un animal. */
const alcance = (f: Fauna) => f.cuerpo.radio + 0.7 * f.escala;

/** Decide el ataque del Alfa según la distancia (en la segunda fase, más variado). */
function elegirAtaqueAlfa(f: Fauna, d: number): Fauna['ataque'] {
  if (d < alcance(f) + 0.6) return f.fase2 && Math.random() < 0.35 ? 'pisoton' : 'mordisco';
  if (d > 6 && d < 20 && Math.random() < (f.fase2 ? 0.02 : 0.012)) return 'carga';
  return null;
}

function empezarAtaque(f: Fauna, ataque: NonNullable<Fauna['ataque']>) {
  f.estado = 'aviso';
  f.ataque = ataque;
  f.t = 0;
  f.acerto = false;
}

/** Comportamiento de un animal en un paso de simulación. */
export function actualizarFauna(p: Partida, f: Fauna, dt: number) {
  if (f.estado === 'muerto') {
    f.muerteT += dt;
    return;
  }
  const j = p.jugador;
  const jc = j.cuerpo;
  const vivo = j.estado !== 'muerto';
  const d = Math.hypot(jc.x - f.cuerpo.x, jc.z - f.cuerpo.z);
  const haciaJugador = yawHacia(f.cuerpo.x, f.cuerpo.z, jc.x, jc.z);
  f.recarga = Math.max(0, f.recarga - dt);
  f.golpeado = Math.max(0, f.golpeado - dt);
  if (f.veneno > 0) {
    f.veneno -= dt;
    p.danarFaunaSilencioso(f, f.dpsVeneno * dt);
    if (f.vida <= 0) return;
  }
  if (f.rol === 'alfa' && !f.fase2 && f.vida < f.vidaMax * 0.5) {
    f.fase2 = true;
    p.avisar('👑 ¡El Alfa se enfurece!', 2);
  }
  // Gravedad (por si quedó sobre una roca).
  if (!f.cuerpo.enSuelo) p.mover(f.cuerpo, 0, 0, dt);

  switch (f.estado) {
    case 'aturdido':
      f.t -= dt;
      if (f.t <= 0) f.estado = f.rol === 'presa' ? 'huir' : f.rol === 'rival' && f.provocado <= 0 ? 'deambular' : 'perseguir';
      return;

    case 'deambular': {
      f.t -= dt;
      const dd = Math.hypot(f.destino.x - f.cuerpo.x, f.destino.z - f.cuerpo.z);
      if (f.t <= 0 || dd < 1) nuevoDestino(p, f);
      else if (dd > 1 && f.t < 6) andar(p, f, yawHacia(f.cuerpo.x, f.cuerpo.z, f.destino.x, f.destino.z), f.velocidad * 0.35, dt);
      if (!vivo) return;
      if (f.rol === 'presa' && d < f.deteccion) f.estado = 'huir';
      if (f.rol === 'depredador' && d < f.deteccion) f.estado = 'perseguir';
      if (f.rol === 'rival' && f.provocado > 0) f.estado = 'perseguir';
      return;
    }

    case 'huir': {
      if (!vivo || d > f.deteccion * 1.8) {
        f.estado = 'deambular';
        f.t = 0;
        return;
      }
      // Huye hacia el lado contrario, zigzagueando.
      const yaw = haciaJugador + Math.PI + Math.sin(p.tiempo * 1.3 + f.id) * 0.5;
      andar(p, f, yaw, f.velocidad, dt);
      return;
    }

    case 'perseguir': {
      if (!vivo) {
        f.estado = 'deambular';
        return;
      }
      if (f.rol === 'rival') {
        if (d > 12) f.provocado -= dt * 2;
        else f.provocado -= dt * 0.3;
        if (f.provocado <= 0) {
          f.estado = 'deambular';
          f.t = 0;
          return;
        }
      }
      if (f.rol === 'depredador' && d > f.deteccion * 1.8) {
        f.estado = 'deambular';
        f.t = 0;
        return;
      }
      if (f.rol === 'alfa') {
        const a = f.recarga <= 0 ? elegirAtaqueAlfa(f, d) : null;
        if (a) return empezarAtaque(f, a);
      } else if (d < alcance(f) + jc.radio && f.recarga <= 0) return empezarAtaque(f, 'mordisco');
      if (d > alcance(f) + jc.radio * 0.8) andar(p, f, haciaJugador, f.velocidad * (f.fase2 ? 1.2 : 1), dt);
      else girarHacia(f, haciaJugador, dt);
      return;
    }

    case 'aviso': {
      f.t += dt;
      const total = f.ataque === 'carga' ? AVISO_CARGA : f.ataque === 'pisoton' ? AVISO_PISOTON : f.d.aviso * (f.fase2 ? 0.8 : 1);
      // Solo se orienta durante la primera parte del aviso: así se puede esquivar.
      if (f.t < total * 0.6) girarHacia(f, haciaJugador, dt, 10);
      if (f.t < total) return;
      if (f.ataque === 'carga') {
        f.estado = 'carga';
        f.t = 0;
        return;
      }
      if (f.ataque === 'pisoton') {
        const r = 2.2 * f.escala;
        p.efecto('onda', f.cuerpo.x, 0.15, f.cuerpo.z, 0.5, r);
        p.efecto('polvo', f.cuerpo.x, 0.3, f.cuerpo.z, 0.6);
        if (vivo && d < r + jc.radio && jc.y < 0.6) p.danarJugador(f.dano * 1.2, f.cuerpo.x, f.cuerpo.z);
      } else if (vivo && Math.abs(jc.y - f.cuerpo.y) < f.cuerpo.alto + 0.2 && enArco(f.cuerpo.x, f.cuerpo.z, f.yaw, jc.x, jc.z, jc.radio, alcance(f) + 0.3, 1.5)) {
        p.danarJugador(f.dano, f.cuerpo.x, f.cuerpo.z);
        if (f.rasgo === 'venenoso') p.envenenarJugador(f.dano * 0.4);
      }
      f.estado = 'recuperar';
      f.t = 0;
      f.recarga = f.d.recarga * (f.fase2 ? 0.75 : 1);
      return;
    }

    case 'carga': {
      f.t += dt;
      p.mover(f.cuerpo, -Math.sin(f.yaw) * f.velocidad * 2.8 * dt, -Math.cos(f.yaw) * f.velocidad * 2.8 * dt, dt);
      if (Math.random() < 0.3) p.efecto('polvo', f.cuerpo.x, 0.2, f.cuerpo.z, 0.4);
      if (!f.acerto && vivo && d < f.cuerpo.radio + jc.radio + 0.2 && jc.y < f.cuerpo.alto * 0.7) {
        f.acerto = true;
        p.danarJugador(f.dano * 1.5, f.cuerpo.x, f.cuerpo.z);
      }
      if (f.t >= DURACION_CARGA) {
        f.estado = 'recuperar';
        f.t = -0.5;
        f.recarga = f.d.recarga;
      }
      return;
    }

    case 'recuperar':
      f.t += dt;
      if (f.t >= 0.4) f.estado = vivo ? 'perseguir' : 'deambular';
      return;
  }
}
