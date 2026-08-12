# Prompts e artefatos de exportação

Em `/app/prompts` você exporta o conhecimento extraído em dois níveis: a partir do **Playbook** (Tier 1, sem CRM) e a partir do **DNA avançado** (Tier 2, com os formatos completos).

## Exportar Playbook (Tier 1 · sem CRM)

Assim que você gera um **Playbook** na aba `/app/dna`, esta tela libera a exportação dele — não precisa de CRM nem Won/Lost. Disponível:

- **Copiar system prompt** — joga o system prompt do Playbook direto no clipboard, pronto pra colar num ChatGPT/Claude/agente.
- **System prompt (.txt)** — baixa o mesmo conteúdo como arquivo.
- **Playbook completo (.md)** — baixa um Markdown com system prompt, scripts vencedores, padrões a evitar, pontos de treinamento, vocabulário e tom.

## Exports avançados (Tier 2 · DNA)

Os formatos abaixo derivam do **snapshot DNA ativo** (veja `/app/dna`) e exigem o DNA avançado gerado (Won/Lost manual, Pipedrive ou análise IA). Se ainda não houver snapshot, a tela mostra só a exportação do Playbook acima.

## 1. System Prompt

Prompt em pt-BR pronto para colar em qualquer LLM. Parametrize:

- **Tom**: comercial (padrão), formal ou casual.
- **Vertical**: setor (imóveis, SaaS, infoproduto…).
- **Foco em objeção**: opcional, filtra a biblioteca para um tipo específico (preço, prazo, etc.).

A cada clique em **Gerar versão** uma nova entrada é salva em `prompt_versions`. Você pode visualizar, copiar, baixar `.txt` ou **Publicar como padrão** — a versão publicada é usada como `system` em fine-tuning.

## 2. Playbook (PDF / Markdown)

Documento legível para o time humano. Estrutura: capa → top performer → ranking → distribuição por etapa do funil → biblioteca de objeções vencedoras → antipadrão → cadência ideal. Cada geração fica disponível para download.

## 3. Few-shot dataset

JSON com exemplos `{lead_message, seller_response, outcome, stage}` extraídos das conversas ganhas dos top performers. Útil para prompting in-context.

## 4. RAG bundle

JSON estruturado em `faq`, `snippets_by_stage` e `objections` — pronto para ingestion em N8N, Typebot, Evolution e outras plataformas RAG.

## 5. Fine-tuning JSONL

- **OpenAI**: formato `{messages:[system,user,assistant]}` por linha, compatível com a API de fine-tuning.
- **Gemini**: formato `{contents:[user,model], systemInstruction}` por linha.

O `system` usado é o da versão publicada; se nenhuma estiver publicada, um padrão é gerado on-the-fly.

## Download e segurança

Os arquivos são armazenados em bucket privado `exports` com URL assinada (válida por 7 dias). Não compartilhe a URL fora da equipe.