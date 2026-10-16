# Publicar MusicGuesser en Google Play

La app de Android es una **Trusted Web Activity (TWA)**: abre `https://orodriguez8.github.io/musicguesser/` a pantalla completa, sin barra del navegador. Toda la app sigue siendo la web, así que **cada `git push` actualiza a la vez la web y la app**, sin pasar por la revisión de Google Play.

Solo hay que generar y subir otro `.aab` si cambias el nombre, el icono, el color o el dominio.

## 0. Antes de empezar

- [ ] Ejecuta otra vez `supabase/schema.sql` en Supabase (SQL Editor → Run). Añade `delete_my_account()`, que usa el botón **Borrar mi cuenta**. Google Play lo exige.
- [ ] Haz push y comprueba que estas dos URL abren bien:
  - https://orodriguez8.github.io/musicguesser/
  - https://orodriguez8.github.io/musicguesser/privacidad.html
- [ ] En Chrome, abre la web, pulsa F12 → **Application → Manifest**. No debe salir ningún error.

## 1. Generar el paquete de Android (gratis)

1. Entra en **https://www.pwabuilder.com**, pega `https://orodriguez8.github.io/musicguesser/` y pulsa **Start**.
2. **Package for stores → Android → Generate Package** con estos valores:
   - **Package ID:** `io.github.orodriguez8.musicguesser`. No se puede cambiar nunca.
   - **App name:** `MusicGuesser`
   - **Signing key:** *Create new*. Escribe tu nombre y una contraseña que no vayas a olvidar.
3. Descarga el zip y descomprímelo en `android/pwabuilder/`. Esa carpeta está en `.gitignore` y no se sube al repositorio. El zip trae:
   - `*.aab`: el archivo que se sube a Google Play.
   - `signing.keystore` y `signing-key-info.txt`: **la clave de la app**. Guarda una copia en un sitio seguro, como un gestor de contraseñas o un USB. Si la pierdes, no podrás publicar actualizaciones de la app.
   - `assetlinks.json`

## 2. Demostrar que la web es tuya (Digital Asset Links)

Sin este paso, la app se abre con una barra de navegador arriba.

Android busca el archivo en la **raíz del dominio**: `https://orodriguez8.github.io/.well-known/assetlinks.json`. Este repositorio se publica en `/musicguesser/`, así que el archivo tiene que ir en otro repositorio:

1. Crea en GitHub un repositorio público llamado exactamente **`orodriguez8.github.io`**, si todavía no lo tienes.
2. Súbele dos archivos:
   - `.well-known/assetlinks.json`: copia [`assetlinks.json`](assetlinks.json) y sustituye las huellas (ver abajo).
   - `.nojekyll`: un archivo vacío. Sin él, GitHub Pages ignora la carpeta `.well-known`.
3. Activa Pages en ese repositorio (Settings → Pages → *Deploy from a branch* → `main`).
4. Comprueba que https://orodriguez8.github.io/.well-known/assetlinks.json muestra el JSON.

**Las dos huellas SHA-256:**

- **Clave de subida:** viene en `signing-key-info.txt` o en el `assetlinks.json` del zip de PWABuilder.
- **Clave de Google Play:** Google vuelve a firmar la app con su propia clave. Cuando subas el primer `.aab`, la encontrarás en Play Console → tu app → **Prueba y lanzamiento → Integridad de la app → Firma de apps**, en el apartado del certificado de la clave de firma de apps (SHA-256).

Pon las dos en el array `sha256_cert_fingerprints`. Si solo pones la de PWABuilder, la app que se descarga de Play mostrará la barra del navegador.

## 3. Google Play Console (25 USD, pago único)

1. Date de alta en **https://play.google.com/console** como cuenta **personal**. Pagas 25 USD una sola vez y verificas tu identidad con el DNI.
2. **Crear app:** nombre *MusicGuesser*, idioma español, tipo *Juego*, *Gratis*.
3. **Contenido de la app.** Rellena cada apartado así:
   - **Política de privacidad:** `https://orodriguez8.github.io/musicguesser/privacidad.html`
   - **Eliminación de cuenta:** `https://orodriguez8.github.io/musicguesser/privacidad.html#borrar-cuenta`
   - **Anuncios:** No.
   - **Acceso a la app:** se puede jugar sin cuenta, así que marca que todo es accesible sin restricciones.
   - **Público objetivo:** a partir de 13 años. Si incluyes menores de 13, se aplica la política de familias, que es mucho más estricta.
   - **Clasificación del contenido:** rellena el cuestionario IARC. Ten en cuenta que hay letras de canciones de todo tipo, algunas explícitas.
   - **Seguridad de los datos:**
     - Datos recogidos: **Email** (opcional), **ID de usuario / nombre de usuario** y **Actividad en la app → Otras acciones** (las puntuaciones). Todo se usa para la *funcionalidad de la app* y la *gestión de la cuenta*.
     - Datos compartidos con terceros: **No**.
     - Cifrado en tránsito: **Sí** (HTTPS).
     - Los usuarios pueden pedir que se borren sus datos: **Sí**.
4. **Ficha de Play Store:**
   - Icono de 512×512: [`public/icons/icon-512.png`](../public/icons/icon-512.png)
   - Gráfico destacado de 1024×500: hay que hacerlo.
   - Al menos 2 capturas del móvil. Puedes hacerlas con Chrome → F12 → modo dispositivo.
   - Descripción corta (80 caracteres como máximo) y descripción larga.

## 4. Prueba cerrada obligatoria (cuentas personales nuevas)

Google no deja publicar una cuenta personal nueva sin una **prueba cerrada con al menos 12 testers que tengan la app instalada durante 14 días seguidos**. Las cifras pueden cambiar, así que confírmalas en la consola.

1. **Prueba y lanzamiento → Pruebas → Prueba cerrada → Crear versión** y sube el `.aab`.
2. Añade los emails de Gmail de los testers. Te sirven amigos y familia.
3. Comparte con ellos el enlace de unirse a la prueba. Tienen que aceptar e instalar la app desde Play.
4. Cuando pasen los 14 días, solicita el **acceso a producción** desde el panel. Google hace unas preguntas sobre la prueba.
5. Cuando lo aprueben, pasa la versión a **Producción**.

## Ojo con…

- **Derechos de la música:** la app reproduce fragmentos de Deezer en directo y no aloja audio. Aun así, Google revisa las apps de música con más cuidado. Deja claro en la descripción que los fragmentos y portadas vienen de la API pública de Deezer.
- **Login con Google dentro de la app:** funciona sin cambios, porque la TWA usa Chrome y el dominio es el mismo. No hay que tocar las *Redirect URLs* de Supabase.
- **Cambiar de dominio:** si algún día pasas a un dominio propio, hay que generar otro `.aab` y mover `assetlinks.json` al nuevo dominio.
