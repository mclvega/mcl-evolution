import * as THREE from 'three';
import { app } from '../app';
import { formaDeEtapa, FORMAS, type IdForma } from '../core/formas';
import { ASPECTO_COLORES, ASPECTO_OPCIONES, aspectoAleatorio, type Aspecto } from '../game/aspecto';
import { animarCriatura, crearCriatura, type ModeloCriatura } from '../game/criaturas';
import { liberar } from '../rendimiento';
import { boton, h, mostrarPanel } from './dom';

type ClaveOpcion = keyof typeof ASPECTO_OPCIONES;
type ClaveColor = keyof typeof ASPECTO_COLORES;

// Mismo esquema que la personalización del Arcade: opciones y paletas de color por secciones.
const SECCIONES: ({ tipo: 'opcion'; clave: ClaveOpcion; titulo: string } | { tipo: 'color'; clave: ClaveColor; titulo: string })[] = [
  { tipo: 'color', clave: 'piel', titulo: 'Color de piel' },
  { tipo: 'color', clave: 'vientre', titulo: 'Color del vientre' },
  { tipo: 'opcion', clave: 'patron', titulo: 'Dibujo del lomo' },
  { tipo: 'color', clave: 'colorPatron', titulo: 'Color del dibujo' },
  { tipo: 'opcion', clave: 'ojos', titulo: 'Ojos' },
  { tipo: 'color', clave: 'colorOjos', titulo: 'Color de los ojos' },
  { tipo: 'opcion', clave: 'cuernos', titulo: 'Cuernos' },
  { tipo: 'opcion', clave: 'cola', titulo: 'Cola' },
];

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Vista previa 3D que gira, en su propio renderer pequeño. */
function crearVista(contenedor: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(200, 240);
  contenedor.append(renderer.domElement);
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xffffff, 0x445577, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.8);
  sol.position.set(2, 4, 3);
  escena.add(sol);
  const piso = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshLambertMaterial({ color: 0x324477 }));
  piso.rotation.x = -Math.PI / 2;
  escena.add(piso);
  const camara = new THREE.PerspectiveCamera(32, 200 / 240, 0.1, 20);
  camara.position.set(0, 1.5, 4.4);
  camara.lookAt(0, 0.6, 0);
  let modelo: ModeloCriatura | null = null;
  let angulo = 0.6;
  let arrastrando = false;
  let ultimoX = 0;
  const lienzo = renderer.domElement;
  lienzo.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    ultimoX = e.clientX;
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    angulo += (e.clientX - ultimoX) * 0.02;
    ultimoX = e.clientX;
  });
  lienzo.addEventListener('pointerup', () => (arrastrando = false));
  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!arrastrando) angulo += 0.012;
    if (modelo) {
      modelo.grupo.rotation.y = angulo;
      animarCriatura(modelo, reloj.getElapsedTime(), true, 0.5);
    }
    renderer.render(escena, camara);
  });
  return {
    mostrar(forma: IdForma, aspecto: Aspecto, pinchos: number) {
      if (modelo) {
        escena.remove(modelo.grupo);
        liberar(modelo.grupo);
      }
      modelo = crearCriatura(forma, aspecto, pinchos);
      // Todas las formas caben en la vista: se escalan al tamaño de la caja que ocupan.
      const caja = new THREE.Box3().setFromObject(modelo.grupo);
      const tam = caja.getSize(new THREE.Vector3());
      modelo.grupo.scale.setScalar(1.6 / Math.max(tam.x, tam.y * 1.2, tam.z));
      escena.add(modelo.grupo);
    },
    cerrar() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      lienzo.remove();
    },
  };
}

/** Pantalla para personalizar la criatura. */
export function pantallaCriatura(alVolver: () => void) {
  const aspecto: Aspecto = { ...app.g.aspecto };
  const etapa = app.g.avance?.etapa ?? 1;
  const actual = formaDeEtapa(etapa);
  // Se puede ver en cualquier forma ya alcanzada.
  const alcanzadas = FORMAS.slice(0, Math.min(FORMAS.length, Math.max(etapa, app.g.estadisticas.etapaMax)));
  let forma: IdForma = actual.forma.id;
  const opciones = h('div', { class: 'cz-opciones' });
  const formas = h('div', { class: 'segmentado' });
  const lienzo = h('div', { class: 'cz-lienzo' });
  const vista = crearVista(lienzo);

  const pintar = () => {
    formas.replaceChildren(...alcanzadas.map((f) => {
      const b = boton(f.icono, () => {
        forma = f.id;
        pintar();
      });
      b.setAttribute('aria-label', f.nombre);
      b.setAttribute('aria-pressed', String(forma === f.id));
      return b;
    }));
    opciones.replaceChildren(
      ...SECCIONES.filter((s) => s.clave !== 'colorPatron' || aspecto.patron !== 'liso').map((s) => {
        if (s.tipo === 'opcion') {
          const lista = ASPECTO_OPCIONES[s.clave] as readonly { id: string; nombre: string }[];
          return h('div', { class: 'cz-seccion' }, h('b', { text: s.titulo }),
            h('div', { class: 'segmentado' }, ...lista.map((o) => {
              const b = boton(o.nombre, () => {
                (aspecto as unknown as Record<string, string>)[s.clave] = o.id;
                pintar();
              });
              b.setAttribute('aria-pressed', String(aspecto[s.clave] === o.id));
              return b;
            })));
        }
        const colores = ASPECTO_COLORES[s.clave] as readonly number[];
        return h('div', { class: 'cz-seccion' }, h('b', { text: s.titulo }),
          h('div', { class: 'cz-colores' }, ...colores.map((c) =>
            h('button', {
              type: 'button', class: aspecto[s.clave] === c ? 'on' : '', style: `background:${hex(c)}`, 'aria-label': `Color ${hex(c)}`,
              onclick: () => {
                (aspecto as unknown as Record<string, number>)[s.clave] = c;
                pintar();
              },
            }))));
      }),
    );
    vista.mostrar(forma, aspecto, forma === actual.forma.id ? actual.ciclo : 0);
    app.g.aspecto = { ...aspecto };
    app.guardar();
  };

  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Listo', () => {
        vista.cerrar();
        alVolver();
      }, { icono: '←' }), h('h2', { text: '🧬 Tu criatura' })),
      h('div', { class: 'cz-vista' }, lienzo, boton('Aleatorio', () => {
        Object.assign(aspecto, aspectoAleatorio());
        pintar();
      }, { icono: '🎲', variante: 'suave' }), h('small', { class: 'texto-suave', text: `Ahora eres: ${actual.forma.icono} ${actual.nombre}. Arrastra para girar.` })),
      alcanzadas.length > 1 ? h('div', { class: 'cz-seccion' }, h('b', { text: 'Ver en la forma' }), formas) : null,
      opciones,
    ),
  );
  pintar();
}
