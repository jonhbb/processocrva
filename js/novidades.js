// Sino de novidades (todos os usuários) e publicação de novidades (programador)
import { supabase } from './supabase.js';
import { esc, mostrarToast, mostrarMensagem, confirmar, comBotaoOcupado } from './ui.js';
import { obterUsuarioLogado } from './sessao.js';
import { buscarLembretesDoDia, concluirLembrete } from './anotacoes.js';

const TIPOS = {
    novidade: { rotulo: 'Novidade', icone: 'fa-star', cor: 'primary' },
    aviso: { rotulo: 'Aviso', icone: 'fa-bullhorn', cor: 'warning' },
    importante: { rotulo: 'Importante', icone: 'fa-exclamation-triangle', cor: 'danger' }
};

const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

let itens = [];
let lembretes = [];
let lidas = new Set();
let falhaCarregamento = false;
let expandidoId = null;

function tipoDe(item) {
    return TIPOS[item.tipo] || TIPOS.novidade;
}

function quandoTexto(iso) {
    const data = new Date(iso);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dia = new Date(data);
    dia.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje - dia) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 7) return `há ${dias} dias`;
    return data.toLocaleDateString('pt-BR');
}

function usuarioId() {
    const usuario = obterUsuarioLogado();
    return usuario ? usuario.id : null;
}

// ---------- Sino ----------

async function carregar() {
    const id = usuarioId();
    if (id === null) return;

    const agora = new Date().toISOString();
    const [novidades, leituras] = await Promise.all([
        supabase.from('novidades').select('*')
            .or(`expira_em.is.null,expira_em.gt.${agora}`)
            .order('publicada_em', { ascending: false })
            .limit(30),
        supabase.from('novidades_lidas').select('novidade_id').eq('usuario_id', id)
    ]);

    if (novidades.error || leituras.error) {
        console.warn('Novidades indisponíveis:', novidades.error || leituras.error);
        falhaCarregamento = true;
        return;
    }

    falhaCarregamento = false;
    itens = novidades.data || [];
    lidas = new Set((leituras.data || []).map(l => l.novidade_id));
}

// Lembretes de retorno que venceram ou vencem hoje (falha silenciosa se a tabela ainda não existe)
async function carregarLembretes() {
    try {
        lembretes = await buscarLembretesDoDia();
    } catch (error) {
        lembretes = [];
    }
}

function naoLidas() {
    return itens.filter(item => !lidas.has(item.id));
}

function renderizarSino() {
    const pendentes = naoLidas();
    const total = pendentes.length + lembretes.length;
    const contagem = document.getElementById('sinoContagem');
    contagem.textContent = total > 99 ? '99+' : String(total);
    contagem.classList.toggle('d-none', total === 0);

    const botao = document.getElementById('btnSino');
    const temImportante = pendentes.some(item => item.tipo === 'importante') || lembretes.some(l => l.atraso > 0);
    botao.classList.toggle('sino-importante', temImportante);
    const rotulo = total > 0 ? `Novidades e lembretes: ${total} pendente(s)` : 'Novidades';
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;

    document.getElementById('btnMarcarTodasLidas').classList.toggle('d-none', pendentes.length === 0);

    const lista = document.getElementById('listaNovidades');
    lista.innerHTML = '';

    lembretes.forEach(lembrete => {
        const situacao = lembrete.atraso > 0 ? `vencido há ${lembrete.atraso} dia(s)` : 'para hoje';
        const elemento = document.createElement('div');
        elemento.className = 'novidade-item nao-lida';
        elemento.dataset.lembrete = lembrete.id;
        elemento.dataset.processo = lembrete.processo_id;
        elemento.setAttribute('role', 'listitem');
        elemento.innerHTML = `
            <span class="novidade-icone bg-${lembrete.atraso > 0 ? 'danger' : 'primary'}"><i class="fas fa-calendar-check"></i></span>
            <div class="novidade-corpo">
                <div class="novidade-titulo">Lembrete: ${esc(lembrete.texto) || 'retornar'}</div>
                <div class="novidade-rodape small text-muted">Processo ${esc(lembrete.numero) || '(sem número)'} - ${esc(lembrete.requerente)} · ${esc(situacao)}</div>
                <div class="mt-1 d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-acao="abrir-processo">Abrir</button>
                    <button type="button" class="btn btn-sm btn-outline-success" data-acao="concluir-lembrete">Concluir</button>
                </div>
            </div>`;
        lista.appendChild(elemento);
    });

    if (falhaCarregamento && lembretes.length > 0) return;
    if (falhaCarregamento) {
        lista.innerHTML = '<div class="p-3 text-muted small">Não foi possível carregar as novidades agora. Tente novamente mais tarde.</div>';
        return;
    }
    if (itens.length === 0 && lembretes.length === 0) {
        lista.innerHTML = '<div class="p-4 text-center text-muted"><i class="fas fa-bell-slash fa-2x mb-2"></i><p class="mb-0">Nenhuma novidade por enquanto.</p></div>';
        return;
    }

    itens.forEach(item => {
        const tipo = tipoDe(item);
        const lida = lidas.has(item.id);
        const aberto = expandidoId === item.id;
        const elemento = document.createElement('div');
        elemento.className = `novidade-item${lida ? '' : ' nao-lida'}${aberto ? ' aberta' : ''}`;
        elemento.dataset.id = item.id;
        elemento.setAttribute('role', 'listitem');
        elemento.innerHTML = `
            <span class="novidade-icone bg-${tipo.cor}"><i class="fas ${tipo.icone}"></i></span>
            <div class="novidade-corpo">
                <button type="button" class="novidade-titulo" data-acao="abrir" aria-expanded="${aberto}">
                    <span>${esc(item.titulo)}</span>
                    ${item.tipo === 'importante' ? '<span class="badge bg-danger ms-1">Importante</span>' : ''}
                    ${lida ? '' : '<span class="visually-hidden">(não lida)</span>'}
                </button>
                <div class="novidade-texto">${esc(item.texto)}</div>
                <div class="novidade-rodape small text-muted">${esc(quandoTexto(item.publicada_em))}${item.autor && item.autor !== 'Sistema' ? ` · ${esc(item.autor)}` : ''}</div>
            </div>
            ${lida ? '' : '<button type="button" class="btn btn-sm btn-outline-secondary novidade-lida" data-acao="lida" aria-label="Marcar como lida" title="Marcar como lida"><i class="fas fa-check"></i></button>'}
        `;
        lista.appendChild(elemento);
    });
}

async function marcarLidas(ids) {
    const id = usuarioId();
    const novos = ids.filter(n => !lidas.has(n));
    if (novos.length === 0 || id === null) return;

    novos.forEach(n => lidas.add(n));
    renderizarSino();

    const { error } = await supabase
        .from('novidades_lidas')
        .upsert(novos.map(n => ({ novidade_id: n, usuario_id: id })), { onConflict: 'novidade_id,usuario_id' });

    if (error) {
        novos.forEach(n => lidas.delete(n));
        renderizarSino();
        mostrarToast('Não foi possível marcar como lida. Tente novamente.', 'warning');
    }
}

async function atualizarSino() {
    try {
        await carregar();
    } catch (error) {
        falhaCarregamento = true;
    }
    await carregarLembretes();
    renderizarSino();
}

export function iniciarSino() {
    const painel = document.getElementById('listaNovidades');

    new bootstrap.Dropdown(document.getElementById('btnSino'), {
        autoClose: 'outside',
        popperConfig: cfg => ({ ...cfg, strategy: 'fixed' })
    });

    painel.addEventListener('click', async (e) => {
        const alvo = e.target.closest('[data-acao]');
        if (!alvo) return;
        const linha = alvo.closest('.novidade-item');

        if (linha.dataset.lembrete) {
            if (alvo.dataset.acao === 'abrir-processo') {
                bootstrap.Dropdown.getInstance(document.getElementById('btnSino')).hide();
                window.abrirModalEditar(Number(linha.dataset.processo));
            } else if (alvo.dataset.acao === 'concluir-lembrete') {
                await concluirLembrete(Number(linha.dataset.lembrete));
            }
            return;
        }

        const id = Number(linha.dataset.id);

        if (alvo.dataset.acao === 'lida') {
            marcarLidas([id]);
        } else if (alvo.dataset.acao === 'abrir') {
            expandidoId = expandidoId === id ? null : id;
            if (expandidoId !== null) marcarLidas([id]);
            renderizarSino();
        }
    });

    document.getElementById('btnMarcarTodasLidas').addEventListener('click', () => {
        marcarLidas(naoLidas().map(item => item.id));
    });

    window.addEventListener('lembretes-alterados', atualizarSino);
    atualizarSino();
    setInterval(atualizarSino, INTERVALO_ATUALIZACAO_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) atualizarSino();
    });
}

// ---------- Gestão (programador) ----------

let editandoId = null;
let gestaoIniciada = false;

function limparFormularioNovidade() {
    editandoId = null;
    document.getElementById('formNovidade').reset();
    document.getElementById('btnPublicarNovidade').textContent = 'Publicar';
    document.getElementById('btnCancelarEdicaoNovidade').classList.add('d-none');
}

function expiracaoParaData(iso) {
    return iso ? new Date(iso).toLocaleDateString('pt-BR') : 'Não expira';
}

async function listarGestao() {
    const corpo = document.getElementById('tabelaNovidadesAdmin');
    const [novidades, leituras] = await Promise.all([
        supabase.from('novidades').select('*').order('publicada_em', { ascending: false }),
        supabase.from('novidades_lidas').select('novidade_id')
    ]);

    if (novidades.error || leituras.error) {
        corpo.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Tabelas de novidades não encontradas. Rode o script perfis_e_novidades.sql no Supabase.</td></tr>';
        return;
    }

    const contagem = {};
    (leituras.data || []).forEach(l => { contagem[l.novidade_id] = (contagem[l.novidade_id] || 0) + 1; });

    corpo.innerHTML = '';
    if (novidades.data.length === 0) {
        corpo.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nenhuma novidade publicada.</td></tr>';
        return;
    }

    novidades.data.forEach(item => {
        const tipo = tipoDe(item);
        const expirada = item.expira_em && new Date(item.expira_em) < new Date();
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.innerHTML = `
            <td data-label="Título"><strong>${esc(item.titulo)}</strong>${expirada ? ' <span class="badge bg-secondary">expirada</span>' : ''}</td>
            <td data-label="Tipo"><span class="badge bg-${tipo.cor}">${esc(tipo.rotulo)}</span></td>
            <td data-label="Publicada">${esc(new Date(item.publicada_em).toLocaleDateString('pt-BR'))}<br><small class="text-muted">${esc(expiracaoParaData(item.expira_em))}</small></td>
            <td data-label="Leituras">${contagem[item.id] || 0}</td>
            <td data-label="Ações">
                <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar"><i class="fas fa-edit"></i> Editar</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir"><i class="fas fa-trash"></i></button>
            </td>`;
        tr._item = item;
        corpo.appendChild(tr);
    });
}

async function salvarNovidade() {
    const titulo = document.getElementById('novTitulo').value.trim();
    const texto = document.getElementById('novTexto').value.trim();
    const tipo = document.getElementById('novTipo').value;
    const expira = document.getElementById('novExpira').value;

    if (!titulo || !texto) {
        mostrarMensagem('Informe o título e o texto da novidade.', 'warning');
        return;
    }

    const registro = {
        titulo,
        texto,
        tipo,
        expira_em: expira ? new Date(`${expira}T23:59:59`).toISOString() : null
    };

    const consulta = editandoId === null
        ? supabase.from('novidades').insert([{ ...registro, autor: (obterUsuarioLogado() || {}).nome || 'Programador' }])
        : supabase.from('novidades').update(registro).eq('id', editandoId);
    const { error } = await consulta;

    if (error) {
        mostrarMensagem('Não foi possível salvar a novidade: ' + error.message, 'danger', { tentarNovamente: salvarNovidade });
        return;
    }

    mostrarMensagem(editandoId === null ? 'Novidade publicada!' : 'Novidade atualizada!', 'success');
    limparFormularioNovidade();
    await listarGestao();
    atualizarSino();
}

export function iniciarGestaoNovidades() {
    if (gestaoIniciada) {
        listarGestao();
        return;
    }
    gestaoIniciada = true;

    document.getElementById('formNovidade').addEventListener('submit', (e) => {
        e.preventDefault();
        comBotaoOcupado(document.getElementById('btnPublicarNovidade'), 'Salvando...', salvarNovidade);
    });
    document.getElementById('btnCancelarEdicaoNovidade').addEventListener('click', limparFormularioNovidade);

    document.getElementById('tabelaNovidadesAdmin').addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        const item = botao.closest('tr')._item;

        if (botao.dataset.acao === 'editar') {
            editandoId = item.id;
            document.getElementById('novTitulo').value = item.titulo;
            document.getElementById('novTexto').value = item.texto;
            document.getElementById('novTipo').value = item.tipo;
            document.getElementById('novExpira').value = item.expira_em ? new Date(item.expira_em).toLocaleDateString('en-CA') : '';
            document.getElementById('btnPublicarNovidade').textContent = 'Salvar alterações';
            document.getElementById('btnCancelarEdicaoNovidade').classList.remove('d-none');
            document.getElementById('novTitulo').focus();
        } else if (botao.dataset.acao === 'excluir') {
            const confirmado = await confirmar({
                titulo: 'Excluir novidade',
                mensagem: `Excluir "${item.titulo}"? Ela some do sino de todos os usuários.`,
                textoConfirmar: 'Excluir',
                perigo: true
            });
            if (!confirmado) return;
            const { error } = await supabase.from('novidades').delete().eq('id', item.id);
            if (error) {
                mostrarMensagem('Não foi possível excluir: ' + error.message, 'danger');
                return;
            }
            if (editandoId === item.id) limparFormularioNovidade();
            mostrarMensagem('Novidade excluída.', 'success');
            await listarGestao();
            atualizarSino();
        }
    });

    listarGestao();
}
