/**
 * Retorna a URL base acessível da aplicação.
 * 1. Prioriza PUBLIC_BASE_URL ou APP_URL configurada no .env (essencial para túneis ngrok/localtunnel ou produção).
 * 2. Em seguida, utiliza a origem do próprio cliente que realizou a requisição (window.location.origin).
 * 3. Fallback para http://localhost:8080.
 */
export function getAccessibleBaseUrl(clientOrigin?: string): string {
  // 1. Se houver PUBLIC_BASE_URL ou APP_URL configurada no .env, tem prioridade máxima
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/+$/, "");
  }

  // 2. Se o cliente passou sua origem de navegação, use-a diretamente
  if (clientOrigin && clientOrigin.trim() !== "") {
    return clientOrigin.replace(/\/+$/, "");
  }

  // 3. Fallback padrão local
  return "http://localhost:8080";
}
