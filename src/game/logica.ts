import { angulo, enArco, yawHacia } from '../core/combate';
import { escalaEtapa, type Modo } from '../core/difficulty';
import { formaDeRol, poblacion, ROLES, type DefRol, type Rol } from '../core/especies';
import { moverCuerpo, Rejilla, type Cuerpo } from '../core/fisica';
import { formaDeEtapa, formaPorId, type Forma, type IdForma } from '../core/formas';
import { aplicarMutacion, sortearMutaciones, statsJugador, type IdMutacion, type Mutaciones, type StatsJugador } from '../core/mutaciones';
import { COMIDA, generarRegion, metaAdn, REBROTE, type Region, type TipoComida } from '../core/region';
import { crearRng, type Rng } from '../core/rng';
import { actualizarFauna } from './ia';

export interface Controles {
  /** Dirección relativa a la cámara en [-1, 1] (z negativo = adelante). */
  x: number;
  z: number;
  giroX: number;
  giroY: number;
  morder: boolean;
  saltar: boolean;
  /** Mantenido. */
  correr: boolean;
  rugido: boolean;
  escupir: boolean;
  fijar: boolean;
}

export const controlesVacios = (): Controles => ({
  x: 0, z: 0, giroX: 0, giroY: 0, morder: false, saltar: false, correr: false, rugido: false, escupir: false, fijar: false,
});

export type EstadoJugador = 'libre' | 'mordiendo' | 'muerto';

/** Posición en el paso anterior (el render interpola entre las dos). */
export interface Punto {
  x: number;
  y: number;
  z: number;
}

export interface Jugador {
  cuerpo: Cuerpo;
  anterior: Punto;
  yaw: number;
  vida: number;
  aguante: number;
  /** Sin aguante: no puede correr hasta recuperar un 30 %. */
  agotado: boolean;
  estado: EstadoJugador;
  t: number;
  mordido: boolean;
  recargaMordisco: number;
  recargaRugido: number;
  recargaEscupir: number;
  invulnerable: number;
  moviendose: boolean;
  corriendo: boolean;
  /** Crece un poco al llenar la barra de ADN (1 a 1,25). */
  crecimiento: number;
}

export type EstadoFauna = 'deambular' | 'huir' | 'perseguir' | 'aviso' | 'carga' | 'recuperar' | 'aturdido' | 'muerto';
export type AtaqueFauna = 'mordisco' | 'carga' | 'pisoton';

export interface Fauna {
  id: number;
  rol: Rol;
  forma: IdForma;
  /** Color de piel (de la paleta del bioma). */
  color: number;
  d: DefRol;
  escala: number;
  cuerpo: Cuerpo;
  anterior: Punto;
  yaw: number;
  vida: number;
  vidaMax: number;
  dano: number;
  velocidad: number;
  deteccion: number;
  estado: EstadoFauna;
  t: number;
  recarga: number;
  ataque: AtaqueFauna | null;
  /** El ataque ya dio en el blanco (cargas). */
  acerto: boolean;
  destino: { x: number; z: number };
  /** Segundos que un rival sigue enfadado. */
  provocado: number;
  veneno: number;
  dpsVeneno: number;
  /** Espera antes de que la embestida pueda volver a darle. */
  golpeado: number;
  muerteT: number;
  fase2: boolean;
}

export interface Comida {
  id: number;
  x: number;
  z: number;
  tipo: TipoComida | 'carne';
  /** ADN que da (la carne guarda el de su presa). */
  adn: number;
  activa: boolean;
  /** Rebrote (vegetales) o tiempo que queda antes de pudrirse (carne). */
  t: number;
  /** Tamaño de la carne, según la presa. */
  escala: number;
}

export interface Proyectil {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
  dano: number;
}

export type TipoEfecto = 'mordisco' | 'sangre' | 'comer' | 'onda' | 'veneno' | 'polvo' | 'adn';

export interface Efecto {
  tipo: TipoEfecto;
  x: number;
  y: number;
  z: number;
  t: number;
  total: number;
  /** Radio final de las ondas. */
  r: number;
}

export interface NumeroDano {
  x: number;
  y: number;
  z: number;
  valor: number;
  t: number;
  propio: boolean;
}

export type Fase = 'juego' | 'evolucion' | 'fin';

export interface Resumen {
  etapa: number;
  forma: string;
  adn: number;
  presas: number;
  comidas: number;
  tiempo: number;
  /** Venció al Alfa y evoluciona. */
  evoluciona: boolean;
}

export interface EventosPartida {
  mordisco?: (acierto: boolean) => void;
  dano?: () => void;
  comer?: (tipo: Comida['tipo']) => void;
  caza?: (rol: Rol) => void;
  alfa?: () => void;
  rugido?: () => void;
  escupir?: () => void;
  salto?: () => void;
  evolucion?: (r: Resumen) => void;
  fin?: (r: Resumen) => void;
}

export interface OpcionesPartida {
  etapa: number;
  semilla: number;
  mutaciones: Mutaciones;
  modo: Modo;
  eventos?: EventosPartida;
}

const ARCO_MORDISCO = 1.7;
const IMPACTO_MORDISCO = 0.12;
const DURACION_MORDISCO = 0.3;
const RECARGA_MORDISCO = 0.42;
const DESPAWN_CARNE = 40;

/** Una etapa: la región, el jugador con su forma, la fauna, la comida y el Alfa. */
export class Partida {
  readonly etapa: number;
  readonly semilla: number;
  readonly region: Region;
  readonly rejilla: Rejilla;
  readonly forma: Forma;
  readonly nombreForma: string;
  /** Vuelta del ciclo de formas: más púas. */
  readonly ciclo: number;
  readonly modo: Modo;
  mutaciones: Mutaciones;
  stats: StatsJugador;
  readonly meta: number;
  readonly eventos: EventosPartida;
  private rng: Rng;
  private escala: ReturnType<typeof escalaEtapa>;

  jugador: Jugador;
  fauna: Fauna[] = [];
  comida: Comida[] = [];
  proyectiles: Proyectil[] = [];
  efectos: Efecto[] = [];
  numeros: NumeroDano[] = [];
  fase: Fase = 'juego';
  pausada = false;
  tiempo = 0;
  adn = 0;
  presas = 0;
  comidas = 0;
  alfa: Fauna | null = null;
  ofertas: IdMutacion[] = [];
  mensaje = '';
  mensajeT = 0;
  camYaw = 0;
  camPitch = 0.42;
  fijado: Fauna | null = null;
  autoFijar = false;
  private sigId = 1;
  private reponer = 0;
  private finT = 0;

  constructor(o: OpcionesPartida) {
    this.etapa = Math.max(1, Math.floor(o.etapa));
    this.semilla = o.semilla >>> 0;
    this.modo = o.modo;
    this.mutaciones = { ...o.mutaciones };
    this.eventos = o.eventos ?? {};
    this.rng = crearRng((this.semilla * 31 + this.etapa) >>> 0);
    this.escala = escalaEtapa(this.etapa);
    this.region = generarRegion(this.etapa, this.semilla);
    this.rejilla = new Rejilla(this.region.bloques);
    const f = formaDeEtapa(this.etapa);
    this.forma = f.forma;
    this.ciclo = f.ciclo;
    this.nombreForma = f.nombre;
    this.stats = statsJugador(this.etapa, this.mutaciones);
    this.meta = Math.round(metaAdn(this.etapa));
    this.jugador = {
      cuerpo: { x: 0, y: 0, z: 0, vy: 0, radio: this.forma.radio, alto: this.forma.alto, enSuelo: true },
      anterior: { x: 0, y: 0, z: 0 },
      yaw: 0, vida: this.stats.vidaMax, aguante: this.stats.aguanteMax, agotado: false, estado: 'libre', t: 0, mordido: false,
      recargaMordisco: 0, recargaRugido: 0, recargaEscupir: 0, invulnerable: 0, moviendose: false, corriendo: false, crecimiento: 1,
    };
    for (const c of this.region.comida) {
      this.comida.push({ id: this.sigId++, x: c.x, z: c.z, tipo: c.tipo, adn: COMIDA[c.tipo].adn * this.escala.meta, activa: true, t: 0, escala: 1 });
    }
    const pob = poblacion(this.etapa);
    for (const rol of ['presa', 'rival', 'depredador'] as const) for (let i = 0; i < pob[rol]; i++) this.aparecer(rol, rol === 'depredador' ? 26 : 12);
    this.avisar(`${this.region.bioma.icono} ${this.region.bioma.nombre} · ${this.forma.icono} ${this.nombreForma}`, 3);
  }

  /* ---------- Utilidades ---------- */

  avisar(texto: string, segundos = 2.5) {
    this.mensaje = texto;
    this.mensajeT = segundos;
  }

  /** Radio del jugador con su crecimiento. */
  get radioJugador() {
    return this.forma.radio * this.jugador.crecimiento;
  }

  get vivos() {
    return this.fauna.filter((f) => f.estado !== 'muerto');
  }

  efecto(tipo: TipoEfecto, x: number, y: number, z: number, total = 0.6, r = 1) {
    this.efectos.push({ tipo, x, y, z, t: total, total, r });
  }

  private numero(x: number, y: number, z: number, valor: number, propio: boolean) {
    this.numeros.push({ x, y, z, valor: Math.max(1, Math.round(valor)), t: 0.8, propio });
  }

  /** Punto libre (sin rocas ni troncos) a cierta distancia del jugador. */
  private puntoLibre(minDist: number, radio: number): { x: number; z: number } {
    const j = this.jugador.cuerpo;
    const R = this.region.radio - 4;
    for (let i = 0; i < 40; i++) {
      const a = this.rng.rango(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.siguiente()) * R;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.hypot(x - j.x, z - j.z) < minDist) continue;
      const choca = this.rejilla.cerca(x, z).some((b) => Math.abs(x - b.x) < b.w / 2 + radio && Math.abs(z - b.z) < b.d / 2 + radio);
      if (!choca) return { x, z };
    }
    return { x: -j.x * 0.5, z: R * 0.8 * (j.z > 0 ? -1 : 1) };
  }

  /** Crea un animal del papel dado, lejos del jugador. */
  aparecer(rol: Rol, minDist = 28): Fauna {
    const d = ROLES[rol];
    const formaId = formaDeRol(this.etapa, rol, this.rng);
    const forma = formaPorId(formaId);
    const escala = d.escala * this.rng.rango(0.9, 1.1);
    const p = this.puntoLibre(minDist, forma.radio * escala + 0.3);
    const vidaMax = d.vida * this.escala.vida * (rol === 'alfa' ? this.modo.alfa : this.modo.vida);
    const f: Fauna = {
      id: this.sigId++,
      rol,
      forma: formaId,
      color: rol === 'alfa' ? 0x3a2a2a : this.rng.elegir(this.region.bioma.fauna),
      d,
      escala,
      cuerpo: { x: p.x, y: 0, z: p.z, vy: 0, radio: forma.radio * escala, alto: forma.alto * escala, enSuelo: true },
      anterior: { x: p.x, y: 0, z: p.z },
      yaw: this.rng.rango(-Math.PI, Math.PI),
      vida: vidaMax,
      vidaMax,
      dano: d.dano * this.escala.dano * this.modo.dano,
      velocidad: d.velocidad * forma.velocidad ** 0.5,
      deteccion: rol === 'depredador' ? d.deteccion * this.modo.deteccion : d.deteccion,
      estado: rol === 'alfa' ? 'perseguir' : 'deambular',
      t: 0,
      recarga: 1,
      ataque: null,
      acerto: false,
      destino: { x: p.x, z: p.z },
      provocado: 0,
      veneno: 0,
      dpsVeneno: 0,
      golpeado: 0,
      muerteT: 0,
      fase2: false,
    };
    this.fauna.push(f);
    return f;
  }

  /** Mueve un cuerpo con colisiones y lo mantiene dentro de la región. */
  mover(c: Cuerpo, dx: number, dz: number, dt: number) {
    moverCuerpo(c, dx, dz, dt, this.rejilla);
    const R = this.region.radio - c.radio;
    const d = Math.hypot(c.x, c.z);
    if (d > R) {
      c.x *= R / d;
      c.z *= R / d;
    }
  }

  /* ---------- Daño ---------- */

  danarJugador(dano: number, x: number, z: number) {
    const j = this.jugador;
    if (j.estado === 'muerto' || j.invulnerable > 0 || this.fase !== 'juego') return;
    const real = dano * this.stats.armadura;
    j.vida -= real;
    j.invulnerable = 0.3;
    this.numero(j.cuerpo.x, j.cuerpo.y + j.cuerpo.alto + 0.4, j.cuerpo.z, real, true);
    this.efecto('sangre', j.cuerpo.x, j.cuerpo.y + j.cuerpo.alto * 0.6, j.cuerpo.z, 0.5);
    // Empujón leve lejos del atacante.
    const dx = j.cuerpo.x - x;
    const dz = j.cuerpo.z - z;
    const l = Math.hypot(dx, dz) || 1;
    this.mover(j.cuerpo, (dx / l) * 0.5, (dz / l) * 0.5, 0);
    this.eventos.dano?.();
    if (j.vida <= 0) {
      j.vida = 0;
      j.estado = 'muerto';
      j.t = 0;
      this.fijado = null;
    }
  }

  danarFauna(f: Fauna, dano: number) {
    if (f.estado === 'muerto') return;
    f.vida -= dano;
    this.numero(f.cuerpo.x, f.cuerpo.y + f.cuerpo.alto + 0.3, f.cuerpo.z, dano, false);
    this.efecto('mordisco', f.cuerpo.x, f.cuerpo.y + f.cuerpo.alto * 0.6, f.cuerpo.z, 0.35);
    if (f.rol === 'rival') f.provocado = 12;
    if (f.rol === 'presa' && f.estado !== 'aturdido') f.estado = 'huir';
    if (f.rol === 'depredador' && f.estado === 'deambular') f.estado = 'perseguir';
    if (f.vida <= 0) this.matar(f);
  }

  /** Daño continuo (veneno): sin números ni efectos en cada paso. */
  danarFaunaSilencioso(f: Fauna, dano: number) {
    if (f.estado === 'muerto') return;
    f.vida -= dano;
    if (f.vida <= 0) this.matar(f);
  }

  private matar(f: Fauna) {
    f.vida = 0;
    f.estado = 'muerto';
    f.muerteT = 0;
    if (this.fijado === f) this.fijado = null;
    this.efecto('sangre', f.cuerpo.x, f.cuerpo.y + f.cuerpo.alto * 0.5, f.cuerpo.z, 0.8);
    this.eventos.caza?.(f.rol);
    if (f.rol === 'alfa') {
      this.avisar('👑 ¡Has vencido al Alfa!', 3);
      return;
    }
    this.presas++;
    // Deja carne: el ADN se gana al comerla.
    this.comida.push({ id: this.sigId++, x: f.cuerpo.x, z: f.cuerpo.z, tipo: 'carne', adn: f.d.adn * this.escala.meta, activa: true, t: DESPAWN_CARNE, escala: Math.min(1.6, 0.6 + f.escala * 0.4) });
  }

  /* ---------- Bucle ---------- */

  actualizar(dt: number, c: Controles) {
    if (this.pausada || this.fase !== 'juego') return;
    const guardar = (c: Cuerpo, a: Punto) => {
      a.x = c.x;
      a.y = c.y;
      a.z = c.z;
    };
    guardar(this.jugador.cuerpo, this.jugador.anterior);
    for (const f of this.fauna) guardar(f.cuerpo, f.anterior);
    this.tiempo += dt;
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    this.camYaw -= c.giroX;
    this.camPitch = Math.max(0.1, Math.min(1.05, this.camPitch + c.giroY));

    this.actualizarJugador(dt, c);
    for (const f of this.fauna) actualizarFauna(this, f, dt);
    this.separar();
    this.actualizarComida(dt);
    this.actualizarProyectiles(dt);
    this.actualizarEfectos(dt);

    // La fauna muerta se va; los muertos del jugador acaban la etapa.
    this.fauna = this.fauna.filter((f) => f.estado !== 'muerto' || f.muerteT < 2.2);
    this.reponer -= dt;
    if (this.reponer <= 0) {
      this.reponer = 5;
      this.reponerFauna();
    }

    if (!this.alfa && this.adn >= this.meta) {
      this.alfa = this.aparecer('alfa', 24);
      this.avisar('👑 ¡El Alfa de la región te desafía!', 3.5);
      this.eventos.alfa?.();
    }
    if (this.alfa && this.alfa.estado === 'muerto' && this.alfa.muerteT > 1.4) this.evolucionar();
    if (this.jugador.estado === 'muerto') {
      this.finT += dt;
      if (this.finT > 1.6) this.terminar();
    }
  }

  private actualizarJugador(dt: number, c: Controles) {
    const j = this.jugador;
    const s = this.stats;
    j.t += dt;
    j.recargaMordisco = Math.max(0, j.recargaMordisco - dt);
    j.recargaRugido = Math.max(0, j.recargaRugido - dt);
    j.recargaEscupir = Math.max(0, j.recargaEscupir - dt);
    j.invulnerable = Math.max(0, j.invulnerable - dt);
    if (j.estado === 'muerto') {
      j.moviendose = j.corriendo = false;
      return;
    }
    j.vida = Math.min(s.vidaMax, j.vida + s.regeneracion * dt);
    j.crecimiento = 1 + 0.25 * Math.min(1, this.adn / this.meta);
    j.cuerpo.radio = this.forma.radio * j.crecimiento;
    j.cuerpo.alto = this.forma.alto * j.crecimiento;

    // Objetivo fijado: con Tab o 🎯, o solo (el animal más cercano).
    const valido = (f: Fauna | null) => !!f && f.estado !== 'muerto' && this.distancia(f) < 16;
    if (!valido(this.fijado)) this.fijado = null;
    if (c.fijar) this.fijado = this.fijado ? null : this.masCercano(14);
    else if (this.autoFijar && !this.fijado) this.fijado = this.masCercano(8);
    if (this.fijado && this.autoFijar) {
      const deseado = yawHacia(j.cuerpo.x, j.cuerpo.z, this.fijado.cuerpo.x, this.fijado.cuerpo.z);
      this.camYaw += angulo(deseado - this.camYaw) * Math.min(1, dt * 2.5);
    }

    // Movimiento relativo a la cámara.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let mx = rx * c.x - fx * c.z;
    let mz = rz * c.x - fz * c.z;
    const l = Math.hypot(mx, mz);
    if (l > 1) {
      mx /= l;
      mz /= l;
    }
    j.moviendose = l > 0.1;
    if (j.aguante <= 0) j.agotado = true;
    if (j.agotado && j.aguante >= s.aguanteMax * 0.3) j.agotado = false;
    j.corriendo = c.correr && j.moviendose && !j.agotado;
    j.aguante = j.corriendo ? Math.max(0, j.aguante - 24 * dt) : Math.min(s.aguanteMax, j.aguante + 16 * dt);
    const vel = s.velocidad * (j.corriendo ? 1.55 : 1) * (j.estado === 'mordiendo' ? 0.55 : 1);
    if (j.moviendose) {
      const deseado = Math.atan2(-mx, -mz);
      j.yaw += angulo(deseado - j.yaw) * Math.min(1, dt * 12);
    }
    if (c.saltar && j.cuerpo.enSuelo) {
      j.cuerpo.vy = s.salto;
      j.cuerpo.enSuelo = false;
      this.eventos.salto?.();
    }
    this.mover(j.cuerpo, mx * vel * dt, mz * vel * dt, dt);

    // Mordisco: se orienta hacia el objetivo fijado si está cerca.
    if (c.morder && j.estado === 'libre' && j.recargaMordisco <= 0) {
      j.estado = 'mordiendo';
      j.t = 0;
      j.mordido = false;
      j.recargaMordisco = RECARGA_MORDISCO;
      const obj = this.fijado && this.distancia(this.fijado) < 4 ? this.fijado : null;
      if (obj) j.yaw = yawHacia(j.cuerpo.x, j.cuerpo.z, obj.cuerpo.x, obj.cuerpo.z);
    }
    if (j.estado === 'mordiendo') {
      if (!j.mordido && j.t >= IMPACTO_MORDISCO) {
        j.mordido = true;
        const alcance = s.alcance * j.crecimiento;
        let acierto = false;
        for (const f of this.fauna) {
          if (f.estado === 'muerto') continue;
          if (Math.abs(f.cuerpo.y - j.cuerpo.y) > Math.max(f.cuerpo.alto, j.cuerpo.alto) + 0.3) continue;
          if (!enArco(j.cuerpo.x, j.cuerpo.z, j.yaw, f.cuerpo.x, f.cuerpo.z, f.cuerpo.radio, alcance, ARCO_MORDISCO)) continue;
          acierto = true;
          this.danarFauna(f, s.mordisco);
          if (s.veneno > 0 && f.vida > 0) {
            f.veneno = 3;
            f.dpsVeneno = s.veneno;
          }
        }
        this.eventos.mordisco?.(acierto);
      }
      if (j.t >= DURACION_MORDISCO) j.estado = 'libre';
    }

    // Mutaciones activas.
    if (c.rugido && s.rugido && j.recargaRugido <= 0) {
      j.recargaRugido = s.rugido;
      for (const f of this.fauna) {
        if (f.estado === 'muerto' || this.distancia(f) > 9) continue;
        f.estado = 'aturdido';
        f.t = f.rol === 'alfa' ? 1.2 : 2.5;
        f.ataque = null;
      }
      this.efecto('onda', j.cuerpo.x, 0.15, j.cuerpo.z, 0.6, 9);
      this.eventos.rugido?.();
    }
    if (c.escupir && s.escupitajo && j.recargaEscupir <= 0) {
      j.recargaEscupir = s.escupitajo;
      let yaw = j.yaw;
      const obj = this.fijado ?? this.masCercano(14, true);
      if (obj) yaw = yawHacia(j.cuerpo.x, j.cuerpo.z, obj.cuerpo.x, obj.cuerpo.z);
      j.yaw = yaw;
      this.proyectiles.push({ x: j.cuerpo.x - Math.sin(yaw) * 0.6, y: j.cuerpo.y + j.cuerpo.alto * 0.7, z: j.cuerpo.z - Math.cos(yaw) * 0.6, vx: -Math.sin(yaw) * 18, vz: -Math.cos(yaw) * 18, t: 1.2, dano: s.mordisco * 1.3 });
      this.eventos.escupir?.();
    }
    // Embestida: al correr golpea y aparta lo que toca.
    if (j.corriendo && s.embestida > 0) {
      for (const f of this.fauna) {
        if (f.estado === 'muerto' || f.golpeado > 0) continue;
        const dx = f.cuerpo.x - j.cuerpo.x;
        const dz = f.cuerpo.z - j.cuerpo.z;
        const d = Math.hypot(dx, dz);
        if (d > f.cuerpo.radio + j.cuerpo.radio + 0.3) continue;
        f.golpeado = 0.8;
        this.danarFauna(f, s.embestida);
        const empuje = f.rol === 'alfa' ? 0.5 : 2;
        this.mover(f.cuerpo, (dx / (d || 1)) * empuje, (dz / (d || 1)) * empuje, 0);
        this.efecto('polvo', f.cuerpo.x, 0.3, f.cuerpo.z, 0.5);
      }
    }
  }

  distancia(f: Fauna) {
    return Math.hypot(f.cuerpo.x - this.jugador.cuerpo.x, f.cuerpo.z - this.jugador.cuerpo.z);
  }

  /** Animal vivo más cercano (los que te atacan primero). */
  masCercano(max: number, soloDelante = false): Fauna | null {
    const j = this.jugador;
    let mejor: Fauna | null = null;
    let mejorD = max;
    for (const f of this.fauna) {
      if (f.estado === 'muerto') continue;
      let d = this.distancia(f);
      if (soloDelante && Math.abs(angulo(yawHacia(j.cuerpo.x, j.cuerpo.z, f.cuerpo.x, f.cuerpo.z) - j.yaw)) > 1) continue;
      if (f.estado === 'perseguir' || f.estado === 'aviso' || f.rol === 'alfa') d *= 0.6;
      if (d < mejorD) {
        mejorD = d;
        mejor = f;
      }
    }
    return mejor;
  }

  /** Los animales no se atraviesan entre sí ni atraviesan al jugador. */
  private separar() {
    const vivos = this.fauna.filter((f) => f.estado !== 'muerto');
    const j = this.jugador.cuerpo;
    for (let a = 0; a < vivos.length; a++) {
      const fa = vivos[a].cuerpo;
      for (let b = a + 1; b < vivos.length; b++) {
        const fb = vivos[b].cuerpo;
        const dx = fb.x - fa.x;
        const dz = fb.z - fa.z;
        const min = fa.radio + fb.radio;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const k = ((min - d) / d) * 0.5;
        fa.x -= dx * k;
        fa.z -= dz * k;
        fb.x += dx * k;
        fb.z += dz * k;
      }
      if (this.jugador.estado === 'muerto') continue;
      const dx = fa.x - j.x;
      const dz = fa.z - j.z;
      const min = fa.radio + j.radio;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6 || Math.abs(fa.y - j.y) > Math.max(fa.alto, j.alto)) continue;
      const d = Math.sqrt(d2);
      // El más grande empuja más.
      const kf = j.radio / (j.radio + fa.radio);
      fa.x += (dx / d) * (min - d) * kf;
      fa.z += (dz / d) * (min - d) * kf;
      j.x -= (dx / d) * (min - d) * (1 - kf);
      j.z -= (dz / d) * (min - d) * (1 - kf);
    }
  }

  private reponerFauna() {
    const pob = poblacion(this.etapa);
    for (const rol of ['presa', 'rival', 'depredador'] as const) {
      const hay = this.fauna.filter((f) => f.rol === rol && f.estado !== 'muerto').length;
      if (hay < pob[rol]) this.aparecer(rol);
    }
  }

  private actualizarComida(dt: number) {
    const j = this.jugador;
    const vivo = j.estado !== 'muerto';
    for (const c of this.comida) {
      if (c.tipo === 'carne') {
        c.t -= dt;
        if (c.t <= 0) c.activa = false;
      } else if (!c.activa) {
        c.t -= dt;
        if (c.t <= 0) c.activa = true;
        continue;
      }
      if (!c.activa || !vivo || j.cuerpo.y > 1) continue;
      if (Math.hypot(c.x - j.cuerpo.x, c.z - j.cuerpo.z) > j.cuerpo.radio + 0.55) continue;
      this.comer(c);
    }
    this.comida = this.comida.filter((c) => c.activa || c.tipo !== 'carne');
  }

  private comer(c: Comida) {
    const j = this.jugador;
    const s = this.stats;
    const ganado = c.adn * s.comida * this.modo.adn;
    this.adn += ganado;
    j.vida = Math.min(s.vidaMax, j.vida + COMIDA[c.tipo].cura * s.comida * (s.vidaMax / 100));
    c.activa = false;
    c.t = REBROTE;
    this.comidas++;
    this.efecto(c.tipo === 'carne' ? 'sangre' : 'comer', c.x, 0.4, c.z, 0.5);
    this.efecto('adn', c.x, 0.6, c.z, 0.9);
    this.numeros.push({ x: c.x, y: 1.2, z: c.z, valor: Math.max(1, Math.round(ganado)), t: 0.8, propio: false });
    this.eventos.comer?.(c.tipo);
  }

  private actualizarProyectiles(dt: number) {
    for (const pr of this.proyectiles) {
      pr.t -= dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      if (this.rejilla.cerca(pr.x, pr.z).some((b) => Math.abs(pr.x - b.x) < b.w / 2 && Math.abs(pr.z - b.z) < b.d / 2 && pr.y < b.y1)) pr.t = 0;
      for (const f of this.fauna) {
        if (pr.t <= 0 || f.estado === 'muerto') continue;
        if (Math.hypot(f.cuerpo.x - pr.x, f.cuerpo.z - pr.z) > f.cuerpo.radio + 0.35) continue;
        pr.t = 0;
        this.danarFauna(f, pr.dano);
        this.efecto('veneno', pr.x, pr.y, pr.z, 0.5);
      }
    }
    this.proyectiles = this.proyectiles.filter((p) => p.t > 0);
  }

  private actualizarEfectos(dt: number) {
    for (const e of this.efectos) e.t -= dt;
    this.efectos = this.efectos.filter((e) => e.t > 0);
    for (const n of this.numeros) n.t -= dt;
    this.numeros = this.numeros.filter((n) => n.t > 0);
  }

  /* ---------- Final de la etapa ---------- */

  resumen(evoluciona: boolean): Resumen {
    return { etapa: this.etapa, forma: this.nombreForma, adn: Math.round(this.adn), presas: this.presas, comidas: this.comidas, tiempo: Math.round(this.tiempo), evoluciona };
  }

  private evolucionar() {
    this.fase = 'evolucion';
    this.ofertas = sortearMutaciones(this.mutaciones, this.rng);
    this.eventos.evolucion?.(this.resumen(true));
  }

  private terminar() {
    this.fase = 'fin';
    this.eventos.fin?.(this.resumen(false));
  }

  /** Mutaciones tras elegir la oferta `i` (o las mismas si no quedan ofertas). */
  elegirMutacion(i: number): Mutaciones {
    const id = this.ofertas[i];
    if (id) this.mutaciones = aplicarMutacion(this.mutaciones, id);
    this.ofertas = [];
    return this.mutaciones;
  }

  /** ¿Puede morder ya? (para el HUD). */
  get puedeMorder() {
    return this.jugador.estado === 'libre' && this.jugador.recargaMordisco <= 0;
  }
}
