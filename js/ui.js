// Utilitários de interface compartilhados (mensagens, toasts, escape de HTML)

// Escapa texto antes de inserir em innerHTML
export function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Aviso rápido que some sozinho (sucesso, informação, atenção).
// Opcionalmente com uma ação, como "Desfazer": mostrarToast(msg, tipo, { acao: { rotulo, aoClicar }, duracao })
export function mostrarToast(mensagem, tipo = 'success', { acao = null, duracao = null } = {}) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container-app';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const icones = { success: 'fa-check-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `alert alert-${tipo} toast-app shadow d-flex align-items-center mb-2`;
    toast.setAttribute('role', 'status');

    const icone = document.createElement('i');
    icone.className = `fas ${icones[tipo] || icones.info} me-2`;
    const texto = document.createElement('span');
    texto.textContent = mensagem;
    toast.append(icone, texto);

    const fechar = () => {
        toast.classList.add('toast-saindo');
        setTimeout(() => toast.remove(), 300);
    };

    if (acao) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'btn btn-sm btn-outline-dark ms-auto';
        botao.textContent = acao.rotulo;
        botao.addEventListener('click', () => {
            fechar();
            acao.aoClicar();
        }, { once: true });
        toast.appendChild(botao);
    }
    container.appendChild(toast);

    setTimeout(fechar, duracao || (acao ? 8000 : tipo === 'warning' ? 6000 : 3500));
}

// Traduz erros técnicos de rede em uma mensagem compreensível
export function mensagemAmigavel(mensagem) {
    const texto = String(mensagem || '');
    if (!navigator.onLine || /failed to fetch|networkerror|network request failed|load failed/i.test(texto)) {
        return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
    }
    return texto;
}

// Erros continuam em modal (exigem atenção); o restante vira toast.
// Em erros, { tentarNovamente } adiciona o botão "Tentar novamente".
export function mostrarMensagem(mensagem, tipo = 'success', { tentarNovamente = null } = {}) {
    if (tipo !== 'danger') {
        mostrarToast(mensagem, tipo);
        return;
    }
    const modalMensagem = document.getElementById('modalMensagem');
    document.getElementById('modalMensagemTexto').className = 'alert alert-danger';
    document.getElementById('modalMensagemTitulo').textContent = 'Erro';
    document.getElementById('modalMensagemTexto').textContent = mensagemAmigavel(mensagem);

    const botaoRepetir = document.getElementById('modalMensagemRetry');
    if (botaoRepetir) {
        botaoRepetir.classList.toggle('d-none', !tentarNovamente);
        botaoRepetir.onclick = tentarNovamente
            ? () => {
                bootstrap.Modal.getInstance(modalMensagem).hide();
                tentarNovamente();
            }
            : null;
    }
    bootstrap.Modal.getOrCreateInstance(modalMensagem).show();
}

// Confirmação em modal. Retorna uma Promise<boolean>.
export function confirmar({ titulo = 'Confirmar', mensagem, textoConfirmar = 'Confirmar', perigo = false }) {
    return new Promise(resolve => {
        const modalEl = document.getElementById('modalConfirmar');
        document.getElementById('modalConfirmarTitulo').textContent = titulo;
        document.getElementById('modalConfirmarTexto').textContent = mensagem;
        const botao = document.getElementById('btnConfirmarOk');
        botao.textContent = textoConfirmar;
        botao.className = `btn ${perigo ? 'btn-danger' : 'btn-primary'}`;

        let confirmado = false;
        const aoConfirmar = () => {
            confirmado = true;
            bootstrap.Modal.getInstance(modalEl).hide();
        };
        botao.addEventListener('click', aoConfirmar, { once: true });
        modalEl.addEventListener('hidden.bs.modal', () => {
            botao.removeEventListener('click', aoConfirmar);
            resolve(confirmado);
        }, { once: true });
        // o fundo escuro da confirmação precisa ficar acima de outro modal já aberto
        modalEl.addEventListener('shown.bs.modal', () => {
            const fundos = document.querySelectorAll('.modal-backdrop');
            if (fundos.length > 0) fundos[fundos.length - 1].style.zIndex = '1065';
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
}

// Desabilita o botão e mostra "Salvando…" enquanto a ação roda (evita duplo clique)
export async function comBotaoOcupado(botao, texto, acao) {
    if (!botao || botao.disabled) return;
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${esc(texto)}`;
    try {
        return await acao();
    } finally {
        botao.disabled = false;
        botao.innerHTML = original;
    }
}

// Faixa de aviso quando a internet cai
export function iniciarMonitorConexao() {
    let faixa = document.getElementById('bannerOffline');
    if (!faixa) {
        faixa = document.createElement('div');
        faixa.id = 'bannerOffline';
        faixa.className = 'banner-offline d-none';
        faixa.setAttribute('role', 'alert');
        faixa.innerHTML = '<i class="fas fa-wifi me-2"></i>Sem conexão com a internet. Suas alterações não serão salvas até a conexão voltar.';
        document.body.appendChild(faixa);
    }

    const atualizar = () => faixa.classList.toggle('d-none', navigator.onLine);
    window.addEventListener('offline', atualizar);
    window.addEventListener('online', () => {
        atualizar();
        mostrarToast('Conexão restabelecida.', 'success');
    });
    atualizar();
}

// Contato com atalhos para ligar e abrir o WhatsApp (celular com DDD)
export function contatoHtml(contato) {
    const texto = String(contato ?? '').trim();
    if (!texto) return '-';

    const digitos = texto.replace(/\D/g, '');
    const nacional = digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos;
    if (nacional.length < 10 || nacional.length > 11) return esc(texto);

    const completo = '55' + nacional;
    const ligar = `<a class="ms-2" href="tel:+${completo}" title="Ligar" aria-label="Ligar para ${esc(texto)}"><i class="fas fa-phone"></i></a>`;
    const whatsapp = nacional.length === 11
        ? `<a class="ms-2" href="https://wa.me/${completo}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" aria-label="Abrir WhatsApp de ${esc(texto)}"><i class="fab fa-whatsapp"></i></a>`
        : '';
    return `<span>${esc(texto)}${ligar}${whatsapp}</span>`;
}
