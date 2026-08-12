# Conectar WhatsApp via Evolution

Em **Configurações → WhatsApp** (acesso admin):

1. Informe **Nome da instância**, **URL Evolution** e **Token Evolution** da sua conta Evolution API.
2. (Opcional) Selecione o **vendedor dono** dessa instância — mensagens enviadas serão atribuídas a ele automaticamente.
3. Clique **Criar e gerar QR**. A instância aparece na tela automaticamente e o painel lateral de pareamento abre com o **QR code**.
4. Escaneie o QR no WhatsApp do vendedor (Configurações → Aparelhos conectados).
5. Quando o status mudar para `connected`, a captura começa em tempo real e o histórico é sincronizado.

Use **Atualizar QR** apenas se o código expirar; a tela também atualiza o status da instância sozinha a cada poucos segundos. **Desconectar** encerra a sessão e remove a instância.

## Webhook

A plataforma expõe um endpoint público assinado por token único: `/api/public/whatsapp-webhook?token=...`. Esse token é gerado automaticamente e nunca precisa ser configurado manualmente.

## Grupos

Mensagens de grupo (`@g.us`) são **ignoradas** intencionalmente. Apenas conversas 1-on-1 são processadas.