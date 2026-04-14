import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.DEV_PROXY_TARGET || "http://127.0.0.1:3000";

  return {
    server: {
      port: 5173,
      host: true,
      // true = accepter IP LAN, ngrok, etc. (liste restreinte = écran blanc hors ngrok)
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, "") || "/",
        },
      },
    },
  };
});
