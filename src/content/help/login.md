# Entrar e recuperar senha

## Entrar

Acesse `/auth/sign-in` e informe e-mail e senha. Ao entrar, você é levado direto ao painel em `/app`.

## Esqueci a senha

1. Clique em **Esqueci a senha** na tela de login (ou acesse `/auth/forgot-password`).
2. Informe seu e-mail cadastrado.
3. Você receberá um e-mail contendo tanto o link direto de recuperação quanto um **código numérico (OTP)**.
4. Você pode definir a nova senha clicando no link ou digitando o código numérico diretamente em `/auth/reset-password`.

## Alternativa por Código Numérico (OTP)

Muitos leitores de e-mail e antivírus corporativos fazem varredura automática de links recebidos, o que pode consumir ou invalidar links descartáveis de segurança.

Pensando nisso, a tela de recuperação oferece a opção **"Prefere usar código numérico do e-mail?"**:
- Basta inserir seu e-mail e o código numérico de 6 a 8 dígitos recebido na mensagem para cadastrar sua nova senha com 100% de sucesso, mesmo em dispositivos diferentes.

## Problemas comuns

- **Não recebi o e-mail**: confira a caixa de spam ou lixo eletrônico. Se persistir, peça a um admin para verificar se o seu usuário ainda existe ativo em `/app/team`.
- **Link expirou**: utilize a opção de código numérico (OTP) ou solicite um novo e-mail na tela de recuperação.