import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Genera dist/sw.js con una versión nueva y la lista de archivos de este build,
// para que cada despliegue sustituya la caché anterior sin dejar versiones viejas.
function serviceWorker(): Plugin {
  return {
    name: 'musicguesser-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      // La base de datos del urbano (~1 MB) no se descarga al instalar: solo cuando alguien juega a urbano
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html' && !f.startsWith('assets/urbano-'));
      const precache = ['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', ...files];
      const source = readFileSync('pwa/sw.js', 'utf8')
        .replace('__VERSION__', Date.now().toString(36))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base relativa: funciona en https://<usuario>.github.io/<repo>/ sin configurar nada más
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
});
