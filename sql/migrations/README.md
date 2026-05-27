# Migrations incrementais

Este diretório guarda **mudanças no schema feitas DEPOIS do deploy inicial**.

O `01-bootstrap.sql` representa o estado inicial completo do banco. Qualquer
mudança subsequente (nova tabela, nova coluna, nova policy, novo índice) deve
virar um arquivo aqui dentro.

---

## Convenção de nomes

Use o formato:
```
YYYY-MM-DD-<descricao-curta>.sql
```

Exemplos:
- `2026-06-15-add-student-tags.sql`
- `2026-07-02-payment-discounts.sql`
- `2026-08-10-fix-attendance-cascade.sql`

A data garante ordem cronológica óbvia ao listar `ls`. A descrição em
kebab-case facilita leitura.

---

## Regras

1. **Sempre idempotente**: use `create table if not exists`, `add column if
   not exists`, `drop policy if exists ... ; create policy ...`, `create
   index if not exists`. Permite re-aplicar sem erro.

2. **Sem `drop cascade` destrutivo**: nunca apague dados. Se precisar
   "limpar" uma tabela errada, faça em uma migration específica e
   documentada — não recrie do zero.

3. **Comentário cabeçalho explicando o porquê**: descreva qual feature
   ou bug a migration resolve.

4. **Atualize o `01-bootstrap.sql`**: depois de aplicar uma migration em
   produção, considere refletir a mudança no bootstrap (para que um deploy
   futuro a partir do zero já a inclua). Isso evita drift entre o bootstrap
   e o estado real do banco.

5. **Funções SECURITY DEFINER**: sempre com `set search_path = public` (evita
   search_path hijacking).

---

## Como aplicar

No painel do Supabase → SQL Editor → New query → cole o conteúdo →
salve com o mesmo nome do arquivo → Run.

Cada migration roda uma única vez na vida do banco (a idempotência é seguro,
não convite a re-rodar sem propósito).

---

## Exemplo de migration

```sql
-- =========================================================================
-- 2026-06-15 — Adiciona tags a alunos
-- Motivação: permitir agrupar alunos por interesse (ex: "conversação",
-- "preparação para exame Cambridge") sem mexer na estrutura de turmas.
-- =========================================================================

alter table students
  add column if not exists tags text[] default '{}';

create index if not exists idx_students_tags on students using gin(tags);
```
