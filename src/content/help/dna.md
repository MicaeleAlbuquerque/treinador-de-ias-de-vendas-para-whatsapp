# DNA de Atendimento

O motor de análise do DNA extrai e sistematiza o que realmente diferencia quem vende bem na sua operação, transformando boas práticas tácitas em conhecimento estruturado.

## Filtros de Visualização (Tier 1 e Tier 2)

No topo da tela `/app/dna`, você encontra um seletor rápido para alternar o foco da análise conforme a maturidade dos seus dados:

- **Todos os Tiers**: Visão integrada de todo o conhecimento extraído.
- **Tier 1 · Análise Básica (Playbook & Qualidade)**: Funciona diretamente a partir das conversas importadas, **sem exigir CRM nem marcação manual de Won/Lost**.
  - **Playbook do Atendimento**: Gera orientações, scripts vencedores, padrões a evitar e system prompt.
  - **Análise de Qualidade por IA**: A IA lê as conversas e atribui notas de 0 a 100, classificando-as como boas ou fracas de forma autônoma para servir de sinal ao motor.
- **Tier 2 · Análise Avançada (DNA do Time)**: Requer conversas com desfecho (Won/Lost manual, via Pipedrive ou gerado pela Análise de Qualidade IA).
  - **Ranking de Vendedores**: Identificação do top performer por win rate, score composto, tempo de primeira resposta e volume.
  - **Classificação por etapa**: Abertura, Qualificação, Apresentação de Valor, Tratamento de Objeção e Fechamento com distribuição percentual por vendedor.
  - **Biblioteca de objeções vencedoras**: Respostas com maior taxa de conversão categorizadas por preço, prazo, concorrência e autoridade.
  - **Antipadrões comerciais**: Expressões e abordagens com alto impacto estatístico (Lift) em conversas perdidas.

## Versões do Playbook (Tier 1)

No painel **Playbook do Atendimento** (em `/app/dna`), cada vez que você gera ou regenera o playbook, uma versão fica salva. Não é o mesmo que o versionamento do DNA avançado — aqui é o playbook básico (Tier 1), que não exige CRM nem marcação Won/Lost.

A seção colapsável **Versões geradas (N)** lista todos os snapshots, com:

- **Data** da geração.
- **Nº de amostras analisadas** (boas/fracas).
- **Modelo** usado para gerar (ex.: `gpt-4o-mini` ou `gemini-2.5-flash`).

O que dá para fazer:

- A versão atual aparece marcada como **ATIVA**.
- Clique numa versão antiga para **visualizar** o conteúdo dela. Enquanto isso, um aviso indica que você está vendo uma versão que **não é a ativa**.
- **Restaurar** reativa uma versão anterior — ela vira a ATIVA de novo.
- **Voltar pra ativa** descarta a visualização e traz de volta a versão em uso.
- **Editar Playbook**: Você pode refinar o texto diretamente no painel e salvar ajustes pontuais.