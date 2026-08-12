import visaoGeral from "./visao-geral.md?raw";
import primeiroAcesso from "./primeiro-acesso.md?raw";
import login from "./login.md?raw";
import convidarMembros from "./convidar-membros.md?raw";
import gerenciarEquipe from "./gerenciar-equipe.md?raw";
import configuracoesConta from "./configuracoes-conta.md?raw";
import configuracoesEmpresa from "./configuracoes-empresa.md?raw";
import conversas from "./conversas.md?raw";
import dna from "./dna.md?raw";
import prompts from "./prompts.md?raw";
import versionamento from "./versionamento.md?raw";
import privacidade from "./privacidade.md?raw";
import conectarWhatsapp from "./conectar-whatsapp.md?raw";
import vendedores from "./vendedores.md?raw";
import pipedrive from "./pipedrive.md?raw";
import coachMode from "./coach-mode.md?raw";

export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  content: string;
};

export const helpArticles: HelpArticle[] = [
  { slug: "visao-geral", title: "Visão geral", category: "Começando", content: visaoGeral },
  { slug: "primeiro-acesso", title: "Primeiro acesso", category: "Começando", content: primeiroAcesso },
  { slug: "login", title: "Entrar e recuperar senha", category: "Acesso e usuários", content: login },
  { slug: "convidar-membros", title: "Convidar membros", category: "Acesso e usuários", content: convidarMembros },
  { slug: "gerenciar-equipe", title: "Gerenciar equipe", category: "Acesso e usuários", content: gerenciarEquipe },
  { slug: "configuracoes-conta", title: "Conta", category: "Configurações", content: configuracoesConta },
  { slug: "configuracoes-empresa", title: "Empresa", category: "Configurações", content: configuracoesEmpresa },
  { slug: "conectar-whatsapp", title: "Conectar WhatsApp", category: "Configurações", content: conectarWhatsapp },
  { slug: "vendedores", title: "Vendedores", category: "Configurações", content: vendedores },
  { slug: "conversas", title: "Conversas", category: "Recursos por fase", content: conversas },
  { slug: "dna", title: "DNA (Fase 3)", category: "Recursos por fase", content: dna },
  { slug: "prompts", title: "Prompts e playbooks (Fase 4)", category: "Recursos por fase", content: prompts },
  { slug: "versionamento", title: "Versionamento DNA", category: "Recursos por fase", content: versionamento },
  { slug: "privacidade", title: "Privacidade e segurança", category: "Privacidade", content: privacidade },
  { slug: "pipedrive", title: "Pipedrive", category: "Integrações", content: pipedrive },
  { slug: "coach-mode", title: "Coach mode (Fase 5)", category: "Integrações", content: coachMode },
];

export const helpCategories = [
  "Começando",
  "Acesso e usuários",
  "Configurações",
  "Recursos por fase",
  "Integrações",
  "Privacidade",
] as const;

export function getArticle(slug: string): HelpArticle | undefined {
  return helpArticles.find((a) => a.slug === slug);
}