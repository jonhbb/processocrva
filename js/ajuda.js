// Central de ajuda: perguntas frequentes com busca e atalho para refazer o tour
import { esc, normalizar } from './ui.js';
import { iniciarTour } from './tour.js';

const IR = (pagina, rotulo) =>
    `<button type="button" class="btn btn-sm btn-outline-primary mt-1" data-ir="${pagina}">${rotulo}</button>`;

// Conteúdo estático escrito por nós (por isso o HTML é inserido sem escape)
const GRUPOS = [
    {
        titulo: 'Primeiros passos',
        icone: 'fa-flag',
        itens: [
            {
                p: 'Para que serve o sistema?',
                r: '<p>Controla os processos de vistoria pendentes do CRVA 0371: <strong>onde</strong> cada processo está (localização física), em <strong>que situação</strong> (status) e <strong>há quanto tempo</strong> está parado.</p>'
            },
            {
                p: 'Como me movimento pelo sistema?',
                r: '<p>Pelo <strong>menu lateral</strong> (no celular, toque no botão ☰ no canto de cima). No topo de todas as telas ficam o campo <strong>Receber processo</strong> e o <strong>sino</strong>.</p><p>Pressione <kbd>?</kbd> para ver os atalhos de teclado.</p>'
            },
            {
                p: 'O que significam os status e as localizações?',
                r: '<p><strong>Status:</strong> Pendente, Aprovado, Reprovado, Cancelado e Finalizado.</p><p><strong>Localização física</strong> (onde está o papel): Pendentes, Perícia, Arquivo Morto, Vistoria Avulsa e Processo finalizado.</p>'
            }
        ]
    },
    {
        titulo: 'Cadastro e pesquisa',
        icone: 'fa-search',
        itens: [
            {
                p: 'Como cadastro um processo?',
                r: '<ol><li>Abra <strong>Cadastro</strong> no menu.</li><li>Preencha número, requerente, veículo, status, localização e o motivo da pendência (o motivo é obrigatório quando o status é Pendente).</li><li>Clique em <strong>Salvar Processo</strong>.</li></ol><p>Depois de salvar, escolha <strong>Cadastrar outro</strong> ou <strong>Ver processo</strong>. A caixa "Manter status, localização e tipo do último" poupa trabalho em cadastros seguidos.</p>' + IR('cadastro', 'Ir para o Cadastro')
            },
            {
                p: 'O sistema avisou que o processo, a placa ou o chassi já existe. E agora?',
                r: '<p>É um aviso de possível duplicidade: o sistema compara sem considerar acento, espaço ou hífen. Clique em <strong>Abrir</strong> para ver o processo que já está cadastrado. Se for outro processo mesmo, você pode salvar normalmente.</p>'
            },
            {
                p: 'Fechei a tela ou a internet caiu no meio do cadastro. Perdi tudo?',
                r: '<p>Não. O que você digitou fica guardado como <strong>rascunho</strong> neste computador e volta quando você abre o Cadastro de novo. Use <strong>Descartar rascunho</strong> se não quiser mais.</p>'
            },
            {
                p: 'Como encontro um processo?',
                r: '<ul><li>Em <strong>Pesquisa</strong>, use a <strong>busca livre</strong>: número, nome, contato, placa, chassi ou motivo. Ela ignora acentos e maiúsculas.</li><li>Use os filtros de tipo, status e localização, ou as <strong>visões</strong> prontas (Pendentes, Parados, Sem localização...).</li><li>Clique no título de uma coluna para ordenar.</li><li>Para guardar uma busca, use <strong>Salvar esta pesquisa</strong>.</li></ul>' + IR('pesquisa', 'Ir para a Pesquisa')
            },
            {
                p: 'Por que algumas linhas estão em vermelho?',
                r: '<p>São processos <strong>Pendentes há <span class="dias-atencao">30</span> dias ou mais</strong>. Eles também aparecem no bloco <strong>Atenção</strong> da Página inicial. O administrador pode mudar esse prazo em Configurações.</p>'
            },
            {
                p: 'Como exporto os resultados?',
                r: '<p>Na Pesquisa, clique em <strong>Exportar</strong>, escolha as colunas e baixe em <strong>CSV</strong> (abre no Excel) ou <strong>PDF</strong>. Sai exatamente o que está filtrado na tela.</p>'
            }
        ]
    },
    {
        titulo: 'Dia a dia',
        icone: 'fa-tasks',
        itens: [
            {
                p: 'Como recebo um processo no balcão?',
                r: '<p>Digite o número no campo <strong>Receber processo</strong> (no topo) e pressione Enter, ou leia o QR/código de barras da etiqueta. O sistema abre o processo; se ele ainda não existir, oferece cadastrá-lo com o número já preenchido. Atalho: tecla <kbd>R</kbd>.</p>'
            },
            {
                p: 'Como movo um processo de local ou mudo o status?',
                r: '<p>Na Pesquisa, clique no menu <strong>⋮</strong> da linha e escolha <strong>Mover para</strong> ou <strong>Alterar status</strong>. Apareceu o botão <strong>Desfazer</strong> por alguns segundos: use se errou.</p><p>Para vários de uma vez, marque as caixas à esquerda das linhas e use a barra azul que aparece. Marcar Cancelado ou Reprovado pede confirmação.</p>' + IR('pesquisa', 'Ir para a Pesquisa')
            },
            {
                p: 'Como registro uma observação sobre um processo?',
                r: '<p>Abra o processo (<strong>Editar</strong> na Pesquisa, ou pelo campo Receber) e use a aba <strong>Anotações</strong>. Ficam registrados quem escreveu e quando, e as anotações aparecem também no <strong>Histórico</strong>.</p>'
            },
            {
                p: 'Como crio um lembrete de retorno?',
                r: '<p>No processo, aba <strong>Lembretes</strong>: escolha a data (ou use Amanhã, Em 3 dias, Em 1 semana) e escreva o que lembrar. No dia, o lembrete aparece no <strong>sino</strong> e em <strong>Para hoje</strong> na Página inicial. O lembrete é só seu.</p>'
            },
            {
                p: 'Como vejo o que já aconteceu com um processo?',
                r: '<p>Na Pesquisa, clique em <strong>Histórico</strong>. A linha do tempo mostra cada mudança (status, localização, dados e anotações), quem fez, quando, e quanto tempo o processo ficou em cada etapa.</p>'
            },
            {
                p: 'Como imprimo a etiqueta do processo?',
                r: '<p>No menu <strong>⋮</strong> da linha, escolha <strong>Imprimir etiqueta</strong>. Ela traz o número, a localização e um <strong>QR</strong>: lendo com a câmera do celular, o sistema abre o processo.</p>'
            },
            {
                p: 'Para que serve o Fechamento do dia?',
                r: '<p>Mostra, para a data escolhida, o que <strong>entrou</strong>, <strong>mudou de local</strong>, foi <strong>finalizado</strong> ou teve o <strong>status alterado</strong>, com quem fez e a que horas. Serve para conferir o arquivo e passar o turno, e dá para <strong>imprimir</strong> ou gerar <strong>PDF</strong>.</p>' + IR('fechamento', 'Ir para o Fechamento do dia')
            },
            {
                p: 'O que é a aba "Relacionados"?',
                r: '<p>Lista outros processos com o mesmo requerente, placa ou chassi do processo aberto, para evitar duplicidade e ajudar quando o cidadão volta com outro assunto.</p>'
            }
        ]
    },
    {
        titulo: 'Conta e acesso',
        icone: 'fa-user-shield',
        itens: [
            {
                p: 'Como troco a minha senha?',
                r: '<p>No menu lateral, clique em <strong>Alterar minha senha</strong>, informe a senha atual e a nova (mínimo de 6 caracteres).</p>'
            },
            {
                p: 'Esqueci a minha senha.',
                r: '<p>Procure um administrador do sistema: ele redefine a senha em <strong>Credenciais</strong>. Depois de entrar, troque por uma só sua.</p>'
            },
            {
                p: 'Por que o sistema me desconectou?',
                r: '<p>Por segurança, a sessão termina após <strong>30 minutos sem uso</strong>, e o sistema avisa 2 minutos antes. Seu rascunho de cadastro fica guardado. Na tela de login, a opção <strong>Manter-me conectado neste computador</strong> mantém a sessão por 12 horas (use só em computador pessoal).</p>'
            },
            {
                p: 'Por que não vejo Credenciais e Configurações?',
                r: '<p>Essas telas são só para <strong>administradores</strong> e programadores. Se você precisa delas, peça a um administrador para mudar o seu perfil.</p>'
            },
            {
                p: 'Como mudo para o tema escuro ou aumento as letras?',
                r: '<p>Use os botões na parte de baixo do menu lateral: a lua (tema escuro), <strong>A-</strong> e <strong>A+</strong> (tamanho das letras). A escolha fica salva.</p>'
            },
            {
                p: 'Apareceu uma faixa vermelha dizendo "sem conexão". O que faço?',
                r: '<p>A internet caiu. Suas alterações <strong>não são salvas</strong> enquanto isso. Espere a conexão voltar (a faixa some sozinha) e repita a ação; quando um erro aparecer, use o botão <strong>Tentar novamente</strong>.</p>'
            }
        ]
    }
];

function montar() {
    const contenedor = document.getElementById('ajudaFaq');
    let n = 0;

    contenedor.innerHTML = GRUPOS.map(grupo => `
        <section class="ajuda-grupo mb-4">
            <h5 class="mb-3"><i class="fas ${grupo.icone}"></i> ${esc(grupo.titulo)}</h5>
            <div class="accordion">
                ${grupo.itens.map(item => {
                    const id = `faq-${++n}`;
                    return `
                    <div class="accordion-item ajuda-item" data-busca="${esc(normalizar(item.p + ' ' + item.r.replace(/<[^>]*>/g, ' ')))}">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false" aria-controls="${id}">${esc(item.p)}</button>
                        </h2>
                        <div id="${id}" class="accordion-collapse collapse">
                            <div class="accordion-body">${item.r}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </section>`).join('');
}

function filtrar(texto) {
    const termos = String(texto).split(/\s+/).map(normalizar).filter(Boolean);
    let encontrados = 0;

    document.querySelectorAll('.ajuda-item').forEach(item => {
        const combina = termos.every(t => item.dataset.busca.includes(t));
        item.classList.toggle('d-none', !combina);
        if (combina) encontrados++;
    });
    document.querySelectorAll('.ajuda-grupo').forEach(grupo => {
        grupo.classList.toggle('d-none', !grupo.querySelector('.ajuda-item:not(.d-none)'));
    });
    document.getElementById('ajudaVazio').classList.toggle('d-none', encontrados > 0);

    // poucos resultados: já abre as respostas
    if (termos.length > 0 && encontrados > 0 && encontrados <= 3) {
        document.querySelectorAll('.ajuda-item:not(.d-none) .accordion-collapse').forEach(el => {
            bootstrap.Collapse.getOrCreateInstance(el, { toggle: false }).show();
        });
    }
}

export function iniciarAjuda() {
    montar();

    document.getElementById('ajudaBusca').addEventListener('input', (e) => filtrar(e.target.value));
    document.getElementById('btnRefazerTour').addEventListener('click', () => iniciarTour());

    document.getElementById('ajuda').addEventListener('click', (e) => {
        const botao = e.target.closest('[data-ir]');
        if (botao) location.hash = botao.dataset.ir;
    });
}
