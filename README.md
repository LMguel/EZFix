# EZFix - Sistema de Correção de Redações

Sistema completo de correção de redações com OCR (reconhecimento de texto) e avaliação automática usando IA.

## 🚀 Funcionalidades

### Backend (API)

- **Autenticação**: Registro e login de usuários com JWT
- **Redações**: Upload, OCR automático e geração de nota via IA
- **Avaliações**: Sistema de avaliação por competências (ENEM)
- **OCR**: Extração de texto de imagens usando Tesseract.js
- **Nota Automática**: Algoritmo simples de pontuação baseado no texto

### Frontend (React)

- **Interface Moderna**: Dashboard baseado no design fornecido
- **Login/Registro**: Tela de autenticação completa
- **Upload de Redações**: Interface para enviar imagens para OCR
- **Visualização**: Lista de redações com status e notas
- **Responsivo**: Design adaptável para diferentes telas

## 📋 Pré-requisitos

- Node.js (versão 18+)
- PostgreSQL
- npm ou yarn

## 🛠️ Configuração e Execução

### 1. Backend

```powershell
# Ir para a pasta do backend
cd backend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
# Criar arquivo .env com:
DATABASE_URL="postgresql://usuario:senha@localhost:5432/ezfix"
JWT_SECRET="seu-segredo-super-secreto"
PORT=3000

# Configurar banco de dados
npx prisma generate
npx prisma migrate dev --name init

# Criar usuário de teste (opcional)
node scripts/seedUser.js

# Executar em modo desenvolvimento
npm run dev
```

#### Configuração do LLM (Azure/OpenAI)

O serviço de formatação/avaliação usa Azure OpenAI por padrão quando configurado. Em caso de bloqueio por content filter, é possível habilitar fallback para a API pública da OpenAI.

Variáveis de ambiente relevantes (veja `backend/.env.example`):

- Azure OpenAI
  - `AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com`
  - `AZURE_OPENAI_KEY=...`
  - `AZURE_OPENAI_DEPLOYMENT=<deployment>`
  - `AZURE_OPENAI_API_VERSION=2024-11-22`
- OpenAI (fallback opcional)
  - `LLM_ALLOW_OPENAI_FALLBACK=true`
  - `OPENAI_API_KEY=...`

Notas:

- Alguns deployments do Azure não aceitam `temperature` customizado; por isso não enviamos este parâmetro.
- Parâmetro de tokens: usamos `max_completion_tokens` e caímos para `max_tokens` quando necessário.
- Em caso de erro de content filter no Azure, o serviço tenta novamente com um prompt sanitizado (system + user). Se ainda bloquear e o fallback estiver habilitado com `OPENAI_API_KEY`, cai para OpenAI.
- Se nenhum LLM puder ser chamado, o backend devolve o texto limpo do OCR sem formatação avançada.

### 2. Frontend

```powershell
# Ir para a pasta do frontend
cd frontend

# Instalar dependências
npm install

# Executar em modo desenvolvimento
npm start
```

O frontend estará disponível em `http://localhost:3001` e o backend em `http://localhost:3000`.

## 🔗 Endpoints da API

### Autenticação

- `POST /auth/register` - Registrar usuário
- `POST /auth/login` - Fazer login

### Redações (Requer autenticação)

- `GET /redacoes` - Listar redações do usuário
- `GET /redacoes/:id` - Obter redação específica
- `POST /redacoes` - Criar nova redação (executa OCR)
- `PUT /redacoes/:id` - Atualizar redação
- `DELETE /redacoes/:id` - Excluir redação

### Avaliações (Requer autenticação)

- `GET /avaliacoes/redacao/:redacaoId` - Listar avaliações de uma redação
- `POST /avaliacoes` - Criar avaliação
- `PUT /avaliacoes/:id` - Atualizar avaliação
- `DELETE /avaliacoes/:id` - Excluir avaliação

## 📊 Como Testar

### 1. Teste Básico via Frontend

1. Acesse `http://localhost:3001`
2. Registre um novo usuário ou faça login
3. No dashboard, clique em "OCR Scanner"
4. Adicione título e URL de uma imagem com texto
5. Aguarde o processamento do OCR

### 2. Teste via API (PowerShell)

```powershell
# Registrar usuário
$registerBody = @{
    nome = "Teste"
    email = "teste@email.com"
    senha = "123456"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/auth/register -Method Post -Body $registerBody -ContentType "application/json"

# Fazer login
$loginBody = @{
    email = "teste@email.com"
    senha = "123456"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri http://localhost:3000/auth/login -Method Post -Body $loginBody -ContentType "application/json"
$token = $response.token

# Criar redação (executa OCR)
$redacaoBody = @{
    titulo = "Redação de Teste"
    imagemUrl = "https://via.placeholder.com/500x300/000000/FFFFFF?text=Texto+de+Exemplo"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/redacoes -Method Post -Body $redacaoBody -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}

# Listar redações
Invoke-RestMethod -Uri http://localhost:3000/redacoes -Headers @{Authorization = "Bearer $token"}
```

## 🏗️ Estrutura do Projeto

```
EZFix/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── scripts/
│   │   ├── seedUser.js
│   │   └── genToken.js
│   └── src/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       └── types.d.ts
└── frontend/
    ├── public/
    └── src/
        ├── components/
        ├── pages/
        ├── services/
        └── types/
```

## 🔧 Tecnologias Utilizadas

### Backend

- Node.js + Express
- TypeScript
- Prisma (ORM)
- PostgreSQL
- JWT (autenticação)
- Tesseract.js (OCR)
- bcryptjs (hash de senhas)

### Frontend

- React + TypeScript
- Tailwind CSS
- React Router
- Axios (requisições HTTP)

## 📝 Notas Importantes

1. **OCR**: O Tesseract.js pode demorar para processar imagens. Em produção, considere usar um serviço dedicado de OCR.

2. **URLs de Imagem**: Para teste, use URLs públicas de imagens com texto legível.

3. **Banco de Dados**: Certifique-se de que o PostgreSQL está rodando e acessível.

4. **CORS**: O backend está configurado para aceitar requisições de qualquer origem em desenvolvimento.

5. **Avaliações**: O sistema calcula a nota final combinando a nota gerada automaticamente com a média das avaliações humanas.

## 🐛 Problemas Comuns

- **Erro de conexão com banco**: Verifique a `DATABASE_URL` no arquivo `.env`
- **Token inválido**: Verifique se o `JWT_SECRET` é o mesmo no backend
- **OCR falha**: Teste com imagens claras e com texto bem definido
- **CORS**: Se houver problemas de CORS, verifique se o backend está rodando na porta 3000

## 🚀 Próximos Passos

- Implementar upload de arquivos real (em vez de URLs)
- Melhorar algoritmo de avaliação automática
- Adicionar mais padrões de correção além do ENEM
- Implementar sistema de turmas e alunos
- Adicionar relatórios e estatísticas avançadas
