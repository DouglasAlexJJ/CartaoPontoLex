/* ==========================================================================
   JAVASCRIPT DO DASHBOARD (PERSISTÊNCIA + LIXEIRA LGPD 30 DIAS)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', carregarDashboard);

function carregarDashboard() {
    let salvos = JSON.parse(localStorage.getItem('cartoesPontoSalvos')) || [];
    const agora = Date.now();
    const trintaDiasEmMs = 30 * 24 * 60 * 60 * 1000;

    // 1. ROTINA DE LIMPEZA LGPD (Auto-Purge 30 dias)
    salvos = salvos.filter(cartao => {
        if (cartao.deletedAt) {
            // Se o tempo na lixeira passou de 30 dias, o filtro remove o cartão definitivamente
            return (agora - cartao.deletedAt) < trintaDiasEmMs;
        }
        return true; 
    });
    // Salva o banco limpo
    localStorage.setItem('cartoesPontoSalvos', JSON.stringify(salvos));

    // 2. SEPARA OS CARTÕES ATIVOS DOS APAGADOS
    const ativos = salvos.filter(c => !c.deletedAt).sort((a, b) => b.dataEdicao - a.dataEdicao);
    const apagados = salvos.filter(c => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

    const gridRecentes = document.querySelector('.grid-recentes');
    const listaSidebar = document.querySelector('.lista-salvos');
    const dashboardMain = document.querySelector('.dashboard-main');

    // Remove lixeira antiga da tela (se houver) para redesenhar
    const lixeiraExistente = document.getElementById('area-lixeira');
    if (lixeiraExistente) lixeiraExistente.remove();

    if (listaSidebar) {
        listaSidebar.innerHTML = '';
        ativos.forEach(cartao => {
            listaSidebar.innerHTML += `
                <li onclick="abrirCartao(${cartao.id})">
                    📄 ${cartao.config.reclamante} <span class="badge-min">${cartao.progresso}%</span>
                </li>
            `;
        });
    }

    if (gridRecentes) {
        gridRecentes.innerHTML = '';
        const ultimos = ativos.slice(0, 8); 
        
        ultimos.forEach(cartao => {
            let corBadge = cartao.progresso === 100 ? 'progresso-alto' : (cartao.progresso > 30 ? 'progresso-medio' : 'progresso-baixo');
            let dataStr = new Date(cartao.dataEdicao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

            gridRecentes.innerHTML += `
                <div class="card-recente" onclick="abrirCartao(${cartao.id})">
                    <div class="card-recente-header">
                        <h4>${cartao.config.reclamante}</h4>
                        <button class="btn-deletar" onclick="event.stopPropagation(); moverParaLixeira(${cartao.id})" title="Mover para Lixeira">🗑️</button>
                    </div>
                    <span class="badge-status ${corBadge}" style="display:inline-block; margin-bottom:10px;">${cartao.progresso}% Concluído</span>
                    <p><strong>Empresa:</strong> ${cartao.config.reclamada || 'Não informada'}</p>
                    <small class="data-edicao">Última edição: ${dataStr}</small>
                </div>
            `;
        });

        gridRecentes.innerHTML += `
            <div class="card-recente vazio" onclick="abrirModalNovo()">
                <span class="icone-vazio">➕</span>
                <p>Novo Cartão</p>
                <small>Clique para iniciar</small>
            </div>
        `;
    }

    // 3. DESENHA A LIXEIRA (Se houver itens apagados)
    if (apagados.length > 0 && dashboardMain) {
        let lixeiraHtml = `
            <div id="area-lixeira" class="sessao-lixeira">
                <h3>🗑️ Lixeira (Retenção LGPD: 30 dias)</h3>
                <p style="color: #94a3b8; font-size: 0.85em; margin-bottom: 20px;">Os cartões aqui serão destruídos automaticamente após 30 dias da data de exclusão.</p>
                <div class="grid-recentes">
        `;

        apagados.forEach(cartao => {
            let diasRestantes = 30 - Math.floor((agora - cartao.deletedAt) / (1000 * 60 * 60 * 24));
            
            lixeiraHtml += `
                <div class="card-recente card-apagado">
                    <div class="card-recente-header">
                        <h4 style="text-decoration: line-through; color: #94a3b8;">${cartao.config.reclamante}</h4>
                        <button class="btn-restaurar" onclick="restaurarCartao(${cartao.id})">♻️ Restaurar</button>
                    </div>
                    <p style="color: #ef4444; font-size: 0.8em; font-weight: bold;">Exclusão permanente em ${diasRestantes} dias</p>
                </div>
            `;
        });

        lixeiraHtml += `</div></div>`;
        dashboardMain.insertAdjacentHTML('beforeend', lixeiraHtml);
    }
}

// --- FUNÇÕES DA LIXEIRA ---

function moverParaLixeira(id) {
    if(!confirm("Tem certeza que deseja apagar este cartão? Ele ficará na lixeira por 30 dias.")) return;
    
    let salvos = JSON.parse(localStorage.getItem('cartoesPontoSalvos')) || [];
    let index = salvos.findIndex(c => c.id === id);
    if(index > -1) {
        salvos[index].deletedAt = Date.now(); // Marca com a data e hora da "morte"
        localStorage.setItem('cartoesPontoSalvos', JSON.stringify(salvos));
        carregarDashboard(); // Atualiza a tela instantaneamente
    }
}

function restaurarCartao(id) {
    let salvos = JSON.parse(localStorage.getItem('cartoesPontoSalvos')) || [];
    let index = salvos.findIndex(c => c.id === id);
    if(index > -1) {
        delete salvos[index].deletedAt; // Remove a etiqueta de exclusão
        localStorage.setItem('cartoesPontoSalvos', JSON.stringify(salvos));
        carregarDashboard(); // Atualiza a tela
    }
}

// --- RESTANTE DAS FUNÇÕES ORIGINAIS ---

function abrirCartao(id) {
    localStorage.setItem('cartaoAtualId', id);
    window.location.href = "app.html";
}

function abrirModalNovo() { document.getElementById('modal-novo').classList.remove('escondido'); }
function fecharModalNovo() { document.getElementById('modal-novo').classList.add('escondido'); }

function toggleFolgaInicial() {
    const esc = document.getElementById('escala').value;
    document.getElementById('container-folga-inicial').style.display = (esc === "6x2" || esc === "personalizada") ? "block" : "none";
}
function toggleIntervaloFixo() {
    document.getElementById('container-intervalo').style.display = document.getElementById('intervaloFixo').checked ? "block" : "none";
}
function toggleBatidas() {
    document.getElementById('container-batidas-input').style.display = document.getElementById('checkBatidas').checked ? "block" : "none";
}

function salvarEIniciar() {
    const reclamante = document.getElementById('reclamante').value.trim();
    const dataIn = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const escala = document.getElementById('escala').value;

    if (!reclamante || !dataIn || !dataFim) {
        alert("Preencha Reclamante, Data de Início e Fim!");
        return;
    }

    let trabPers = 6, folgaPers = 2;
    if (escala === "personalizada") {
        trabPers = parseInt(prompt("Dias de TRABALHO?", "5")) || 5;
        folgaPers = parseInt(prompt("Dias de FOLGA?", "1")) || 1;
    }

    const config = {
        reclamante: reclamante,
        reclamada: document.getElementById('reclamada').value.trim(),
        dataInicio: dataIn,
        dataFim: dataFim,
        escala: escala,
        dataFolgaInicial: document.getElementById('dataFolgaInicial').value,
        padraoE: document.getElementById('padraoE').value,
        padraoS: document.getElementById('padraoS').value,
        intervaloFixo: document.getElementById('intervaloFixo').checked,
        qtdBatidas: document.getElementById('checkBatidas').checked ? (parseInt(document.getElementById('qtdBatidas').value) || 4) : 4,
        trabPers: trabPers,
        folgaPers: folgaPers
    };

    const novoCartao = {
        id: Date.now(), 
        dataEdicao: Date.now(),
        progresso: 0,
        config: config,
        batidas: {} 
    };

    let salvos = JSON.parse(localStorage.getItem('cartoesPontoSalvos')) || [];
    salvos.push(novoCartao);
    localStorage.setItem('cartoesPontoSalvos', JSON.stringify(salvos));
    
    localStorage.setItem('cartaoAtualId', novoCartao.id);
    window.location.href = "app.html";
}