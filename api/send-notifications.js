const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BE4K-sQoS03PFNg8xV1CNIUvI4r1pADFJNjPTJqIA8U342S7tKcv_VQ4CNNBN5C7jlXqZx9WvGUHhiHK0j0M3Hw';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'EQA0N6bCysdPbueQIQVTmtXobAyINYVOcL9p7XOwh-U';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@mercadinhobelo.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async (req, res) => {
  try {
    // Load config
    const { data: cfgRows } = await sb.from('configuracoes').select('chave, valor');
    const cfg = {};
    (cfgRows || []).forEach(r => { cfg[r.chave] = r.valor; });
    const diasAlerta = parseInt(cfg['dias_alerta'] || '3', 10);
    const horaNotif = cfg['hora_notificacao'] || '08:00';
    const tzOffset = parseInt(cfg['tz_offset'] || '0', 10);

    const force = req.query && req.query.force === '1';

    // Check time match (unless forced)
    if (!force) {
      const now = new Date();
      const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
      const [hh, mm] = horaNotif.split(':').map(x => parseInt(x, 10));
      const localMin = (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm);
      const targetUtcMin = (localMin + tzOffset + 1440) % 1440;
      const diff = Math.min(Math.abs(utcMin - targetUtcMin), 1440 - Math.abs(utcMin - targetUtcMin));
      if (diff > 2 && !force) {
        return res.status(200).json({ skipped: true, reason: 'not time yet', now: utcMin, target: targetUtcMin, diff });
      }
      // avoid duplicate same day
      const today = now.toISOString().slice(0, 10);
      // store last sent day in configuracoes
      if (cfg['last_push_day'] === today) {
        return res.status(200).json({ skipped: true, reason: 'already sent today' });
      }
    }

    // Get expired items
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: lotes } = await sb.from('lotes').select('id, quantidade, vencimento, produtos(nome)').lt('vencimento', todayStr);
    const vencidos = lotes || [];
    if (vencidos.length === 0 && !force) {
      return res.status(200).json({ skipped: true, reason: 'no expired items' });
    }

    // Build message
    const linhas = vencidos.slice(0, 8).map(l => '• ' + (l.produtos && l.produtos.nome ? l.produtos.nome : 'Item') + ' — vencido');
    if (vencidos.length > 8) linhas.push('… e mais ' + (vencidos.length - 8) + ' item(ns)');
    const titulo = vencidos.length > 0 ? '⚠️ ' + vencidos.length + ' item(ns) vencido(s)' : '✅ Sem itens vencidos';
    const corpo = vencidos.length > 0 ? linhas.join('\n') : 'Nenhum item vencido hoje.';

    // Get subscriptions
    const { data: subs } = await sb.from('push_subscriptions').select('*');
    let sent = 0, failed = 0;
    for (const s of (subs || [])) {
      try {
        const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        await webpush.sendNotification(subscription, JSON.stringify({ title: titulo, body: corpo }));
        sent++;
      } catch (e) {
        failed++;
        // remove invalid subscriptions
        if (e.statusCode === 410 || e.statusCode === 404) {
          await sb.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }

    // mark last sent day
    if (!force) {
      await sb.from('configuracoes').upsert({ chave: 'last_push_day', valor: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() });
    }

    return res.status(200).json({ ok: true, sent, failed, total: vencidos.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};