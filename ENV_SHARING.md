# Como compartilhar o projeto com colaboradores sem expor seu .env

Este repositório contém um arquivo `backend/.env.example` com as variáveis necessárias para rodar o projeto em desenvolvimento. **NÃO** envie o arquivo real `.env` para o repositório ou para forks públicos — ele contém chaves, senhas e endpoints privados.

Opções seguras para compartilhar acesso com colegas:

- Compartilhe as variáveis sensíveis em um canal seguro (mensagem direta criptografada, gerenciador de segredos da equipe, etc.). Peça para cada colega criar localmente um arquivo `.env` com os valores reais. Use o `backend/.env.example` como referência.
- Use um cofre de segredos (HashiCorp Vault, Azure Key Vault, 1Password/Team, Bitwarden) e dê permissões aos colaboradores.
- Para testes rápidos, crie credenciais temporárias (ex.: chaves com escopo reduzido/expiração) e compartilhe com tempo limitado.

Exemplo de onboarding para um colaborador:

1. Clone o repositório.
2. Copie o template para criar o `.env`:

   powershell
   Copy-Item backend\.env.example backend\.env

3. Substitua os placeholders em `backend/.env` pelas chaves/URLs que você recebeu de forma segura.
4. Rode `npm install` e então `npm run dev` no diretório `backend`.

Importante: nunca comite o arquivo `.env` no Git. O repositório já contém `.gitignore` para impedir isso.
