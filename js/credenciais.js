import { supabase } from './supabase.js';

// Função para testar a conexão e verificar os dados
export async function testarConexaoCredenciais() {
    try {
        // Tenta listar as credenciais
        const { data, error } = await supabase
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

// Função para criar nova credencial
export async function criarCredencial(nomeColaborador, usuario, senha) {
    try {
        console.log('Tentando criar credencial:', { nomeColaborador, usuario });
        
        const { data, error } = await supabase
            .from('credenciais')
            .insert([
                {
                    nome_colaborador: nomeColaborador,
                    usuario: usuario,
                    senha: senha,
                    status: 'ativo'
                }
            ])
            .select();

        if (error) {
            console.error('Erro ao criar credencial:', error);
            throw error;
        }

        console.log('Credencial criada com sucesso:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Erro ao criar credencial:', error);
        return { success: false, error: error.message };
    }
}

// Função para listar todas as credenciais
export async function listarCredenciais() {
    try {
        const { data, error } = await supabase
            .from('credenciais')
            .select('*')
            .order('nome_colaborador');

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erro ao listar credenciais:', error);
        return { success: false, error: error.message };
    }
}

// Função para atualizar credencial
export async function atualizarCredencial(id, dados) {
    try {
        const { data, error } = await supabase
            .from('credenciais')
            .update(dados)
            .eq('id', id);

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erro ao atualizar credencial:', error);
        return { success: false, error: error.message };
    }
}

// Função para desativar credencial
export async function desativarCredencial(id) {
    try {
        const { data, error } = await supabase
            .from('credenciais')
            .update({ status: 'inativo' })
            .eq('id', id);

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Erro ao desativar credencial:', error);
        return { success: false, error: error.message };
    }
}

// Função para verificar se o usuário já existe
export async function verificarUsuarioExistente(usuario) {
    try {
        const { data, error } = await supabase
            .from('credenciais')
            .select('usuario')
            .eq('usuario', usuario)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return { success: true, exists: !!data };
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        return { success: false, error: error.message };
    }
} 