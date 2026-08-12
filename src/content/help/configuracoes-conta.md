# Conta

Na aba **Conta** de `/app/settings`, cada usuário gerencia seus próprios dados.

## O que você pode editar

- **Nome de exibição**: aparece em listas e no menu superior.
- **Senha**: troca por uma nova. É preciso confirmar a senha atual.
- **Sair**: encerra a sessão e volta para `/auth/sign-in`.

## E-mail

O e-mail de login não é editável diretamente nesta tela. Para trocar, peça a um admin.

## Chave OpenAI (BYOK) e provedor de IA

Na aba **Conta da IA** de `/app/settings` você pode cadastrar sua própria chave OpenAI. Ative **Usar BYOK OpenAI**, cole a chave em `OPENAI_API_KEY` e salve. Depois de salva, o campo mostra "configurado ✓" — deixe em branco para manter a chave atual.

Com a chave cadastrada, o sistema passa a usar a **OpenAI** (modelo `gpt-4o-mini`) para gerar **todos os outputs de IA**: avaliação de qualidade das conversas (quality score), geração do Playbook, classificação por etapa e a Coach.

- **Sem chave OpenAI**, o sistema usa o **Lovable AI Gateway (Gemini 2.5 Flash)** como padrão.
- O Lovable AI também funciona como **fallback automático**: se uma chamada à OpenAI falhar no meio do caminho, o sistema cai para o Gemini sozinho, sem interromper a operação.
- O provedor e o modelo realmente usados ficam **registrados** em cada conversa avaliada e em cada versão de Playbook gerada — assim você sempre sabe o que produziu cada resultado.