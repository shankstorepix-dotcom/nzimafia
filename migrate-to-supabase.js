/**
 * NZI MAFIA — SCRIPT DE MIGRAÇÃO PARA SUPABASE
 * 
 * Este script migra todos os dados do arquivo local `data/database.json`
 * diretamente para as tabelas correspondentes no Supabase.
 * 
 * Uso:
 *   node migrate-to-supabase.js
 * ou
 *   npm run supabase:migrate
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getSupabase, isSupabaseConfigured, testSupabaseConnection } = require('./supabaseClient');

const DB_FILE = path.join(__dirname, 'data', 'database.json');

async function runMigration() {
  console.log('========================================================');
  console.log('  NZI MAFIA — MIGRAÇÃO DE DADOS PARA SUPABASE');
  console.log('========================================================\n');

  if (!isSupabaseConfigured()) {
    console.error('❌ ERRO: Supabase não está configurado no arquivo .env.');
    console.error('   Abra o arquivo .env e preencha as variáveis:');
    console.error('   - SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY=eyJh...... (ou SUPABASE_KEY)');
    process.exit(1);
  }

  console.log('🔍 Testando conexão com o Supabase...');
  const test = await testSupabaseConnection();
  if (!test.connected) {
    console.error(`❌ ERRO de conexão: ${test.message}`);
    console.error('   Certifique-se de executar o script "supabase_schema.sql" no SQL Editor do Supabase primeiro!');
    process.exit(1);
  }
  console.log('✅ Conexão com Supabase confirmada!\n');

  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ Arquivo de dados não encontrado em: ${DB_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const db = JSON.parse(raw);
  const supabase = getSupabase();

  console.log('🚀 Iniciando envio dos dados para o Supabase...\n');

  // 1. Membros
  if (Array.isArray(db.members) && db.members.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.members.length} membros... `);
    const membersRows = db.members.map(m => ({
      id: m.id,
      username: m.username,
      name: m.name,
      role: m.role,
      level: m.level,
      pin_hash: m.pinHash,
      password_hash: m.passwordHash || null,
      default_pin_hint: m.defaultPinHint || null,
      status: m.status || 'online',
      profit_share: m.profitShare || '4%',
      weekly_earnings: Number(m.weeklyEarnings) || 0,
      last_login: m.lastLogin || null,
      created_at: m.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('members')
      .upsert(membersRows, { onConflict: 'id' });

    if (error) {
      console.log(`❌ Falha: ${error.message}`);
    } else {
      console.log(`✅ Sucesso!`);
    }
  }

  // 2. Cofre & Dados Financeiros
  if (db.financials) {
    process.stdout.write('⏳ Migrando dados financeiros do cofre... ');
    const finRow = {
      id: 1,
      total_vault: Number(db.financials.totalVault) || 1290000,
      weekly_profit: Number(db.financials.weeklyProfit) || 165000,
      currency: db.financials.currency || 'BRL',
      last_distribution: db.financials.lastDistribution || '2026-10-16 23:45',
      rules: db.financials.rules || {}
    };

    const { error } = await supabase
      .from('financials')
      .upsert([finRow], { onConflict: 'id' });

    if (error) {
      console.log(`❌ Falha: ${error.message}`);
    } else {
      console.log(`✅ Sucesso!`);
    }
  }

  // 3. Operações
  if (Array.isArray(db.operations) && db.operations.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.operations.length} operações... `);
    const opRows = db.operations.map(o => ({
      id: o.id,
      title: o.title,
      status: o.status || 'Em andamento',
      target: Number(o.target) || 0,
      leader: o.leader || 'Liderança',
      priority: o.priority || 'ALTA',
      description: o.description || ''
    }));

    const { error } = await supabase
      .from('operations')
      .upsert(opRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 4. Mural Confidencial
  if (Array.isArray(db.announcements) && db.announcements.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.announcements.length} comunicados do mural... `);
    const annRows = db.announcements.map(a => ({
      id: a.id,
      author: a.author,
      role: a.role,
      date: a.date,
      title: a.title,
      content: a.content,
      pinned: Boolean(a.pinned)
    }));

    const { error } = await supabase
      .from('announcements')
      .upsert(annRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 5. Transações Financeiras
  if (Array.isArray(db.transactions) && db.transactions.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.transactions.length} transações... `);
    const txRows = db.transactions.map(t => ({
      id: t.id,
      type: t.type === 'OUT' ? 'OUT' : 'IN',
      amount: Number(t.amount) || 0,
      description: t.description,
      date: t.date,
      author: t.author || 'Sistema'
    }));

    const { error } = await supabase
      .from('transactions')
      .upsert(txRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 6. Publicações (Posts CC, Painel, Conta Discord, etc.)
  if (Array.isArray(db.posts) && db.posts.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.posts.length} publicações... `);
    const postRows = db.posts.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      category: p.category,
      status: p.status || 'Publicado',
      image: p.image || '',
      link: p.link || '',
      published_at: p.publishedAt || null,
      author: p.author || 'Diretoria'
    }));

    const { error } = await supabase
      .from('posts')
      .upsert(postRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 7. Eventos & Temporizadores
  if (Array.isArray(db.events) && db.events.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.events.length} eventos... `);
    const evtRows = db.events.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description || '',
      event_date: e.eventDate,
      timezone: e.timezone || 'America/Sao_Paulo (GMT-3)',
      start_time: e.startTime || '23:00',
      end_time: e.endTime || '01:00',
      status: e.status || 'Agendado',
      published: e.published !== false
    }));

    const { error } = await supabase
      .from('events')
      .upsert(evtRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 8. Central de Links
  if (db.links) {
    process.stdout.write('⏳ Migrando central de links... ');
    const linkKeys = Object.keys(db.links);
    const linkRows = linkKeys.map(k => ({
      key: k,
      name: db.links[k].name,
      icon: db.links[k].icon,
      url: db.links[k].url,
      description: db.links[k].description,
      is_available: db.links[k].isAvailable !== false
    }));

    const { error } = await supabase
      .from('links')
      .upsert(linkRows, { onConflict: 'key' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 9. Contas Discord
  if (Array.isArray(db.discordAccounts) && db.discordAccounts.length > 0) {
    process.stdout.write(`⏳ Migrando ${db.discordAccounts.length} contas Discord... `);
    const discRows = db.discordAccounts.map(d => ({
      id: d.id,
      title: d.title,
      bot_tag: d.botTag,
      description: d.description,
      permissions: d.permissions,
      status: d.status || 'Ativo',
      is_public_disclosed: d.isPublicDisclosed !== false,
      encrypted_secret: d.encryptedSecret,
      secret_iv: d.secretIv,
      secret_tag: d.secretTag
    }));

    const { error } = await supabase
      .from('discord_accounts')
      .upsert(discRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  // 10. Auditoria
  if (Array.isArray(db.auditLogs) && db.auditLogs.length > 0) {
    process.stdout.write(`⏳ Migrando ${Math.min(db.auditLogs.length, 50)} logs de auditoria recentes... `);
    const auditRows = db.auditLogs.slice(0, 50).map(a => ({
      id: a.id,
      member: a.member,
      role: a.role,
      action: a.action,
      status: a.status,
      ip: a.ip,
      timestamp: a.timestamp
    }));

    const { error } = await supabase
      .from('audit_logs')
      .upsert(auditRows, { onConflict: 'id' });

    if (error) console.log(`❌ Falha: ${error.message}`);
    else console.log(`✅ Sucesso!`);
  }

  console.log('\n========================================================');
  console.log('✨ MIGRAÇÃO PARA SUPABASE CONCLUÍDA COM SUCESSO!');
  console.log('   O banco Supabase agora contém todos os dados do dashboard');
  console.log('   e as credenciais criptografadas do sistema de login.');
  console.log('========================================================\n');
}

runMigration().catch(err => {
  console.error('\n❌ Erro fatal na migração:', err.message);
  process.exit(1);
});
