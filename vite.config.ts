import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona en https://<usuario>.github.io/<repo>/ sin configurar nada más
export default defineConfig({
  base: './',
  plugins: [react()],
});
