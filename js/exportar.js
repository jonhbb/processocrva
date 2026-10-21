// Exportação (CSV/PDF) e impressão de etiqueta de processos
import { esc } from './ui.js';

export const COLUNAS_EXPORT = [
    { chave: 'numeroProcesso', rotulo: 'Número' },
    { chave: 'dataInicial', rotulo: 'Data' },
    { chave: 'requerente', rotulo: 'Requerente' },
    { chave: 'contato', rotulo: 'Contato' },
    { chave: 'tipoVeiculo', rotulo: 'Veículo' },
    { chave: 'placa', rotulo: 'Placa' },
    { chave: 'chassi', rotulo: 'Chassi' },
    { chave: 'status', rotulo: 'Status' },
    { chave: 'motivoPendencia', rotulo: 'Motivo da pendência' },
    { chave: 'localizacaoFisica', rotulo: 'Localização física' }
];

function formatarData(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    return `${dia}-${mes}-${ano}`;
}

function valorCelula(processo, chave) {
    const valor = chave === 'dataInicial' ? formatarData(processo[chave]) : processo[chave];
    return valor == null ? '' : String(valor);
}

function dataArquivo() {
    return new Date().toISOString().slice(0, 10);
}

function baixarArquivo(blob, nome) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// CSV com separador ";" e BOM (abre direto no Excel em português)
export function exportarCSV(processos, colunas, nomeBase = 'processos') {
    const celula = (texto) => {
        // evita que o Excel interprete o conteúdo como fórmula
        const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
        return `"${seguro.replace(/"/g, '""')}"`;
    };
    const linhas = [
        colunas.map(c => celula(c.rotulo)).join(';'),
        ...processos.map(p => colunas.map(c => celula(valorCelula(p, c.chave))).join(';'))
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    baixarArquivo(blob, `${nomeBase}_${dataArquivo()}.csv`);
}

export function exportarPDF(processos, colunas, titulo, nomeBase = 'processos') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: colunas.length > 6 ? 'landscape' : 'portrait' });

    doc.setFontSize(15);
    doc.text('CRVA 0371 - Tramandaí/RS', 14, 15);
    doc.setFontSize(11);
    doc.text(titulo, 14, 23);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} - ${processos.length} processo(s)`, 14, 29);

    doc.autoTable({
        startY: 34,
        head: [colunas.map(c => c.rotulo)],
        body: processos.map(p => colunas.map(c => valorCelula(p, c.chave) || '-')),
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
    });

    doc.save(`${nomeBase}_${dataArquivo()}.pdf`);
}

// Etiqueta/comprovante para colar na pasta física
export function imprimirEtiqueta(processo) {
    let area = document.getElementById('areaImpressao');
    if (!area) {
        area = document.createElement('div');
        area.id = 'areaImpressao';
        document.body.appendChild(area);
    }

    const linha = (rotulo, valor) =>
        `<div><span class="etiqueta-rotulo">${esc(rotulo)}</span> ${esc(valor) || '-'}</div>`;

    area.innerHTML = `
        <div class="etiqueta">
            <div class="etiqueta-topo">CRVA 0371 - Tramandaí/RS</div>
            <div class="etiqueta-numero">${esc(processo.numeroProcesso) || 'Sem número'}</div>
            ${linha('Requerente:', processo.requerente)}
            ${linha('Contato:', processo.contato)}
            ${linha('Veículo:', [processo.tipoVeiculo, processo.placa].filter(Boolean).join(' - '))}
            ${linha('Chassi:', processo.chassi)}
            ${linha('Data inicial:', formatarData(processo.dataInicial))}
            ${linha('Status:', processo.status)}
            <div class="etiqueta-local">${esc(processo.localizacaoFisica) || 'Sem localização'}</div>
            ${linha('Motivo:', processo.motivoPendencia)}
            <div class="etiqueta-rodape">Impresso em ${esc(new Date().toLocaleString('pt-BR'))}</div>
        </div>`;

    // QR que abre o processo (a câmera do celular lê e o sistema abre direto)
    if (window.qrcode && processo.id !== undefined) {
        const qr = window.qrcode(0, 'M');
        qr.addData(new URL(`dashboard.html#processo=${processo.id}`, location.href).href);
        qr.make();
        area.querySelector('.etiqueta-numero').insertAdjacentHTML(
            'beforebegin',
            `<div class="etiqueta-qr" aria-label="QR do processo">${qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div>`
        );
    }

    document.body.classList.add('imprimindo-etiqueta');
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('imprimindo-etiqueta');
    }, { once: true });
    window.print();
}
