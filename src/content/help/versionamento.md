# Versionamento do DNA

Cada vez que o motor recalcula, um novo **snapshot** é criado em `dna_snapshots`. O snapshot ativo é o referência para toda exportação (`/app/prompts`).

## Quando recalcular

- Automaticamente a cada 10 conversas novas marcadas Won/Lost.
- Diariamente via cron.
- Manualmente no botão **Recalcular DNA** em `/app/dna` (admin).

## Histórico

A aba **Histórico** em `/app/dna` lista os últimos 20 snapshots com data, total de conversas analisadas e marcador de qual está ativo.

## Rollback

Admin pode clicar **Rollback** em qualquer snapshot do histórico para torná-lo o ativo. Todas as próximas gerações de System Prompt, Playbook, Few-shot, RAG e Fine-tuning passam a usar esse snapshot. Os artefatos já gerados continuam acessíveis por suas URLs, mas novas execuções herdam o snapshot atual.

## Boas práticas

- Antes de publicar um System Prompt como padrão, gere uma versão de cada snapshot relevante e compare visualmente o conteúdo.
- Após rollback, regenere o System Prompt e republique se quiser que o fine-tuning use o novo `system`.