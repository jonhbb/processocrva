// Inicialização do banco de dados
let db;

function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('CRVAProcessos', 2);

        request.onerror = (event) => {
            reject('Erro ao abrir o banco de dados');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Criar object store para processos
            if (!db.objectStoreNames.contains('processos')) {
                const processoStore = db.createObjectStore('processos', { keyPath: 'id', autoIncrement: true });
                processoStore.createIndex('numeroProcesso', 'numeroProcesso', { unique: true });
                processoStore.createIndex('placa', 'placa', { unique: false });
                processoStore.createIndex('status', 'status', { unique: false });
            }

            // Criar object store para histórico
            if (!db.objectStoreNames.contains('historico')) {
                const historicoStore = db.createObjectStore('historico', { keyPath: 'id', autoIncrement: true });
                historicoStore.createIndex('processoId', 'processoId', { unique: false });
            }
        };
    });
}

// Funções para manipulação de processos
function adicionarProcesso(processo) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['processos', 'historico'], 'readwrite');
        const processoStore = transaction.objectStore('processos');
        const historicoStore = transaction.objectStore('historico');

        const request = processoStore.add(processo);

        request.onsuccess = (event) => {
            const processoId = event.target.result;
            const historico = {
                processoId: processoId,
                data: new Date(),
                tipo: 'status',
                valor: processo.status,
                responsavel: 'Sistema'
            };
            historicoStore.add(historico);
            resolve(processoId);
        };

        request.onerror = (event) => {
            reject('Erro ao adicionar processo');
        };
    });
}

function atualizarProcesso(processo) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['processos', 'historico'], 'readwrite');
        const processoStore = transaction.objectStore('processos');
        const historicoStore = transaction.objectStore('historico');

        const request = processoStore.put(processo);

        request.onsuccess = () => {
            // Busca o processo antigo para comparar
            const requestAntigo = processoStore.get(processo.id);
            requestAntigo.onsuccess = (event) => {
                const processoAntigo = event.target.result;
                const historico = {
                    processoId: processo.id,
                    data: new Date(),
                    responsavel: 'Sistema'
                };

                // Verifica se houve alteração de status
                if (processoAntigo.status !== processo.status) {
                    historico.tipo = 'status';
                    historico.valor = processo.status;
                    historicoStore.add(historico);
                }

                // Verifica se houve alteração de número
                if (processoAntigo.numeroProcesso !== processo.numeroProcesso) {
                    historico.tipo = 'numero';
                    historico.valor = processo.numeroProcesso;
                    historicoStore.add(historico);
                }

                resolve();
            };
        };

        request.onerror = (event) => {
            reject('Erro ao atualizar processo');
        };
    });
}

function buscarProcessoPorId(id) {
    return new Promise((resolve, reject) => {
        if (!id || isNaN(id)) {
            reject('ID inválido');
            return;
        }

        const transaction = db.transaction(['processos'], 'readonly');
        const processoStore = transaction.objectStore('processos');
        const request = processoStore.get(Number(id));

        request.onsuccess = (event) => {
            const processo = event.target.result;
            if (processo) {
                resolve(processo);
            } else {
                reject('Processo não encontrado');
            }
        };

        request.onerror = (event) => {
            reject('Erro ao buscar processo');
        };
    });
}

function buscarProcessos(filtros = {}) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['processos'], 'readonly');
        const processoStore = transaction.objectStore('processos');
        const request = processoStore.getAll();

        request.onsuccess = (event) => {
            let processos = event.target.result;

            // Aplicar filtros
            if (filtros.numeroProcesso) {
                processos = processos.filter(p => p.numeroProcesso.includes(filtros.numeroProcesso));
            }
            if (filtros.placa) {
                processos = processos.filter(p => p.placa.includes(filtros.placa));
            }
            if (filtros.tipoVeiculo) {
                processos = processos.filter(p => p.tipoVeiculo === filtros.tipoVeiculo);
            }
            if (filtros.status) {
                processos = processos.filter(p => p.status === filtros.status);
            }

            resolve(processos);
        };

        request.onerror = (event) => {
            reject('Erro ao buscar processos');
        };
    });
}

function buscarHistorico(processoId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['historico'], 'readonly');
        const historicoStore = transaction.objectStore('historico');
        const index = historicoStore.index('processoId');
        const request = index.getAll(processoId);

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject('Erro ao buscar histórico');
        };
    });
}

// Funções de exportação
function exportarCSV(processos) {
    const headers = ['Número do Processo', 'Data', 'Requerente', 'Veículo', 'Placa', 'Status', 'Motivo da Pendência'];
    const csvContent = [
        headers.join(','),
        ...processos.map(p => [
            p.numeroProcesso,
            p.dataInicial,
            p.requerente,
            p.tipoVeiculo,
            p.placa,
            p.status,
            p.motivoPendencia
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'processos.csv';
    link.click();
}

function exportarPDF(processos) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(16);
    doc.text('CRVA 0371 - Tramandaí/RS', 14, 15);
    doc.text('Relatório de Processos Pendentes', 14, 25);
    
    // Data do relatório
    doc.setFontSize(10);
    doc.text(`Data do relatório: ${new Date().toLocaleDateString()}`, 14, 35);

    // Tabela de processos
    const headers = [['Nº Processo', 'Data', 'Requerente', 'Veículo', 'Placa', 'Status']];
    const data = processos.map(p => [
        p.numeroProcesso,
        p.dataInicial,
        p.requerente,
        p.tipoVeiculo,
        p.placa,
        p.status
    ]);

    doc.autoTable({
        startY: 40,
        head: headers,
        body: data,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
    });

    // Resumo
    const totalProcessos = processos.length;
    const aprovados = processos.filter(p => p.status === 'Aprovado').length;
    const reprovados = processos.filter(p => p.status === 'Reprovado').length;
    const cancelados = processos.filter(p => p.status === 'Cancelado').length;

    const finalY = doc.previousAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Resumo:', 14, finalY);
    doc.setFontSize(10);
    doc.text(`Total de Processos: ${totalProcessos}`, 14, finalY + 7);
    doc.text(`Processos Aprovados: ${aprovados}`, 14, finalY + 14);
    doc.text(`Processos Reprovados: ${reprovados}`, 14, finalY + 21);
    doc.text(`Processos Cancelados: ${cancelados}`, 14, finalY + 28);

    // Salvar o PDF
    doc.save('relatorio_processos.pdf');
}

// Função de backup do banco de dados
async function realizarBackup() {
    const backup = {
        processos: [],
        historico: []
    };

    try {
        // Backup dos processos
        const processosTransaction = db.transaction(['processos'], 'readonly');
        const processosStore = processosTransaction.objectStore('processos');
        backup.processos = await new Promise((resolve, reject) => {
            const request = processosStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // Backup do histórico
        const historicoTransaction = db.transaction(['historico'], 'readonly');
        const historicoStore = historicoTransaction.objectStore('historico');
        backup.historico = await new Promise((resolve, reject) => {
            const request = historicoStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // Criar arquivo de backup
        const backupStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([backupStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_crva_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        return true;
    } catch (error) {
        console.error('Erro ao realizar backup:', error);
        throw error;
    }
}

// Função para restaurar backup
async function restaurarBackup(arquivoBackup) {
    try {
        const backup = JSON.parse(arquivoBackup);

        // Limpar banco de dados atual
        const processosTransaction = db.transaction(['processos'], 'readwrite');
        const historicoTransaction = db.transaction(['historico'], 'readwrite');
        
        await Promise.all([
            new Promise((resolve, reject) => {
                const request = processosTransaction.objectStore('processos').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = historicoTransaction.objectStore('historico').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            })
        ]);

        // Restaurar dados do backup
        const processosStore = db.transaction(['processos'], 'readwrite').objectStore('processos');
        const historicoStore = db.transaction(['historico'], 'readwrite').objectStore('historico');

        for (const processo of backup.processos) {
            await new Promise((resolve, reject) => {
                const request = processosStore.add(processo);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        for (const historico of backup.historico) {
            await new Promise((resolve, reject) => {
                const request = historicoStore.add(historico);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        return true;
    } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        throw error;
    }
}

// Inicializar o banco de dados quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    initDatabase()
        .then(() => console.log('Banco de dados inicializado com sucesso'))
        .catch(error => console.error('Erro ao inicializar banco de dados:', error));
}); 