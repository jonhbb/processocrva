-- Criação da tabela de credenciais
CREATE TABLE IF NOT EXISTS credenciais (
    id SERIAL PRIMARY KEY,
    nome_colaborador VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    CONSTRAINT credenciais_usuario_key UNIQUE (usuario)
);

-- Inserir usuário administrador padrão (senha: admin123)
INSERT INTO credenciais (nome_colaborador, usuario, senha, status)
VALUES ('Administrador', 'admin', 'admin123', 'ativo')
ON CONFLICT (usuario) DO NOTHING; 