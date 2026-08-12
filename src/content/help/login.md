# Entrar e recuperar senha

## Entrar

Acesse `/auth/sign-in` e informe e-mail e senha. Ao entrar, você é levado direto ao painel em `/app`.

## Esqueci a senha

1. Clique em "Esqueci a senha" na tela de login (ou acesse `/auth/forgot-password`).
2. Informe seu e-mail.
3. Você receberá um link de recuperação.
4. O link leva para `/auth/reset-password`, onde você define a nova senha.

## Problemas comuns

- **Não recebi o e-mail**: confira a caixa de spam. Se persistir, peça a um admin para verificar se o seu usuário ainda existe em `/app/team`.
- **Link expirado**: solicite um novo link na tela de recuperação.