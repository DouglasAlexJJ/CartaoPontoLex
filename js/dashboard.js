function abrirModalNovo() { document.getElementById('modal-novo').classList.remove('escondido'); }
function fecharModalNovo() { document.getElementById('modal-novo').classList.add('escondido'); }

function toggleFolgaInicial() {
    const escala = document.getElementById('escala').value;
    const container = document.getElementById('container-folga-inicial');
    container.style.display = (escala === "6x2" || escala === "personalizada") ? "block" : "none";
}

// Funções para expandir os menus ocultos
function toggleIntervaloFixo() {
    const isChecked = document.getElementById('intervaloFixo').checked;
    document.getElementById('container-intervalo').style.display = isChecked ? "block" : "none";
}

function toggleBatidas() {
    const isChecked = document.getElementById('checkBatidas').checked;
    document.getElementById('container-batidas-input').style.display = isChecked ? "block" : "none";
}

function salvarEIniciar() {
    const reclamanteEl = document.getElementById('reclamante');
    const reclamadaEl = document.getElementById('reclamada');
    const dataInEl = document.getElementById('dataInicio');
    const dataFimEl = document.getElementById('dataFim');
    const escalaEl = document.getElementById('escala');
    const folgaInEl = document.getElementById('dataFolgaInicial');
    const checkBatidas = document.getElementById('checkBatidas');
    const intervaloFixo = document.getElementById('intervaloFixo');

    if (!reclamanteEl || !dataInEl || !dataFimEl) {
        alert("Erro no formulário: Campos ausentes.");
        return;
    }

    // Define a quantidade de batidas
    let qtd = 4; // Padrão
    if (checkBatidas && checkBatidas.checked) {
        qtd = parseInt(document.getElementById('qtdBatidas').value) || 4;
    }

    const config = {
        reclamante: reclamanteEl.value.trim(),
        reclamada: reclamadaEl ? reclamadaEl.value.trim() : '',
        dataInicio: dataInEl.value,
        dataFim: dataFimEl.value,
        escala: escalaEl.value,
        dataFolgaInicial: folgaInEl ? folgaInEl.value : '',
        padraoE: document.getElementById('padraoE').value,
        padraoS: document.getElementById('padraoS').value,
        intervaloFixo: intervaloFixo ? intervaloFixo.checked : false,
        qtdBatidas: qtd, // AQUI VAI A QUANTIDADE ESCOLHIDA
        trabPers: 6,
        folgaPers: 2
    };

    if (!config.reclamante || !config.dataInicio || !config.dataFim) {
        alert("Preencha o Nome, Data de Início e Fim!");
        return;
    }

    if (config.escala === "personalizada") {
        config.trabPers = parseInt(prompt("Dias de TRABALHO?", "5")) || 5;
        config.folgaPers = parseInt(prompt("Dias de FOLGA?", "1")) || 1;
    }

    if ((config.escala === "6x2" || config.escala === "personalizada") && !config.dataFolgaInicial) {
        alert("Selecione a Data da 1ª Folga.");
        return;
    }

    localStorage.setItem('cartaoPontoConfig', JSON.stringify(config));
    window.location.href = "app.html";
}