import { h } from './dom';

/**
 * Mando en pantalla con la disposición de la PSP (como los controles táctiles de PPSSPP):
 * L y R arriba, cruceta y stick analógico a la izquierda, △ ○ ✕ □ a la derecha, SELECT y START abajo en el centro.
 * Todo es multitáctil: se puede mantener R y pulsar □ a la vez.
 */
export type BotonPsp = 'triangulo' | 'circulo' | 'cruz' | 'cuadrado' | 'L' | 'R' | 'select' | 'start';

const SIMBOLO: Record<BotonPsp, string> = { triangulo: '△', circulo: '○', cruz: '✕', cuadrado: '□', L: 'L', R: 'R', select: 'SELECT', start: 'START' };

export class ControlesPsp {
  /** Dirección en [-1, 1] (cruceta o stick); y negativo = arriba. */
  x = 0;
  y = 0;
  private actuales = new Set<BotonPsp>();
  private anteriores = new Set<BotonPsp>();
  private tocados = new Set<BotonPsp>();
  private cruceta = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private nub: HTMLElement;
  private flechas = new Map<string, HTMLElement>();
  readonly raiz: HTMLElement;

  /** `etiquetas`: texto pequeño con la función de cada botón (ayuda para quien no conoce la PSP). */
  constructor(contenedor: HTMLElement, etiquetas: Partial<Record<BotonPsp, string>>) {
    this.raiz = h('div', { class: 'psp' });
    for (const b of Object.keys(SIMBOLO) as BotonPsp[]) {
      const el = h('div', { class: `psp-boton psp-${b}`, role: 'button', 'aria-label': `${SIMBOLO[b]} ${etiquetas[b] ?? ''}`.trim() },
        h('span', { class: 'psp-simbolo', text: SIMBOLO[b] }),
        etiquetas[b] ? h('small', { text: etiquetas[b] }) : null,
      );
      this.pulsable(el, b);
      this.raiz.append(el);
    }
    // Cruceta: un solo elemento; la dirección sale de dónde está el dedo (8 direcciones).
    const cruz = h('div', { class: 'psp-cruceta', role: 'group', 'aria-label': 'Cruceta' });
    for (const d of ['arriba', 'abajo', 'izquierda', 'derecha']) {
      const f = h('div', { class: `psp-flecha psp-${d}` });
      this.flechas.set(d, f);
      cruz.append(f);
    }
    this.zonaDireccion(cruz, (dx, dy, r) => {
      const umbral = r * 0.25;
      this.cruceta.x = dx > umbral ? 1 : dx < -umbral ? -1 : 0;
      this.cruceta.y = dy > umbral ? 1 : dy < -umbral ? -1 : 0;
    }, () => (this.cruceta = { x: 0, y: 0 }));
    // Stick analógico fijo, como el de la PSP.
    const base = h('div', { class: 'psp-stick', role: 'group', 'aria-label': 'Stick analógico' });
    this.nub = h('div', { class: 'psp-nub' });
    base.append(this.nub);
    this.zonaDireccion(base, (dx, dy, r) => {
      const l = Math.hypot(dx, dy);
      const k = l > r ? r / l : 1;
      this.stick = { x: (dx * k) / r, y: (dy * k) / r };
      this.nub.style.transform = `translate(${dx * k * 0.6}px, ${dy * k * 0.6}px)`;
    }, () => {
      this.stick = { x: 0, y: 0 };
      this.nub.style.transform = '';
    });
    this.raiz.append(cruz, base);
    contenedor.append(this.raiz);
  }

  private pulsable(el: HTMLElement, b: BotonPsp) {
    const ids = new Set<number>();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      ids.add(e.pointerId);
      this.tocados.add(b);
      el.classList.add('activo');
      navigator.vibrate?.(8);
    });
    const soltar = (e: PointerEvent) => {
      ids.delete(e.pointerId);
      if (ids.size) return;
      this.tocados.delete(b);
      el.classList.remove('activo');
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  }

  private zonaDireccion(el: HTMLElement, mover: (dx: number, dy: number, radio: number) => void, soltar: () => void) {
    let id = -1;
    const calcular = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mover(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
    };
    el.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      el.setPointerCapture(id);
      calcular(e);
    });
    el.addEventListener('pointermove', (e) => e.pointerId === id && calcular(e));
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      soltar();
    };
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
  }

  /** Se llama una vez por paso de simulación. */
  actualizar() {
    this.anteriores = this.actuales;
    this.actuales = new Set(this.tocados);
    const usaStick = Math.hypot(this.stick.x, this.stick.y) > 0.15;
    const x = usaStick ? this.stick.x : this.cruceta.x;
    const y = usaStick ? this.stick.y : this.cruceta.y;
    const l = Math.hypot(x, y);
    this.x = l > 1 ? x / l : x;
    this.y = l > 1 ? y / l : y;
    for (const [d, f] of this.flechas) {
      const on = (d === 'arriba' && this.cruceta.y < 0) || (d === 'abajo' && this.cruceta.y > 0) || (d === 'izquierda' && this.cruceta.x < 0) || (d === 'derecha' && this.cruceta.x > 0);
      f.classList.toggle('activo', on);
    }
  }

  activo(b: BotonPsp) {
    return this.actuales.has(b);
  }

  pulsado(b: BotonPsp) {
    return this.actuales.has(b) && !this.anteriores.has(b);
  }

  limpiar() {
    this.tocados.clear();
    this.actuales.clear();
    this.cruceta = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.nub.style.transform = '';
    this.raiz.querySelectorAll('.activo').forEach((e) => e.classList.remove('activo'));
  }
}
