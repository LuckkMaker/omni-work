// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "D:\\workspaces\\embedded\\luckk-work";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/preload.ts")
        }
      }
    }
  },
  renderer: {
    root: "src",
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    },
    build: {
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/index.html")
        }
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
