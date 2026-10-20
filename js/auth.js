import { supabase } from './supabase.js';
import { obterUsuarioLogado, encerrarSessao } from './sessao.js';

// Verifica o login. Retorna o usuário, ou null se usuário/senha forem inválidos.
// Lança erro quando não foi possível consultar o banco (ex.: sem conexão).
async function verificarLogin(usuario, senha) {
    const { data, error } = await supabase
        .from('credenciais')
        .select('*')
        .eq('usuario', usuario)
        .eq('status', 'ativo')
        .maybeSingle();

    if (error) {
        console.error('Erro ao verificar login:', error);
        throw error;
    }
    if (!data) return null;

    // Aqui você deve implementar a verificação da senha com hash
    // Por enquanto, estamos usando comparação direta
    if (data.senha === senha) {
        return {
            id: data.id,
            usuario: data.usuario,
            nome: data.nome_colaborador
        };
    }
    return null;
}

// Função para verificar se está logado
function verificarSessao() {
    return obterUsuarioLogado() !== null;
}

// Função para fazer logout
function fazerLogout() {
    console.log('Iniciando processo de logout');
    try {
        // Limpa a sessão
        encerrarSessao();
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