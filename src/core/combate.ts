/** Diferencia de ángulos en [-π, π]. */
export const angulo = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Ángulo de mirada (yaw) de A hacia B. Adelante es -z, como en la cámara. */
export const yawHacia = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));

/** ¿Está B (con su radio) dentro del arco de un mordisco que sale de A mirando a `yaw`? */
export function enArco(ax: number, az: number, yaw: number, bx: number, bz: number, radioB: number, alcance: number, arco: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  if (d > alcance + radioB) return false;
  if (arco >= Math.PI * 2 - 1e-6 || d < radioB) return true;
  return Math.abs(angulo(yawHacia(ax, az, bx, bz) - yaw)) <= arco / 2 + Math.atan2(radioB, Math.max(d, 0.01));
}
