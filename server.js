require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const db = require('./db');
const {
  validatePinFormat,
  getClientIp,
  generateMemberToken,
  verifyMemberToken,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  checkActionRateLimit,
  recordActionFailure,
  clearActionFailures,
  requireMemberAuth,
  requireMinLevel,
  requireAdminAuth,
  optionalMemberAuth,
  requireCsrfProtection,
  sanitizeUrl
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Oculta cabeçalho 'X-Powered-By: Express'
app.disable('x-powered-by');

// Atrás de proxy/CDN (Render, Railway, Nginx, Cloudflare...) defina TRUST_PROXY (ex.: 1) para ler o IP real do visitante.
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : (tp === 'true' ? 1 : tp));
}

// Configuração de segurança HTTP avançada (Helmet & CSP)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      // Spotify embed (iframe) + mídia
      frameSrc: ["'self'", "https://open.spotify.com", "https://spotify.com"],
      childSrc: ["'self'", "https://open.spotify.com"],
      mediaSrc: ["'self'", "https:", "blob:", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Configuração restritiva de CORS (apenas localhost/127.0.0.1 em dev ou ALLOWED_ORIGINS em produção)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().toLowerCase())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const parsed = new URL(origin);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (isLocalhost || allowedOrigins.includes(origin.toLowerCase())) {
        return callback(null, true);
      }
    } catch (_) {}
    return callback(null, false);
  },
  credentials: true
}));

// Proteção contra payload excessivo (DDoS / Memory exhaustion)
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(cookieParser());

// Proteção Anti-CSRF para rotas de mutação
app.use(requireCsrfProtection);

// Servir arquivos estáticos (public e pasta raiz para compatibilidade com gifs e páginas)
app.use(express.static(path.join(__dirname, 'public')));
// Somente o GIF da raiz é público (NUNCA servir a pasta inteira: data/, auth.js, db.js ficariam expostos)
app.get('/mrrobot.gif', (req, res) => res.sendFile(path.join(__dirname, 'mrrobot.gif')));

// ==========================================
// ROTAS DE PÁGINAS HTML & NAVEGAÇÃO
// ==========================================

// Página inicial (Hierarquia e apresentação pública da Nzi Mafia)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Site único: Início, Entretenimento e Login são abas do index.html
app.get('/acesso', (req, res) => res.redirect('/#login'));
app.get('/entretenimento', (req, res) => res.redirect('/#entretenimento'));

// Login: se já tem sessão válida, vai direto ao dashboard
app.get('/login', (req, res) => {
  const token = req.cookies && req.cookies.nzi_token;
  if (token && verifyMemberToken(token)) return res.redirect('/dashboard');
  res.redirect('/#login');
});

// Dashboard NZI: só abre com sessão válida; sem login volta para a aba Login
app.get('/dashboard', (req, res) => {
  const token = req.cookies && req.cookies.nzi_token;
  if (!token || !verifyMemberToken(token)) return res.redirect('/#login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO (LOGIN COM PIN DE 6 DÍGITOS)
// ==========================================

// Status da Conexão com o Supabase
app.get('/api/supabase/status', async (req, res) => {
  const isConfigured = db.isSupabaseConfigured();
  if (!isConfigured) {
    return res.json({
      success: true,
      configured: false,
      connected: false,
      message: "Supabase não configurado. Operando com armazenamento local (data/database.json).",
      instructions: "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env para ativar a nuvem."
    });
  }

  const test = await db.testSupabaseConnection();
  let stats = null;
  if (test.connected) {
    try {
      stats = await db.supabaseDb.getDashboardStats();
    } catch (e) {}
  }

  res.json({
    success: true,
    configured: true,
    connected: test.connected,
    message: test.message,
    error: test.error,
    stats
  });
});

// Lista de codinomes para o seletor da tela de login (sem dados confidenciais)
app.get('/api/members/public', async (req, res) => {
  try {
    let members = [];
    if (db.isSupabaseConfigured()) {
      try {
        members = await db.supabaseDb.getMembers();
      } catch (e) {
        console.warn('[members/public] supabase:', e.message);
      }
    }
    if (!members || members.length === 0) {
      try {
        members = (db.getDb() || {}).members || [];
      } catch (e) {
        console.warn('[members/public] local db:', e.message);
        members = [];
      }
    }
    const publicMembers = (members || []).map(m => ({
      id: m.id,
      username: m.username,
      name: m.name,
      role: m.role,
      level: m.level
    }));
    return res.json({ success: true, members: publicMembers });
  } catch (err) {
    console.error('[members/public]', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar membros.', detail: String(err.message || err) });
  }
});

// Rota de Login: Acesso restrito apenas para membros com validação estrita de PIN de 6 dígitos
app.post('/api/auth/login', async (req, res) => {
  try {
  const { username, pin, hwid } = req.body || {};
  const ip = getClientIp(req);

  // 1. Verificação de rate limiting / proteção contra força bruta no PIN por IP e por Usuário
  const rateCheck = checkLoginRateLimit(ip, username);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: rateCheck.error
    });
  }

  // 2. Verificação se os campos foram enviados
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({
      success: false,
      error: "Acesso restrito apenas para membros. Informe seu codinome de membro."
    });
  }

  // 3. Validação estrita do PIN de 6 dígitos numéricos
  if (!validatePinFormat(pin)) {
    return res.status(400).json({
      success: false,
      error: "Acesso restrito apenas para membros: O PIN de login deve conter exatamente 6 dígitos numéricos (ex: 777001)."
    });
  }

  // 4. Busca do membro na hierarquia (Supabase em tempo real ou cache local)
  let member = null;
  if (db.isSupabaseConfigured()) {
    try {
      member = await db.supabaseDb.findMember(username.trim());
    } catch (e) {}
  }
  if (!member) {
    member = db.findMember(username.trim());
  }

  if (!member) {
    recordLoginFailure(ip, username);
    db.recordLogin(username, ip, false, "LOGIN_FALHA_USUARIO", hwid || null);
    return res.status(401).json({
      success: false,
      error: "Acesso restrito apenas para membros. Credenciais não reconhecidas na Nzi Mafia."
    });
  }

  // Se o membro foi bloqueado ou desativado
  if (member.status === 'bloqueado' || member.status === 'banido' || member.status === 'inativo') {
    db.recordLogin(member.username, ip, false, "LOGIN_STATUS_BLOQUEADO", hwid || null);
    return res.status(403).json({
      success: false,
      error: "🔒 Acesso bloqueado: Esta conta está suspensa na Nzi Mafia."
    });
  }

  // 5. Verificação criptográfica do PIN de 6 dígitos via bcrypt
  const pinValid = db.verifyMemberPin(member, pin.toString().trim());
  if (!pinValid) {
    recordLoginFailure(ip, member.username);
    db.recordLogin(member.username, ip, false, "LOGIN_PIN_INCORRETO", hwid || null);
    return res.status(401).json({
      success: false,
      error: "Acesso restrito apenas para membros. PIN de 6 dígitos incorreto."
    });
  }

  // 6. Verificação de IP confiável (IP Lock)
  const ipCheck = db.checkMemberIp(member, ip);
  if (!ipCheck.allowed) {
    db.recordLogin(member.username, ip, false, "LOGIN_IP_BLOQUEADO", hwid || null);
    return res.status(403).json({
      success: false,
      error: `🔒 IP Bloqueado: ${ipCheck.reason} Contate um administrador para liberar seu acesso.`,
      blocked: 'ip'
    });
  }

  // 7. Verificação de HWID confiável (Dispositivo Lock)
  if (hwid) {
    const hwidCheck = db.checkMemberHwid(member, hwid);
    if (!hwidCheck.allowed) {
      db.recordLogin(member.username, ip, false, "LOGIN_DISPOSITIVO_BLOQUEADO", hwid);
      return res.status(403).json({
        success: false,
        error: `🔒 Dispositivo Bloqueado: ${hwidCheck.reason} Contate um administrador para liberar seu acesso.`,
        blocked: 'hwid'
      });
    }
    // Primeiro acesso com este HWID: registra como confiável
    if (hwidCheck.firstTime) {
      db.setTrustedHwid(member.username, hwid);
    }
  }

  // Primeiro acesso com este IP: registra como confiável
  if (ipCheck.firstTime) {
    db.setTrustedIp(member.username, ip);
  }

  // 8. Sucesso: Limpar falhas de IP/Usuário, registrar log de auditoria no Supabase/local e emitir token JWT
  clearLoginFailures(ip, member.username);
  db.recordLogin(member.username, ip, true, "LOGIN", hwid || null);
  const token = generateMemberToken(member);

  // Cookie de sessão (HTTPS no Vercel = secure)
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL === '1';
  res.cookie('nzi_token', token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isHttps,
    path: '/'
  });

  return res.json({
    success: true,
    message: "Login autorizado. Acesso ao dashboard liberado.",
    token: token,
    redirectUrl: '/dashboard',
    member: {
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      level: member.level,
      isAdmin: member.level <= 2,
      status: 'online',
      profitShare: member.profitShare,
      weeklyEarnings: member.weeklyEarnings
    }
  });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno no login. Tente novamente.',
      detail: String(err && err.message ? err.message : err)
    });
  }
});

// Logout seguro do membro
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('nzi_token');
  res.json({
    success: true,
    message: "Sessão finalizada com sucesso. Login encerrado."
  });
});

// Status atual de autenticação (sem forçar redirect de visitante)
app.get('/api/auth/current', optionalMemberAuth, (req, res) => {
  if (req.member) {
    return res.json({
      success: true,
      authenticated: true,
      member: req.member,
      isAdmin: Boolean(req.member.isAdmin)
    });
  }
  res.json({
    success: true,
    authenticated: false,
    member: null,
    isAdmin: false
  });
});

// Perfil do membro logado
app.get('/api/auth/me', requireMemberAuth, (req, res) => {
  const member = db.findMember(req.member.id);
  res.json({
    success: true,
    member: {
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      level: member.level,
      isAdmin: member.level <= 2,
      status: member.status,
      lastLogin: member.lastLogin,
      profitShare: member.profitShare,
      weeklyEarnings: member.weeklyEarnings
    }
  });
});

// Cadastro de novo Administrador / Membro (Exclusivo para Dono Nível 1 ou Setup Inicial Protegido)
app.post('/api/auth/register-admin', (req, res, next) => {
  const database = db.getDb();
  const hasOwner = Array.isArray(database.members) && database.members.some(m => m.level === 1);

  if (hasOwner) {
    // Se a organização já possui Dono, exige autenticação do Owner Nível 1
    return requireAdminAuth(req, res, () => {
      requireMinLevel(1)(req, res, next);
    });
  }

  // Setup inicial: exige chave secreta de ambiente ADMIN_SETUP_SECRET
  const setupKey = req.headers['x-setup-key'] || req.body.setupKey;
  const expected = process.env.ADMIN_SETUP_SECRET;
  if (!expected || setupKey !== expected) {
    return res.status(403).json({
      success: false,
      error: "Acesso negado: O setup inicial de administrador exige o envio da chave ADMIN_SETUP_SECRET configurada no servidor."
    });
  }
  next();
}, (req, res) => {
  const { username, name, pin, role, level } = req.body;
  if (!validatePinFormat(pin)) {
    return res.status(400).json({
      success: false,
      error: "PIN inválido: deve conter exatamente 6 dígitos numéricos."
    });
  }
  try {
    const member = db.addMember({
      username,
      name,
      role: role || "Founder",
      level: Number(level) || 2,
      pin
    });
    res.status(201).json({
      success: true,
      message: `Administrador '${member.name}' cadastrado com sucesso! Utilize o PIN de 6 dígitos no login.`,
      member: {
        id: member.id,
        username: member.username,
        name: member.name,
        role: member.role,
        level: member.level,
        isAdmin: member.level <= 2
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Troca de PIN de 6 dígitos pelo próprio membro no dashboard
app.post('/api/auth/change-pin', requireMemberAuth, (req, res) => {
  const { currentPin, newPin } = req.body;
  const ip = getClientIp(req);

  const rate = checkActionRateLimit(`pinchange:${req.member.id}`, 5, 300000, "alteração de PIN");
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: rate.error });
  }

  if (!validatePinFormat(currentPin)) {
    return res.status(400).json({
      success: false,
      error: "Acesso restrito apenas para membros: O PIN atual deve conter 6 dígitos numéricos."
    });
  }

  if (!validatePinFormat(newPin)) {
    return res.status(400).json({
      success: false,
      error: "Acesso restrito apenas para membros: O novo PIN deve conter exatamente 6 dígitos numéricos."
    });
  }

  const member = db.findMember(req.member.id);
  if (!db.verifyMemberPin(member, currentPin.toString().trim())) {
    recordActionFailure(`pinchange:${req.member.id}`);
    recordLoginFailure(ip, req.member.username);
    db.recordLogin(req.member.username, ip, false, "CHANGE_PIN_INCORRETO", null);
    return res.status(401).json({
      success: false,
      error: "Acesso restrito apenas para membros: O PIN atual informado está incorreto."
    });
  }

  clearActionFailures(`pinchange:${req.member.id}`);

  try {
    const updated = db.updateMemberPin(member.username, newPin.toString().trim());
    const newToken = generateMemberToken(updated);
    res.cookie('nzi_token', newToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    db.recordLogin(member.username, ip, true, "PIN_ALTERADO_SUCESSO", null);

    return res.json({
      success: true,
      message: "PIN de 6 dígitos alterado com sucesso! Suas outras sessões foram invalidadas por segurança.",
      token: newToken
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// ==========================================
// ROTAS DO BACK-END DO DASHBOARD (ACESSO RESTRITO APENAS PARA MEMBROS)
// ==========================================

// Visão Geral / Dados Financeiros e Métricas do Membro
app.get('/api/dashboard/overview', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  const currentMember = database.members.find(m => m.id === req.member.id) || req.member;

  res.json({
    success: true,
    financials: database.financials,
    memberStats: {
      role: currentMember.role,
      level: currentMember.level,
      profitShare: currentMember.profitShare,
      weeklyEarnings: currentMember.weeklyEarnings
    },
    operationsCount: database.operations.length,
    activeMembersCount: database.members.filter(m => m.status === 'online').length,
    totalMembers: database.members.length
  });
});

// Lista de Membros da Nzi Mafia com status e hierarquia em tempo real
app.get('/api/dashboard/members', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  const members = database.members.map(m => ({
    id: m.id,
    username: m.username,
    name: m.name,
    role: m.role,
    level: m.level,
    status: m.status,
    profitShare: m.profitShare,
    weeklyEarnings: m.weeklyEarnings,
    lastLogin: m.lastLogin
  }));
  res.json({ success: true, members });
});

// Atualizar o próprio status em tempo real (Ex: 'online', 'em missão', 'em operação', 'ocupado')
app.post('/api/dashboard/my-status', requireMemberAuth, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['online', 'em missão', 'em operação', 'ocupado', 'offline'];
  const newStatus = status ? status.toLowerCase().trim() : 'online';

  if (!validStatuses.includes(newStatus)) {
    return res.status(400).json({
      success: false,
      error: "Status inválido. Escolha entre: online, em missão, em operação, ocupado, offline."
    });
  }

  const updated = db.updateMemberStatus(req.member.id, newStatus);
  res.json({
    success: true,
    message: `Status atualizado para: ${newStatus.toUpperCase()}`,
    status: newStatus,
    member: updated
  });
});

// Mural Confidencial da Nzi Mafia
app.get('/api/dashboard/announcements', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  res.json({ success: true, announcements: database.announcements });
});

// Publicar Novo Comunicado Confidencial (Apenas hierarquias 1, 2 e 3: Owner, Founder, Posses)
app.post('/api/dashboard/announcements', requireMemberAuth, requireMinLevel(3), (req, res) => {
  const { title, content, pinned } = req.body;
  if (!title || !content) {
    return res.status(400).json({
      success: false,
      error: "Título e conteúdo do comunicado são obrigatórios."
    });
  }

  const newAnn = db.addAnnouncement({
    author: req.member.name,
    role: req.member.role,
    title: title.trim(),
    content: content.trim(),
    pinned: Boolean(pinned)
  });

  res.status(201).json({
    success: true,
    message: "Comunicado confidencial publicado com sucesso.",
    announcement: newAnn
  });
});

// Livro de Caixa e Transações Financeiras do Cofre
app.get('/api/dashboard/transactions', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  res.json({
    success: true,
    totalVault: database.financials.totalVault,
    weeklyProfit: database.financials.weeklyProfit,
    transactions: database.transactions
  });
});

// Lançar Nova Movimentação Financeira no Cofre (Apenas Dono e Fundador - Níveis 1 e 2)
app.post('/api/dashboard/transactions', requireMemberAuth, requireMinLevel(2), (req, res) => {
  const { type, amount, description, pin } = req.body;
  const ip = getClientIp(req);

  // Confirmação de PIN (6 dígitos) com rate limiting para ações sensíveis no cofre
  const rate = checkActionRateLimit(`vault:${req.member.id}`, 5, 120000, "movimentação no cofre");
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: rate.error });
  }

  if (!validatePinFormat(pin)) {
    return res.status(400).json({
      success: false,
      error: "Acesso restrito apenas para membros: confirme sua ação com o PIN de 6 dígitos numéricos."
    });
  }

  const currentMember = db.findMember(req.member.id);
  if (!db.verifyMemberPin(currentMember, pin.toString().trim())) {
    recordActionFailure(`vault:${req.member.id}`);
    recordLoginFailure(ip, req.member.username);
    db.recordLogin(req.member.username, ip, false, "TRANSACTION_PIN_INCORRETO", null);
    return res.status(403).json({
      success: false,
      error: "Acesso restrito apenas para membros. PIN de 6 dígitos incorreto."
    });
  }
  clearActionFailures(`vault:${req.member.id}`);

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      error: "Valor da transação inválido. Deve ser um número positivo."
    });
  }

  try {
    const tx = db.addTransaction({
      type: type === 'OUT' ? 'OUT' : 'IN',
      amount: Number(amount),
      description: description ? String(description).slice(0, 255) : "Movimentação interna no cofre",
      author: req.member.name
    });

    res.status(201).json({
      success: true,
      message: "Movimentação registrada com sucesso no cofre da Nzi Mafia.",
      transaction: tx,
      newTotalVault: db.getDb().financials.totalVault
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Operações da Nzi Mafia
app.get('/api/dashboard/operations', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  res.json({ success: true, operations: database.operations });
});

// Criar Nova Operação (Apenas liderança: Níveis 1, 2 e 3)
app.post('/api/dashboard/operations', requireMemberAuth, requireMinLevel(3), (req, res) => {
  const { title, target, leader, priority, description } = req.body;
  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Título da operação é obrigatório."
    });
  }

  const op = db.addOperation({
    title,
    target,
    leader: leader || req.member.name,
    priority: priority || "ALTA",
    description
  });

  res.status(201).json({
    success: true,
    message: "Nova operação iniciada com sucesso.",
    operation: op
  });
});

// Atualizar Status ou Dados de uma Operação (Apenas liderança: Níveis 1, 2 e 3)
app.patch('/api/dashboard/operations/:id', requireMemberAuth, requireMinLevel(3), (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const updated = db.updateOperation(id, updates);
    res.json({
      success: true,
      message: "Operação atualizada com sucesso.",
      operation: updated
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// Logs de Auditoria (Registro de logins com PIN de 6 dígitos, IP, data e status)
app.get('/api/dashboard/audit-logs', requireMemberAuth, (req, res) => {
  const database = db.getDb();
  res.json({ success: true, auditLogs: database.auditLogs });
});

// ==========================================
// ROTAS PÚBLICAS DO DASHBOARD & CONTEÚDOS
// ==========================================

// Estatísticas reais do dashboard (contagem de posts por categoria, eventos ativos/confirmados, últimas publicações)
app.get('/api/public/stats', (req, res) => {
  try {
    const stats = db.getDashboardStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Publicações Públicas (filtradas por categoria, busca, apenas com status Publicado)
app.get('/api/public/posts', (req, res) => {
  try {
    const { category, search } = req.query;
    const posts = db.getPosts({ category, search, includeUnpublished: false });
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Detalhes de uma publicação pública
app.get('/api/public/posts/:id', (req, res) => {
  const post = db.getPostById(req.params.id);
  if (!post || post.status !== 'Publicado') {
    return res.status(404).json({ success: false, error: "Publicação não encontrada ou indisponível." });
  }
  res.json({ success: true, post });
});

// Eventos Públicos (com data/hora reais, temporizador regressivo e status)
app.get('/api/public/events', (req, res) => {
  try {
    const { status, search } = req.query;
    const events = db.getEvents({ status, search, includeUnpublished: false });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Detalhes de um evento público
app.get('/api/public/events/:id', (req, res) => {
  const event = db.getEventById(req.params.id);
  if (!event || event.published === false) {
    return res.status(404).json({ success: false, error: "Evento não encontrado ou indisponível." });
  }
  res.json({ success: true, event });
});

// Central de Links (4 aplicativos: Root, Discord, Telegram, TikTok)
app.get('/api/public/links', (req, res) => {
  try {
    const links = db.getLinks();
    res.json({ success: true, links });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Contas Discord Públicas (SEM exposição de tokens ou senhas)
app.get('/api/public/discord', (req, res) => {
  try {
    const accounts = db.getDiscordAccounts(false);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS DE ADMINISTRAÇÃO E OPERAÇÕES (PROTEGIDAS)
// Exclusivo para administradores autenticados (Dono e Fundador)
// ==========================================

// Listar todas as publicações (incluindo rascunhos e despublicadas)
app.get('/api/admin/posts', requireAdminAuth, (req, res) => {
  try {
    const { category, status, search } = req.query;
    const posts = db.getPosts({ category, status, search, includeUnpublished: true });
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Criar nova publicação
app.post('/api/admin/posts', requireAdminAuth, (req, res) => {
  try {
    const { title, description, category, image, link, status } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: "Título da publicação é obrigatório." });
    }
    const safeImage = sanitizeUrl(image);
    const safeLink = sanitizeUrl(link);
    const post = db.addPost({
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 10000) : '',
      category: category ? String(category).slice(0, 50) : 'Geral',
      image: safeImage,
      link: safeLink,
      status,
      author: req.member.name
    });
    res.status(201).json({
      success: true,
      message: `Publicação criada com sucesso na categoria ${post.category}!`,
      post
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Atualizar publicação existente
app.put('/api/admin/posts/:id', requireAdminAuth, (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.title) updates.title = String(updates.title).trim().slice(0, 200);
    if (updates.image !== undefined) updates.image = sanitizeUrl(updates.image);
    if (updates.link !== undefined) updates.link = sanitizeUrl(updates.link);
    const post = db.updatePost(req.params.id, updates);
    res.json({
      success: true,
      message: "Publicação atualizada com sucesso no banco de dados!",
      post
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Publicar / Despublicar publicação
app.patch('/api/admin/posts/:id/publish', requireAdminAuth, (req, res) => {
  try {
    const post = db.togglePublishPost(req.params.id);
    const msg = post.status === 'Publicado' 
      ? "Publicação publicada com sucesso e visível no dashboard!" 
      : "Publicação despublicada com sucesso.";
    res.json({ success: true, message: msg, post });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Excluir publicação
app.delete('/api/admin/posts/:id', requireAdminAuth, (req, res) => {
  try {
    db.deletePost(req.params.id);
    res.json({ success: true, message: "Publicação excluída com sucesso do sistema!" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Gerenciamento de Eventos ---

// Listar todos os eventos
app.get('/api/admin/events', requireAdminAuth, (req, res) => {
  try {
    const { status, search } = req.query;
    const events = db.getEvents({ status, search, includeUnpublished: true });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Criar evento
app.post('/api/admin/events', requireAdminAuth, (req, res) => {
  try {
    const { title, description, eventDate, timezone, startTime, endTime, status, published } = req.body;
    const event = db.addEvent({
      title,
      description,
      eventDate,
      timezone,
      startTime,
      endTime,
      status,
      published
    });
    res.status(201).json({
      success: true,
      message: `Evento '${event.title}' agendado com sucesso!`,
      event
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Atualizar evento
app.put('/api/admin/events/:id', requireAdminAuth, (req, res) => {
  try {
    const event = db.updateEvent(req.params.id, req.body);
    res.json({
      success: true,
      message: `Evento '${event.title}' atualizado com sucesso!`,
      event
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Alterar status do evento
app.patch('/api/admin/events/:id/status', requireAdminAuth, (req, res) => {
  try {
    const { status } = req.body;
    const event = db.updateEvent(req.params.id, { status });
    res.json({
      success: true,
      message: `Status do evento alterado para '${status}'!`,
      event
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Publicar / Despublicar evento
app.patch('/api/admin/events/:id/publish', requireAdminAuth, (req, res) => {
  try {
    const event = db.togglePublishEvent(req.params.id);
    const msg = event.published ? "Evento publicado com sucesso!" : "Evento despublicado com sucesso.";
    res.json({ success: true, message: msg, event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Excluir evento
app.delete('/api/admin/events/:id', requireAdminAuth, (req, res) => {
  try {
    db.deleteEvent(req.params.id);
    res.json({ success: true, message: "Evento excluído com sucesso!" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Gerenciamento da Central de Links ---

// Listar links para admin
app.get('/api/admin/links', requireAdminAuth, (req, res) => {
  try {
    const links = db.getLinks();
    res.json({ success: true, links });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualizar URL de um aplicativo da Central de Links
app.put('/api/admin/links/:appKey', requireAdminAuth, (req, res) => {
  try {
    const { url, description, name } = req.body;
    const safeUrl = sanitizeUrl(url);
    if (url && !safeUrl) {
      return res.status(400).json({
        success: false,
        error: "URL inválida ou insegura. O link deve iniciar com https://, http:// ou /"
      });
    }
    const updated = db.updateLink(req.params.appKey, { url: safeUrl, description, name });
    res.json({
      success: true,
      message: `Link do aplicativo '${updated.name}' configurado com sucesso!`,
      link: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Gerenciamento de Contas Discord & Cofre de Credenciais ---

// Listar contas para admin
app.get('/api/admin/discord', requireAdminAuth, (req, res) => {
  try {
    const accounts = db.getDiscordAccounts(true);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cadastrar conta Discord (somente Owner Nível 1)
app.post('/api/admin/discord', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    const { title, email, senha, token, description, status, isPublicDisclosed } = req.body;
    const account = db.addDiscordAccount({
      title,
      email,
      senha,
      token,
      description,
      status,
      isPublicDisclosed
    });
    res.status(201).json({
      success: true,
      message: `Conta Discord '${account.title}' cadastrada com armazenamento seguro (AES-256)!`,
      account
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Atualizar conta Discord
app.put('/api/admin/discord/:id', requireAdminAuth, (req, res) => {
  try {
    const updated = db.updateDiscordAccount(req.params.id, req.body);
    res.json({
      success: true,
      message: "Configurações da conta Discord atualizadas com sucesso!",
      account: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Excluir conta Discord
app.delete('/api/admin/discord/:id', requireAdminAuth, (req, res) => {
  try {
    db.deleteDiscordAccount(req.params.id);
    res.json({ success: true, message: "Conta Discord removida com sucesso!" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Revelar credencial sensível de conta Discord (com confirmação de PIN e registro de auditoria)
app.post('/api/admin/discord/:id/reveal', requireAdminAuth, (req, res) => {
  const { pin } = req.body;
  const ip = getClientIp(req);

  const rate = checkActionRateLimit(`reveal:${req.member.id}`, 5, 120000, "consulta de credencial Discord");
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: rate.error });
  }

  if (!validatePinFormat(pin)) {
    return res.status(400).json({
      success: false,
      error: "Confirmação obrigatória: informe seu PIN de 6 dígitos numéricos para liberar a visualização."
    });
  }

  const currentAdmin = db.findMember(req.member.id);
  if (!db.verifyMemberPin(currentAdmin, pin.toString().trim())) {
    recordActionFailure(`reveal:${req.member.id}`);
    recordLoginFailure(ip, req.member.username);
    db.recordLogin(req.member.username, ip, false, `REVEAL_FALHA_PIN_DISCORD: ${req.params.id}`, null);
    return res.status(403).json({
      success: false,
      error: "PIN incorreto. Tentativa de acesso a credencial registrada na auditoria de segurança."
    });
  }

  clearActionFailures(`reveal:${req.member.id}`);

  try {
    const result = db.revealDiscordSecret(req.params.id, req.member, ip);
    res.json({
      success: true,
      message: "Credencial decodificada com sucesso. Ação registrada no livro de auditoria.",
      secret: result.secret,
      title: result.title
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS CC (number, validate, code) — somente Owner Nível 1
// ==========================================
app.get('/api/admin/cc', requireAdminAuth, (req, res) => {
  try {
    res.json({ success: true, accounts: db.getCcAccounts(true) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/public/cc', (req, res) => {
  try {
    res.json({ success: true, accounts: db.getCcAccounts(false) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/cc', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    const account = db.addCcAccount(req.body);
    res.status(201).json({ success: true, message: 'CC cadastrado com criptografia AES-256!', account });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/cc/:id', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    const account = db.updateCcAccount(req.params.id, req.body);
    res.json({ success: true, message: 'CC atualizado!', account });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/cc/:id', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    db.deleteCcAccount(req.params.id);
    res.json({ success: true, message: 'CC removido!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/cc/:id/reveal', requireAdminAuth, (req, res) => {
  const { pin } = req.body;
  const ip = getClientIp(req);

  const rate = checkActionRateLimit(`reveal:${req.member.id}`, 5, 120000, "consulta de credencial CC");
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: rate.error });
  }

  if (!validatePinFormat(pin)) {
    return res.status(400).json({ success: false, error: 'Informe seu PIN de 6 dígitos para visualizar.' });
  }

  const currentAdmin = db.findMember(req.member.id);
  if (!db.verifyMemberPin(currentAdmin, pin.toString().trim())) {
    recordActionFailure(`reveal:${req.member.id}`);
    recordLoginFailure(ip, req.member.username);
    db.recordLogin(req.member.username, ip, false, `REVEAL_FALHA_PIN_CC: ${req.params.id}`, null);
    return res.status(403).json({ success: false, error: 'PIN incorreto. Tentativa registrada na auditoria.' });
  }

  clearActionFailures(`reveal:${req.member.id}`);

  try {
    const result = db.revealCcSecret(req.params.id, req.member, ip);
    res.json({ success: true, message: 'Credenciais decodificadas. Ação auditada.', secret: result.secret, label: result.label });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS PAINEL (user, senha, tipo_login) — somente Owner Nível 1
// ==========================================
app.get('/api/admin/painel', requireAdminAuth, (req, res) => {
  try {
    res.json({ success: true, accounts: db.getPanelAccounts(true) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/public/painel', (req, res) => {
  try {
    res.json({ success: true, accounts: db.getPanelAccounts(false) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/painel', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    const account = db.addPanelAccount(req.body);
    res.status(201).json({ success: true, message: 'Painel cadastrado com criptografia AES-256!', account });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/painel/:id', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    const account = db.updatePanelAccount(req.params.id, req.body);
    res.json({ success: true, message: 'Painel atualizado!', account });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/painel/:id', requireAdminAuth, requireMinLevel(1), (req, res) => {
  try {
    db.deletePanelAccount(req.params.id);
    res.json({ success: true, message: 'Painel removido!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/painel/:id/reveal', requireAdminAuth, (req, res) => {
  const { pin } = req.body;
  const ip = getClientIp(req);

  const rate = checkActionRateLimit(`reveal:${req.member.id}`, 5, 120000, "consulta de credencial Painel");
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: rate.error });
  }

  if (!validatePinFormat(pin)) {
    return res.status(400).json({ success: false, error: 'Informe seu PIN de 6 dígitos para visualizar.' });
  }

  const currentAdmin = db.findMember(req.member.id);
  if (!db.verifyMemberPin(currentAdmin, pin.toString().trim())) {
    recordActionFailure(`reveal:${req.member.id}`);
    recordLoginFailure(ip, req.member.username);
    db.recordLogin(req.member.username, ip, false, `REVEAL_FALHA_PIN_PAINEL: ${req.params.id}`, null);
    return res.status(403).json({ success: false, error: 'PIN incorreto. Tentativa registrada na auditoria.' });
  }

  clearActionFailures(`reveal:${req.member.id}`);

  try {
    const result = db.revealPanelSecret(req.params.id, req.member, ip);
    res.json({ success: true, message: 'Credenciais decodificadas. Ação auditada.', secret: result.secret, label: result.label, user: result.user, tipoLogin: result.tipoLogin });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Cadastro de novos membros por administradores
app.post('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    const { username, name, role, level, pin } = req.body;
    if (!validatePinFormat(pin)) {
      return res.status(400).json({
        success: false,
        error: "O PIN do novo membro deve conter exatamente 6 dígitos numéricos."
      });
    }
    const memberLevel = Number(level);
    if (!memberLevel || memberLevel < 1 || memberLevel > 5) {
      return res.status(400).json({
        success: false,
        error: "Nível hierárquico inválido. Deve ser entre 1 e 5."
      });
    }
    const member = db.addMember({
      username: String(username).trim().toLowerCase(),
      name: String(name).trim(),
      role: role ? String(role).trim() : 'Member',
      level: memberLevel,
      pin
    });
    res.status(201).json({
      success: true,
      message: `Integrante '${member.name}' cadastrado na organização com sucesso!`,
      member: {
        id: member.id,
        username: member.username,
        name: member.name,
        role: member.role,
        level: member.level
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS DE SEGURANÇA: IP LOCK & HWID LOCK (ADMIN)
// ==========================================

// Listar status de segurança (IP e HWID) de todos os membros
app.get('/api/admin/security', requireAdminAuth, (req, res) => {
  try {
    const database = db.getDb();
    const securityInfo = database.members.map(m => ({
      id: m.id,
      username: m.username,
      name: m.name,
      role: m.role,
      trustedIp: m.trustedIp || null,
      trustedHwid: m.trustedHwid ? m.trustedHwid.substring(0, 16) + '...' : null,
      hwidFull: m.trustedHwid || null,
      lastLogin: m.lastLogin || null
    }));
    res.json({ success: true, members: securityInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resetar IP e HWID de um membro (libera o próximo login de qualquer lugar)
app.post('/api/admin/security/:username/reset', requireAdminAuth, (req, res) => {
  try {
    const member = db.resetMemberSecurity(req.params.username);
    const ip = getClientIp(req);
    db.recordLogin(req.params.username, ip, true, `RESET_SEGURANCA_ADMIN_por_${req.member.name}`, null);
    res.json({
      success: true,
      message: `✅ IP e HWID de '${member.name}' resetados. Próximo login liberado de qualquer dispositivo/IP.`,
      member: { id: member.id, username: member.username, name: member.name }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Resetar apenas o IP de um membro
app.post('/api/admin/security/:username/reset-ip', requireAdminAuth, (req, res) => {
  try {
    const m = db.setTrustedIp(req.params.username, null);
    const ip = getClientIp(req);
    db.recordLogin(req.params.username, ip, true, `RESET_IP_ADMIN_por_${req.member.name}`, null);
    res.json({
      success: true,
      message: `✅ IP de '${m.name}' resetado. Próximo login registrará novo IP confiável.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Resetar apenas o HWID de um membro
app.post('/api/admin/security/:username/reset-hwid', requireAdminAuth, (req, res) => {
  try {
    const m = db.setTrustedHwid(req.params.username, null);
    const ip = getClientIp(req);
    db.recordLogin(req.params.username, ip, true, `RESET_HWID_ADMIN_por_${req.member.name}`, null);
    res.json({
      success: true,
      message: `✅ HWID de '${m.name}' resetado. Próximo login registrará novo dispositivo confiável.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// RASTREAMENTO DE ACESSOS (estatísticas por IP, localização aproximada, LGPD)
// ==========================================
require('./tracking').mount(app, { requireAdminAuth });

// Erros não tratados nas rotas (evita HTML genérico 500 no Vercel)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor.',
    detail: String(err && err.message ? err.message : err)
  });
});

// Middleware Global de Tratamento de 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: "Endpoint não encontrado na API da Nzi Mafia."
    });
  }
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor apenas se executado diretamente
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(`[NZI MAFIA] Servidor Back-end Online na porta ${PORT}`);
    console.log(`[SEGURANÇA] ACESSO RESTRITO APENAS PARA MEMBROS`);
    console.log(`[AUTENTICAÇÃO] PIN de 6 Dígitos ativado no login`);
    console.log(`[URL] http://localhost:${PORT}`);
    console.log(`[LOGIN] http://localhost:${PORT}/login`);
    console.log(`[DASHBOARD] http://localhost:${PORT}/dashboard`);
    console.log(`[ENTRETENIMENTO] http://localhost:${PORT}/entretenimento`);

    if (db.isSupabaseConfigured()) {
      const supCheck = await db.testSupabaseConnection();
      if (supCheck.connected) {
        console.log(`[BANCO SUPABASE] ✅ CONECTADO e SINCRONIZADO`);
      } else {
        console.log(`[BANCO SUPABASE] ⚠️ Configurado, mas aguardando schema: ${supCheck.error || supCheck.message}`);
      }
    } else {
      console.log(`[BANCO SUPABASE] ℹ️ Modo Local Ativo (data/database.json)`);
      console.log(`[BANCO SUPABASE] Para ativar nuvem: preencha o arquivo .env`);
    }
    console.log(`=======================================================`);
  });
}

module.exports = app;
