# Convidar membros

Convites são a forma oficial e segura de adicionar novos usuários à sua equipe após o primeiro administrador.

## Quem pode convidar

Apenas usuários com papel **admin** podem criar e gerenciar convites.

## Como funciona

1. Acesse o menu **Equipe** (`/app/team`).
2. Digite o e-mail do colaborador no campo de convite.
3. Clique em **Enviar convite**.
4. O sistema dispara o e-mail de acesso automaticamente através do serviço de autenticação (Supabase Auth SMTP) e copia o link exclusivo para a área de transferência como garantia.
5. Você também pode clicar em **Copiar link** a qualquer momento na lista de convites pendentes para repassar pelo WhatsApp ou Slack.

## Acesso em múltiplos aparelhos e rede local

Ao testar a aplicação em ambiente de desenvolvimento local, o sistema detecta de forma inteligente o endereço de rede local (IP da sua máquina na rede Wi-Fi/Ethernet) ao gerar o link:
- Isso permite que o colaborador (ou você mesmo) abra o link do e-mail diretamente pelo **smartphone ou outro computador na mesma rede Wi-Fi**, sem sofrer com erros de `localhost` recusado ou páginas em branco.

## Aceitando o convite

1. O convidado clica no link recebido no e-mail ou no link direto compartilhado (`/accept-invite/<token>`).
2. Se o convidado ainda não possuir conta, ele preenche o nome e cria sua senha de acesso.
3. Se já estiver logado ou se já tiver conta cadastrada, o sistema reconhece a sessão com segurança e vincula o acesso à equipe automaticamente.
4. Concluído o processo, o novo membro é direcionado diretamente para o painel principal (`/app`).