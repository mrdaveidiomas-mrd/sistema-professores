/* ==========================================================================
   ERRORS.JS — Captura, registra e reporta erros não tratados
   --------------------------------------------------------------------------
   - Loga erros no console com contexto enriquecido
   - Mostra toast amigável ao usuário em produção
   - Persiste em `error_logs` no Supabase (se a tabela existir)
   - API: HT.errors.report(err, context)
   ========================================================================== */

window.HT = window.HT || {};

HT.errors = (() => {

  const MAX_QUEUE = 50;
  const queue = [];
  let flushing = false;

  /* ------------------------------------------------------------------ */
  function _ctx() {
    return {
      url:        window.location.href,
      userAgent:  navigator.userAgent,
      timestamp:  new Date().toISOString(),
      viewport:   `${window.innerWidth}×${window.innerHeight}`,
    };
  }

  async function _userId() {
    try {
      const { data } = await HT.supabase.auth.getUser();
      return data?.user?.id || null;
    } catch { return null; }
  }

  function _shouldNotifyUser(err) {
    /* Erros de rede/auth ficam silenciosos (já tratados por toast nos módulos).
       Reservamos o toast genérico para erros realmente inesperados. */
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('failed to fetch')) return false;
    if (msg.includes('not authenticated')) return false;
    if (msg.includes('jwt')) return false;
    return true;
  }

  /* ------------------------------------------------------------------ */
  async function _flush() {
    if (flushing || !queue.length) return;
    flushing = true;
    const batch = queue.splice(0, queue.length);
    try {
      const userId = await _userId();
      const rows = batch.map(item => ({
        user_id:    userId,
        message:    String(item.error?.message || item.error || 'Unknown'),
        stack:      String(item.error?.stack  || ''),
        context:    { ...item.context, ..._ctx() },
        created_at: new Date().toISOString(),
      }));
      /* Tenta gravar — se a tabela não existir, falha silenciosa.
         Não há await/throw para não bloquear app caso BD esteja fora. */
      await HT.supabase.from('error_logs').insert(rows);
    } catch {
      /* swallow — não queremos loop de erro reportando erro */
    } finally {
      flushing = false;
    }
  }

  /* ------------------------------------------------------------------ */
  function report(error, context = {}) {
    const item = { error, context };
    console.error('[HT.errors]', error, context);

    queue.push(item);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);

    if (_shouldNotifyUser(error) && HT.utils?.showToast) {
      HT.utils.showToast(
        context.userMessage || 'Algo deu errado. Tente novamente.',
        'error'
      );
    }

    /* debounce: agrupa múltiplos erros próximos numa única chamada de rede */
    clearTimeout(report._t);
    report._t = setTimeout(_flush, 1500);
  }

  /* ------------------------------------------------------------------ */
  /* Wraps automáticos */
  window.addEventListener('error', (e) => {
    if (!e.error) return;
    report(e.error, { source: 'window.error', filename: e.filename, lineno: e.lineno });
  });

  window.addEventListener('unhandledrejection', (e) => {
    report(e.reason, { source: 'unhandledrejection' });
  });

  return { report };
})();
