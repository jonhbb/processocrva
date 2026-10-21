// Painel do processo: anotações, lembretes de retorno e processos relacionados.
// Também fornece os lembretes do dia para o dashboard ("Para hoje") e para o sino.
import { supabase } from './supabase.js';
import { esc, mostrarMensagem, mostrarToast, confirmar, comBotaoOcupado, normalizar } from './ui.js';
import { obterUsuarioLogado, ehAdministrador } from './sessao.js';

const AVISO_SEM_TABELAS = 'Recurso indisponível: o script anotacoes_e_lembretes.sql ainda não foi executado no banco.';

let processoAtual = null;
let abrirProcesso = () => {};
let obterTodos = async () => [];

function usuario() {
    return obterUsuarioLogado() || {};
}

function dataISO(data) {
    const pad = n => String(n).padStart(2, '0');
    return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

function hojeISO() {
    return dataISO(new Date());
}

function somarDias(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return dataISO(data);
}

function dataBR(iso) {
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

// Dias entre a data e hoje (positivo = data já passou)
function diasDeAtraso(iso) {
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((hoje - new Date(a, m - 1, d)) / 86400000);
}

function situacaoLembrete(iso) {
    const atraso = diasDeAtraso(iso);
    if (atraso > 0) return { classe: 'vencido', rotulo: `vencido há ${atraso} dia(s)`, cor: 'danger' };
    if (atraso === 0) return { classe: 'hoje', rotulo: 'hoje', cor: 'primary' };
    return { classe: '', rotulo: `em ${-atraso} dia(s)`, cor: 'secondary' };
}

function avisar(id, mostrar) {
    const el = document.getElementById(id);
    el.textContent = mostrar ? AVISO_SEM_TABELAS : '';
    el.classList.toggle('d-none', !mostrar);
}

function definirContagem(id, quantidade, destacar = false) {
    const el = document.getElementById(id);
    el.textContent = quantidade;
    el.className = `badge ${destacar && quantidade > 0 ? 'bg-warning text-dark' : 'bg-secondary'}`;
}

// ---------- Anotações ----------

export async function buscarAnotacoes(processoId) {
    const { data, error } = await supabase
        .from('anotacoes')
        .select('*')
        .eq('processo_id', processoId)
        .order('criada_em', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function carregarAnotacoes() {
    const id = processoAtual.id;
    const lista = document.getElementById('listaAnotacoes');
    let itens = [];
    try {
        itens = await buscarAnotacoes(id);
        avisar('anotacoesAviso', false);
    } catch (error) {
        avisar('anotacoesAviso', true);
    }
    if (!processoAtual || processoAtual.id !== id) return;

    definirContagem('contAnotacoes', itens.length);
    lista.innerHTML = '';
    if (itens.length === 0) {
        lista.innerHTML = '<div class="text-muted small">Nenhuma anotação ainda.</div>';
        return;
    }

    const eu = usuario();
    itens.forEach(item => {
        const pode = item.usuario_id === eu.id || ehAdministrador(eu);
        const el = document.createElement('div');
        el.className = 'item-anotacao';
        el.dataset.id = item.id;
        el.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="small text-muted">${esc(item.autor || 'Sistema')} · ${esc(new Date(item.criada_em).toLocaleString('pt-BR'))}</div>
                ${pode ? '<button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir-anotacao" aria-label="Excluir anotação" title="Excluir anotação"><i class="fas fa-trash"></i></button>' : ''}
            </div>
            <div class="anotacao-texto">${esc(item.texto)}</div>`;
        lista.appendChild(el);
    });
}

async function adicionarAnotacao() {
    const campo = document.getElementById('novaAnotacao');
    const texto = campo.value.trim();
    if (!texto) return;

    const eu = usuario();
    const { error } = await supabase.from('anotacoes').insert([{
        processo_id: processoAtual.id,
        texto,
        autor: eu.nome || 'Sistema',
        usuario_id: eu.id
    }]);

    if (error) {
        mostrarMensagem('Não foi possível salvar a anotação: ' + error.message, 'danger', { tentarNovamente: adicionarAnotacao });
        return;
    }
    campo.value = '';
    mostrarToast('Anotação adicionada.', 'success');
    carregarAnotacoes();
}

// ---------- Lembretes ----------

export async function concluirLembrete(id) {
    const { error } = await supabase
        .from('lembretes')
        .update({ concluido: true, concluido_em: new Date().toISOString() })
        .eq('id', id);
    if (error) {
        mostrarMensagem('Não foi possível concluir o lembrete: ' + error.message, 'danger');
        return false;
    }
    window.dispatchEvent(new Event('lembretes-alterados'));
    return true;
}

async function carregarLembretes() {
    const id = processoAtual.id;
    const lista = document.getElementById('listaLembretes');
    let itens = [];
    try {
        const { data, error } = await supabase
            .from('lembretes')
            .select('*')
            .eq('processo_id', id)
            .eq('usuario_id', usuario().id)
            .order('data_lembrete', { ascending: true });
        if (error) throw error;
        itens = data || [];
        avisar('lembretesAviso', false);
    } catch (error) {
        avisar('lembretesAviso', true);
    }
    if (!processoAtual || processoAtual.id !== id) return;

    const pendentes = itens.filter(l => !l.concluido);
    const feitos = itens.filter(l => l.concluido).slice(-5);
    definirContagem('contLembretes', pendentes.length);
    lista.innerHTML = '';

    if (itens.length === 0) {
        lista.innerHTML = '<div class="text-muted small">Nenhum lembrete para este processo.</div>';
        return;
    }

    [...pendentes, ...feitos].forEach(item => {
        const situacao = situacaoLembrete(item.data_lembrete);
        const el = document.createElement('div');
        el.className = `item-lembrete ${item.concluido ? 'concluido' : situacao.classe}`;
        el.dataset.id = item.id;
        el.innerHTML = `
            <div class="d-flex justify-content-between align-items-center gap-2">
                <div>
                    <strong>${esc(dataBR(item.data_lembrete))}</strong>
                    ${item.concluido
                        ? '<span class="badge bg-success ms-1">concluído</span>'
                        : `<span class="badge bg-${situacao.cor} ms-1">${esc(situacao.rotulo)}</span>`}
                    <div>${esc(item.texto) || '<span class="text-muted">(sem texto)</span>'}</div>
                </div>
                <div class="d-flex gap-1">
                    ${item.concluido ? '' : '<button type="button" class="btn btn-sm btn-outline-success" data-acao="concluir-lembrete" aria-label="Concluir lembrete" title="Concluir"><i class="fas fa-check"></i></button>'}
                    <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir-lembrete" aria-label="Excluir lembrete" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        lista.appendChild(el);
    });
}

async function criarLembrete() {
    const data = document.getElementById('lembreteData').value;
    if (!data) {
        mostrarMensagem('Escolha a data do lembrete.', 'warning');
        return;
    }
    const eu = usuario();
    const { error } = await supabase.from('lembretes').insert([{
        processo_id: processoAtual.id,
        usuario_id: eu.id,
        autor: eu.nome || 'Sistema',
        data_lembrete: data,
        texto: document.getElementById('lembreteTexto').value.trim() || null
    }]);

    if (error) {
        mostrarMensagem('Não foi possível criar o lembrete: ' + error.message, 'danger', { tentarNovamente: criarLembrete });
        return;
    }
    document.getElementById('lembreteTexto').value = '';
    document.getElementById('lembreteData').value = somarDias(1);
    mostrarToast(`Lembrete criado para ${dataBR(data)}.`, 'success');
    carregarLembretes();
    window.dispatchEvent(new Event('lembretes-alterados'));
}

// Lembretes do usuário que já venceram ou vencem hoje (sino e dashboard)
export async function buscarLembretesDoDia() {
    const eu = usuario();
    if (eu.id === undefined) return [];

    const { data, error } = await supabase
        .from('lembretes')
        .select('*')
        .eq('usuario_id', eu.id)
        .eq('concluido', false)
        .lte('data_lembrete', hojeISO())
        .order('data_lembrete', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const ids = [...new Set(data.map(l => l.processo_id))];
    const { data: processos } = await supabase
        .from('processos')
        .select('id, numero_processo, requerente')
        .in('id', ids);
    const porId = new Map((processos || []).map(p => [p.id, p]));

    return data.map(l => ({
        ...l,
        numero: (porId.get(l.processo_id) || {}).numero_processo,
        requerente: (porId.get(l.processo_id) || {}).requerente,
        atraso: diasDeAtraso(l.data_lembrete)
    }));
}

// Bloco "Para hoje" do dashboard
export async function atualizarParaHoje() {
    const bloco = document.getElementById('blocoParaHoje');
    const lista = document.getElementById('listaParaHoje');
    let itens = [];
    try {
        itens = await buscarLembretesDoDia();
    } catch (error) {
        itens = []; // tabelas ainda não criadas: o bloco simplesmente não aparece
    }

    bloco.classList.toggle('d-none', itens.length === 0);
    document.getElementById('paraHojeTotal').textContent = itens.length;
    lista.innerHTML = '';

    itens.forEach(item => {
        const situacao = item.atraso > 0 ? `vencido há ${item.atraso} dia(s)` : 'hoje';
        const el = document.createElement('div');
        el.className = 'list-group-item d-flex justify-content-between align-items-center gap-2 px-0';
        el.dataset.id = item.id;
        el.dataset.processo = item.processo_id;
        el.innerHTML = `
            <div>
                <strong>${esc(item.numero) || 'Sem número'}</strong>
                <span class="text-muted">- ${esc(item.requerente)}</span>
                <span class="badge bg-${item.atraso > 0 ? 'danger' : 'primary'} ms-1">${esc(situacao)}</span>
                <div class="small">${esc(item.texto) || 'Retornar'}</div>
            </div>
            <div class="d-flex gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary" data-acao="abrir">Abrir</button>
                <button type="button" class="btn btn-sm btn-outline-success" data-acao="concluir" aria-label="Concluir lembrete" title="Concluir"><i class="fas fa-check"></i></button>
            </div>`;
        lista.appendChild(el);
    });
}

// ---------- Relacionados ----------

function calcularRelacionados(processo, todos) {
    const requerente = normalizar(processo.requerente);
    const placa = normalizar(processo.placa);
    const chassi = normalizar(processo.chassi);

    return todos
        .filter(outro => outro.id !== processo.id)
        .map(outro => {
            const motivos = [];
            if (requerente.length >= 3 && normalizar(outro.requerente) === requerente) motivos.push('Mesmo requerente');
            if (placa.length >= 3 && normalizar(outro.placa) === placa) motivos.push('Mesma placa');
            if (chassi.length >= 3 && normalizar(outro.chassi) === chassi) motivos.push('Mesmo chassi');
            return motivos.length > 0 ? { processo: outro, motivos } : null;
        })
        .filter(Boolean);
}

async function carregarRelacionados() {
    const atual = processoAtual;
    const lista = document.getElementById('listaRelacionados');
    lista.innerHTML = '<div class="text-muted small">Procurando...</div>';

    let todos = [];
    try {
        todos = await obterTodos();
    } catch (error) {
        todos = [];
    }
    if (!processoAtual || processoAtual.id !== atual.id) return;

    const encontrados = calcularRelacionados(atual, todos);
    definirContagem('contRelacionados', encontrados.length, true);
    lista.innerHTML = '';

    if (encontrados.length === 0) {
        lista.innerHTML = '<div class="text-muted small">Nenhum outro processo com o mesmo requerente, placa ou chassi.</div>';
        return;
    }

    encontrados.forEach(({ processo, motivos }) => {
        const el = document.createElement('div');
        el.className = 'item-relacionado d-flex justify-content-between align-items-center gap-2';
        el.dataset.id = processo.id;
        el.innerHTML = `
            <div>
                <strong>${esc(processo.numeroProcesso) || 'Sem número'}</strong>
                <span class="text-muted">- ${esc(processo.requerente)}</span>
                <div class="small">
                    ${esc(dataBR(processo.dataInicial))} · ${esc(processo.status)}${processo.localizacaoFisica ? ' · ' + esc(processo.localizacaoFisica) : ''}
                </div>
                <div>${motivos.map(m => `<span class="badge bg-warning text-dark me-1">${esc(m)}</span>`).join('')}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" data-acao="abrir-relacionado">Abrir</button>`;
        lista.appendChild(el);
    });
}

// ---------- Painel (abas do modal de edição) ----------

export async function abrirPainelProcesso(processo) {
    processoAtual = processo;

    // volta para a aba Dados e limpa os formulários
    bootstrap.Tab.getOrCreateInstance(document.getElementById('tabDados')).show();
    document.getElementById('novaAnotacao').value = '';
    document.getElementById('lembreteTexto').value = '';
    document.getElementById('lembreteData').value = somarDias(1);
    ['contAnotacoes', 'contLembretes', 'contRelacionados'].forEach(id => definirContagem(id, 0));

    await Promise.all([carregarAnotacoes(), carregarLembretes(), carregarRelacionados()]);
}

export function iniciarPainelProcesso({ aoAbrirProcesso, obterTodosProcessos }) {
    abrirProcesso = aoAbrirProcesso;
    obterTodos = obterTodosProcessos;

    // o botão Salvar só faz sentido na aba Dados
    document.getElementById('abasProcesso').addEventListener('shown.bs.tab', (e) => {
        document.getElementById('btnSalvarEdicao').classList.toggle('d-none', e.target.id !== 'tabDados');
    });
    document.getElementById('modalEditar').addEventListener('hidden.bs.modal', () => {
        processoAtual = null;
        document.getElementById('btnSalvarEdicao').classList.remove('d-none');
    });

    document.getElementById('formAnotacao').addEventListener('submit', (e) => {
        e.preventDefault();
        comBotaoOcupado(document.getElementById('btnAddAnotacao'), 'Salvando...', adicionarAnotacao);
    });
    document.getElementById('formLembrete').addEventListener('submit', (e) => {
        e.preventDefault();
        comBotaoOcupado(document.getElementById('btnAddLembrete'), 'Salvando...', criarLembrete);
    });
    document.querySelectorAll('[data-lembrete-dias]').forEach(botao => {
        botao.addEventListener('click', () => {
            document.getElementById('lembreteData').value = somarDias(Number(botao.dataset.lembreteDias));
        });
    });

    document.getElementById('listaAnotacoes').addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-acao="excluir-anotacao"]');
        if (!botao) return;
        const id = Number(botao.closest('.item-anotacao').dataset.id);
        const ok = await confirmar({ titulo: 'Excluir anotação', mensagem: 'Excluir esta anotação?', textoConfirmar: 'Excluir', perigo: true });
        if (!ok) return;
        const { error } = await supabase.from('anotacoes').delete().eq('id', id);
        if (error) {
            mostrarMensagem('Não foi possível excluir: ' + error.message, 'danger');
            return;
        }
        carregarAnotacoes();
    });

    document.getElementById('listaLembretes').addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        const id = Number(botao.closest('.item-lembrete').dataset.id);

        if (botao.dataset.acao === 'concluir-lembrete') {
            if (await concluirLembrete(id)) carregarLembretes();
        } else if (botao.dataset.acao === 'excluir-lembrete') {
            const { error } = await supabase.from('lembretes').delete().eq('id', id);
            if (error) {
                mostrarMensagem('Não foi possível excluir: ' + error.message, 'danger');
                return;
            }
            carregarLembretes();
            window.dispatchEvent(new Event('lembretes-alterados'));
        }
    });

    document.getElementById('listaRelacionados').addEventListener('click', (e) => {
        const botao = e.target.closest('[data-acao="abrir-relacionado"]');
        if (botao) abrirProcesso(Number(botao.closest('.item-relacionado').dataset.id));
    });

    // Para hoje (dashboard)
    document.getElementById('listaParaHoje').addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        const item = botao.closest('[data-id]');
        if (botao.dataset.acao === 'abrir') {
            abrirProcesso(Number(item.dataset.processo));
        } else if (botao.dataset.acao === 'concluir') {
            await concluirLembrete(Number(item.dataset.id));
        }
    });
    window.addEventListener('lembretes-alterados', atualizarParaHoje);
    atualizarParaHoje();
}
