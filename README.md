# Controle de Processos Pendentes - CRVA 0371 Tramandaí/RS

Sistema web interno para controlar os processos de vistoria veicular pendentes do CRVA 0371: onde cada processo está, em que situação e há quanto tempo está parado.

## Funcionalidades

- **Login** de colaboradores, com troca da própria senha (menu lateral) e mensagens de erro na própria tela.
- **Dashboard** com totais por status (cards clicáveis que abrem a pesquisa já filtrada), lista de **atenção** (pendentes há 30+ dias e pendentes sem localização física), últimos processos e distribuições por status e tipo de veículo.
- **Cadastro** organizado em Processo / Requerente / Veículo / Situação, com data de hoje por padrão, opção de manter status/localização/tipo do último cadastro, aviso de **número de processo duplicado** e opção "Cadastrar outro" ou "Ver processo" após salvar.
- **Pesquisa** com busca livre (número, requerente, contato, placa, chassi e motivo), filtros por tipo, status e localização física, busca ao digitar, chips de filtros ativos, ordenação por coluna e destaque em vermelho para pendentes há 30+ dias. No celular a tabela vira cards.
- **Receber processo**: campo no topo de todas as telas; digite o número e Enter para abrir o processo, ou cadastrá-lo se ainda não existir.
- **Ações rápidas na pesquisa**: menu ⋮ em cada linha para mover de localização, alterar status ou duplicar; seleção de vários processos para mover/alterar em lote.
- **Histórico** de alterações de status e de número do processo.
- **Relatórios** por período, status e veículo, com exportação em PDF/CSV.
- **Configurações** (somente administrador): backup e restauração dos dados.
- **Credenciais** (somente administrador): cadastro e ativação/inativação de usuários.
- A página aberta fica na URL (`dashboard.html#pesquisa`), então F5 e o botão Voltar do navegador funcionam.

> A placa é um campo livre, sem máscara, por decisão da coordenação.

## Tecnologias

- HTML5, CSS3 e JavaScript (módulos ES), sem etapa de build
- [Supabase](https://supabase.com) (PostgreSQL) como banco de dados
- Bootstrap 5.3.0, Font Awesome 6.0.0, jsPDF 2.5.1 e jsPDF-AutoTable 3.5.29
- Todas as bibliotecas ficam na pasta `vendor/`, **sem dependência de CDN**: o sistema só precisa de internet para falar com o Supabase.

## Como executar

Basta servir a pasta com qualquer servidor web estático (os módulos ES não funcionam abrindo o arquivo direto por `file://`):

```bash
python3 -m http.server 8000
# acesse http://localhost:8000/index.html
```

Para publicar, copie a pasta para qualquer hospedagem estática (ou servidor com PHP; `index.php` apenas redireciona para o login).

### Banco de dados

As tabelas `processos`, `historico` e `credenciais` ficam no Supabase. O script `credenciais.sql` cria a tabela de credenciais e o usuário `admin` inicial — **troque a senha padrão** no primeiro acesso (menu lateral > Alterar minha senha).

A URL e a chave pública (anon) do projeto ficam em `js/supabase.js`.

## Estrutura do projeto

```
.
├── index.html          # Login
├── dashboard.html      # Aplicação (dashboard, cadastro, pesquisa, relatórios, configurações, credenciais)
├── credenciais.sql     # Tabela de credenciais e usuário inicial
├── css/style.css       # Estilos da aplicação
├── js/
│   ├── app.js          # Lógica principal (cadastro, pesquisa, dashboard, relatórios)
│   ├── auth.js         # Login, sessão e logout
│   ├── credenciais.js  # Gestão de credenciais
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
