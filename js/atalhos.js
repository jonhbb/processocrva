// Atalhos de teclado (ignorados enquanto a pessoa digita em um campo ou há um modal aberto)
function digitando(alvo) {
    return alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));
}

function irPara(pagina, idCampo) {
    location.hash = pagina;
    setTimeout(() => {
        const campo = document.getElementById(idCampo);
        if (campo) campo.focus();
    }, 50);
}

export function iniciarAtalhos() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || digitando(e.target)) return;
        if (document.querySelector('.modal.show')) return;

        switch (e.key) {
            case '/':
                e.preventDefault();
                irPara('pesquisa', 'pesquisaBusca');
                break;
            case 'n':
            case 'N':
                e.preventDefault();
                irPara('cadastro', 'numeroProcesso');
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                document.getElementById('receberNumero').focus();
                break;
            case '?':
                e.preventDefault();
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAtalhos')).show();
                break;
        }
    });

    const botao = document.getElementById('btnAtalhos');
    if (botao) {
        botao.addEventListener('click', () => {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAtalhos')).show();
        });
    }
}
