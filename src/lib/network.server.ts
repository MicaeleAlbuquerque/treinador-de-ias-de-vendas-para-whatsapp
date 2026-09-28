import os from "node:os";

/**
 * Retorna no máximo 2 URLs de rede funcionais (excluindo adaptadores virtuais como Radmin, WSL, VirtualBox).
 * Prioriza Wi-Fi e Ethernet física.
 */
export function getFunctionalNetworkUrls(port: number | string = 8080): string[] {
  const p = port ? `:${port}` : "";
  const candidates: { address: string; priority: number }[] = [];

  try {
    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      const lower = name.toLowerCase();
      // Exclui adaptadores virtuais e VPNs locais que não respondem para smartphones na mesma rede
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
          // Exclui sub-redes virtuais conhecidas
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

          candidates.push({ address: iface.address, priority });
        }
      }
    }
  } catch (err) {
    console.warn("[getFunctionalNetworkUrls] Falha ao inspecionar interfaces de rede:", err);
  }

  candidates.sort((a, b) => b.priority - a.priority);

  // Retorna no máximo 2 redes funcionais
  return candidates.slice(0, 2).map((c) => `http://${c.address}${p}`);
}

/**
 * Retorna a melhor URL base acessível da aplicação.
 * 1. Prioriza PUBLIC_BASE_URL ou APP_URL configurada no .env (essencial para túneis ngrok/localtunnel ou produção).
 * 2. Se o cliente está acessando por um domínio externo ou IP da LAN (não localhost), utiliza a origem do próprio cliente.
 * 3. Se estiver em localhost/127.0.0.1, seleciona a melhor rede física funcional (Wi-Fi/Ethernet)
 *    para permitir que links copiados funcionem em outros aparelhos na mesma rede sem erro de localhost.
 * 4. Fallback final para http://localhost:8080.
 */
export function getAccessibleBaseUrl(clientOrigin?: string): string {
  // 1. PUBLIC_BASE_URL tem prioridade máxima
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/+$/, "");
  }

  // 2. Se o cliente já está acessando por um IP de rede ou domínio externo (não localhost), use-o
  if (clientOrigin && clientOrigin.trim() !== "") {
    try {
      const parsed = new URL(clientOrigin);
      if (
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "0.0.0.0" &&
        parsed.hostname !== "::1"
      ) {
        return clientOrigin.replace(/\/+$/, "");
      }
    } catch {}
  }

  // 3. Extrai a porta
  let port = "8080";
  if (clientOrigin) {
    try {
      const parsed = new URL(clientOrigin);
      if (parsed.port) port = parsed.port;
    } catch {}
  } else if (process.env.PORT) {
    port = process.env.PORT;
  }

  // 4. Busca a melhor rede funcional (Wi-Fi primeiro)
  const functionalNetworks = getFunctionalNetworkUrls(port);
  if (functionalNetworks.length > 0 && functionalNetworks[0]) {
    return functionalNetworks[0];
  }

  return clientOrigin?.replace(/\/+$/, "") || "http://localhost:8080";
}
