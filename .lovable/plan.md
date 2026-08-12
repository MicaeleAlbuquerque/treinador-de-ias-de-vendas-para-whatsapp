## Diagnóstico

Dois problemas distintos:

**1. Pareamento falha ("não foi possível conectar, tente mais tarde")**
- Nosso `PairSheet` chama `refreshWhatsAppInstance` a cada **3s**. Essa serverFn bate em `/instance/connect` da Evolution toda vez, o que faz a Evolution **rotacionar o QR** em alta frequência. O usuário escaneia um QR já invalidado.
- Renderizamos apenas `qrBase64`. A Evolution às vezes devolve só `code` (texto). Sem `qrcode` lib pra converter, a imagem fica vazia.
- Não há separação entre "polling barato de status" e "buscar novo QR".

**2. Visual não espelha a referência**
- Hoje: formulário inline simples dentro da aba "WhatsApp" de Configurações.
- Referência: card grid de instâncias, modal "Nova instância" rico (banner azul, Accordion "Como encontrar esses dados?", checklist "Ao salvar, automaticamente..."), InstanceCard com webhook URL copiável, StatusBadge colorido, ações em botões pequenos com ícones.

## Mudanças

### 1. Backend — separar polling de QR refresh

`src/lib/whatsapp.functions.ts`: adicionar uma nova serverFn **leve** que só lê o DB (sem bater na Evolution). Manter `refreshWhatsAppInstance` para refresh manual.

```ts
export const getWhatsAppInstanceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string }) =>
    z.object({ instanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, status, qr_code_url, last_sync_at, last_error")
      .eq("id", data.instanceId).maybeSingle();
    return row;
  });
```

Adicionalmente, `refreshWhatsAppInstance` continua igual mas será disparado **manualmente** pelo botão "Atualizar QR" e **automaticamente** a cada **25s** (não 3s) — alinhado ao ciclo natural de rotação do QR da Evolution.

`src/lib/evolution.server.ts`: nenhuma mudança necessária — `pickQrPayload` já retorna `{ base64, code }`, só precisamos consumir `code` no frontend.

### 2. Frontend — instalar `qrcode` e renderizar code→dataURL

```bash
bun add qrcode @types/qrcode
```

No PairSheet:
- Se `qrBase64` existir → usa direto.
- Senão se `code` existir → `QRCode.toDataURL(code, { width: 256, margin: 1 })`.
- Senão → placeholder "Atualizar QR".

Para isso `refreshWhatsAppInstance` precisa devolver também `qrCode: string | null` (já existe `pickQrPayload` retornando code, só propagar no return).

### 3. Frontend — redesenhar WhatsAppSettings na aba

Manter na rota `/app/settings` aba "WhatsApp" (não criar rota nova). Substituir a estrutura "lista inline + form inline" pela estrutura da referência:

```text
┌─ Header: "Conecte sua instância via Evolution API" + botão [+ Nova instância]
│
├─ Grid 1col/2col de InstanceCard (hoje single-tenant tem só 1, mas suportar visualmente):
│   ┌──────────────────────────────────────┐
│   │ 🟢 ícone │ Nome instância    [Badge] │
│   │           Evolution API               │
│   │                                       │
│   │ 🪝 Webhook configurado automaticamente│
│   │ ┌──────────────────────────┐ [📋]   │
│   │ │ https://...               │         │
│   │ └──────────────────────────┘         │
│   │                                       │
│   │ [QR Conectar via QR] [⚡Diagnosticar]│
│   │ [📥 Importar histórico]     [🗑 Remover]│
│   └──────────────────────────────────────┘
│
└─ PairSheet (lateral direita) e Dialogs
```

Componentes novos no mesmo arquivo `src/routes/app.settings.tsx`:
- `<NewInstanceDialog>` — modal com banner explicativo, 4 campos (Apelido interno, Base URL, API Key, Nome instância), Accordion "Como encontrar esses dados?" com Step 1-4, bloco final "Ao salvar, automaticamente:" com 4 CheckLines. Mesmo copy da referência.
- `<InstanceCard>` — card visual com header (ícone+nome+StatusBadge), bloco webhook com botão copiar, footer de ações.
- `<StatusBadge>` — pílula colorida (`bg-success/15 text-success` etc).
- `<Step>` e `<CheckLine>` — helpers do dialog.
- `<DiagnosticDialog>` — substitui o `<pre>{JSON.stringify(diagnosis)}</pre>` por uma tabela legível (Base URL acessível ✓, API Key válida ✓, Instância existe ✓, estado remoto, endpoints testados).

PairSheet reescrito:
- Hook `useQuery(["pair-state", id], getWhatsAppInstanceState, refetchInterval: 3000)` — polling barato, só DB.
- Hook `useQuery(["pair-qr", id], refreshWhatsAppInstance, refetchInterval: 25000, refetchOnMount: true)` — refresh real do QR (chama Evolution) a cada 25s e na abertura.
- `useEffect` que converte `code` → dataURL com `qrcode` quando não há base64.
- Auto-close + toast quando `state.status === "connected"`.
- Botão "Atualizar QR" dispara o refetch do segundo query manualmente.

### 4. Notas técnicas (seção sob plano para clareza)

- Mantemos `WhatsAppSettings` no arquivo `src/routes/app.settings.tsx` para não fragmentar — só reescreve as funções internas (`WhatsAppSettings`, `PairSheet`) e adiciona os subcomponentes acima.
- `webhookUrl` no card será derivada de `whatsapp_instances.webhook_token` igual à referência: hoje guardamos apenas o token; precisamos expor o token no select (`webhook_token`) e montar `${PROJECT_BASE_URL}/api/public/whatsapp-webhook?token=${token}`.
- `qrcode` é Node-pure (sem dependências nativas), compatível com Worker.
- Userguide: atualizar `src/content/help/conectar-whatsapp.md` mencionando o novo fluxo do Sheet e o botão "Atualizar QR".

## Validação

1. Criar instância → modal abre com guia em 3 passos visíveis.
2. Salvar → card aparece com badge "Conectando" + webhook URL + PairSheet abre automaticamente.
3. QR renderiza em ≤3s (base64 OU code via qrcode lib).
4. Polling de status (3s) **não** invalida o QR no celular.
5. Botão "Atualizar QR" troca a imagem sob demanda.
6. Auto-refresh do QR só a cada 25s.
7. Após escanear, status muda pra `connected` em ≤3s, toast aparece, sheet fecha, card mostra badge verde "Conectado".

## Não fazer

- Não criar rota nova `/app/instances` — manter na aba "WhatsApp" de `/app/settings`.
- Não mexer em `evolution.server.ts`, webhook routes, ou outras abas (Vendedores, Horário, IA, Integrações, Empresa, Conta).
- Não alterar schema do banco.
- Não tocar em `createWhatsAppInstance` além de garantir que devolve `webhook_token` no return.
