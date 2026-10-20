-- Configurações do sistema (ex.: prazo de atenção para processos pendentes)
CREATE TABLE IF NOT EXISTS configuracoes (
    chave VARCHAR(50) PRIMARY KEY,
    valor VARCHAR(255) NOT NULL
);

-- Prazo padrão: 30 dias
INSERT INTO configuracoes (chave, valor)
VALUES ('dias_atencao', '30')
ON CONFLICT (chave) DO NOTHING;

-- Se o Supabase estiver com RLS ativo, libere o acesso conforme a política do projeto, por exemplo:
-- ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "acesso_configuracoes" ON configuracoes FOR ALL USING (true) WITH CHECK (true);
