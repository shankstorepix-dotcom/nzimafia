# Deploy NZI Mafia no Vercel (corrigido 404)

## Estrutura obrigatória no GitHub

Na **raiz do repositório** devem existir estes arquivos (não dentro de subpastas):

```
/
├── api/
│   └── index.js
├── public/
│   ├── assets/
│   ├── dashboard.html
│   └── ...
├── server.js
├── index.html
├── package.json
├── vercel.json
├── mrrobot.gif
├── auth.js
├── db.js
└── ...
```

Se o GitHub tiver algo como `nzi-dashboard-melhorado/Nzi Mafia/...`, o Vercel **não acha** o `server.js` e devolve **404 NOT_FOUND**.

### Como corrigir a estrutura

1. No GitHub, os arquivos devem estar na raiz do repo.
2. Ou no Vercel → Project Settings → **General** → **Root Directory** aponte para a pasta onde está o `package.json` / `vercel.json` (ex.: `Nzi Mafia` — evite espaços no nome da pasta).

## Redeploy após esta correção

```bash
# Na pasta do projeto (raiz com vercel.json)
git add .
git commit -m "fix: vercel api entry + config"
git push
```

O Vercel faz redeploy automático no push.

## Variáveis de ambiente (obrigatórias)

Vercel → Project → Settings → Environment Variables:

| Nome | Valor |
|------|--------|
| `JWT_SECRET` | string longa (≥ 32 caracteres) |
| `ADMIN_SETUP_SECRET` | segredo para criar o 1º admin |
| `ALLOWED_ORIGINS` | `https://SEU-PROJETO.vercel.app` |
| `TRUST_PROXY` | `1` |
| `SUPABASE_URL` | URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |
| `SUPABASE_ANON_KEY` | anon key |

Depois: **Deployments** → ⋮ no último deploy → **Redeploy**.

## Checklist se ainda der 404

1. Abra o deploy no Vercel → aba **Building** / **Logs** e veja se o build passou.
2. Confirme que `vercel.json` e `api/index.js` estão na **raiz** do que o Vercel considera o projeto.
3. Root Directory (Settings → General) deve estar vazio **ou** apontar exatamente para a pasta com `package.json`.
4. Framework Preset: **Other** (não Next.js).

## Teste local

```bash
npm install
npm start
# abra http://localhost:3000
```
