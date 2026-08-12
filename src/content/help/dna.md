# DNA (Fase 3)

Em breve. Esta área mostrará o que diferencia quem vende bem na sua operação.

## O que vai ter

- **Ranking automático** dos top performers (win rate, taxa de resposta, tempo de 1ª resposta, comprimento médio).
- **Classificação por etapa**: Abertura, Qualificação, Valor, Objeção e Fechamento.
- **Cadência temporal**: quando e com que frequência os melhores respondem.
- **Biblioteca de objeções vencedoras** com taxa de conversão por padrão de resposta.
- **Antipadrão**: padrões recorrentes nas conversas perdidas, para evitar.
- **Painel DNA** com heatmap, top frases e comparativo top vs média.

## Versões do Playbook

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