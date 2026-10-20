// Utilitários de interface compartilhados (mensagens, toasts, escape de HTML)

// Escapa texto antes de inserir em innerHTML
export function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Aviso rápido que some sozinho (sucesso, informação, atenção)
export function mostrarToast(mensagem, tipo = 'success') {
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
    container.appendChild(toast);

    const duracao = tipo === 'warning' ? 6000 : 3500;
    setTimeout(() => {
        toast.classList.add('toast-saindo');
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

// Erros continuam em modal (exigem atenção); o restante vira toast
export function mostrarMensagem(mensagem, tipo = 'success') {
    if (tipo !== 'danger') {
        mostrarToast(mensagem, tipo);
        return;
    }
    const modalMensagem = document.getElementById('modalMensagem');
    document.getElementById('modalMensagemTexto').className = 'alert alert-danger';
    document.getElementById('modalMensagemTitulo').textContent = 'Erro';
    document.getElementById('modalMensagemTexto').textContent = mensagem;
    bootstrap.Modal.getOrCreateInstance(modalMensagem).show();
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
