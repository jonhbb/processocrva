// Fechamento do dia: o que entrou, mudou de local ou foi finalizado em uma data
import { supabase } from './supabase.js';
import { esc, mostrarMensagem, mostrarToast } from './ui.js';
import { obterUsuarioLogado } from './sessao.js';

let dadosAtuais = null;
let dataAtual = '';

function dataISO(data) {
    const pad = n => String(n).padStart(2, '0');
    return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

function dataBR(iso) {
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

function hora(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// "de → para" gravado no histórico de localização
function partes(valor) {
    const texto = String(valor ?? '');
    const i = texto.indexOf(' → ');
    return i === -1 ? { de: '', para: texto } : { de: texto.slice(0, i), para: texto.slice(i + 3) };
}

// Limites do dia no fuso do navegador
function limitesDoDia(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return {
        inicio: new Date(a, m - 1, d, 0, 0, 0, 0).toISOString(),
        fim: new Date(a, m - 1, d + 1, 0, 0, 0, 0).toISOString()
    };
}

export async function carregarFechamento(iso) {
    const { inicio, fim } = limitesDoDia(iso);

    const [entradas, eventos] = await Promise.all([
        supabase.from('processos')
            .select('id, numero_processo, requerente, tipo_veiculo, status, localizacao_fisica')
            .eq('data_inicial', iso)
            .order('numero_processo', { ascending: true }),
        supabase.from('historico')
            .select('*')
            .gte('data', inicio)
            .lt('data', fim)
            .order('data', { ascending: true })
    ]);
    if (entradas.error) throw entradas.error;
    if (eventos.error) throw eventos.error;

    const doDia = (eventos.data || []).filter(e => e.tipo === 'status' || e.tipo === 'localizacao');
    const ids = [...new Set(doDia.map(e => e.processo_id))];

    // dados do processo de cada evento e, para os eventos de status, se já havia registro antes
    // do dia (o primeiro registro de status é o do cadastro, não uma mudança)
    let processos = [];
    let anteriores = [];
    if (ids.length > 0) {
        const [procs, antes] = await Promise.all([
            supabase.from('processos').select('id, numero_processo, requerente').in('id', ids),
            supabase.from('historico').select('processo_id').eq('tipo', 'status').in('processo_id', ids).lt('data', inicio)
        ]);
        if (procs.error) throw procs.error;
        if (antes.error) throw antes.error;
        processos = procs.data || [];
        anteriores = antes.data || [];
    }

    const porId = new Map(processos.map(p => [p.id, p]));
    const comRegistroAnterior = new Set(anteriores.map(a => a.processo_id));
    const cadastroJaVisto = new Set();

    const enriquecer = (e) => ({
        ...e,
        numero: (porId.get(e.processo_id) || {}).numero_processo,
        requerente: (porId.get(e.processo_id) || {}).requerente
    });

    const locais = [];
    const finalizados = [];
    const statusAlterados = [];

    doDia.forEach(evento => {
        const item = enriquecer(evento);
        if (evento.tipo === 'localizacao') {
            locais.push(item);
            return;
        }
        // primeiro status do processo = cadastro (já aparece em "Entradas")
        if (!comRegistroAnterior.has(evento.processo_id) && !cadastroJaVisto.has(evento.processo_id)) {
            cadastroJaVisto.add(evento.processo_id);
            return;
        }
        (evento.valor === 'Finalizado' ? finalizados : statusAlterados).push(item);
    });

    return {
        data: iso,
        entradas: (entradas.data || []).map(p => ({
            numero: p.numero_processo,
            requerente: p.requerente,
            veiculo: p.tipo_veiculo,
            status: p.status,
            local: p.localizacao_fisica
        })),
        locais,
        finalizados,
        statusAlterados
    };
}

// ---------- Tela ----------

function tabela(colunas, linhas, vazio) {
    if (linhas.length === 0) return `<div class="text-muted small py-2">${esc(vazio)}</div>`;
    return `
        <div class="table-responsive">
            <table class="table table-sm table-striped tabela-cards">
                <thead><tr>${colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${linhas.map(l => `<tr>${l.map((celula, i) => `<td data-label="${esc(colunas[i])}">${celula}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function processoTexto(item) {
    return `<strong>${esc(item.numero) || 'Sem número'}</strong> - ${esc(item.requerente)}`;
}

function secoes(dados) {
    return [
        {
            titulo: 'Entradas', icone: 'fa-inbox', cor: 'primary', total: dados.entradas.length,
            colunas: ['Processo', 'Veículo', 'Status', 'Localização'],
            linhas: dados.entradas.map(p => [processoTexto(p), esc(p.veiculo) || '-', esc(p.status), esc(p.local) || '-']),
            vazio: 'Nenhum processo entrou neste dia.'
        },
        {
            titulo: 'Mudanças de local', icone: 'fa-map-marker-alt', cor: 'info', total: dados.locais.length,
            colunas: ['Hora', 'Processo', 'De → Para', 'Por'],
            linhas: dados.locais.map(e => {
                const { de, para } = partes(e.valor);
                return [esc(hora(e.data)), processoTexto(e), `${esc(de) || '(sem local)'} → ${esc(para)}`, esc(e.responsavel || 'Sistema')];
            }),
            vazio: 'Nenhuma mudança de local neste dia.'
        },
        {
            titulo: 'Finalizados', icone: 'fa-flag-checkered', cor: 'success', total: dados.finalizados.length,
            colunas: ['Hora', 'Processo', 'Por'],
            linhas: dados.finalizados.map(e => [esc(hora(e.data)), processoTexto(e), esc(e.responsavel || 'Sistema')]),
            vazio: 'Nenhum processo foi finalizado neste dia.'
        },
        {
            titulo: 'Outras mudanças de status', icone: 'fa-exchange-alt', cor: 'secondary', total: dados.statusAlterados.length,
            colunas: ['Hora', 'Processo', 'Novo status', 'Por'],
            linhas: dados.statusAlterados.map(e => [esc(hora(e.data)), processoTexto(e), esc(e.valor), esc(e.responsavel || 'Sistema')]),
            vazio: 'Nenhuma outra mudança de status neste dia.'
        }
    ];
}

function renderizar(dados) {
    const lista = secoes(dados);

    document.getElementById('fechamentoResumo').innerHTML = lista.map(s => `
        <div class="col-6 col-md-3">
            <div class="tile-local tile-fechamento">
                <div class="tile-numero text-${s.cor}">${s.total}</div>
                <div class="small text-muted">${esc(s.titulo)}</div>
            </div>
        </div>`).join('');

    document.getElementById('fechamentoConteudo').innerHTML = lista.map(s => `
        <div class="card mb-3">
            <div class="card-header">
                <h5 class="card-title mb-0"><i class="fas ${s.icone}"></i> ${esc(s.titulo)} <span class="badge bg-${s.cor}">${s.total}</span></h5>
            </div>
            <div class="card-body">${tabela(s.colunas, s.linhas, s.vazio)}</div>
        </div>`).join('');

    const total = lista.reduce((soma, s) => soma + s.total, 0);
    document.getElementById('btnFechamentoImprimir').disabled = total === 0;
    document.getElementById('btnFechamentoPdf').disabled = total === 0;
}

export async function abrirFechamento() {
    const campo = document.getElementById('fechamentoData');
    if (!campo.value) campo.value = dataISO(new Date());
    await atualizarFechamento();
}

async function atualizarFechamento() {
    const iso = document.getElementById('fechamentoData').value;
    const aviso = document.getElementById('fechamentoAviso');
    if (!iso) return;

    dataAtual = iso;
    aviso.classList.add('d-none');
    document.getElementById('fechamentoConteudo').innerHTML = '<div class="text-muted">Carregando...</div>';

    try {
        const dados = await carregarFechamento(iso);
        if (iso !== dataAtual) return; // outra data foi escolhida durante a consulta
        dadosAtuais = dados;
        renderizar(dados);
    } catch (error) {
        dadosAtuais = null;
        aviso.textContent = 'Não foi possível carregar o fechamento: ' + error.message;
        aviso.classList.remove('d-none');
        document.getElementById('fechamentoConteudo').innerHTML = '';
        document.getElementById('fechamentoResumo').innerHTML = '';
    }
}

// ---------- Impressão e PDF ----------

function cabecalho(dados) {
    const usuario = obterUsuarioLogado() || {};
    return {
        titulo: `Fechamento do dia ${dataBR(dados.data)}`,
        rodape: `Gerado por ${usuario.nome || 'usuário'} em ${new Date().toLocaleString('pt-BR')}`
    };
}

function imprimir() {
    if (!dadosAtuais) return;
    const { titulo, rodape } = cabecalho(dadosAtuais);
    let area = document.getElementById('areaImpressao');
    if (!area) {
        area = document.createElement('div');
        area.id = 'areaImpressao';
        document.body.appendChild(area);
    }

    area.innerHTML = `
        <div class="relatorio-impressao">
            <h2>CRVA 0371 - Tramandaí/RS</h2>
            <h3>${esc(titulo)}</h3>
            ${secoes(dadosAtuais).map(s => `
                <h4>${esc(s.titulo)} (${s.total})</h4>
                ${s.linhas.length === 0
                    ? `<p class="vazio">${esc(s.vazio)}</p>`
                    : `<table><thead><tr>${s.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
                       <tbody>${s.linhas.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
            `).join('')}
            <p class="rodape">${esc(rodape)}</p>
        </div>`;

    document.body.classList.add('imprimindo-etiqueta');
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('imprimindo-etiqueta');
    }, { once: true });
    window.print();
}

function baixarPdf() {
    if (!dadosAtuais) return;
    const { titulo, rodape } = cabecalho(dadosAtuais);
    const textoPuro = html => String(html).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(15);
        doc.text('CRVA 0371 - Tramandaí/RS', 14, 15);
        doc.setFontSize(12);
        doc.text(titulo, 14, 23);

        let y = 30;
        secoes(dadosAtuais).forEach(secao => {
            doc.setFontSize(11);
            doc.text(`${secao.titulo} (${secao.total})`, 14, y);
            if (secao.linhas.length === 0) {
                doc.setFontSize(9);
                doc.text(secao.vazio, 14, y + 6);
                y += 14;
                return;
            }
            doc.autoTable({
                startY: y + 3,
                head: [secao.colunas],
                body: secao.linhas.map(l => l.map(textoPuro)),
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [66, 139, 202] }
            });
            y = doc.lastAutoTable.finalY + 10;
        });

        doc.setFontSize(8);
        doc.text(rodape, 14, doc.internal.pageSize.getHeight() - 8);
        doc.save(`fechamento_${dadosAtuais.data}.pdf`);
        mostrarToast('PDF do fechamento gerado.', 'success');
    } catch (error) {
        mostrarMensagem('Erro ao gerar o PDF: ' + error, 'danger');
    }
}

export function iniciarFechamento() {
    const campo = document.getElementById('fechamentoData');
    campo.addEventListener('change', atualizarFechamento);

    document.getElementById('btnFechamentoHoje').addEventListener('click', () => {
        campo.value = dataISO(new Date());
        atualizarFechamento();
    });
    document.getElementById('btnFechamentoOntem').addEventListener('click', () => {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        campo.value = dataISO(ontem);
        atualizarFechamento();
    });
    document.getElementById('btnFechamentoAtualizar').addEventListener('click', atualizarFechamento);
    document.getElementById('btnFechamentoImprimir').addEventListener('click', imprimir);
    document.getElementById('btnFechamentoPdf').addEventListener('click', baixarPdf);
}
