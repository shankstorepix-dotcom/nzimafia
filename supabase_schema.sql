-- ====================================================================
-- NZI MAFIA — SCHEMA SUPABASE POSTGRESQL & SISTEMA DE LOGIN
-- ====================================================================
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/_/sql
-- ====================================================================

-- 1. Habilitar extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 2. CRIAÇÃO DAS TABELAS
-- ====================================================================

-- TABELA: members (Membros da Hierarquia Nzi Mafia e Credenciais de PIN)
CREATE TABLE IF NOT EXISTS public.members (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    level INTEGER NOT NULL,
    pin_hash TEXT NOT NULL,
    password_hash TEXT,
    default_pin_hint TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    profit_share TEXT NOT NULL DEFAULT '4%',
    weekly_earnings NUMERIC NOT NULL DEFAULT 0,
    last_login TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: financials (Cofre da Nzi Mafia e Divisão Semanal)
CREATE TABLE IF NOT EXISTS public.financials (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_vault NUMERIC NOT NULL DEFAULT 1290000,
    weekly_profit NUMERIC NOT NULL DEFAULT 165000,
    currency TEXT NOT NULL DEFAULT 'BRL',
    last_distribution TEXT NOT NULL DEFAULT '2026-10-16 23:45',
    rules JSONB NOT NULL DEFAULT '{
        "level1": "40% (Owner)",
        "level2": "25% (Founder)",
        "level3": "15% total (7.5% por Posse)",
        "level4": "20% total (4% por Membro)"
    }'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_financials_row CHECK (id = 1)
);

-- TABELA: operations (Operações em Andamento, Metas e Liderança)
CREATE TABLE IF NOT EXISTS public.operations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Em andamento',
    target NUMERIC NOT NULL DEFAULT 0,
    leader TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'ALTA',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: announcements (Mural Confidencial da Liderança)
CREATE TABLE IF NOT EXISTS public.announcements (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    role TEXT NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: transactions (Livro Caixa e Movimentações do Cofre)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    amount NUMERIC NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: audit_logs (Auditoria de Logins com PIN, IPs e Ações Críticas)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    member TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    ip TEXT,
    timestamp TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: posts (Publicações do Dashboard divididas por Categoria: CC, Painel, Conta Discord, etc.)
CREATE TABLE IF NOT EXISTS public.posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Publicado',
    image TEXT DEFAULT '',
    link TEXT DEFAULT '',
    published_at TEXT,
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: events (Eventos e Temporizadores Regressivos)
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo (GMT-3)',
    start_time TEXT,
    end_time TEXT,
    status TEXT NOT NULL DEFAULT 'Agendado',
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: links (Central de Links Oficiais dos 4 Canais: Root, Discord, Telegram, TikTok)
CREATE TABLE IF NOT EXISTS public.links (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: discord_accounts (Contas Discord & Bots Oficiais com Credenciais Criptografadas)
CREATE TABLE IF NOT EXISTS public.discord_accounts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    bot_tag TEXT,
    description TEXT,
    permissions TEXT,
    status TEXT NOT NULL DEFAULT 'Ativo',
    is_public_disclosed BOOLEAN NOT NULL DEFAULT TRUE,
    encrypted_secret TEXT,
    secret_iv TEXT,
    secret_tag TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 3. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ====================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_accounts ENABLE ROW LEVEL SECURITY;

-- Service Role (Backend Node.js com chave service_role) tem acesso total a tudo
DO $$
BEGIN
    -- Dropar políticas antigas se existirem para evitar conflito ao reexecutar
    DROP POLICY IF EXISTS "service_role_members" ON public.members;
    DROP POLICY IF EXISTS "service_role_financials" ON public.financials;
    DROP POLICY IF EXISTS "service_role_operations" ON public.operations;
    DROP POLICY IF EXISTS "service_role_announcements" ON public.announcements;
    DROP POLICY IF EXISTS "service_role_transactions" ON public.transactions;
    DROP POLICY IF EXISTS "service_role_audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "service_role_posts" ON public.posts;
    DROP POLICY IF EXISTS "service_role_events" ON public.events;
    DROP POLICY IF EXISTS "service_role_links" ON public.links;
    DROP POLICY IF EXISTS "service_role_discord_accounts" ON public.discord_accounts;

    -- Políticas públicas de leitura segura
    DROP POLICY IF EXISTS "public_read_published_posts" ON public.posts;
    DROP POLICY IF EXISTS "public_read_published_events" ON public.events;
    DROP POLICY IF EXISTS "public_read_links" ON public.links;
    DROP POLICY IF EXISTS "public_read_discord_accounts" ON public.discord_accounts;
    DROP POLICY IF EXISTS "anon_read_public_members" ON public.members;
END $$;

-- 1. Acesso total para service_role (Backend API)
CREATE POLICY "service_role_members" ON public.members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_financials" ON public.financials FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_operations" ON public.operations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_announcements" ON public.announcements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_transactions" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_audit_logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_posts" ON public.posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_events" ON public.events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_links" ON public.links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_discord_accounts" ON public.discord_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Políticas de leitura pública (Anon & Authenticated) para alimentar o site e dashboard
CREATE POLICY "public_read_published_posts" ON public.posts FOR SELECT TO anon, authenticated USING (status = 'Publicado');
CREATE POLICY "public_read_published_events" ON public.events FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "public_read_links" ON public.links FOR SELECT TO anon, authenticated USING (is_available = true);
CREATE POLICY "public_read_discord_accounts" ON public.discord_accounts FOR SELECT TO anon, authenticated USING (is_public_disclosed = true);
CREATE POLICY "anon_read_public_members" ON public.members FOR SELECT TO anon, authenticated USING (true);

-- ====================================================================
-- 4. POVOAMENTO INICIAL (SEED DATA OFICIAL DA NZI MAFIA)
-- ====================================================================

-- 4.1 Membros Oficiais da Hierarquia e Hashes dos PINs de 6 Dígitos
INSERT INTO public.members (id, username, name, role, level, pin_hash, default_pin_hint, status, profit_share, weekly_earnings, last_login, created_at)
VALUES
  ('mem_1', 'ph_labubu', 'Ph Labubu', 'Owner', 1, '$2b$10$02ZvVzP3ounzqlPzG0SqZ.a7ixMGnV.kaMts..ae/O5SFxBp9wfP2', '777001', 'online', '40%', 48000, '2026-10-17 08:54:59', '2026-10-17T04:53:43.826Z'),
  ('mem_2', 'dg', 'DG', 'Founder', 2, '$2b$10$VnrFLiZ3swaSMckAq/F3oeJLUU29wsyu0Il8R8v9cgmek5rUTDMU2', '777002', 'online', '25%', 30000, NULL, '2026-10-17T04:53:43.889Z'),
  ('mem_3', 'god', 'God', 'Posse', 3, '$2b$10$nIR7Mlp2uyLTTz2d9c6sCORS1zKKyhB3etKMv6b0E6sLaYnK6a0ZW', '777003', 'em operação', '7.5%', 9000, NULL, '2026-10-17T04:53:43.951Z'),
  ('mem_4', 'fact', 'Fact', 'Posse', 3, '$2b$10$vj2.J3cG45aIrHVQNqm.Xu/HvfIbQfjZSQzcDhI36Mqb0iS/.NO0i', '777004', 'online', '7.5%', 9000, NULL, '2026-10-17T04:53:44.016Z'),
  ('mem_5', 'anny', 'Anny', 'Member', 4, '$2b$10$WRC6QFpvYVNxwPlM4ict3O.lJT/cBtVJZCduQ3A79ITXJuNVyP2xq', '777005', 'online', '4%', 4800, '2026-10-17 05:25:27', '2026-10-17T04:53:44.077Z'),
  ('mem_6', 'havoc', 'Havoc', 'Member', 4, '$2b$10$64uH8iqoboh9Hj02mn8VZeso6pSsYRb51JUv5UxN1XbVC3tmr9vWK', '777006', 'em missão', '4%', 4800, NULL, '2026-10-17T04:53:44.138Z'),
  ('mem_7', 'necro', 'Necro', 'Member', 4, '$2b$10$wm1DrR5s4JzTusabrAX/h.BYjC4mTMPwK/0Az7XL3pC810QPRiIne', '777007', 'online', '4%', 4800, NULL, '2026-10-17T04:53:44.200Z'),
  ('mem_8', 'sys', 'SyS', 'Member', 4, '$2b$10$25hjAvsk/1mcyJkFeEieaOzp3NkmJmA1Hg0VoS2O.hwyvuFnrqDci', '777008', 'online', '4%', 4800, NULL, '2026-10-17T04:53:44.260Z'),
  ('mem_9', 'kage', 'Kage', 'Member', 4, '$2b$10$s7SfZf0HHdTJh.gYJsX0OO24S0TyKbC1mUzcxd3ADUfHXZNW74EnW', '777009', 'online', '4%', 4800, NULL, '2026-10-17T04:53:44.321Z')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  level = EXCLUDED.level,
  pin_hash = EXCLUDED.pin_hash,
  default_pin_hint = EXCLUDED.default_pin_hint;

-- 4.2 Cofre e Dados Financeiros
INSERT INTO public.financials (id, total_vault, weekly_profit, currency, last_distribution)
VALUES (1, 1290000, 165000, 'BRL', '2026-10-16 23:45')
ON CONFLICT (id) DO UPDATE SET
  total_vault = EXCLUDED.total_vault,
  weekly_profit = EXCLUDED.weekly_profit,
  last_distribution = EXCLUDED.last_distribution;

-- 4.3 Operações Estratégicas
INSERT INTO public.operations (id, title, status, target, leader, priority, description)
VALUES
  ('op_1792214727631', 'Operação Fênix', 'Em andamento', 180000, 'Ph Labubu', 'CRÍTICA', 'Expansão de liquidez para operações discretas'),
  ('op_1', 'Operação Caixa Rápido', 'Em andamento', 65000, 'Ph Labubu', 'ALTA', 'Controle de arrecadação regional e liquidez imediata.'),
  ('op_2', 'Lavagem & Conversão Cripto', 'Ativo', 150000, 'DG', 'CRÍTICA', 'Roteamento anônimo e conversão fria via Monero e mixer de liquidez.'),
  ('op_3', 'Expansão da Zona Sul', 'Planejada', 90000, 'God & Fact', 'MÉDIA', 'Prospecção de novos pontos estratégicos de arrecadação.')
ON CONFLICT (id) DO NOTHING;

-- 4.4 Mural Confidencial
INSERT INTO public.announcements (id, author, role, date, title, content, pinned)
VALUES
  ('ann_1792214727675', 'Ph Labubu', 'Owner', '2026-10-17 05:25', 'ORDEM DO DIA: METAS ATINGIDAS', 'Parabéns a todos os membros pelo rendimento desta semana.', TRUE),
  ('ann_1', 'Ph Labubu', 'Owner', '2026-10-16 23:45', 'DIVISÃO DO CAIXA SEMANAL CONCLUÍDA', 'O fechamento semanal atingiu R$ 120.000 de lucro líquido. As cotas foram creditadas conforme a hierarquia. Dinheiro primeiro, sempre.', TRUE),
  ('ann_2', 'DG', 'Founder', '2026-10-16 19:15', 'ACESSO RESTRITO - NOVO SISTEMA DE PIN 6 DÍGITOS', 'A partir de agora o acesso ao dashboard é exclusivo com autenticação de PIN numérico de 6 dígitos. Não repassem seus PINs para ninguém fora da Nzi.', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4.5 Transações Financeiras
INSERT INTO public.transactions (id, type, amount, description, date, author)
VALUES
  ('tx_1792214727639', 'IN', 45000, 'Liquidação Parcial Operação Fênix', '2026-10-17 05:25', 'Ph Labubu'),
  ('tx_1', 'IN', 65000, 'Liquidação Operação Caixa Rápido', '2026-10-16 21:00', 'Ph Labubu'),
  ('tx_2', 'IN', 55000, 'Conversão Cripto / Entrada', '2026-10-16 18:30', 'DG'),
  ('tx_3', 'OUT', 48000, 'Distribuição Semanal - Nível 1 (Owner: Ph Labubu)', '2026-10-16 23:45', 'Sistema'),
  ('tx_4', 'OUT', 30000, 'Distribuição Semanal - Nível 2 (Founder: DG)', '2026-10-16 23:45', 'Sistema'),
  ('tx_5', 'OUT', 18000, 'Distribuição Semanal - Nível 3 (Posses: God & Fact)', '2026-10-16 23:45', 'Sistema'),
  ('tx_6', 'OUT', 24000, 'Distribuição Semanal - Nível 4 (Membros: Anny, Havoc, Necro, SyS, Kage)', '2026-10-16 23:45', 'Sistema')
ON CONFLICT (id) DO NOTHING;

-- 4.6 Publicações por Categoria (CC, Painel, Conta Discord, etc.)
INSERT INTO public.posts (id, title, description, category, status, image, link, published_at, author)
VALUES
  ('post_1', 'Novo Conteúdo NZI CC - Diretrizes & Ferramentas', 'Bem-vindo à área oficial de CC da NZI Mafia.\n\nEste espaço centraliza os recursos e diretrizes operacionais para os membros da organização.\n\nOrientações:\n- Manter sigilo das diretrizes e procedimentos internos.\n- Utilizar apenas os canais autorizados de suporte e homologação.\n- Verificar a integridade das listas e dados antes de qualquer execução.\n\nPara suporte direto, consulte a Central de Links ou acione um moderador no Discord oficial.', 'CC', 'Publicado', '', 'https://discord.gg/m0gshot', '2026-10-17 00:00', 'Ph Labubu'),
  ('post_2', 'Painel Central - Gestão & Monitoramento Operacional', 'O novo Painel da NZI foi atualizado para fornecer visão integrada dos módulos da organização.\n\nRecursos disponíveis:\n- Métricas em tempo real do sistema\n- Gestão de publicações divididas por categoria\n- Temporizadores regressivos sincronizados com o servidor\n- Armazenamento com criptografia AES-256 no banco de dados persistente.\n\nConfigurações adicionais podem ser ajustadas diretamente na aba de Operações pela diretoria.', 'Painel', 'Publicado', '', '/dashboard', '2026-10-17 01:00', 'DG'),
  ('post_3', 'Segurança de Acessos & Bots Oficiais Discord', 'Todas as integrações do Discord operam com proteção estrita no servidor.\n\n- Credenciais, tokens e webhooks protegidos contra consultas não autorizadas\n- Exibição pública restrita a informações institucionais\n- Histórico de auditoria com IP e registro de quem acessou.', 'Conta Discord', 'Publicado', '', '', '2026-10-17 02:00', 'Ph Labubu'),
  ('post_4', 'Central de Links Oficiais - Segurança & Protocolos', 'Mantenha-se conectado aos canais oficiais da NZI Mafia através dos nossos 4 pilares: Root, Discord, Telegram e TikTok.\n\nTodos os links passam por validação de protocolo seguro HTTPS e podem ser editados em tempo real pelo painel de Operações.', 'Central de Links', 'Publicado', '', '', '2026-10-17 03:00', 'DG'),
  ('post_5', 'Briefing: Grande Reunião e Alinhamento Estratégico', 'Publicação informativa sobre o próximo evento agendado da organização.\n\nAcompanhe a contagem regressiva oficial na página de Eventos para participar no horário exato de abertura das salas de conferência.', 'Eventos', 'Publicado', '', '', '2026-10-17 04:00', 'Ph Labubu')
ON CONFLICT (id) DO NOTHING;

-- 4.7 Eventos com Temporizador Regressivo
INSERT INTO public.events (id, title, description, event_date, timezone, start_time, end_time, status, published)
VALUES
  ('evt_1', 'Evento Confirmado', 'Reunião executiva da liderança com acompanhamento do temporizador regressivo oficial. Apresentação das diretrizes e metas da semana.', '2026-10-17T23:00', 'America/Sao_Paulo (GMT-3)', '23:00', '01:00', 'Confirmado', TRUE),
  ('evt_2', 'Operação Noturna de Alinhamento', 'Coordenação estratégica das equipes e verificação de recursos no servidor.', '2026-10-18T21:00', 'America/Sao_Paulo (GMT-3)', '21:00', '23:30', 'Agendado', TRUE),
  ('evt_3', 'Sessão Aberta de Debate e Dúvidas', 'Canal aberto para membros interagirem com a liderança no Discord oficial.', '2026-10-16T19:00', 'America/Sao_Paulo (GMT-3)', '19:00', '20:30', 'Em andamento', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4.8 Central de Links (4 Pilares)
INSERT INTO public.links (key, name, icon, url, description, is_available)
VALUES
  ('root', 'Root', 'terminal', 'https://root.nzimafia.com', 'Infraestrutura terminal e acesso centralizado ao núcleo da NZI.', TRUE),
  ('discord', 'Discord', 'discord', 'https://discord.gg/m0gshot', 'Servidor oficial da comunidade e comunicados da liderança.', TRUE),
  ('telegram', 'Telegram', 'telegram', 'https://t.me/+Om4I_IjpI6liNmMx', 'Canal rápido e avisos de emergência prioritários.', TRUE),
  ('tiktok', 'TikTok', 'tiktok', 'https://www.tiktok.com/@nzimafia_oficial', 'Canal oficial verificado no TikTok', TRUE)
ON CONFLICT (key) DO UPDATE SET
  url = EXCLUDED.url,
  description = EXCLUDED.description;

-- 4.9 Contas Discord com Credenciais Seguras
INSERT INTO public.discord_accounts (id, title, bot_tag, description, permissions, status, is_public_disclosed, encrypted_secret, secret_iv, secret_tag)
VALUES
  ('disc_1', 'Bot Moderador NZI Guard', 'NZIGuard#0001', 'Bot oficial responsável pela verificação de acessos, moderação e logs automatizados.', 'Administrador, Gerenciar Cargos, Banir Membros, Ver Auditoria', 'Ativo', TRUE, '02bea251d3fbb09fa355a87f67010a3ef5a4690625934fdb39c6e202205b25ccf263cf034c4012fd057c84b3529dba219825a5a7759cfa695ac2d4', '21c7c1bcec31585fd02d14b4', '464d90c1859d9368f3cf6c6e6d6c1887'),
  ('disc_2', 'Webhook de Transmissões VIP', 'NZI-Broadcast#VIP', 'Canal de envio automatizado de novidades e avisos urgentes nos canais prioritários.', 'Enviar Mensagens, Inserir Links, Anexar Arquivos', 'Ativo', TRUE, '3e2fa49229d678f57ebc1dabf8cadff5e63b4ad313e26bf8ec5bc81b274f8fffddf1897166e6b54e0eff3145642d172bf608599173148ff2d4a682fb7a', '151b29a5c4adbb6ed161a32f', 'ce427c9910e732dcd71d7a07edfdf030')
ON CONFLICT (id) DO NOTHING;

-- 4.10 Logs de Auditoria Iniciais
INSERT INTO public.audit_logs (id, member, role, action, status, ip, timestamp)
VALUES
  ('log_1', 'Ph Labubu', 'Owner', 'LOGIN', 'SUCESSO', '10.13.37.1', '2026-10-17 01:20:00'),
  ('log_2', 'DG', 'Founder', 'LOGIN', 'SUCESSO', '10.13.37.4', '2026-10-17 01:25:30')
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- 5. RASTREAMENTO DE ACESSOS (dashboard > Rastreamento)
-- Guarda IP TRUNCADO + hash do visitante + localização aproximada. Sem cookies, sem User-Agent completo.
-- Acesso somente pelo back-end (service_role); RLS ativado sem políticas públicas.
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.site_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_masked TEXT,
  visitor_hash TEXT,
  country TEXT,
  state TEXT,
  region TEXT,
  city TEXT,
  page TEXT,
  browser TEXT,
  geo_source TEXT
);
CREATE INDEX IF NOT EXISTS site_visits_ts_idx ON public.site_visits (ts DESC);
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Contadores ACUMULADOS por estado (só números agregados: sem IP, sem dado pessoal; não expiram).
-- Chaves: sigla da UF (SP, RJ...), _ALL (total), _EXT (exterior), _LOCAL (rede local), _UNK (sem localização).
CREATE TABLE IF NOT EXISTS public.access_totals (
  key TEXT PRIMARY KEY,
  visits BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.access_totals ENABLE ROW LEVEL SECURITY;

-- Incremento atômico (seguro com acessos simultâneos). Só o back-end (service_role) pode executar.
CREATE OR REPLACE FUNCTION public.increment_access_totals(p_keys TEXT[])
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO public.access_totals (key, visits, updated_at)
  SELECT DISTINCT k, 1, NOW() FROM unnest(p_keys) AS k
  ON CONFLICT (key) DO UPDATE
    SET visits = public.access_totals.visits + 1, updated_at = NOW();
$$;
REVOKE ALL ON FUNCTION public.increment_access_totals(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_access_totals(TEXT[]) TO service_role;

-- ====================================================================
-- FIM DO SCRIPT DE SCHEMA & POVOAMENTO SUPABASE
-- ====================================================================
