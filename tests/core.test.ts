import { describe, expect, it } from 'vitest';
import { BIOMAS, biomaDe } from '../src/core/biomas';
import { enArco, yawHacia } from '../src/core/combate';
import { DIFICULTADES, escalaEtapa, MODOS } from '../src/core/difficulty';
import { formaDeRol, poblacion, RASGOS, ROLES, sortearRasgo } from '../src/core/especies';
import { FORMAS, formaDeEtapa, formaRelativa } from '../src/core/formas';
import { PASO } from '../src/core/loop';
import { aplicarMutacion, MUTACIONES, sortearMutaciones, statsJugador } from '../src/core/mutaciones';
import { biomaEn, generarTrozo, metaAdn, nivelZona, TIPOS_COMIDA, TROZO } from '../src/core/mundo';
import { crearRng } from '../src/core/rng';
import { ASPECTO_POR_DEFECTO, aspectoAleatorio, normalizarAspecto } from '../src/game/aspecto';
import { controlesVacios, Partida, type Controles } from '../src/game/logica';
import { configPorDefecto, normalizarConfig } from '../src/settings';
import { anotarEtapa, avanceNuevo, guardadoNuevo, limpiarNombre, normalizarGuardado } from '../src/storage';

const normal = MODOS.normal;
const nueva = (etapa = 1, semilla = 7, mutaciones = {}) => new Partida({ etapa, semilla, mutaciones, modo: normal });

function simular(p: Partida, segundos: number, c: Partial<Controles> = {}) {
  for (let t = 0; t < segundos; t += PASO) p.actualizar(PASO, { ...controlesVacios(), ...c });
}

describe('combate', () => {
  it('arco del mordisco y orientación', () => {
    expect(yawHacia(0, 0, 0, -5)).toBeCloseTo(0);
    expect(enArco(0, 0, 0, 0, -1, 0.4, 1.2, 1.7)).toBe(true);
    expect(enArco(0, 0, 0, 0, 1, 0.4, 1.2, 1.7)).toBe(false);
    expect(enArco(0, 0, 0, 0, -3, 0.4, 1.2, 1.7)).toBe(false);
  });
});

describe('formas y biomas', () => {
  it('las formas se repiten como «Forma +N» sin final', () => {
    expect(formaDeEtapa(1).forma.id).toBe('gusano');
    expect(formaDeEtapa(10).forma.id).toBe('dragon');
    const vuelta = formaDeEtapa(11);
    expect(vuelta.forma.id).toBe('gusano');
    expect(vuelta.ciclo).toBe(1);
    expect(vuelta.nombre).toBe('Gusano +1');
    expect(formaDeEtapa(25).ciclo).toBe(2);
  });

  it('las formas relativas no se salen de la lista', () => {
    expect(formaRelativa(1, -2).id).toBe('gusano');
    expect(formaRelativa(10, 2).id).toBe('dragon');
    expect(formaRelativa(3, 1).id).toBe(FORMAS[3].id);
  });

  it('los biomas van en ciclo', () => {
    expect(biomaDe(1)).toBe(BIOMAS[0]);
    expect(biomaDe(BIOMAS.length + 1)).toBe(BIOMAS[0]);
  });

  it('presas pequeñas y depredadores grandes', () => {
    const rng = crearRng(1);
    expect(ROLES.presa.escala).toBeLessThan(ROLES.rival.escala);
    expect(ROLES.depredador.escala).toBeGreaterThan(ROLES.rival.escala);
    const i = FORMAS.findIndex((f) => f.id === formaDeRol(5, 'depredador', rng));
    expect(i).toBeGreaterThan(4 - 1);
  });
});

describe('variedad', () => {
  it('hay formas distintas por papel desde la etapa 1', () => {
    const rng = crearRng(9);
    const presas = new Set(Array.from({ length: 60 }, () => formaDeRol(1, 'presa', rng)));
    const depredadores = new Set(Array.from({ length: 60 }, () => formaDeRol(1, 'depredador', rng)));
    expect(presas.size).toBeGreaterThan(1);
    expect(depredadores.size).toBeGreaterThan(2);
  });

  it('los rasgos cambian al animal y la manada es solo de depredadores', () => {
    expect(RASGOS.acorazado.vida).toBeGreaterThan(1);
    expect(RASGOS.veloz.velocidad).toBeGreaterThan(1);
    const rng = crearRng(4);
    const dePresa = new Set(Array.from({ length: 300 }, () => sortearRasgo(20, 'presa', rng)));
    expect(dePresa.has('manada')).toBe(false);
    expect(dePresa.size).toBeGreaterThan(2);
    expect(sortearRasgo(20, 'alfa', rng)).toBe('normal');
  });

  it('el mundo tiene comida variada', () => {
    const tipos = new Set<string>();
    for (let i = -12; i <= 12; i++) for (let k = -12; k <= 12; k++) for (const c of generarTrozo(i, k, 11).comida) tipos.add(c.tipo);
    for (const t of TIPOS_COMIDA) expect(tipos.has(t)).toBe(true);
  });

  it('un mordisco venenoso envenena al jugador', () => {
    const p = nueva(3);
    const vida = p.jugador.vida;
    p.envenenarJugador(10);
    simular(p, 1);
    expect(p.jugador.veneno).toBeGreaterThan(0);
    expect(p.jugador.vida).toBeLessThan(vida);
  });
});

describe('dificultad', () => {
  it('cuatro modos con nombre', () => {
    expect(DIFICULTADES).toEqual(['muyFacil', 'facil', 'normal', 'desafio']);
    expect(DIFICULTADES.map((d) => MODOS[d].nombre)).toEqual(['Muy fácil', 'Fácil', 'Normal', 'Desafío']);
    expect(MODOS.muyFacil.dano).toBeLessThan(MODOS.desafio.dano);
  });

  it('la escala crece sin límite con la etapa', () => {
    expect(escalaEtapa(1)).toEqual({ vida: 1, dano: 1, meta: 1 });
    expect(escalaEtapa(50).vida).toBeGreaterThan(escalaEtapa(10).vida);
    expect(metaAdn(20)).toBeGreaterThan(metaAdn(1));
    expect(poblacion(100).presa).toBeLessThanOrEqual(12);
  });
});

describe('mundo infinito', () => {
  it('cada trozo es determinista y el del origen deja libre el centro', () => {
    const a = generarTrozo(0, 0, 42);
    expect(generarTrozo(0, 0, 42)).toEqual(a);
    expect(generarTrozo(5, -3, 42).bloques).not.toEqual(generarTrozo(5, -3, 43).bloques);
    for (const bl of a.bloques) expect(Math.hypot(bl.x, bl.z)).toBeGreaterThan(5);
    const t = generarTrozo(7, 2, 42);
    for (const bl of t.bloques) {
      expect(bl.x).toBeGreaterThanOrEqual(7 * TROZO);
      expect(bl.x).toBeLessThanOrEqual(8 * TROZO);
    }
  });

  it('los biomas cambian al caminar y la zona sube con la distancia', () => {
    expect(biomaEn(0, 0, 3).id).toBe('charca');
    const biomas = new Set<string>();
    for (let x = -1500; x <= 1500; x += 75) for (let z = -1500; z <= 1500; z += 75) biomas.add(biomaEn(x, z, 3).id);
    expect(biomas.size).toBeGreaterThanOrEqual(5);
    expect(nivelZona(0, 0)).toBe(0);
    expect(nivelZona(1000, 0)).toBeGreaterThan(nivelZona(200, 0));
  });

  it('al alejarse se cargan y descargan trozos', () => {
    const p = nueva();
    const antes = new Set(p.trozos.keys());
    const version = p.version;
    p.jugador.cuerpo.x = 500;
    simular(p, PASO * 2);
    expect(p.version).toBeGreaterThan(version);
    expect(p.trozos.size).toBe(25);
    expect([...p.trozos.keys()].some((k) => antes.has(k))).toBe(false);
    expect(p.zona).toBeGreaterThan(0);
  });

  it('la comida comida sigue comida al volver', () => {
    const p = nueva();
    const c = p.comida.find((x) => x.clave)!;
    const clave = c.clave;
    p.jugador.cuerpo.x = c.x;
    p.jugador.cuerpo.z = c.z;
    simular(p, PASO * 2);
    expect(c.activa).toBe(false);
    p.jugador.cuerpo.x = 600;
    simular(p, PASO * 2);
    expect(p.comida.some((x) => x.clave === clave)).toBe(false);
    p.jugador.cuerpo.x = c.x + 5;
    simular(p, PASO * 2);
    expect(p.comida.find((x) => x.clave === clave)?.activa).toBe(false);
  });
});

describe('mutaciones', () => {
  it('suben las estadísticas y no pasan del máximo', () => {
    const base = statsJugador(1, {});
    let m = aplicarMutacion({}, 'garras');
    expect(statsJugador(1, m).mordisco).toBeGreaterThan(base.mordisco);
    for (let i = 0; i < 10; i++) m = aplicarMutacion(m, 'garras');
    expect(m.garras).toBe(3);
    expect(base.rugido).toBe(0);
    expect(statsJugador(1, aplicarMutacion({}, 'rugido')).rugido).toBeGreaterThan(0);
    expect(statsJugador(1, aplicarMutacion({}, 'caparazon')).armadura).toBeLessThan(1);
  });

  it('el sorteo da mutaciones distintas que aún se pueden subir', () => {
    const rng = crearRng(3);
    const ofertas = sortearMutaciones({ olfato: 1 }, rng);
    expect(ofertas).toHaveLength(3);
    expect(new Set(ofertas).size).toBe(3);
    expect(ofertas).not.toContain('olfato');
    const todas = Object.fromEntries(MUTACIONES.map((d) => [d.id, d.max]));
    expect(sortearMutaciones(todas, rng)).toEqual([]);
  });

  it('el jugador se hace más fuerte con la etapa', () => {
    expect(statsJugador(12, {}).vidaMax).toBeGreaterThan(statsJugador(2, {}).vidaMax);
  });
});

describe('partida', () => {
  it('empieza con fauna, comida y la forma de la etapa', () => {
    const p = nueva(4);
    expect(p.forma.id).toBe('lagarto');
    expect(p.fauna.length).toBeGreaterThanOrEqual(Object.values(poblacion(4)).reduce((a, b) => a + b, 0));
    expect(p.comida.length).toBeGreaterThan(20);
    expect(p.jugador.vida).toBe(p.stats.vidaMax);
  });

  it('comer sube el ADN y con la barra llena aparece el Alfa', () => {
    const p = nueva();
    const c = p.comida[0];
    p.jugador.cuerpo.x = c.x;
    p.jugador.cuerpo.z = c.z;
    simular(p, PASO * 2);
    expect(p.adn).toBeGreaterThan(0);
    expect(p.comidas).toBe(1);
    expect(c.activa).toBe(false);
    expect(p.alfa).toBeNull();
    p.adn = p.meta;
    simular(p, PASO * 2);
    expect(p.alfa?.rol).toBe('alfa');
  });

  it('cazar una presa deja carne con ADN', () => {
    const p = nueva();
    const presa = p.fauna.find((f) => f.rol === 'presa')!;
    const antes = p.comida.length;
    p.danarFauna(presa, 9999);
    expect(presa.estado).toBe('muerto');
    expect(p.presas).toBe(1);
    expect(p.comida.length).toBe(antes + 1);
    expect(p.comida[p.comida.length - 1].tipo).toBe('carne');
  });

  it('el mordisco daña al animal que tiene delante', () => {
    const p = nueva();
    const presa = p.fauna.find((f) => f.rol === 'presa')!;
    presa.cuerpo.x = 0;
    presa.cuerpo.z = -0.8;
    presa.estado = 'aturdido';
    presa.t = 5;
    p.jugador.yaw = 0;
    p.actualizar(PASO, { ...controlesVacios(), morder: true });
    simular(p, 0.2);
    expect(presa.vida).toBeLessThan(presa.vidaMax);
  });

  it('vencer al Alfa lleva a la evolución y aplicar la mutación', () => {
    let evolucion = false;
    const p = new Partida({ etapa: 1, semilla: 5, mutaciones: {}, modo: normal, eventos: { evolucion: () => (evolucion = true) } });
    p.adn = p.meta;
    simular(p, PASO * 2);
    p.danarFauna(p.alfa!, 1e6);
    simular(p, 2);
    expect(p.fase).toBe('evolucion');
    expect(evolucion).toBe(true);
    expect(p.ofertas).toHaveLength(3);
    const id = p.ofertas[0];
    expect(p.elegirMutacion(0)[id]).toBe(1);
    // Evoluciona en el mismo sitio del mundo: siguiente forma, ADN a cero.
    const x = p.jugador.cuerpo.x;
    p.continuarEvolucion();
    expect(p.fase).toBe('juego');
    expect(p.etapa).toBe(2);
    expect(p.forma.id).toBe('escarabajo');
    expect(p.adn).toBe(0);
    expect(p.jugador.cuerpo.x).toBe(x);
    expect(p.jugador.vida).toBe(p.stats.vidaMax);
  });

  it('caer termina la etapa', () => {
    let fin = false;
    const p = new Partida({ etapa: 2, semilla: 5, mutaciones: {}, modo: normal, eventos: { fin: () => (fin = true) } });
    p.danarJugador(1e6, 1, 1);
    simular(p, 2);
    expect(p.fase).toBe('fin');
    expect(fin).toBe(true);
  });

  it('60 s caminando en línea recta: el mundo se genera y la fauna sigue cerca', () => {
    const p = nueva(3, 21);
    for (let t = 0; t < 60; t += PASO) {
      p.jugador.vida = p.stats.vidaMax;
      p.actualizar(PASO, { ...controlesVacios(), z: -1, correr: true });
    }
    const j = p.jugador.cuerpo;
    expect(Math.hypot(j.x, j.z)).toBeGreaterThan(250);
    expect(p.fauna.filter((f) => f.estado !== 'muerto').length).toBeGreaterThan(5);
    for (const f of p.fauna) expect(Math.hypot(f.cuerpo.x - j.x, f.cuerpo.z - j.z)).toBeLessThan(150);
  });

  it('60 s de simulación sin errores, moviéndose y mordiendo', () => {
    const p = nueva(15, 99, { rugido: 1, escupitajo: 1, embestida: 1, veneno: 1 });
    for (let t = 0; t < 60; t += PASO) {
      p.actualizar(PASO, { ...controlesVacios(), x: Math.sin(t), z: -1, correr: t % 4 < 2, morder: t % 0.5 < PASO, rugido: t % 7 < PASO, escupir: t % 3 < PASO, saltar: t % 2 < PASO, giroX: 0.002 });
      if (p.fase !== 'juego') break;
    }
    for (const f of p.fauna) {
      expect(Number.isFinite(f.cuerpo.x) && Number.isFinite(f.cuerpo.z)).toBe(true);
    }
    expect(Number.isFinite(p.jugador.vida)).toBe(true);
  });
});

describe('guardado', () => {
  it('normaliza la configuración', () => {
    expect(normalizarConfig(null)).toEqual(configPorDefecto());
    const c = normalizarConfig({ dificultad: 'imposible', volumenGeneral: 900, tema: 'claro', pantallaCompleta: 'sí' });
    expect(c.dificultad).toBe('normal');
    expect(c.volumenGeneral).toBe(100);
    expect(c.tema).toBe('claro');
    expect(c.pantallaCompleta).toBe(true);
  });

  it('normaliza el aspecto', () => {
    expect(normalizarAspecto('x')).toEqual(ASPECTO_POR_DEFECTO);
    const a = normalizarAspecto({ piel: 0x123456, patron: 'rayas', cuernos: 'alas' });
    expect(a.piel).toBe(ASPECTO_POR_DEFECTO.piel);
    expect(a.patron).toBe('rayas');
    expect(a.cuernos).toBe(ASPECTO_POR_DEFECTO.cuernos);
    const azar = aspectoAleatorio(() => 0.99);
    expect(normalizarAspecto(azar)).toEqual(azar);
  });

  it('normaliza datos dañados', () => {
    expect(normalizarGuardado('basura')).toEqual(guardadoNuevo());
    const g = normalizarGuardado({ nombre: 'Ana', avance: { etapa: -3, mutaciones: { garras: 99, inventada: 2 } }, records: [{ nombre: 1 }, { nombre: 'B', fecha: 'x', etapa: 4 }] });
    expect(g.nombre).toBe('Ana');
    expect(g.avance?.etapa).toBe(1);
    expect(g.avance?.mutaciones).toEqual({ garras: 3 });
    expect(g.records).toHaveLength(1);
    expect(limpiarNombre('  <b>  ')).toBeNull();
  });

  it('al evolucionar el linaje pasa a la siguiente etapa y se anota el récord', () => {
    const g = guardadoNuevo();
    g.avance = avanceNuevo(1000);
    const semilla = g.avance.semilla;
    anotarEtapa(g, { etapa: 1, presas: 4, adn: 130, evoluciona: true }, { garras: 1 }, 'Ana', { x: 40, z: -12 });
    expect(g.avance?.etapa).toBe(2);
    expect(g.avance?.mutaciones).toEqual({ garras: 1 });
    expect(g.avance?.semilla).toBe(semilla);
    expect(g.avance?.x).toBe(40);
    expect(g.estadisticas.etapaMax).toBe(2);
    // Al caer, el linaje se extingue: se empieza de nuevo.
    anotarEtapa(g, { etapa: 2, presas: 1, adn: 20, evoluciona: false }, { garras: 1 }, 'Ana');
    expect(g.avance).toBeNull();
    expect(g.estadisticas.caidas).toBe(1);
    expect(g.records).toHaveLength(1);
    expect(g.records[0].presas).toBe(5);
  });
});
