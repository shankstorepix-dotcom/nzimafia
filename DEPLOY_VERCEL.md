# Deploy NZI Mafia no Vercel

## 1. Subir o projeto

### Opção A — CLI (recomendado)
```bash
npm i -g vercel
cd nzi-vercel-deploy   # pasta deste pacote
vercel
```

### Opção B — GitHub
1. Crie um repositório no GitHub e envie esta pasta (sem node_modules).
2. Em vercel.com → Add New Project → importe o repositório.
3. **Root Directory:** deixe a raiz (onde está o `server.js`).
4. Framework Preset: Other.

## 2. Variáveis de ambiente (Vercel → Project → Settings → Environment Variables)

| Nome | Valor |
|------|--------|
| `JWT_SECRET` | string longa e aleatória (min. 32 chars) |
| `ADMIN_SETUP_SECRET` | segredo para criar o 1º admin |
| `ALLOWED_ORIGINS` | `https://SEU-PROJETO.vercel.app` (e domínio custom se tiver) |
| `TRUST_PROXY` | `1` |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |
| `SUPABASE_ANON_KEY` | anon key (opcional) |

> **Importante:** no Vercel o sistema de arquivos é **somente leitura**.  
> O `data/database.json` **não persiste**. Use **Supabase** em produção  
> (rode o SQL de `supabase_schema.sql` no SQL Editor do Supabase).

## 3. Após o deploy

1. Acesse `https://SEU-PROJETO.vercel.app`
2. GIF da home (`mrrobot.gif`) e do dashboard (`/assets/dashboard-hero.gif`) devem aparecer.
3. Em **Entretenimento** → estação **Luxúria** → o embed do Spotify carrega (clique Play no player do Spotify; o navegador bloqueia autoplay).
4. Configure o CORS: coloque a URL do Vercel em `ALLOWED_ORIGINS`.

## 4. GIFs personalizados

Substitua os arquivos placeholder:
- `mrrobot.gif` (raiz do projeto) → tela inicial
- `public/assets/dashboard-hero.gif` → hero do dashboard

Depois faça um novo deploy.

## Problemas comuns

- **Spotify não aparece:** CSP já liberado para `open.spotify.com`. Se ainda falhar, limpe o cache do navegador.
- **Login / API 500:** confira `JWT_SECRET` e Supabase.
- **CORS bloqueado:** `ALLOWED_ORIGINS` deve incluir a URL exata do site (com https).
