import os from "node:os";

/**
 * Retorna a melhor URL acessível da aplicação na rede local ou pública.
 * Se estiver rodando localmente (localhost / 127.0.0.1), detecta o IP IPv4
 * da placa de rede física (Wi-Fi / Ethernet) para permitir que outros dispositivos
 * (como smartphones na mesma rede Wi-Fi) acessem os links enviados por e-mail ou
 * gerados no painel em vez de receberem um link com "localhost" que falha no celular.
 */
export function getAccessibleBaseUrl(clientOrigin?: string): string {
  // 1. Se houver PUBLIC_BASE_URL ou APP_URL configurada e não for localhost, use-a
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/+$/, "");
  }

  // 2. Se o cliente já está acessando por um IP de rede ou domínio (não localhost), priorize isso
  if (clientOrigin) {
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

  // 3. Extrai a porta do clientOrigin se disponível (ex: :8080, :5173, :3000)
  let port = "";
  if (clientOrigin) {
    try {
      const parsed = new URL(clientOrigin);
      if (parsed.port) port = `:${parsed.port}`;
    } catch {}
  }
  if (!port && process.env.PORT) {
    port = `:${process.env.PORT}`;
  }
  if (!port) {
    port = ":8080";
  }

  // 4. Busca o IPv4 da melhor interface de rede física (Wi-Fi / Ethernet)
  try {
    const interfaces = os.networkInterfaces();
    const candidates: { name: string; address: string; priority: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const lowerName = name.toLowerCase();
      // Penaliza adaptadores virtuais / VPNs locais
      const isVirtual =
        lowerName.includes("radmin") ||
        lowerName.includes("vethernet") ||
        lowerName.includes("wsl") ||
        lowerName.includes("docker") ||
        lowerName.includes("virtualbox") ||
        lowerName.includes("vmware") ||
        lowerName.includes("bluetooth") ||
        lowerName.includes("loopback");

      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          let priority = 10;
          if (lowerName.includes("wi-fi") || lowerName.includes("wireless") || lowerName.includes("wlan") || lowerName.includes("sem fio")) {
            priority = 100;
          } else if (lowerName.includes("ethernet") && !isVirtual) {
            priority = 80;
          } else if (isVirtual) {
            priority = 1;
          }
          candidates.push({ name, address: iface.address, priority });
        }
      }
    }

    candidates.sort((a, b) => b.priority - a.priority);

    if (candidates.length > 0 && candidates[0].address) {
      return `http://${candidates[0].address}${port}`;
    }
  } catch (err) {
    console.warn("[getAccessibleBaseUrl] Falha ao inspecionar interfaces de rede:", err);
  }

  return clientOrigin?.replace(/\/+$/, "") || envUrl || "http://localhost:8080";
}
