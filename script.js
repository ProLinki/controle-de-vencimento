const SUPABASE_URL = 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';
const DIAS_KEY = 'dias_alerta_mercadinho';
const HORA_KEY = 'hora_notif_mercadinho';
const SESSAO_KEY = 'sessao_mercadinho';
const NOTIF_KEY = 'notificacao_diaria_mercadinho';
const NOTIF_HORA_KEY = 'notificacao_hora_mercadinho';

let DIAS_ALERTA = parseInt(localStorage.getItem(DIAS_KEY), 10) || 3;
let HORA_NOTIF = localStorage.getItem(HORA_KEY) || '08:00';
let produtos = [];
let sb = null;
let sbReady = false;
let sessao = null;      // { id, nome, login, cargo }
let editando = null;    // { loteId, produtoId }
let funcionariosCache = [];

// ---------- DOM ----------
const telaLogin = document.getElementById('tela-login');
const formLogin = document.getElementById('formLogin');
const loginUsuario = document.getElementById('login-usuario');
const loginSenha = document.getElementById('login-senha');
const loginErro = document.getElementById('login-erro');
const userChip = document.getElementById('user-chip');
const userNome = document.getElementById('user-nome');
const userCargo = document.getElementById('user-cargo');
const menuUser = document.getElementById('menu-user');
const menuUserNome = document.getElementById('menu-user-nome');
const formProduto = document.getElementById('formProduto');
const listaProdutos = document.getElementById('lista-produtos');
const inputBusca = document.getElementById('busca');
const statTotal = document.getElementById('statTotal');
const statProximos = document.getElementById('statProximos');
const statVencidos = document.getElementById('statVencidos');
const diasAlertaInput = document.getElementById('diasAlerta');
const diasAlertaLabel = document.getElementById('diasAlertaLabel');
const diasDica = document.getElementById('dias-dica');
const horaNotifInput = document.getElementById('horaNotif');
const horaDica = document.getElementById('hora-dica');
const toastEl = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalProduto = document.getElementById('modal-produto');
const editQtd = document.getElementById('edit-quantidade');
const editVenc = document.getElementById('edit-vencimento');
const btnNotif = document.getElementById('btn-notif');
const notifStatus = document.getElementById('notif-status');
const formFuncionario = document.getElementById('formFuncionario');
const fnId = document.getElementById('fn-id');
const fnNome = document.getElementById('fn-nome');
const fnLogin = document.getElementById('fn-login');
const fnSenha = document.getElementById('fn-senha');
const fnCargo = document.getElementById('fn-cargo');
const fnBotao = document.getElementById('fn-botao');
const fnCancelar = document.getElementById('fn-cancelar');
const listaFuncionarios = document.getElementById('lista-funcionarios');

// Navbar / menu
const btnMenu = document.getElementById('btn-menu');
const btnFecharMenu = document.getElementById('btn-fechar-menu');
const menuOverlay = document.getElementById('menu-overlay');
const menuCadastro = document.getElementById('menu-cadastro');
const menuAlerta = document.getElementById('menu-alerta');
const menuFuncionarios = document.getElementById('menu-funcionarios');
const menuFuncionariosItem = document.getElementById('menu-funcionarios-item');
const menuSair = document.getElementById('menu-sair');

// Modais
const modalCadastro = document.getElementById('modal-cadastro');
const modalAlerta = document.getElementById('modal-alerta');
const modalFuncionarios = document.getElementById('modal-funcionarios');
const modalScan = document.getElementById('modal-scan');
const btnFecharAlerta = document.getElementById('btn-fechar-alerta');
const btnScan = document.getElementById('btn-scan');
const btnFecharScan = document.getElementById('btn-fechar-scan');
const scanVideo = document.getElementById('scan-video');
const scanStatus = document.getElementById('scan-status');
const codigoBarrasInput = document.getElementById('codigoBarras');
const unidadeInput = document.getElementById('unidade');
const valorInput = document.getElementById('valor');

// ---------- HELPERS BÁSICOS ----------
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 4000);
}
function normNome(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
function labelCargo(c) {
    return c === 'admin' ? 'Administrador' : c === 'patrao' ? 'Patrão' : 'Funcionário';
}
async function sha256Hex(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function novoSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- PERMISSÕES ----------
function podeInserir() { return !!sessao && (sessao.cargo === 'admin' || sessao.cargo === 'funcionario'); }
function podeAtualizar() { return podeInserir(); }
function podeExcluirItem() { return !!sessao && sessao.cargo === 'admin'; }
function podeGerirFuncionarios() { return !!sessao && sessao.cargo === 'admin'; }
function podeConfigurarDias() { return !!sessao && sessao.cargo === 'admin'; }

// ---------- SUPABASE ----------
function initSupabase() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        showToast('Biblioteca Supabase nao carregou.');
        return;
    }
    try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        sbReady = true;
    } catch (e) {
        showToast('Erro Supabase: ' + e.message);
    }
}

// ---------- LOGIN / SESSÃO ----------
async function entrar(e) {
    e.preventDefault();
    loginErro.textContent = '';
    const login = loginUsuario.value.trim().toLowerCase();
    const senha = loginSenha.value;
    if (!login || !senha) { loginErro.textContent = 'Preencha usuário e senha.'; return; }
    if (!sbReady) { loginErro.textContent = 'Conexão indisponível. Recarregue a página.'; return; }
    try {
        const { data, error } = await sb.from('funcionarios').select('*').eq('login', login).maybeSingle();
        if (error) throw error;
        if (!data || !data.ativo) { loginErro.textContent = 'Usuário não encontrado ou inativo.'; return; }
        const hash = await sha256Hex(senha + data.salt);
        if (hash !== data.senha_hash) { loginErro.textContent = 'Senha incorreta.'; return; }
        sessao = { id: data.id, nome: data.nome, login: data.login, cargo: data.cargo };
        localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
        formLogin.reset();
        telaLogin.style.display = 'none';
        showToast('Bem-vindo(a), ' + data.nome + '!');
        await iniciarApp();
    } catch (err) {
        loginErro.textContent = 'Erro ao entrar: ' + err.message;
    }
}

function sair() {
    localStorage.removeItem(SESSAO_KEY);
    sessao = null;
    location.reload();
}

function aplicarPermissoes() {
    const c = sessao.cargo;
    userChip.style.display = 'flex';
    userNome.textContent = sessao.nome;
    userCargo.textContent = labelCargo(c);
    userCargo.className = 'cargo-badge cargo-' + c;
    if (menuUser) { menuUser.style.display = 'block'; }
    if (menuUserNome) { menuUserNome.textContent = sessao.nome; }
    if (menuFuncionariosItem) {
        if (podeGerirFuncionarios()) {
            menuFuncionariosItem.style.display = '';
        } else {
            menuFuncionariosItem.style.display = 'none';
            menuFuncionariosItem.remove();
        }
    }
    diasAlertaInput.disabled = !podeConfigurarDias();
    if (horaNotifInput) horaNotifInput.disabled = !podeConfigurarDias();
    diasDica.textContent = podeConfigurarDias() ? ' (você controla o prazo de todos)' : ' (definido pelo administrador)';
    if (horaDica) horaDica.textContent = podeConfigurarDias() ? ' (você define o horário de todos)' : ' (definido pelo administrador)';
}

// ---------- CONFIGURAÇÃO GLOBAL (dias de alerta) ----------
async function loadConfig() {
    if (!sbReady) return;
    try {
        const { data, error } = await sb.from('configuracoes').select('chave, valor');
        if (error) throw error;
        (data || []).forEach(row => {
            if (row.chave === 'dias_alerta' && row.valor) {
                DIAS_ALERTA = parseInt(row.valor, 10) || DIAS_ALERTA;
                localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
            }
            if (row.chave === 'hora_notificacao' && row.valor) {
                HORA_NOTIF = row.valor;
                localStorage.setItem(HORA_KEY, HORA_NOTIF);
            }
        });
    } catch (e) {
        console.warn('Config não carregada:', e.message);
    }
    diasAlertaInput.value = DIAS_ALERTA;
    diasAlertaLabel.textContent = DIAS_ALERTA;
    if (horaNotifInput) horaNotifInput.value = HORA_NOTIF;
    if (horaDica) horaDica.textContent = podeConfigurarDias() ? ' (você define o horário de todos)' : ' (definido pelo administrador)';
}

async function salvarConfigDias(v) {
    try {
        const { error } = await sb.from('configuracoes').upsert({
            chave: 'dias_alerta',
            valor: String(v),
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        showToast('Prazo global atualizado: ' + v + ' dia(s)');
    } catch (e) {
        showToast('Erro ao salvar prazo: ' + e.message);
    }
}

async function salvarTzOffset() {
    if (!sbReady) return;
    try {
        await sb.from('configuracoes').upsert({ chave: 'tz_offset', valor: String(new Date().getTimezoneOffset()), updated_at: new Date().toISOString() });
    } catch (e) { console.warn(e); }
}
async function salvarConfigHora(v) {
    try {
        const { error } = await sb.from('configuracoes').upsert([
            { chave: 'hora_notificacao', valor: v, updated_at: new Date().toISOString() },
            { chave: 'tz_offset', valor: String(new Date().getTimezoneOffset()), updated_at: new Date().toISOString() }
        ]);
        if (error) throw error;
        showToast('Horário de notificação atualizado: ' + v);
    } catch (e) {
        showToast('Erro ao salvar horário: ' + e.message);
    }
}
async function loadProdutos() {
    if (!sbReady) { renderLista(); renderStats(); return; }
    try {
        const { data, error } = await sb
            .from('lotes')
            .select('id, produto_id, quantidade, vencimento, codigo_barras, adicionado_por, atualizado_por, atualizado_em, created_at, produtos(nome, codigo_barras, unidade, valor)')
            .order('vencimento', { ascending: true });
        if (error) throw error;

        const map = {};
        (data || []).forEach(r => {
            const nm = r.produtos && r.produtos.nome ? r.produtos.nome : 'Sem nome';
            if (!map[r.produto_id]) map[r.produto_id] = {
                id: r.produto_id, nome: nm,
                codigoBarras: (r.produtos && r.produtos.codigo_barras) || r.codigo_barras || '',
                unidade: (r.produtos && r.produtos.unidade) || '',
                valor: (r.produtos && r.produtos.valor) != null ? r.produtos.valor : '',
                lotes: []
            };
            map[r.produto_id].lotes.push({
                id: r.id, quantidade: r.quantidade, vencimento: r.vencimento,
                codigoBarras: r.codigo_barras,
                adicionado_por: r.adicionado_por, atualizado_por: r.atualizado_por,
                atualizado_em: r.atualizado_em, created_at: r.created_at
            });
        });
        produtos = Object.values(map);
        produtos.sort((a, b) => new Date(a.lotes[0].vencimento) - new Date(b.lotes[0].vencimento));

        limparProdutosOrfaos(data || []);
    } catch (e) {
        showToast('Erro carregar: ' + e.message);
    }
    renderLista();
    renderStats();
}

async function limparProdutosOrfaos(lotesAtuais) {
    try {
        const { data: todos, error } = await sb.from('produtos').select('id, created_at');
        if (error || !todos) return;
        const comLote = new Set(lotesAtuais.map(l => l.produto_id));
        const agora = Date.now();
        const orfaos = todos.filter(p => !comLote.has(p.id) && (agora - new Date(p.created_at).getTime()) > 30000);
        if (orfaos.length === 0) return;
        for (const o of orfaos) await sb.from('produtos').delete().eq('id', o.id);
        console.log('Auto-heal: ' + orfaos.length + ' produto(s) sem lote removido(s).');
    } catch (e) {
        console.warn('Auto-heal falhou (ignorado):', e.message);
    }
}

// ---------- SALVAR (junta nomes iguais) ----------
async function saveProduto(nome, unidade, valor, qtd, venc, codigoBarras) {
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    if (!podeInserir()) { showToast('Sem permissão para inserir itens.'); return; }
    try {
        const cb = (codigoBarras || '').trim();

        // Salva/atualiza no catálogo por código de barras (auto-preenchimento futuro)
        if (cb) {
            const { error: ecat } = await sb.from('produtos_base').upsert({
                codigo_barras: cb,
                nome: nome.trim(),
                unidade: unidade,
                valor: parseFloat(valor)
            });
            if (ecat) console.warn('Catalogo:', ecat.message);
        }

        const { data: prods, error: e0 } = await sb.from('produtos').select('id, nome, codigo_barras');
        if (e0) throw e0;

        let existente = null;
        if (cb) existente = (prods || []).find(p => p.codigo_barras && p.codigo_barras === cb);
        if (!existente) existente = (prods || []).find(p => normNome(p.nome) === normNome(nome));

        let pid;
        if (existente) {
            pid = existente.id;
            // atualiza unidade/valor/codigo se mudaram
            await sb.from('produtos').update({
                codigo_barras: cb || existente.codigo_barras,
                unidade: unidade,
                valor: parseFloat(valor)
            }).eq('id', pid);
        } else {
            const { data: novo, error: e2 } = await sb.from('produtos').insert({
                nome: nome.trim(),
                codigo_barras: cb || null,
                unidade: unidade,
                valor: parseFloat(valor)
            }).select('id').single();
            if (e2) throw e2;
            pid = novo.id;
        }

        const { error: e3 } = await sb.from('lotes').insert({
            produto_id: pid,
            codigo_barras: cb || null,
            quantidade: parseInt(qtd, 10),
            vencimento: venc,
            adicionado_por: sessao.nome,
            adicionado_por_id: sessao.id
        });
        if (e3) throw e3;

        await loadProdutos();
        showToast(existente ? 'Novo lote somado ao produto existente!' : 'Produto e lote salvos no Supabase!');
    } catch (e) {
        showToast('Erro salvar: ' + e.message);
    }
}

// ---------- CATÁLOGO POR CÓDIGO DE BARRAS ----------
async function preencherDoCatalogo(cb) {
    cb = (cb || '').trim();
    if (!cb || !sbReady) return;
    try {
        const { data, error } = await sb.from('produtos_base').select('*').eq('codigo_barras', cb).maybeSingle();
        if (error) throw error;
        if (data) {
            document.getElementById('nome').value = data.nome || '';
            if (unidadeInput) unidadeInput.value = data.unidade || 'litros';
            if (valorInput) valorInput.value = data.valor != null ? data.valor : 1;
            showToast('Dados preenchidos do catálogo!');
            return;
        }
        const { data: p } = await sb.from('produtos').select('nome, unidade, valor').eq('codigo_barras', cb).maybeSingle();
        if (p) {
            document.getElementById('nome').value = p.nome || '';
            if (unidadeInput) unidadeInput.value = p.unidade || 'litros';
            if (valorInput) valorInput.value = p.valor != null ? p.valor : 1;
        }
    } catch (e) { console.warn('Catalogo lookup:', e.message); }
}

let scanStream = null;
let scanRAF = null;
async function iniciarScan() {
    if (scanStatus) scanStatus.textContent = 'Iniciando câmera...';
    if (!('BarcodeDetector' in window)) {
        if (scanStatus) scanStatus.textContent = 'Leitura por câmera não suportada neste navegador. Digite o código manualmente.';
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (scanStatus) scanStatus.textContent = 'Câmera não disponível. Digite o código manualmente.';
        return;
    }
    try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (scanVideo) { scanVideo.srcObject = scanStream; await scanVideo.play(); }
        const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf','qr_code'] });
        if (scanStatus) scanStatus.textContent = 'Aponte para o código...';
        const tick = async () => {
            if (!scanStream) return;
            try {
                if (scanVideo && scanVideo.readyState >= 2) {
                    const codes = await detector.detect(scanVideo);
                    if (codes && codes.length) {
                        const val = codes[0].rawValue;
                        if (codigoBarrasInput) codigoBarrasInput.value = val;
                        if (scanStatus) scanStatus.textContent = 'Lido: ' + val;
                        await preencherDoCatalogo(val);
                        pararScan();
                        if (modalScan) modalScan.classList.remove('show');
                        return;
                    }
                }
            } catch (e) { /* ignore */ }
            scanRAF = requestAnimationFrame(tick);
        };
        scanRAF = requestAnimationFrame(tick);
    } catch (e) {
        if (scanStatus) scanStatus.textContent = 'Erro ao acessar câmera: ' + e.message;
    }
}
function pararScan() {
    if (scanRAF) cancelAnimationFrame(scanRAF);
    scanRAF = null;
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
    if (scanVideo) scanVideo.srcObject = null;
}

// ---------- EXCLUIR LOTE (admin) ----------
async function deleteLote(id) {
    if (!podeExcluirItem()) { showToast('Somente o administrador pode excluir itens.'); return; }
    if (!confirm('Excluir este lote?')) return;
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        const { data: lote, error: e0 } = await sb.from('lotes').select('produto_id').eq('id', id).maybeSingle();
        if (e0) throw e0;
        const produtoId = lote ? lote.produto_id : null;

        const { error: e1 } = await sb.from('lotes').delete().eq('id', id);
        if (e1) throw e1;

        let ultimo = false;
        if (produtoId) {
            const { count, error: e2 } = await sb.from('lotes').select('id', { count: 'exact', head: true }).eq('produto_id', produtoId);
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

// ---------- EDITAR LOTE (modal) ----------
function abrirModal(loteId, produtoId) {
    if (!podeAtualizar()) { showToast('Sem permissão para editar itens.'); return; }
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

function limparFormCadastro() {
    if (formProduto) formProduto.reset();
    const q = document.getElementById('quantidade');
    const v = document.getElementById('valor');
    const u = document.getElementById('unidade');
    const vc = document.getElementById('vencimento');
    const cb = document.getElementById('codigoBarras');
    const nm = document.getElementById('nome');
    if (q) q.value = 1;
    if (v) v.value = 1;
    if (u) u.value = 'litros';
    if (vc) vc.value = new Date().toISOString().split('T')[0];
    if (cb) cb.value = '';
    if (nm) nm.value = '';
}
function fecharModal() {
    modalOverlay.classList.remove('show');
    editando = null;
}

async function salvarEdicao() {
    if (!editando) return;
    if (!podeAtualizar()) { showToast('Sem permissão para editar itens.'); return; }
    const qtd = parseInt(editQtd.value, 10);
    const venc = editVenc.value;
    if (!qtd || qtd < 1 || !venc) { showToast('Preencha quantidade e data.'); return; }
    if (!sbReady) { showToast('Supabase nao conectado.'); return; }
    try {
        const { error } = await sb
            .from('lotes')
            .update({
                quantidade: qtd,
                vencimento: venc,
                atualizado_por: sessao.nome,
                atualizado_em: new Date().toISOString()
            })
            .eq('id', editando.loteId);
        if (error) throw error;
        fecharModal();
        await loadProdutos();
        showToast('Lote atualizado!');
    } catch (e) {
        showToast('Erro ao atualizar: ' + e.message);
    }
}

// ---------- FUNCIONÁRIOS (admin) ----------
async function loadFuncionarios() {
    if (!sbReady || !podeGerirFuncionarios()) return;
    try {
        const { data, error } = await sb.from('funcionarios')
            .select('id, nome, login, cargo, ativo, created_at')
            .order('nome', { ascending: true });
        if (error) throw error;
        funcionariosCache = data || [];
        renderFuncionarios();
    } catch (e) {
        showToast('Erro ao carregar funcionários: ' + e.message);
    }
}

function renderFuncionarios() {
    listaFuncionarios.innerHTML = '';
    if (funcionariosCache.length === 0) {
        listaFuncionarios.innerHTML = '<p class="sub">Nenhum funcionário cadastrado.</p>';
        return;
    }
    funcionariosCache.forEach(f => {
        const card = document.createElement('div');
        card.className = 'func-card';
        const info = document.createElement('div');
        info.className = 'func-info';
        info.innerHTML = '<span class="fn">' + esc(f.nome) + (f.ativo ? '' : ' <span class="inativo">(inativo)</span>') + '</span>' +
            '<span class="fl">usuário: ' + esc(f.login) + '</span>';
        const badge = document.createElement('span');
        badge.className = 'cargo-badge cargo-' + f.cargo;
        badge.textContent = labelCargo(f.cargo);
        const acoes = document.createElement('div');
        acoes.className = 'func-acoes';
        const bEd = document.createElement('button');
        bEd.type = 'button'; bEd.className = 'btn-mini mini-editar'; bEd.textContent = 'Editar';
        bEd.addEventListener('click', () => preencherFormFunc(f));
        const bEx = document.createElement('button');
        bEx.type = 'button'; bEx.className = 'btn-mini mini-excluir'; bEx.textContent = 'Excluir';
        bEx.addEventListener('click', () => excluirFuncionario(f));
        acoes.append(bEd, bEx);
        card.append(info, badge, acoes);
        listaFuncionarios.appendChild(card);
    });
}

function preencherFormFunc(f) {
    fnId.value = f.id;
    fnNome.value = f.nome;
    fnLogin.value = f.login;
    fnSenha.value = '';
    fnSenha.placeholder = 'Deixe em branco para manter a senha';
    fnCargo.value = f.cargo;
    fnBotao.textContent = 'Salvar alterações';
    fnCancelar.style.display = '';
    fnNome.focus();
}

function limparFormFunc() {
    fnId.value = '';
    fnNome.value = '';
    fnLogin.value = '';
    fnSenha.value = '';
    fnSenha.placeholder = 'Mínimo 4 caracteres';
    fnCargo.value = 'funcionario';
    fnBotao.textContent = 'Adicionar funcionário';
    fnCancelar.style.display = 'none';
}

async function salvarFuncionario(e) {
    e.preventDefault();
    if (!podeGerirFuncionarios()) { showToast('Somente o administrador gerencia funcionários.'); return; }
    const nome = fnNome.value.trim();
    const login = fnLogin.value.trim().toLowerCase();
    const senha = fnSenha.value;
    const cargo = fnCargo.value;
    const id = fnId.value;
    if (!nome || !login) { showToast('Preencha nome e usuário.'); return; }
    if (!id && (!senha || senha.length < 4)) { showToast('Defina uma senha com mínimo 4 caracteres.'); return; }
    if (id && senha && senha.length < 4) { showToast('Senha muito curta (mínimo 4).'); return; }
    try {
        if (id) {
            const payload = { nome, login, cargo };
            if (senha) {
                payload.salt = novoSalt();
                payload.senha_hash = await sha256Hex(senha + payload.salt);
            }
            const { error } = await sb.from('funcionarios').update(payload).eq('id', id);
            if (error) throw error;
            // Se o admin alterou o próprio login, atualiza a sessão local
            const { data: meu } = await sb.from('funcionarios').select('id, nome, login, cargo').eq('id', sessao.id).maybeSingle();
            if (meu) {
                sessao = { id: meu.id, nome: meu.nome, login: meu.login, cargo: meu.cargo };
                localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
                aplicarPermissoes();
            }
            showToast('Funcionário atualizado!');
        } else {
            const salt = novoSalt();
            const { error } = await sb.from('funcionarios').insert({
                nome, login, cargo, ativo: true,
                salt,
                senha_hash: await sha256Hex(senha + salt)
            });
            if (error) throw error;
            showToast('Funcionário adicionado!');
        }
        limparFormFunc();
        await loadFuncionarios();
    } catch (err) {
        if (err.code === '23505') showToast('Este usuário (login) já existe.');
        else showToast('Erro: ' + err.message);
    }
}

async function excluirFuncionario(f) {
    if (!podeGerirFuncionarios()) { showToast('Sem permissão.'); return; }
    if (f.id === sessao.id) { showToast('Você não pode excluir o próprio cadastro.'); return; }
    if (f.cargo === 'admin') {
        const totalAdmins = funcionariosCache.filter(x => x.cargo === 'admin' && x.ativo).length;
        if (totalAdmins <= 1) { showToast('Deve existir pelo menos 1 administrador.'); return; }
    }
    if (!confirm('Excluir "' + f.nome + '"?')) return;
    try {
        const { error } = await sb.from('funcionarios').delete().eq('id', f.id);
        if (error) throw error;
        showToast('Funcionário excluído.');
        await loadFuncionarios();
    } catch (e) {
        showToast('Erro ao excluir: ' + e.message);
    }
}

const VAPID_PUBLIC_KEY = 'BE4K-sQoS03PFNg8xV1CNIUvI4r1pADFJNjPTJqIA8U342S7tKcv_VQ4CNNBN5C7jlXqZx9WvGUHhiHK0j0M3Hw';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function ativarPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !sbReady) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
        }
        const json = sub.toJSON();
        await sb.from('push_subscriptions').upsert({
            endpoint: sub.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent
        }, { onConflict: 'endpoint' });
    } catch (e) { console.warn('Push subscribe:', e.message); }
}
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
            await ativarPush();
            await enviarNotificacao('🔔 Notificações ativadas', 'Pronto! Avisaremos aqui quando algum item estiver perto do vencimento.', true);
        } else {
            showToast('Permissão não concedida.');
        }
    } catch (e) {
        showToast('Erro ao pedir permissão: ' + e.message);
    }
}

function montarAviso() {
    const itens = [];
    produtos.forEach(p => p.lotes.forEach(l => {
        const d = diasRestantes(l.vencimento);
        if (d <= DIAS_ALERTA) itens.push({ nome: p.nome, dias: d });
    }));
    if (itens.length === 0) return null;
    itens.sort((a, b) => a.dias - b.dias);

    const vencidos = itens.filter(i => i.dias < 0).length;
    const proximos = itens.length - vencidos;

    let titulo;
    if (vencidos > 0 && proximos > 0) titulo = '⚠️ ' + vencidos + ' vencido(s) e ' + proximos + ' perto do vencimento';
    else if (vencidos > 0) titulo = '⚠️ ' + vencidos + ' item(ns) já venceram';
    else titulo = '⏰ ' + proximos + ' item(ns) vencem em até ' + DIAS_ALERTA + ' dia(s)';

    const linhas = itens.slice(0, 5).map(i => {
        const d = i.dias;
        if (d < 0) return '• ' + i.nome + ' — vencido há ' + Math.abs(d) + ' dia(s)';
        if (d === 0) return '• ' + i.nome + ' — vence HOJE';
        return '• ' + i.nome + ' — vence em ' + d + ' dia(s)';
    });
    if (itens.length > 5) linhas.push('… e mais ' + (itens.length - 5) + ' item(ns)');
    return { titulo, corpo: linhas.join('\n'), total: itens.length };
}

async function enviarNotificacao(titulo, corpo, forcar) {
    if (!notifDisponivel() || Notification.permission !== 'granted') return false;
    const hoje = new Date().toDateString();
    if (!forcar) {
        const ultima = localStorage.getItem(NOTIF_KEY);
        if (ultima === hoje) return false;
    }
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
        new Notification(titulo, { body: corpo, tag: 'mercadinho-alerta' });
        localStorage.setItem(NOTIF_KEY, hoje);
        return true;
    } catch (e) {
        console.warn('Falha ao enviar notificação:', e);
        return false;
    }
}

async function verificarNotificacoes(forcar) {
    if (!sessao) return;
    if (!notifDisponivel() || Notification.permission !== 'granted') return;
    if (produtos.length === 0) return;
    const aviso = montarAviso();
    if (!aviso) return;
    await enviarNotificacao(aviso.titulo, aviso.corpo, forcar);
}

function montarAvisoVencidos() {
    const itens = [];
    produtos.forEach(p => p.lotes.forEach(l => {
        const d = diasRestantes(l.vencimento);
        if (d < 0) itens.push({ nome: p.nome, dias: d });
    }));
    if (itens.length === 0) return null;
    itens.sort((a, b) => a.dias - b.dias);
    const linhas = itens.slice(0, 8).map(i => '• ' + i.nome + ' — vencido há ' + Math.abs(i.dias) + ' dia(s)');
    if (itens.length > 8) linhas.push('… e mais ' + (itens.length - 8) + ' item(ns)');
    return { titulo: '⚠️ ' + itens.length + ' item(ns) vencido(s)', corpo: linhas.join('\n'), total: itens.length };
}

async function verificarNotificacaoHorario() {
    if (!sessao) return;
    if (!notifDisponivel() || Notification.permission !== 'granted') return;
    if (produtos.length === 0) return;
    const agora = new Date();
    const hh = String(agora.getHours()).padStart(2, '0');
    const mm = String(agora.getMinutes()).padStart(2, '0');
    const atual = hh + ':' + mm;
    if (atual !== HORA_NOTIF) return;
    const hoje = new Date().toDateString();
    const ultima = localStorage.getItem(NOTIF_HORA_KEY);
    if (ultima === hoje) return;
    const aviso = montarAvisoVencidos();
    if (!aviso) return;
    const ok = await enviarNotificacao(aviso.titulo, aviso.corpo, true);
    if (ok) localStorage.setItem(NOTIF_HORA_KEY, hoje);
}
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
function fmtDataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderLista() {
    const termo = normNome(inputBusca.value);
    const filtrados = produtos.filter(p => {
        if (termo && !normNome(p.nome).includes(termo)) return false;
        return p.lotes.some(l => diasRestantes(l.vencimento) <= DIAS_ALERTA);
    });

    listaProdutos.innerHTML = '';
    if (filtrados.length === 0) { vazio.style.display = 'block'; return; }
    vazio.style.display = 'none';

    const ed = podeAtualizar();
    const ex = podeExcluirItem();

    filtrados.forEach(p => {
        const card = document.createElement('div');
        card.className = 'produto-card';

        const totalQtd = p.lotes.reduce((s, l) => s + (parseInt(l.quantidade, 10) || 0), 0);
        // lote mais próximo do vencimento (para o resumo)
        const lotesOrd = [...p.lotes].sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
        const proximo = lotesOrd[0];
        const dProx = proximo ? diasRestantes(proximo.vencimento) : 0;
        const sProx = status(dProx);

        const resumo = document.createElement('div');
        resumo.className = 'produto-resumo';
        resumo.innerHTML =
            '<div class="nome">' + esc(p.nome) + '</div>' +
            '<div class="produto-info">' +
            '<span>Total: ' + totalQtd + ' un</span>' +
            (p.unidade ? '<span>' + esc(p.valor) + ' ' + esc(p.unidade) + '</span>' : '') +
            '</div>' +
            '<div class="resumo-dias">' +
            '<span class="status status-' + sProx.c + '">' + sProx.t + '</span>' +
            '<span class="dias">' + txtDias(dProx) + '</span>' +
            '</div>';
        card.appendChild(resumo);

        const detalhes = document.createElement('div');
        detalhes.className = 'produto-detalhes';
        detalhes.style.display = 'none';

        const listaLotes = document.createElement('div');
        listaLotes.className = 'lote-lista';

        p.lotes.forEach(l => {
            const d = diasRestantes(l.vencimento);
            const s = status(d);
            const item = document.createElement('div');
            item.className = 'lote-item';

            let dono = '<div class="lote-dono">👤 ' + esc(l.adicionado_por || '—') + ' · ' + fmtDataHora(l.created_at);
            if (l.atualizado_em) dono += ' · ✏️ atualizado por ' + esc(l.atualizado_por || '—') + ' em ' + fmtDataHora(l.atualizado_em);
            dono += '</div>';

            item.innerHTML =
                '<div class="lote-info">' +
                '<div class="lote-top"><span class="lote-qtd">' + (parseInt(l.quantidade, 10) || 0) + ' un</span>' +
                '<span class="status status-' + s.c + '">' + s.t + '</span></div>' +
                '<div class="meta"><span><strong>Vence:</strong> ' + fmtBR(l.vencimento) + '</span>' +
                '<span class="dias">' + txtDias(d) + '</span></div>' +
                (l.codigoBarras ? '<div class="lote-dono">Cód: ' + esc(l.codigoBarras) + '</div>' : '') +
                dono +
                '</div>';

            if (ed || ex) {
                const acoes = document.createElement('div');
                acoes.className = 'lote-acoes';
                if (ed) {
                    const bEd = document.createElement('button');
                    bEd.type = 'button'; bEd.className = 'btn-mini mini-editar'; bEd.textContent = 'Editar';
                    bEd.addEventListener('click', (ev) => { ev.stopPropagation(); abrirModal(l.id, p.id); });
                    acoes.appendChild(bEd);
                }
                if (ex) {
                    const bEx = document.createElement('button');
                    bEx.type = 'button'; bEx.className = 'btn-mini mini-excluir'; bEx.textContent = 'Excluir';
                    bEx.addEventListener('click', (ev) => { ev.stopPropagation(); deleteLote(l.id); });
                    acoes.appendChild(bEx);
                }
                item.appendChild(acoes);
            }

            listaLotes.appendChild(item);
        });

        detalhes.appendChild(listaLotes);
        card.appendChild(detalhes);

        // Toggle detalhes ao clicar no resumo
        resumo.addEventListener('click', () => {
            const aberto = detalhes.style.display !== 'none';
            detalhes.style.display = aberto ? 'none' : 'block';
            card.classList.toggle('expandido', !aberto);
        });

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

// ---------- INICIALIZAÇÃO POR SESSÃO ----------
async function iniciarApp() {
    aplicarPermissoes();
    await loadConfig();
    if (podeConfigurarDias()) salvarTzOffset();
    await loadProdutos();
    if (podeGerirFuncionarios()) await loadFuncionarios();
    atualizarUINotificacao();
    if (notifDisponivel() && Notification.permission === 'granted') ativarPush();
    verificarNotificacoes(false);
    verificarNotificacaoHorario();
}

document.addEventListener('DOMContentLoaded', () => { try {
    initSupabase();

    // Restaura sessão
    try {
        const salva = localStorage.getItem(SESSAO_KEY);
        if (salva) sessao = JSON.parse(salva);
    } catch (e) { sessao = null; }

    if (sessao && sessao.id) {
        telaLogin.style.display = 'none';
        iniciarApp();
    } else {
        sessao = null;
        telaLogin.style.display = 'flex';
        loginUsuario.focus();
    }

    // Login
    formLogin.addEventListener('submit', entrar);

    // Cadastro de item
    formProduto.addEventListener('submit', async e => {
        e.preventDefault();
        const nome = document.getElementById('nome').value.trim();
        const unidade = document.getElementById('unidade').value;
        const valor = document.getElementById('valor').value;
        const qtd = parseInt(document.getElementById('quantidade').value, 10);
        const cb = document.getElementById('codigoBarras').value.trim();
        const venc = document.getElementById('vencimento').value;
        if (!nome || !qtd || !venc || !unidade || !valor) { showToast('Preencha todos os campos.'); return; }
        await saveProduto(nome, unidade, valor, qtd, venc, cb);
        limparFormCadastro();
        if (modalCadastro) modalCadastro.classList.remove('show');
    });

    // Horário de notificação (admin)
    if (horaNotifInput) horaNotifInput.addEventListener('change', () => {
        if (!podeConfigurarDias()) return;
        const v = horaNotifInput.value || '08:00';
        HORA_NOTIF = v;
        localStorage.setItem(HORA_KEY, HORA_NOTIF);
        salvarConfigHora(v);
    });

    // Prazo de alerta (somente admin altera → vale para todos)
    diasAlertaInput.addEventListener('change', () => {
        if (!podeConfigurarDias()) return;
        const v = parseInt(diasAlertaInput.value, 10) || 1;
        DIAS_ALERTA = v;
        localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
        diasAlertaLabel.textContent = DIAS_ALERTA;
        renderLista();
        renderStats();
        salvarConfigDias(v);
        verificarNotificacoes(true);
    });

    // Modal de edição
    document.getElementById('modal-salvar').addEventListener('click', salvarEdicao);
    document.getElementById('modal-cancelar').addEventListener('click', fecharModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) fecharModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editando) fecharModal(); });

    // Funcionários
    formFuncionario.addEventListener('submit', salvarFuncionario);
    fnCancelar.addEventListener('click', limparFormFunc);

    // Notificações
    btnNotif.addEventListener('click', pedirPermissaoNotificacao);
    setInterval(() => verificarNotificacoes(false), 6 * 60 * 60 * 1000);
    setInterval(() => verificarNotificacaoHorario(), 60 * 1000);
    setInterval(() => { if (sessao) loadProdutos().then(() => verificarNotificacoes(false)); }, 86400000);

    const fab = document.getElementById('fab-cadastrar');
    if (fab) fab.addEventListener('click', () => { limparFormCadastro(); if (modalCadastro) modalCadastro.classList.add('show'); });
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.getElementById('install-bar').classList.add('show'); });
    document.getElementById('btnInstall').addEventListener('click', async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('install-bar').classList.remove('show'); } });
    document.getElementById('btnCloseInstall').addEventListener('click', () => document.getElementById('install-bar').classList.remove('show'));

    // ===== NAVBAR / MENU =====
    function abrirMenu() { if (menuOverlay) menuOverlay.classList.add('show'); }
    function fecharMenu() { if (menuOverlay) menuOverlay.classList.remove('show'); }
    if (btnMenu) btnMenu.addEventListener('click', abrirMenu);
    if (btnFecharMenu) btnFecharMenu.addEventListener('click', fecharMenu);
    if (menuOverlay) menuOverlay.addEventListener('click', e => { if (e.target === menuOverlay) fecharMenu(); });

    function abrirModalGenerico(m) { if (m) m.classList.add('show'); }
    function fecharModalGenerico(m) { if (m) m.classList.remove('show'); }

    if (menuCadastro) menuCadastro.addEventListener('click', e => { e.preventDefault(); fecharMenu(); limparFormCadastro(); abrirModalGenerico(modalCadastro); });
    if (menuAlerta) menuAlerta.addEventListener('click', e => { e.preventDefault(); fecharMenu(); abrirModalGenerico(modalAlerta); });
    if (menuFuncionarios) menuFuncionarios.addEventListener('click', e => {
        e.preventDefault();
        if (!podeGerirFuncionarios()) { showToast('Somente o administrador acessa funcionários.'); return; }
        fecharMenu(); abrirModalGenerico(modalFuncionarios); if (podeGerirFuncionarios()) loadFuncionarios();
    });
    if (menuSair) menuSair.addEventListener('click', e => { e.preventDefault(); fecharMenu(); sair(); });

    // Código de barras: lookup ao sair do campo
    if (codigoBarrasInput) {
        codigoBarrasInput.addEventListener('change', () => preencherDoCatalogo(codigoBarrasInput.value));
        codigoBarrasInput.addEventListener('blur', () => preencherDoCatalogo(codigoBarrasInput.value));
    }
    if (btnScan) btnScan.addEventListener('click', () => { if (modalScan) modalScan.classList.add('show'); iniciarScan(); });
    if (btnFecharScan) btnFecharScan.addEventListener('click', () => { pararScan(); if (modalScan) modalScan.classList.remove('show'); });





    // Fechar modais ao clicar no overlay
    if (modalCadastro) modalCadastro.addEventListener('click', e => { if (e.target === modalCadastro) { limparFormCadastro(); fecharModalGenerico(modalCadastro); } });
    if (modalAlerta) modalAlerta.addEventListener('click', e => { if (e.target === modalAlerta) fecharModalGenerico(modalAlerta); });
    if (modalFuncionarios) modalFuncionarios.addEventListener('click', e => { if (e.target === modalFuncionarios) fecharModalGenerico(modalFuncionarios); });

    if (btnFecharAlerta) btnFecharAlerta.addEventListener('click', () => fecharModalGenerico(modalAlerta));

    // ESC fecha modais
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (modalCadastro && modalCadastro.classList.contains('show')) { limparFormCadastro(); fecharModalGenerico(modalCadastro); }
            if (modalAlerta && modalAlerta.classList.contains('show')) fecharModalGenerico(modalAlerta);

            fecharMenu();
        }
    });

  } catch (err) { console.error('Erro na inicializacao:', err); showToast('Erro na pagina: ' + err.message); }
});
