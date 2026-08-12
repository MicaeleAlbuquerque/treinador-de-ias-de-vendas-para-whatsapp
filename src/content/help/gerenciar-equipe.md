# Gerenciar equipe

A tela `/app/team` lista todos os usuários da instância e centraliza as ações de papel e remoção.

## Ações disponíveis

- **Promover member a admin**: dá acesso completo, inclusive a convites e configurações da empresa.
- **Rebaixar admin a member**: tira permissões administrativas.
- **Remover usuário**: revoga o acesso. O usuário não consegue mais entrar.

## Regra do último admin

O sistema **bloqueia** a remoção ou o rebaixamento do último admin ativo. Isso evita que a instância fique sem ninguém para administrá-la (lockout). Para rebaixar um admin, promova outro antes.

## Boas práticas

- Manter no mínimo dois admins ativos.
- Revisar a lista periodicamente e remover acessos de pessoas que saíram do time.