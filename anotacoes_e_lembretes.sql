-- Anotações e lembretes de retorno nos processos
-- Rode este script uma vez no SQL Editor do Supabase.

-- Anotações: observações do dia a dia ("liguei para o requerente, aguarda documento")
CREATE TABLE IF NOT EXISTS anotacoes (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    autor VARCHAR(100),
    usuario_id INTEGER,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_anotacoes_processo ON anotacoes (processo_id, criada_em DESC);

-- Lembretes: cada um pertence a quem criou e aparece no sino e em "Para hoje" a partir da data
CREATE TABLE IF NOT EXISTS lembretes (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL,
    autor VARCHAR(100),
    data_lembrete DATE NOT NULL,
    texto VARCHAR(200),
    concluido BOOLEAN NOT NULL DEFAULT FALSE,
    concluido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lembretes_usuario ON lembretes (usuario_id, concluido, data_lembrete);
CREATE INDEX IF NOT EXISTS idx_lembretes_processo ON lembretes (processo_id);

-- Se o Supabase estiver com RLS ativo, libere o acesso conforme a política do projeto, por exemplo:
-- ALTER TABLE anotacoes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "acesso_anotacoes" ON anotacoes FOR ALL USING (true) WITH CHECK (true);
-- ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "acesso_lembretes" ON lembretes FOR ALL USING (true) WITH CHECK (true);
