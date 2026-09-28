// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
var electron_vite_config_default = defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()]
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts")) return "charts";
            return void 0;
          }
        }
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
