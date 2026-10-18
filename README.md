# NZI MAFIA — SISTEMA DE LOGIN & BACK-END DO DASHBOARD

> **Aviso de Segurança:** ACESSO RESTRITO APENAS PARA MEMBROS  
> **Foco:** Dinheiro primeiro. O resto vem depois.

---

## 🛠️ Tecnologias e Arquitetura

- **Back-end:** Node.js + Express (API RESTful + Autenticação Criptografada)
- **Segurança & Controle:** 
  - PIN numérico estritamente validado com **exatamente 6 dígitos numéricos** (`/^\d{6}$/`)
  - Hash criptográfico com `bcryptjs`
  - Sessão e tokens via `jsonwebtoken` (JWT) em cookies seguros HTTP-Only e cabeçalho `Authorization: Bearer <token>`
  - Proteção contra força bruta (Rate limiting de tentativas incorretas com PIN de 6 dígitos)
  - Mensagens de rejeição padronizadas: *"Acesso restrito apenas para membros."*
  - Logs de auditoria automáticos com registro de IP, codinome, cargo, data/hora e status
  - Proteção de rota no servidor: qualquer tentativa de acessar `/dashboard` sem sessão autenticada redireciona automaticamente para `/login`
  - Redirecionamento da rota legada `/acesso` para `/login`
- **Front-end:** HTML5, CSS3 estilizado (estética cyberpunk/hacker dark red & black), JavaScript Vanilla com digitação automática nos 6 blocos do PIN e teclado virtual numérico.

---

## 🚀 Como Iniciar o Servidor

```bash
# Iniciar o servidor
npm start

# Ou modo desenvolvimento com auto-reload
npm run dev
```

O servidor roda por padrão na porta **3000**:
- **Página Principal (Hierarquia):** [http://localhost:3000/](http://localhost:3000/)
- **Login de membros (PIN de 6 dígitos):** [http://localhost:3000/login](http://localhost:3000/login)
- **Dashboard dos Membros:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard) — abas: Dashboard, Cofre, Operações, Mural, **CC, Painel, Conta Discord, Central de Links, Eventos, Galeria**, Hierarquia, Segurança, Auditoria
- **Central de Entretenimento:** [http://localhost:3000/entretenimento](http://localhost:3000/entretenimento)

---

## 🔐 Membros da Hierarquia & PINs de 6 Dígitos para Teste

Todos os 10 integrantes da Nzi Mafia foram cadastrados com um PIN padrão de 6 dígitos no back-end. Cada membro pode alterar seu PIN no próprio dashboard.

| Nível | Cargo | Codinome | PIN Padrão (6 dígitos) | Cota do Lucro |
|---|---|---|---|---|
| **Nível 1** | Owner (Dono) | `ph_labubu` (Ph Labubu) | `777001` | **40%** |
| **Nível 2** | Founder (Fundador) | `dg` (DG) | `777002` | **25%** |
| **Nível 3** | Posse | `god` (God) | `777003` | **7.5%** |
| **Nível 3** | Posse | `fact` (Fact) | `777004` | **7.5%** |
| **Nível 4** | Member | `anny` (Anny) | `777005` | **4%** |
| **Nível 4** | Member | `havoc` (Havoc) | `777006` | **4%** |
| **Nível 4** | Member | `necro` (Necro) | `777007` | **4%** |
| **Nível 4** | Member | `sys` (SyS) | `777008` | **4%** |
| **Nível 4** | Member | `kage` (Kage) | `777009` | **4%** |

---

## 📂 Endpoints da API Back-end

### 🔑 Autenticação e Segurança (Login com PIN de 6 Dígitos)
- `POST /api/auth/login`: Autentica o membro validando estritamente o PIN de 6 dígitos numéricos. Verifica rate limit, credenciais e emite JWT.
- `POST /api/auth/logout`: Encerra a sessão e apaga cookie seguro de login.
- `GET /api/auth/current`: Retorna o status da sessão atual (se autenticado, perfil e flag `isAdmin`).
- `GET /api/auth/me`: Retorna os dados do membro logado (requer autenticação).
- `POST /api/auth/change-pin`: Permite ao membro autenticado trocar seu PIN por outro de 6 dígitos numéricos com hash seguro.
- `POST /api/auth/register-admin`: Cadastra um novo administrador no sistema com PIN de 6 dígitos.
- `GET /api/members/public`: Lista pública apenas de codinomes para o seletor da tela de login.

### 🌐 Endpoints Públicos (Sem necessidade de login)
- `GET /api/public/stats`: Retorna as contagens reais de publicações por categoria (CC, Painel, Conta Discord, Central de Links, Eventos), contagem de eventos confirmados/ativos e as últimas 5 publicações cadastradas.
- `GET /api/public/posts?category=CC&search=...`: Retorna as publicações com status "Publicado", filtradas por categoria ou busca.
- `GET /api/public/posts/:id`: Retorna os detalhes de uma publicação pública.
- `GET /api/public/events?status=...&search=...`: Retorna eventos com data/hora configurada, status e temporizador regressivo.
- `GET /api/public/events/:id`: Detalhes de um evento público.
- `GET /api/public/links`: Retorna as informações dos 4 aplicativos oficiais: **Root**, **Discord**, **Telegram** e **TikTok**, com status de disponibilidade.
- `GET /api/public/discord`: Retorna as contas e bots autorizados para divulgação pública (sem expor nenhuma credencial ou token).

### 🛠️ Painel de Operações & Administração (`requireAdminAuth` - Níveis 1 e 2)
- **Publicações:**
  - `GET /api/admin/posts`: Lista todas as publicações (incluindo rascunhos e despublicadas).
  - `POST /api/admin/posts`: Cadastra nova publicação (CC, Painel, Conta Discord, Central de Links, Eventos).
  - `PUT /api/admin/posts/:id`: Edita título, descrição, imagem, link, status e categoria de uma publicação.
  - `PATCH /api/admin/posts/:id/publish`: Alterna o status entre "Publicado" e "Despublicado".
  - `DELETE /api/admin/posts/:id`: Exclui permanentemente a publicação do banco de dados persistente.
- **Central de Links:**
  - `GET /api/admin/links`: Retorna a configuração dos 4 aplicativos.
  - `PUT /api/admin/links/:appKey`: Atualiza individualmente a URL e descrição do app (`root`, `discord`, `telegram`, `tiktok`), validando protocolo HTTPS.
- **Eventos & Temporizadores:**
  - `GET /api/admin/events`: Lista todos os eventos cadastrados.
  - `POST /api/admin/events`: Cria evento com data, horário, fuso horário, horários de início/fim e status (Agendado, Confirmado, Em andamento, Finalizado, Cancelado).
  - `PUT /api/admin/events/:id`: Atualiza dados do evento.
  - `PATCH /api/admin/events/:id/status`: Altera manualmente o status do evento.
  - `PATCH /api/admin/events/:id/publish`: Publica ou despublica o evento.
  - `DELETE /api/admin/events/:id`: Exclui o evento.
- **Contas Discord & Cofre Criptografado:**
  - `GET /api/admin/discord`: Lista contas e bots com metadados.
  - `POST /api/admin/discord`: Cadastra conta ou bot com credencial sensível criptografada com AES-256 no servidor.
  - `PUT /api/admin/discord/:id`: Atualiza dados da conta.
  - `DELETE /api/admin/discord/:id`: Exclui conta.
  - `POST /api/admin/discord/:id/reveal`: Revela a credencial sensível mediante confirmação de PIN do administrador, gerando registro no histórico de auditoria.
- **Gestão de Integrantes:**
  - `POST /api/admin/users`: Cadastra novo integrante ou administrador com codinome, nome, nível e PIN de 6 dígitos.

---

## 🔒 Segurança & Proteção de Dados

1. **Autenticação Administrativa no Servidor:** Todas as rotas de Operações usam o middleware `requireAdminAuth`, que valida a sessão JWT e o nível hierárquico (Nível 1 Dono ou Nível 2 Fundador). Requisições não autorizadas são bloqueadas com `401 Unauthorized` ou `403 Forbidden`.
2. **Criptografia AES-256-GCM:** Tokens e senhas do Discord são criptografados com chave derivada de `JWT_SECRET` e armazenados no banco persistente em `data/database.json`. Nenhuma credencial é exposta em URLs, logs, código cliente ou respostas públicas da API.
3. **Temporizadores Regressivos Dinâmicos:** A contagem regressiva nos cards de Eventos é calculada a cada segundo em tempo real a partir da data e hora reais cadastradas em Operações. Ao atingir zero, o temporizador é interrompido sem alterar falsamente o status do evento.
4. **Validação de Protocolo:** As URLs da Central de Links exigem obrigatoriamente protocolo seguro `https://` (ou esquemas oficiais como `tg://` e `discord://`). Links em branco são marcados como "indisponíveis", impedindo botões quebrados.

---

## 🚀 Como Cadastrar o Primeiro Administrador

O sistema já vem pré-configurado com dois administradores padrão:
- **Owner (Dono):** Codinome: `ph_labubu` | PIN Padrão: `777001`
- **Founder (Fundador):** Codinome: `dg` | PIN Padrão: `777002`

Para cadastrar um novo administrador:
1. **Via Painel de Operações:** Acesse a aba **Operações** → sub-aba **Cadastrar Admin**, preencha o codinome, nome, cargo (Founder/Owner) e o PIN de 6 dígitos numéricos.
2. **Via Endpoint REST:**
```bash
curl -X POST http://localhost:3000/api/auth/register-admin \
  -H "Content-Type: application/json" \
  -d '{"username":"meu_admin","name":"Meu Admin","role":"Founder","level":2,"pin":"123456"}'
```

---

## 🌎 Acessos por estado (página inicial do dashboard)

Fica logo abaixo de **“Painel Oficial NZI · Dados Reais & Tempo Real”** e **“Bem-vindo(a) à NZI”**, visível apenas para **administradores (Dono e Fundador)**: cards (total de acessos, estados alcançados, estado com mais visitas), **mapa do Brasil por estados** e tabela de **acessos recentes**. Não existe página separada nem dados de demonstração: sem acessos reais, tudo mostra zero.

**Como funciona**
1. O site público (`index.html`) envia um beacon para `POST /api/track`.
2. O servidor lê o IP real e consulta uma API de geolocalização → país, estado e cidade **aproximados**.
3. Grava o registro (IP truncado) e **soma 1 no contador do estado** no banco. Os contadores são acumulados e **não expiram**.
4. O dashboard recebe o aviso por **SSE** (`GET /api/tracking/stream`) e atualiza na hora, sem recarregar. Há também uma consulta a cada 15 s como reserva.
5. Mapa: estado sem acessos = cinza-escuro; com acessos = vermelho, mais intenso quanto maior a contagem (escala logarítmica, relativa ao estado mais acessado).

**Como ativar**
1. **Geolocalização** funciona de fábrica via ipwho.is (HTTPS, sem chave). Para mais precisão/limites, crie um token em https://ipinfo.io/signup e use `IPINFO_TOKEN=...` no `.env`. `GEO_PROVIDER=off` desliga qualquer consulta externa.
2. **Atrás de proxy/CDN** (Render, Railway, Nginx, Cloudflare): `TRUST_PROXY=1`, senão o IP gravado é o do proxy e todos os acessos aparecem como “rede local”.
3. **Contornos reais do mapa**: `npm install` (instala `@svg-maps/brazil`). Sem o pacote aparece um mapa em grade.
4. **Supabase**: rode o bloco **5. RASTREAMENTO** do `supabase_schema.sql` (tabelas `site_visits` e `access_totals` + função `increment_access_totals`). Sem Supabase, tudo vai para `data/visits.json`.
   - Se você já usava `site_visits`, os totais são **reconstruídos automaticamente** a partir dos registros existentes na primeira leitura.

**Endpoints** (login de administrador, exceto os dois primeiros)
- `POST /api/track` — beacon do site público (sem cookies; ignora DNT/GPC, bots e origens externas).
- `GET /api/track/policy` — retenção exibida no rodapé do site.
- `GET /api/tracking/home` · `GET /api/tracking/stream` (SSE) · `GET /api/tracking/map-shape`

**Privacidade (LGPD)**
- IP gravado **truncado** (`a.b.c.xxx`; IPv6 /48) + hash HMAC do visitante; o IP completo só existe em memória durante a consulta.
- Ao consultar a API de localização, o IP do visitante é enviado ao provedor escolhido (ipwho.is ou IPinfo). Se isso não for aceitável, use `GEO_PROVIDER=off`. Cite o provedor na política de privacidade.
- Sem cookies; navegador salvo apenas como família + tipo; localização sempre apresentada como **aproximada**.
- Registros individuais expiram (`TRACKING_RETENTION_DAYS`, padrão 90 dias); os **totais por estado** são só números, sem dado pessoal.
- Dados dos visitantes só são acessíveis a administradores, tanto na API quanto no stream em tempo real.
- `TRACKING_STORE_FULL_IP=true` grava o IP completo: só use com base legal definida e aviso adequado.
- “Online agora” é uma estimativa (hash por IP + navegador; várias pessoas na mesma rede contam como uma). Cada página aberta do site (Início, Entretenimento, Login) conta como um acesso, com intervalo mínimo de 30 s por visitante e página.
