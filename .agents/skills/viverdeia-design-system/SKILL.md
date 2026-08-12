# Viver de IA — Design System (Agent Skill)

Você está operando com o design system do **Viver de IA** carregado. Use esta skill sempre que o usuário pedir pra desenhar, prototipar ou mockar interfaces, landing pages ou conteúdo na linguagem visual e verbal do Viver de IA.

## Comece aqui

1. **Leia `README.md`** — é o documento canônico. Regras de conteúdo, fundamentos visuais, racional de cor/tipo/espaçamento, iconografia e flags abertos moram lá. Tudo abaixo é ponteiro.
2. **Importe `colors_and_type.css`** em todo HTML que produzir:
   ```html
   <link rel="stylesheet" href="<caminho-relativo>/colors_and_type.css">
   ```
   Todos os tokens são variáveis CSS: `--via-navy`, `--via-blue`, `--via-bg`, `--via-fs-h1`, `--via-radius-lg`, `--via-shadow-card`, etc. Use elas — **não** escolha hex na mão.
3. **Sempre `<html lang="pt-BR">`**. Copy em português, direto, orientado à ação, falando com "você". Sem emoji em UI.

## De onde partir

- **Marketing (landing, hero, features, pricing, CTA, footer)** → copie de `ui_kits/viverdeia/`. `Sections.jsx` exporta `VmNav`, `VmHero`, `VmProof`, `VmFeatures`, `VmTestimonials`, `VmPricing`, `VmCta`, `VmFooter`.
- **Peças atômicas** (botão, badge, empty state, step wizard, stat card) → pegue de `preview/components-*.html`. São pequenas, auto-contidas, usam classes `.via-*` diretamente (sem React).
- **Produto logado (dashboard, tabelas, app shell)** → Viver de IA **ainda não tem kit de produto próprio**. Use `ui_kits/_reference-assina/` **só como referência de padrão SaaS** (estrutura de sidebar, anatomia de tabela, dashboard KPI). **Não copie** copy, logo ou nome. Quando for construir tela de produto, peça referência visual ao usuário ou construa novo em cima dos tokens `--via-*`.

## Regras verbais (as mais esquecidas)

- Português (pt-BR), sentence case em títulos, Title Case em status, CTA começa com verbo.
- Sem emoji em UI. Sem primeira pessoa. Sem hype.
- Acentos completos sempre (á, ã, ç, ó, ê). A codebase tem inconsistências; não replique.
- Números batem adjetivos: "Mais de 57 soluções prontas" > "muitas soluções".

## Regras visuais (as mais esquecidas)

- Superfície base **off-white morno** `--via-bg` `#F9F9F9` — não branco puro. Cards sobem pra `--via-white`.
- **Tinta é navy** `--via-navy` `#02162A` — nunca preto puro. Sidebar e dark bands usam o mesmo navy.
- **Único accent: azul** `--via-blue` `#0A4F95`. Não adicione um segundo accent sem pedido.
- **Corpo em Avenir LT Std Light (300)**, títulos Heavy (900). O contraste ultra-leve × ultra-pesado é a assinatura — não achate pra 400/700.
- Avenir não tem 600 de verdade; `font-weight: 600` cai no Heavy. Não desenhe contando com semibold.
- Bordas são estruturais — 1px em todo card / badge / input. Não confie só em sombra.
- Botões são pill (`--via-radius-pill`), texto em CAIXA ALTA, tracking `--via-ls-wide`.
- Ícones: Lucide via `https://unpkg.com/lucide@latest`. Stroke 1.5–2. 14–16px inline, 18–22px em nav.
- Escala de raio: 4 / 8 / 12 / 20 / 32 + pill. Sem quadrado, sem 2–3px.
- Transição 150ms ease, sem saltitante. Press: `scale(0.98)`.

## Flags abertas (pergunte se relevante)

- Fotos reais dos parceiros ainda pendentes — avatar tiles com iniciais.
- Site viverdeia.ai é JS-renderizado — mocks de marketing vêm do brief, não de captura real.
- Kit de produto do Viver de IA **não existe ainda**; construir exige referência visual do logado.
- Depoimentos e logos de clientes no kit de marketing são ilustrativos.

**Atenção:** `ui_kits/_reference-assina/` **não é Viver de IA**. É material de apoio que foi usado como referência visual de padrões SaaS. Não use copy, nome ou logo dele.

Quando em dúvida, leia o `README.md` inteiro.
