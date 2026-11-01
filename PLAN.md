# Plan: McL Evolution (supervivencia y evolución en 3D)

## Qué es

Un juego original del género «simulador de evolución», sin copiar nombres, modelos ni niveles de juegos comerciales. Empiezas como un gusano y evolucionas comiendo, cazando y venciendo al Alfa de cada región.

## Etapa (nivel infinito)

1. Una región de 60 m de radio generada con la semilla del linaje: árboles, rocas, charcos, comida y fauna.
2. La comida vegetal y la carne de las presas llenan la barra de ADN. La comida vegetal vuelve a crecer.
3. Con la barra llena aparece el Alfa. Al vencerlo, evolucionas, eliges 1 de 3 mutaciones y pasas a la etapa siguiente.
4. Si caes, reintentas la misma etapa con tu forma y tus mutaciones. No hay vidas ni esperas.
5. Las formas y los biomas van en ciclo, y la vida, el daño, la meta de ADN y la cantidad de fauna crecen sin límite.

## Reglas comunes (netlify/CLAUDE.md)

3D con three.js y criaturas low-poly al estilo del Arcade. En este juego no hay humanos, así que en lugar de «👕 Personaje» hay «🧬 Criatura». Lleva 4 dificultades (`MODOS`: vida, daño, ADN, detección y vida del Alfa), configuración común, pantalla completa, modo oscuro AMOLED, PWA y `rendimiento.ts`.

## Ideas siguientes

- Mejoras permanentes con ADN (un «Genoma»).
- Fase acuática o voladora para algunas formas.
- Manadas aliadas.
- Depredadores que también cazan a las presas.
