# Convidar membros

Convites são a forma oficial e segura de adicionar novos usuários à sua equipe após o primeiro administrador.

## Quem pode convidar

Apenas usuários com papel **admin** podem criar e gerenciar convites.

## Como funciona

### Opção 1: Convidar por E-mail / Link
1. Acesse o menu **Equipe** (`/app/team`).
2. Na aba **Convidar por E-mail / Link**, digite o e-mail do colaborador.
3. Clique em **Enviar convite**.
4. O sistema dispara o e-mail de acesso automaticamente através do serviço de autenticação (Supabase Auth SMTP) e copia o link exclusivo para a área de transferência como garantia.
5. Você também pode clicar em **Copiar link** ou **Código** a qualquer momento na lista de convites pendentes para repassar pelo WhatsApp ou Slack.

### Opção 2: Cadastrar Membro Imediatamente (Sem E-mail)
1. Acesse o menu **Equipe** (`/app/team`).
2. Selecione a aba **Cadastrar Imediatamente (Sem E-mail)**.
3. Preencha o Nome, E-mail de login, Senha inicial e o papel (Membro ou Administrador).
4. Clique em **Cadastrar Membro Agora**.
5. O colaborador é ativado instantaneamente no banco de dados e as credenciais são exibidas na tela com um botão **Copiar Credenciais**. Ele pode fazer login imediatamente em qualquer aparelho (celular, tablet ou PC) sem depender de links ou e-mails.

## Acesso em múltiplos aparelhos e rede

Ao trabalhar em desenvolvimento ou testar em smartphones:
- **Login Direto**: Ao usar o cadastro imediato ou a ativação direta, o usuário acessa normalmente a tela de login (`/auth/sign-in`) a partir de qualquer dispositivo.
- **Ativar convite pendente na hora**: Na lista de convites pendentes, o administrador pode clicar em **Ativar agora**, definir a senha e liberar o acesso do colaborador na mesma hora.
- **Recuperação de código**: Caso o link seja aberto em outro aparelho e a URL venha truncada, a tela de aceite disponibiliza um campo para colar o código ou link do convite manualmente.
- **Túnel para testes remotos**: Para expor a aplicação em HTTPS público para qualquer celular fora da rede, execute `npm run tunnel` e configure a variável `PUBLIC_BASE_URL` no `.env`.

## Aceitando o convite

1. O convidado clica no link recebido no e-mail ou no link direto compartilhado (`/accept-invite/<token>`).
2. Se o convidado ainda não possuir conta, ele preenche o nome e cria sua senha de acesso.
3. Se já estiver logado ou se já tiver conta cadastrada, o sistema reconhece a sessão com segurança e vincula o acesso à equipe automaticamente.
4. Concluído o processo, o novo membro é direcionado diretamente para o painel principal (`/app`).