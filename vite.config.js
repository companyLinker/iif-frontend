import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This makes the dev server listen on your network IP
    port: 5173, // Optional: can be omitted if you want the default port
  },
  build: {
    rollupOptions: {
      output: {
        // big, rarely-changing libraries get their own files so browsers cache
        // them across deployments of the app code
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          antd: ["antd", "@ant-design/icons"],
          xlsx: ["xlsx"],
        },
      },
    },
  },
});
