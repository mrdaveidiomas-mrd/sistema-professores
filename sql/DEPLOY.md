# Deploy SQL — Mr-Dave / Hey, Teacher!

Guia completo para deploy do banco em uma conta Supabase **nova/limpa**.

---

## 📁 Estrutura dos arquivos

```
sql/
├── 01-bootstrap.sql        ← TUDO: tabelas, RLS, funções, índices, storage
├── 02-cron-jobs.sql        ← Geração mensal de cobranças + mark-overdue
├── audit-rls.sql           ← Diagnóstico (read-only)
├── DEPLOY.md               ← este arquivo
└── migrations/             ← Mudanças incrementais PÓS-deploy
    └── README.md           ← convenção: YYYY-MM-DD-<descricao>.sql
```

---

## 🚀 Deploy em conta Supabase nova (passo a passo)

### Passo 1 — Criar o projeto Supabase

1. Acesse https://supabase.com/dashboard
2. New project → escolha nome, região (sugestão: `sa-east-1` São Paulo) e senha forte do banco
3. Aguarde o provisionamento (~2 minutos)

### Passo 2 — Atualizar credenciais no front-end

Pegue as credenciais em **Project Settings → API**:
- `Project URL` (algo como `https://xxxxx.supabase.co`)
- `anon public key`

Atualize em `js/supabase.js`:
```js
const SUPABASE_URL  = 'https://xxxxx.supabase.co';
const SUPABASE_ANON = 'eyJh...';
```

### Passo 3 — Rodar o bootstrap

**Onde:** Painel Supabase → SQL Editor → New query

**O que rodar:** todo o conteúdo de `sql/01-bootstrap.sql`

**Tempo:** ~5 segundos

**Resultado:** Cria 14 tabelas, todas as RLS policies, 16 índices, funções
auxiliares (`is_admin`, `current_role_name`, `handle_new_user`) e o
trigger de auto-criação de profile.

✅ **Esperado:** "Success. No rows returned"

⚠️ **AVISO:** este script é **destrutivo** — começa fazendo `drop cascade`.
Só rode em banco vazio ou ambiente de desenvolvimento.

### Passo 4 — Criar o bucket de materiais

**Onde:** Painel Supabase → Storage → New bucket

**Configuração:**
- Nome: `materials`
- Marcar **Public bucket** (necessário para preview via Office Online Viewer)

⚠️ As policies de storage para esse bucket já foram criadas pelo passo 3.

### Passo 5 — Criar o primeiro admin

**5.1.** No painel: Authentication → Users → "Add user"
- Email: o e-mail real do administrador (ex: `mrdaveidiomas@gmail.com`)
- Marcar "Auto Confirm User" (ou enviar magic-link)

**5.2.** No SQL Editor, promover a admin:
```sql
update profiles set role = 'admin'
  where email = 'mrdaveidiomas@gmail.com';
```

**5.3.** Verificar:
```sql
select id, email, role from profiles where role = 'admin';
```
Deve retornar a linha do usuário.

### Passo 6 — (OPCIONAL) Ativar automação mensal

Se você quer geração automática de cobranças no dia 1 de cada mês:

**6.1.** Deploy da Edge Function (via terminal local com `supabase` CLI):
```bash
cd Sistema-Mr.-Dave
supabase functions deploy generate-monthly-payments
supabase secrets set CRON_SECRET=<valor-aleatório-longo>
```

**6.2.** No painel: Database → Extensions → habilitar `pg_cron` e `pg_net`

**6.3.** No painel: Database → Vault → cadastrar 2 secrets:
- `cron_secret` = mesmo valor de `CRON_SECRET` acima
- `project_url` = `https://<seu-projeto>.supabase.co`

**6.4.** SQL Editor → rodar `sql/02-cron-jobs.sql`

**6.5.** Verificar:
```sql
select jobname, schedule, command from cron.job;
```
Deve listar `generate-monthly-payments` e `mark-overdue-payments`.

### Passo 7 — Testar

1. Acesse o sistema com o e-mail do admin → deve entrar como administrador
2. Cadastre um aluno de teste
3. Cadastre uma turma e vincule o aluno
4. Marque uma frequência
5. Use `audit-rls.sql` para confirmar que todas as policies estão ativas

---

## 🔍 Diagnóstico (qualquer momento)

**Onde:** SQL Editor

**O que rodar:** `sql/audit-rls.sql` (apenas `SELECT`s — read-only, sem risco)

Lista:
- Todas as policies cadastradas
- Tabelas sem RLS habilitada (deve estar vazia!)
- Tabelas sem nenhuma policy (deve estar vazia!)

---

## 🔧 Manutenção pós-deploy

### Adicionar uma nova feature ao banco

1. Crie `sql/migrations/YYYY-MM-DD-<descricao>.sql` (ver `migrations/README.md`)
2. Aplique no SQL Editor de produção
3. Considere refletir a mudança no `01-bootstrap.sql` para futuros deploys

### Resetar ambiente de desenvolvimento

Basta rodar `01-bootstrap.sql` novamente — apaga tudo e recria do zero.

⚠️ **Nunca** faça isso em produção. Use migrations para mudanças.

### Atualizar admin / adicionar segundo admin

```sql
-- Adicionar outro admin (mantendo os existentes)
update profiles set role = 'admin'
  where email = 'novo.admin@example.com';

-- Remover admin (cuidado: não rode antes de ter pelo menos outro admin!)
update profiles set role = 'teacher'
  where email = 'antigo.admin@example.com';

-- Listar todos os admins
select email, name from profiles where role = 'admin';
```

---

## ✅ Checklist final de deploy

- [ ] Projeto Supabase criado
- [ ] Credenciais atualizadas em `js/supabase.js`
- [ ] `01-bootstrap.sql` rodado com sucesso
- [ ] Bucket `materials` criado (público)
- [ ] Primeiro usuário criado em Auth → Users
- [ ] Usuário promovido a admin via SQL
- [ ] Login no sistema funcionando
- [ ] (Opcional) Edge Function deployada
- [ ] (Opcional) `CRON_SECRET` configurado em secrets + Vault
- [ ] (Opcional) `02-cron-jobs.sql` rodado
- [ ] (Opcional) `cron.job` mostra 2 tarefas agendadas
- [ ] `audit-rls.sql` confirma 0 tabelas sem RLS/policy

---

## 📚 Convenções do projeto

- **Idempotência**: novas migrations usam `if not exists` / `drop+create`
- **SECURITY DEFINER**: sempre com `set search_path = public`
- **Nome de policies**: `<tabela_abrev> <role> <comando>` (ex: `att teacher insert`)
- **Naming de índices**: `idx_<tabela>_<campos>` (ex: `idx_attendance_teacher_date`)
