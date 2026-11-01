# McL Evolution

Juego de supervivencia y evolución en 3D para el navegador. Empiezas como un gusano diminuto: comes, cazas, llenas la barra de ADN, vences al Alfa de la región y evolucionas a la forma siguiente. La evolución no tiene final: las formas y los biomas se repiten en ciclo y cada vuelta es más difícil.

- **Diez formas**: gusano, escarabajo, rana, lagarto, zorro, felino, oso, dinosaurio, mamut y dragón. Después vuelven a empezar como «Forma +N», con más púas.
- **Siete biomas en ciclo**: charca, bosque, pradera, sabana, tundra, volcán y pantano.
- **Fauna**: las presas huyen, los rivales se defienden si los atacas y los depredadores te cazan. Al cazar queda carne con ADN.
- **El Alfa**: aparece con la barra de ADN llena. Avisa antes de morder, embiste, da pisotones en área y se enfurece a media vida.
- **Mutaciones**: eliges 1 de 3 al evolucionar, como caparazón, regeneración, garras, patas largas, digestión, olfato, pulmones, colmillos venenosos, rugido, escupitajo o embestida.
- **🧬 Criatura**: colores de piel, vientre y dibujo del lomo, ojos, cuernos y cola, con vista previa 3D en cualquier forma ya alcanzada.
- Teclado y ratón, mando y, en el móvil, un mando de PSP en pantalla (□ morder, ✕ saltar, ○ correr, △ rugido, R escupitajo, L fijar, SELECT cámara, START pausa).
- Funciona sin conexión (PWA) y el progreso queda en el navegador.

Publicado en https://mcl-evolution.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # ?demo empieza una etapa directamente; ?demo&etapa=8 en esa etapa; &alfa con el Alfa ya fuera
npm test
npm run build
```

En `src/core/*` está la lógica pura: formas, especies, biomas, región, mutaciones, dificultad, combate y física. `src/game/logica.ts` es la etapa, `src/game/ia.ts` la fauna, `src/game/criaturas.ts` los modelos low-poly y `src/game/render3d.ts` el dibujo con three.js.
