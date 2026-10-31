const SUPABASE_URL = 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';
const DIAS_KEY = 'dias_alerta_mercadinho';
let DIAS_ALERTA = parseInt(localStorage.getItem(DIAS_KEY)) || 3;
let produtos = [];
let sb = null;
let sbReady = false;
let editando = null; // { loteId, produtoId }

const formProduto = document.getElementById('formProduto');
const listaProdutos = document.getElementById('lista-produtos');
const vazio = document.getElementById('vazio');
const inputBusca = document.getElementById('busca');
const todayBadge = document.getElementById('today-badge');
const statTotal = document.getElementById('statTotal');
const statProximos = document.getElementById('statProximos');
const statVencidos = document.getElementById('statVencidos');
const diasAlertaInput = document.getElementById('diasAlerta');
const diasAlertaLabel = document.getElementById('diasAlertaLabel');
const toastEl = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalProduto = document.getElementById('modal-produto');
const editQtd = document.getElementById('edit-quantidade');
const editVenc = document.getElementById('edit-vencimento');

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 4000);
}

// Normaliza nome: sem acentos, minúsculas, espaços duplos removidos
function normNome(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function initSupabase() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        showToast('Biblioteca Supabase nao carregou.');
        return;
    }
    try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        sbReady = true;
        showToast('Supabase conectado!');
    } catch (e) {
        showToast('Erro Supabase: ' + e.message);
    }
}

// ============ CARREGAR ============
async function loadProdutos() {
    if (!sbReady) { renderLista(); renderStats(); return; }
    try {
        const { data, error } = await sb
            .from('lotes')
            .select('id, produto_id, quantidade, vencimento, produtos(nome)')
            .order('vencimento', { ascending: true });
        if (error) throw error;

        const map = {};
        (data || []).forEach(r => {
            const nm = r.produtos && r.produtos.nome ? r.produtos.nome : 'Sem nome';
            if (!map[r.produto_id]) map[r.produto_id] = { id: r.produto_id, nome: nm, lotes: [] };
            map[r.produto_id].lotes.push({ id: r.id, quantidade: r.quantidade, vencimento: r.vencimento });
        });
        produtos = Object.values(map);
        // Produtos ordenados pelo lote mais próximo; lotes já chegam ordenados por vencimento
        produtos.sort((a, b) => new Date(a.lotes[0].vencimento) - new Date(b.lotes[0].vencimento));

        // AUTO-HEAL: remove produtos sem nenhum lote (órfãos)
        limparProdutosOrfaos(data || []);
    } catch (e) {
        showToast('Erro carregar: ' + e.message);
    }
    renderLista();
    renderStats();
}

// Remove silenciosamente produtos que ficaram sem nenhum lote (órfãos)
async function limparProdutosOrfaos(lotesAtuais) {
    try {
        const { data: todos, error } = await sb.from('produtos').select('id, created_at');
        if (error || !todos) return;
        const comLote = new Set(lotesAtuais.map(l => l.produto_id));
        const agora = Date.now();
        // Ignora produtos criados nos últimos 30s (podem estar em meio a um cadastro)
        const orfaos = todos.filter(p =>
            !comLote.has(p.id) && (agora - new Date(p.created_at).getTime()) > 30000
        );
        if (orfaos.length === 0) return;
        for (const o of orfaos) {
            await sb.from('produtos').delete().eq('id', o.id);
        }
        console.log('Auto-heal: ' + orfaos.length + ' produto(s) sem lote removido(s).');
    } catch (e) {
        console.warn('Auto-heal falhou (ignorado):', e.message);
    }
}

// ============ SALVAR (junta nomes iguais) ============
async function saveProduto(nome, qtd, venc) {
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        const { data: prods, error: e0 } = await sb.from('produtos').select('id, nome');
        if (e0) throw e0;

        const existente = (prods || []).find(p => normNome(p.nome) === normNome(nome));
        let pid;
        if (existente) {
            pid = existente.id;
        } else {
            const { data: novo, error: e2 } = await sb.from('produtos').insert({ nome: nome.trim() }).select('id').single();
            if (e2) throw e2;
            pid = novo.id;
        }

        const { error: e3 } = await sb.from('lotes').insert({
            produto_id: pid,
            quantidade: parseInt(qtd, 10),
            vencimento: venc
        });
        if (e3) throw e3;

        await loadProdutos();
        showToast(existente ? 'Novo lote somado ao produto existente!' : 'Produto e lote salvos no Supabase!');
    } catch (e) {
        showToast('Erro salvar: ' + e.message);
    }
}

// ============ EXCLUIR LOTE (e produto se for o último) ============
async function deleteLote(id) {
    if (!confirm('Excluir este lote?')) return;
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        // 1) Descobre o produto dono do lote (consulta ao servidor, não à lista local)
        const { data: lote, error: e0 } = await sb
            .from('lotes').select('produto_id').eq('id', id).maybeSingle();
        if (e0) throw e0;
        const produtoId = lote ? lote.produto_id : null;

        // 2) Apaga o lote
        const { error: e1 } = await sb.from('lotes').delete().eq('id', id);
        if (e1) throw e1;

        // 3) Se tinha produto, verifica no servidor se sobrou algum lote
        let ultimo = false;
        if (produtoId) {
            const { count, error: e2 } = await sb
                .from('lotes').select('id', { count: 'exact', head: true })
                .eq('produto_id', produtoId);
            if (e2) throw e2;
            ultimo = (count === 0);
            if (ultimo) {
                const { error: e3 } = await sb.from('produtos').delete().eq('id', produtoId);
                if (e3) throw e3;
            }
        }

        await loadProdutos();
        showToast(ultimo ? 'Lote e produto excluídos.' : 'Lote removido.');
    } catch (e) {
        showToast('Erro remover: ' + e.message);
    }
}
window.deleteLote = deleteLote;

// ============ EDITAR LOTE (modal) ============
function abrirModal(loteId, produtoId) {
    let lote = null, prod = null;
    produtos.forEach(p => {
        if (p.id === produtoId) {
            prod = p;
            p.lotes.forEach(l => { if (l.id === loteId) lote = l; });
        }
    });
    if (!lote || !prod) { showToast('Lote nao encontrado.'); return; }

    editando = { loteId, produtoId };
    modalProduto.textContent = prod.nome + ' — vence ' + fmtBR(lote.vencimento);
    editQtd.value = lote.quantidade;
    editVenc.value = lote.vencimento;
    modalOverlay.classList.add('show');
    editQtd.focus();
}
window.abrirModal = abrirModal;

function fecharModal() {
    modalOverlay.classList.remove('show');
    editando = null;
}

async function salvarEdicao() {
    if (!editando) return;
    const qtd = parseInt(editQtd.value, 10);
    const venc = editVenc.value;
    if (!qtd || qtd < 1 || !venc) { showToast('Preencha quantidade e data.'); return; }
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        const { error } = await sb
            .from('lotes')
            .update({ quantidade: qtd, vencimento: venc })
            .eq('id', editando.loteId);
        if (error) throw error;
        fecharModal();
        await loadProdutos();
        showToast('Lote atualizado!');
    } catch (e) {
        showToast('Erro ao atualizar: ' + e.message);
    }
}

// ============ NOTIFICAÇÕES DO DISPOSITIVO ============
const NOTIF_KEY = 'notificacao_diaria_mercadinho';
const btnNotif = document.getElementById('btn-notif');
const notifStatus = document.getElementById('notif-status');

function notifDisponivel() { return ('Notification' in window); }

function atualizarUINotificacao() {
    if (!btnNotif) return;
    if (!notifDisponivel()) {
        notifStatus.textContent = 'Este navegador não suporta notificações.';
        notifStatus.className = 'notif-status err';
        btnNotif.style.display = 'none';
        return;
    }
    const p = Notification.permission;
    if (p === 'granted') {
        btnNotif.textContent = '✅ Notificações ativadas';
        btnNotif.classList.add('ativado');
        notifStatus.textContent = 'Você receberá um aviso quando itens estiverem perto do vencimento.';
        notifStatus.className = 'notif-status ok';
    } else if (p === 'denied') {
        btnNotif.textContent = '🔕 Notificações bloqueadas';
        notifStatus.textContent = 'Permissão negada. Libere nas configurações do site/navegador para ativar.';
        notifStatus.className = 'notif-status err';
    } else {
        btnNotif.textContent = '🔔 Ativar notificações do dispositivo';
        notifStatus.textContent = 'Receba um aviso no seu celular quando algum item estiver perto do vencimento.';
        notifStatus.className = 'notif-status';
    }
}

async function pedirPermissaoNotificacao() {
    if (!notifDisponivel()) { showToast('Este navegador não suporta notificações.'); return; }
    if (Notification.permission === 'granted') { showToast('Notificações já estão ativadas.'); verificarNotificacoes(true); return; }
    if (Notification.permission === 'denied') {
        showToast('Permissão negada. Libere nas configurações do site.');
        atualizarUINotificacao();
        return;
    }
    try {
        const perm = await Notification.requestPermission();
        atualizarUINotificacao();
        if (perm === 'granted') {
            showToast('Notificações ativadas!');
            // Envia um aviso de teste imediato
            const enviada = await enviarNotificacao('🔔 Notificações ativadas', 'Pronto! Avisaremos aqui quando algum item estiver perto do vencimento.', true);
            if (enviada) console.log('Notificação de teste enviada.');
        } else {
            showToast('Permissão não concedida.');
        }
    } catch (e) {
        showToast('Erro ao pedir permissão: ' + e.message);
    }
}

// Monta o resumo dos itens no prazo (vencidos + próximos)
function montarAviso() {
    const itens = [];
    produtos.forEach(p => p.lotes.forEach(l => {
        const d = diasRestantes(l.vencimento);
        if (d <= DIAS_ALERTA) itens.push({ nome: p.nome, dias: d });
    }));
    if (itens.length === 0) return null;

    // Ordena: vencidos primeiro, depois os mais próximos
    itens.sort((a, b) => a.dias - b.dias);

    const vencidos = itens.filter(i => i.dias < 0).length;
    const proximos = itens.length - vencidos;

    let titulo, corpo;
    if (vencidos > 0 && proximos > 0) {
        titulo = '⚠️ ' + vencidos + ' vencido(s) e ' + proximos + ' perto do vencimento';
    } else if (vencidos > 0) {
        titulo = '⚠️ ' + vencidos + ' item(ns) já venceram';
    } else {
        titulo = '⏰ ' + proximos + ' item(ns) vencem em até ' + DIAS_ALERTA + ' dia(s)';
    }

    const linhas = itens.slice(0, 5).map(i => {
        const d = i.dias;
        if (d < 0) return '• ' + i.nome + ' — vencido há ' + Math.abs(d) + ' dia(s)';
        if (d === 0) return '• ' + i.nome + ' — vence HOJE';
        return '• ' + i.nome + ' — vence em ' + d + ' dia(s)';
    });
    if (itens.length > 5) linhas.push('… e mais ' + (itens.length - 5) + ' item(ns)');
    corpo = linhas.join('\n');

    return { titulo, corpo, total: itens.length };
}

async function enviarNotificacao(titulo, corpo, forcar) {
    if (!notifDisponivel() || Notification.permission !== 'granted') return false;

    // Evita spam: só 1 notificação automática por dia (exceto teste manual)
    const hoje = new Date().toDateString();
    if (!forcar) {
        const ultima = localStorage.getItem(NOTIF_KEY);
        if (ultima === hoje) return false;
    }

    // Prefere o Service Worker (obrigatório no Android/Chrome instalado)
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
            await reg.showNotification(titulo, {
                body: corpo,
                icon: 'https://cdn-icons-png.flaticon.com/512/869/869064.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/869/869064.png',
                tag: 'mercadinho-alerta',
                renotify: false,
                requireInteraction: false
            });
            localStorage.setItem(NOTIF_KEY, hoje);
            return true;
        }
        // Fallback: API clássica (desktop)
        new Notification(titulo, { body: corpo, tag: 'mercadinho-alerta' });
        localStorage.setItem(NOTIF_KEY, hoje);
        return true;
    } catch (e) {
        console.warn('Falha ao enviar notificação:', e);
        return false;
    }
}

async function verificarNotificacoes(forcar) {
    if (!notifDisponivel() || Notification.permission !== 'granted') return;
    if (produtos.length === 0) return;
    const aviso = montarAviso();
    if (!aviso) return;
    await enviarNotificacao(aviso.titulo, aviso.corpo, forcar);
}

// ============ HELPERS ============
function diasRestantes(iso) {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    const a = new Date(iso); a.setHours(0, 0, 0, 0);
    return Math.round((a - h) / 86400000);
}
function status(d) {
    if (d < 0) return { t: 'VENCIDO', c: 'vencido' };
    if (d <= DIAS_ALERTA) return { t: 'VENCE LOGO', c: 'proximo' };
    return { t: 'OK', c: 'ok' };
}
function txtDias(d) {
    const a = Math.abs(d);
    const s = a === 1 ? '' : 's';
    if (d < 0) return 'vencido há ' + a + ' dia' + s;
    if (d === 0) return 'vence hoje';
    return d + ' dia' + s + ' restante' + s;
}
function fmtBR(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ============ RENDERIZAR (agrupado por produto) ============
function renderLista() {
    const termo = normNome(inputBusca.value);
    const filtrados = produtos.filter(p => !termo || normNome(p.nome).includes(termo));

    listaProdutos.innerHTML = '';
    if (filtrados.length === 0) { vazio.style.display = 'block'; return; }
    vazio.style.display = 'none';

    filtrados.forEach(p => {
        const card = document.createElement('div');
        card.className = 'produto-card';

        const totalQtd = p.lotes.reduce((s, l) => s + (parseInt(l.quantidade, 10) || 0), 0);
        const head = document.createElement('div');
        head.className = 'produto-head';
        head.innerHTML = '<div class="nome">' + esc(p.nome) + '</div>' +
            '<div class="produto-info">' +
            '<span>' + p.lotes.length + ' lote' + (p.lotes.length > 1 ? 's' : '') + '</span>' +
            '<span>Total: ' + totalQtd + ' un</span>' +
            '</div>';
        card.appendChild(head);

        const listaLotes = document.createElement('div');
        listaLotes.className = 'lote-lista';

        p.lotes.forEach(l => {
            const d = diasRestantes(l.vencimento);
            const s = status(d);
            const item = document.createElement('div');
            item.className = 'lote-item';
            item.innerHTML =
                '<div class="lote-info">' +
                '<div class="lote-top"><span class="lote-qtd">' + (parseInt(l.quantidade, 10) || 0) + ' un</span>' +
                '<span class="status status-' + s.c + '">' + s.t + '</span></div>' +
                '<div class="meta"><span><strong>Vence:</strong> ' + fmtBR(l.vencimento) + '</span>' +
                '<span class="dias">' + txtDias(d) + '</span></div>' +
                '</div>' +
                '<div class="lote-acoes">' +
                '<button type="button" class="btn-mini mini-editar">Editar</button>' +
                '<button type="button" class="btn-mini mini-excluir">Excluir</button>' +
                '</div>';
            item.querySelector('.mini-editar').addEventListener('click', () => abrirModal(l.id, p.id));
            item.querySelector('.mini-excluir').addEventListener('click', () => deleteLote(l.id));
            listaLotes.appendChild(item);
        });

        card.appendChild(listaLotes);
        listaProdutos.appendChild(card);
    });
}

function renderStats() {
    let tot = 0, prox = 0, venc = 0;
    produtos.forEach(p => p.lotes.forEach(l => {
        tot++;
        const d = diasRestantes(l.vencimento);
        if (d < 0) venc++; else if (d <= DIAS_ALERTA) prox++;
    }));
    statTotal.textContent = tot;
    statProximos.textContent = prox;
    statVencidos.textContent = venc;
}

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', () => { try {
    initSupabase();
    if (todayBadge) todayBadge.textContent = 'Hoje: ' + fmtBR(new Date().toISOString().split('T')[0]);
    diasAlertaInput.value = DIAS_ALERTA;
    diasAlertaLabel.textContent = DIAS_ALERTA;
    loadProdutos();

    formProduto.addEventListener('submit', e => {
        e.preventDefault();
        const nome = document.getElementById('nome').value.trim();
        const qtd = parseInt(document.getElementById('quantidade').value, 10);
        const venc = document.getElementById('vencimento').value;
        if (!nome || !qtd || !venc) { showToast('Preencha todos os campos.'); return; }
        saveProduto(nome, qtd, venc);
        formProduto.reset();
        document.getElementById('quantidade').value = 1;
        document.getElementById('vencimento').value = new Date().toISOString().split('T')[0];
    });

    inputBusca.addEventListener('input', renderLista);

    diasAlertaInput.addEventListener('change', () => {
        const v = parseInt(diasAlertaInput.value, 10) || 1;
        DIAS_ALERTA = v;
        localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
        diasAlertaLabel.textContent = DIAS_ALERTA;
        renderLista();
        renderStats();
        showToast('Alerta: ' + DIAS_ALERTA + ' dia(s)');
        verificarNotificacoes(true);
    });

    // Modal de edição
    document.getElementById('modal-salvar').addEventListener('click', salvarEdicao);
    document.getElementById('modal-cancelar').addEventListener('click', fecharModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) fecharModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editando) fecharModal(); });

    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.getElementById('install-bar').classList.add('show'); });
    document.getElementById('btnInstall').addEventListener('click', async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('install-bar').classList.remove('show'); } });
    document.getElementById('btnCloseInstall').addEventListener('click', () => document.getElementById('install-bar').classList.remove('show'));

    // Notificações do dispositivo
    if (btnNotif) btnNotif.addEventListener('click', pedirPermissaoNotificacao);
    atualizarUINotificacao();

    // Verifica itens no prazo após carregar os dados
    loadProdutos().then(() => verificarNotificacoes(false));

    // Re-verifica 1x por dia (enquanto o app estiver aberto) e ao mudar o alerta
    setInterval(() => verificarNotificacoes(false), 6 * 60 * 60 * 1000);
    setInterval(() => loadProdutos().then(() => verificarNotificacoes(false)), 86400000);
  } catch (err) { console.error('Erro na inicializacao:', err); showToast('Erro na pagina: ' + err.message); }
});
