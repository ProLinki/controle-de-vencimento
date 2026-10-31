// ============================
// Mercadinho Belo - Controle
// IntegraÃ§Ã£o Supabase
// ============================

// >>> CONFIGURE AQUI SUA URL E CHAVE DO SUPABASE <<<
// Obtenha em: https://supabase.com -> Settings -> API
const SUPABASE_URL = 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';

const DIAS_KEY = 'dias_alerta_mercadinho';
let DIAS_ALERTA = parseInt(localStorage.getItem(DIAS_KEY)) || 3;

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

let produtos = [];
let supabase = null;
let supabaseConfigurado = false;

// Inicializar Supabase apenas se as credenciais estiverem preenchidas
function initSupabase() {
    if (!SUPABASE_URL || SUPABASE_URL.includes('SUA_URL') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUA_CHAVE')) {
        supabaseConfigurado = false;
        supabase = null;
        mostrarToast('âš ï¸ Supabase nÃ£o configurado. Usando armazenamento local temporÃ¡rio.');
        return;
    }

    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseConfigurado = true;
    } catch (err) {
        console.error('Erro ao inicializar Supabase:', err);
        supabaseConfigurado = false;
        supabase = null;
        mostrarToast('âš ï¸ Erro ao conectar com Supabase. Usando local temporÃ¡rio.');
    }
}

// Carregar produtos do Supabase ou localStorage
async function carregarProdutos() {
    try {
        if (supabaseConfigurado && supabase) {
            const { data, error } = await supabase
                .from('lotes')
                .select('*, produtos(nome)')
                .order('vencimento', { ascending: true });

            if (error) throw error;

            const mapa = {};
            (data || []).forEach(lote => {
                const nome = lote.produtos?.nome || 'Produto sem nome';
                if (!mapa[nome]) {
                    mapa[nome] = { id: lote.produto_id, nome: nome, lotes: [] };
                }
                mapa[nome].lotes.push({
                    id: lote.id,
                    quantidade: lote.quantidade,
                    vencimento: lote.vencimento
                });
            });

            produtos = Object.values(mapa);
            renderizarLista();
            atualizarEstatisticas();
            return;
        }

        // Fallback localStorage
        const raw = localStorage.getItem('produtos_mercadinho');
        produtos = raw ? JSON.parse(raw) : [];
        renderizarLista();
        atualizarEstatisticas();
    } catch (err) {
        console.error(err);
        mostrarToast('âŒ Erro ao carregar produtos.');
        const raw = localStorage.getItem('produtos_mercadinho');
        produtos = raw ? JSON.parse(raw) : [];
        renderizarLista();
        atualizarEstatisticas();
    }
}

// Salvar produto/lote
async function salvarProduto(nome, quantidade, vencimento) {
    try {
        if (!supabaseConfigurado || !supabase) {
            // Fallback localStorage
            const novoLote = { id: Date.now().toString(), quantidade: quantidade, vencimento: vencimento };
            const idx = produtos.findIndex(p => p.nome.toLowerCase() === nome.toLowerCase());
            if (idx >= 0) {
                produtos[idx].lotes.push(novoLote);
            } else {
                produtos.push({ id: Date.now().toString(), nome: nome, lotes: [novoLote] });
            }
            localStorage.setItem('produtos_mercadinho', JSON.stringify(produtos));
            renderizarLista();
            atualizarEstatisticas();
            mostrarToast('âœ… Lote adicionado (local temporÃ¡rio)!');
            return;
        }

        // Inserir ou buscar produto
        let { data: produtoExistente, error: err1 } = await supabase
            .from('produtos')
            .select('id')
            .eq('nome', nome)
            .single();

        let produtoId;
        if (err1 || !produtoExistente) {
            const { data: novoProduto, error: err2 } = await supabase
                .from('produtos')
                .insert({ nome: nome })
                .select('id')
                .single();
            if (err2) throw err2;
            produtoId = novoProduto.id;
        } else {
            produtoId = produtoExistente.id;
        }

        // Inserir lote
        const { error: err3 } = await supabase
            .from('lotes')
            .insert({ produto_id: produtoId, quantidade: parseInt(quantidade), vencimento: vencimento });
        if (err3) throw err3;

        await carregarProdutos();
        mostrarToast('âœ… Lote salvo no Supabase!');
    } catch (err) {
        console.error(err);
        mostrarToast('âŒ Erro ao salvar lote.');
    }
}

// Excluir lote
async function excluirLote(loteId) {
    if (!confirm('Deseja excluir este lote?')) return;
    try {
        if (!supabaseConfigurado || !supabase) {
            mostrarToast('âš ï¸ Supabase nÃ£o configurado.');
            return;
        }
        const { error } = await supabase.from('lotes').delete().eq('id', loteId);
        if (error) throw error;
        await carregarProdutos();
        mostrarToast('ðŸ—‘ï¸ Lote removido.');
    } catch (err) {
        console.error(err);
        mostrarToast('âŒ Erro ao remover lote.');
    }
}
window.excluirLote = excluirLote;

// Renderizar lista
function renderizarLista() {
    const termo = inputBusca.value.toLowerCase().trim();
    let todosLotes = [];

    produtos.forEach(p => {
        p.lotes.forEach(l => {
            todosLotes.push({ produtoNome: p.nome, quantidade: l.quantidade, vencimento: l.vencimento, loteId: l.id });
        });
    });

    todosLotes.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
    const filtrados = todosLotes.filter(l => l.produtoNome.toLowerCase().includes(termo));

    listaProdutos.innerHTML = '';
    if (filtrados.length === 0) {
        vazio.style.display = 'block';
        return;
    }
    vazio.style.display = 'none';

    filtrados.forEach(l => {
        const card = document.createElement('div');
        card.className = 'produto-card';
        const dias = diasRestantes(l.vencimento);
        const status = classificarStatus(dias);
        card.innerHTML = '<div class="nome">' + escapeHtml(l.produtoNome) + '</div>' +
            '<div class="meta"><span><strong>Qtd:</strong> ' + l.quantidade + '</span>' +
            '<span><strong>Vence:</strong> ' + formatarDataBR(l.vencimento) + '</span>' +
            '<span class="dias">' + dias + ' dia' + (Math.abs(dias) !== 1 ? 's' : '') + ' restante' + (dias === 1 ? '' : 's') + '</span></div>' +
            '<span class="status status-' + status.classe + '">' + status.texto + '</span>' +
            '<div class="acoes"><button class="btn btn-excluir" onclick="excluirLote(\'' + l.loteId + '\')">Excluir lote</button></div>';
        listaProdutos.appendChild(card);
    });
}

// UtilitÃ¡rios
function diasRestantes(dataISO) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const alvo = new Date(dataISO); alvo.setHours(0,0,0,0);
    return Math.round((alvo - hoje) / (1000*60*60*24));
}
function classificarStatus(dias) {
    if (dias < 0) return { texto: 'VENCIDO', classe: 'vencido' };
    if (dias <= DIAS_ALERTA) return { texto: 'VENCE LOGO', classe: 'proximo' };
    return { texto: 'OK', classe: 'ok' };
}
function formatarDataBR(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function atualizarHoje() {
    const d = new Date();
    todayBadge.textContent = 'Hoje: ' + formatarDataBR(d.toISOString().split('T')[0]);
}
function atualizarEstatisticas() {
    let total = 0, proximos = 0, vencidos = 0;
    produtos.forEach(p => {
        p.lotes.forEach(l => {
            total++;
            const dias = diasRestantes(l.vencimento);
            if (dias < 0) vencidos++;
            else if (dias <= DIAS_ALERTA) proximos++;
        });
    });
    statTotal.textContent = total;
    statProximos.textContent = proximos;
    statVencidos.textContent = vencidos;
}

// Eventos
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    atualizarHoje();
    diasAlertaInput.value = DIAS_ALERTA;
    diasAlertaLabel.textContent = DIAS_ALERTA;
    carregarProdutos();

    formProduto.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('nome').value.trim();
        const quantidade = parseInt(document.getElementById('quantidade').value, 10);
        const vencimento = document.getElementById('vencimento').value;
        if (!nome || !quantidade || !vencimento) {
            mostrarToast('âš ï¸ Preencha todos os campos.');
            return;
        }
        salvarProduto(nome, quantidade, vencimento);
        formProduto.reset();
        document.getElementById('vencimento').value = new Date().toISOString().split('T')[0];
    });

    inputBusca.addEventListener('input', renderizarLista);

    diasAlertaInput.addEventListener('change', () => {
        const v = parseInt(diasAlertaInput.value, 10) || 1;
        DIAS_ALERTA = v;
        localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
        diasAlertaLabel.textContent = DIAS_ALERTA;
        renderizarLista();
        atualizarEstatisticas();
        mostrarToast('ðŸ“… Alerta configurado para ' + DIAS_ALERTA + ' dia(s)');
    });

    // PWA install
    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        document.getElementById('install-bar').classList.add('show');
    });
    document.getElementById('btnInstall').addEventListener('click', async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            document.getElementById('install-bar').classList.remove('show');
        }
    });
    document.getElementById('btnCloseInstall').addEventListener('click', () => {
        document.getElementById('install-bar').classList.remove('show');
    });

    // NotificaÃ§Ãµes diÃ¡rias
    setInterval(() => { carregarProdutos(); verificarNotificacoes(); }, 24*60*60*1000);
});

function verificarNotificacoes() {
    if (!('Notification' in window)) return;
    let todosLotes = [];
    produtos.forEach(p => { p.lotes.forEach(l => { todosLotes.push({ produtoNome: p.nome, vencimento: l.vencimento }); }); });
    const proximos = todosLotes.filter(item => { const d = diasRestantes(item.vencimento); return d >= 0 && d <= DIAS_ALERTA; });
    if (proximos.length > 0 && Notification.permission === 'granted') {
        const maisProximo = proximos[0];
        new Notification('ðŸ“¦ Produto perto do vencimento', {
            body: maisProximo.produtoNome + ' vence em ' + formatarDataBR(maisProximo.vencimento) + ' (' + diasRestantes(maisProximo.vencimento) + ' dia(s)).',
            icon: 'https://cdn-icons-png.flaticon.com/512/869/869064.png',
            tag: 'mercadinho'
        });
    }
}

function mostrarToast(mensagem) {
    toastEl.textContent = mensagem;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 4000);
}
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }