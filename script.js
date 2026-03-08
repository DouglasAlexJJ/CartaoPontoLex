const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

function toggleFolgaInicial() {
    const escala = document.getElementById('escala').value;
    const container = document.getElementById('container-folga-inicial');
    container.style.display = (escala === "6x2" || escala === "personalizada") ? "block" : "none";
}

function gerarFolha() {
    const inicioInput = document.getElementById('dataInicio').value;
    const fimInput = document.getElementById('dataFim').value;
    const escala = document.getElementById('escala').value;
    const intFixo = document.getElementById('intervaloFixo').checked;
    const pS1 = document.getElementById('padraoE').value; 
    const pE2 = document.getElementById('padraoS').value;
    const corpo = document.getElementById('corpo-tabela');

    if (!inicioInput || !fimInput) return alert("Preencha as datas.");

    let tP = 6, fP = 2;
    if (escala === "personalizada") {
        tP = parseInt(prompt("Dias de TRABALHO?", "5"));
        fP = parseInt(prompt("Dias de FOLGA?", "1"));
        if (isNaN(tP) || isNaN(fP)) return;
    }

    const folgaInicialInput = document.getElementById('dataFolgaInicial').value;
    if ((escala === "6x2" || escala === "personalizada") && !folgaInicialInput) {
        return alert("Selecione a 'Data da 1ª Folga'.");
    }
    
    corpo.innerHTML = ''; 
    document.getElementById('tabela-ponto').classList.remove('hidden');

    let dataAtual = new Date(inicioInput);
    dataAtual.setMinutes(dataAtual.getMinutes() + dataAtual.getTimezoneOffset());
    const dataFim = new Date(fimInput);
    dataFim.setMinutes(dataFim.getMinutes() + dataFim.getTimezoneOffset());

    while (dataAtual <= dataFim) {
        const numDia = dataAtual.getDay();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        let ehFolga = false;

        if (escala === "seg-sex") ehFolga = (numDia === 0 || numDia === 6);
        else if (escala === "seg-sab") ehFolga = (numDia === 0);
        else if (escala === "6x2" || escala === "personalizada") {
            let ref = new Date(folgaInicialInput);
            ref.setMinutes(ref.getMinutes() + ref.getTimezoneOffset());
            const diff = Math.floor((dataAtual - ref) / (1000 * 60 * 60 * 24));
            const ciclo = (escala === "6x2") ? 8 : (tP + fP);
            const folgasNoCiclo = (escala === "6x2") ? 2 : fP;
            let resto = diff % ciclo;
            if (resto < 0) resto += ciclo;
            if (resto < folgasNoCiclo) ehFolga = true;
        }

        const tr = document.createElement('tr');
        tr.className = `linha-ponto ${ehFolga ? 'folga' : ''}`;
        const qtd = (escala === "motorista") ? 10 : 4;
        let inputsHtml = "";
        for (let i = 0; i < qtd; i++) {
            let val = (!ehFolga && intFixo && (i === 1 || i === 2)) ? (i === 1 ? pS1 : pE2) : "";
            inputsHtml += `<input type="text" class="ponto ${ehFolga ? 'folga-input' : ''}" maxlength="5" value="${val}" placeholder="--">`;
        }

        tr.innerHTML = `
            <td class="col-dia"><strong>${diasSemana[numDia]}</strong><br><small>${dataFormatada}</small></td>
            <td class="celula-inputs">
                <div class="container-batidas">${inputsHtml}</div>
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

function toggleMenuDia(btn, event) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.menu-dia-content').forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });
    menu.classList.toggle('show');
}

document.addEventListener('click', () => {
    document.querySelectorAll('.menu-dia-content').forEach(m => m.classList.remove('show'));
});

function configurarEventos() {
    const inputs = Array.from(document.querySelectorAll('.ponto'));
    inputs.forEach((input, index) => {
        input.onkeypress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
        input.oninput = () => {
            if (input.value.length === 2 && !input.value.includes(':')) input.value += ":";
            if (input.value.length === 5) {
                calcularLinha(input.closest('tr'));
                if (input.closest('tr').classList.contains('folga')) {
                    if (inputs[index + 1]) inputs[index + 1].focus();
                } else {
                    const intFixo = document.getElementById('intervaloFixo').checked;
                    const inputsLinha = input.closest('tr').querySelectorAll('.ponto');
                    if (intFixo && input === inputsLinha[0]) inputsLinha[inputsLinha.length - 1].focus();
                    else pularFolgas(index, 1);
                }
            }
        };
    });
}

function pularFolgas(idx, dir) {
    const todos = document.querySelectorAll('.ponto');
    let p = idx + dir;
    while (todos[p] && todos[p].closest('tr').classList.contains('folga')) p += dir;
    if (todos[p]) todos[p].focus();
}

function calcularLinha(tr) {
    const ins = tr.querySelectorAll('.ponto');
    let min = 0;
    for (let i = 0; i < ins.length; i += 2) {
        const e = hhmmParaMin(ins[i]?.value), s = hhmmParaMin(ins[i+1]?.value);
        if (e > 0 && s > 0) {
            let d = s - e;
            if (d < 0) d += 1440;
            min += d;
        }
    }
    tr.querySelector('.total-dia').innerText = minParaHHMM(min);
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
}

function definirComoFolga(btn) {
    const tr = btn.closest('tr');
    tr.classList.add('folga');
    tr.querySelectorAll('.ponto').forEach(i => i.classList.add('folga-input'));
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
                linha.querySelectorAll('.ponto').forEach(inp => inp.classList.add('folga-input'));
            } else {
                linha.classList.remove('folga');
                linha.querySelectorAll('.ponto').forEach(inp => inp.classList.remove('folga-input'));
            }
            calcularLinha(linha);
        }
    });
    btn.closest('tr').classList.add('escala-alterada');
}