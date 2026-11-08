const SUPABASE_URL = 'https://izfonjoluifotwxzleix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Zm9uam9sdWlmb3R3eHpsZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDEwODAsImV4cCI6MjEwODk3NzA4MH0.A_o5OSNWKV8oKCO3y9P32XHJUn_G4ln4qmDzwqDD5Rc';
const DIAS_KEY = 'dias_alerta_mercadinho';
const SESSAO_KEY = 'sessao_mercadinho';
const LOGIN_DOMAIN = 'mercadinhobelo.com';
const NOTIF_KEY = 'notificacao_diaria_mercadinho';

let DIAS_ALERTA = parseInt(localStorage.getItem(DIAS_KEY), 10) || 3;
let produtos = [];
let avisosCache = [];
let avariasCache = [];
let avariaAtual = null;
let avariaItensCache = [];
let avariaHistoryPushed = false;
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
const formProduto = document.getElementById('formProduto');
const listaProdutos = document.getElementById('lista-produtos');
const inputBusca = document.getElementById('busca');
const statTotal = document.getElementById('statTotal');
const statProximos = document.getElementById('statProximos');
const statVencidos = document.getElementById('statVencidos');
const statPromocao = document.getElementById('statPromocao');
const statProx7 = document.getElementById('statProx7');
const statProx15 = document.getElementById('statProx15');
const statEstoque = document.getElementById('statEstoque');
const diasAlertaInput = document.getElementById('diasAlerta');
const diasAlertaLabel = document.getElementById('diasAlertaLabel');
const diasDica = document.getElementById('dias-dica');
const toastEl = document.getElementById('toast');
const vazio = document.getElementById('vazio');
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
const modalUsuario = document.getElementById('modal-usuario');
const modalScan = document.getElementById('modal-scan');
const btnFecharAlerta = document.getElementById('btn-fechar-alerta');
const btnScan = document.getElementById('btn-scan');
const btnFecharScan = document.getElementById('btn-fechar-scan');
const scanVideo = document.getElementById('scan-video');
const scanStatus = document.getElementById('scan-status');
const codigoBarrasInput = document.getElementById('codigoBarras');
const unidadeInput = document.getElementById('unidade');
const conteudoInput = document.getElementById('conteudo');

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
    return c === 'admin' ? 'Administrador' : c === 'gerente' ? 'Gerente' : c === 'patrao' ? 'Patrao' : c === 'avaria' ? 'Avaria' : 'Funcionario';
}
// ---------- PERMISSÕES ----------
function podeInserir() { return !!sessao && ['admin','gerente','funcionario'].includes(sessao.cargo); }
function podeAtualizar() { return podeInserir(); }
function podeExcluirItem() { return !!sessao && sessao.cargo === 'admin'; }
function podeGerirFuncionarios() { return !!sessao && sessao.cargo === 'admin'; }
function podeConfigurarDias() { return !!sessao && sessao.cargo === 'admin'; }
function podeGerirPromocoes() { return !!sessao && ['admin','gerente'].includes(sessao.cargo); }
function podeAvaria() { return !!sessao && sessao.cargo === 'avaria'; }
async function apiFuncionarios(method, payload) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    if (!token) throw new Error('Sessao expirada. Entre novamente.');
    const response = await fetch('/api/funcionarios', { method, headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token }, body: payload ? JSON.stringify(payload) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Falha ao comunicar com o servidor.');
    return result;
}

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

    const identificador = loginUsuario.value.trim().toLowerCase();
    const senha = loginSenha.value;

    if (!identificador || !senha) {
        loginErro.textContent = 'Preencha usuário e senha.';
        return;
    }

    if (!sbReady) {
        loginErro.textContent = 'Conexão indisponível. Recarregue a página.';
        return;
    }

    try {
        // Se informar e-mail, utiliza o e-mail.
        // Se informar login, monta login@mercadinhobelo.com.
        const email = identificador.includes('@')
            ? identificador
            : `${identificador}@${LOGIN_DOMAIN}`;

        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password: senha
        });

        if (error) throw new Error('Falha na autenticação: ' + error.message);

        const { data: perfil, error: perfilError } = await sb
            .from('funcionarios')
            .select('id,nome,login,cargo,ativo')
            .eq('auth_user_id', data.user.id)
            .maybeSingle();

        if (perfilError) {
            throw new Error('Falha ao consultar funcionários: ' + perfilError.message);
        }

        if (!perfil || !perfil.ativo) {
            await sb.auth.signOut();
            throw new Error('Usuário sem cadastro ativo na tabela funcionarios.');
        }

        sessao = {
            ...perfil,
            loginEm: new Date().toISOString()
        };

        localStorage.removeItem(SESSAO_KEY);
        formLogin.reset();
        telaLogin.style.display = 'none';

        const { error: updateError } = await sb
            .from('funcionarios')
            .update({ ultimo_acesso: new Date().toISOString() })
            .eq('id', perfil.id);

        if (updateError) {
            console.warn('Não foi possível atualizar último acesso:', updateError.message);
        }

        showToast('Bem-vindo(a), ' + perfil.nome + '!');
        await iniciarApp();

    } catch (err) {
        loginErro.textContent = err.message || 'Não foi possível entrar.';
        console.error('Erro no login:', err);
    }
}

async function sair() {
    localStorage.removeItem(SESSAO_KEY);
    sessao = null;
    if (sb) await sb.auth.signOut();
    location.reload();
}

function aplicarPermissoes() {
    const c = sessao.cargo;
    const toolbarTitle = document.querySelector('.toolbar-title');
    if (toolbarTitle) toolbarTitle.textContent = podeAvaria() ? 'Inventário de avarias' : 'Inventário';
    if (userChip) userChip.style.display = 'flex';
    if (userNome) userNome.textContent = sessao.nome;
    if (userCargo) { userCargo.textContent = labelCargo(c); userCargo.className = 'cargo-badge cargo-' + c; }
    if (menuFuncionariosItem) {
        if (podeGerirFuncionarios()) {
            menuFuncionariosItem.style.display = '';
        } else {
            menuFuncionariosItem.style.display = 'none';
        }
    }
    const fabCadastro = document.getElementById('fab-cadastrar');
    if (fabCadastro) fabCadastro.style.display = podeInserir() ? '' : 'none';
    const fabProdutoBase = document.getElementById('fab-produto-base');
    if (fabProdutoBase) fabProdutoBase.style.display = (sessao && sessao.cargo === 'admin') ? '' : 'none';
    if (menuCadastro && menuCadastro.parentElement) menuCadastro.parentElement.style.display = podeInserir() ? '' : 'none';
    const menuProdutoBaseItem = document.getElementById('menu-produto-base-item');
    if (menuProdutoBaseItem) menuProdutoBaseItem.style.display = (sessao && sessao.cargo === 'admin') ? '' : 'none';
    const menuBackupBaseItem = document.getElementById('menu-backup-base-item');
    if (menuBackupBaseItem) menuBackupBaseItem.style.display = (sessao && sessao.cargo === 'admin') ? '' : 'none';
    const menuAvariasItem = document.getElementById('menu-avarias-item');
    if (menuAvariasItem) menuAvariasItem.style.display = podeAvaria() ? '' : 'none';
    const fabAvaria = document.getElementById('fab-avaria');
    if (fabAvaria) fabAvaria.style.display = podeAvaria() ? '' : 'none';
    const statsEl = document.querySelector('.stats');
    if (statsEl) statsEl.style.display = podeAvaria() ? 'none' : '';
    const toolbarSearch = document.querySelector('.toolbar-search');
    if (toolbarSearch) toolbarSearch.style.display = podeAvaria() ? 'none' : '';
    const emptyState = document.getElementById('vazio');
    if (emptyState) emptyState.style.display = podeAvaria() ? 'none' : '';
    const avisosContainer = document.getElementById('avisos-container');
    if (avisosContainer) avisosContainer.style.display = podeAvaria() ? 'none' : '';
    const produtoLista = document.getElementById('lista-produtos');
    if (produtoLista) produtoLista.style.display = podeAvaria() ? 'none' : '';

    // Drawer: remove abas desnecessarias para usuario avaria
    const menuAlertaItem = document.getElementById('menu-alerta');
    if (menuAlertaItem && menuAlertaItem.parentElement) menuAlertaItem.parentElement.style.display = podeAvaria() ? 'none' : '';
    const menuHistoricoItem = document.getElementById('menu-historico');
    if (menuHistoricoItem && menuHistoricoItem.parentElement) menuHistoricoItem.parentElement.style.display = podeAvaria() ? 'none' : '';
    if (diasAlertaInput) {
        diasAlertaInput.disabled = !podeConfigurarDias();
        if (!podeConfigurarDias()) diasAlertaInput.readOnly = true;
    }
    if (diasDica) diasDica.textContent = podeConfigurarDias() ? ' (você controla o prazo de todos)' : ' (definido pelo administrador)';
}

// ---------- CONFIGURAÇÃO GLOBAL (dias de alerta) ----------
async function loadConfig() {
    if (!sbReady) return;
    try {
        const { data, error } = await sb.from('configuracoes').select('chave, valor');
        if (error) throw error;
        (data || []).forEach(row => {
            if (row.chave === 'dias_alerta' && row.valor) {
                const v = parseInt(row.valor, 10);
                if (!isNaN(v) && v >= 1) {
                    DIAS_ALERTA = v;
                    localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
                }
            }
        });
    } catch (e) {
        console.warn('Config não carregada:', e.message);
    }
    if (diasAlertaInput) diasAlertaInput.value = DIAS_ALERTA;
    if (diasAlertaLabel) diasAlertaLabel.textContent = DIAS_ALERTA;
    window.DIAS_ALERTA = DIAS_ALERTA;
    if (typeof renderLista === 'function') renderLista();
    if (typeof renderStats === 'function') renderStats();
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
async function loadProdutos() {
    if (!sbReady) { renderLista(); renderStats(); return; }
    try {
        const { data, error } = await sb
            .from('lotes')
            .select('id, produto_id, quantidade, vencimento, codigo_barras, adicionado_por, atualizado_por, atualizado_em, created_at, em_promocao, promocao_desde, promocao_motivo, conferido_por, conferido_em, produtos(nome, codigo_barras, unidade, conteudo)')
            .order('vencimento', { ascending: true });
        if (error) throw error;

        const map = {};
        (data || []).forEach(r => {
            const nm = r.produtos && r.produtos.nome ? r.produtos.nome : 'Sem nome';
            if (!map[r.produto_id]) map[r.produto_id] = {
                id: r.produto_id, nome: nm,
                codigoBarras: (r.produtos && r.produtos.codigo_barras) || r.codigo_barras || '',
                unidade: (r.produtos && r.produtos.unidade) || '',
                conteudo: (r.produtos && r.produtos.conteudo) != null ? r.produtos.conteudo : '',
                lotes: []
            };
            map[r.produto_id].lotes.push({
                id: r.id, quantidade: r.quantidade, vencimento: r.vencimento,
                codigoBarras: r.codigo_barras,
                adicionado_por: r.adicionado_por, atualizado_por: r.atualizado_por,
                atualizado_em: r.atualizado_em, created_at: r.created_at, em_promocao: !!r.em_promocao, promocao_desde:r.promocao_desde, promocao_motivo:r.promocao_motivo, conferido_por:r.conferido_por, conferido_em:r.conferido_em
            });
        });
        produtos = Object.values(map);
        produtos.sort((a, b) => new Date(a.lotes[0].vencimento) - new Date(b.lotes[0].vencimento));

        // Nao removemos cadastros automaticamente: exclusoes exigem acao autorizada.
    } catch (e) {
        showToast('Erro carregar: ' + e.message);
        produtos = [];
    }
    console.log('loadProdutos DIAS_ALERTA=', DIAS_ALERTA, 'produtos=', produtos.length);
    window.DIAS_ALERTA = DIAS_ALERTA;
    window.produtos = produtos;
    renderLista();
    renderStats();
}

// ---------- SALVAR (junta nomes iguais) ----------
async function saveProduto(nome, unidade, conteudo, qtd, venc, codigoBarras) {
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
                conteudo: Number(conteudo)
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
            // Atualiza unidade e codigo de barras do cadastro existente
            const { error: updateError } = await sb.from('produtos').update({ codigo_barras: cb || existente.codigo_barras, unidade, conteudo:Number(conteudo) }).eq('id', pid);
            if (updateError) throw updateError;
        } else {
            const { data: novo, error: e2 } = await sb.from('produtos').insert({
                nome: nome.trim(),
                codigo_barras: cb || null,
                unidade: unidade,
                conteudo: Number(conteudo)
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
            if (conteudoInput) conteudoInput.value = data.conteudo != null ? data.conteudo : '';
            showToast('Dados preenchidos do catálogo!');
            return;
        }
        const { data: p } = await sb.from('produtos').select('nome, unidade, conteudo').eq('codigo_barras', cb).maybeSingle();
        if (p) {
            document.getElementById('nome').value = p.nome || '';
            if (unidadeInput) unidadeInput.value = p.unidade || 'litros';
            if (conteudoInput) conteudoInput.value = p.conteudo != null ? p.conteudo : '';
        }
    } catch (e) { console.warn('Catalogo lookup:', e.message); }
}

async function preencherBaseDoCatalogo(cb) {
    cb = (cb || '').trim();
    if (!cb || !sbReady) return;
    try {
        const { data } = await sb.from('produtos_base').select('*').eq('codigo_barras', cb).maybeSingle();
        if (data) {
            const nome = document.getElementById('pb-nome');
            const unidade = document.getElementById('pb-unidade');
            const conteudo = document.getElementById('pb-conteudo');
            if (nome) nome.value = data.nome || '';
            if (unidade) unidade.value = data.unidade || 'litros';
            if (conteudo) conteudo.value = data.conteudo != null ? data.conteudo : '';
            showToast('Dados preenchidos do catálogo!');
        }
    } catch (e) { console.warn('Catalogo lookup:', e.message); }
}

let scanStream = null;
let scanRAF = null;
let scanTargetInput = null;
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
                        const target = scanTargetInput || codigoBarrasInput;
                        if (target) target.value = val;
                        if (scanStatus) scanStatus.textContent = 'Lido: ' + val;
                        if (target && target.id === 'pb-codigo') {
                            await preencherBaseDoCatalogo(val);
                        } else if (target && target.id === 'av-item-codigo') {
                            await preencherAvariaDoCatalogo(val);
                        } else {
                            await preencherDoCatalogo(val);
                        }
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

// ---------- MODAL USUÁRIO ----------
function abrirModalUsuario() {
    if (!sessao) return;
    document.getElementById('us-id').value = sessao.id;
    document.getElementById('us-nome').value = sessao.nome || '';
    document.getElementById('us-login').value = sessao.login || '';
    document.getElementById('us-cargo').value = labelCargo(sessao.cargo);
    const loginEm = sessao.loginEm ? new Date(sessao.loginEm) : null;
    document.getElementById('us-login-em').value = loginEm ? loginEm.toLocaleString('pt-BR') : '';
    document.getElementById('us-senha').value = '';
    if (modalUsuario) modalUsuario.classList.add('show');
}
window.abrirModalUsuario = abrirModalUsuario;

async function salvarUsuario(e) {
    if (e) e.preventDefault();
    if (!sbReady || !sessao) { showToast('Supabase não conectado.'); return; }
    const nome = document.getElementById('us-nome').value.trim();
    const senha = document.getElementById('us-senha').value;
    if (!nome) { showToast('Preencha o nome.'); return; }
    if (senha && senha.length < 8) { showToast('Senha muito curta (minimo 8).'); return; }
    try {
        const { error } = await sb.from('funcionarios').update({ nome, atualizado_em: new Date().toISOString() }).eq('id', sessao.id);
        if (error) throw error;
        if (senha) { const { error: senhaError } = await sb.auth.updateUser({ password: senha }); if (senhaError) throw senhaError; }
        sessao.nome = nome;
        localStorage.removeItem(SESSAO_KEY);
        aplicarPermissoes();
        showToast('Dados atualizados!');
        if (modalUsuario) modalUsuario.classList.remove('show');
    } catch (err) {
        showToast('Erro: ' + err.message);
    }
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
    const editVR = document.getElementById('edit-vencimento-rapido');
    if (editVR) editVR.value = '';
    modalOverlay.classList.add('show');
    editQtd.focus();
}
window.abrirModal = abrirModal;

function limparFormCadastro() {
    if (formProduto) formProduto.reset();
    const q = document.getElementById('quantidade');
    const u = document.getElementById('unidade');
    const c = document.getElementById('conteudo');
    const vc = document.getElementById('vencimento');
    const cb = document.getElementById('codigoBarras');
    const nm = document.getElementById('nome');
    if (q) q.value = 1;
    if (u) u.value = 'litros';
    if (c) c.value = '';
    if (vc) vc.value = new Date().toISOString().split('T')[0];
    const vr = document.getElementById('vencimento-rapido');
    if (vr) vr.value = '';
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
                atualizado_em: new Date().toISOString(),
                atualizado_por_id: sessao.id
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
        const result = await apiFuncionarios('GET');
        funcionariosCache = result.funcionarios || [];
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
        bEx.type = 'button'; bEx.className = 'btn-mini mini-excluir'; bEx.textContent = f.ativo ? 'Desativar' : (f.acesso_configurado ? 'Ativar' : 'Configurar acesso');
        bEx.addEventListener('click', () => excluirFuncionario(f));
        acoes.append(bEd, bEx);
        card.append(info, badge, acoes);
        listaFuncionarios.appendChild(card);
    });
}

function preencherFormFunc(f) {
    fnId.value = f.id;
    fnNome.value = f.nome;
    fnLogin.value = f.login; fnLogin.readOnly = true;
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
    fnLogin.value = ''; fnLogin.readOnly = false;
    fnSenha.value = '';
    fnSenha.placeholder = 'Minimo 8 caracteres';
    fnCargo.value = 'funcionario';
    fnBotao.textContent = 'Adicionar funcionário';
    fnCancelar.style.display = 'none';
}

async function salvarFuncionario(e) {
    e.preventDefault();
    if (!podeGerirFuncionarios()) { showToast('Somente administrador gerencia funcionarios.'); return; }
    const nome = fnNome.value.trim(), login = fnLogin.value.trim().toLowerCase();
    const senha = fnSenha.value, cargo = fnCargo.value, id = fnId.value;
    if (!nome || !login) { showToast('Preencha nome e usuario.'); return; }
    if (!id && senha.length < 8) { showToast('A senha inicial deve ter pelo menos 8 caracteres.'); return; }
    if (id && senha && senha.length < 8) { showToast('A senha deve ter pelo menos 8 caracteres.'); return; }
    try {
        if (id) await apiFuncionarios('PATCH', { id, nome, cargo, senha });
        else await apiFuncionarios('POST', { nome, login, cargo, senha });
        limparFormFunc(); await loadFuncionarios(); showToast(id ? 'Funcionario atualizado!' : 'Funcionario criado!');
    } catch (err) { showToast('Erro: ' + err.message); }
}

async function excluirFuncionario(f) {
    if (!podeGerirFuncionarios()) { showToast('Sem permissão.'); return; }
    if (f.id === sessao.id) { showToast('Você não pode excluir o próprio cadastro.'); return; }
    if (f.ativo && f.cargo === 'admin') {
        const totalAdmins = funcionariosCache.filter(x => x.cargo === 'admin' && x.ativo).length;
        if (totalAdmins <= 1) { showToast('Deve existir pelo menos 1 administrador.'); return; }
    }
    if (!f.ativo && !f.acesso_configurado) { preencherFormFunc(f); fnSenha.placeholder = 'Defina uma nova senha (minimo 8 caracteres)'; fnSenha.focus(); showToast('Cadastro legado: defina uma nova senha para criar o acesso seguro.'); return; }
    if (!confirm((f.ativo ? 'Desativar ' : 'Reativar ') + '"' + f.nome + '"?')) return;
    try {
        if (f.ativo) await apiFuncionarios('DELETE', { id: f.id });
        else await apiFuncionarios('PATCH', { id: f.id, active: true });
        showToast(f.ativo ? 'Funcionario desativado.' : 'Funcionario reativado.');
        await loadFuncionarios();
    } catch (e) { showToast('Erro ao desativar: ' + e.message); }
}

const VAPID_PUBLIC_KEY = 'BLWAiQcRiu4D-x6PEerVLDGLPdlbCffh1QquLAZWi_QSjBI-ka2wLM_Eoz01LCTM2EPUNKaXOVmXod5KtHAz0IU';

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
        const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        if (sub && sub.options && sub.options.applicationServerKey) {
            const currentKey = new Uint8Array(sub.options.applicationServerKey);
            const sameKey = currentKey.length === expectedKey.length && currentKey.every((value,index) => value === expectedKey[index]);
            if (!sameKey) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
        const json = sub.toJSON();
        await sb.from('push_subscriptions').upsert({
            endpoint: sub.endpoint,
            funcionario_id: sessao.id,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent
        }, { onConflict: 'endpoint,funcionario_id' });
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
                icon: 'icon-192.png',
                badge: 'icon-192.png',
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
    if (produtos.length === 0) { localStorage.removeItem(NOTIF_KEY); return; }
    const aviso = montarAviso();
    if (!aviso) return;
    await enviarNotificacao(aviso.titulo, aviso.corpo, forcar);
}


// ---------- PULL TO REFRESH (mobile) ----------
document.addEventListener('DOMContentLoaded', () => {
  const lista = document.getElementById('lista-produtos');
  const indicator = document.getElementById('pull-refresh');
  if (!lista || !indicator) return;
  let startY = null;
  let distance = 0;
  let refreshing = false;
  lista.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (lista.scrollTop <= 0) startY = e.touches[0].clientY;
  }, { passive: true });
  lista.addEventListener('touchmove', (e) => {
    if (startY === null || refreshing) return;
    distance = e.touches[0].clientY - startY;
    if (distance > 0) {
      const d = Math.min(distance, 120);
      indicator.style.transform = 'translate(-50%, ' + (-100 + d * 0.8) + '%)';
      indicator.style.opacity = String(Math.min(distance / 80, 1));
      if (distance > 80) indicator.classList.add('ready'); else indicator.classList.remove('ready');
    }
  }, { passive: true });
  lista.addEventListener('touchend', async () => {
    if (startY === null || refreshing) { startY = null; distance = 0; return; }
    if (distance > 80) {
      refreshing = true;
      indicator.textContent = 'Atualizando...';
      indicator.classList.add('show', 'ready');
      try {
        await loadConfig();
        await loadProdutos();
        await loadAvisos();
        if (typeof podeAvaria === 'function' && podeAvaria()) await loadAvarias();
        if (typeof podeGerirFuncionarios === 'function' && podeGerirFuncionarios()) await loadFuncionarios();
        showToast('Dados atualizados.');
      } catch (err) {
        showToast('Falha ao atualizar: ' + (err.message || err));
      }
      refreshing = false;
    }
    startY = null;
    distance = 0;
    indicator.classList.remove('show', 'ready');
    indicator.style.transform = '';
    indicator.style.opacity = '';
    indicator.textContent = 'Atualizando...';
  });
});

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

async function registrarSaida(loteId, tipo) {
    if (!podeInserir()) { showToast('Sem permissao para registrar saidas.'); return; }
    const quantidade = Number(prompt(`Quantidade para ${tipo === 'venda' ? 'venda' : 'descarte'}:`));
    if (!Number.isInteger(quantidade) || quantidade < 1) return;
    const observacao = tipo === 'descarte' ? '' : (prompt('Observacao (opcional):') || '');
    try {
        const { error } = await sb.rpc('registrar_movimentacao', { p_lote_id:loteId, p_tipo:tipo, p_quantidade:quantidade, p_observacao:observacao });
        if (error) throw error;
        await loadProdutos(); showToast(tipo === 'venda' ? 'Venda registrada e estoque atualizado.' : 'Descarte registrado e estoque atualizado.');
    } catch (e) { showToast('Nao foi possivel registrar: ' + e.message); }
}

async function marcarConferido(loteId) {
    if (!podeInserir()) return;
    try {
        const { error } = await sb.from('lotes').update({ conferido_por:sessao.nome, conferido_por_id:sessao.id, conferido_em:new Date().toISOString() }).eq('id',loteId);
        if (error) throw error;
        await loadProdutos(); showToast('Lote marcado como conferido.');
    } catch(e) { showToast('Erro ao conferir lote: '+e.message); }
}

async function ajustarEstoque(loteId, saldoAtual) {
    if (!podeGerirPromocoes()) return;
    const novoSaldo = Number(prompt('Informe a nova quantidade fisica contada:', String(saldoAtual)));
    if (!Number.isInteger(novoSaldo) || novoSaldo < 0) return;
    const observacao = prompt('Motivo do ajuste (opcional):') || '';
    try {
        const { error } = await sb.rpc('ajustar_estoque', { p_lote_id:loteId, p_nova_quantidade:novoSaldo, p_observacao:observacao });
        if (error) throw error;
        await loadProdutos(); showToast('Estoque ajustado e historico registrado.');
    } catch(e) { showToast('Erro ao ajustar estoque: '+e.message); }
}

async function alternarPromocao(lote) {
    if (!podeGerirPromocoes()) return;
    const motivo = lote.em_promocao ? null : (prompt('Motivo/destaque (ex.: priorizar venda esta semana):') || 'Prioridade de venda');
    try {
        const { error } = await sb.from('lotes').update({ em_promocao:!lote.em_promocao, promocao_desde:lote.em_promocao?null:new Date().toISOString().slice(0,10), promocao_motivo:motivo }).eq('id',lote.id);
        if (error) throw error;
        await loadProdutos(); showToast(lote.em_promocao ? 'Destaque removido.' : 'Lote destacado para venda.');
    } catch (e) { showToast('Erro ao atualizar destaque: ' + e.message); }
}

async function limparHistorico() {
    if (!sessao || sessao.cargo !== 'admin') { showToast('Somente administrador.'); return; }
    if (!confirm('Excluir todo o histórico de movimentações e auditoria? Esta ação não pode ser desfeita.')) return;
    try {
        await sb.from('movimentacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await sb.from('auditoria').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        showToast('Histórico limpo.');
        abrirHistorico();
    } catch (e) {
        showToast('Erro ao limpar histórico: ' + e.message);
    }
}

async function excluirHistoricoItem(tipo, id) {
    if (!sessao || sessao.cargo !== 'admin') { showToast('Somente administrador.'); return; }
    if (!confirm('Excluir este registro do histórico?')) return;
    try {
        const tabela = tipo === 'mov' ? 'movimentacoes' : 'auditoria';
        const { error } = await sb.from(tabela).delete().eq('id', id);
        if (error) throw error;
        showToast('Registro excluído.');
        abrirHistorico();
    } catch (e) {
        showToast('Erro ao excluir: ' + e.message);
    }
}

async function abrirHistorico() {
    const modal = document.getElementById('modal-historico');
    const area = document.getElementById('historico-conteudo');
    const resumo = document.getElementById('relatorio-resumo');
    if (!modal || !area) return;
    area.textContent = 'Carregando historico...'; if (resumo) resumo.textContent='Carregando indicadores...'; modal.classList.add('show');
    const btnLimpar = document.getElementById('btn-limpar-historico');
    if (btnLimpar) btnLimpar.style.display = (sessao && sessao.cargo === 'admin') ? '' : 'none';
    try {
        const [{ data, error }, { data: logs, error: auditError }, { data: totals, error: totalsError }] = await Promise.all([
          sb.from('movimentacoes').select('id,tipo,quantidade,observacao,funcionario_nome,created_at,produtos(nome)').order('created_at',{ascending:false}).limit(100),
          sb.from('auditoria').select('id,tabela,acao,funcionario_nome,created_at').order('created_at',{ascending:false}).limit(100),
          sb.from('resumo_perdas').select('mes,tipo,operacoes,unidades').order('mes',{ascending:false}).limit(24)
        ]);
        if (error) throw error; if (auditError) throw auditError; if (totalsError) throw totalsError;
        if (resumo) { resumo.innerHTML=''; (totals||[]).forEach(t=>{ const row=document.createElement('div'); row.className='historico-row'; const mes=new Date(t.mes+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); row.textContent=`${mes} · ${t.tipo}: ${t.operacoes} operacao(oes), ${t.unidades} unidade(s)`; resumo.appendChild(row); }); if (!(totals||[]).length) resumo.textContent='Ainda nao ha dados para consolidar.'; }
        area.innerHTML = '';
        const entries = [...(data||[]).map(m=>({id:m.id, type:'mov', date:m.created_at, text:`${m.tipo.toUpperCase()} · ${m.produtos?.nome||'Produto removido'} · ${m.quantidade} un · ${m.funcionario_nome}${m.observacao?' · '+m.observacao:''}`})), ...(logs||[]).map(a=>({id:a.id, type:'audit', date:a.created_at,text:`${a.acao.toUpperCase()} · ${a.tabela} · ${a.funcionario_nome}`}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,150);
        if (!entries.length) { area.textContent = 'Ainda nao existem movimentacoes.'; return; }
        entries.forEach(entry => {
            const row=document.createElement('div'); row.className='historico-row';
            row.innerHTML = `${new Date(entry.date).toLocaleString('pt-BR')} · ${entry.text}` +
                (sessao && sessao.cargo === 'admin' ? ' <button type="button" class="aviso-del" data-type="' + entry.type + '" data-id="' + esc(entry.id) + '">Excluir</button>' : '');
            const del = row.querySelector('.aviso-del');
            if (del) del.addEventListener('click', () => excluirHistoricoItem(entry.type, entry.id));
            area.appendChild(row);
        });
    } catch(e) { area.textContent='Erro ao carregar historico: '+e.message; }
}

async function exportarRelatorio() {
    try {
        const { data, error } = await sb.from('movimentacoes').select('created_at,tipo,quantidade,funcionario_nome,observacao,produtos(nome)').order('created_at',{ascending:false});
        if (error) throw error;
        const rows=[['Data','Tipo','Produto','Quantidade','Funcionario','Observacao'],...(data||[]).map(m=>[new Date(m.created_at).toLocaleString('pt-BR'),m.tipo,m.produtos?.nome||'Produto removido',m.quantidade,m.funcionario_nome,m.observacao||''])];
        const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
        const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='relatorio-movimentacoes.csv'; a.click(); URL.revokeObjectURL(url);
    } catch(e) { showToast('Erro ao exportar relatorio: '+e.message); }
}

// ---------- AVISOS ----------
async function loadAvisos() {
    if (!sbReady) { avisosCache = []; renderAvisos(); return; }
    try {
        const { data, error } = await sb.from('avisos').select('*').eq('ativo', true).order('created_at', { ascending: false });
        if (error) throw error;
        avisosCache = data || [];
    } catch (e) {
        console.warn('Avisos:', e.message);
        avisosCache = [];
    }
    renderAvisos();
}

function renderAvisos() {
    const container = document.getElementById('avisos-container');
    const modalList = document.getElementById('lista-avisos-modal');
    if (container) {
        container.innerHTML = '';
        if (avisosCache.length === 0) {
            container.style.display = 'none';
        } else {
            container.style.display = 'flex';
            avisosCache.forEach(a => {
                const card = document.createElement('div');
                card.className = 'aviso-card';
                card.innerHTML = '<div class="aviso-titulo">' + esc(a.titulo) + '</div>' +
                    '<div class="aviso-msg">' + esc(a.mensagem) + '</div>' +
                    '<div class="aviso-meta">' + esc(a.criado_por || 'Admin') + ' · ' + fmtDataHora(a.created_at) + '</div>';
                container.appendChild(card);
            });
        }
    }
    if (modalList) {
        modalList.innerHTML = '';
        if (avisosCache.length === 0) {
            modalList.textContent = 'Nenhum aviso.';
        } else {
            avisosCache.forEach(a => {
                const row = document.createElement('div');
                row.className = 'historico-row';
                row.innerHTML = '<strong>' + esc(a.titulo) + '</strong><br>' + esc(a.mensagem) +
                    '<br><small>' + esc(a.criado_por || '') + ' · ' + fmtDataHora(a.created_at) + '</small>' +
                    (podeGerirFuncionarios() ? ' <button type="button" class="aviso-del" data-id="' + esc(a.id) + '">Excluir</button>' : '');
                modalList.appendChild(row);
            });
            modalList.querySelectorAll('.aviso-del').forEach(btn => {
                btn.addEventListener('click', () => deleteAviso(btn.dataset.id));
            });
        }
    }
    const formBox = document.getElementById('form-aviso-box');
    if (formBox) formBox.style.display = podeGerirFuncionarios() ? '' : 'none';
}

async function saveAviso() {
    if (!podeGerirFuncionarios()) { showToast('Somente administrador publica avisos.'); return; }
    const titulo = (document.getElementById('aviso-titulo') || {}).value;
    const mensagem = (document.getElementById('aviso-mensagem') || {}).value;
    if (!titulo || !titulo.trim() || !mensagem || !mensagem.trim()) { showToast('Preencha título e mensagem.'); return; }
    try {
        const { error } = await sb.from('avisos').insert({
            titulo: titulo.trim(),
            mensagem: mensagem.trim(),
            criado_por: sessao.nome,
            criado_por_id: sessao.id
        });
        if (error) throw error;
        document.getElementById('aviso-titulo').value = '';
        document.getElementById('aviso-mensagem').value = '';
        await loadAvisos();
        showToast('Aviso publicado!');
    } catch (e) {
        showToast('Erro ao publicar aviso: ' + e.message);
    }
}

async function deleteAviso(id) {
    if (!podeGerirFuncionarios()) return;
    if (!confirm('Excluir este aviso?')) return;
    try {
        const { error } = await sb.from('avisos').delete().eq('id', id);
        if (error) throw error;
        await loadAvisos();
        showToast('Aviso excluído.');
    } catch (e) {
        showToast('Erro ao excluir aviso: ' + e.message);
    }
}

async function saveProdutoBase(e) {
    if (e) e.preventDefault();
    if (!sessao || sessao.cargo !== 'admin') { showToast('Somente administrador cadastra item base.'); return; }
    const codigo = (document.getElementById('pb-codigo') || {}).value;
    const nome = (document.getElementById('pb-nome') || {}).value;
    const unidade = (document.getElementById('pb-unidade') || {}).value;
    const conteudo = Number((document.getElementById('pb-conteudo') || {}).value);
    if (!codigo || !codigo.trim() || !nome || !nome.trim() || !unidade || !Number.isFinite(conteudo) || conteudo <= 0) {
        showToast('Preencha todos os campos corretamente.');
        return;
    }
    if (!codigoBarrasPadraoValido(codigo)) {
        showToast('Código de barras com quantidade de caracteres fora do padrão.');
        return;
    }
    if (!sbReady) { showToast('Supabase não conectado.'); return; }
    try {
        const { error } = await sb.from('produtos_base').upsert({
            codigo_barras: codigo.trim(),
            nome: nome.trim(),
            unidade,
            conteudo
        });
        if (error) throw error;
        showToast('Item base salvo com sucesso!');
        const form = document.getElementById('formProdutoBase');
        if (form) form.reset();
        const c = document.getElementById('pb-conteudo');
        if (c) c.value = '';
        const m = document.getElementById('modal-produto-base');
        if (m) m.classList.remove('show');
    } catch (err) {
        showToast('Erro ao salvar item base: ' + err.message);
    }
}

function codigoBarrasPadraoValido(valor) {
    const v = (valor || '').trim();
    if (!v) return true;
    return [6, 8, 12, 13, 14].includes(v.length);
}

function alertarCodigoBarrasInvalido(input) {
    if (!input) return true;
    const ok = codigoBarrasPadraoValido(input.value);
    input.style.borderColor = ok ? '' : '#c43d35';
    input.title = ok ? '' : 'Código de barras com quantidade de caracteres fora do padrão.';
    if (!ok) showToast('Código de barras com quantidade de caracteres fora do padrão.');
    return ok;
}

// ---------- AVARIAS ----------
async function loadAvarias() {
    if (!sbReady || !podeAvaria()) { avariasCache = []; renderAvarias(); return; }
    try {
        let q = sb.from('avarias').select('*, avaria_itens(count)').order('created_at', { ascending: false });
        if (sessao.cargo !== 'admin') {
            q = q.eq('criado_por_id', sessao.id);
        }
        const { data, error } = await q;
        if (error) throw error;
        avariasCache = (data || []).map(a => ({
            ...a,
            itens_count: (Array.isArray(a.avaria_itens) && a.avaria_itens[0] && a.avaria_itens[0].count) || 0
        }));
    } catch (e) {
        console.warn('Avarias:', e.message);
        // fallback sem contagem
        try {
            let q2 = sb.from('avarias').select('*').order('created_at', { ascending: false });
            if (sessao.cargo !== 'admin') q2 = q2.eq('criado_por_id', sessao.id);
            const { data } = await q2;
            avariasCache = (data || []).map(a => ({ ...a, itens_count: 0 }));
        } catch (e2) {
            avariasCache = [];
        }
    }
    renderAvarias();
}

async function excluirAvaria(id) {
    const a = avariasCache.find(x => x.id === id);
    if (a && a.fechada) { showToast('Avaria fechada não pode ser excluída.'); return; }
    if (!podeAvaria() && sessao.cargo !== 'admin') return;
    if (!confirm('Excluir esta avaria e seus itens?')) return;
    try {
        const { error } = await sb.from('avarias').delete().eq('id', id);
        if (error) throw error;
        if (avariaAtual && avariaAtual.id === id) {
            avariaAtual = null;
            fecharModalAvaria();
        }
        await loadAvarias();
        showToast('Avaria excluída.');
    } catch (e) {
        showToast('Erro ao excluir avaria: ' + e.message);
    }
}

function renderAvarias() {
    const container = document.getElementById('avarias-container');
    if (!container) return;
    container.innerHTML = '';
    if (!podeAvaria() || avariasCache.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    avariasCache.forEach(a => {
        const card = document.createElement('div');
        card.className = 'aviso-card';
        card.style.cursor = 'pointer';
        card.innerHTML = '<div class="aviso-titulo">Avaria #' + String(a.id).slice(0,8) + (a.fechada ? ' (FECHADA)' : ' (ABERTA)') + '</div>' +
            '<div class="aviso-msg">Data: ' + (a.data_abertura || '') + ' · Itens: ' + (a.itens_count || 0) + '</div>' +
            '<div class="aviso-meta">' + esc(a.criado_por || '') + ' · ' + fmtDataHora(a.created_at) + '</div>' +
            (a.fechada ? '' : '<button type="button" class="aviso-del" data-id="' + esc(a.id) + '">Excluir avaria</button>');
        card.addEventListener('click', (ev) => {
            if (ev.target && ev.target.classList.contains('aviso-del')) return;
            abrirAvaria(a.id);
        });
        const del = card.querySelector('.aviso-del');
        if (del) del.addEventListener('click', (ev) => { ev.stopPropagation(); excluirAvaria(a.id); });
        container.appendChild(card);
    });
}

async function abrirNovaAvaria() {
    if (!podeAvaria() || !sbReady) { showToast('Sem permissão ou conexão.'); return; }
    try {
        const { data, error } = await sb.from('avarias').insert({
            data_abertura: new Date().toISOString().slice(0,10),
            criado_por: sessao.nome,
            criado_por_id: sessao.id
        }).select('*').single();
        if (error) throw error;
        avariaAtual = data;
        await loadAvarias();
        abrirModalAvaria();
    } catch (e) {
        showToast('Erro ao abrir avaria: ' + e.message);
    }
}

function abrirModalAvaria() {
    const modal = document.getElementById('modal-avaria');
    const info = document.getElementById('avaria-info');
    const fechada = !!(avariaAtual && avariaAtual.fechada);
    if (info && avariaAtual) info.textContent = 'Avaria de ' + (avariaAtual.data_abertura || '') + ' — ' + (avariaAtual.criado_por || '') + (fechada ? ' (FECHADA)' : '');
    const formBox = document.getElementById('avaria-form-box');
    if (formBox) formBox.style.display = fechada ? 'none' : '';
    const btnFecharAvaria = document.getElementById('btn-fechar-avaria');
    if (btnFecharAvaria) btnFecharAvaria.style.display = fechada ? 'none' : '';
    if (modal) modal.classList.add('show');
    carregarItensAvaria();
    const codigo = document.getElementById('av-item-codigo'); if (codigo) codigo.value = '';
    const sku = document.getElementById('av-item-sku'); if (sku) sku.value = '';
    const nome = document.getElementById('av-item-nome'); if (nome) nome.value = '';
    const unidade = document.getElementById('av-item-unidade'); if (unidade) unidade.value = 'litros';
    const conteudo = document.getElementById('av-item-conteudo'); if (conteudo) conteudo.value = '';
    const qtd = document.getElementById('av-item-qtd'); if (qtd) qtd.value = '';
}

function fecharModalAvaria() {
    const modal = document.getElementById('modal-avaria');
    if (modal) modal.classList.remove('show');
}

async function fecharAvaria() {
    if (!avariaAtual || !sbReady) return;
    if (avariaAtual.fechada) { showToast('Avaria já está fechada.'); return; }
    if (!confirm('Fechar esta avaria? Após fechar, não será possível alterar itens.')) return;
    try {
        const { data, error } = await sb.from('avarias').update({ fechada: true }).eq('id', avariaAtual.id).select('*').single();
        if (error) throw error;
        if (data) avariaAtual = data;
        else avariaAtual.fechada = true;
        await loadAvarias();
        const updated = avariasCache.find(a => a.id === avariaAtual.id);
        if (updated) avariaAtual = updated;
        abrirModalAvaria();
        showToast('Avaria fechada.');
    } catch (e) {
        showToast('Erro ao fechar avaria: ' + e.message);
    }
}

async function carregarItensAvaria() {
    const lista = document.getElementById('avaria-itens-lista');
    if (!lista || !avariaAtual) return;
    lista.textContent = 'Carregando...';
    try {
        const { data, error } = await sb.from('avaria_itens').select('*').eq('avaria_id', avariaAtual.id).order('created_at', { ascending: true });
        if (error) throw error;
        avariaItensCache = data || [];
        lista.innerHTML = '';
        if (avariaItensCache.length === 0) { lista.textContent = 'Nenhum item adicionado.'; return; }
        const fechada = !!(avariaAtual && avariaAtual.fechada);
        avariaItensCache.forEach(it => {
            const row = document.createElement('div');
            row.className = 'avaria-item-card';
            row.dataset.id = it.id;
            row.innerHTML =
                '<div class="avaria-item-nome">' + esc(it.nome || '') + '</div>' +
                '<div class="avaria-item-linha">Tipo: ' + esc(it.unidade || '—') + '</div>' +
                (it.codigo_barras ? '<div class="avaria-item-linha">Código de barras: ' + esc(it.codigo_barras) + '</div>' : '') +
                (it.sku ? '<div class="avaria-item-linha">SKU: ' + esc(it.sku) + '</div>' : '') +
                '<div class="avaria-item-qtd">Quantidade avariada: ' + (parseInt(it.quantidade,10)||0) + '</div>';
            if (!fechada) {
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => { mostrarCodigoBarras(it.codigo_barras); mostrarOpcaoExcluirItem(it.id, row); });
            } else {
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => mostrarCodigoBarras(it.codigo_barras));
            }
            lista.appendChild(row);
        });
    } catch (e) {
        lista.textContent = 'Erro: ' + e.message;
    }
}

function mostrarCodigoBarras(codigo) {
    const modal = document.getElementById('modal-barcode');
    const val = document.getElementById('barcode-value');
    const svg = document.getElementById('barcode-svg');
    if (!modal || !svg) return;
    const code = (codigo || '').trim();
    if (!code) { showToast('Item sem código de barras.'); return; }
    if (val) val.textContent = code;
    try {
        if (typeof JsBarcode !== 'undefined') {
            let format = 'CODE128';
            if (/^\d{13}$/.test(code)) format = 'EAN13';
            else if (/^\d{12}$/.test(code)) format = 'UPC';
            else if (/^\d{8}$/.test(code)) format = 'EAN8';
            JsBarcode(svg, code, { format, width: 2, height: 80, displayValue: true, margin: 10 });
        } else {
            svg.textContent = code;
        }
    } catch (e) {
        svg.textContent = code;
    }
    modal.classList.add('show');
}

function mostrarOpcaoExcluirItem(id, row) {
    if (avariaAtual && avariaAtual.fechada) return;
    // Remove botoes anteriores
    document.querySelectorAll('.avaria-del-btn').forEach(b => b.remove());
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avaria-del-btn btn-mini mini-excluir';
    btn.textContent = 'Excluir item';
    btn.style.marginTop = '6px';
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); excluirItemAvaria(id); });
    row.appendChild(btn);
    // Oculta apos alguns segundos
    setTimeout(() => { if (btn.parentNode) btn.remove(); }, 4000);
}

async function excluirItemAvaria(id) {
    if (avariaAtual && avariaAtual.fechada) { showToast('Avaria fechada. Não é possível excluir itens.'); return; }
    if (!podeAvaria() || !sbReady) return;
    if (!confirm('Excluir este item da avaria?')) return;
    try {
        const { error } = await sb.from('avaria_itens').delete().eq('id', id);
        if (error) throw error;
        await carregarItensAvaria();
        showToast('Item excluído.');
    } catch (e) {
        showToast('Erro ao excluir item: ' + e.message);
    }
}

async function adicionarItemAvaria() {
    if (!avariaAtual || !sbReady) { showToast('Abra uma avaria primeiro.'); return; }
    const codigo = (document.getElementById('av-item-codigo') || {}).value;
    const sku = (document.getElementById('av-item-sku') || {}).value;
    const nome = (document.getElementById('av-item-nome') || {}).value;
    const unidade = (document.getElementById('av-item-unidade') || {}).value;
    const conteudo = Number((document.getElementById('av-item-conteudo') || {}).value);
    const qtd = parseInt((document.getElementById('av-item-qtd') || {}).value, 10);
    if (avariaAtual && avariaAtual.fechada) { showToast('Avaria fechada. Não é possível adicionar itens.'); return; }
    if (!nome || !nome.trim() || !qtd || qtd < 1) { showToast('Preencha nome e quantidade.'); return; }
    try {
        const { error } = await sb.from('avaria_itens').insert({
            avaria_id: avariaAtual.id,
            codigo_barras: (codigo || '').trim() || null,
            sku: (sku || '').trim() || null,
            nome: nome.trim(),
            unidade,
            conteudo: Number.isFinite(conteudo) ? conteudo : null,
            quantidade: qtd
        });
        if (error) throw error;
        // limpa campos
        const c = document.getElementById('av-item-codigo'); if (c) c.value = '';
        const s = document.getElementById('av-item-sku'); if (s) s.value = '';
        const n = document.getElementById('av-item-nome'); if (n) n.value = '';
        const ct = document.getElementById('av-item-conteudo'); if (ct) ct.value = '';
        const q = document.getElementById('av-item-qtd'); if (q) q.value = '';
        await carregarItensAvaria();
        showToast('Item adicionado à avaria.');
    } catch (e) {
        showToast('Erro ao adicionar item: ' + e.message);
    }
}

async function preencherAvariaDoCatalogo(cb) {
    cb = (cb || '').trim();
    if (!cb || !sbReady) return;
    try {
        const { data } = await sb.from('produtos_base').select('*').eq('codigo_barras', cb).maybeSingle();
        if (data) {
            const nome = document.getElementById('av-item-nome');
            const unidade = document.getElementById('av-item-unidade');
            const conteudo = document.getElementById('av-item-conteudo');
            if (nome) nome.value = data.nome || '';
            if (unidade) unidade.value = data.unidade || 'litros';
            if (conteudo) conteudo.value = data.conteudo != null ? data.conteudo : '';
            showToast('Dados preenchidos do catálogo!');
            return;
        }
        const { data: p } = await sb.from('produtos').select('nome, unidade, conteudo').eq('codigo_barras', cb).maybeSingle();
        if (p) {
            const nome = document.getElementById('av-item-nome');
            const unidade = document.getElementById('av-item-unidade');
            const conteudo = document.getElementById('av-item-conteudo');
            if (nome) nome.value = p.nome || '';
            if (unidade) unidade.value = p.unidade || 'litros';
            if (conteudo) conteudo.value = p.conteudo != null ? p.conteudo : '';
        }
    } catch (e) { console.warn('Catalogo lookup:', e.message); }
}

async function abrirAvaria(id) {
    const a = avariasCache.find(x => x.id === id);
    if (!a) return;
    avariaAtual = a;
    abrirModalAvaria();
}

// ---------- BACKUP PRODUTOS BASE ----------
async function baixarBackupBase() {
    if (!sbReady) { showToast('Supabase não conectado.'); return; }
    try {
        const { data, error } = await sb.from('produtos_base').select('codigo_barras,nome,unidade,conteudo').order('nome');
        if (error) throw error;
        const blob = new Blob([JSON.stringify(data || [], null, 2)], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'backup-produtos-base.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const st = document.getElementById('backup-base-status');
        if (st) st.textContent = 'Backup baixado: ' + (data || []).length + ' itens.';
        showToast('Backup baixado com sucesso.');
    } catch (e) {
        showToast('Erro ao baixar backup: ' + e.message);
    }
}

async function restaurarBackupBase() {
    const input = document.getElementById('backup-base-file');
    const st = document.getElementById('backup-base-status');
    if (!input || !input.files || !input.files[0]) { showToast('Selecione um arquivo.'); return; }
    if (!sbReady) { showToast('Supabase não conectado.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!Array.isArray(parsed)) throw new Error('Arquivo inválido.');
            const rows = parsed.map(r => ({
                codigo_barras: String(r.codigo_barras || '').trim(),
                nome: String(r.nome || '').trim(),
                unidade: r.unidade || 'litros',
                conteudo: Number(r.conteudo) || 1
            })).filter(r => r.codigo_barras && r.nome);
            if (rows.length === 0) throw new Error('Nenhum item válido encontrado.');
            const { error } = await sb.from('produtos_base').upsert(rows, { onConflict: 'codigo_barras' });
            if (error) throw error;
            if (st) st.textContent = 'Restaurados: ' + rows.length + ' itens.';
            showToast('Backup restaurado: ' + rows.length + ' itens.');
        } catch (e) {
            if (st) st.textContent = 'Erro: ' + e.message;
            showToast('Erro ao restaurar: ' + e.message);
        }
    };
    reader.readAsText(input.files[0]);
}

function aplicarDataRapida(valor, campoData) {
    const v = String(valor || '').replace(/\D/g, '');
    if (!campoData) return;
    let iso = '';
    if (v.length === 6) {
        const dd = v.slice(0,2);
        const mm = v.slice(2,4);
        const yy = v.slice(4,6);
        const ano = (parseInt(yy,10) >= 70 ? '19' : '20') + yy;
        iso = ano + '-' + mm + '-' + dd;
    } else if (v.length === 8) {
        const dd = v.slice(0,2);
        const mm = v.slice(2,4);
        const yyyy = v.slice(4,8);
        iso = yyyy + '-' + mm + '-' + dd;
    }
    if (iso) {
        const d = new Date(iso + 'T00:00:00');
        if (!isNaN(d.getTime())) campoData.value = iso;
    }
}

function renderLista() {
    const termo = normNome(inputBusca.value);
    const filtrados = produtos.filter(p => {
        const barcodeMatch = (p.codigoBarras || '').toLowerCase().includes(termo) ||
            p.lotes.some(l => (l.codigoBarras || '').toLowerCase().includes(termo));
        if (termo && !normNome(p.nome).includes(termo) && !barcodeMatch) return false;
        const lotesAtivos = p.lotes.filter(l => (parseInt(l.quantidade, 10) || 0) > 0);
        if (lotesAtivos.length === 0) return false;
        // A lista passa a respeitar o prazo de alerta configurado (dias).
        return lotesAtivos.some(l => diasRestantes(l.vencimento) <= DIAS_ALERTA);
    });

    listaProdutos.innerHTML = '';
    if (filtrados.length === 0) { vazio.style.display = 'block'; return; }
    vazio.style.display = 'none';

    const ed = podeAtualizar();
    const ex = podeExcluirItem();

    filtrados.forEach(p => {
        const card = document.createElement('div');
        card.className = 'produto-card';

        const lotesAtivos = p.lotes.filter(l => (parseInt(l.quantidade,10)||0) > 0);
        const totalQtd = lotesAtivos.reduce((s, l) => s + (parseInt(l.quantidade, 10) || 0), 0);
        // Lote ativo mais proximo do vencimento determina a prioridade visual.
        const lotesOrd = [...lotesAtivos].sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
        const proximo = lotesOrd[0];
        const dProx = proximo ? diasRestantes(proximo.vencimento) : 0;
        const sProx = status(dProx);

        const resumo = document.createElement('div');
        resumo.className = 'produto-resumo';
        resumo.innerHTML =
            '<div class="nome">' + esc(p.nome) + '</div>' +
            '<div class="produto-info">' +
            '<span>Total: ' + totalQtd + ' un</span>' +
            (p.codigoBarras ? '<span>Cód: ' + esc(p.codigoBarras) + '</span>' : '') +
            (p.unidade ? '<span>Conteudo: ' + esc(p.conteudo) + ' ' + esc(p.unidade) + '</span>' : '') +
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

        lotesAtivos.forEach(l => {
            const d = diasRestantes(l.vencimento);
            const s = status(d);
            const item = document.createElement('div');
            item.className = 'lote-item';

            let dono = '<div class="lote-dono">👤 ' + esc(l.adicionado_por || '—') + ' · ' + fmtDataHora(l.created_at);
            if (l.atualizado_em) dono += ' · ✏️ atualizado por ' + esc(l.atualizado_por || '—') + ' em ' + fmtDataHora(l.atualizado_em);
            if (l.conferido_em) dono += ' · ✓ conferido por ' + esc(l.conferido_por || '—') + ' em ' + fmtDataHora(l.conferido_em);
            dono += '</div>';

            item.innerHTML =
                '<div class="lote-info">' +
                '<div class="lote-top"><span class="lote-qtd">' + (parseInt(l.quantidade, 10) || 0) + ' un</span>' +
                '<span class="status status-' + s.c + '">' + s.t + '</span></div>' +
                '<div class="meta"><span><strong>Vence:</strong> ' + fmtBR(l.vencimento) + '</span>' +
                '<span class="dias">' + txtDias(d) + '</span></div>' +
                (l.em_promocao ? '<div class="lote-dono"><strong>EM DESTAQUE PARA VENDA</strong>' + (l.promocao_motivo ? ' · ' + esc(l.promocao_motivo) : '') + '</div>' : '') +
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
                if (sessao && ['admin','gerente','funcionario'].includes(sessao.cargo) && (parseInt(l.quantidade,10)||0) > 0) {
                    if (d >= 0) {
                        const bVenda = document.createElement('button'); bVenda.type='button'; bVenda.className='btn-mini mini-editar'; bVenda.textContent='Registrar venda';
                        bVenda.addEventListener('click', ev => { ev.stopPropagation(); registrarSaida(l.id, 'venda'); }); acoes.appendChild(bVenda);
                    }
                    const bDesc = document.createElement('button'); bDesc.type='button'; bDesc.className='btn-mini mini-excluir'; bDesc.textContent='Descarte';
                    bDesc.addEventListener('click', ev => { ev.stopPropagation(); registrarSaida(l.id, 'descarte'); }); acoes.appendChild(bDesc);
                }
                if (podeGerirPromocoes()) {
                    const bPromo = document.createElement('button'); bPromo.type='button'; bPromo.className='btn-mini mini-editar'; bPromo.textContent=l.em_promocao?'Retirar destaque':'Destacar para venda';
                    bPromo.addEventListener('click', ev => { ev.stopPropagation(); alternarPromocao(l); }); acoes.appendChild(bPromo);
                }
                if (ex) {
                    const bEx = document.createElement('button');
                    bEx.type = 'button'; bEx.className = 'btn-mini mini-excluir'; bEx.textContent = 'Excluir lote';
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
    let tot = 0, prox = 0, venc = 0, promo = 0, estoque = 0, prox7 = 0, prox15 = 0;
    produtos.forEach(p => p.lotes.forEach(l => {
        const qtd = parseInt(l.quantidade,10) || 0;
        if (qtd <= 0) return;
        const d = diasRestantes(l.vencimento);
        // Mantem os cards coerentes com a lista filtrada por prazo de alerta.
        if (d > DIAS_ALERTA) return;
        tot++; estoque += qtd;
        if (l.em_promocao) promo++;
        if (d < 0) venc++; else { if (d <= DIAS_ALERTA) prox++; if (d <= 7) prox7++; if (d <= 15) prox15++; }
    }));
    statTotal.textContent = tot;
    statProximos.textContent = prox;
    statVencidos.textContent = venc;
    if (statPromocao) statPromocao.textContent = promo;
    if (statProx7) statProx7.textContent = prox7;
    if (statProx15) statProx15.textContent = prox15;
    if (statEstoque) statEstoque.textContent = estoque;
}

// ---------- INICIALIZAÇÃO POR SESSÃO ----------
async function iniciarApp() {
    aplicarPermissoes();
    await loadConfig();
    aplicarPermissoes();
    if (podeConfigurarDias()) salvarTzOffset();
    await loadProdutos();
    await loadAvisos();
    if (podeAvaria()) await loadAvarias();
    if (podeGerirFuncionarios()) await loadFuncionarios();
    atualizarUINotificacao();
    if (notifDisponivel() && Notification.permission === 'granted') ativarPush();
    verificarNotificacoes(false);
}

document.addEventListener('DOMContentLoaded', () => { try {
    initSupabase();

    // Restaura sessao autenticada no Supabase; localStorage nao define cargo nem permissao.
    (async () => {
      try {
        const { data: authState } = await sb.auth.getSession();
        const user = authState.session && authState.session.user;
        if (user) {
          const { data: perfil, error } = await sb.from('funcionarios').select('id,nome,login,cargo,ativo').eq('auth_user_id', user.id).maybeSingle();
          if (error) throw error;
          if (perfil && perfil.ativo) { sessao = { ...perfil, loginEm: new Date().toISOString() }; telaLogin.style.display = 'none'; await iniciarApp(); return; }
          await sb.auth.signOut();
        }
      } catch (err) { console.error('Restauracao de sessao:', err); }
      sessao = null; telaLogin.style.display = 'flex'; loginUsuario.focus();
    })();

    // Login
    formLogin.addEventListener('submit', entrar);

    // Cadastro de item
    formProduto.addEventListener('submit', async e => {
        e.preventDefault();
        const nome = document.getElementById('nome').value.trim();
        const unidade = document.getElementById('unidade').value;
        const conteudo = Number(document.getElementById('conteudo').value);
        const qtd = parseInt(document.getElementById('quantidade').value, 10);
        const cb = document.getElementById('codigoBarras').value.trim();
        const venc = document.getElementById('vencimento').value;
        if (!nome || !qtd || !venc || !unidade || !Number.isFinite(conteudo) || conteudo <= 0) { showToast('Preencha todos os campos corretamente.'); return; }
        if (cb && !codigoBarrasPadraoValido(cb)) { showToast('Código de barras com quantidade de caracteres fora do padrão.'); return; }
        await saveProduto(nome, unidade, conteudo, qtd, venc, cb);
        limparFormCadastro();
        if (modalCadastro) modalCadastro.classList.remove('show');
    });

    inputBusca.addEventListener('input', renderLista);

    // Data rápida (DDMMAA/DDMMAAAA) -> calendário
    const vencRapido = document.getElementById('vencimento-rapido');
    const vencData = document.getElementById('vencimento');
    if (vencRapido && vencData) {
        const handler = () => aplicarDataRapida(vencRapido.value, vencData);
        vencRapido.addEventListener('input', handler);
        vencRapido.addEventListener('blur', handler);
    }
    const editVencRapido = document.getElementById('edit-vencimento-rapido');
    const editVencData = document.getElementById('edit-vencimento');
    if (editVencRapido && editVencData) {
        const handler = () => aplicarDataRapida(editVencRapido.value, editVencData);
        editVencRapido.addEventListener('input', handler);
        editVencRapido.addEventListener('blur', handler);
    }

    // Gerenciamento generico do botao Voltar do mobile para modais
    (function setupModalHistory() {
        const modalStack = [];
        let closingFromBack = false;
        let cleaningHistory = false;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName !== 'class') return;
                const el = m.target;
                if (!el || !el.classList || !el.classList.contains('modal-overlay')) return;
                const nowShown = el.classList.contains('show');
                const wasShown = m.oldValue ? m.oldValue.split(' ').includes('show') : false;
                if (nowShown && !wasShown) {
                    if (!closingFromBack && !modalStack.includes(el.id)) {
                        modalStack.push(el.id);
                        try { history.pushState({ modal: el.id }, ''); } catch (e) {}
                    }
                } else if (!nowShown && wasShown) {
                    const idx = modalStack.lastIndexOf(el.id);
                    if (idx !== -1) modalStack.splice(idx, 1);
                    if (!closingFromBack && !cleaningHistory) {
                        cleaningHistory = true;
                        try { history.back(); } catch (e) {}
                        setTimeout(() => { cleaningHistory = false; }, 0);
                    }
                }
            });
        });
        document.querySelectorAll('.modal-overlay').forEach(el => {
            if (el.id === 'modal-scan') return; // scanner nao participa do historico
            observer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
        });
        window.addEventListener('popstate', () => {
            if (cleaningHistory) { cleaningHistory = false; return; }
            if (modalStack.length > 0) {
                closingFromBack = true;
                const id = modalStack.pop();
                const el = document.getElementById(id);
                if (el) el.classList.remove('show');
                closingFromBack = false;
            }
        });
    })();

    // Cadastrar item base
    const menuProdutoBase = document.getElementById('menu-produto-base');
    const modalProdutoBase = document.getElementById('modal-produto-base');
    if (menuProdutoBase) menuProdutoBase.addEventListener('click', e => { e.preventDefault(); fecharMenu(); if (modalProdutoBase) modalProdutoBase.classList.add('show'); });
    if (modalProdutoBase) modalProdutoBase.addEventListener('click', e => { if (e.target === modalProdutoBase) modalProdutoBase.classList.remove('show'); });
    const formProdutoBase = document.getElementById('formProdutoBase');
    if (formProdutoBase) formProdutoBase.addEventListener('submit', saveProdutoBase);

    // Avisos
    const menuAvisos = document.getElementById('menu-avisos');
    if (menuAvisos) menuAvisos.addEventListener('click', e => { e.preventDefault(); fecharMenu(); if (modalAvisos) { modalAvisos.classList.add('show'); loadAvisos(); } });

    const menuBackupBase = document.getElementById('menu-backup-base');
    const modalBackupBase = document.getElementById('modal-backup-base');
    if (menuBackupBase) menuBackupBase.addEventListener('click', e => { e.preventDefault(); fecharMenu(); if (modalBackupBase) modalBackupBase.classList.add('show'); });
    if (modalBackupBase) modalBackupBase.addEventListener('click', e => { if (e.target === modalBackupBase) modalBackupBase.classList.remove('show'); });
    const btnBaixarBackup = document.getElementById('btn-baixar-backup-base');
    if (btnBaixarBackup) btnBaixarBackup.addEventListener('click', baixarBackupBase);
    const btnRestaurarBackup = document.getElementById('btn-restaurar-backup-base');
    if (btnRestaurarBackup) btnRestaurarBackup.addEventListener('click', restaurarBackupBase);
    const menuAvarias = document.getElementById('menu-avarias');
    if (menuAvarias) menuAvarias.addEventListener('click', e => { e.preventDefault(); fecharMenu(); loadAvarias(); const c = document.getElementById('avarias-container'); if (c) c.scrollIntoView({ behavior: 'smooth' }); });
    const modalAvisos = document.getElementById('modal-avisos');
    if (modalAvisos) modalAvisos.addEventListener('click', e => { if (e.target === modalAvisos) modalAvisos.classList.remove('show'); });
    const btnSalvarAviso = document.getElementById('btn-salvar-aviso');
    if (btnSalvarAviso) btnSalvarAviso.addEventListener('click', saveAviso);

    // Menu Usuário
    const menuUsuario = document.getElementById('menu-usuario');
    if (menuUsuario) menuUsuario.addEventListener('click', e => { e.preventDefault(); fecharMenu(); abrirModalUsuario(); });
    const formUsuario = document.getElementById('formUsuario');
    if (formUsuario) formUsuario.addEventListener('submit', salvarUsuario);
    const modalUsuarioEl = document.getElementById('modal-usuario');
    if (modalUsuarioEl) modalUsuarioEl.addEventListener('click', e => { if (e.target === modalUsuarioEl) modalUsuarioEl.classList.remove('show'); });

    // Versão do último deploy
    fetch('api/version').then(r => r.json()).then(d => {
        const el = document.getElementById('app-version');
        if (el && d && d.sha) el.textContent = 'Último deploy: ' + d.sha;
    }).catch(() => {});

    // Prazo de alerta (somente admin altera → vale para todos)
    if (diasAlertaInput) {
        diasAlertaInput.addEventListener('change', () => {
            if (!podeConfigurarDias()) { showToast('Somente o administrador altera esta configuração.'); loadConfig(); aplicarPermissoes(); return; }
            const v = parseInt(diasAlertaInput.value, 10) || 1;
            DIAS_ALERTA = v;
            localStorage.setItem(DIAS_KEY, DIAS_ALERTA);
            if (diasAlertaLabel) diasAlertaLabel.textContent = DIAS_ALERTA;
            renderLista();
            renderStats();
            salvarConfigDias(v);
            verificarNotificacoes(true);
        });
    }

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
    setInterval(() => { if (sessao) loadProdutos().then(() => verificarNotificacoes(false)); }, 86400000);

    const fab = document.getElementById('fab-cadastrar');
    if (fab) fab.addEventListener('click', () => { limparFormCadastro(); if (modalCadastro) modalCadastro.classList.add('show'); });
    const fabBase = document.getElementById('fab-produto-base');
    if (fabBase) fabBase.addEventListener('click', () => { const m = document.getElementById('modal-produto-base'); if (m) m.classList.add('show'); });
    const fabAvaria = document.getElementById('fab-avaria');
    if (fabAvaria) fabAvaria.addEventListener('click', () => { abrirNovaAvaria(); });

    // Avarias modal
    const modalAvaria = document.getElementById('modal-avaria');
    if (modalAvaria) modalAvaria.addEventListener('click', e => { if (e.target === modalAvaria) fecharModalAvaria(); });
    const btnScanAvaria = document.getElementById('btn-scan-avaria');
    if (btnScanAvaria) btnScanAvaria.addEventListener('click', () => {
        pararScan();
        scanTargetInput = document.getElementById('av-item-codigo');
        if (modalScan && !modalScan.classList.contains('show')) modalScan.classList.add('show');
        iniciarScan();
    });
    const avCodigo = document.getElementById('av-item-codigo');
    if (avCodigo) {
        avCodigo.addEventListener('change', () => { preencherAvariaDoCatalogo(avCodigo.value); alertarCodigoBarrasInvalido(avCodigo); });
        avCodigo.addEventListener('blur', () => { preencherAvariaDoCatalogo(avCodigo.value); alertarCodigoBarrasInvalido(avCodigo); });
    }
    const btnAddAvariaItem = document.getElementById('btn-add-avaria-item');
    if (btnAddAvariaItem) btnAddAvariaItem.addEventListener('click', adicionarItemAvaria);
    const btnFecharAvaria = document.getElementById('btn-fechar-avaria');
    if (btnFecharAvaria) btnFecharAvaria.addEventListener('click', fecharAvaria);
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.getElementById('install-bar').classList.add('show'); });
    document.getElementById('btnInstall').addEventListener('click', async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('install-bar').classList.remove('show'); } });
    document.getElementById('btnCloseInstall').addEventListener('click', () => document.getElementById('install-bar').classList.remove('show'));

    // ===== NAVBAR / MENU =====
    function abrirMenu() { if (menuOverlay) menuOverlay.classList.add('show'); }
    function fecharMenu() { if (menuOverlay) menuOverlay.classList.remove('show'); }
    if (btnMenu) {
        btnMenu.onclick = function(e) { e.preventDefault(); abrirMenu(); };
        btnMenu.addEventListener('click', abrirMenu);
    }

    // Abre o drawer arrastando da lateral esquerda (touch); fecha deslizando à esquerda
    (function gestureDrawer() {
        let startX = 0, startY = 0, tracking = false, swiping = false;
        const EDGE = 28;      // borda esquerda em px
        const THRESHOLD = 60; // arrasto mínimo para abrir
        document.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const menuAberto = menuOverlay && menuOverlay.classList.contains('show');
            if (!menuAberto && t.clientX <= EDGE) { tracking = true; swiping = false; startX = t.clientX; startY = t.clientY; }
            else if (menuAberto) { tracking = true; swiping = false; startX = t.clientX; startY = t.clientY; }
        }, { passive: true });
        document.addEventListener('touchmove', e => {
            if (!tracking) return;
            const t = e.touches[0];
            const dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
            if (!swiping && Math.abs(dx) > THRESHOLD && dy < Math.abs(dx) * 0.6) swiping = true;
            if (swiping) {
                if (dx > THRESHOLD && !(menuOverlay && menuOverlay.classList.contains('show'))) { abrirMenu(); tracking = false; }
                else if (dx < -THRESHOLD && menuOverlay && menuOverlay.classList.contains('show') && startX > 120) { fecharMenu(); tracking = false; }
            }
        }, { passive: true });
        document.addEventListener('touchend', () => { tracking = false; swiping = false; }, { passive: true });
    })();

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
    const menuHistorico = document.getElementById('menu-historico');
    if (menuHistorico) menuHistorico.addEventListener('click', e => { e.preventDefault(); fecharMenu(); abrirHistorico(); });
    const btnExportarRelatorio = document.getElementById('btn-exportar-relatorio');
    if (btnExportarRelatorio) btnExportarRelatorio.addEventListener('click', exportarRelatorio);
    const btnLimparHistorico = document.getElementById('btn-limpar-historico');
    if (btnLimparHistorico) btnLimparHistorico.addEventListener('click', limparHistorico);
    if (menuSair) menuSair.addEventListener('click', e => { e.preventDefault(); fecharMenu(); sair(); });

    // Código de barras: lookup ao sair do campo
    if (codigoBarrasInput) {
        codigoBarrasInput.addEventListener('change', () => { preencherDoCatalogo(codigoBarrasInput.value); alertarCodigoBarrasInvalido(codigoBarrasInput); });
        codigoBarrasInput.addEventListener('blur', () => { preencherDoCatalogo(codigoBarrasInput.value); alertarCodigoBarrasInvalido(codigoBarrasInput); });
    }
    const pbCodigo = document.getElementById('pb-codigo');
    if (pbCodigo) {
        pbCodigo.addEventListener('change', () => alertarCodigoBarrasInvalido(pbCodigo));
        pbCodigo.addEventListener('blur', () => alertarCodigoBarrasInvalido(pbCodigo));
    }
    if (btnScan) btnScan.addEventListener('click', () => { pararScan(); scanTargetInput = codigoBarrasInput; if (modalScan && !modalScan.classList.contains('show')) modalScan.classList.add('show'); iniciarScan(); });
    const btnScanBase = document.getElementById('btn-scan-base');
    if (btnScanBase) btnScanBase.addEventListener('click', () => { scanTargetInput = document.getElementById('pb-codigo'); if (modalScan) modalScan.classList.add('show'); iniciarScan(); });
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
            if (modalUsuario && modalUsuario.classList.contains('show')) modalUsuario.classList.remove('show');

            fecharMenu();
        }
    });

  } catch (err) { console.error('Erro na inicializacao:', err); showToast('Erro na pagina: ' + err.message); }
});
