// Demo conversations seeded on first admin login. Realistic-ish Brazilian sales
// dialogues so the admin can explore the UI before plugging real WhatsApp.

export type DemoMessage = {
  sender_role: "seller" | "lead" | "system";
  ts: string; // ISO
  media_type: "text" | "audio";
  text?: string;
  audio_transcript?: string;
  audio_url?: string;
};

export type DemoConversation = {
  seller_name: string;
  lead_phone: string;
  lead_name_anon: string;
  outcome: "won" | "lost" | "in_progress" | "unknown";
  outcome_value?: number;
  outcome_at?: string;
  first_msg_at: string;
  last_msg_at: string;
  messages: DemoMessage[];
};

export const DEMO_SELLERS = [
  { name: "Carla Mendes", phone: "+5511999990001", email: "carla@demo.local" },
  { name: "Diego Souza", phone: "+5511999990002", email: "diego@demo.local" },
  { name: "Bruno Castro", phone: "+5511999990003", email: "bruno@demo.local" },
];

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    seller_name: "Carla Mendes",
    lead_phone: "+5511988887701",
    lead_name_anon: "Lead ***-7701",
    outcome: "won",
    outcome_value: 12000,
    outcome_at: "2026-05-12T18:30:00Z",
    first_msg_at: "2026-05-10T13:02:00Z",
    last_msg_at: "2026-05-12T18:30:00Z",
    messages: [
      { sender_role: "lead", ts: "2026-05-10T13:02:00Z", media_type: "text", text: "Oi, vi o anúncio de vocês sobre o curso de vendas. Pode me explicar?" },
      { sender_role: "seller", ts: "2026-05-10T13:05:12Z", media_type: "text", text: "Oi! Sou a Carla. Que bom que chegou. Posso te perguntar duas coisas antes pra te explicar do jeito mais útil pra você?" },
      { sender_role: "lead", ts: "2026-05-10T13:06:01Z", media_type: "text", text: "Claro." },
      { sender_role: "seller", ts: "2026-05-10T13:06:34Z", media_type: "text", text: "Você já vende hoje ou tá começando? E o que te fez procurar agora?" },
      { sender_role: "lead", ts: "2026-05-10T13:09:45Z", media_type: "text", text: "Vendo há 3 anos, mas o time tá batendo só 60% da meta. Tô buscando uma metodologia mais estruturada." },
      { sender_role: "seller", ts: "2026-05-10T13:11:09Z", media_type: "audio", audio_url: "demo://audio/01.ogg", audio_transcript: "Perfeito, esse é exatamente o cenário em que a gente mais consegue ajudar. O que a gente faz é estruturar discovery, qualificação e fechamento em três módulos práticos, com role-play semanal. Te mando o material e a gente marca uma call de 20 minutos pra eu te mostrar como adaptar pro seu time?" },
      { sender_role: "lead", ts: "2026-05-10T13:18:22Z", media_type: "text", text: "Pode mandar. Hoje à tarde dá pra falar." },
      { sender_role: "seller", ts: "2026-05-10T13:19:00Z", media_type: "text", text: "Fechado. Te chamo às 15h aqui mesmo." },
      { sender_role: "seller", ts: "2026-05-10T15:00:08Z", media_type: "text", text: "Oi, agora dá?" },
      { sender_role: "lead", ts: "2026-05-10T15:01:00Z", media_type: "text", text: "Dá sim." },
      { sender_role: "seller", ts: "2026-05-11T10:02:00Z", media_type: "text", text: "Bom dia! Como te falei ontem, vou te enviar a proposta. Investimento é R$ 12.000 pelos três módulos." },
      { sender_role: "lead", ts: "2026-05-11T11:45:00Z", media_type: "text", text: "Tá caro… consigo no boleto em 6x?" },
      { sender_role: "seller", ts: "2026-05-11T11:47:30Z", media_type: "text", text: "Caro comparado com o quê? Se a meta hoje tá em 60% e isso significa deixar de fechar 2 contratos por mês, em 3 meses o curso já se pagou. Posso parcelar 6x sim, sem juros." },
      { sender_role: "lead", ts: "2026-05-12T18:25:00Z", media_type: "text", text: "Fechado, pode mandar o link de pagamento." },
      { sender_role: "seller", ts: "2026-05-12T18:30:00Z", media_type: "text", text: "Show! Te mando agora. Bem-vindo." },
    ],
  },
  {
    seller_name: "Diego Souza",
    lead_phone: "+5511988887702",
    lead_name_anon: "Lead ***-7702",
    outcome: "lost",
    outcome_at: "2026-05-15T19:00:00Z",
    first_msg_at: "2026-05-13T09:30:00Z",
    last_msg_at: "2026-05-15T19:00:00Z",
    messages: [
      { sender_role: "lead", ts: "2026-05-13T09:30:00Z", media_type: "text", text: "Bom dia, vocês ainda tem vaga no curso?" },
      { sender_role: "seller", ts: "2026-05-13T09:31:10Z", media_type: "text", text: "Bom dia! Tem sim. Custa R$ 12.000. Manda seu nome completo que já te passo o boleto." },
      { sender_role: "lead", ts: "2026-05-13T09:35:00Z", media_type: "text", text: "Mas você nem sabe se serve pra mim..." },
      { sender_role: "seller", ts: "2026-05-13T09:36:00Z", media_type: "text", text: "O curso é bom pra qualquer vendedor. Quer que te mande o link?" },
      { sender_role: "lead", ts: "2026-05-13T09:40:00Z", media_type: "text", text: "Vou pensar." },
      { sender_role: "seller", ts: "2026-05-14T10:00:00Z", media_type: "text", text: "E aí, fechou?" },
      { sender_role: "lead", ts: "2026-05-14T18:00:00Z", media_type: "text", text: "Ainda tô avaliando outras opções." },
      { sender_role: "seller", ts: "2026-05-15T09:00:00Z", media_type: "text", text: "Tem desconto se fechar hoje, R$ 10.500." },
      { sender_role: "lead", ts: "2026-05-15T19:00:00Z", media_type: "text", text: "Vou ficar com outro fornecedor, obrigado." },
    ],
  },
  {
    seller_name: "Carla Mendes",
    lead_phone: "+5511988887703",
    lead_name_anon: "Lead ***-7703",
    outcome: "in_progress",
    first_msg_at: "2026-05-20T14:10:00Z",
    last_msg_at: "2026-05-23T16:40:00Z",
    messages: [
      { sender_role: "lead", ts: "2026-05-20T14:10:00Z", media_type: "text", text: "Oi, indicação do Pedro." },
      { sender_role: "seller", ts: "2026-05-20T14:12:00Z", media_type: "text", text: "Oi! O Pedro é figura. Me conta: o que ele falou que te interessou?" },
      { sender_role: "lead", ts: "2026-05-20T14:18:00Z", media_type: "text", text: "Ele disse que vocês ajudaram o time dele a triplicar conversão no inbound." },
      { sender_role: "seller", ts: "2026-05-20T14:20:30Z", media_type: "text", text: "Verdade. Eles passaram de 8% pra 24% em 4 meses. O que mais te preocupa hoje na sua operação?" },
      { sender_role: "lead", ts: "2026-05-22T11:00:00Z", media_type: "text", text: "Tempo de resposta. Lead chega e demora 4 horas pra alguém atender." },
      { sender_role: "seller", ts: "2026-05-22T11:03:00Z", media_type: "audio", audio_url: "demo://audio/02.ogg", audio_transcript: "Esse é o gargalo número um que a gente ataca. Posso te mandar um diagnóstico rápido em planilha pra você medir hoje, e na semana que vem a gente conversa sobre o programa. Te mando agora?" },
      { sender_role: "lead", ts: "2026-05-22T11:30:00Z", media_type: "text", text: "Manda." },
      { sender_role: "seller", ts: "2026-05-23T16:40:00Z", media_type: "text", text: "Oi, conseguiu preencher o diagnóstico?" },
    ],
  },
  {
    seller_name: "Bruno Castro",
    lead_phone: "+5511988887704",
    lead_name_anon: "Lead ***-7704",
    outcome: "won",
    outcome_value: 18000,
    outcome_at: "2026-05-21T17:00:00Z",
    first_msg_at: "2026-05-18T10:00:00Z",
    last_msg_at: "2026-05-21T17:00:00Z",
    messages: [
      { sender_role: "lead", ts: "2026-05-18T10:00:00Z", media_type: "text", text: "Quero saber sobre o programa enterprise." },
      { sender_role: "seller", ts: "2026-05-18T10:02:00Z", media_type: "text", text: "Oi! Sou o Bruno. Pra te falar do enterprise preciso entender o porte. Quantos vendedores hoje?" },
      { sender_role: "lead", ts: "2026-05-18T10:05:00Z", media_type: "text", text: "32 vendedores, time SDR + closer." },
      { sender_role: "seller", ts: "2026-05-18T10:07:00Z", media_type: "text", text: "Beleza. E o ticket médio que vocês trabalham?" },
      { sender_role: "lead", ts: "2026-05-18T10:10:00Z", media_type: "text", text: "R$ 4.500 mensais, contrato anual." },
      { sender_role: "seller", ts: "2026-05-18T10:14:00Z", media_type: "text", text: "Perfeito. O programa enterprise é R$ 18.000 e inclui playbook customizado + 3 meses de mentoria semanal com seus closers. Pra um time desse tamanho, payback médio é 6 semanas. Quer marcar uma call de 30 min com 2 pessoas suas pra eu mostrar o playbook que fizemos pra um caso parecido?" },
      { sender_role: "lead", ts: "2026-05-19T09:00:00Z", media_type: "text", text: "Quero, pode ser amanhã 14h?" },
      { sender_role: "seller", ts: "2026-05-21T16:55:00Z", media_type: "text", text: "Conforme combinado na call, segue o link de pagamento." },
      { sender_role: "lead", ts: "2026-05-21T17:00:00Z", media_type: "text", text: "Pago hoje à noite, valeu Bruno." },
    ],
  },
];