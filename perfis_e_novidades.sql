-- Perfis de usuário e sino de novidades
-- Rode este script uma vez no SQL Editor do Supabase.

-- 1) Perfis: usuario | administrador | programador
ALTER TABLE credenciais ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'usuario';
ALTER TABLE credenciais DROP CONSTRAINT IF EXISTS credenciais_perfil_check;
ALTER TABLE credenciais ADD CONSTRAINT credenciais_perfil_check
    CHECK (perfil IN ('usuario', 'administrador', 'programador'));

-- O usuário "admin" atual continua administrador
UPDATE credenciais SET perfil = 'administrador' WHERE usuario = 'admin' AND perfil = 'usuario';

-- Marcelo Roque precisa de acesso a Credenciais: administrador
UPDATE credenciais SET perfil = 'administrador' WHERE usuario = 'Roque';

-- Defina o programador (troque SEU_USUARIO pelo login). O programador tem todos os poderes
-- do administrador e é o único que publica novidades e promove outro programador.
-- UPDATE credenciais SET perfil = 'programador' WHERE usuario = 'SEU_USUARIO';

-- 2) Novidades (o que aparece no sino)
CREATE TABLE IF NOT EXISTS novidades (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    texto TEXT NOT NULL,
    tipo VARCHAR(15) NOT NULL DEFAULT 'novidade' CHECK (tipo IN ('novidade', 'aviso', 'importante')),
    publicada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ,
    autor VARCHAR(100)
);

-- Quem já leu cada novidade (uma linha por usuário e novidade)
CREATE TABLE IF NOT EXISTS novidades_lidas (
    novidade_id INTEGER NOT NULL REFERENCES novidades(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES credenciais(id) ON DELETE CASCADE,
    lida_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (novidade_id, usuario_id)
);

-- 3) Primeiras novidades (só entram se ainda não existirem)
INSERT INTO novidades (titulo, texto, tipo, publicada_em, autor)
SELECT v.titulo, v.texto, 'novidade', v.publicada_em, 'Sistema'
FROM (VALUES
    ('Sino de novidades',
     'Este sino mostra o que mudou no sistema e avisos da equipe. A bolinha vermelha indica o que você ainda não leu.',
     CURRENT_TIMESTAMP),
    ('Receber processo e ações rápidas',
     'Use o campo "Receber processo" no topo para abrir um processo pelo número. Na pesquisa, o menu ⋮ move o processo de localização, altera o status, duplica ou imprime a etiqueta, e dá para selecionar vários de uma vez.',
     CURRENT_TIMESTAMP - INTERVAL '1 minute'),
    ('Histórico em linha do tempo',
     'O histórico de cada processo mostra quem alterou o quê, quando, e quanto tempo ficou em cada etapa.',
     CURRENT_TIMESTAMP - INTERVAL '2 minutes'),
    ('Pesquisa mais completa',
     'Visões salvas, busca que ignora acentos, filtros lembrados e exportação do resultado em CSV ou PDF com as colunas que você escolher.',
     CURRENT_TIMESTAMP - INTERVAL '3 minutes'),
    ('Tema escuro e atalhos de teclado',
     'No menu lateral você troca para o tema escuro e ajusta o tamanho das letras. Pressione ? para ver os atalhos de teclado.',
     CURRENT_TIMESTAMP - INTERVAL '4 minutes')
) AS v(titulo, texto, publicada_em)
WHERE NOT EXISTS (SELECT 1 FROM novidades n WHERE n.titulo = v.titulo);

-- Se o Supabase estiver com RLS ativo, libere o acesso conforme a política do projeto, por exemplo:
-- ALTER TABLE novidades ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "acesso_novidades" ON novidades FOR ALL USING (true) WITH CHECK (true);
-- ALTER TABLE novidades_lidas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "acesso_novidades_lidas" ON novidades_lidas FOR ALL USING (true) WITH CHECK (true);
