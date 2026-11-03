const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@mercadinhobelo.com';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Nao autorizado.' });
  }
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(503).json({ error: 'Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e as duas chaves VAPID.' });
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: cfgRows, error: cfgError } = await sb.from('configuracoes').select('chave,valor');
    if (cfgError) throw cfgError;
    const cfg = Object.fromEntries((cfgRows || []).map(row => [row.chave, row.valor]));
    const days = Math.max(1, Math.min(60, parseInt(cfg.dias_alerta || '7', 10) || 7));
    const now = new Date();
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [hour, minute] = String(cfg.hora_notificacao || '08:00').split(':').map(Number);
    const offset = parseInt(cfg.tz_offset || '180', 10);
    const targetMinute = (((hour || 0) * 60 + (minute || 0) + offset) % 1440 + 1440) % 1440;
    const delta = Math.min(Math.abs(utcMinute - targetMinute), 1440 - Math.abs(utcMinute - targetMinute));
    if (delta > 8) return res.status(200).json({ ok:true, skipped:true, reason:'fora do horario configurado' });
    const todayKey = now.toISOString().slice(0,10);
    if (cfg.last_push_day === todayKey) return res.status(200).json({ ok:true, skipped:true, reason:'ja enviado hoje' });
    const today = new Date();
    const dateOnly = d => d.toISOString().slice(0, 10);
    const end = new Date(today); end.setUTCDate(end.getUTCDate() + days);
    const todayStr = dateOnly(today), endStr = dateOnly(end);

    const { data: lots, error: lotError } = await sb.from('lotes')
      .select('id,quantidade,vencimento,produtos(nome)')
      .gt('quantidade', 0).lte('vencimento', endStr).order('vencimento', { ascending: true });
    if (lotError) throw lotError;
    const activeLots = lots || [];
    const expired = activeLots.filter(l => l.vencimento < todayStr);
    const upcoming = activeLots.filter(l => l.vencimento >= todayStr);
    const lines = activeLots.slice(0, 10).map(l => {
      const name = l.produtos?.nome || 'Produto';
      if (l.vencimento < todayStr) return `• ${name}: vencido desde ${l.vencimento}`;
      if (l.vencimento === todayStr) return `• ${name}: vence hoje`;
      return `• ${name}: vence em ${l.vencimento}`;
    });
    if (activeLots.length > 10) lines.push(`… e mais ${activeLots.length - 10} lote(s)`);
    if (!activeLots.length) return res.status(200).json({ ok: true, skipped: true, message: 'Nenhum lote no periodo de alerta.' });

    const { data: subs, error: subError } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth');
    if (subError) throw subError;
    let sent = 0, failed = 0;
    const payload = JSON.stringify({
      title: `Atenção: ${expired.length} vencido(s), ${upcoming.length} no prazo de alerta`,
      body: lines.join('\n'), url: '/index.html'
    });
    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
    await sb.from('configuracoes').upsert({ chave:'last_push_day', valor:todayKey, updated_at:new Date().toISOString() });
    return res.status(200).json({ ok: true, sent, failed, vencidos: expired.length, proximos: upcoming.length, dias_alerta: days });
  } catch (error) {
    console.error('send-notifications:', error);
    return res.status(500).json({ error: 'Falha ao processar notificacoes.' });
  }
};
