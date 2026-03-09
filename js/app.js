/* ==========================================================================
   MOTOR DA MESA DE TRABALHO (APP) - CartaoPontoLex
   ========================================================================== */

const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
let configAtual = {};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Puxa os dados do Dashboard
    const configStr = localStorage.getItem('cartaoPontoConfig');
    if (!configStr) {
        window.location.href = "dashboard.html";
        return;
    }
    configAtual = JSON.parse(configStr);
    
    // 2. Atualiza o cabeçalho com os nomes
    document.getElementById('info-reclamante').innerText = configAtual.reclamante;
    
    // Ajuste de fuso horário seguro para evitar bugs de data
    const dtIn = new Date(configAtual.dataInicio + "T00:00:00").toLocaleDateString('pt-BR');
    const dtFim = new Date(configAtual.dataFim + "T00:00:00").toLocaleDateString('pt-BR');
    document.getElementById('info-periodo').innerText = `${dtIn} a ${dtFim}`;

    // 3. Inicia a mágica
    gerarFolha(configAtual);
});

function gerarFolha(cfg) {
    const corpo = document.getElementById('corpo-tabela');
    if (!corpo) return; // Proteção contra travamento
    corpo.innerHTML = ''; 

    // Ajuste de data seguro
    let dataAtual = new Date(cfg.dataInicio + "T00:00:00");
    const dataFim = new Date(cfg.dataFim + "T00:00:00");

    // Prevenção contra loop infinito se as datas vierem erradas
    if (isNaN(dataAtual) || isNaN(dataFim) || dataAtual > dataFim) {
        alert("Erro nas datas. Volte ao painel e verifique o período inserido.");
        return;
    }

    while (dataAtual <= dataFim) {
        const numDia = dataAtual.getDay();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        let ehFolga = false;

        // Lógica de Escalas
        if (cfg.escala === "seg-sex") ehFolga = (numDia === 0 || numDia === 6);
        else if (cfg.escala === "seg-sab") ehFolga = (numDia === 0);
        else if (cfg.escala === "6x2" || cfg.escala === "personalizada") {
            if (cfg.dataFolgaInicial) {
                let ref = new Date(cfg.dataFolgaInicial + "T00:00:00");
                const diffDays = Math.floor((dataAtual - ref) / (1000 * 60 * 60 * 24));
                const ciclo = (cfg.escala === "6x2") ? 8 : (cfg.trabPers + cfg.folgaPers);
                const folgas = (cfg.escala === "6x2") ? 2 : cfg.folgaPers;
                let resto = diffDays % ciclo;
                if (resto < 0) resto += ciclo;
                if (resto < folgas) ehFolga = true;
            }
        }

        const tr = document.createElement('tr');
        tr.className = `linha-ponto ${ehFolga ? 'folga' : ''}`;
        
        // AQUI ESTÁ A NOVIDADE: Lê a quantidade exata de batidas do modal
        const qtdBatidas = parseInt(cfg.qtdBatidas) || 4; 
        let inputsHtml = "";
        
        for (let i = 0; i < qtdBatidas; i++) {
            let val = "";
            
            // Se o usuário marcou "Intervalo Fixo", preenche as posições 2 e 3 (índices 1 e 2)
            if (!ehFolga && cfg.intervaloFixo) {
                if (i === 1 && cfg.padraoE) val = cfg.padraoE;
                if (i === 2 && cfg.padraoS) val = cfg.padraoS;
            }
            
            inputsHtml += `<input type="text" class="ponto ${ehFolga ? 'folga-input' : ''}" maxlength="5" value="${val}" placeholder="--">`;
        }

        tr.innerHTML = `
            <td class="col-dia"><strong>${diasSemana[numDia]}</strong><br>${dataFormatada}</td>
            <td class="celula-inputs">
                <div class="container-batidas" style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center;">${inputsHtml}</div>
                <div class="dropdown-dia">
                    <button class="btn-config" onclick="toggleMenuDia(this, event)">⚙️</button>
                    <div class="menu-dia-content">
                        <div class="menu-section">Batidas</div>
                        <button onclick="gerenciarBatidas(this, 2)">➕ Adicionar Par</button>
                        <button onclick="gerenciarBatidas(this, -2)">➖ Remover Par</button>
                        <div class="divisor"></div>
                        <div class="menu-section">Status</div>
                        <button onclick="definirComoFolga(this)">🏝️ Marcar como Folga</button>
                        <button onclick="definirComoTrabalho(this)">🛠️ Marcar como Trabalho</button>
                        <div class="divisor"></div>
                        <div class="menu-section">Ciclo</div>
                        <button onclick="aplicarEscalaPersonalizada(this)">⚙️ Escala Personalizada...</button>
                    </div>
                </div>
            </td>
            <td class="total-dia">00:00</td>
        `;
        corpo.appendChild(tr);
        dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    configurarEventos();
    atualizarTotalGeral();
}

// ==========================================================================
// FUNÇÕES DE CÁLCULO, EVENTOS E MENUS (MANTIDAS INTACTAS E SEGURAS)
// ==========================================================================

function configurarEventos() {
    const inputs = Array.from(document.querySelectorAll('.ponto'));
    inputs.forEach((input, index) => {
        input.onkeypress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
        input.oninput = () => {
            if (input.value.length === 2 && !input.value.includes(':')) input.value += ":";
            if (input.value.length === 5) {
                const linha = input.closest('tr');
                calcularLinha(linha);
                
                const inputsDaLinha = Array.from(linha.querySelectorAll('.ponto'));
                if (linha.classList.contains('folga')) {
                    navegar(index, 1);
                } else {
                    // Pulo automático inteligente
                    if (configAtual.intervaloFixo && input === inputsDaLinha[0] && inputsDaLinha.length > 3) {
                        inputsDaLinha[inputsDaLinha.length - 1].focus();
                    } else {
                        navegar(index, 1);
                    }
                }
            }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Tab') { e.preventDefault(); navegar(index, e.shiftKey ? -1 : 1); }
            if (e.key === 'Enter') { e.preventDefault(); pularLinha(input.closest('tr')); }
        };
    });
}

function navegar(idxAtual, direcao) {
    const todos = Array.from(document.querySelectorAll('.ponto'));
    let prox = idxAtual + direcao;
    while (todos[prox] && todos[prox].closest('tr').classList.contains('folga')) {
        prox += direcao;
    }
    if (todos[prox]) todos[prox].focus();
}

function pularLinha(trAtual) {
    const prox = trAtual.nextElementSibling;
    if (prox) {
        if (prox.classList.contains('folga')) pularLinha(prox);
        else prox.querySelector('.ponto').focus();
    }
}

function calcularLinha(tr) {
    const ins = tr.querySelectorAll('.ponto');
    let minTotal = 0;
    for (let i = 0; i < ins.length; i += 2) {
        const e = hhmmParaMin(ins[i]?.value), s = hhmmParaMin(ins[i+1]?.value);
        if (e > 0 && s > 0) {
            let d = s - e;
            if (d < 0) d += 1440; // Resolve a virada de noite automaticamente
            minTotal += d;
        }
    }
    tr.querySelector('.total-dia').innerText = minParaHHMM(minTotal);
    atualizarTotalGeral();
}

function hhmmParaMin(t) {
    if (!t || t.length < 5) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h * 60) + m;
}

function minParaHHMM(t) { 
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; 
}

function atualizarTotalGeral() {
    let tot = 0;
    document.querySelectorAll('.total-dia').forEach(td => tot += hhmmParaMin(td.innerText));
    document.getElementById('total-geral-periodo').innerText = minParaHHMM(tot);
}

function toggleMenuDia(btn, event) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.menu-dia-content').forEach(m => { if (m !== menu) m.classList.remove('show'); });
    menu.classList.toggle('show');
}
document.addEventListener('click', () => document.querySelectorAll('.menu-dia-content').forEach(m => m.classList.remove('show')));

function gerenciarBatidas(btn, qtd) {
    const cont = btn.closest('.celula-inputs').querySelector('.container-batidas');
    if (qtd > 0) {
        for(let i=0; i<2; i++) {
            const inp = document.createElement('input');
            inp.className = 'ponto'; inp.maxLength = 5; inp.placeholder = '--';
            cont.appendChild(inp);
        }
    } else {
        const ins = cont.querySelectorAll('.ponto');
        if (ins.length > 2) { ins[ins.length-1].remove(); ins[ins.length-2].remove(); }
    }
    configurarEventos();
    calcularLinha(btn.closest('tr'));
}

function definirComoFolga(btn) {
    const tr = btn.closest('tr');
    tr.classList.add('folga');
    tr.querySelectorAll('.ponto').forEach(i => { i.classList.add('folga-input'); i.value = ''; });
    calcularLinha(tr);
}

function definirComoTrabalho(btn) {
    const tr = btn.closest('tr');
    tr.classList.remove('folga');
    tr.querySelectorAll('.ponto').forEach(i => i.classList.remove('folga-input'));
    calcularLinha(tr);
}

function aplicarEscalaPersonalizada(btn) {
    const t = parseInt(prompt("Dias de TRABALHO?", "6")), f = parseInt(prompt("Dias de FOLGA?", "2"));
    if (isNaN(t) || isNaN(f)) return;
    const trs = Array.from(document.querySelectorAll('.linha-ponto')), idx = trs.indexOf(btn.closest('tr'));
    trs.forEach((linha, i) => {
        if (i >= idx) {
            let ehF = ((i - idx) % (t + f)) < f;
            if (ehF) {
                linha.classList.add('folga');
                linha.querySelectorAll('.ponto').forEach(inp => { inp.classList.add('folga-input'); inp.value = ''; });
            } else {
                linha.classList.remove('folga');
                linha.querySelectorAll('.ponto').forEach(inp => inp.classList.remove('folga-input'));
            }
            calcularLinha(linha);
        }
    });
    btn.closest('tr').classList.add('escala-alterada');
}