const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

// Configuração segura do JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || 'nzi_mafia_vault_token_777_dinheiro_primeiro_super_secure';
const TOKEN_EXPIRY = '24h';

if (!process.env.JWT_SECRET) {
  console.warn('[SEGURANÇA] AVISO: JWT_SECRET não foi definido em .env. Usando chave de desenvolvimento temporária. Defina JWT_SECRET com pelo menos 32 caracteres antes de publicar em produção.');
}

// Validação estrita do PIN de 6 dígitos numéricos
function validatePinFormat(pin) {
  if (typeof pin !== 'string' && typeof pin !== 'number') return false;
  const pinStr = pin.toString().trim();
  return /^\d{6}$/.test(pinStr);
}

// Extração segura do IP do cliente (previne spoofing de cabeçalhos)
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  if (req.app && req.app.get('trust proxy') && req.ip) {
    return req.ip.replace(/^::ffff:/i, '').trim();
  }
  const direct = (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
  return direct.replace(/^::ffff:/i, '').trim();
}

// Gera o token JWT de sessão do membro com fingerprint do PIN (invalida tokens antigos se o PIN for alterado)
function generateMemberToken(member) {
  const pinFingerprint = member.pinHash
    ? crypto.createHash('sha256').update(member.pinHash).digest('hex').substring(0, 10)
    : 'init';

  return jwt.sign(
    {
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      level: member.level,
      pinFingerprint
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Verifica e decodifica token JWT retornando o membro correspondente
function verifyMemberToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const member = db.findMember(decoded.id);
    if (!member) return null;

    // Se o membro foi desativado, bloqueado ou banido
    if (member.status === 'bloqueado' || member.status === 'banido' || member.status === 'inativo') {
      return null;
    }

    // Se o PIN foi alterado após a emissão do token, revoga sessões anteriores
    if (decoded.pinFingerprint && member.pinHash) {
      const currentFingerprint = crypto.createHash('sha256').update(member.pinHash).digest('hex').substring(0, 10);
      if (decoded.pinFingerprint !== currentFingerprint) {
        return null;
      }
    }

    return member;
  } catch (err) {
    return null;
  }
}

// ==========================================
// RATE LIMITING & PROTEÇÃO BRUTE-FORCE ABRANGENTE
// ==========================================
const failedAttemptsMap = new Map(); // key -> { count, lastAttempt }

// Limpeza automática periódica para evitar vazamento de memória (Memory Leak DoS)
function pruneRateLimitMaps() {
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutos
  for (const [k, v] of failedAttemptsMap.entries()) {
    if (now - v.lastAttempt > maxAge) {
      failedAttemptsMap.delete(k);
    }
  }
}

const pruneTimer = setInterval(pruneRateLimitMaps, 5 * 60 * 1000);
if (pruneTimer.unref) pruneTimer.unref();

// Checagem de rate limit para Login (protege IP e Usuário separadamente)
function checkLoginRateLimit(ip, username) {
  const cleanIp = (ip || '127.0.0.1').trim();
  const cleanUser = username ? username.toString().trim().toLowerCase() : null;
  const now = Date.now();
  const cooldown = 3 * 60 * 1000; // 3 minutos de bloqueio após 5 falhas

  // 1. Limite por IP
  const ipRecord = failedAttemptsMap.get(`ip:${cleanIp}`);
  if (ipRecord && ipRecord.count >= 5) {
    const elapsed = now - ipRecord.lastAttempt;
    if (elapsed < cooldown) {
      const waitSeconds = Math.ceil((cooldown - elapsed) / 1000);
      return {
        allowed: false,
        error: `Acesso bloqueado por segurança: Muitas tentativas incorretas com PIN a partir deste endereço IP. Aguarde ${waitSeconds}s antes de tentar novamente.`
      };
    } else {
      failedAttemptsMap.delete(`ip:${cleanIp}`);
    }
  }

  // 2. Limite por Usuário (defesa contra ataques distribuídos / credential stuffing)
  if (cleanUser) {
    const userRecord = failedAttemptsMap.get(`user:${cleanUser}`);
    if (userRecord && userRecord.count >= 5) {
      const elapsed = now - userRecord.lastAttempt;
      if (elapsed < cooldown) {
        const waitSeconds = Math.ceil((cooldown - elapsed) / 1000);
        return {
          allowed: false,
          error: `Acesso temporariamente bloqueado para o codinome '${cleanUser}': Múltiplas falhas registradas. Aguarde ${waitSeconds}s.`
        };
      } else {
        failedAttemptsMap.delete(`user:${cleanUser}`);
      }
    }
  }

  return { allowed: true };
}

function recordLoginFailure(ip, username) {
  const cleanIp = (ip || '127.0.0.1').trim();
  const now = Date.now();

  const ipKey = `ip:${cleanIp}`;
  const ipRecord = failedAttemptsMap.get(ipKey) || { count: 0, lastAttempt: now };
  ipRecord.count += 1;
  ipRecord.lastAttempt = now;
  failedAttemptsMap.set(ipKey, ipRecord);

  if (username) {
    const cleanUser = username.toString().trim().toLowerCase();
    const userKey = `user:${cleanUser}`;
    const userRecord = failedAttemptsMap.get(userKey) || { count: 0, lastAttempt: now };
    userRecord.count += 1;
    userRecord.lastAttempt = now;
    failedAttemptsMap.set(userKey, userRecord);
  }
}

function clearLoginFailures(ip, username) {
  const cleanIp = (ip || '127.0.0.1').trim();
  failedAttemptsMap.delete(`ip:${cleanIp}`);
  if (username) {
    const cleanUser = username.toString().trim().toLowerCase();
    failedAttemptsMap.delete(`user:${cleanUser}`);
  }
}

// Rate limiting genérico para ações sensíveis (ex: reveal de senhas, alteração de PIN, transações)
function checkActionRateLimit(key, maxAttempts = 5, cooldownMs = 120000, actionName = 'esta ação') {
  const now = Date.now();
  const record = failedAttemptsMap.get(`act:${key}`);
  if (!record) return { allowed: true };

  if (record.count >= maxAttempts) {
    const elapsed = now - record.lastAttempt;
    if (elapsed < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      return {
        allowed: false,
        error: `Limite de segurança excedido para ${actionName}. Aguarde ${waitSeconds}s antes de tentar novamente.`
      };
    } else {
      failedAttemptsMap.delete(`act:${key}`);
    }
  }
  return { allowed: true };
}

function recordActionFailure(key) {
  const now = Date.now();
  const k = `act:${key}`;
  const record = failedAttemptsMap.get(k) || { count: 0, lastAttempt: now };
  record.count += 1;
  record.lastAttempt = now;
  failedAttemptsMap.set(k, record);
}

function clearActionFailures(key) {
  failedAttemptsMap.delete(`act:${key}`);
}

// ==========================================
// MIDDLEWARES DE AUTORIZAÇÃO E SEGURANÇA
// ==========================================

// Middleware de Autenticação de Membro
function requireMemberAuth(req, res, next) {
  let token = null;

  // 1. Checa header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Checa cookies
  if (!token && req.cookies && req.cookies.nzi_token) {
    token = req.cookies.nzi_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Acesso restrito apenas para membros. Faça login para continuar."
    });
  }

  try {
    const member = verifyMemberToken(token);
    if (!member) {
      return res.status(401).json({
        success: false,
        error: "Acesso restrito apenas para membros. Sessão expirada ou não autorizada."
      });
    }

    req.member = {
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      level: member.level,
      status: member.status,
      profitShare: member.profitShare,
      weeklyEarnings: member.weeklyEarnings
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Acesso restrito apenas para membros. Sessão expirada ou inválida."
    });
  }
}

// Middleware para autorização de cargos superiores
function requireMinLevel(maxLevel) {
  return (req, res, next) => {
    if (!req.member) {
      return res.status(401).json({
        success: false,
        error: "Acesso restrito apenas para membros."
      });
    }
    // Nível menor = hierarquia mais alta (Level 1 é Dono, Level 2 é Fundador)
    if (req.member.level > maxLevel) {
      return res.status(403).json({
        success: false,
        error: "Acesso restrito apenas para membros autorizados: Ação restrita a hierarquias superiores da Nzi Mafia."
      });
    }
    next();
  };
}

// Middleware de autorização para Administradores de Operações (Níveis 1 e 2 - Dono e Fundador)
function requireAdminAuth(req, res, next) {
  requireMemberAuth(req, res, () => {
    if (!req.member || req.member.level > 2) {
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Somente administradores autorizados (Dono e Fundador) podem gerenciar o painel de Operações."
      });
    }
    next();
  });
}

// Middleware de autenticação opcional (identifica visitante ou membro)
function optionalMemberAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.cookies && req.cookies.nzi_token) {
    token = req.cookies.nzi_token;
  }
  if (token) {
    const member = verifyMemberToken(token);
    if (member) {
      req.member = {
        id: member.id,
        username: member.username,
        name: member.name,
        role: member.role,
        level: member.level,
        status: member.status,
        profitShare: member.profitShare,
        weeklyEarnings: member.weeklyEarnings,
        isAdmin: member.level <= 2
      };
    }
  }
  next();
}

// Middleware de Proteção Anti-CSRF para rotas de mutação
function requireCsrfProtection(req, res, next) {
  const mutationMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!mutationMethods.includes(req.method)) {
    return next();
  }

  // Endpoints públicos que operam sem cookie de sessão prévio
  const publicExceptions = ['/api/auth/login', '/api/track'];
  if (publicExceptions.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Se o cliente autenticou explicitamente via cabeçalho Authorization Bearer, não é vulnerável a CSRF por cookie
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Validação de origem em requisições que utilizam cookies de sessão
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const host = req.headers['host'];

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return next();
    } catch (e) {}
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host) return next();
    } catch (e) {}
  }

  return res.status(403).json({
    success: false,
    error: "Ação bloqueada: Validação de segurança de origem falhou (Proteção Anti-CSRF)."
  });
}

// Sanitização estrita de URLs (impede injeções javascript:, data:, vbscript:)
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) return '';
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  if (/^https?:\/\/[a-z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

// ==========================================
// CRIPTOGRAFIA AES-256-GCM PARA CREDENCIAIS
// ==========================================
const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest(); // 32 bytes

function encryptSecret(text) {
  if (!text) return { encrypted: '', iv: '', tag: '' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag
  };
}

function decryptSecret(encrypted, ivHex, tagHex) {
  if (!encrypted || !ivHex || !tagHex) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Falha na decriptação da credencial]';
  }
}

module.exports = {
  JWT_SECRET,
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
  sanitizeUrl,
  encryptSecret,
  decryptSecret
};
