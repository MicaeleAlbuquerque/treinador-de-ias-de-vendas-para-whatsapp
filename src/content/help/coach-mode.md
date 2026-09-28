# Coach mode

Para cada mensagem do vendedor, o Coach compara contra a base de excelência da operação e devolve um **score 0–100**. Ele avalia tom, ausência de antipadrão, tratamento de objeção e coerência com a etapa do atendimento.

## Base de comparação (em cascata)

O Coach escolhe sozinho a melhor base disponível, nesta ordem:

1. **DNA avançado (Tier 2)** — se existe um snapshot de DNA gerado, ele usa esse (mais preciso: top performer, antipadrões e biblioteca de objeções). Requer marcação Won/Lost (manual, via Pipedrive ou via análise IA).
2. **Playbook (Tier 1)** — se não há DNA avançado mas existe um Playbook gerado em `/app/dna`, o Coach usa o Playbook como referência (system prompt + scripts vencedores e a evitar). **Funciona sem CRM** — basta ter conversas importadas.
3. **Nenhuma base** — se não há DNA avançado nem Playbook, o Coach pede para você gerar um Playbook primeiro, na aba DNA (`/app/dna`).

O topo de `/app/coach` mostra qual base está em uso ("Comparando contra: Playbook do atendimento" ou "DNA avançado do top performer") e o progresso de avaliação: **X de Y mensagens de vendedor avaliadas**.

## Avaliar histórico (retroativo)

Além de pontuar mensagens novas em tempo real, o botão **Avaliar histórico** roda o Coach sobre as conversas **já importadas**, das mais recentes para as mais antigas, em **lotes de 20**. Clique quantas vezes precisar até zerar as pendentes — o contador ao lado do botão mostra quantas faltam.

## Alertas e Últimas saídas do padrão

- Score abaixo do **threshold** (padrão 60, ajustável por admin em `/app/coach`) gera uma "saída do padrão" e uma notificação para administradores.
- O painel exibe as **últimas saídas do padrão de forma compacta (máximo de 15 por vez)**, destacando a sugestão de correção da IA, nota de aderência, data e link direto para abrir e auditar a conversa correspondente.
- Acompanhamento de aderência média semanal por vendedor e feed de notificações recentes.

## Arena de Treinamento (Simulação Interativa)

A aba **Arena de Treinamento** permite que os vendedores pratiquem conversas em um ambiente controlado:
- **Lead simulado por IA**: gera situações realistas de vendas com base no perfil do seu público e nas objeções do negócio.
- **Feedback instantâneo**: a cada resposta enviada pelo vendedor, o Coach analisa a mensagem em segundos, pontua de 0 a 100 e aponta melhorias imediatas.
- **Histórico de simulações**: armazena os treinos realizados para acompanhamento da evolução da equipe.

## Pré-requisitos

- Pelo menos um **Playbook** gerado (Tier 1) ou um **snapshot de DNA** (Tier 2).
- Provedor de IA ativo: Lovable AI (Gemini) por padrão, ou OpenAI se você cadastrou a chave em **Configurações → Conta da IA**. O cap de custo LLM não pode ter sido atingido.
