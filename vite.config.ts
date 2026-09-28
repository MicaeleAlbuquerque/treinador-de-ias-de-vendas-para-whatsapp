// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import os from "node:os";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Filtra interfaces virtuais (WSL, Radmin VPN, VirtualBox) para exibir no máximo 2 networks funcionais no terminal
 */
function functionalNetworksPlugin() {
  return {
    name: "functional-networks-filter",
    configureServer(server: any) {
      server.printUrls = () => {
        const port = server.config.server.port || 8080;
        const protocol = server.config.server.https ? "https" : "http";

        console.log(`\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m   ${protocol}://localhost:${port}/`);

        const interfaces = os.networkInterfaces();
        const candidates: { name: string; address: string; priority: number }[] = [];

        for (const [name, addrs] of Object.entries(interfaces)) {
          const lower = name.toLowerCase();
          if (
            lower.includes("radmin") ||
            lower.includes("wsl") ||
            lower.includes("hyper-v") ||
            lower.includes("virtualbox") ||
            lower.includes("vmware") ||
            lower.includes("docker") ||
            lower.includes("bluetooth") ||
            lower.includes("loopback") ||
            lower.includes("teredo") ||
            lower.includes("pseudo")
          ) {
            continue;
          }

          for (const iface of addrs || []) {
            if (iface.family === "IPv4" && !iface.internal) {
              if (iface.address.startsWith("192.168.56.") || iface.address.startsWith("26.")) {
                continue;
              }
              let priority = 10;
              if (
                lower.includes("wi-fi") ||
                lower.includes("wireless") ||
                lower.includes("wlan") ||
                lower.includes("sem fio")
              ) {
                priority = 100;
              } else if (lower.includes("ethernet")) {
                priority = 80;
              }
              candidates.push({ name, address: iface.address, priority });
            }
          }
        }

        candidates.sort((a, b) => b.priority - a.priority);
        const topNetworks = candidates.slice(0, 2);
        for (const net of topNetworks) {
          console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mNetwork:\x1b[0m ${protocol}://${net.address}:${port}/ \x1b[2m(${net.name})\x1b[0m`);
        }
        console.log("");
      };
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [functionalNetworksPlugin()],
    server: {
      host: "0.0.0.0", // Força IPv4 explícito para evitar lentidão de dual-stack no Windows
    },
    optimizeDeps: {
      include: [
        "lucide-react",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "clsx",
        "tailwind-merge",
        "date-fns",
      ],
    },
  },
});
