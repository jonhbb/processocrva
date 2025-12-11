// Importação do Supabase usando módulos ES6
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuração do Supabase
const SUPABASE_URL = 'https://hhqzqohaxrvgpnjnoubz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXpxb2hheHJ2Z3Buam5vdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1Mzg3MDMsImV4cCI6MjA2MTExNDcwM30.G7p1B55HlGa6GPguXffBWgullfOiUagpEUV_ezCbVVk';

// Inicialização do cliente Supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Exporta o cliente Supabase
export { supabaseClient as supabase };

// Funções para manipulação de processos
async function adicionarProcesso(processo) {
    try {
        // Ajusta os nomes das colunas
        const processoFormatado = {
            numero_processo: processo.numeroProcesso,
            data_inicial: processo.dataInicial,
            requerente: processo.requerente,
            contato: processo.contato,
            tipo_veiculo: processo.tipoVeiculo,
            placa: processo.placa,
            chassi: processo.chassi,
            status: processo.status,
            motivo_pendencia: processo.motivoPendencia,
            localizacao_fisica: processo.localizacaoFisica
        };

        const { data, error } = await supabaseClient
            .from('processos')
            .insert([processoFormatado])
            .select();

        if (error) throw error;

        // Adiciona o histórico inicial
        await supabaseClient
            .from('historico')
            .insert([{
                processo_id: data[0].id,
                data: new Date().toISOString(),
                tipo: 'status',
                valor: processo.status,
                responsavel: 'Sistema'
            }]);

        return data[0].id;
    } catch (error) {
        throw new Error('Erro ao adicionar processo: ' + error.message);
    }
}

async function atualizarProcesso(processo) {
    try {
        // Ajusta os nomes das colunas
        const processoFormatado = {
            numero_processo: processo.numeroProcesso,
            data_inicial: processo.dataInicial,
            requerente: processo.requerente,
            contato: processo.contato,
            tipo_veiculo: processo.tipoVeiculo,
            placa: processo.placa,
            chassi: processo.chassi,
            status: processo.status,
            motivo_pendencia: processo.motivoPendencia,
            localizacao_fisica: processo.localizacaoFisica
        };

        // Busca o processo antigo
        const { data: processoAntigo, error: erroBusca } = await supabaseClient
            .from('processos')
            .select('*')
            .eq('id', processo.id)
            .single();

        if (erroBusca) throw erroBusca;

        // Atualiza o processo
        const { error: erroAtualizacao } = await supabaseClient
            .from('processos')
            .update(processoFormatado)
            .eq('id', processo.id);

        if (erroAtualizacao) throw erroAtualizacao;

        // Verifica alterações e registra no histórico
        if (processoAntigo.status !== processo.status) {
            await supabaseClient
                .from('historico')
                .insert([{
                    processo_id: processo.id,
                    data: new Date().toISOString(),
                    tipo: 'status',
                    valor: processo.status,
                    responsavel: 'Sistema'
                }]);
        }

        if (processoAntigo.numero_processo !== processo.numero_processo) {
            await supabaseClient
                .from('historico')
                .insert([{
                    processo_id: processo.id,
                    data: new Date().toISOString(),
                    tipo: 'numero',
                    valor: processo.numero_processo,
                    responsavel: 'Sistema'
                }]);
        }
    } catch (error) {
        throw new Error('Erro ao atualizar processo: ' + error.message);
    }
}

async function buscarProcessoPorId(id) {
    try {
        const { data, error } = await supabaseClient
            .from('processos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Processo não encontrado');

        // Converte os nomes das colunas
        return {
            id: data.id,
            numeroProcesso: data.numero_processo,
            dataInicial: data.data_inicial,
            requerente: data.requerente,
            contato: data.contato,
            tipoVeiculo: data.tipo_veiculo,
            placa: data.placa,
            chassi: data.chassi,
            status: data.status,
            motivoPendencia: data.motivo_pendencia,
            localizacaoFisica: data.localizacao_fisica
        };
    } catch (error) {
        throw new Error('Erro ao buscar processo: ' + error.message);
    }
}

async function buscarProcessos(filtros = {}) {
    try {
        let query = supabaseClient
            .from('processos')
            .select('*');

        // Aplica filtros
        if (filtros.numeroProcesso) {
            query = query.ilike('numero_processo', `%${filtros.numeroProcesso}%`);
        }
        if (filtros.placa) {
            query = query.ilike('placa', `%${filtros.placa}%`);
        }
        if (filtros.tipoVeiculo) {
            query = query.eq('tipo_veiculo', filtros.tipoVeiculo);
        }
        if (filtros.status) {
            query = query.eq('status', filtros.status);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Converte os nomes das colunas
        return data.map(processo => ({
            id: processo.id,
            numeroProcesso: processo.numero_processo,
            dataInicial: processo.data_inicial,
            requerente: processo.requerente,
            contato: processo.contato,
            tipoVeiculo: processo.tipo_veiculo,
            placa: processo.placa,
            chassi: processo.chassi,
            status: processo.status,
            motivoPendencia: processo.motivo_pendencia,
            localizacaoFisica: processo.localizacao_fisica
        }));
    } catch (error) {
        throw new Error('Erro ao buscar processos: ' + error.message);
    }
}

async function buscarHistorico(processoId) {
    try {
        const { data, error } = await supabaseClient
            .from('historico')
            .select('*')
            .eq('processo_id', processoId)
            .order('data', { ascending: false });

        if (error) throw error;
        return data;
    } catch (error) {
        throw new Error('Erro ao buscar histórico: ' + error.message);
    }
}

// Funções de exportação
async function realizarBackup() {
    try {
        const { data: processos, error: erroProcessos } = await supabaseClient
            .from('processos')
            .select('*');

        if (erroProcessos) throw erroProcessos;

        const { data: historico, error: erroHistorico } = await supabaseClient
            .from('historico')
            .select('*');

        if (erroHistorico) throw erroHistorico;

        const backup = {
            processos,
            historico
        };

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
        throw new Error('Erro ao realizar backup: ' + error.message);
    }
}

async function restaurarBackup(arquivoBackup) {
    try {
        const backup = JSON.parse(arquivoBackup);

        // Limpar dados existentes
        await supabaseClient.from('historico').delete().neq('id', 0);
        await supabaseClient.from('processos').delete().neq('id', 0);

        // Restaurar processos
        if (backup.processos.length > 0) {
            const { error: erroProcessos } = await supabaseClient
                .from('processos')
                .insert(backup.processos);

            if (erroProcessos) throw erroProcessos;
        }

        // Restaurar histórico
        if (backup.historico.length > 0) {
            const { error: erroHistorico } = await supabaseClient
                .from('historico')
                .insert(backup.historico);

            if (erroHistorico) throw erroHistorico;
        }

        return true;
    } catch (error) {
        throw new Error('Erro ao restaurar backup: ' + error.message);
    }
}

// Função para testar conexão
async function testarConexao() {
    try {
        console.log('Iniciando teste de conexão com o banco...');
        console.log('URL:', SUPABASE_URL);
        
        const { data, error } = await supabaseClient
            .from('credenciais')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Erro ao testar conexão:', error);
            return {
                success: false,
                error: error.message,
                message: 'Erro ao conectar com o banco de dados'
            };
        }

        console.log('Conexão bem-sucedida! Dados encontrados:', data);
        return {
            success: true,
            data: data,
            message: 'Conexão com o banco de dados estabelecida com sucesso'
        };
    } catch (error) {
        console.error('Erro ao testar conexão:', error);
        return {
            success: false,
            error: error.message,
            message: 'Erro ao conectar com o banco de dados'
        };
    }
}

// Função para verificar se a tabela existe
async function verificarTabela(tabela) {
    try {
        console.log(`Verificando existência da tabela ${tabela}...`);
        const { data, error } = await supabaseClient
            .from(tabela)
            .select('count')
            .limit(1);

        if (error) {
            console.error(`Erro ao verificar tabela ${tabela}:`, error);
            return false;
        }

        console.log(`Tabela ${tabela} existe e está acessível`);
        return true;
    } catch (error) {
        console.error(`Erro ao verificar tabela ${tabela}:`, error);
        return false;
    }
}

// Exporta as funções
export {
    adicionarProcesso,
    atualizarProcesso,
    buscarProcessoPorId,
    buscarProcessos,
    buscarHistorico,
    realizarBackup,
    restaurarBackup,
    testarConexao,
    verificarTabela
}; 