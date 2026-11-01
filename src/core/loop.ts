/** Bucle de paso fijo (60 Hz): la simulación no depende de los FPS del dispositivo. */
export const PASO = 1 / 60;

/** `dibujar` recibe la fracción del paso siguiente (0 a 1) para interpolar el movimiento. */
export function iniciarBucle(actualizar: (dt: number) => void, dibujar: (alfa: number) => void): () => void {
  let acumulado = 0;
  let anterior = performance.now();
  let id = 0;
  let activo = true;
  const cuadro = (ahora: number) => {
    if (!activo) return;
    // Tras una pestaña oculta no se intenta "recuperar" más de 0,25 s.
    acumulado += Math.min(0.25, (ahora - anterior) / 1000);
    anterior = ahora;
    while (acumulado >= PASO) {
      actualizar(PASO);
      acumulado -= PASO;
    }
    dibujar(acumulado / PASO);
    id = requestAnimationFrame(cuadro);
  };
  id = requestAnimationFrame(cuadro);
  return () => {
    activo = false;
    cancelAnimationFrame(id);
  };
}
