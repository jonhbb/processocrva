// Sessão do usuário: por aba (padrão) ou "manter conectado neste computador" (12 horas)
const CHAVE = 'usuarioLogado';
const DURACAO_PERMANENTE_MS = 12 * 60 * 60 * 1000;

export function salvarSessao(usuario, manterConectado = false) {
    encerrarSessao();
    if (manterConectado) {
        localStorage.setItem(CHAVE, JSON.stringify({ usuario, expira: Date.now() + DURACAO_PERMANENTE_MS }));
    } else {
        sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
    }
}

function lerPermanente() {
    try {
        const registro = JSON.parse(localStorage.getItem(CHAVE));
        if (registro && registro.expira > Date.now()) return registro.usuario;
        if (registro) localStorage.removeItem(CHAVE);
    } catch (e) { /* ignora */ }
    return null;
}

export function sessaoPermanente() {
    return lerPermanente() !== null && sessionStorage.getItem(CHAVE) === null;
}

export function obterUsuarioLogado() {
    try {
        const daAba = JSON.parse(sessionStorage.getItem(CHAVE));
        if (daAba) return daAba;
    } catch (e) { /* ignora */ }
    return lerPermanente();
}

export function encerrarSessao() {
    try {
        sessionStorage.removeItem(CHAVE);
        localStorage.removeItem(CHAVE);
    } catch (e) { /* ignora */ }
}

// Avisa antes de encerrar a sessão por inatividade. Não vale para "manter conectado".
export function iniciarMonitorInatividade({ limiteMs = 30 * 60 * 1000, avisoMs = 2 * 60 * 1000, aoAvisar, aoRetomar, aoExpirar }) {
    if (sessaoPermanente()) return null;

    let ultimaAtividade = Date.now();
    let avisando = false;

    const registrar = () => {
        if (!avisando) ultimaAtividade = Date.now();
    };
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(evento => {
        window.addEventListener(evento, registrar, { passive: true });
    });

    const temporizador = setInterval(() => {
        const ocioso = Date.now() - ultimaAtividade;
        if (ocioso >= limiteMs) {
            clearInterval(temporizador);
            aoExpirar();
        } else if (ocioso >= limiteMs - avisoMs) {
            avisando = true;
            aoAvisar(Math.ceil((limiteMs - ocioso) / 1000));
        }
    }, 1000);

    return {
        continuar() {
            ultimaAtividade = Date.now();
            avisando = false;
            if (aoRetomar) aoRetomar();
        }
    };
}
