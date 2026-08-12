# Primeiro acesso

Como esta é uma instância dedicada, o primeiro usuário cadastrado precisa ser configurado como administrador para liberar o resto do time.

## Bootstrap do primeiro admin

1. Acesse `/auth/sign-up` na sua instância.
2. Cadastre-se com e-mail e senha.
3. O primeiro cadastro é promovido automaticamente a **admin**.

## Cadastro público desabilitado

A partir do segundo usuário, o cadastro aberto fica indisponível. Novos acessos só são criados via convite gerado pelo admin em `/app/team`.

## Recomendações

- Use um e-mail corporativo no primeiro cadastro.
- Tenha pelo menos dois admins ativos para evitar lockout em caso de perda de acesso.
- Configure o nome da empresa em `/app/settings` logo após o primeiro login.