// Importações
import { 
    adicionarProcesso, 
    atualizarProcesso, 
    atualizarEmLote,
    buscarProcessoPorId, 
    buscarProcessos, 
    buscarProcessoPorNumero,
    buscarConfiguracao,
    salvarConfiguracao,
    buscarFinalizacoes,
    buscarHistorico,
    realizarBackup,
    restaurarBackup,
    testarConexao
} from './supabase.js';
import { esc, mostrarMensagem, mostrarToast, contatoHtml, confirmar, comBotaoOcupado, normalizar } from './ui.js';
import { abrirPainelProcesso, iniciarPainelProcesso, buscarAnotacoes } from './anotacoes.js';
import { COLUNAS_EXPORT, exportarCSV, exportarPDF, imprimirEtiqueta } from './exportar.js';

const ITENS_POR_PAGINA_PESQUISA = 10;
const DIAS_ATENCAO_PADRAO = 30;
let diasAtencao = DIAS_ATENCAO_PADRAO;
let configDisponivel = true;
let pesquisaProcessosCache = [];
let pesquisaPaginaAtual = 1;
let pesquisaCarregada = false;
let pesquisaRequisicao = 0;
let pesquisaSemLocalizacao = false;
let pesquisaParados = false;
let pesquisaDestaque = new Set();
let relatorioAtual = [];
let pesquisaOrdenacao = { campo: 'dataInicial', dir: 'desc' };
let ultimoProcessoCadastradoId = null;
let numeroDuplicadoId = null;
let pesquisaSelecionados = new Set();
let pesquisaIdsPagina = [];

const LOCALIZACOES = ['Pendentes', 'Perícia', 'Arquivo Morto', 'Vistoria Avulsa', 'Processo finalizado'];
const STATUS_LISTA = ['Pendente', 'Aprovado', 'Reprovado', 'Cancelado', 'Finalizado'];

function hojeISO() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diasDesde(dataISO) {
    if (!dataISO) return null;
    const [ano, mes, dia] = String(dataISO).slice(0, 10).split('-').map(Number);
    if (!ano || !mes || !dia) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.floor((hoje - new Date(ano, mes - 1, dia)) / 86400000);
}

function estaParado(processo) {
    if (processo.status !== 'Pendente') return false;
    const dias = diasDesde(processo.dataInicial);
    return dias !== null && dias >= diasAtencao;
}

// Funções de validação
function validarPlaca(placa) {
    // Remove espaços e converte para maiúsculas
    placa = placa.trim().toUpperCase();
    return placa.length > 0; // Aceita qualquer formato, desde que não seja vazio
}

function validarData(data) {
    const dataObj = new Date(data);
    return dataObj instanceof Date && !isNaN(dataObj);
}

// Funções de navegação
const PAGINAS = ['home', 'cadastro', 'pesquisa', 'relatorios', 'credenciais', 'configuracoes'];

function paginaPermitida(pagina) {
    const link = document.querySelector(`#sidebar li a[data-page="${pagina}"]`);
    return !!link && !link.parentElement.classList.contains('d-none');
}

function navegarPara(pagina, { atualizarHash = true } = {}) {
    if (!PAGINAS.includes(pagina) || !paginaPermitida(pagina)) pagina = 'home';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pagina).classList.add('active');
    
    document.querySelectorAll('#sidebar li').forEach(li => li.classList.remove('active'));
    document.querySelector(`#sidebar li a[data-page="${pagina}"]`).parentElement.classList.add('active');

    if (atualizarHash && location.hash !== '#' + pagina) {
        location.hash = pagina;
    }
    window.scrollTo(0, 0);

    if (pagina === 'home') {
        atualizarDashboard();
    }
    if (pagina === 'pesquisa' && !pesquisaCarregada) {
        executarPesquisa({ silencioso: true });
    }
    if (pagina === 'cadastro') {
        const data = document.getElementById('dataInicial');
        if (!data.value) data.value = hojeISO();
    }
}

// Todos os processos (cache de 1 minuto): duplicidade e "relacionados" sem novas consultas
let todosProcessosCache = { dados: [], em: 0 };

async function obterTodosProcessos({ forcar = false } = {}) {
    const recente = Date.now() - todosProcessosCache.em < 60000;
    if (!forcar && recente && todosProcessosCache.dados.length > 0) return todosProcessosCache.dados;
    const dados = await buscarProcessos({});
    todosProcessosCache = { dados, em: Date.now() };
    return dados;
}

// Abre outro processo no modal, avisando se há alterações não salvas no atual
async function abrirProcessoPorId(id) {
    if (editarSujo()) {
        const ok = await confirmar({
            titulo: 'Alterações não salvas',
            mensagem: 'Há alterações não salvas neste processo. Abrir outro mesmo assim?',
            textoConfirmar: 'Abrir outro',
            perigo: true
        });
        if (!ok) return;
    }
    window.abrirModalEditar(id);
}

// Pesquisa: filtros, chips e ordenação
const FILTROS_PESQUISA = [
    { chave: 'busca', rotulo: 'Busca', campo: 'pesquisaBusca' },
    { chave: 'numeroProcesso', rotulo: 'Nº', campo: 'pesquisaNumero' },
    { chave: 'placa', rotulo: 'Placa', campo: 'pesquisaPlaca' },
    { chave: 'tipoVeiculo', rotulo: 'Veículo', campo: 'pesquisaTipoVeiculo' },
    { chave: 'status', rotulo: 'Status', campo: 'pesquisaStatus' },
    { chave: 'localizacaoFisica', rotulo: 'Local', campo: 'pesquisaLocalizacao' }
];

function coletarFiltrosPesquisa() {
    const filtros = {};
    FILTROS_PESQUISA.forEach(f => {
        filtros[f.chave] = document.getElementById(f.campo).value.trim();
    });
    filtros.semLocalizacao = pesquisaSemLocalizacao;
    filtros.parados = pesquisaParados;
    return filtros;
}

function correspondeTexto(processo, filtros) {
    if (filtros.numeroProcesso && !normalizar(processo.numeroProcesso).includes(normalizar(filtros.numeroProcesso))) return false;
    if (filtros.placa && !normalizar(processo.placa).includes(normalizar(filtros.placa))) return false;
    if (filtros.busca) {
        const campos = [processo.numeroProcesso, processo.requerente, processo.contato, processo.placa, processo.chassi, processo.motivoPendencia];
        const palheiro = campos.map(normalizar).join('|');
        const termos = filtros.busca.split(/\s+/).map(normalizar).filter(Boolean);
        if (!termos.every(t => palheiro.includes(t))) return false;
    }
    return true;
}

function dataLimiteParados() {
    const limite = new Date();
    limite.setDate(limite.getDate() - diasAtencao);
    return `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
}

function atualizarChipsPesquisa(filtros) {
    const container = document.getElementById('pesquisaChips');
    container.innerHTML = '';

    const adicionarChip = (texto, aoRemover) => {
        const chip = document.createElement('span');
        chip.className = 'badge bg-primary d-inline-flex align-items-center';
        chip.appendChild(document.createTextNode(texto));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-close btn-close-white';
        btn.setAttribute('aria-label', 'Remover filtro');
        btn.addEventListener('click', () => {
            aoRemover();
            executarPesquisa({ silencioso: true });
        });
        chip.appendChild(btn);
        container.appendChild(chip);
    };

    FILTROS_PESQUISA.forEach(f => {
        if (filtros[f.chave]) {
            adicionarChip(`${f.rotulo}: ${filtros[f.chave]}`, () => {
                document.getElementById(f.campo).value = '';
            });
        }
    });
    if (filtros.semLocalizacao) {
        adicionarChip('Sem localização física', () => { pesquisaSemLocalizacao = false; });
    }
    if (filtros.parados) {
        adicionarChip(`Parados há ${diasAtencao}+ dias`, () => { pesquisaParados = false; });
    }
}

// Lembra filtros e ordenação ao navegar/recarregar na mesma aba
function salvarEstadoPesquisa() {
    try {
        sessionStorage.setItem('pesquisaEstado', JSON.stringify({
            filtros: coletarFiltrosPesquisa(),
            ordenacao: pesquisaOrdenacao
        }));
    } catch (e) { /* armazenamento indisponível: ignora */ }
}

function restaurarEstadoPesquisa() {
    try {
        const estado = JSON.parse(sessionStorage.getItem('pesquisaEstado'));
        if (!estado) return;
        definirFiltrosPesquisa(estado.filtros || {});
        if (estado.ordenacao) pesquisaOrdenacao = estado.ordenacao;
    } catch (e) { /* estado inválido: ignora */ }
}

function definirFiltrosPesquisa(filtros) {
    FILTROS_PESQUISA.forEach(f => {
        document.getElementById(f.campo).value = filtros[f.chave] || '';
    });
    pesquisaSemLocalizacao = !!filtros.semLocalizacao;
    pesquisaParados = !!filtros.parados;
}

async function executarPesquisa({ silencioso = false, manterPagina = false } = {}) {
    const filtros = coletarFiltrosPesquisa();
    const requisicao = ++pesquisaRequisicao;
    pesquisaCarregada = true;
    atualizarChipsPesquisa(filtros);
    salvarEstadoPesquisa();
    renderizarVisoes();

    try {
        if (!silencioso) window.mostrarLoading('Pesquisando...');
        // Filtros estruturados no servidor; texto (busca, número, placa) aqui, ignorando acentos
        const encontrados = await buscarProcessos({
            tipoVeiculo: filtros.tipoVeiculo,
            status: filtros.status,
            localizacaoFisica: filtros.localizacaoFisica,
            semLocalizacao: filtros.semLocalizacao,
            dataAte: filtros.parados ? dataLimiteParados() : ''
        });
        if (requisicao !== pesquisaRequisicao) return; // resposta antiga: descarta
        const processos = encontrados.filter(p => correspondeTexto(p, filtros));
        pesquisaProcessosCache = processos;
        if (!manterPagina) pesquisaPaginaAtual = 1;
        // mantém marcados apenas os processos que continuam no resultado
        const idsAtuais = new Set(processos.map(p => p.id));
        pesquisaSelecionados = new Set([...pesquisaSelecionados].filter(id => idsAtuais.has(id)));
        renderizarTabelaPesquisaPaginada();
    } catch (error) {
        if (requisicao === pesquisaRequisicao) {
            mostrarMensagem('Erro ao buscar processos: ' + error, 'danger', { tentarNovamente: () => executarPesquisa({ silencioso, manterPagina }) });
        }
    } finally {
        if (!silencioso) window.esconderLoading();
    }
}

// Recarrega a pesquisa mantendo a página e destacando as linhas alteradas
function recarregarPesquisa(idsAlterados = []) {
    pesquisaDestaque = new Set(idsAlterados);
    return executarPesquisa({ silencioso: true, manterPagina: true });
}

function limparFiltrosPesquisa() {
    definirFiltrosPesquisa({});
}

// Usado pelo dashboard e pelas visões: abre a pesquisa já filtrada
function aplicarFiltrosPesquisa(filtros = {}, ordenacao = null) {
    definirFiltrosPesquisa(filtros);
    if (ordenacao) pesquisaOrdenacao = ordenacao;
    pesquisaCarregada = true;
    navegarPara('pesquisa');
    executarPesquisa();
}

// Visões: atalhos prontos e pesquisas salvas pelo próprio usuário (neste navegador)
const ORDEM_MAIS_ANTIGOS = { campo: 'dataInicial', dir: 'asc' };

function visoesPadrao() {
    return [
        { nome: 'Pendentes', filtros: { status: 'Pendente' } },
        { nome: `Parados há ${diasAtencao}+ dias`, filtros: { status: 'Pendente', parados: true }, ordenacao: ORDEM_MAIS_ANTIGOS },
        { nome: 'Sem localização', filtros: { semLocalizacao: true } },
        { nome: 'Em Perícia', filtros: { localizacaoFisica: 'Perícia' } },
        { nome: 'Arquivo Morto', filtros: { localizacaoFisica: 'Arquivo Morto' } }
    ];
}

function lerVisoesSalvas() {
    try {
        const lista = JSON.parse(localStorage.getItem('visoesPesquisa'));
        return Array.isArray(lista) ? lista : [];
    } catch (e) {
        return [];
    }
}

function gravarVisoesSalvas(lista) {
    try {
        localStorage.setItem('visoesPesquisa', JSON.stringify(lista));
    } catch (e) {
        mostrarMensagem('Não foi possível salvar a visão neste navegador.', 'warning');
    }
}

function filtrosAtivosCompactos() {
    const f = coletarFiltrosPesquisa();
    const compacto = {};
    Object.entries(f).forEach(([k, v]) => { if (v) compacto[k] = v; });
    return compacto;
}

function mesmosFiltros(a, b) {
    const normaliza = o => JSON.stringify(Object.keys(o || {}).filter(k => o[k]).sort().map(k => [k, o[k]]));
    return normaliza(a) === normaliza(b);
}

function renderizarVisoes() {
    const container = document.getElementById('pesquisaVisoes');
    if (!container) return;
    container.innerHTML = '';
    const atuais = filtrosAtivosCompactos();

    const rotulo = document.createElement('span');
    rotulo.className = 'small text-muted';
    rotulo.textContent = 'Visões:';
    container.appendChild(rotulo);

    const adicionar = (visao, indiceSalva) => {
        const grupo = document.createElement('div');
        grupo.className = 'btn-group btn-group-sm';
        const botao = document.createElement('button');
        botao.type = 'button';
        const ativa = mesmosFiltros(visao.filtros, atuais);
        botao.className = `btn ${ativa ? 'btn-primary' : 'btn-outline-primary'}`;
        botao.textContent = visao.nome;
        botao.addEventListener('click', () => aplicarFiltrosPesquisa(visao.filtros, visao.ordenacao || null));
        grupo.appendChild(botao);
        if (indiceSalva !== undefined) {
            const remover = document.createElement('button');
            remover.type = 'button';
            remover.className = `btn ${ativa ? 'btn-primary' : 'btn-outline-primary'}`;
            remover.innerHTML = '<i class="fas fa-times"></i>';
            remover.setAttribute('aria-label', `Excluir visão ${visao.nome}`);
            remover.title = 'Excluir esta visão';
            remover.addEventListener('click', () => {
                const lista = lerVisoesSalvas();
                lista.splice(indiceSalva, 1);
                gravarVisoesSalvas(lista);
                renderizarVisoes();
            });
            grupo.appendChild(remover);
        }
        container.appendChild(grupo);
    };

    visoesPadrao().forEach(v => adicionar(v));
    lerVisoesSalvas().forEach((v, i) => adicionar(v, i));

    const salvar = document.createElement('button');
    salvar.type = 'button';
    salvar.className = 'btn btn-sm btn-link';
    salvar.innerHTML = '<i class="fas fa-bookmark"></i> Salvar esta pesquisa';
    salvar.disabled = Object.keys(atuais).length === 0;
    salvar.addEventListener('click', () => {
        document.getElementById('visaoNovaForm').classList.remove('d-none');
        document.getElementById('visaoNovaNome').focus();
    });
    container.appendChild(salvar);
}

function ordenarProcessos(lista) {
    const { campo, dir } = pesquisaOrdenacao;
    const fator = dir === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
        const va = a[campo] ?? '';
        const vb = b[campo] ?? '';
        if (va === '' && vb !== '') return 1;  // vazios sempre por último
        if (vb === '' && va !== '') return -1;
        return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * fator;
    });
}

function atualizarIndicadoresOrdenacao() {
    document.querySelectorAll('th.ordenavel').forEach(th => {
        const ativo = th.dataset.ordenar === pesquisaOrdenacao.campo;
        th.classList.toggle('ordenado', ativo);
        const icone = th.querySelector('i');
        icone.className = 'fas ' + (ativo ? (pesquisaOrdenacao.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort');
    });
}

// Link do QR da etiqueta: dashboard.html#processo=ID abre o processo direto
function abrirLinkDeProcesso() {
    const link = /^#processo=(\d+)$/.exec(location.hash);
    if (!link) return false;
    navegarPara('pesquisa', { atualizarHash: false });
    history.replaceState(null, '', location.pathname + location.search + '#pesquisa');
    window.abrirModalEditar(Number(link[1]));
    return true;
}

// Funções de manipulação de formulários
function limparFormulario(formId) {
    document.getElementById(formId).reset();
}

function coletarDadosProcesso() {
    return {
        numeroProcesso: document.getElementById('numeroProcesso').value,
        dataInicial: document.getElementById('dataInicial').value,
        requerente: document.getElementById('requerente').value,
        contato: document.getElementById('contato').value,
        tipoVeiculo: document.getElementById('tipoVeiculo').value,
        placa: document.getElementById('placa').value.toUpperCase(),
        chassi: document.getElementById('chassi').value.toUpperCase(),
        status: document.getElementById('status').value,
        motivoPendencia: document.getElementById('motivoPendencia').value,
        localizacaoFisica: document.getElementById('localizacaoFisica').value
    };
}

// Funções de exibição
function criarLinhaTabelaPesquisa(processo) {
    const tr = document.createElement('tr');
    const parado = estaParado(processo);
    if (parado) tr.classList.add('processo-atrasado');
    const selecionado = pesquisaSelecionados.has(processo.id);
    if (selecionado) tr.classList.add('linha-selecionada');
    if (pesquisaDestaque.has(processo.id)) tr.classList.add('linha-destaque');
    const dias = diasDesde(processo.dataInicial);
    const alertaParado = parado
        ? `<span class="badge bg-danger ms-1" title="Pendente desde ${esc(formatarDataBR(processo.dataInicial))}">há ${dias} dias</span>`
        : '';
    tr.dataset.id = processo.id;
    tr.innerHTML = `
        <td data-label="Selecionar"><input type="checkbox" class="form-check-input chk-linha" aria-label="Selecionar processo ${esc(processo.numeroProcesso)}"${selecionado ? ' checked' : ''}></td>
        <td data-label="Número">${esc(processo.numeroProcesso) || '-'}</td>
        <td data-label="Data">${esc(formatarDataBR(processo.dataInicial))}</td>
        <td data-label="Requerente">${esc(processo.requerente)}</td>
        <td data-label="Contato">${contatoHtml(processo.contato)}</td>
        <td data-label="Veículo">${esc(processo.tipoVeiculo)}</td>
        <td data-label="Placa">${esc(processo.placa) || '-'}</td>
        <td data-label="Status"><span class="badge bg-${getStatusColor(processo.status)}">${esc(processo.status)}</span>${alertaParado}</td>
        <td data-label="Motivo">${esc(processo.motivoPendencia) || '-'}</td>
        <td data-label="Localização"><span class="badge bg-${getLocalizacaoColor(processo.localizacaoFisica)}">${esc(processo.localizacaoFisica) || '-'}</span></td>
        <td data-label="Ações">
            <div class="d-flex gap-1 justify-content-end">
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-primary" onclick="window.abrirModalEditar(${Number(processo.id)})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button type="button" class="btn btn-sm btn-info" onclick="window.abrirModalHistorico(${Number(processo.id)})">
                        <i class="fas fa-history"></i> Histórico
                    </button>
                </div>
                <div class="dropdown">
                    <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-label="Mover e mais ações" title="Mover e mais ações">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">${menuAcoesHtml(processo)}</ul>
                </div>
            </div>
        </td>
    `;
    // posição fixa evita que o menu seja cortado pela tabela rolável
    tr.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
        new bootstrap.Dropdown(el, { popperConfig: cfg => ({ ...cfg, strategy: 'fixed' }) });
    });
    return tr;
}

function itensMenuHtml(lista, acao, atual) {
    return lista.map(valor => {
        const ativo = valor === atual;
        return `<li><button type="button" class="dropdown-item${ativo ? ' active' : ''}" data-acao="${acao}" data-valor="${esc(valor)}"${ativo ? ' disabled' : ''}>${esc(valor)}</button></li>`;
    }).join('');
}

function menuAcoesHtml(processo) {
    return `
        <li><h6 class="dropdown-header">Mover para</h6></li>
        ${itensMenuHtml(LOCALIZACOES, 'mover', processo.localizacaoFisica)}
        <li><hr class="dropdown-divider"></li>
        <li><h6 class="dropdown-header">Alterar status</h6></li>
        ${itensMenuHtml(STATUS_LISTA, 'status', processo.status)}
        <li><hr class="dropdown-divider"></li>
        <li><button type="button" class="dropdown-item" data-acao="duplicar"><i class="fas fa-copy me-1"></i> Duplicar</button></li>
        <li><button type="button" class="dropdown-item" data-acao="etiqueta"><i class="fas fa-print me-1"></i> Imprimir etiqueta</button></li>
    `;
}

// Seleção e ações em lote
function atualizarBarraLote() {
    const quantidade = pesquisaSelecionados.size;
    const barra = document.getElementById('pesquisaLote');
    barra.classList.toggle('d-none', quantidade === 0);
    barra.classList.toggle('d-flex', quantidade > 0);
    document.getElementById('loteContagem').textContent = quantidade;

    const marcados = pesquisaIdsPagina.filter(id => pesquisaSelecionados.has(id)).length;
    const todos = pesquisaIdsPagina.length > 0 && marcados === pesquisaIdsPagina.length;
    ['loteTodos', 'loteTodosMobile'].forEach(id => {
        const caixa = document.getElementById(id);
        caixa.checked = todos;
        caixa.indeterminate = marcados > 0 && !todos;
    });
}

async function confirmarStatusSensivel(status, quantidade) {
    if (!STATUS_SENSIVEIS.includes(status)) return true;
    return confirmar({
        titulo: `Marcar como ${status}`,
        mensagem: quantidade === 1
            ? `Deseja realmente marcar este processo como ${status}?`
            : `Deseja realmente marcar ${quantidade} processos como ${status}?`,
        textoConfirmar: `Marcar como ${status}`,
        perigo: true
    });
}

// Restaura status/localização anteriores (agrupa os processos que tinham os mesmos valores)
async function desfazerMovimentacao(anteriores) {
    const grupos = new Map();
    anteriores.forEach(({ id, status, localizacaoFisica }) => {
        if (!status) return;
        const chave = `${status}|${localizacaoFisica || ''}`;
        if (!grupos.has(chave)) grupos.set(chave, { status, localizacaoFisica: localizacaoFisica || '', ids: [] });
        grupos.get(chave).ids.push(id);
    });

    try {
        window.mostrarLoading('Desfazendo...');
        for (const grupo of grupos.values()) {
            await atualizarEmLote(grupo.ids, { status: grupo.status, localizacaoFisica: grupo.localizacaoFisica });
        }
        window.esconderLoading();
        mostrarMensagem('Alteração desfeita.', 'info');
        await recarregarPesquisa(anteriores.map(a => a.id));
        atualizarDashboard();
    } catch (error) {
        window.esconderLoading();
        mostrarMensagem('Não foi possível desfazer: ' + error.message, 'danger', { tentarNovamente: () => desfazerMovimentacao(anteriores) });
    }
}

async function aplicarMovimentacao(ids, campos) {
    if (ids.length === 0) return;
    const porId = id => pesquisaProcessosCache.find(p => p.id === id);

    if (campos.status && !(await confirmarStatusSensivel(campos.status, ids.length))) return;

    const anteriores = ids
        .filter(id => porId(id))
        .map(id => ({ id, status: porId(id).status, localizacaoFisica: porId(id).localizacaoFisica }));

    try {
        window.mostrarLoading('Atualizando...');

        if (campos.status === 'Finalizado' && campos.localizacaoFisica === undefined) {
            // Finalizado sugere "Processo finalizado" quando a localização está vazia
            const semLocal = ids.filter(id => !(porId(id) && porId(id).localizacaoFisica));
            const comLocal = ids.filter(id => !semLocal.includes(id));
            await atualizarEmLote(semLocal, { status: 'Finalizado', localizacaoFisica: 'Processo finalizado' });
            await atualizarEmLote(comLocal, { status: 'Finalizado' });
        } else {
            await atualizarEmLote(ids, campos);
        }

        let mensagem;
        if (ids.length === 1) {
            const numero = (porId(ids[0]) && porId(ids[0]).numeroProcesso) || 'sem número';
            mensagem = campos.localizacaoFisica !== undefined
                ? `Processo ${numero} movido para ${campos.localizacaoFisica}.`
                : `Status do processo ${numero} alterado para ${campos.status}.`;
        } else {
            mensagem = campos.localizacaoFisica !== undefined
                ? `${ids.length} processos movidos para ${campos.localizacaoFisica}.`
                : `Status de ${ids.length} processos alterado para ${campos.status}.`;
        }

        pesquisaSelecionados.clear();
        window.esconderLoading();
        mostrarToast(mensagem, 'success', { acao: { rotulo: 'Desfazer', aoClicar: () => desfazerMovimentacao(anteriores) } });
        await recarregarPesquisa(ids);
        atualizarDashboard();
    } catch (error) {
        window.esconderLoading();
        mostrarMensagem('Erro ao atualizar: ' + error.message, 'danger', { tentarNovamente: () => aplicarMovimentacao(ids, campos) });
    }
}

function duplicarProcesso(processo) {
    limparFormulario('processoForm');
    prepararFormularioCadastro();
    navegarPara('cadastro');
    document.getElementById('requerente').value = processo.requerente || '';
    document.getElementById('contato').value = processo.contato || '';
    document.getElementById('status').value = processo.status || '';
    document.getElementById('localizacaoFisica').value = processo.localizacaoFisica || '';
    document.getElementById('motivoPendencia').value = processo.motivoPendencia || '';
    window.dispatchEvent(new Event('regra-localizacao'));
    mostrarMensagem(`Dados de ${processo.requerente || 'requerente'} copiados. Informe o número e o veículo.`, 'info');
    document.getElementById('numeroProcesso').focus();
}

function renderizarTabelaPesquisaPaginada() {
    const tbody = document.getElementById('tabelaResultados');
    tbody.innerHTML = '';

    const total = pesquisaProcessosCache.length;
    const totalPaginas = total === 0 ? 1 : Math.ceil(total / ITENS_POR_PAGINA_PESQUISA);
    if (pesquisaPaginaAtual > totalPaginas) {
        pesquisaPaginaAtual = totalPaginas;
    }
    const ordenados = ordenarProcessos(pesquisaProcessosCache);
    if (pesquisaDestaque.size > 0) {
        // leva para a página onde está o processo alterado
        const posicao = ordenados.findIndex(p => pesquisaDestaque.has(p.id));
        if (posicao >= 0) pesquisaPaginaAtual = Math.floor(posicao / ITENS_POR_PAGINA_PESQUISA) + 1;
    }
    const inicio = (pesquisaPaginaAtual - 1) * ITENS_POR_PAGINA_PESQUISA;
    const slice = ordenados.slice(inicio, inicio + ITENS_POR_PAGINA_PESQUISA);

    pesquisaIdsPagina = slice.map(p => p.id);
    slice.forEach(processo => tbody.appendChild(criarLinhaTabelaPesquisa(processo)));
    atualizarIndicadoresOrdenacao();
    atualizarBarraLote();

    const destacada = tbody.querySelector('.linha-destaque');
    if (destacada) destacada.scrollIntoView({ block: 'center', behavior: 'smooth' });
    pesquisaDestaque.clear();

    const botaoExportar = document.getElementById('btnExportar');
    botaoExportar.disabled = total === 0;
    document.getElementById('btnExportarTexto').textContent = total > 0 ? `Exportar (${total})` : 'Exportar';
    const vazio = document.getElementById('pesquisaVazio');
    vazio.classList.toggle('d-none', total !== 0);
    if (total === 0) {
        const comFiltro = Object.values(coletarFiltrosPesquisa()).some(Boolean);
        vazio.innerHTML = comFiltro
            ? `<i class="fas fa-folder-open fa-2x mb-2"></i>
               <p class="mb-2">Nenhum processo encontrado para os filtros informados.</p>
               <button type="button" class="btn btn-sm btn-outline-secondary" id="vazioLimparFiltros">Limpar filtros</button>`
            : `<i class="fas fa-folder-open fa-2x mb-2"></i>
               <p class="mb-2">Nenhum processo cadastrado ainda.</p>
               <a href="#cadastro" class="btn btn-sm btn-primary">Cadastrar o primeiro processo</a>`;
        const limpar = document.getElementById('vazioLimparFiltros');
        if (limpar) {
            limpar.addEventListener('click', () => {
                limparFiltrosPesquisa();
                executarPesquisa({ silencioso: true });
            });
        }
    }

    const nav = document.getElementById('pesquisaPaginacao');
    if (!nav) return;

    if (total === 0) {
        nav.classList.add('d-none');
        nav.classList.remove('d-flex');
        const elTotal = document.getElementById('pesquisaTotalRegistros');
        if (elTotal) elTotal.textContent = '0';
        return;
    }

    nav.classList.remove('d-none');
    nav.classList.add('d-flex');

    document.getElementById('pesquisaTotalRegistros').textContent = String(total);
    document.getElementById('pesquisaPaginaAtual').textContent = String(pesquisaPaginaAtual);
    document.getElementById('pesquisaTotalPaginas').textContent = String(totalPaginas);
    document.getElementById('btnPesquisaAnterior').disabled = pesquisaPaginaAtual <= 1;
    document.getElementById('btnPesquisaProximo').disabled = pesquisaPaginaAtual >= totalPaginas;
}

function exibirProcessos(processos) {
    const tbody = document.getElementById('tabelaResultados');
    tbody.innerHTML = '';

    const isPesquisaPage = document.getElementById('pesquisa').classList.contains('active');

    if (isPesquisaPage) {
        pesquisaProcessosCache = Array.isArray(processos) ? processos : [];
        pesquisaPaginaAtual = 1;
        renderizarTabelaPesquisaPaginada();
        return;
    }

    processos.forEach(processo => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${esc(processo.numeroProcesso) || '-'}</td>
            <td>${esc(formatarDataBR(processo.dataInicial))}</td>
            <td>${esc(processo.requerente)}</td>
            <td>${esc(processo.contato) || '-'}</td>
            <td>${esc(processo.tipoVeiculo)}</td>
            <td><span class="badge bg-${getStatusColor(processo.status)}">${esc(processo.status)}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Funções de modal
window.abrirModalAlterarStatus = function(processoId) {
    document.getElementById('processoId').value = processoId;
    document.getElementById('novoStatus').value = '';
    const modal = new bootstrap.Modal(document.getElementById('modalAlterarStatus'));
    modal.show();
};

window.abrirModalAlterarNumero = function(processoId) {
    document.getElementById('processoIdNumero').value = processoId;
    document.getElementById('novoNumero').value = '';
    const modal = new bootstrap.Modal(document.getElementById('modalAlterarNumero'));
    modal.show();
};

window.abrirModalHistorico = function(processoId) {
    Promise.all([buscarHistorico(processoId), buscarAnotacoes(processoId).catch(() => [])]).then(([historico, anotacoes]) => {
        const processo = pesquisaProcessosCache.find(p => p.id === processoId);
        const notas = anotacoes.map(n => ({ tipo: 'anotacao', valor: n.texto, data: n.criada_em, responsavel: n.autor }));
        renderizarLinhaDoTempo([...historico, ...notas], processo);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalHistorico')).show();
    }).catch(error => {
        mostrarMensagem('Erro ao buscar histórico: ' + error, 'danger');
    });
};

// Funções para abrir modal de edição
window.abrirModalEditar = function(processoId) {
    buscarProcessoPorId(processoId).then(processo => {
        // Preenche os campos do modal com os dados do processo
        document.getElementById('editarNumeroProcesso').value = processo.numeroProcesso || '';
        document.getElementById('editarDataInicial').value = processo.dataInicial;
        document.getElementById('editarRequerente').value = processo.requerente;
        document.getElementById('editarContato').value = processo.contato || '';
        document.getElementById('editarTipoVeiculo').value = processo.tipoVeiculo;
        document.getElementById('editarPlaca').value = processo.placa;
        document.getElementById('editarChassi').value = processo.chassi || '';
        document.getElementById('editarStatus').value = processo.status;
        document.getElementById('editarMotivoPendencia').value = processo.motivoPendencia || '';
        document.getElementById('editarLocalizacaoFisica').value = processo.localizacaoFisica || '';
        document.getElementById('editarProcessoId').value = processo.id;
        window.dispatchEvent(new Event('regra-localizacao'));
        editarBaseline = fotografar(CAMPOS_EDICAO);
        editarStatusOriginal = processo.status || '';
        editarPermitirFechar = false;
        document.getElementById('editarDescartarBar').classList.add('d-none');
        document.getElementById('editarDescartarBar').classList.remove('d-flex');

        // Abre o modal (anotações, lembretes e relacionados carregam nas outras abas)
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEditar')).show();
        abrirPainelProcesso(processo);
    }).catch(error => {
        mostrarMensagem('Erro ao buscar dados do processo: ' + error, 'danger');
    });
};

// Event listener para salvar edição
async function salvarEdicao() {
    const processoId = document.getElementById('editarProcessoId').value;
    const processo = {
        id: Number(processoId),
        numeroProcesso: document.getElementById('editarNumeroProcesso').value,
        dataInicial: document.getElementById('editarDataInicial').value,
        requerente: document.getElementById('editarRequerente').value,
        contato: document.getElementById('editarContato').value,
        tipoVeiculo: document.getElementById('editarTipoVeiculo').value,
        placa: document.getElementById('editarPlaca').value,
        status: document.getElementById('editarStatus').value,
        motivoPendencia: document.getElementById('editarMotivoPendencia').value,
        localizacaoFisica: document.getElementById('editarLocalizacaoFisica').value
    };

    if (processo.status !== editarStatusOriginal && !(await confirmarStatusSensivel(processo.status, 1))) return;

    try {
        const resultado = await atualizarProcesso(processo);
        editarPermitirFechar = true;
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalEditar'));
        modal.hide();
        mostrarMensagem('Processo atualizado com sucesso!');
        if (resultado && !resultado.historicoOk) {
            mostrarMensagem('As alterações foram salvas, mas o histórico não pôde ser registrado.', 'warning');
        }
        recarregarPesquisa([processo.id]);
        atualizarDashboard();
    } catch (error) {
        mostrarMensagem('Erro ao atualizar processo: ' + error, 'danger', { tentarNovamente: salvarEdicao });
    }
}

document.getElementById('btnSalvarEdicao').addEventListener('click', (e) => {
    comBotaoOcupado(e.currentTarget, 'Salvando...', salvarEdicao);
});

// Configurações (prazo de atenção)
function atualizarRotulosDiasAtencao() {
    document.querySelectorAll('.dias-atencao').forEach(el => { el.textContent = diasAtencao; });
    const campo = document.getElementById('configDiasAtencao');
    if (campo) campo.value = diasAtencao;

    const aviso = document.getElementById('configAviso');
    if (aviso) {
        aviso.textContent = configDisponivel
            ? ''
            : `Não foi possível ler as configurações do banco (a tabela "configuracoes" existe? veja configuracoes.sql). Usando o padrão de ${DIAS_ATENCAO_PADRAO} dias.`;
        aviso.classList.toggle('d-none', configDisponivel);
    }
}

async function carregarConfiguracoes() {
    try {
        const valor = parseInt(await buscarConfiguracao('dias_atencao'), 10);
        configDisponivel = true;
        if (valor > 0) diasAtencao = valor;
    } catch (error) {
        configDisponivel = false;
        console.warn('Configurações indisponíveis, usando padrão:', error);
    }
    atualizarRotulosDiasAtencao();
}

// Histórico em linha do tempo
const ROTULOS_CAMPO_HISTORICO = {
    requerente: 'Requerente',
    contato: 'Contato',
    tipo_veiculo: 'Tipo de veículo',
    placa: 'Placa',
    chassi: 'Chassi',
    motivo: 'Motivo da pendência',
    data_inicial: 'Data inicial'
};

function partesMudanca(valor) {
    const texto = String(valor ?? '');
    const i = texto.indexOf(' → ');
    return i === -1
        ? { antes: '', depois: texto }
        : { antes: texto.slice(0, i), depois: texto.slice(i + 3) };
}

function descreverEventoHistorico(evento, primeiroStatus) {
    const { antes, depois } = partesMudanca(evento.valor);
    switch (evento.tipo) {
        case 'status':
            return {
                icone: 'fa-flag',
                cor: getStatusColor(evento.valor),
                titulo: `${primeiroStatus ? 'Status inicial' : 'Status alterado para'}: ${evento.valor}`
            };
        case 'localizacao':
            return {
                icone: 'fa-map-marker-alt',
                cor: 'primary',
                titulo: antes ? `Movido de ${antes} para ${depois}` : `Localização definida: ${depois}`
            };
        case 'numero':
            return { icone: 'fa-hashtag', cor: 'secondary', titulo: `Número alterado para ${evento.valor}` };
        case 'anotacao':
            return { icone: 'fa-comment', cor: 'info', titulo: 'Anotação', detalhe: evento.valor };
        default: {
            const rotulo = ROTULOS_CAMPO_HISTORICO[evento.tipo] || evento.tipo;
            const fmt = v => (evento.tipo === 'data_inicial' ? formatarDataBR(v) : v) || '(vazio)';
            return { icone: 'fa-pen', cor: 'secondary', titulo: `${rotulo} alterado: ${fmt(antes)} → ${fmt(depois)}` };
        }
    }
}

function textoDuracaoEtapa(evento) {
    const n = evento.dias;
    const base = n === 0 ? 'menos de 1 dia' : n === 1 ? '1 dia' : `${n} dias`;
    return evento.atual ? `Está nesta etapa há ${base}` : `Ficou ${base} nesta etapa`;
}

function renderizarLinhaDoTempo(historico, processo) {
    const eventos = [...historico].sort((a, b) => new Date(a.data) - new Date(b.data));

    // Tempo em cada etapa: do evento até o próximo do mesmo tipo (status ou localização)
    eventos.forEach((evento, i) => {
        if (evento.tipo !== 'status' && evento.tipo !== 'localizacao') return;
        const proximo = eventos.slice(i + 1).find(e => e.tipo === evento.tipo);
        const fim = proximo ? new Date(proximo.data) : new Date();
        evento.dias = Math.max(0, Math.floor((fim - new Date(evento.data)) / 86400000));
        evento.atual = !proximo;
    });

    const lista = document.getElementById('historicoTimeline');
    const resumo = document.getElementById('historicoResumo');
    lista.innerHTML = '';

    document.getElementById('modalHistoricoLabel').textContent =
        processo && processo.numeroProcesso ? `Histórico do Processo ${processo.numeroProcesso}` : 'Histórico do Processo';

    if (eventos.length === 0) {
        resumo.textContent = '';
        lista.innerHTML = '<li class="text-muted">Nenhum registro de histórico para este processo.</li>';
        return;
    }

    const diasNoSistema = processo ? diasDesde(processo.dataInicial) : null;
    resumo.textContent = diasNoSistema !== null
        ? `Entrada em ${formatarDataBR(processo.dataInicial)} · ${diasNoSistema} dia(s) no sistema · ${eventos.length} registro(s)`
        : `${eventos.length} registro(s)`;

    const primeiroStatus = eventos.find(e => e.tipo === 'status');
    [...eventos].reverse().forEach(evento => {
        const info = descreverEventoHistorico(evento, evento === primeiroStatus);
        const etapa = evento.dias !== undefined
            ? `<span class="timeline-etapa">${esc(textoDuracaoEtapa(evento))}</span>`
            : '';
        const item = document.createElement('li');
        item.className = 'timeline-item';
        item.innerHTML = `
            <span class="timeline-marcador bg-${info.cor}${evento.atual ? ' atual' : ''}"><i class="fas ${info.icone}"></i></span>
            <div><strong>${esc(info.titulo)}</strong>${evento.atual ? ' <span class="badge bg-primary">atual</span>' : ''}</div>
            ${info.detalhe ? `<div class="anotacao-texto">${esc(info.detalhe)}</div>` : ''}
            <div class="small text-muted">${esc(new Date(evento.data).toLocaleString('pt-BR'))} · por ${esc(evento.responsavel || 'Sistema')}</div>
            ${etapa}
        `;
        lista.appendChild(item);
    });
}

// Funções do Dashboard
function renderizarListaAtencao(containerId, totalId, lista) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    document.getElementById(totalId).textContent = lista.length;

    if (lista.length === 0) {
        container.innerHTML = '<div class="text-muted small">Nenhum processo nesta situação.</div>';
        return;
    }

    lista.slice(0, 5).forEach(processo => {
        const dias = diasDesde(processo.dataInicial);
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center px-0';
        item.innerHTML = `
            <div>
                <strong>${esc(processo.numeroProcesso) || 'Sem número'}</strong>
                <span class="text-muted">- ${esc(processo.requerente)}</span>
                ${dias !== null ? `<span class="badge bg-danger ms-1">há ${dias} dias</span>` : ''}
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.abrirModalEditar(${Number(processo.id)})">Abrir</button>
        `;
        container.appendChild(item);
    });
}

function renderizarAtencao(processos) {
    const maisAntigosPrimeiro = (a, b) => String(a.dataInicial || '').localeCompare(String(b.dataInicial || ''));
    const parados = processos.filter(estaParado).sort(maisAntigosPrimeiro);
    const semLocal = processos
        .filter(p => p.status === 'Pendente' && !p.localizacaoFisica)
        .sort(maisAntigosPrimeiro);

    renderizarListaAtencao('atencaoParados', 'atencaoParadosTotal', parados);
    renderizarListaAtencao('atencaoSemLocal', 'atencaoSemLocalTotal', semLocal);
}

function renderizarResumoLocalizacao(processos) {
    const container = document.getElementById('resumoLocalizacao');
    container.innerHTML = '';

    const contagem = {};
    LOCALIZACOES.forEach(l => { contagem[l] = 0; });
    let semLocalizacao = 0;
    processos.forEach(p => {
        if (!p.localizacaoFisica) semLocalizacao++;
        else contagem[p.localizacaoFisica] = (contagem[p.localizacaoFisica] || 0) + 1;
    });

    const tile = (rotulo, quantidade, atributo) => `
        <div class="col-6 col-md-4 col-xl-2">
            <div class="tile-local${quantidade === 0 ? ' tile-vazio' : ''}" role="button" tabindex="0" ${atributo} title="Ver na pesquisa">
                <div class="tile-numero">${quantidade}</div>
                <div class="small text-muted">${esc(rotulo)}</div>
            </div>
        </div>`;

    container.innerHTML = Object.entries(contagem)
        .map(([local, quantidade]) => tile(local, quantidade, `data-local="${esc(local)}"`))
        .join('') + tile('Sem localização', semLocalizacao, 'data-sem-local="1"');
}

function renderizarGraficoMensal(processos, finalizacoes) {
    const container = document.getElementById('graficoMensal');
    const hoje = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const nome = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        meses.push({ chave, rotulo: `${nome}/${String(d.getFullYear()).slice(2)}`, entradas: 0, finalizados: 0 });
    }

    processos.forEach(p => {
        const m = meses.find(x => x.chave === String(p.dataInicial || '').slice(0, 7));
        if (m) m.entradas++;
    });
    finalizacoes.forEach(iso => {
        const d = new Date(iso);
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const m = meses.find(x => x.chave === chave);
        if (m) m.finalizados++;
    });

    const maximo = Math.max(1, ...meses.map(m => Math.max(m.entradas, m.finalizados)));
    const passo = Math.max(1, Math.ceil(maximo / 4));
    const topo = passo * 4;

    const L = 640, A = 260, margemEsq = 34, margemDir = 10, margemTopo = 22, margemBase = 30;
    const largura = L - margemEsq - margemDir;
    const altura = A - margemTopo - margemBase;
    const grupo = largura / meses.length;
    const barra = Math.min(34, grupo / 2.6);
    const y = valor => margemTopo + altura - (valor / topo) * altura;

    let svg = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Gráfico de barras com entradas e finalizados nos últimos 6 meses">`;
    for (let i = 0; i <= 4; i++) {
        const valor = i * passo;
        svg += `<line class="grade-linha" x1="${margemEsq}" x2="${L - margemDir}" y1="${y(valor)}" y2="${y(valor)}"/>`;
        svg += `<text class="eixo-texto" x="${margemEsq - 6}" y="${y(valor) + 4}" text-anchor="end">${valor}</text>`;
    }
    meses.forEach((m, i) => {
        const centro = margemEsq + grupo * i + grupo / 2;
        [[m.entradas, '#4e73df', 'entradas', -barra - 2], [m.finalizados, '#1cc88a', 'finalizados', 2]].forEach(([valor, cor, nome, desloc]) => {
            const x = centro + desloc;
            svg += `<rect x="${x}" y="${y(valor)}" width="${barra}" height="${margemTopo + altura - y(valor)}" rx="2" fill="${cor}"><title>${esc(m.rotulo)}: ${valor} ${nome}</title></rect>`;
            if (valor > 0) svg += `<text class="valor-texto" x="${x + barra / 2}" y="${y(valor) - 4}" text-anchor="middle">${valor}</text>`;
        });
        svg += `<text class="eixo-texto" x="${centro}" y="${A - 10}" text-anchor="middle">${esc(m.rotulo)}</text>`;
    });
    svg += '</svg>';
    const semDados = meses.every(m => m.entradas === 0 && m.finalizados === 0);
    container.innerHTML = svg + (semDados
        ? '<div class="text-muted small text-center">Ainda não há entradas nem finalizações nos últimos 6 meses.</div>'
        : '');
}

async function atualizarDashboard() {
    try {
        // Busca todos os processos
        const processos = await obterTodosProcessos({ forcar: true });
        
        // Atualiza contadores
        document.getElementById('totalProcessos').textContent = processos.length;
        document.getElementById('processosAprovados').textContent = processos.filter(p => p.status === 'Aprovado').length;
        document.getElementById('processosReprovados').textContent = processos.filter(p => p.status === 'Reprovado').length;
        document.getElementById('processosCancelados').textContent = processos.filter(p => p.status === 'Cancelado').length;
        document.getElementById('processosFinalizados').textContent = processos.filter(p => p.status === 'Finalizado').length;
        document.getElementById('processosPendentes').textContent = processos.filter(p => p.status === 'Pendente').length;

        renderizarAtencao(processos);
        atualizarSugestoes(processos);
        renderizarResumoLocalizacao(processos);
        buscarFinalizacoes()
            .then(finalizacoes => renderizarGraficoMensal(processos, finalizacoes))
            .catch(() => {
                document.getElementById('graficoMensal').innerHTML =
                    '<div class="text-muted small">Não foi possível carregar os dados do gráfico.</div>';
            });

        // Atualiza últimos processos
        const tbodyUltimos = document.getElementById('ultimosProcessos');
        const ultimosProcessos = processos
            .sort((a, b) => new Date(b.dataInicial) - new Date(a.dataInicial))
            .slice(0, 5);

        tbodyUltimos.innerHTML = '';

        if (processos.length === 0) {
            tbodyUltimos.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
                Nenhum processo cadastrado ainda. <a href="#cadastro">Cadastrar o primeiro processo</a>
            </td></tr>`;
        }
        
        ultimosProcessos.forEach(processo => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Número">${esc(processo.numeroProcesso)}</td>
                <td data-label="Data">${esc(formatarDataBR(processo.dataInicial))}</td>
                <td data-label="Requerente">${esc(processo.requerente)}</td>
                <td data-label="Veículo">${esc(processo.tipoVeiculo)}</td>
                <td data-label="Status"><span class="badge bg-${getStatusColor(processo.status)}">${esc(processo.status)}</span></td>
            `;
            tbodyUltimos.appendChild(tr);
        });

        // Atualiza distribuição por status
        const distribuicaoStatus = document.getElementById('distribuicaoStatus');
        distribuicaoStatus.innerHTML = '';

        const statusCount = {};
        processos.forEach(p => {
            statusCount[p.status] = (statusCount[p.status] || 0) + 1;
        });

        const cores = {
            'Aprovado': 'success',
            'Reprovado': 'danger',
            'Cancelado': 'warning',
            'Pendente': 'secondary',
            'Finalizado': 'info'
        };

        if (processos.length === 0) {
            distribuicaoStatus.innerHTML = '<div class="text-muted small">Sem dados para exibir.</div>';
        }

        Object.entries(statusCount).forEach(([status, quantidade]) => {
            const percentual = ((quantidade / processos.length) * 100).toFixed(1);
            const elemento = document.createElement('div');
            elemento.className = 'list-group-item d-flex justify-content-between align-items-center';
            elemento.innerHTML = `
                <div>
                    <span class="badge bg-${cores[status] || 'secondary'} me-2">${esc(status)}</span>
                    ${quantidade} processo(s)
                </div>
                <span class="badge bg-primary rounded-pill">${percentual}%</span>
            `;
            distribuicaoStatus.appendChild(elemento);
        });

        // Atualiza distribuição por tipo de veículo
        const distribuicaoVeiculos = document.getElementById('distribuicaoVeiculos');
        distribuicaoVeiculos.innerHTML = '';

        const veiculoCount = {};
        processos.forEach(p => {
            veiculoCount[p.tipoVeiculo] = (veiculoCount[p.tipoVeiculo] || 0) + 1;
        });

        if (processos.length === 0) {
            distribuicaoVeiculos.innerHTML = '<div class="text-muted small">Sem dados para exibir.</div>';
        }

        Object.entries(veiculoCount).forEach(([tipo, quantidade]) => {
            const percentual = ((quantidade / processos.length) * 100).toFixed(1);
            const elemento = document.createElement('div');
            elemento.className = 'list-group-item d-flex justify-content-between align-items-center';
            elemento.innerHTML = `
                <div>
                    <i class="fas fa-car me-2"></i>
                    ${esc(tipo) || 'Não especificado'}
                </div>
                <div>
                    <span class="me-3">${quantidade} processo(s)</span>
                    <span class="badge bg-primary rounded-pill">${percentual}%</span>
                </div>
            `;
            distribuicaoVeiculos.appendChild(elemento);
        });
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
    }
}

function calcularEstatisticas(processos, campo) {
    const total = processos.length;
    const contagem = processos.reduce((acc, processo) => {
        const valor = processo[campo];
        acc[valor] = acc[valor] || { quantidade: 0, percentual: 0 };
        acc[valor].quantidade++;
        acc[valor].percentual = (acc[valor].quantidade / total) * 100;
        return acc;
    }, {});

    return contagem;
}

function getStatusColor(status) {
    switch (status) {
        case 'Aprovado':
            return 'success';
        case 'Reprovado':
            return 'danger';
        case 'Cancelado':
            return 'warning';
        default:
            return 'secondary';
    }
}

function getLocalizacaoColor(localizacao) {
    switch (localizacao) {
        case 'Processo finalizado':
            return 'success';
        default:
            return 'secondary';
    }
}

// Configuração da paginação
const ITENS_POR_PAGINA = 10;
let paginaAtual = 1;
let dadosRelatorio = [];

// Funções para Relatórios
async function gerarRelatorio(processos, titulo) {
    relatorioAtual = processos;
    // Atualiza o título do relatório
    document.querySelector('#tabelaRelatorio').closest('.card').querySelector('.card-header h6').textContent = titulo;

    // Limpa a tabela atual
    const tbody = document.getElementById('corpoRelatorio');
    tbody.innerHTML = '';

    // Atualiza o total de registros
    document.getElementById('totalRegistros').textContent = processos.length;

    // Configuração da paginação
    const itensPorPagina = 10;
    let paginaAtual = 1;
    const totalPaginas = Math.ceil(processos.length / itensPorPagina);

    function exibirPagina(pagina) {
        const inicio = (pagina - 1) * itensPorPagina;
        const fim = inicio + itensPorPagina;
        const processosPagina = processos.slice(inicio, fim);

        tbody.innerHTML = '';
        if (processosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Nenhum processo encontrado com os critérios selecionados.</td></tr>';
        }
        processosPagina.forEach(processo => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Número">${esc(processo.numeroProcesso) || '-'}</td>
                <td data-label="Data">${esc(formatarDataBR(processo.dataInicial))}</td>
                <td data-label="Requerente">${esc(processo.requerente)}</td>
                <td data-label="Contato">${esc(processo.contato) || '-'}</td>
                <td data-label="Veículo">${esc(processo.tipoVeiculo)}</td>
                <td data-label="Placa">${esc(processo.placa)}</td>
                <td data-label="Status"><span class="badge bg-${getStatusColor(processo.status)}">${esc(processo.status)}</span></td>
                <td data-label="Motivo">${esc(processo.motivoPendencia) || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Atualiza botões de paginação
        document.getElementById('btnAnterior').disabled = pagina === 1;
        document.getElementById('btnProximo').disabled = pagina === totalPaginas;
        document.getElementById('paginaAtual').textContent = pagina;
    }

    // Event listeners para paginação
    document.getElementById('btnAnterior').onclick = () => {
        if (paginaAtual > 1) {
            paginaAtual--;
            exibirPagina(paginaAtual);
        }
    };

    document.getElementById('btnProximo').onclick = () => {
        if (paginaAtual < totalPaginas) {
            paginaAtual++;
            exibirPagina(paginaAtual);
        }
    };

    // Exibe a primeira página
    exibirPagina(1);

    // Habilita botões de exportação
    document.getElementById('btnExportarPDF').disabled = processos.length === 0;
    document.getElementById('btnExportarExcel').disabled = processos.length === 0;

    // Scroll para a tabela de resultados
    document.querySelector('#tabelaRelatorio').scrollIntoView({ behavior: 'smooth' });
}

// Event Listeners para os formulários de relatório
document.getElementById('formRelatorioPeriodo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const status = document.getElementById('statusPeriodo').value;

    try {
        window.mostrarLoading('Gerando relatório...');
        let processos = await buscarProcessos({});
        
        // Filtra por período
        processos = processos.filter(p => {
            const data = new Date(p.dataInicial);
            return data >= new Date(dataInicio) && data <= new Date(dataFim);
        });

        // Filtra por status se especificado
        if (status) {
            processos = processos.filter(p => p.status === status);
        }

        const titulo = `Relatório por Período: ${dataInicio} a ${dataFim}${status ? ` - Status: ${status}` : ''}`;
        await gerarRelatorio(processos, titulo);
        window.esconderLoading();
    } catch (error) {
        window.esconderLoading();
        mostrarMensagem('Erro ao gerar relatório: ' + error, 'danger');
    }
});

document.getElementById('formRelatorioStatus').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('statusRelatorio').value;
    const tipoVeiculo = document.getElementById('tipoVeiculoStatus').value;

    try {
        window.mostrarLoading('Gerando relatório...');
        let processos = await buscarProcessos({ status });
        
        if (tipoVeiculo) {
            processos = processos.filter(p => p.tipoVeiculo === tipoVeiculo);
        }

        const titulo = `Relatório por Status: ${status}${tipoVeiculo ? ` - Veículo: ${tipoVeiculo}` : ''}`;
        await gerarRelatorio(processos, titulo);
        window.esconderLoading();
    } catch (error) {
        window.esconderLoading();
        mostrarMensagem('Erro ao gerar relatório: ' + error, 'danger');
    }
});

document.getElementById('formRelatorioVeiculo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipoVeiculo = document.getElementById('tipoVeiculoRelatorio').value;
    const status = document.getElementById('statusVeiculo').value;

    try {
        window.mostrarLoading('Gerando relatório...');
        let processos = await buscarProcessos({ tipoVeiculo });
        
        if (status) {
            processos = processos.filter(p => p.status === status);
        }

        const titulo = `Relatório por Tipo de Veículo: ${tipoVeiculo}${status ? ` - Status: ${status}` : ''}`;
        await gerarRelatorio(processos, titulo);
        window.esconderLoading();
    } catch (error) {
        window.esconderLoading();
        mostrarMensagem('Erro ao gerar relatório: ' + error, 'danger');
    }
});

// Event listener para limpar filtros
document.getElementById('btnLimparFiltros').addEventListener('click', () => {
    // Limpa os formulários
    document.getElementById('formRelatorioPeriodo').reset();
    document.getElementById('formRelatorioStatus').reset();
    document.getElementById('formRelatorioVeiculo').reset();

    // Limpa a tabela de resultados
    document.getElementById('corpoRelatorio').innerHTML = '';
    document.getElementById('totalRegistros').textContent = '0';
    document.getElementById('paginaAtual').textContent = '1';

    // Desabilita botões de navegação
    document.getElementById('btnAnterior').disabled = true;
    document.getElementById('btnProximo').disabled = true;

    // Desabilita botões de exportação
    document.getElementById('btnExportarPDF').disabled = true;
    document.getElementById('btnExportarExcel').disabled = true;

    // Reseta o título do relatório
    document.querySelector('#tabelaRelatorio').closest('.card').querySelector('.card-header h6').textContent = 'Resultado do Relatório';
});

// Funções de exportação de relatórios
function formatarDataBR(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}-${mes}-${ano}`;
}

// Cadastro: rascunho automático e aviso de alterações não salvas
const CAMPOS_CADASTRO = ['numeroProcesso', 'dataInicial', 'requerente', 'contato', 'tipoVeiculo', 'placa', 'chassi', 'status', 'localizacaoFisica', 'motivoPendencia'];
const CAMPOS_EDICAO = ['editarNumeroProcesso', 'editarDataInicial', 'editarRequerente', 'editarContato', 'editarChassi', 'editarTipoVeiculo', 'editarPlaca', 'editarStatus', 'editarMotivoPendencia', 'editarLocalizacaoFisica'];
const CHAVE_RASCUNHO = 'rascunhoCadastro';
let baselineCadastro = null;
let editarBaseline = null;
let editarPermitirFechar = false;
let sugestoesMotivos = [];
let editarStatusOriginal = '';
const STATUS_SENSIVEIS = ['Cancelado', 'Reprovado'];

function fotografar(ids) {
    const valores = {};
    ids.forEach(id => { valores[id] = document.getElementById(id).value; });
    return JSON.stringify(valores);
}

function registrarBaselineCadastro() {
    baselineCadastro = fotografar(CAMPOS_CADASTRO);
}

function cadastroSujo() {
    return baselineCadastro !== null && fotografar(CAMPOS_CADASTRO) !== baselineCadastro;
}

function editarSujo() {
    return editarBaseline !== null
        && document.getElementById('modalEditar').classList.contains('show')
        && fotografar(CAMPOS_EDICAO) !== editarBaseline;
}

function salvarRascunho() {
    try {
        if (cadastroSujo()) {
            localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({
                valores: JSON.parse(fotografar(CAMPOS_CADASTRO)),
                em: new Date().toISOString()
            }));
        } else {
            localStorage.removeItem(CHAVE_RASCUNHO);
        }
    } catch (e) { /* armazenamento indisponível: segue sem rascunho */ }
}

function descartarRascunho() {
    try {
        localStorage.removeItem(CHAVE_RASCUNHO);
    } catch (e) { /* ignora */ }
    const aviso = document.getElementById('rascunhoAviso');
    aviso.classList.add('d-none');
    aviso.classList.remove('d-flex');
}

function restaurarRascunho() {
    try {
        const rascunho = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO));
        if (!rascunho || !rascunho.valores || cadastroSujo()) return;

        CAMPOS_CADASTRO.forEach(id => {
            if (rascunho.valores[id] !== undefined) document.getElementById(id).value = rascunho.valores[id];
        });
        window.dispatchEvent(new Event('regra-localizacao'));

        document.getElementById('rascunhoAvisoTexto').textContent =
            `Rascunho restaurado (salvo em ${new Date(rascunho.em).toLocaleString('pt-BR')}).`;
        const aviso = document.getElementById('rascunhoAviso');
        aviso.classList.remove('d-none');
        aviso.classList.add('d-flex');
    } catch (e) { /* rascunho inválido: ignora */ }
}

// Sugestões a partir dos processos já cadastrados
function frequencias(valores) {
    const mapa = new Map();
    valores.forEach(valor => {
        const texto = String(valor || '').trim();
        const chave = normalizar(texto);
        if (!chave) return;
        const existente = mapa.get(chave);
        if (existente) existente.quantidade++;
        else mapa.set(chave, { texto, quantidade: 1 });
    });
    return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade);
}

function renderizarMotivosFrequentes(containerId, campoId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    container.classList.toggle('d-none', sugestoesMotivos.length === 0);
    if (sugestoesMotivos.length === 0) return;

    const rotulo = document.createElement('span');
    rotulo.className = 'small text-muted align-self-center';
    rotulo.textContent = 'Motivos frequentes:';
    container.appendChild(rotulo);

    sugestoesMotivos.forEach(texto => {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'btn btn-sm btn-outline-secondary';
        botao.textContent = texto;
        botao.title = texto;
        botao.addEventListener('click', () => {
            const campo = document.getElementById(campoId);
            if (!campo.value.trim()) {
                campo.value = texto;
            } else if (!normalizar(campo.value).includes(normalizar(texto))) {
                campo.value = `${campo.value.trim()}; ${texto}`;
            }
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.focus();
        });
        container.appendChild(botao);
    });
}

function atualizarSugestoes(processos) {
    const requerentes = frequencias(processos.map(p => p.requerente)).slice(0, 300);
    document.getElementById('listaRequerentes').innerHTML =
        requerentes.map(r => `<option value="${esc(r.texto)}"></option>`).join('');

    sugestoesMotivos = frequencias(processos.map(p => p.motivoPendencia))
        .filter(m => m.quantidade >= 2 && m.texto.length <= 60)
        .slice(0, 6)
        .map(m => m.texto);
    renderizarMotivosFrequentes('motivosFrequentes', 'motivoPendencia');
    renderizarMotivosFrequentes('editarMotivosFrequentes', 'editarMotivoPendencia');
}

// Motivo da pendência só é obrigatório quando o status é Pendente
function ligarRegraMotivo(statusId, motivoId) {
    const status = document.getElementById(statusId);
    const motivo = document.getElementById(motivoId);
    const rotulo = document.querySelector(`label[for="${motivoId}"]`);
    const aplicar = () => {
        const exige = status.value === 'Pendente';
        motivo.required = exige;
        rotulo.classList.toggle('obrigatorio', exige);
    };
    status.addEventListener('change', aplicar);
    window.addEventListener('regra-localizacao', aplicar);
    aplicar();
}

// Finalizado sugere "Processo finalizado"; combinação incoerente gera aviso
function ligarRegraLocalizacao(statusId, localId, avisoId) {
    const status = document.getElementById(statusId);
    const local = document.getElementById(localId);
    const aviso = document.getElementById(avisoId);

    const verificar = () => {
        let texto = '';
        if (local.value === 'Processo finalizado' && status.value && status.value !== 'Finalizado') {
            texto = `Atenção: a localização "Processo finalizado" não combina com o status ${status.value}.`;
        } else if (status.value === 'Finalizado' && local.value && local.value !== 'Processo finalizado') {
            texto = 'Atenção: processo finalizado, mas a localização não é "Processo finalizado".';
        }
        aviso.textContent = texto;
        aviso.classList.toggle('d-none', !texto);
    };

    status.addEventListener('change', () => {
        if (status.value === 'Finalizado' && !local.value) {
            local.value = 'Processo finalizado';
        }
        verificar();
    });
    local.addEventListener('change', verificar);
    // Dispara também quando o valor é preenchido por código (ex.: modal de edição)
    window.addEventListener('regra-localizacao', verificar);
}

function prepararFormularioCadastro() {
    document.getElementById('dataInicial').value = hojeISO();
    esconderAvisoDuplicado();
    window.dispatchEvent(new Event('regra-localizacao'));
    registrarBaselineCadastro();
}

const escondedoresDuplicidade = [];

function esconderAvisoDuplicado() {
    numeroDuplicadoId = null;
    document.getElementById('avisoDuplicado').classList.add('d-none');
    escondedoresDuplicidade.forEach(esconder => esconder());
}

// Aviso de placa/chassi já cadastrado (comparação sem acento, espaço ou hífen)
function ligarAvisoDuplicidade({ campoId, avisoId, textoId, botaoId, coluna, rotulo }) {
    const campo = document.getElementById(campoId);
    const aviso = document.getElementById(avisoId);
    let alvoId = null;

    const esconder = () => {
        alvoId = null;
        aviso.classList.add('d-none');
    };
    escondedoresDuplicidade.push(esconder);

    campo.addEventListener('input', esconder);
    campo.addEventListener('blur', async () => {
        const valor = normalizar(campo.value);
        if (valor.length < 3) {
            esconder();
            return;
        }
        try {
            const todos = await obterTodosProcessos();
            if (normalizar(campo.value) !== valor) return; // campo mudou durante a consulta
            const iguais = todos.filter(p => normalizar(p[coluna]) === valor);
            if (iguais.length === 0) {
                esconder();
                return;
            }
            alvoId = iguais[0].id;
            const quantidade = iguais.length > 1 ? `${iguais.length} processos` : 'um processo';
            document.getElementById(textoId).textContent =
                `Já existe ${quantidade} com ${rotulo} ${campo.value.trim().toUpperCase()}: ${iguais[0].numeroProcesso || 'sem número'} (${iguais[0].requerente || 'sem requerente'}).`;
            aviso.classList.remove('d-none');
        } catch (error) {
            console.warn('Não foi possível verificar duplicidade:', error);
        }
    });
    document.getElementById(botaoId).addEventListener('click', () => {
        if (alvoId) abrirProcessoPorId(alvoId);
    });
}

async function verificarNumeroDuplicado() {
    const campo = document.getElementById('numeroProcesso');
    const numero = campo.value.trim();
    if (!numero) {
        esconderAvisoDuplicado();
        return;
    }

    try {
        const existente = await buscarProcessoPorNumero(numero);
        if (campo.value.trim() !== numero) return; // campo mudou durante a consulta
        if (existente) {
            numeroDuplicadoId = existente.id;
            document.getElementById('avisoDuplicadoTexto').textContent =
                `Já existe o processo ${existente.numeroProcesso} cadastrado (${existente.requerente || 'sem requerente'}).`;
            document.getElementById('avisoDuplicado').classList.remove('d-none');
        } else {
            esconderAvisoDuplicado();
        }
    } catch (error) {
        console.warn('Não foi possível verificar duplicidade:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Testa a conexão com o Supabase
        const conexaoOk = await testarConexao();
        if (!conexaoOk) {
            mostrarMensagem('Erro ao conectar com o banco de dados. Por favor, recarregue a página.', 'danger');
            return;
        }

        // Configurações (prazo de atenção) antes de desenhar o dashboard
        await carregarConfiguracoes();

        // Filtros e ordenação da pesquisa anterior (mesma aba)
        restaurarEstadoPesquisa();

        // Atualiza o dashboard
        atualizarDashboard();

        // Navegação
        document.querySelectorAll('#sidebar a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navegarPara(e.target.closest('a').dataset.page);
            });
        });

        // Página inicial conforme a URL (#pesquisa etc.) e botão Voltar do navegador
        window.addEventListener('hashchange', () => {
            if (abrirLinkDeProcesso()) return;
            const destino = location.hash.slice(1);
            const atual = document.querySelector('.page.active');
            if (atual && atual.id === destino) return; // já está nessa página
            navegarPara(destino, { atualizarHash: false });
        });
        if (location.hash && !abrirLinkDeProcesso()) {
            navegarPara(location.hash.slice(1), { atualizarHash: false });
        }

        // Painel do processo (anotações, lembretes, relacionados) e "Para hoje"
        iniciarPainelProcesso({ aoAbrirProcesso: abrirProcessoPorId, obterTodosProcessos });

        // Formulário de cadastro
        prepararFormularioCadastro();

        ligarAvisoDuplicidade({ campoId: 'placa', avisoId: 'avisoPlaca', textoId: 'avisoPlacaTexto', botaoId: 'btnAbrirPlaca', coluna: 'placa', rotulo: 'a placa' });
        ligarAvisoDuplicidade({ campoId: 'chassi', avisoId: 'avisoChassi', textoId: 'avisoChassiTexto', botaoId: 'btnAbrirChassi', coluna: 'chassi', rotulo: 'o chassi' });

        const campoNumero = document.getElementById('numeroProcesso');
        campoNumero.addEventListener('input', esconderAvisoDuplicado);
        campoNumero.addEventListener('blur', verificarNumeroDuplicado);
        document.getElementById('btnAbrirDuplicado').addEventListener('click', () => {
            if (numeroDuplicadoId) window.abrirModalEditar(numeroDuplicadoId);
        });

        const salvarCadastro = async () => {
            const processo = coletarDadosProcesso();

            // Placa agora é opcional; nenhuma validação bloqueante é aplicada

            if (!validarData(processo.dataInicial)) {
                mostrarMensagem('Data inválida', 'warning');
                return;
            }

            try {
                ultimoProcessoCadastradoId = await adicionarProcesso(processo);
                document.getElementById('cadastroSucessoNumero').textContent = processo.numeroProcesso || '(sem número)';
                const manter = document.getElementById('manterDados').checked;
                const anteriores = {
                    status: processo.status,
                    localizacaoFisica: processo.localizacaoFisica,
                    tipoVeiculo: processo.tipoVeiculo
                };
                limparFormulario('processoForm');
                prepararFormularioCadastro();
                if (manter) {
                    Object.entries(anteriores).forEach(([campo, valor]) => {
                        document.getElementById(campo).value = valor;
                    });
                    window.dispatchEvent(new Event('regra-localizacao'));
                    registrarBaselineCadastro();
                }
                descartarRascunho();
                pesquisaCarregada = false;
                new bootstrap.Modal(document.getElementById('modalCadastroSucesso')).show();
                atualizarDashboard();
            } catch (error) {
                mostrarMensagem('Erro ao cadastrar processo: ' + error, 'danger', { tentarNovamente: salvarCadastro });
            }
        };

        document.getElementById('processoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            comBotaoOcupado(e.target.querySelector('button[type="submit"]'), 'Salvando...', salvarCadastro);
        });

        document.getElementById('btnCadastrarOutro').addEventListener('click', () => {
            const modalEl = document.getElementById('modalCadastroSucesso');
            modalEl.addEventListener('hidden.bs.modal', () => {
                document.getElementById('numeroProcesso').focus();
            }, { once: true });
            bootstrap.Modal.getInstance(modalEl).hide();
        });

        document.getElementById('btnVerProcessoCadastrado').addEventListener('click', () => {
            const modalEl = document.getElementById('modalCadastroSucesso');
            modalEl.addEventListener('hidden.bs.modal', () => {
                if (ultimoProcessoCadastradoId) window.abrirModalEditar(ultimoProcessoCadastradoId);
            }, { once: true });
            bootstrap.Modal.getInstance(modalEl).hide();
        });

        // Formulário de pesquisa
        document.getElementById('pesquisaForm').addEventListener('submit', (e) => {
            e.preventDefault();
            executarPesquisa();
        });

        // Seleção, mover e duplicar (delegação de eventos na tabela)
        const tabelaResultados = document.getElementById('tabelaResultados');
        tabelaResultados.addEventListener('change', (e) => {
            if (!e.target.classList.contains('chk-linha')) return;
            const tr = e.target.closest('tr');
            const id = Number(tr.dataset.id);
            if (e.target.checked) pesquisaSelecionados.add(id);
            else pesquisaSelecionados.delete(id);
            tr.classList.toggle('linha-selecionada', e.target.checked);
            atualizarBarraLote();
        });

        tabelaResultados.addEventListener('click', (e) => {
            const botao = e.target.closest('[data-acao]');
            if (!botao) return;
            const id = Number(botao.closest('tr').dataset.id);
            const processo = pesquisaProcessosCache.find(p => p.id === id);
            if (!processo) return;

            if (botao.dataset.acao === 'mover') {
                aplicarMovimentacao([id], { localizacaoFisica: botao.dataset.valor });
            } else if (botao.dataset.acao === 'status') {
                aplicarMovimentacao([id], { status: botao.dataset.valor });
            } else if (botao.dataset.acao === 'duplicar') {
                duplicarProcesso(processo);
            } else if (botao.dataset.acao === 'etiqueta') {
                imprimirEtiqueta(processo);
            }
        });

        const alternarPagina = (marcar) => {
            pesquisaIdsPagina.forEach(id => marcar ? pesquisaSelecionados.add(id) : pesquisaSelecionados.delete(id));
            renderizarTabelaPesquisaPaginada();
        };
        document.getElementById('loteTodos').addEventListener('change', (e) => alternarPagina(e.target.checked));
        document.getElementById('loteTodosMobile').addEventListener('change', (e) => alternarPagina(e.target.checked));

        document.getElementById('loteMenuLocal').innerHTML = itensMenuHtml(LOCALIZACOES, 'lote-mover');
        document.getElementById('loteMenuStatus').innerHTML = itensMenuHtml(STATUS_LISTA, 'lote-status');
        document.getElementById('pesquisaLote').addEventListener('click', (e) => {
            const botao = e.target.closest('[data-acao]');
            if (!botao) return;
            const ids = [...pesquisaSelecionados];
            aplicarMovimentacao(ids, botao.dataset.acao === 'lote-mover'
                ? { localizacaoFisica: botao.dataset.valor }
                : { status: botao.dataset.valor });
        });
        document.getElementById('loteLimpar').addEventListener('click', () => {
            pesquisaSelecionados.clear();
            renderizarTabelaPesquisaPaginada();
        });

        // Receber processo (atalho)
        // Aceita o número digitado, o texto de um leitor de código de barras ou o link do QR (#processo=ID)
        const receberProcesso = async (entrada) => {
            const campo = document.getElementById('receberNumero');
            const texto = String(entrada || '').trim();
            if (!texto) return;

            try {
                const link = /processo=(\d+)/.exec(texto);
                if (link) {
                    campo.value = '';
                    abrirProcessoPorId(Number(link[1]));
                    return;
                }
                const existente = await buscarProcessoPorNumero(texto);
                if (existente) {
                    campo.value = '';
                    abrirProcessoPorId(existente.id);
                } else {
                    campo.value = texto;
                    document.getElementById('receberNumeroNaoEncontrado').textContent = texto;
                    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalReceber')).show();
                }
            } catch (error) {
                mostrarMensagem('Erro ao buscar o processo: ' + error.message, 'danger', { tentarNovamente: () => receberProcesso(texto) });
            }
        };

        document.getElementById('formReceber').addEventListener('submit', (e) => {
            e.preventDefault();
            receberProcesso(document.getElementById('receberNumero').value);
        });

        // Leitura de QR/código de barras pela câmera (navegadores com BarcodeDetector, em HTTPS)
        let fluxoCamera = null;
        let temporizadorLeitura = null;
        const pararCamera = () => {
            clearInterval(temporizadorLeitura);
            if (fluxoCamera) fluxoCamera.getTracks().forEach(faixa => faixa.stop());
            fluxoCamera = null;
        };

        document.getElementById('btnLerCodigo').addEventListener('click', async () => {
            if (!window.isSecureContext || !navigator.mediaDevices || !('BarcodeDetector' in window)) {
                mostrarMensagem('A leitura pela câmera não é suportada neste navegador. Use o aplicativo de câmera do celular para ler o QR da etiqueta: ele abre o processo direto.', 'info');
                return;
            }

            const modalEl = document.getElementById('modalScanner');
            const video = document.getElementById('scannerVideo');
            try {
                fluxoCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            } catch (error) {
                mostrarMensagem('Não foi possível acessar a câmera. Verifique a permissão do navegador.', 'danger');
                return;
            }

            let detector;
            try {
                detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf'] });
            } catch (error) {
                detector = new window.BarcodeDetector();
            }

            video.srcObject = fluxoCamera;
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
            video.play().catch(() => {});

            let lendo = false;
            temporizadorLeitura = setInterval(async () => {
                if (lendo) return;
                lendo = true;
                try {
                    const codigos = await detector.detect(video);
                    if (codigos.length > 0) {
                        pararCamera();
                        bootstrap.Modal.getInstance(modalEl).hide();
                        receberProcesso(codigos[0].rawValue);
                    }
                } catch (error) { /* quadro sem imagem: tenta de novo */ }
                lendo = false;
            }, 300);
        });
        document.getElementById('modalScanner').addEventListener('hidden.bs.modal', pararCamera);

        document.getElementById('btnReceberCadastrar').addEventListener('click', () => {
            const modalEl = document.getElementById('modalReceber');
            const campo = document.getElementById('receberNumero');
            const numero = campo.value.trim();
            modalEl.addEventListener('hidden.bs.modal', () => {
                navegarPara('cadastro');
                document.getElementById('numeroProcesso').value = numero;
                campo.value = '';
                document.getElementById('requerente').focus();
            }, { once: true });
            bootstrap.Modal.getInstance(modalEl).hide();
        });

        // Manter dados do último cadastro
        const manterDados = document.getElementById('manterDados');
        try {
            manterDados.checked = localStorage.getItem('manterDadosCadastro') === '1';
        } catch (e) { /* armazenamento indisponível: segue sem lembrar */ }
        manterDados.addEventListener('change', () => {
            try {
                localStorage.setItem('manterDadosCadastro', manterDados.checked ? '1' : '0');
            } catch (e) { /* ignora */ }
        });

        // Pesquisa ao digitar (debounce) e ao trocar filtros
        let timerPesquisa = null;
        const pesquisarComAtraso = () => {
            clearTimeout(timerPesquisa);
            timerPesquisa = setTimeout(() => executarPesquisa({ silencioso: true }), 400);
        };
        ['pesquisaBusca', 'pesquisaNumero', 'pesquisaPlaca'].forEach(id => {
            document.getElementById(id).addEventListener('input', pesquisarComAtraso);
        });
        ['pesquisaTipoVeiculo', 'pesquisaStatus', 'pesquisaLocalizacao'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                if (id === 'pesquisaLocalizacao') pesquisaSemLocalizacao = false;
                executarPesquisa({ silencioso: true });
            });
        });

        document.getElementById('btnLimparPesquisa').addEventListener('click', () => {
            limparFiltrosPesquisa();
            executarPesquisa({ silencioso: true });
        });

        // Ordenação por coluna
        document.querySelectorAll('th.ordenavel').forEach(th => {
            th.addEventListener('click', () => {
                const campo = th.dataset.ordenar;
                if (pesquisaOrdenacao.campo === campo) {
                    pesquisaOrdenacao.dir = pesquisaOrdenacao.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    pesquisaOrdenacao = { campo, dir: campo === 'dataInicial' ? 'desc' : 'asc' };
                }
                pesquisaPaginaAtual = 1;
                salvarEstadoPesquisa();
                renderizarTabelaPesquisaPaginada();
            });
        });

        document.getElementById('pesquisaOrdenarMobile').addEventListener('change', (e) => {
            const [campo, dir] = e.target.value.split(':');
            pesquisaOrdenacao = { campo, dir };
            pesquisaPaginaAtual = 1;
            salvarEstadoPesquisa();
            renderizarTabelaPesquisaPaginada();
        });

        // Rascunho automático e alterações não salvas
        const formCadastro = document.getElementById('processoForm');
        let timerRascunho = null;
        const agendarRascunho = () => {
            clearTimeout(timerRascunho);
            timerRascunho = setTimeout(salvarRascunho, 500);
        };
        formCadastro.addEventListener('input', agendarRascunho);
        formCadastro.addEventListener('change', agendarRascunho);
        document.getElementById('btnDescartarRascunho').addEventListener('click', () => {
            limparFormulario('processoForm');
            prepararFormularioCadastro();
            descartarRascunho();
        });
        restaurarRascunho();

        window.addEventListener('beforeunload', (e) => {
            if (cadastroSujo() || editarSujo()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        const modalEditarEl = document.getElementById('modalEditar');
        const barraDescartar = document.getElementById('editarDescartarBar');
        const mostrarBarraDescartar = (mostrar) => {
            barraDescartar.classList.toggle('d-none', !mostrar);
            barraDescartar.classList.toggle('d-flex', mostrar);
        };
        modalEditarEl.addEventListener('hide.bs.modal', (e) => {
            if (!editarPermitirFechar && editarSujo()) {
                e.preventDefault();
                // o aviso fica na aba Dados
                bootstrap.Tab.getOrCreateInstance(document.getElementById('tabDados')).show();
                mostrarBarraDescartar(true);
            }
        });
        modalEditarEl.addEventListener('hidden.bs.modal', () => {
            editarBaseline = null;
            mostrarBarraDescartar(false);
        });
        document.getElementById('btnContinuarEditando').addEventListener('click', () => mostrarBarraDescartar(false));
        document.getElementById('btnDescartarEdicao').addEventListener('click', () => {
            editarPermitirFechar = true;
            bootstrap.Modal.getInstance(modalEditarEl).hide();
        });

        // Regra: localização física x status
        ligarRegraMotivo('status', 'motivoPendencia');
        ligarRegraMotivo('editarStatus', 'editarMotivoPendencia');
        ligarRegraLocalizacao('status', 'localizacaoFisica', 'localizacaoHint');
        ligarRegraLocalizacao('editarStatus', 'editarLocalizacaoFisica', 'editarLocalizacaoHint');

        // Dashboard: resumo por localização
        const resumoLocal = document.getElementById('resumoLocalizacao');
        const abrirTile = (alvo) => {
            const tile = alvo.closest('.tile-local');
            if (!tile) return;
            if (tile.dataset.semLocal) aplicarFiltrosPesquisa({ semLocalizacao: true });
            else aplicarFiltrosPesquisa({ localizacaoFisica: tile.dataset.local });
        };
        resumoLocal.addEventListener('click', (e) => abrirTile(e.target));
        resumoLocal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                abrirTile(e.target);
            }
        });

        // Configurações: prazo de atenção
        document.getElementById('btnSalvarConfig').addEventListener('click', (e) => comBotaoOcupado(e.currentTarget, 'Salvando...', async () => {
            const campo = document.getElementById('configDiasAtencao');
            const valor = Number(campo.value);
            if (!Number.isInteger(valor) || valor < 1 || valor > 365) {
                mostrarMensagem('Informe um prazo entre 1 e 365 dias.', 'warning');
                return;
            }
            try {
                await salvarConfiguracao('dias_atencao', valor);
                diasAtencao = valor;
                configDisponivel = true;
                atualizarRotulosDiasAtencao();
                if (pesquisaCarregada) renderizarTabelaPesquisaPaginada();
                atualizarDashboard();
                mostrarMensagem(`Prazo de atenção definido para ${valor} dias.`, 'success');
            } catch (error) {
                mostrarMensagem('Não foi possível salvar o prazo. Verifique se a tabela "configuracoes" foi criada no banco (veja configuracoes.sql).', 'danger');
            }
        }));

        // Dashboard: cards clicáveis e atalhos de atenção
        document.querySelectorAll('.card-clicavel').forEach(card => {
            const abrir = () => aplicarFiltrosPesquisa({ status: card.dataset.filtroStatus });
            card.addEventListener('click', abrir);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    abrir();
                }
            });
        });
        document.getElementById('btnVerParados').addEventListener('click', () => {
            aplicarFiltrosPesquisa({ status: 'Pendente' }, { campo: 'dataInicial', dir: 'asc' });
        });
        document.getElementById('btnVerSemLocal').addEventListener('click', () => {
            aplicarFiltrosPesquisa({ status: 'Pendente', semLocalizacao: true }, { campo: 'dataInicial', dir: 'asc' });
        });

        document.getElementById('btnPesquisaAnterior').addEventListener('click', () => {
            if (pesquisaPaginaAtual > 1) {
                pesquisaPaginaAtual--;
                renderizarTabelaPesquisaPaginada();
            }
        });

        document.getElementById('btnPesquisaProximo').addEventListener('click', () => {
            const totalPaginas = Math.max(1, Math.ceil(pesquisaProcessosCache.length / ITENS_POR_PAGINA_PESQUISA));
            if (pesquisaPaginaAtual < totalPaginas) {
                pesquisaPaginaAtual++;
                renderizarTabelaPesquisaPaginada();
            }
        });

        // Exportação da pesquisa (escolha de colunas) e dos relatórios
        const colunasSalvas = () => {
            try {
                const lista = JSON.parse(localStorage.getItem('colunasExportacao'));
                if (Array.isArray(lista) && lista.length > 0) return lista;
            } catch (e) { /* usa o padrão */ }
            return COLUNAS_EXPORT.map(c => c.chave);
        };

        document.getElementById('btnExportar').addEventListener('click', () => {
            const marcadas = colunasSalvas();
            document.getElementById('exportarTotal').textContent = pesquisaProcessosCache.length;
            document.getElementById('exportarColunas').innerHTML = COLUNAS_EXPORT.map(c => `
                <div class="col-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="col-${c.chave}" value="${c.chave}"${marcadas.includes(c.chave) ? ' checked' : ''}>
                        <label class="form-check-label" for="col-${c.chave}">${esc(c.rotulo)}</label>
                    </div>
                </div>`).join('');
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalExportar')).show();
        });

        const exportarPesquisa = (formato) => {
            const chaves = [...document.querySelectorAll('#exportarColunas input:checked')].map(i => i.value);
            if (chaves.length === 0) {
                mostrarMensagem('Selecione ao menos uma coluna.', 'warning');
                return;
            }
            try {
                localStorage.setItem('colunasExportacao', JSON.stringify(chaves));
            } catch (e) { /* ignora */ }

            const colunas = COLUNAS_EXPORT.filter(c => chaves.includes(c.chave));
            const lista = ordenarProcessos(pesquisaProcessosCache);
            try {
                if (formato === 'csv') exportarCSV(lista, colunas, 'processos');
                else exportarPDF(lista, colunas, 'Pesquisa de processos', 'processos');
                bootstrap.Modal.getInstance(document.getElementById('modalExportar')).hide();
                mostrarMensagem(`Arquivo ${formato.toUpperCase()} gerado com ${lista.length} processo(s).`, 'success');
            } catch (error) {
                mostrarMensagem('Erro ao exportar: ' + error, 'danger');
            }
        };
        document.getElementById('btnExportarCsvPesquisa').addEventListener('click', () => exportarPesquisa('csv'));
        document.getElementById('btnExportarPdfPesquisa').addEventListener('click', () => exportarPesquisa('pdf'));

        const tituloRelatorio = () => document.querySelector('#tabelaRelatorio').closest('.card').querySelector('.card-header h6').textContent;
        document.getElementById('btnExportarPDF').addEventListener('click', () => {
            if (relatorioAtual.length === 0) {
                mostrarMensagem('Não há dados para exportar', 'warning');
                return;
            }
            try {
                exportarPDF(relatorioAtual, COLUNAS_EXPORT, tituloRelatorio(), 'relatorio_processos');
                mostrarMensagem('Relatório PDF gerado com sucesso!', 'success');
            } catch (error) {
                mostrarMensagem('Erro ao gerar PDF: ' + error, 'danger');
            }
        });
        document.getElementById('btnExportarExcel').addEventListener('click', () => {
            if (relatorioAtual.length === 0) {
                mostrarMensagem('Não há dados para exportar', 'warning');
                return;
            }
            try {
                exportarCSV(relatorioAtual, COLUNAS_EXPORT, 'relatorio_processos');
                mostrarMensagem('Relatório exportado com sucesso!', 'success');
            } catch (error) {
                mostrarMensagem('Erro ao gerar arquivo: ' + error, 'danger');
            }
        });

        // Visões: salvar a pesquisa atual
        const formVisao = document.getElementById('visaoNovaForm');
        formVisao.addEventListener('submit', (e) => {
            e.preventDefault();
            const nome = document.getElementById('visaoNovaNome').value.trim();
            if (!nome) return;
            const lista = lerVisoesSalvas();
            lista.push({ nome, filtros: filtrosAtivosCompactos(), ordenacao: { ...pesquisaOrdenacao } });
            gravarVisoesSalvas(lista);
            formVisao.classList.add('d-none');
            document.getElementById('visaoNovaNome').value = '';
            renderizarVisoes();
            mostrarMensagem(`Visão "${nome}" salva.`, 'success');
        });
        document.getElementById('visaoNovaCancelar').addEventListener('click', () => {
            formVisao.classList.add('d-none');
        });
        renderizarVisoes();

        // Modal de alteração de status
        document.getElementById('btnSalvarStatus').addEventListener('click', async () => {
            const processoId = Number(document.getElementById('processoId').value);
            const novoStatus = document.getElementById('novoStatus').value;

            if (!novoStatus) {
                mostrarMensagem('Selecione um status', 'warning');
                return;
            }

            try {
                window.mostrarLoading('Alterando status...');
                const processo = await buscarProcessoPorId(processoId);
                processo.status = novoStatus;
                await atualizarProcesso(processo);
                window.esconderLoading();
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('modalAlterarStatus'));
                modal.hide();
                
                mostrarMensagem('Status atualizado com sucesso!');
                recarregarPesquisa(processo && processo.id ? [processo.id] : []);
                atualizarDashboard();
            } catch (error) {
                window.esconderLoading();
                mostrarMensagem('Erro ao alterar status: ' + error, 'danger');
            }
        });

        // Modal de alteração de número
        document.getElementById('btnSalvarNumero').addEventListener('click', async () => {
            const processoId = Number(document.getElementById('processoIdNumero').value);
            const novoNumero = document.getElementById('novoNumero').value;

            if (!novoNumero) {
                mostrarMensagem('Digite o novo número do processo', 'warning');
                return;
            }

            try {
                window.mostrarLoading('Atualizando número...');
                const processo = await buscarProcessoPorId(processoId);
                processo.numeroProcesso = novoNumero;
                await atualizarProcesso(processo);
                window.esconderLoading();
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('modalAlterarNumero'));
                modal.hide();
                
                mostrarMensagem('Número do processo atualizado com sucesso!');
                recarregarPesquisa(processo && processo.id ? [processo.id] : []);
            } catch (error) {
                window.esconderLoading();
                mostrarMensagem('Erro ao alterar número do processo: ' + error, 'danger');
            }
        });

        // Event Listeners para Backup
        document.getElementById('btnBackup').addEventListener('click', async () => {
            try {
                window.mostrarLoading('Gerando backup...');
                await realizarBackup();
                window.esconderLoading();
                mostrarMensagem('Backup realizado com sucesso!', 'success');
            } catch (error) {
                window.esconderLoading();
                mostrarMensagem('Erro ao realizar backup: ' + error.message, 'danger');
            }
        });

        document.getElementById('btnRestaurar').addEventListener('click', () => {
            document.getElementById('inputRestaurar').click();
        });

        document.getElementById('inputRestaurar').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const conteudo = JSON.parse(e.target.result);
                    await restaurarBackup(conteudo);
                    exibirMensagem('Backup restaurado com sucesso!', 'success');
                    // Recarrega a página para atualizar os dados
                    setTimeout(() => location.reload(), 1500);
                } catch (error) {
                    exibirMensagem('Erro ao restaurar backup: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        });

        // Inicializa os tooltips
        document.addEventListener('DOMContentLoaded', () => {
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl);
            });
        });
    } catch (error) {
        mostrarMensagem('Erro ao inicializar o sistema: ' + error.message, 'danger');
    }
}); 