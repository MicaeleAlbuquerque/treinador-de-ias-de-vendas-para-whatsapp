# Viver de IA — Design System

> A plataforma brasileira das empresas que crescem com **Inteligência Artificial**.
> **Plug & Play** para implementar IA na empresa de forma simples e imediata.

Este design system cobre a identidade visual e verbal do **Viver de IA** — tokens de marca, tipografia, componentes de produto e padrões de marketing. É o material de origem para qualquer designer ou agente produzir interfaces, landing pages, mocks ou HTML de produção na voz da marca.

---

## O que é Viver de IA

Plataforma brasileira para empresas que querem implementar IA de ponta a ponta:

- **Soluções** — 57+ soluções de IA prontas pra plugar em Vendas, Marketing, CS, Financeiro e RH.
- **AI Builder** — editor visual com 60+ blocos de IA pra montar fluxos sob medida.
- **Mentorias** — acompanhamento por operadores que já trilharam o caminho.
- **Formações** — trilhas guiadas pra times dominarem IA aplicada em semanas.
- **Comunidade** — rede de empresários brasileiros trocando práticas.

**Pessoas-chave:** Rafael Milagre (Founder), Yago Martins (CEO). Em parceria com os sócios do G4: Tallis Gomes, Alfredo Soares, Bruno Nardon.

**Site:** https://viverdeia.ai/

---

## Arquivos

- `README.md` — este arquivo (contexto + regras canônicas)
- `SKILL.md` — entrypoint quando carregado como Agent Skill
- `colors_and_type.css` — **arquivo canônico de tokens**. Variáveis `--via-*` (cor, tipografia, espaçamento, raio, sombra) + utilitários (`.via-btn`, `.via-card`, `.via-badge`, `.via-table`, …). No fim tem um bloco de aliases legados pros kits que usam nomes antigos.
- `fonts/` — Avenir LT Std (OTF local): Light 300, Light Oblique, Roman 400, Oblique, Heavy
- `assets/` — logo da marca (SVG placeholder) + `LOGOS_TODO.md`
- `preview/` — 18 cards do Design System (cores, tipografia, espaçamento, raios, sombras, componentes)
- `ui_kits/viverdeia/` — **kit de marketing do Viver de IA**: nav + hero + proof + features + testimonials + pricing + CTA + footer, rodando em `index.html` com React + Lucide via CDN
- `ui_kits/_reference-assina/` — **referência visual apenas** de padrões SaaS (app shell, tabela, dashboard). **Não é Viver de IA.** Use só como inspiração de padrão; nunca copie copy, logo ou nome.

---

## CONTENT FUNDAMENTALS

**Idioma** — Português (pt-BR). Todo copy, CTAs, empty states e mensagens de erro em português. Todo HTML root `lang="pt-BR"`.

**Voz** — Direta, competente em negócios, orientada à ação. A marca fala com **empresários e profissionais** — adultos implementando IA numa empresa. Sem hype, sem piada. Copy declarativo e focado em resultado.

**Você, não eu** — Sempre segunda pessoa (**você**). "Receba mentoria", "Acelere sua transformação", "Você escolhe, personaliza e aplica no mesmo dia". Nunca primeira pessoa.

**Caixa**
- Títulos e cabeçalhos de seção no produto: **Sentence case** ("Ações Rápidas", "Últimos Envelopes", "Novo Envelope").
- Rótulos de status: Title Case ("Em Andamento", "Concluído", "Rascunho").
- Botões: verbo primeiro ("Começar agora", "Nova solução", "Entrar").
- Headlines de marketing: sentence case com trechos em negrito pra ênfase.

**Exemplos de tom**
- "Acelere sua transformação com IA."
- "Plug & Play para implementar Inteligência Artificial na sua empresa de forma simples e imediata."
- "Você escolhe, personaliza com os dados da sua empresa e aplica no mesmo dia. Sem código, sem complicação."

**Números como prova** — Benefícios quantificados ("Mais de **57** soluções prontas", "Mais de **60** soluções de IA", "**milhares** de empresários"). Prefira números concretos a adjetivos vagos.

**Acentuação** — Sempre acentos completos (á, ã, ç, ó, ê). A codebase tem inconsistências (flagged como P2 em `docs/notas-frontend.md`). **Não replique esse bug.**

**Emoji** — Não usar em UI de produto. A iconografia Lucide já carrega o peso visual. **Não introduza emoji.**

**Clima** — B2B sério, moderno, pra mid-market brasileiro. Confiança sem bravata. "Já passou pelo caminho" — credibilidade de operador, não de guru.

---

## VISUAL FOUNDATIONS

Todos os tokens vivem em `colors_and_type.css` como variáveis `--via-*`. Os nomes abaixo batem 1:1 com o CSS.

### Cores

**Primitivas da marca**
- `--via-navy` `#02162A` — tinta primária, botão primário, superfícies escuras, sidebar. Navy sobre preto — **nunca** use preto puro.
- `--via-blue` `#0A4F95` — único accent secundário. CTAs, links, anel de foco, destaques.
- `--via-blue-light` `#E8F0FB` — azul tintado, usado como fundo de badge/chip.

**Neutros**
- `--via-white` `#FFFFFF` — cards, superfícies elevadas.
- `--via-bg` `#F9F9F9` — base da página (off-white morno, não branco puro).
- `--via-bg-2` `#F0F2F5` — fundo sutil de seção / cabeçalho de tabela.
- `--via-color-text-body` `#1C2B3A`, `--via-color-text-muted` `#6B7A8D` — corpo e rótulos discretos.

**Semânticas**
| Papel | Foreground | Background |
|---|---|---|
| Success | `--via-success` `#1F8A5C` | `--via-success-bg` `#E6F4ED` |
| Warning | `--via-warning` `#B8740D` | `--via-warning-bg` `#FBF0DF` |
| Danger  | `--via-danger`  `#B63A2F` | `--via-danger-bg`  `#FBEBE8` |

Cores semânticas aparecem como **fundo tintado + foreground escuro + borda equivalente** — nunca fundo sólido com texto branco (exceto no CTA destrutivo).

**Paleta utilitária** (`--via-util-1 … --via-util-6`) — azul / verde / âmbar / vermelho / roxo / teal. Use pra tags, categorias (Vendas/Marketing/CS/Financeiro/Produto/RH), séries de gráfico ou ciclar cor de avatar quando precisar distinguir N itens.

**Regras de uso**
- Um accent por vez. O default é `--via-blue`; `--via-navy` é tinta. Não adicione um terceiro accent.
- Navy em fundo claro, branco em fundo navy. Azul é a cor de interação.
- Fundos são **cores sólidas planas** — gradiente só como glow radial sutil no hero de marketing.

### Tipografia

- **Corpo:** `Avenir LT Std` (Light 300 + Roman 400 + Heavy 900, com obliques). Carregada local via `@font-face` a partir de `fonts/`. Alias: `--via-font`.
- **Mono:** monospace do sistema (`ui-monospace`).

**Escala** (toda definida como `--via-fs-*`)
| Nome | Tamanho | Peso | Uso |
|---|---|---|---|
| `display` | 48px | 900 | Só headline de hero |
| `h1` | 36px | 900 | Título de página (produto), headline de seção (marketing) |
| `h2` | 28px | 900 | Subseção |
| `h3` | 20px | 900 | Título de card |
| `body` | 16px | 300 | Corpo |
| `sm` | 14px | 300 | Copy secundário, linha de tabela |
| `xs` | 12px | 700 | Badge, caption |
| `label` | 10px | 700 | Rótulos em caixa alta, stat labels |

> **Nota sobre pesos:** Avenir LT Std tem Light (300), Roman (400) e Heavy (mapeado em 700–900). **Não tem um 600 de verdade.** Qualquer CSS pedindo `font-weight: 600` cai no Heavy via range do `@font-face` — visualmente funciona, mas não desenhe contando com um semibold genuíno.

**Letter-spacing**
- `--via-ls-brand` `0.22em` — wordmark "VIVER DE IA" (só aqui)
- `--via-ls-label` `0.12em` — rótulos em caixa alta + badges + cabeçalho de tabela
- `--via-ls-wide` `0.06em` — botões, links de nav

Corpo no **Light (300)**, títulos no **Heavy (900)**. O contraste entre corpo ultra-leve e títulos ultra-pesados é a assinatura do sistema — não achate pra 400/700.

### Espaçamento

Escala base 4px — `--via-space-1` (4px) → `--via-space-20` (80px). Em UI de produto use `--via-space-4`/`-6` dentro de cards e entre fields. Seções de marketing usam `--via-space-20` em cima e embaixo.

### Raios

`--via-radius-sm` 4px · `-md` 8px · `-lg` 12px (default de cards) · `-xl` 20px · `-2xl` 32px · `-pill` total.

**Pills** (`--via-radius-pill`) são o raio de botão — todos os `.via-btn` são pill. Badges e chips usam `--via-radius-sm` (4px).

### Sombras

- `--via-shadow-card` — elevação base de card (`0 1px 3px + 0 4px 16px` navy, alfa bem baixo).
- `--via-shadow-raised` — popover / modal.
- `--via-shadow-focus` — `0 0 0 3px` azul em 25% — anel de foco de input.

Sombras **tintadas de navy**, nunca pretas. A borda de 1px faz a maior parte do trabalho — bordas são estruturais.

### Motion

- `--via-transition` 150ms ease — cor, borda, fundo na maioria das interações.
- `--via-transition-slow` 300ms ease — movimentos maiores.
- No press de botão: `transform: scale(0.98)`. Sem easing saltitante.

### Bordas

1px em cards / inputs / badges / linhas de tabela. `--via-border` usa navy a 15% alfa (0.5px em hairlines, 1px em estrutura). Em fundo escuro: `rgba(255,255,255,0.08–0.12)`.

### Layout

- `--via-container` 1200px de largura máxima pra marketing.
- `--via-content` 760px pra colunas de leitura.
- Seções de marketing usam container interno de 1120px.

---

## ICONOGRAFIA

**Biblioteca primária: Lucide** (via `https://unpkg.com/lucide@latest`). Stroke-based, peso 1.5–2px, cantos arredondados.

**Glyphs mais usados**
`sparkles, workflow, bot, graduation-cap, shield-check, bar-chart-3, layout-dashboard, layers, file-text, users, settings, clock, user, log-out, menu, x, bell, download, plus, send, filter, check-circle, alert-triangle, upload, shield, eye, trash, copy, play-circle, arrow-right, chevron-down, check`

**Tamanhos**
- Inline em botões / células: 14–16px
- Itens de nav / ícones de canto de card: 18–22px
- Brand lockup: 22–26px
- Illustrations de empty-state: 40px + stroke-width 1.5

**Cor** — ícones herdam a cor do texto do parent. Override pra `--via-blue` em afforcance interativo, `--via-success/-warning/-danger` em estado semântico, `rgba(255,255,255,.55)` em ícones passivos sobre fundo escuro.

**Brand lockup:** arquivos SVG oficiais em `assets/` — `viverdeia-lockup-black.svg` / `-white.svg` (lockup completo) e `viverdeia-icon-black.svg` / `-white.svg` (só ícone). Use lockup em nav, footer, documentos; ícone em favicon, avatar, contextos apertados.

**Não** introduza emoji como iconografia. **Não** desenhe SVG decorativo do zero — deixe um placeholder com caption e sinalize pro usuário.

---

## FLAGS (coisas que precisam do usuário)

1. **Fotos reais dos parceiros** (Rafael, Yago, Tallis, Alfredo, Bruno) — tiles de avatar com iniciais estão como placeholder.
2. **Screenshots reais da plataforma** — a construção do kit de produto aguarda referência visual do logado (o material do Assina em `ui_kits/_reference-assina/` é **só referência**, não é Viver de IA).
3. **Logos de clientes e depoimentos reais** — os da proof-bar e dos testimonials hoje são ilustrativos.

---

## Quick start

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../colors_and_type.css">
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
  <button class="via-btn via-btn-primary">Começar agora</button>
  <span class="via-badge via-badge-success">Ativo</span>
  <!-- … -->
  <script>lucide.createIcons()</script>
</body>
</html>
```

Pra marketing completa, copie de `ui_kits/viverdeia/`. Pra padrões de produto logado, use `ui_kits/_reference-assina/` **apenas como inspiração** de estrutura (app shell, tabela, dashboard) — nunca replique copy ou marca.
