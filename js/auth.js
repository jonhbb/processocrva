import { supabase } from './supabase.js';

// Função para verificar login
async function verificarLogin(usuario, senha) {
    try {
        console.log('Tentando fazer login com:', usuario);
        const { data, error } = await supabase
            .from('credenciais')
            .select('*')
            .eq('usuario', usuario)
            .eq('status', 'ativo')
            .single();

        if (error) {
            console.error('Erro ao verificar login:', error);
            throw error;
        }
        if (!data) {
            console.log('Usuário não encontrado');
            return null;
        }

        // Aqui você deve implementar a verificação da senha com hash
        // Por enquanto, estamos usando comparação direta
        if (data.senha === senha) {
            console.log('Login bem-sucedido para:', usuario);
            return {
                id: data.id,
                usuario: data.usuario,
                nome: data.nome_colaborador
            };
        }

        console.log('Senha incorreta para:', usuario);
        return null;
    } catch (error) {
        console.error('Erro ao verificar login:', error);
        return null;
    }
}

// Função para verificar se está logado
function verificarSessao() {
    const usuarioLogado = sessionStorage.getItem('usuarioLogado');
    return usuarioLogado !== null;
}

// Função para fazer logout
function fazerLogout() {
    console.log('Iniciando processo de logout');
    try {
        // Limpa a sessão
        sessionStorage.removeItem('usuarioLogado');
        console.log('Sessão limpa com sucesso');
        
        // Redireciona para a página de login
        window.location.href = 'index.html';
        console.log('Redirecionando para index.html');
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
    }
}

// Exporta as funções
export { verificarLogin, verificarSessao, fazerLogout }; 