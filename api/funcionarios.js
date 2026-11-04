const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || 'https://izfonjoluifotwxzleix.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
const EMAIL_DOMAIN = 'mercadinhobelo.com';
const emailFor = (login) => `${String(login).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!admin) return res.status(503).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sessao ausente.' });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return res.status(401).json({ error: 'Sessao invalida.' });
    const { data: actor, error: actorError } = await admin.from('funcionarios')
      .select('id,nome,cargo,ativo').eq('auth_user_id', authData.user.id).maybeSingle();
    if (actorError || !actor || !actor.ativo || actor.cargo !== 'admin') return res.status(403).json({ error: 'Somente administrador pode gerenciar funcionarios.' });

    if (req.method === 'GET') {
      const { data, error } = await admin.from('funcionarios')
        .select('id,nome,login,cargo,ativo,created_at,ultimo_acesso,auth_user_id').order('nome');
      if (error) throw error;
      return res.status(200).json({ funcionarios: (data || []).map(f => ({ ...f, acesso_configurado: !!f.auth_user_id })) });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const nome = String(body.nome || '').trim();
    const login = String(body.login || '').trim().toLowerCase();
    const cargo = String(body.cargo || 'funcionario');
    if (req.method === 'POST') {
      const senha = String(body.senha || '');
      if (!nome || !/^[a-z0-9._-]{3,32}$/.test(login) || senha.length < 8) {
        return res.status(400).json({ error: 'Informe nome, login (3-32 caracteres: letras, numeros, ponto, _ ou -) e senha com pelo menos 8 caracteres.' });
      }
      if (!['funcionario', 'gerente', 'patrao', 'admin', 'avaria'].includes(cargo)) return res.status(400).json({ error: 'Cargo invalido.' });
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: emailFor(login), password: senha, email_confirm: true,
        user_metadata: { nome, login }
      });
      if (createError) throw createError;
      const { data: profile, error: profileError } = await admin.from('funcionarios').insert({
        nome, login, cargo, ativo: true, auth_user_id: created.user.id
      }).select('id,nome,login,cargo,ativo,created_at').single();
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return res.status(201).json({ funcionario: profile });
    }

    const id = String(body.id || '');
    if (!id) return res.status(400).json({ error: 'ID do funcionario obrigatorio.' });
    const { data: target, error: targetError } = await admin.from('funcionarios')
      .select('id,auth_user_id,login,cargo,ativo').eq('id', id).maybeSingle();
    if (targetError || !target) return res.status(404).json({ error: 'Funcionario nao encontrado.' });
    if (target.id === actor.id && req.method === 'DELETE') return res.status(400).json({ error: 'Voce nao pode desativar sua propria conta.' });

    if (req.method === 'PATCH') {
      if (body.active === true) {
        if (!target.auth_user_id) return res.status(400).json({ error:'Cadastro antigo sem conta de acesso. Edite o funcionario e defina uma nova senha primeiro.' });
        const { data, error } = await admin.from('funcionarios').update({ ativo:true, atualizado_em:new Date().toISOString() }).eq('id',id).select('id,nome,login,cargo,ativo,created_at').single();
        if (error) throw error;
        return res.status(200).json({ funcionario:data });
      }
      if (!nome || !['funcionario', 'gerente', 'patrao', 'admin', 'avaria'].includes(cargo)) return res.status(400).json({ error: 'Nome ou cargo invalido.' });
      if (target.cargo === 'admin' && cargo !== 'admin') {
        const { count, error: countError } = await admin.from('funcionarios').select('id',{count:'exact',head:true}).eq('cargo','admin').eq('ativo',true);
        if (countError) throw countError;
        if (count <= 1) return res.status(400).json({ error:'Mantenha pelo menos um administrador ativo.' });
      }
      const patch = { nome, cargo, atualizado_em: new Date().toISOString() };
      const senha = String(body.senha || '');
      if (senha && senha.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
      let createdAuthUserId = null;
      if (!target.auth_user_id) {
        if (senha.length < 8) return res.status(400).json({ error: 'Este cadastro antigo ainda nao tem acesso seguro. Informe uma nova senha com pelo menos 8 caracteres para ativar o login.' });
        const { data: created, error: createError } = await admin.auth.admin.createUser({ email:emailFor(target.login), password:senha, email_confirm:true, user_metadata:{ nome, login:target.login } });
        if (createError) throw createError;
        createdAuthUserId = created.user.id; patch.auth_user_id = createdAuthUserId; patch.ativo = true;
      } else if (senha) {
        const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: senha });
        if (error) throw error;
      }
      const { data, error } = await admin.from('funcionarios').update(patch).eq('id', id)
        .select('id,nome,login,cargo,ativo,created_at').single();
      if (error) { if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId); throw error; }
      return res.status(200).json({ funcionario: data });
    }

    if (req.method === 'DELETE') {
      const { count, error: countError } = await admin.from('funcionarios')
        .select('id', { count: 'exact', head: true }).eq('cargo', 'admin').eq('ativo', true);
      if (countError) throw countError;
      if (target.cargo === 'admin' && count <= 1) return res.status(400).json({ error: 'Mantenha pelo menos um administrador ativo.' });
      const { error } = await admin.from('funcionarios').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    console.error('API funcionarios:', error);
    return res.status(400).json({ error: error.message || 'Falha ao gerenciar funcionario.' });
  }
};
