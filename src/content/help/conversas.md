# Conversas

Lista todas as conversas 1-on-1 capturadas. Origens possíveis: **Evolution** (em tempo real via webhook), **Upload** (arquivos `.txt` exportados do WhatsApp) e **Demo** (seed automático no primeiro acesso admin).

## Filtros e KPIs

No topo há cards com total de conversas, % com vendedor atribuído, % com outcome definido e % de áudios transcritos.

- **Filtros combinados**: permitem filtrar por vendedor (inclusive "sem atribuição"), outcome (Ganha, Perdida ou Sem desfecho) e origem da conversa.
- **Busca rápida**: pesquisa por nome do lead, telefone ou mensagens, com ícone de limpeza instantânea (`X`).
- **Ações em lote**: seleção múltipla para atribuição em massa de vendedor ou exclusão.

## Identificação Automática do Lead

O sistema analisa automaticamente as mensagens iniciais da conversa para identificar quando o cliente se apresenta (ex.: *"Olá, sou a Juliana"* ou *"Meu nome é Marcos"*). O nome identificado passa a ser exibido em destaque na listagem e no cabeçalho do chat, facilitando o reconhecimento imediato do contato.

## Detalhe da Conversa

Clique em qualquer linha para abrir o chat completo e responsivo:
- **Interface fiel ao WhatsApp**: balões alinhados (vendedor à direita, lead à esquerda) com suporte a modo escuro e claro.
- **Mensagens de áudio**: player nativo de reprodução com transcrição automática por IA logo abaixo do áudio.
- **Atribuição**: se a conversa estiver sem dono, você pode atribuir ou transferir o vendedor diretamente pelo seletor no topo.

## Desfecho (Win/Lost) e Valor

No topo do chat de cada conversa, você pode definir o desfecho comercial:
- **Ganha (Won)**: marca a conversa como sucesso e permite registrar o **Valor (R$)** da venda fechada. Esse dado alimenta as estatísticas de receita e os cálculos de win rate do time.
- **Perdida (Lost)**: marca a conversa como perdida, alimentando a extração de antipadrões e pontos de melhoria no DNA.
- **Sem desfecho**: mantém a conversa neutra até a conclusão da negociação.