// =============================================================================
// GENERATE MONTHLY PAYMENTS
// -----------------------------------------------------------------------------
// Edge Function que gera registros pending em `payments` para todos os alunos
// ativos baseado em monthly_fee + pay_day.
//
// Idempotente: se já existir um payment para (student_id, reference) o registro
// é ignorado.
//
// Pode ser chamada:
//   - Manualmente: POST /functions/v1/generate-monthly-payments
//                  body: { "reference": "2026-06" }   (opcional; default = mês atual)
//   - Automaticamente via pg_cron: ver SQL em
//     sql/schedule-monthly-payments.sql
// =============================================================================

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dueDateFor(reference: string, payDay: number | null): string | null {
  if (!payDay) return null;
  const [y, m] = reference.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(1, payDay), lastDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isContractActive(start: string | null, end: string | null, reference: string): boolean {
  /* Reference é YYYY-MM. O contrato está ativo no mês se:
     - contractStart é null OU <= último dia do mês de referência
     - contractEnd   é null OU >= primeiro dia do mês de referência */
  const [y, m] = reference.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd   = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  if (start && start > monthEnd) return false;
  if (end   && end   < monthStart) return false;
  return true;
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret      = Deno.env.get('CRON_SECRET') || '';

    /* Auth: pode ser chamada por admin via JWT, OU pelo cron via header X-Cron-Secret */
    const authHeader = req.headers.get('Authorization') || '';
    const cronHeader = req.headers.get('X-Cron-Secret') || '';

    let isAuthorized = false;
    if (cronSecret && cronHeader === cronSecret) {
      isAuthorized = true;
    } else if (authHeader.startsWith('Bearer ')) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: profile } = await userClient
          .from('profiles').select('role').eq('id', user.id).single();
        isAuthorized = profile?.role === 'admin';
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body      = await req.json().catch(() => ({}));
    const reference = (body?.reference as string) || currentMonth();

    if (!/^\d{4}-\d{2}$/.test(reference)) {
      return new Response(JSON.stringify({ error: 'reference must be YYYY-MM' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    /* Buscar alunos com mensalidade configurada */
    const { data: students, error: studentsErr } = await admin.from('students')
      .select('id, monthly_fee, pay_day, contract_start, contract_end')
      .not('monthly_fee', 'is', null)
      .gt('monthly_fee', 0);

    if (studentsErr) throw studentsErr;

    const candidates = (students || []).filter(s =>
      isContractActive(s.contract_start, s.contract_end, reference)
    );

    if (!candidates.length) {
      return new Response(JSON.stringify({
        success: true, reference, created: 0, skipped: 0, total: 0,
        message: 'No active students with monthly_fee in this period.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* Buscar pagamentos já existentes para esse mês */
    const studentIds = candidates.map(s => s.id);
    const { data: existing, error: existingErr } = await admin.from('payments')
      .select('student_id')
      .eq('reference', reference)
      .in('student_id', studentIds);

    if (existingErr) throw existingErr;

    const alreadyHas = new Set((existing || []).map(p => p.student_id));
    const toCreate = candidates
      .filter(s => !alreadyHas.has(s.id))
      .map(s => ({
        student_id: s.id,
        reference,
        amount:     s.monthly_fee,
        due_date:   dueDateFor(reference, s.pay_day),
        status:     'pending',
      }));

    if (toCreate.length) {
      const { error: insErr } = await admin.from('payments').insert(toCreate);
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({
      success: true, reference,
      created: toCreate.length,
      skipped: candidates.length - toCreate.length,
      total:   candidates.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
