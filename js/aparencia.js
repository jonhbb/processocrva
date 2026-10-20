// Aparência: tema claro/escuro, tamanho da fonte e menu lateral recolhido.
// Carregado no <head> (sem módulo) para aplicar as preferências antes de desenhar a página.
(function () {
    var raiz = document.documentElement;
    var TAMANHOS = ['87.5%', '100%', '112.5%', '125%'];

    function ler(chave, padrao) {
        try {
            var valor = localStorage.getItem(chave);
            return valor === null ? padrao : valor;
        } catch (e) {
            return padrao;
        }
    }

    function gravar(chave, valor) {
        try {
            localStorage.setItem(chave, valor);
        } catch (e) { /* sem armazenamento: vale só nesta página */ }
    }

    function aplicar() {
        var tema = ler('tema', 'claro');
        var fonte = parseInt(ler('fonte', '1'), 10);
        if (!(fonte >= 0 && fonte < TAMANHOS.length)) fonte = 1;

        raiz.setAttribute('data-bs-theme', tema === 'escuro' ? 'dark' : 'light');
        raiz.style.fontSize = TAMANHOS[fonte];
        raiz.classList.toggle('sidebar-recolhida', ler('sidebarRecolhida', '0') === '1');
    }

    aplicar();

    document.addEventListener('DOMContentLoaded', function () {
        function ligar(id, acao) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', acao);
        }

        function atualizarBotoes() {
            var escuro = raiz.getAttribute('data-bs-theme') === 'dark';
            var icone = document.querySelector('#btnTema i');
            if (icone) icone.className = 'fas ' + (escuro ? 'fa-sun' : 'fa-moon');
            var botaoTema = document.getElementById('btnTema');
            if (botaoTema) {
                botaoTema.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
                botaoTema.title = botaoTema.getAttribute('aria-label');
            }
            var recolhida = raiz.classList.contains('sidebar-recolhida');
            var botaoMenu = document.getElementById('btnRecolherMenu');
            if (botaoMenu) {
                botaoMenu.setAttribute('aria-expanded', String(!recolhida));
                botaoMenu.setAttribute('aria-label', recolhida ? 'Expandir menu lateral' : 'Recolher menu lateral');
                botaoMenu.title = botaoMenu.getAttribute('aria-label');
            }
        }

        ligar('btnTema', function () {
            gravar('tema', raiz.getAttribute('data-bs-theme') === 'dark' ? 'claro' : 'escuro');
            aplicar();
            atualizarBotoes();
        });
        ligar('btnFonteMais', function () {
            gravar('fonte', String(Math.min(TAMANHOS.length - 1, parseInt(ler('fonte', '1'), 10) + 1)));
            aplicar();
        });
        ligar('btnFonteMenos', function () {
            gravar('fonte', String(Math.max(0, parseInt(ler('fonte', '1'), 10) - 1)));
            aplicar();
        });
        ligar('btnRecolherMenu', function () {
            gravar('sidebarRecolhida', raiz.classList.contains('sidebar-recolhida') ? '0' : '1');
            aplicar();
            atualizarBotoes();
        });

        atualizarBotoes();
    });
})();
