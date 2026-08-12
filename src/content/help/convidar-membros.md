# Convidar membros

Convites são a única forma de adicionar novos usuários após o bootstrap do primeiro admin.

## Quem pode convidar

Apenas usuários com papel **admin** podem gerar convites.

## Como funciona

1. Acesse `/app/team`.
2. Clique em "Novo convite".
3. Escolha o papel pré-definido: **admin** ou **member**.
4. O sistema gera um link único, copiado automaticamente para a área de transferência.
5. Envie esse link ao convidado pelo canal de sua preferência.

## Aceitando o convite

O convidado abre o link (`/accept-invite/<token>`), define a senha e entra automaticamente no app com o papel pré-definido.

## Observação

O envio automático por e-mail ainda não está implementado nesta fase. O link precisa ser repassado manualmente.