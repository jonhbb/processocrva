// Funções de Backup
async function realizarBackup() {
    try {
        // Obtém todos os dados do banco
        const processos = await db.processos.toArray();
        const advogados = await db.advogados.toArray();
        const clientes = await db.clientes.toArray();
        const tribunais = await db.tribunais.toArray();
        const varas = await db.varas.toArray();

        // Cria o objeto de backup
        const backup = {
            data: new Date().toISOString(),
            processos,
            advogados,
            clientes,
            tribunais,
            varas
        };

        // Converte para JSON e cria o blob
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        
        // Cria um link para download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_processos_${new Date().toISOString().split('T')[0]}.json`;
        
        // Simula o clique e limpa o objeto URL
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Erro ao realizar backup:', error);
        throw error;
    }
}

async function restaurarBackup(dados) {
    try {
        // Verifica se o backup contém todos os dados necessários
        const tabelasNecessarias = ['processos', 'advogados', 'clientes', 'tribunais', 'varas'];
        for (const tabela of tabelasNecessarias) {
            if (!dados[tabela]) {
                throw new Error(`Backup inválido: dados da tabela ${tabela} não encontrados`);
            }
        }

        // Limpa todas as tabelas
        await db.processos.clear();
        await db.advogados.clear();
        await db.clientes.clear();
        await db.tribunais.clear();
        await db.varas.clear();

        // Restaura os dados
        await db.advogados.bulkAdd(dados.advogados);
        await db.clientes.bulkAdd(dados.clientes);
        await db.tribunais.bulkAdd(dados.tribunais);
        await db.varas.bulkAdd(dados.varas);
        await db.processos.bulkAdd(dados.processos);
    } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        throw error;
    }
} 