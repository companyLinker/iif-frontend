import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This makes the dev server listen on your network IP
    port: 5173, // Optional: can be omitted if you want the default port
  },
});
