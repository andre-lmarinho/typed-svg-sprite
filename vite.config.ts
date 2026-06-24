import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/typed-svg-sprite/, so assets must be
  // prefixed with the repo name. Set to "/" if you move to a custom domain.
  base: "/typed-svg-sprite/",
  plugins: [react()],
});
