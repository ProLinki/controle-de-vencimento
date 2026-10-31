const SUPABASE_URL = 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';
const DIAS_KEY = 'dias_alerta_mercadinho';
let DIAS_ALERTA = parseInt(localStorage.getItem(DIAS_KEY)) || 3;
let produtos = [];
let sb = null;
let sbReady = false;

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

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 4000);
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

async function loadProdutos() {
    if (!sbReady) { renderLista(); renderStats(); return; }
    try {
        const { data, error } = await sb.from('lotes').select('*, produtos(nome)').order('vencimento', { ascending: true });
        if (error) throw error;
        const map = {};
        (data || []).forEach(r => {
            const nm = r.produtos && r.produtos.nome ? r.produtos.nome : 'Sem nome';
            if (!map[nm]) map[nm] = { id: r.produto_id, nome: nm, lotes: [] };
            map[nm].lotes.push({ id: r.id, quantidade: r.quantidade, vencimento: r.vencimento });
        });
        produtos = Object.values(map);
    } catch (e) {
        showToast('Erro carregar: ' + e.message);
    }
    renderLista();
    renderStats();
}

async function saveProduto(nome, qtd, venc) {
    if (!sbReady) {
        showToast('Supabase nao conectado.');
        return;
    }
    try {
        let pid;
        const { data: ex, error: e1 } = await sb.from('produtos').select('id').eq('nome', nome).maybeSingle();
        if (e1) throw e1;
        if (ex && ex.id) {
            pid = ex.id;
        } else {
            const { data: novo, error: e2 } = await sb.from('produtos').insert({ nome: nome }).select('id').single();
            if (e2) throw e2;
            pid = novo.id;
        }
        const { error: e3 } = await sb.from('lotes').insert({ produto_id: pid, quantidade: parseInt(qtd), vencimento: venc });
        if (e3) throw e3;
        await loadProdutos();
        showToast('Lote salvo no Supabase!');
    } catch (e) {
        showToast('Erro salvar: ' + e.message);
    }
}

async function deleteLote(id) {
    if (!confirm('Excluir este lote?')) return;
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        const { error } = await sb.from('lotes').delete().eq('id', id);
        if (error) throw error;
        await loadProdutos();
        showToast('Lote removido.');
    } catch (e) {
        showToast('Erro remover: ' + e.message);
    }
}
window.deleteLote = deleteLote;

function diasRestantes(iso) {
    const h = new Date(); h.setHours(0,0,0,0);
    const a = new Date(iso); a.setHours(0,0,0,0);
    return Math.round((a - h) / 86400000);
}
function status(d) {
    if (d < 0) return { t: 'VENCIDO', c: 'vencido' };
    if (d <= DIAS_ALERTA) return { t: 'VENCE LOGO', c: 'proximo' };
    return { t: 'OK', c: 'ok' };
}
function fmtBR(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function renderLista() {
    const termo = inputBusca.value.toLowerCase().trim();
    let todos = [];
    produtos.forEach(p => p.lotes.forEach(l => todos.push({ pn: p.nome, q: l.quantidade, v: l.vencimento, id: l.id })));
    todos.sort((a, b) => new Date(a.v) - new Date(b.v));
    const filtrados = todos.filter(t => t.pn.toLowerCase().includes(termo));
    listaProdutos.innerHTML = '';
    if (filtrados.length === 0) { vazio.style.display = 'block'; return; }
    vazio.style.display = 'none';
    filtrados.forEach(t => {
        const d = diasRestantes(t.v);
        const s = status(d);
        const card = document.createElement('div');
        card.className = 'produto-card';
        card.innerHTML = '<div class="nome">' + esc(t.pn) + '</div>' +
            '<div class="meta"><span><strong>Qtd:</strong> ' + t.q + '</span>' +
            '<span><strong>Vence:</strong> ' + fmtBR(t.v) + '</span>' +
            '<span class="dias">' + d + ' dia' + (Math.abs(d) !== 1 ? 's' : '') + ' restante' + (d === 1 ? '' : 's') + '</span></div>' +
            '<span class="status status-' + s.c + '">' + s.t + '</span>' +
            '<div class="acoes"><button class="btn btn-excluir" onclick="deleteLote(\'' + t.id + '\')">Excluir lote</button></div>';
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
    });

    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.getElementById('install-bar').classList.add('show'); });
    document.getElementById('btnInstall').addEventListener('click', async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('install-bar').classList.remove('show'); } });
    document.getElementById('btnCloseInstall').addEventListener('click', () => document.getElementById('install-bar').classList.remove('show'));

    setInterval(() => loadProdutos(), 86400000);
  } catch (err) { console.error('Erro na inicializacao:', err); showToast('Erro na pagina: ' + err.message); }
});