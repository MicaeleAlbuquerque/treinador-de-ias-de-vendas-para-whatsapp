# Visão geral

O Treinador WhatsApp transforma o histórico real de conversas do seu time de vendas em insumos prontos para treinar IAs e humanos. A ideia é simples: aprender com quem já vende bem na sua empresa, não com manuais genéricos.

## Fluxo macro

1. **Ingestão de Conversas**: captura em tempo real via Evolution API (webhook) ou importação manual de arquivos exportados do WhatsApp (`.txt` ou `.zip`), com identificação automática de nomes de contatos e transcrição de áudios via IA.
2. **Análise de DNA em Dois Níveis**:
   - **Tier 1 (Análise Básica)**: gera imediatamente o Playbook do Atendimento e pontua a qualidade das conversas por IA (Quality Score 0–100), funcionando mesmo sem CRM ou Won/Lost.
   - **Tier 2 (Análise Avançada)**: com o registro de desfecho (Won/Lost manual ou sincronizado com CRM Pipedrive), calcula o ranking dos top performers, funil de etapas com IA, biblioteca de objeções vencedoras e antipadrões estatísticos.
3. **Coach e Treinamento Contínuo**: audita mensagens da equipe com alertas compactos de saída do padrão e oferece uma Arena de Treinamento interativa para simulação de vendas com feedback imediato.
4. **Exportação de Artefatos**: gera system prompts customizados, playbooks completos, datasets few-shot, bundles para RAG e arquivos JSONL prontos para fine-tuning (OpenAI / Gemini).

## Modelo single-tenant

Cada cliente tem sua própria instância dedicada. Seus dados nunca atravessam fronteiras nem ficam em uma base compartilhada com outras empresas.

## Escopo

Esta versão é focada em **vendas via WhatsApp**. Outros perfis (SDR, cobrança, suporte, agendamento, CS) virão como produtos separados no futuro.