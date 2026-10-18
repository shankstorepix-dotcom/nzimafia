const http = require('http');
const app = require('./server');

let server;

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          raw: data,
          json: json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const PORT = 3999;
  server = app.listen(PORT);
  console.log('Testing security on port', PORT);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(' [PASS]', message);
      passed++;
    } else {
      console.error(' [FAIL]', message);
      failed++;
    }
  }

  try {
    // 1. Testa Cabeçalhos de Segurança (Helmet, CSP, X-Frame-Options, X-Content-Type-Options, etc)
    const resHome = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/',
      method: 'GET'
    });
    assert(resHome.headers['x-content-type-options'] === 'nosniff', 'Header X-Content-Type-Options: nosniff presente');
    assert(resHome.headers['content-security-policy'] !== undefined, 'Content-Security-Policy (CSP) ativo');
    assert(resHome.headers['x-powered-by'] === undefined, 'Header X-Powered-By ocultado');

    // 2. Testa CORS Restritivo
    const resCorsGood = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/public/stats',
      method: 'GET',
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert(resCorsGood.statusCode === 200, 'CORS permite localhost em desenvolvimento');

    const resCorsBad = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/public/stats',
      method: 'GET',
      headers: { 'Origin': 'http://evil-hacker-site.com' }
    });
    assert(resCorsBad.statusCode === 500 || resCorsBad.statusCode === 403 || !resCorsBad.headers['access-control-allow-origin'] || resCorsBad.headers['access-control-allow-origin'] !== 'http://evil-hacker-site.com', 'CORS rejeita origens não autorizadas');

    // 3. Testa Bloqueio do Endpoint Crítico /api/auth/register-admin sem credencial de Dono
    const resRegAdmin = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/register-admin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': '127.0.0.1:3999' },
    }, { username: 'malicious_admin', name: 'Invasor', pin: '999999', role: 'Owner', level: 1 });
    assert(resRegAdmin.statusCode === 401 || resRegAdmin.statusCode === 403, 'Tentativa de criar Admin não autenticado bloqueada com ' + resRegAdmin.statusCode);

    // 4. Testa Login com credencial válida (ph_labubu / 777001)
    const resLogin = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': '127.0.0.1:3999' }
    }, { username: 'ph_labubu', pin: '777001', hwid: 'hwid_7e77809b_12c_1108x693' });
    assert(resLogin.statusCode === 200 && resLogin.json && resLogin.json.success, 'Login legítimo realizado com sucesso');
    const token = resLogin.json ? resLogin.json.token : null;

    // 5. Testa Ausência de defaultPinHint na lista de membros do dashboard
    const resMembers = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/dashboard/members',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(resMembers.statusCode === 200, 'Consulta de membros autorizada');
    const hasPinHintLeaked = resMembers.json && resMembers.json.members && resMembers.json.members.some(m => m.defaultPinHint !== undefined);
    assert(!hasPinHintLeaked, 'Nenhum defaultPinHint exposto na lista de membros');

    // 6. Testa Proteção Anti-CSRF em rotas de mutação sem Origin/Referer válido com cookie
    const cookie = resLogin.headers['set-cookie'] ? resLogin.headers['set-cookie'][0] : '';
    const resCsrfAttack = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/dashboard/my-status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': 'https://malicious-website.com',
        'Host': '127.0.0.1:3999'
      }
    }, { status: 'ocupado' });
    assert(resCsrfAttack.statusCode === 403, 'Ataque CSRF cross-origin bloqueado com 403');

    // 7. Testa Rate Limiting após múltiplas falhas de login
    let rateBlocked = false;
    for (let i = 0; i < 6; i++) {
      const resBadLogin = await request({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Host': '127.0.0.1:3999' }
      }, { username: 'kage', pin: '000000' });
      if (resBadLogin.statusCode === 429) {
        rateBlocked = true;
        break;
      }
    }
    assert(rateBlocked, 'Rate Limiter bloqueou ataques de força bruta com HTTP 429');

    console.log(`\n========================================`);
    console.log(`Testes Concluídos: ${passed} PASSOU, ${failed} FALHOU`);
    console.log(`========================================`);
  } catch (err) {
    console.error('Erro nos testes:', err);
  } finally {
    server.close();
  }
}

runTests();
