# MusicGuesser

Juego web de adivinar música: del reggaeton al brutal death. Minijuegos de 10 pruebas, retos diarios, salas en directo con amigos, filtros por género o por hasta 5 artistas, puntuación con rachas, récords y ranking. Todo en el navegador: se publica en GitHub Pages sin servidor.

## Minijuegos

| Modo | Qué hay que hacer |
|---|---|
| ¿Qué canción es? | Suena 1 s; puedes pedir 2, 4, 8 o 16 s, pero cada ampliación vale menos |
| Completa la letra | Elegir (o escribir) el verso que sigue |
| Letra misteriosa | Adivinar la canción solo con dos versos |
| Máquina del tiempo | Acertar el año de lanzamiento (±2 años cuenta como acierto) |
| Portada pixelada | La portada empieza pixelada; pide más nitidez con el botón, pero cada paso vale menos |
| El intruso | 3 fragmentos de un artista y 1 de otro: encuentra el que sobra |
| ¿Qué subgénero? | Brutal death, deathcore, metalcore, black… para entendidos |
| El infiltrado *(urbano)* | 4 artistas y una condición (país, debut, colaboraciones…): uno no la cumple |
| AlbumLink *(urbano)* | Adivinar el disco por sus artistas invitados |

**Partida rápida** los mezcla todos. Escribir la respuesta sin ver las opciones vale ×1,5, y mientras escribes salen sugerencias. La app recuerda las últimas 150 canciones para no repetirlas.

### Solo con urbano (reggaetón y trap)

- **Época** (vieja escuela, intermedia, nueva): cada artista tiene la suya en `scripts/urbano-overrides.json` y solo salen canciones de esa época.
- **Dificultad** por popularidad dentro de la época: fácil, los temazos que conoce todo el mundo (8 % más escuchado); normal, conocidas (8–25 %); difícil, buenos números pero menos sonadas (25–45 %). Cada dificultad tiene su ranking.
- **Retos urbanos**: Clásico (adivina el artista por sus datos), Wordle, Album Quiz, Top 10 de hoy y Pirámide. Reto del día igual para todos, con racha, y modo libre ilimitado.

### Online (con cuenta)

- **Salas en directo**: hasta 8 jugadores, misma prueba a la vez y marcador en vivo (Supabase Realtime).
- **Reto a un amigo**: al acabar una partida, compartes un enlace y tu amigo juega las mismas 10 pruebas.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube este proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `git push` a `main` vuelve a publicar la web en `https://<tu-usuario>.github.io/<repo>/`.

## App de móvil y Google Play

La web es instalable como app (PWA): en el móvil, el navegador ofrece «Instalar» o «Añadir a pantalla de inicio». El service worker se genera en cada build (`pwa/sw.js`) y solo guarda en caché los archivos de la propia app. Supabase, Deezer, LRCLIB y MusicBrainz se piden siempre en directo.

- Para publicar en Google Play, sigue [android/README.md](android/README.md).
- Para regenerar los iconos de `public/icons/` después de cambiar `pwa/icon.svg` o `pwa/icon-maskable.svg`, ejecuta `node scripts/make-icons.mjs` (usa Chrome o Edge).

## Añadir artistas o géneros

Edita `scripts/catalog-source.json` y ejecuta:

```bash
npm run catalog
```

El script busca cada artista en Deezer y regenera `src/data/catalog.json`. Si cambias artistas de urbano, regenera también su base de datos:

```bash
npm run urbano   # ~20 min la primera vez; guarda las respuestas en scripts/.cache
```

Genera `src/data/urbano.json` (discos, canciones, año original, colaboraciones y datos de cada artista). Las correcciones a mano van en `scripts/urbano-overrides.json`.

Si `npm run catalog` elige un homónimo equivocado (pasa con nombres comunes), fuerza su ID de Deezer así: `"Korn#1327"`. El ID está en la URL del artista en deezer.com.

Además, desde la propia app se puede jugar con **cualquier artista** usando el buscador.

## De dónde salen los datos

- **Deezer**: fragmentos de audio de 30 s, portadas y búsqueda (vía JSONP, porque su API no admite CORS).
- **LRCLIB**: letras. Gratuito y comunitario: a veces va lento o limita peticiones; la app reintenta.
- **MusicBrainz**: año del primer lanzamiento, para que las reediciones no despisten en *Máquina del tiempo*.

No se aloja ningún archivo de audio: todo se pide en directo. Proyecto sin ánimo de lucro.

## Base de datos (Supabase)

Después de cambiar `supabase/schema.sql`, pégalo entero en **Supabase → SQL Editor → New query → Run**. Se puede ejecutar varias veces sin romper nada. Las salas en directo no necesitan tablas; el ranking por dificultad, los modos nuevos del ranking y los retos a un amigo sí.
