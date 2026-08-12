# Pipedrive (Fase 5)

Conecte o Pipedrive em **Configurações → Integrações** e o sistema cruza conversas com deals pelo telefone.

## Como conectar

1. Clique em **Conectar Pipedrive** — você será redirecionado para login OAuth.
2. Autorize os escopos `deals:read`, `deals:full`, `users:read`.
3. Voltará para o app já conectado.

## Sincronização

- Roda automaticamente a cada 5 minutos para conversas com outcome `unknown` ou `in_progress`.
- **Sincronizar agora** força a verificação imediata.
- Cruzamento: telefone do lead → busca pessoa no Pipedrive → pega o deal mais recente. Status `won`/`lost`/`open` vira o outcome.
- Conversas marcadas via Pipedrive recebem badge **Auto via Pipedrive**.

## Override manual

Admin pode sobrescrever um outcome puxado do Pipedrive — basta marcar manualmente na tela da conversa. A marca manual passa a prevalecer.

## Desconectar

Em **Integrações → Desconectar** o token é removido. Conversas já sincronizadas mantêm o outcome.