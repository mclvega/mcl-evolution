import './styles.css';

import { app } from './app';
import { audio } from './audio';
import { MODOS } from './core/difficulty';
import { RASGOS, type Rol } from './core/especies';
import { formaDeEtapa } from './core/formas';
import { Entrada } from './core/input';
import { iniciarBucle } from './core/loop';
import { mutacionPorId, MUTACIONES, nivelMutacion } from './core/mutaciones';
import { iniciarPantallaCompleta } from './fullscreen';
import { controlesVacios, Partida, type Resumen } from './game/logica';
import type { Render3D } from './game/render3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { anotarEtapa, anotarRecord, avanceNuevo, limpiarNombre } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
const controles = document.getElementById('controles')!;
// Teclado, mando y, en el móvil, joystick flotante a la izquierda y botones con iconos a la derecha.
const entrada = new Entrada(
  [
    { nombre: 'morder', teclas: [], mando: 2, etiqueta: '🦷' },
    { nombre: 'saltar', teclas: ['Space'], mando: 0, etiqueta: '⤴' },
    { nombre: 'correr', teclas: ['ShiftLeft', 'ShiftRight'], mando: 1, etiqueta: '💨' },
    { nombre: 'rugido', teclas: ['KeyQ'], mando: 3, etiqueta: '📢' },
    { nombre: 'escupir', teclas: ['KeyE'], mando: 5, etiqueta: '💦' },
    { nombre: 'pausa', teclas: [], mando: 9, etiqueta: '⏸' },
  ],
  controles,
);
const tactil = matchMedia('(pointer: coarse)').matches || (import.meta.env.DEV && location.search.includes('tactil'));
if (tactil) document.body.classList.add('tactil');

let partida: Partida | null = null;
let render: Render3D | null = null;
let modulo3d: Promise<typeof import('./game/render3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/render3d'));

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta, 'landscape');
app.aplicarConfig();

/* ---------- Tamaño ---------- */

const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());
let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

/* ---------- Cámara y mordisco con el ratón ---------- */

let giroX = 0;
let giroY = 0;
let mordiscoPendiente = false;
const sensibilidad = () => app.g.config.sensibilidad / 5;

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== lienzo3d) return;
  giroX += e.movementX * 0.0025 * sensibilidad();
  giroY += e.movementY * 0.0025 * sensibilidad();
});
lienzo3d.addEventListener('mousedown', (e) => {
  if (!partida || tactil) return;
  if (document.pointerLockElement !== lienzo3d) {
    void lienzo3d.requestPointerLock();
    return;
  }
  if (e.button === 0) mordiscoPendiente = true;
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== lienzo3d && partida?.fase === 'juego' && !partida.pausada && !tactil && document.body.classList.contains('jugando')) pausar();
});

// Táctil: arrastrar en la pantalla mueve la cámara.
const GIRO_TACTIL = 0.006;
const zonaMirar = h('div', { class: 'zona-mirar' });
controles.prepend(zonaMirar);
let toque = { id: -1, x: 0, y: 0 };
zonaMirar.addEventListener('pointerdown', (e) => {
  if (toque.id !== -1) return;
  zonaMirar.setPointerCapture(e.pointerId);
  toque = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
zonaMirar.addEventListener('pointermove', (e) => {
  if (e.pointerId !== toque.id) return;
  giroX += (e.clientX - toque.x) * GIRO_TACTIL * sensibilidad();
  giroY += (e.clientY - toque.y) * GIRO_TACTIL * sensibilidad();
  toque.x = e.clientX;
  toque.y = e.clientY;
});
const soltarToque = (e: PointerEvent) => e.pointerId === toque.id && (toque.id = -1);
zonaMirar.addEventListener('pointerup', soltarToque);
zonaMirar.addEventListener('pointercancel', soltarToque);

document.body.append(h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));

const vibrar = (ms: number) => app.g.config.vibracion && navigator.vibrate?.(ms);

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
  if (!si) {
    entrada.limpiar();
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!tactil) void lienzo3d.requestPointerLock?.();
}

const AYUDA = tactil
  ? 'Arrastra en la mitad izquierda para moverte y en la derecha para la cámara. 🦷 morder, ⤴ saltar, y 💨 correr (mantenido). 📢 rugido y 💦 escupitajo aparecen cuando tienes esas mutaciones. Come pasando por encima de la comida y de la carne. Llena la barra de ADN, vence al Alfa y evoluciona.'
  : 'WASD para moverte y ratón para la cámara. Clic: morder. Espacio: saltar. Mayús: correr. Q: rugido y E: escupitajo (si tienes esas mutaciones). Come pasando por encima de la comida y de la carne. Llena la barra de ADN, vence al Alfa y evoluciona.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🧬 McL Evolution' }),
      h('p', { class: 'texto-suave', text: 'Empiezas como un gusano diminuto. Come, caza, vence al Alfa de cada región y evoluciona a formas cada vez más grandes. La evolución no tiene final.' }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  partida = null;
  const a = app.g.avance;
  const etapa = a?.etapa ?? 1;
  const f = formaDeEtapa(etapa);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🧬 McL Evolution' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · ${f.forma.icono} ${f.nombre} · Mejor: etapa ${Math.max(1, app.g.estadisticas.etapaMax)}` }),
      boton(a ? `Continuar: etapa ${etapa} (${f.forma.icono} ${f.nombre})` : 'Jugar', empezar, { variante: 'primario', icono: '▶' }),
      a ? boton('Nuevo linaje', () => {
        if (!confirm('Tu linaje actual se queda en los récords y empiezas de nuevo como gusano en otro mundo. ¿Seguro?')) return;
        anotarRecord(app.g, a, app.nombre());
        app.g.avance = null;
        app.guardar();
        menu();
      }, { icono: '🥚', variante: 'suave' }) : null,
      boton(`Dificultad: ${MODOS[app.g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Criatura', () => void import('./ui/criatura').then((m) => m.pantallaCriatura(menu)), { icono: '🧬' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: AYUDA }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

function records() {
  const e = app.g.estadisticas;
  const dato = (t: string, v: string | number) => h('div', { class: 'fila-mejora' }, h('span', { text: t }), h('strong', { text: String(v) }));
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => {
        const f = formaDeEtapa(r.etapa);
        return h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `Etapa ${r.etapa} ${f.forma.icono} · ${r.presas} presas · 🧬 ${r.adn}` }));
      })
    : [h('p', { class: 'texto-suave', text: 'Aún no hay récords. ¡Empieza a evolucionar!' })];
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '🏆 Récords' }),
      dato('Etapa más alta', Math.max(1, e.etapaMax)),
      dato('Evoluciones', e.evoluciones),
      dato('Alfas vencidos', e.alfas),
      dato('Presas cazadas', e.presas),
      dato('ADN reunido en total', e.adnTotal),
      dato('Linajes', e.linajes),
      dato('Caídas', e.caidas),
      h('h2', { text: 'Mejores linajes' }),
      ...filas,
      boton('Volver', menu, { icono: '←' }),
    ),
  );
}

/* ---------- Etapa ---------- */

let marcaDano = 0;
let marcaEvolucion = 0;
let resumenFinal: Resumen | null = null;
let faseMostrada = '';
/** El linaje que acaba de extinguirse entró en la tabla de récords. */
let recordFinal = false;

async function empezar() {
  audio.iniciar();
  const mod = await cargar3d();
  if (!app.g.avance) {
    app.g.avance = avanceNuevo();
    app.g.estadisticas.linajes++;
    app.guardar();
  }
  const a = app.g.avance;
  resumenFinal = null;
  faseMostrada = '';
  const p = new Partida({
    etapa: a.etapa,
    semilla: a.semilla,
    x: a.x,
    z: a.z,
    mutaciones: a.mutaciones,
    modo: MODOS[app.g.config.dificultad],
    eventos: {
      mordisco: (acierto) => audio.efecto(acierto ? 'golpe' : 'boton', acierto ? 1 : 0.5),
      dano: () => {
        marcaDano = 0.6;
        audio.efecto('dano');
        vibrar(40);
      },
      comer: (tipo) => audio.efecto('recoger', tipo === 'carne' ? 1 : 0.6),
      caza: (rol) => audio.efecto(rol === 'alfa' ? 'explosion' : 'muerte'),
      alfa: () => {
        audio.efecto('explosion');
        vibrar(80);
      },
      rugido: () => audio.efecto('explosion', 0.7),
      escupir: () => audio.efecto('disparo'),
      salto: () => audio.efecto('boton', 0.4),
      evolucion: (r) => {
        resumenFinal = r;
        marcaEvolucion = 1;
        audio.efecto('nivel');
        vibrar(120);
        anotarEtapa(app.g, r, p.mutaciones, app.nombre(), { x: p.jugador.cuerpo.x, z: p.jugador.cuerpo.z });
        app.guardar();
      },
      fin: (r) => {
        resumenFinal = r;
        audio.efecto('muerte');
        recordFinal = anotarEtapa(app.g, r, p.mutaciones, app.nombre());
        app.guardar();
      },
    },
  });
  partida = p;
  // Los botones de las mutaciones activas solo se ven si las tienes.
  controles.querySelector("[aria-label='rugido']")?.classList.toggle('oculto', !p.stats.rugido);
  controles.querySelector("[aria-label='escupir']")?.classList.toggle('oculto', !p.stats.escupitajo);
  if (import.meta.env.DEV) (window as unknown as { __partida: Partida }).__partida = p;
  if (!render) render = new mod.Render3D(lienzo3d);
  ajustar();
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  const p = partida;
  if (!p || p.fase !== 'juego' || p.pausada) return;
  p.pausada = true;
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `Etapa ${p.etapa} · ${p.bioma.nombre} · Zona ${p.zona + 1} · ${p.forma.icono} ${p.nombreForma} · 🧬 ${Math.floor(p.adn)}/${p.meta} · 🍖 ${p.presas}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Mis mutaciones', () => misMutaciones(pausar2), { icono: '🧪' }),
      boton('Configuración', () => configuracion(pausar2, true), { icono: '⚙️' }),
      boton('Salir', () => {
        if (!confirm('Perderás el ADN de esta etapa (tu forma, tus mutaciones y tu sitio en el mundo se guardan). ¿Seguro?')) return;
        if (app.g.avance) {
          app.g.avance.x = p.jugador.cuerpo.x;
          app.g.avance.z = p.jugador.cuerpo.z;
          app.guardar();
        }
        menu();
      }, { icono: '🚪' }),
    ),
  );
}

function pausar2() {
  if (!partida) return menu();
  partida.pausada = false;
  pausar();
}

function continuar() {
  if (!partida) return;
  partida.pausada = false;
  mostrarPanel(null);
  jugando(true);
}

function misMutaciones(volver: () => void) {
  const m = partida?.mutaciones ?? app.g.avance?.mutaciones ?? {};
  const tomadas = MUTACIONES.filter((d) => nivelMutacion(m, d.id) > 0);
  const lista = tomadas.length
    ? tomadas.map((d) => h('div', { class: 'mutacion' }, h('strong', { text: `${d.icono} ${d.nombre}${d.max > 1 ? ` (${nivelMutacion(m, d.id)}/${d.max})` : ''}` }), h('small', { text: d.texto })))
    : [h('p', { class: 'texto-suave', text: 'Aún no tienes mutaciones. Cada vez que vences a un Alfa y evolucionas podrás elegir una.' })];
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', volver, { icono: '←' }), h('h2', { text: '🧪 Mis mutaciones' })),
      ...lista,
    ),
  );
}

const minutos = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Tras elegir la mutación: la criatura evoluciona en el mismo sitio del mundo y se sigue jugando. */
function seguirEvolucion(p: Partida) {
  p.continuarEvolucion();
  controles.querySelector("[aria-label='rugido']")?.classList.toggle('oculto', !p.stats.rugido);
  controles.querySelector("[aria-label='escupir']")?.classList.toggle('oculto', !p.stats.escupitajo);
  faseMostrada = '';
  resumenFinal = null;
  mostrarPanel(null);
  jugando(true);
}

/** Pantallas al terminar la etapa: evolución (elegir mutación) o caída. */
function pantallaFase(p: Partida) {
  jugando(false);
  const r = resumenFinal;
  if (!r) return;
  const datos = `${r.forma} · ${r.presas} presas · ${r.comidas} bocados · 🧬 ${r.adn} · ${minutos(r.tiempo)}`;
  if (p.fase === 'evolucion' && p.ofertas.length) {
    const sig = formaDeEtapa(p.etapa + 1);
    mostrarPanel(
      h('div', { class: 'tarjeta ancha' },
        h('h2', { text: '🧬 ¡Evolución!' }),
        h('p', { class: 'texto-suave', text: `${datos}. Te convertirás en ${sig.forma.icono} ${sig.nombre}. Elige una mutación:` }),
        ...p.ofertas.map((id, i) => {
          const d = mutacionPorId(id);
          const n = nivelMutacion(p.mutaciones, id);
          const b = h('button', { type: 'button', class: 'btn btn-secundario oferta' },
            h('strong', { text: `${d.icono} ${d.nombre}${d.max > 1 ? ` · nivel ${n + 1}/${d.max}` : ''}` }),
            h('small', { text: d.activa ? `Activa: ${tactil ? d.icono : id === 'rugido' ? 'Q' : 'E'}` : 'Pasiva' }),
            h('span', { text: d.texto }),
          );
          b.addEventListener('click', () => {
            audio.efecto('recoger');
            const m = p.elegirMutacion(i);
            if (app.g.avance) app.g.avance.mutaciones = { ...m };
            app.guardar();
            seguirEvolucion(p);
          });
          return b;
        }),
      ),
    );
    return;
  }
  if (p.fase === 'evolucion') {
    // Sin mutaciones que ofrecer (todas al máximo): se evoluciona directamente.
    const sig = formaDeEtapa(p.etapa + 1);
    mostrarPanel(
      h('div', { class: 'tarjeta' },
        h('h2', { text: `${sig.forma.icono} ¡Evolucionas a ${sig.nombre}!` }),
        h('p', { class: 'texto-suave', text: `Etapa ${p.etapa} superada. ${datos}. Ya tienes todas las mutaciones al máximo.` }),
        boton('Seguir', () => seguirEvolucion(p), { variante: 'primario', icono: '▶' }),
      ),
    );
    return;
  }
  if (p.fase === 'fin') {
    mostrarPanel(
      h('div', { class: 'tarjeta' },
        h('h2', { text: '💀 Tu linaje se extingue' }),
        h('p', { class: 'texto-suave', text: `Llegaste a la etapa ${r.etapa} · ${datos}.` }),
        h('p', { class: 'texto-suave', text: recordFinal ? '🏆 ¡Entra en tus mejores linajes!' : 'Vuelves a empezar como gusano en un mundo nuevo.' }),
        boton('Empezar de nuevo', empezar, { variante: 'primario', icono: '🥚' }),
        boton('Menú', menu, { icono: '🏠' }),
      ),
    );
  }
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || (e.code === 'Escape' && tactil)) pausar();
});
document.addEventListener('visibilitychange', () => document.hidden && pausar());

/* ---------- HUD ---------- */

const ICONO_ROL: Record<Rol, string> = { presa: '🍖', rival: '⚔️', depredador: '⚠️', alfa: '👑' };

/** Márgenes del área segura (muesca del móvil): un elemento oculto con padding env(safe-area-inset-*). */
const seguro = { izq: 0, arriba: 0 };
const sonda = h('div', { style: 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top)' });
document.body.append(sonda);
function medirSeguro() {
  const css = getComputedStyle(sonda);
  seguro.izq = parseFloat(css.paddingLeft) || 0;
  seguro.arriba = parseFloat(css.paddingTop) || 0;
}
medirSeguro();
addEventListener('resize', medirSeguro);

const sombra = (texto: string, x: number, y: number, color = '#fff') => {
  ctx.fillStyle = '#000a';
  ctx.fillText(texto, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y);
};

function barra(x: number, y: number, w: number, hh: number, valor: number, color: string, fondo = '#000a') {
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, hh);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, Math.max(0, valor))), hh - 2);
}

function recarga(x: number, y: number, icono: string, falta: number, total: number, tecla: string) {
  const listo = falta <= 0;
  ctx.fillStyle = '#000a';
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  if (!listo && total > 0) {
    ctx.fillStyle = '#ffffff33';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - falta / total));
    ctx.fill();
  }
  ctx.strokeStyle = listo ? '#7aff5a' : '#fff5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.globalAlpha = listo ? 1 : 0.5;
  sombra(icono, x, y + 1);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 10px system-ui, sans-serif';
  if (tecla) sombra(tecla, x + 13, y + 14, '#ddd');
}

/** Flecha en el borde de la pantalla hacia un punto del mundo. */
function flechaBorde(px: number, py: number, color: string, icono?: string) {
  const cx = ancho / 2;
  const cy = alto / 2;
  const ang = Math.atan2(py - cy, px - cx);
  const r = Math.min(ancho, alto) * 0.42;
  const ax = cx + Math.cos(ang) * r;
  const ay = cy + Math.sin(ang) * r;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(ang) * 14, ay + Math.sin(ang) * 14);
  ctx.lineTo(ax + Math.cos(ang + 2.4) * 11, ay + Math.sin(ang + 2.4) * 11);
  ctx.lineTo(ax + Math.cos(ang - 2.4) * 11, ay + Math.sin(ang - 2.4) * 11);
  ctx.fill();
  if (icono) {
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    sombra(icono, ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16);
  }
}

/** Punto proyectado; si queda detrás de la cámara, se refleja para que la flecha apunte bien. */
function aPantalla(x: number, y: number, z: number) {
  const pt = render!.proyectar(x, y, z, ancho, alto);
  if (pt.detras) {
    pt.x = ancho - pt.x;
    pt.y = alto - pt.y;
  }
  return pt;
}

function dibujarHud(p: Partida, dt: number) {
  ctx.clearRect(0, 0, ancho, alto);
  ctx.textBaseline = 'middle';
  marcaDano = Math.max(0, marcaDano - dt);
  marcaEvolucion = Math.max(0, marcaEvolucion - dt * 0.6);
  const j = p.jugador;
  const s = p.stats;
  const cx = ancho / 2;

  if (marcaDano > 0 || j.vida < s.vidaMax * 0.25) {
    const g = ctx.createRadialGradient(cx, alto / 2, Math.min(ancho, alto) * 0.3, cx, alto / 2, Math.max(ancho, alto) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${Math.max(marcaDano * 0.6, j.vida < s.vidaMax * 0.25 ? 0.3 : 0)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }
  if (marcaEvolucion > 0) {
    ctx.fillStyle = `rgba(120,255,160,${marcaEvolucion * 0.35})`;
    ctx.fillRect(0, 0, ancho, alto);
  }

  if (render) {
    // Barras y avisos sobre la fauna.
    for (const f of p.fauna) {
      if (f.estado === 'muerto') continue;
      const pt = render.proyectar(f.cuerpo.x, f.cuerpo.y + f.cuerpo.alto + 0.35, f.cuerpo.z, ancho, alto);
      const amenaza = f.estado === 'aviso' || f.estado === 'carga';
      if (!pt.visible) {
        if (amenaza || f.rol === 'alfa') {
          const q = aPantalla(f.cuerpo.x, f.cuerpo.y + 1, f.cuerpo.z);
          flechaBorde(q.x, q.y, f.ataque === 'mordisco' && f.rol !== 'alfa' ? '#ffd23f' : '#ff3030', f.rol === 'alfa' ? '👑' : undefined);
        }
        continue;
      }
      if (f.rol === 'alfa') continue;
      // Vida siempre visible sobre cada animal cercano, con el icono de su papel o de su rasgo.
      if (p.distancia(f) < 30) {
        const w = 44 * Math.min(1.6, Math.max(0.8, f.escala));
        const color = f.rol === 'presa' ? '#7aff5a' : f.rol === 'depredador' ? '#ff5a3a' : '#ffd23f';
        ctx.fillStyle = '#000c';
        ctx.fillRect(pt.x - w / 2 - 1, pt.y - 1, w + 2, 8);
        barra(pt.x - w / 2, pt.y, w, 6, f.vida / f.vidaMax, color, '#333c');
        const icono = RASGOS[f.rasgo].icono || ICONO_ROL[f.rol];
        ctx.textAlign = 'right';
        ctx.font = '12px system-ui, sans-serif';
        sombra(icono, pt.x - w / 2 - 3, pt.y + 3);
      }
      ctx.textAlign = 'center';
      if (amenaza) {
        ctx.font = 'bold 18px system-ui, sans-serif';
        sombra('!', pt.x, pt.y - 12, f.ataque === 'mordisco' ? '#ffd23f' : '#ff3030');
      }
    }
    ctx.textAlign = 'center';
    for (const n of p.numeros) {
      const pt = render.proyectar(n.x, n.y + (0.8 - n.t) * 0.8, n.z, ancho, alto);
      if (!pt.visible) continue;
      ctx.font = `bold ${n.propio ? 17 : 15}px system-ui, sans-serif`;
      sombra(String(n.valor), pt.x, pt.y, n.propio ? '#ff6a6a' : '#fff');
    }
    // Olfato: la comida y la presa más cercanas, en el borde.
    if (s.olfato) {
      let comida: { x: number; z: number } | null = null;
      let mejor = Infinity;
      for (const c of p.comida) {
        if (!c.activa) continue;
        const d = Math.hypot(c.x - j.cuerpo.x, c.z - j.cuerpo.z);
        if (d < mejor && d > 2) {
          mejor = d;
          comida = c;
        }
      }
      if (comida) {
        const q = aPantalla(comida.x, 0.3, comida.z);
        if (!render.proyectar(comida.x, 0.3, comida.z, ancho, alto).visible) flechaBorde(q.x, q.y, '#7aff5a', '🍃');
      }
      const presa = p.fauna.filter((f) => f.rol === 'presa' && f.estado !== 'muerto').sort((a, b) => p.distancia(a) - p.distancia(b))[0];
      if (presa) {
        const q = aPantalla(presa.cuerpo.x, presa.cuerpo.y + 0.5, presa.cuerpo.z);
        if (!render.proyectar(presa.cuerpo.x, presa.cuerpo.y + 0.5, presa.cuerpo.z, ancho, alto).visible) flechaBorde(q.x, q.y, '#a0ff7a', '🍖');
      }
    }
  }

  // Panel de vida, evolución (ADN) y aguante, arriba a la izquierda y dentro del área segura del móvil.
  const bx = 12 + seguro.izq;
  const by = 10 + seguro.arriba;
  const bw = Math.min(tactil ? 240 : 280, ancho * 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx - 6, by - 6, bw + 12, 66);
  ctx.strokeStyle = '#ffffff40';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 6, by - 6, bw + 12, 66);
  ctx.textAlign = 'left';
  barra(bx, by, bw, 20, j.vida / s.vidaMax, j.veneno > 0 ? '#9ad13c' : j.vida > s.vidaMax * 0.3 ? '#5ad13c' : '#ff5a5a', '#401818');
  ctx.font = 'bold 13px system-ui, sans-serif';
  sombra(`❤️ Vida ${Math.ceil(j.vida)}/${s.vidaMax}${j.veneno > 0 ? ' 🧪' : ''}`, bx + 6, by + 10);
  const lleno = p.adn >= p.meta;
  const parpadeo = lleno && p.tiempo % 0.8 < 0.4;
  barra(bx, by + 24, bw, 18, p.adn / p.meta, parpadeo ? '#b0f0ff' : lleno ? '#4ad1ff' : '#a07aff', '#241a40');
  sombra(lleno ? '🧬 ¡Evolución lista! Vence al Alfa' : `🧬 Evolución ${Math.floor((p.adn / p.meta) * 100)} %  ·  ADN ${Math.floor(p.adn)}/${p.meta}`, bx + 6, by + 33);
  barra(bx, by + 46, bw, 8, j.aguante / s.aguanteMax, j.agotado ? '#ff8a3a' : '#ffd23f', '#3a3010');

  // Mutaciones activas.
  let rx = bx + 18;
  const ry = by + 84;
  if (s.rugido) {
    recarga(rx, ry, '📢', j.recargaRugido, s.rugido, tactil ? '' : 'Q');
    rx += 42;
  }
  if (s.escupitajo) recarga(rx, ry, '💦', j.recargaEscupir, s.escupitajo, tactil ? '' : 'E');

  // Etapa y región (arriba en el centro), y barra del Alfa.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  sombra(`Etapa ${p.etapa} · ${p.bioma.icono} ${p.bioma.nombre} · Zona ${p.zona + 1} · ${p.forma.icono} ${p.nombreForma}`, cx, 20);
  const alfa = p.alfa && p.alfa.estado !== 'muerto' ? p.alfa : null;
  if (alfa) {
    const w = Math.min(420, ancho * 0.5);
    ctx.font = 'bold 13px system-ui, sans-serif';
    sombra(`👑 Alfa de la región${alfa.fase2 ? ' · ¡enfurecido!' : ''}`, cx, 42, '#ffd23f');
    barra(cx - w / 2, 52, w, 11, alfa.vida / alfa.vidaMax, '#c62828');
  }
  // Presas (arriba a la derecha, junto a la pausa).
  ctx.textAlign = 'right';
  ctx.font = 'bold 14px system-ui, sans-serif';
  sombra(`🍖 ${p.presas}`, ancho - 66, 26);

  ctx.textAlign = 'center';
  if (p.mensajeT > 0) {
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.globalAlpha = Math.min(1, p.mensajeT * 2);
    sombra(p.mensaje, cx, alto * 0.28, '#ffd23f');
    ctx.globalAlpha = 1;
  }
  if (j.agotado && j.moviendose) {
    ctx.font = '12px system-ui, sans-serif';
    sombra('Sin aliento: espera para volver a correr', cx, alto - (tactil ? 18 : 24), '#ffb070');
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/* ---------- Bucle ---------- */

let fps = 60;
let ultimo = performance.now();
iniciarBucle(
  (dt) => rend.medir('logica', () => {
    entrada.actualizar();
    const p = partida;
    if (!p) return;
    if (p.fase !== 'juego') {
      // Al terminar la etapa se muestran sus pantallas.
      const clave = `${p.fase}`;
      if (clave !== faseMostrada) {
        faseMostrada = clave;
        pantallaFase(p);
      }
      giroX = giroY = 0;
      return;
    }
    if (p.pausada) {
      giroX = giroY = 0;
      return;
    }
    if (entrada.pulsado('pausa')) return pausar();
    const c = controlesVacios();
    c.x = entrada.x;
    c.z = entrada.y;
    c.giroX = giroX;
    c.giroY = giroY;
    giroX = giroY = 0;
    c.morder = mordiscoPendiente || entrada.pulsado('morder');
    mordiscoPendiente = false;
    c.saltar = entrada.pulsado('saltar');
    c.correr = entrada.activo('correr');
    c.rugido = entrada.pulsado('rugido');
    c.escupir = entrada.pulsado('escupir');
    p.autoFijar = app.g.config.objetivoAuto;
    p.actualizar(dt, c);
  }),
  (alfa) => {
    const ahora = performance.now();
    const quieto = !partida || partida.pausada || partida.fase !== 'juego';
    if (!rend.debeDibujar(ahora, quieto)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (partida && render) {
      render.sombras(tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => render!.dibujar(partida!, app.g.aspecto, app.g.config.tema === 'oscuro', !app.g.config.animacionesReducidas, dt, quieto ? 1 : alfa));
      dibujarHud(partida, dt);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(render?.renderer ?? null);
  },
);

if (import.meta.env.DEV && location.search.includes('demo')) {
  // Pruebas: ?demo&etapa=8 empieza directamente en esa etapa (sin guardar).
  const etapa = Number(new URLSearchParams(location.search).get('etapa'));
  if (etapa > 0) app.g.avance = { ...avanceNuevo(), etapa, x: Number(new URLSearchParams(location.search).get('x')) || 0 };
  void empezar().then(() => {
    if (partida && location.search.includes('alfa')) partida.adn = partida.meta;
  });
} else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));
