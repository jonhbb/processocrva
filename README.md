# Controle de Processos Pendentes - CRVA 0371 Tramandaí/RS

Sistema web interno para controlar os processos de vistoria veicular pendentes do CRVA 0371: onde cada processo está, em que situação e há quanto tempo está parado.

## Funcionalidades

- **Login** de colaboradores, com troca da própria senha (menu lateral) e mensagens de erro na própria tela.
- **Dashboard** com totais por status (cards clicáveis que abrem a pesquisa já filtrada), lista de **atenção** (pendentes há N dias ou mais e pendentes sem localização física), resumo **por localização** (clicável), gráfico de **entradas × finalizados** por mês, últimos processos e distribuições por status e tipo de veículo.
- **Cadastro** organizado em Processo / Requerente / Veículo / Situação, com data de hoje por padrão, opção de manter status/localização/tipo do último cadastro, aviso de **número de processo duplicado** e opção "Cadastrar outro" ou "Ver processo" após salvar.
- **Pesquisa** com busca livre (número, requerente, contato, placa, chassi e motivo), filtros por tipo, status e localização física, busca ao digitar, chips de filtros ativos, ordenação por coluna e destaque em vermelho para pendentes há 30+ dias. No celular a tabela vira cards.
- **Receber processo**: campo no topo de todas as telas; digite o número e Enter para abrir o processo, ou cadastrá-lo se ainda não existir.
- **Ações rápidas na pesquisa**: menu ⋮ em cada linha para mover de localização, alterar status ou duplicar; seleção de vários processos para mover/alterar em lote.
- **Anotações e lembretes no processo**: o modal do processo tem abas Dados, Anotações, Lembretes e Relacionados. Os lembretes de retorno (seus) aparecem no sino e no bloco "Para hoje" do dashboard a partir da data. "Relacionados" lista outros processos com o mesmo requerente, placa ou chassi, e o cadastro avisa quando a placa ou o chassi já existem.
- **QR na etiqueta e leitura pela câmera**: a etiqueta impressa tem um QR que abre o processo (também funciona lendo com o aplicativo de câmera do celular). O botão de câmera ao lado de "Receber" lê QR e códigos de barras em navegadores com suporte (HTTPS); leitores de código de barras USB funcionam no campo "Receber".
- **Histórico** em linha do tempo: toda alteração (status, localização, número, requerente, contato, veículo, motivo...) com valor anterior → novo, responsável (colaborador logado) e tempo em cada etapa.
- **Relatórios** por período, status e veículo, com exportação em PDF/CSV.
- **Configurações** (somente administrador): prazo de atenção (dias) para processos pendentes, backup e restauração dos dados.
- **Credenciais** (administrador e programador): cadastro, perfil e ativação/inativação de usuários.
- **Perfis**: Usuário, Administrador e Programador. O programador tem todos os poderes do administrador e é o único que publica novidades e promove outro programador.
- **Sino de novidades**: cada usuário vê o que mudou no sistema e avisos da equipe, marca como lido (por usuário, no banco) e vê a bolinha de não lidas. O programador publica, edita e exclui novidades em Configurações.
- **Visões da pesquisa**: atalhos prontos (Pendentes, Parados, Sem localização, Perícia, Arquivo Morto) e pesquisas salvas pelo próprio usuário. A busca ignora acentos, maiúsculas, espaços e hífens, e filtros/ordenação são lembrados na aba.
- **Exportar** o resultado da pesquisa em CSV ou PDF, escolhendo as colunas; **etiqueta** imprimível de cada processo; links de ligação/WhatsApp nos contatos.
- **Cadastro com rascunho automático**, aviso de alterações não salvas, sugestões (requerentes e motivos frequentes) e motivo obrigatório só para status Pendente.
- **Segurança de uso**: confirmação ao marcar Cancelado/Reprovado, "Desfazer" após mover/alterar status, aviso de falta de conexão com "Tentar novamente", sessão com aviso antes de expirar por inatividade e opção "Manter-me conectado" (12 h).
- **Acessibilidade e conforto**: tema escuro, tamanho de letra, menu lateral recolhível, atalhos de teclado (`/`, `N`, `R`, `?`), botão "pular para o conteúdo" e cores com contraste adequado.
- A página aberta fica na URL (`dashboard.html#pesquisa`), então F5 e o botão Voltar do navegador funcionam.

> A placa é um campo livre, sem máscara, por decisão da coordenação.

## Tecnologias

- HTML5, CSS3 e JavaScript (módulos ES), sem etapa de build
- [Supabase](https://supabase.com) (PostgreSQL) como banco de dados
- Bootstrap 5.3.0, Font Awesome 6.0.0, jsPDF 2.5.1, jsPDF-AutoTable 3.5.29 e qrcode-generator 1.4.4
- Todas as bibliotecas ficam na pasta `vendor/`, **sem dependência de CDN**: o sistema só precisa de internet para falar com o Supabase.

## Como executar

Basta servir a pasta com qualquer servidor web estático (os módulos ES não funcionam abrindo o arquivo direto por `file://`):

```bash
python3 -m http.server 8000
# acesse http://localhost:8000/index.html
```

Para publicar, copie a pasta para qualquer hospedagem estática (ou servidor com PHP; `index.php` apenas redireciona para o login).

### Banco de dados

As tabelas `processos`, `historico`, `credenciais` e `configuracoes` ficam no Supabase. O script `credenciais.sql` cria a tabela de credenciais e o usuário `admin` inicial; o `perfis_e_novidades.sql` adiciona os perfis e as tabelas do sino (troque `SEU_USUARIO` para definir o programador); o `anotacoes_e_lembretes.sql` cria as tabelas de anotações e lembretes; o `configuracoes.sql` cria a tabela de configurações (prazo de atenção; sem ela o sistema usa 30 dias) — **troque a senha padrão** no primeiro acesso (menu lateral > Alterar minha senha).

A URL e a chave pública (anon) do projeto ficam em `js/supabase.js`.

## Estrutura do projeto

```
.
├── index.html          # Login
├── dashboard.html      # Aplicação (dashboard, cadastro, pesquisa, relatórios, configurações, credenciais)
├── credenciais.sql     # Tabela de credenciais e usuário inicial
├── configuracoes.sql   # Tabela de configurações (prazo de atenção)
├── perfis_e_novidades.sql # Perfis de usuário e tabelas do sino de novidades
├── anotacoes_e_lembretes.sql # Tabelas de anotações e lembretes dos processos
├── css/style.css       # Estilos da aplicação
├── js/
│   ├── app.js          # Lógica principal (cadastro, pesquisa, dashboard, relatórios)
│   ├── auth.js         # Login, sessão e logout
│   ├── credenciais.js  # Gestão de credenciais
│   ├── sessao.js       # Sessão, perfis e inatividade
│   ├── novidades.js    # Sino de novidades e publicação
│   ├── anotacoes.js    # Anotações, lembretes e processos relacionados
│   ├── exportar.js     # Exportação CSV/PDF e etiqueta
│   ├── aparencia.js    # Tema, tamanho de letra e menu recolhido
│   ├── atalhos.js      # Atalhos de teclado
│   ├── supabase.js     # Cliente e consultas ao Supabase
│   └── ui.js           # Toasts, mensagens e escape de HTML
└── vendor/             # Bootstrap, Font Awesome, jsPDF e Supabase (cópias locais)
```

## Atualizando as bibliotecas de `vendor/`

As versões estão fixas (ver "Tecnologias"). Para atualizar, baixe a nova versão pelo npm e substitua os arquivos correspondentes; o cliente Supabase é empacotado com `esbuild` em um único arquivo ESM (`vendor/supabase/supabase.js`).

## Pontos de atenção

- As senhas ainda são comparadas em texto puro no navegador, e o controle de administrador é só de interface. Antes de uso mais amplo, migre para o Supabase Auth (ou hash no servidor) e ative RLS nas tabelas.
- As mensagens de sucesso aparecem como avisos rápidos (toast); erros continuam em modal.

## Licença

MIT.
