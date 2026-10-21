// Tour guiado de primeiro acesso: destaca partes da tela, um passo por vez
import { obterUsuarioLogado } from './sessao.js';

const PASSOS = [
    {
        alvo: '#sidebarToggle', somenteCelular: true,
        titulo: 'Menu',
        texto: 'Toque neste botão para abrir o menu: Página inicial, Cadastro, Pesquisa, Fechamento do dia, Relatórios e Ajuda.'
    },
    {
        alvo: '#sidebar',
        titulo: 'Menu lateral',
        texto: 'Aqui você navega pelo sistema: o resumo na Página inicial, o Cadastro de processos, a Pesquisa, o Fechamento do dia, os Relatórios e a Ajuda.'
    },
    {
        alvo: '#formReceber',
        titulo: 'Receber processo',
        texto: 'Digite o número do processo (ou leia o QR da etiqueta) e pressione Enter. O sistema abre o processo ou oferece cadastrá-lo. Atalho: tecla R.'
    },
    {
        alvo: '#btnSino',
        titulo: 'Sino de novidades',
        texto: 'Mostra o que mudou no sistema e os seus lembretes de retorno. A bolinha vermelha indica o que ainda não foi lido.'
    },
    {
        alvo: '[data-page="cadastro"]',
        titulo: 'Cadastro',
        texto: 'Cadastre processos novos. Se a internet cair no meio, o que você digitou fica guardado como rascunho.'
    },
    {
        alvo: '[data-page="pesquisa"]',
        titulo: 'Pesquisa',
        texto: 'Busque por nome, placa, chassi ou número, use as visões prontas e o menu ⋮ de cada linha para mover o processo de local. Dentro do processo há abas de Anotações e Lembretes. Atalho: tecla /.'
    },
    {
        alvo: '[data-page="fechamento"]',
        titulo: 'Fechamento do dia',
        texto: 'Veja o que entrou, mudou de local ou foi finalizado em cada dia, e imprima para conferir o arquivo.'
    },
    {
        alvo: '[data-page="ajuda"]',
        titulo: 'Ajuda',
        texto: 'Dúvidas? A Ajuda tem o passo a passo das tarefas do dia a dia e permite refazer este tour quando quiser.'
    }
];

let estado = null;

function chaveVisto() {
    const usuario = obterUsuarioLogado();
    return usuario ? `tourVisto:${usuario.id}` : null;
}

export function tourJaVisto() {
    try {
        const chave = chaveVisto();
        return chave === null || localStorage.getItem(chave) === '1';
    } catch (e) {
        return true; // sem armazenamento, não repete o tour sozinho
    }
}

function marcarVisto() {
    try {
        const chave = chaveVisto();
        if (chave) localStorage.setItem(chave, '1');
    } catch (e) { /* ignora */ }
}

function visivel(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    // fora da tela (menu fechado no celular) conta como não visível
    const naTela = r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
    return r.width > 0 && r.height > 0 && naTela && getComputedStyle(el).visibility !== 'hidden';
}

function passosDisponiveis() {
    return PASSOS.filter(p => {
        const el = document.querySelector(p.alvo);
        if (p.somenteCelular) return visivel(el);
        return !!el; // alvo escondido (menu no celular) vira um cartão no centro
    });
}

function encerrar() {
    if (!estado) return;
    document.removeEventListener('keydown', estado.aoTeclar, true);
    window.removeEventListener('resize', estado.aoRedimensionar);
    estado.raiz.remove();
    estado = null;
    marcarVisto();
}

function posicionar() {
    const { passos, indice, destaque, cartao } = estado;
    const passo = passos[indice];
    const alvo = document.querySelector(passo.alvo);
    const margem = 12;

    if (visivel(alvo)) {
        alvo.scrollIntoView({ block: 'nearest' });
        const r = alvo.getBoundingClientRect();
        destaque.style.display = 'block';
        destaque.style.top = `${r.top - 6}px`;
        destaque.style.left = `${r.left - 6}px`;
        destaque.style.width = `${r.width + 12}px`;
        destaque.style.height = `${r.height + 12}px`;
        estado.raiz.classList.remove('sem-alvo');

        const larguraCartao = cartao.offsetWidth;
        const alturaCartao = cartao.offsetHeight;
        let esquerda = r.right + margem + 6;
        let topo = r.top;
        if (esquerda + larguraCartao > window.innerWidth - margem) {
            // não cabe ao lado: vai abaixo (ou acima) do alvo
            esquerda = Math.min(Math.max(margem, r.left), window.innerWidth - larguraCartao - margem);
            topo = r.bottom + margem + 6;
            if (topo + alturaCartao > window.innerHeight - margem) topo = Math.max(margem, r.top - alturaCartao - margem - 6);
        }
        topo = Math.min(Math.max(margem, topo), window.innerHeight - alturaCartao - margem);
        cartao.style.left = `${esquerda}px`;
        cartao.style.top = `${topo}px`;
    } else {
        destaque.style.display = 'none';
        estado.raiz.classList.add('sem-alvo');
        cartao.style.left = '50%';
        cartao.style.top = '50%';
    }
}

function mostrarPasso() {
    const { passos, indice, cartao } = estado;
    const passo = passos[indice];
    const ultimo = indice === passos.length - 1;

    cartao.innerHTML = `
        <div class="tour-titulo">${passo.titulo}</div>
        <div class="tour-texto">${passo.texto}</div>
        <div class="tour-rodape">
            <span class="tour-contador">${indice + 1} de ${passos.length}</span>
            <span class="tour-botoes">
                <button type="button" class="btn btn-sm btn-link text-muted" data-tour="pular">${ultimo ? '' : 'Pular tour'}</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-tour="anterior"${indice === 0 ? ' disabled' : ''}>Anterior</button>
                <button type="button" class="btn btn-sm btn-primary" data-tour="proximo">${ultimo ? 'Concluir' : 'Próximo'}</button>
            </span>
        </div>`;
    posicionar();
    cartao.querySelector('[data-tour="proximo"]').focus();
}

export function iniciarTour() {
    if (estado) return;
    const passos = passosDisponiveis();
    if (passos.length === 0) return;

    const raiz = document.createElement('div');
    raiz.className = 'tour-raiz';
    raiz.innerHTML = '<div class="tour-destaque"></div><div class="tour-cartao" role="dialog" aria-modal="true" aria-label="Tour do sistema"></div>';
    document.body.appendChild(raiz);

    estado = {
        raiz,
        passos,
        indice: 0,
        destaque: raiz.querySelector('.tour-destaque'),
        cartao: raiz.querySelector('.tour-cartao'),
        aoRedimensionar: () => posicionar(),
        aoTeclar: (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                encerrar();
            } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                if (e.target.closest && e.target.closest('[data-tour]')) return; // o próprio botão trata
                e.preventDefault();
                avancar();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                voltar();
            }
        }
    };

    const avancar = () => {
        if (estado.indice >= estado.passos.length - 1) {
            encerrar();
            return;
        }
        estado.indice++;
        mostrarPasso();
    };
    const voltar = () => {
        if (estado.indice === 0) return;
        estado.indice--;
        mostrarPasso();
    };

    estado.cartao.addEventListener('click', (e) => {
        const botao = e.target.closest('[data-tour]');
        if (!botao) return;
        if (botao.dataset.tour === 'proximo') avancar();
        else if (botao.dataset.tour === 'anterior') voltar();
        else encerrar();
    });
    document.addEventListener('keydown', estado.aoTeclar, true);
    window.addEventListener('resize', estado.aoRedimensionar);
    mostrarPasso();
}

// Primeiro acesso deste usuário neste navegador: inicia sozinho, sem atrapalhar janelas abertas
export function agendarTourDePrimeiroAcesso() {
    if (tourJaVisto()) return;
    setTimeout(() => {
        if (tourJaVisto() || document.querySelector('.modal.show')) return;
        iniciarTour();
    }, 1500);
}
