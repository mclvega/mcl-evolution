# Plan: McL Evolution (supervivencia y evolución en 3D)

## Qué es

Un juego original del género «simulador de evolución», sin copiar nombres, modelos ni niveles de juegos comerciales. Empiezas como un gusano y evolucionas comiendo, cazando y venciendo al Alfa de cada región.

## Mundo y etapas (infinito)

1. Mundo abierto sin bordes, en trozos de 32 m que se generan con la semilla del linaje alrededor del jugador.
2. Biomas en zonas grandes con forma irregular. El nivel de la zona sube con la distancia al origen: la fauna es más fuerte y da más ADN.
3. La comida vegetal y la carne llenan la barra de ADN. Con la barra llena aparece el Alfa. Al vencerlo, eliges 1 de 3 mutaciones y evolucionas en el mismo sitio.
4. Al morir, el linaje se extingue: queda en los récords y se empieza de nuevo como gusano en un mundo nuevo.
5. El avance (etapa, mutaciones, semilla y posición) se guarda al evolucionar y al salir.

## Reglas comunes (netlify/CLAUDE.md)

3D con three.js y criaturas low-poly al estilo del Arcade. En este juego no hay humanos, así que en lugar de «👕 Personaje» hay «🧬 Criatura». Lleva 4 dificultades (`MODOS`: vida, daño, ADN, detección y vida del Alfa), configuración común, pantalla completa, modo oscuro AMOLED, PWA y `rendimiento.ts`.

## Ideas siguientes

- Mejoras permanentes con ADN (un «Genoma»).
- Fase acuática o voladora para algunas formas.
- Manadas aliadas.
- Depredadores que también cazan a las presas.
