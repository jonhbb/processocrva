# Sistema de Controle de Processos Pendentes - CRVA 0371 Tramandaí/RS

Este é um sistema web para controle de processos pendentes do CRVA 0371 de Tramandaí/RS. O sistema permite o cadastro, pesquisa e gerenciamento de processos de vistoria de veículos.

## Funcionalidades

- Cadastro de processos com validação de dados
- Pesquisa de processos com múltiplos filtros
- Histórico de alterações de status
- Exportação de dados em CSV
- Interface responsiva
- Validação de placa de veículos
- Controle de status dos processos

## Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (ES6+)
- IndexedDB (SQLite no navegador)
- Bootstrap 5
- Font Awesome

## Instalação

1. Clone este repositório
2. Abra o arquivo `index.html` em um navegador moderno
3. O banco de dados será criado automaticamente na primeira execução

## Estrutura do Projeto

```
.
├── index.html          # Página principal
├── css/
│   └── style.css      # Estilos da aplicação
├── js/
│   ├── app.js         # Lógica principal
│   └── database.js    # Funções do banco de dados
└── README.md          # Este arquivo
```

## Uso

1. **Cadastro de Processos**
   - Acesse a página de cadastro
   - Preencha todos os campos obrigatórios
   - A placa deve seguir o formato ABC1234 ou ABC1A23
   - Clique em "Salvar Processo"

2. **Pesquisa de Processos**
   - Acesse a página de pesquisa
   - Utilize os filtros disponíveis
   - Os resultados serão exibidos em uma tabela
   - Clique nos botões de ação para gerenciar o processo

3. **Exportação de Dados**
   - Na página de pesquisa, utilize os botões de exportação
   - Escolha entre CSV ou PDF
   - O arquivo será baixado automaticamente

## Validações

- Placa de veículo: Formato ABC1234 ou ABC1A23
- Data: Formato válido de data
- Campos obrigatórios: Todos os campos são obrigatórios
- Status: Apenas valores predefinidos (Reprovado, Cancelado, Aprovado)

## Contribuição

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes. 