# McL Evolution

Juego de supervivencia y evolución en 3D para el navegador, en un **mundo abierto infinito**. Empiezas como un gusano diminuto: comes, cazas, llenas la barra de ADN, vences al Alfa y evolucionas ahí mismo a la forma siguiente. El mundo no tiene bordes: los biomas cambian según caminas y cuanto más lejos del origen vas, más fuerte es la fauna y más ADN da. Si mueres, tu linaje se extingue y empiezas de nuevo como gusano en otro mundo.

- **Diez formas**: gusano, escarabajo, rana, lagarto, zorro, felino, oso, dinosaurio, mamut y dragón. Después vuelven a empezar como «Forma +N», con más púas.
- **Siete biomas** repartidos por el mundo en zonas grandes: charca (donde empiezas), bosque, pradera, sabana, tundra, volcán y pantano.
- **Fauna**: las presas huyen, los rivales se defienden si los atacas y los depredadores te cazan. Al cazar queda carne con ADN.
- **El Alfa**: aparece con la barra de ADN llena. Avisa antes de morder, embiste, da pisotones en área y se enfurece a media vida.
- **Mutaciones**: eliges 1 de 3 al evolucionar, como caparazón, regeneración, garras, patas largas, digestión, olfato, pulmones, colmillos venenosos, rugido, escupitajo o embestida.
- **🧬 Criatura**: colores de piel, vientre y dibujo del lomo, ojos, cuernos y cola, con vista previa 3D en cualquier forma ya alcanzada.
- Teclado y ratón, mando y, en el móvil, joystick flotante a la izquierda (arrastrar a la derecha mueve la cámara) y botones con iconos: 🦷 morder, ⤴ saltar y 💨 correr. 📢 rugido y 💦 escupitajo solo aparecen si tienes esas mutaciones.
- Funciona sin conexión (PWA) y el progreso queda en el navegador.

Publicado en https://mcl-evolution.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # ?demo empieza una etapa directamente; ?demo&etapa=8 en esa etapa; &alfa con el Alfa ya fuera
npm test
npm run build
```

En `src/core/*` está la lógica pura: formas, especies, biomas, mundo por trozos, mutaciones, dificultad, combate y física. `src/game/logica.ts` es la etapa, `src/game/ia.ts` la fauna, `src/game/criaturas.ts` los modelos low-poly y `src/game/render3d.ts` el dibujo con three.js.
