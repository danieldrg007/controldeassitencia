import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Identificador único de este build. Se inyecta en el bundle (__APP_VERSION__) y
// se escribe en dist/version.json para que la app detecte cuándo hay una versión
// nueva desplegada y ofrezca recargar (evita que los usuarios queden atascados
// con una versión vieja en la caché del navegador).
const BUILD_ID = String(Date.now())

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: 'app-version-json',
      writeBundle(options) {
        const dir = options.dir || 'dist'
        writeFileSync(join(dir, 'version.json'), JSON.stringify({ version: BUILD_ID }))
      },
    },
  ],
})
