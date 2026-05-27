// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// @ts-ignore
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl         = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verifica que quem chamou é admin
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await userClient
      .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem convidar professores' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lê o body
    const { email, name, defaultRate } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'E-mail obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usa service_role para criar o convite
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role: 'teacher' },
    });
    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = invite?.user?.id;

    if (newUserId) {
      await admin.from('profiles').upsert({
        id:                  newUserId,
        email,
        name:                name || null,
        role:                'teacher',
        default_lesson_rate: defaultRate ?? null,
        active:              true,
        updated_at:          new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
