# MusicGuesser

Juego web de adivinar música: del reggaeton al brutal death. 8 minijuegos de 10 pruebas, filtros por género o por cualquier artista, puntuación con rachas y récords. Todo en el navegador: se publica en GitHub Pages sin servidor.

## Minijuegos

| Modo | Qué hay que hacer |
|---|---|
| ¿Qué canción es? | Suena 1 s; puedes pedir 2, 4, 8 o 16 s, pero cada ampliación vale menos |
| ¿Quién canta? | Reconocer al artista por el fragmento |
| Completa la letra | Elegir (o escribir) el verso que sigue |
| Letra misteriosa | Adivinar la canción solo con dos versos |
| Máquina del tiempo | Acertar el año de lanzamiento (±2 años cuenta como acierto) |
| Portada pixelada | La portada se enfoca poco a poco: adivina el disco |
| El intruso | 3 fragmentos de un artista y 1 de otro: encuentra el que sobra |
| ¿Qué subgénero? | Brutal death, deathcore, metalcore, black… para entendidos |

**Partida rápida** mezcla los 8. Escribir la respuesta sin ver las opciones vale el doble.

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

## Añadir artistas o géneros

Edita `scripts/catalog-source.json` y ejecuta:

```bash
npm run catalog
```

El script busca cada artista en Deezer y regenera `src/data/catalog.json`. Si elige un homónimo equivocado (pasa con nombres comunes), fuerza su ID de Deezer así: `"Korn#1327"`. El ID está en la URL del artista en deezer.com.

Además, desde la propia app se puede jugar con **cualquier artista** usando el buscador.

## De dónde salen los datos

- **Deezer**: fragmentos de audio de 30 s, portadas y búsqueda (vía JSONP, porque su API no admite CORS).
- **LRCLIB**: letras. Gratuito y comunitario: a veces va lento o limita peticiones; la app reintenta.
- **MusicBrainz**: año del primer lanzamiento, para que las reediciones no despisten en *Máquina del tiempo*.

No se aloja ningún archivo de audio: todo se pide en directo. Proyecto sin ánimo de lucro.
