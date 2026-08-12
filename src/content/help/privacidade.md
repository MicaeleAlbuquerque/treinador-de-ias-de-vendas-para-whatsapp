# Privacidade e segurança

A premissa do produto é que dados de conversas de vendas são sensíveis. Toda a arquitetura segue essa premissa.

## Anonimização automática

CPF, cartões, telefones, e-mails, nomes próprios e valores são removidos ou mascarados **antes** de qualquer chamada para LLM. O texto original fica retido apenas em `messages.raw`, com acesso restrito.

## RLS estrita

Toda tabela tem Row Level Security habilitada. Usuário autenticado vê apenas o que tem permissão; mutações sensíveis (papéis, configurações da empresa, remoção de usuários) exigem papel admin.

## Segredos

Tokens e credenciais (Evolution API, Pipedrive, chaves de LLM BYOK) ficam em `vault.secrets`. Nunca são expostos ao browser nem aparecem em logs.

## Single-tenant

Os dados desta instância não atravessam fronteiras. Não existe base compartilhada com outros clientes.