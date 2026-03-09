/* ==========================================================================
   MOTOR DA MESA DE TRABALHO (APP) - INTEGRADO COM FIRESTORE DA NUVEM
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Suas Chaves
const firebaseConfig = {
  apiKey: "AIzaSyAYKwESZLQelQlyh5pWX0oE0eVOMI5Z3fY",
  authDomain: "cartaopontolex.firebaseapp.com",
  projectId: "cartaopontolex",
  storageBucket: "cartaopontolex.firebasestorage.app",
  messagingSenderId: "261448645689",
  appId: "1:261448645689:web:a6e7aebb12ef87c15b61e8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
let configAtual = {};
let cartaoAtual = null;
let usuarioLogado = null;

// 1. Inicia buscando da Nuvem
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            usuarioLogado = user;
            await carregarCartaoDaNuvem();
        } else {
            window.location.href = "index.html";
        }
    });
});

async function carregarCartaoDaNuvem() {
    const idAtual = localStorage.getItem('cartaoAtualId');
    if (!idAtual) {
        window.location.href = "dashboard.html";
        return;
    }

    // Busca o documento no Firestore
    const docRef = doc(db, "cartoes", idAtual);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        cartaoAtual = docSnap.data();
        
        // Proteção: Garante que um advogado não abra o cartão de outro
        if (cartaoAtual.userId !== usuarioLogado.uid) {
            alert("Acesso Negado!");
            window.location.href = "dashboard.html";
            return;
        }

        configAtual = cartaoAtual.config;
        if(!cartaoAtual.batidas) cartaoAtual.batidas = {}; 
        
        document.getElementById('info-reclamante').innerText = configAtual.reclamante;
        const dtIn = new Date(configAtual.dataInicio + "T00:00:00").toLocaleDateString('pt-BR');
        const dtFim = new Date(configAtual.dataFim + "T00:00:00").toLocaleDateString('pt-BR');
        document.getElementById('info-periodo').innerText = `${dtIn} a ${dtFim}`;

        gerarFolha(configAtual);
    } else {
        alert("Cartão não encontrado na nuvem! Redirecionando...");
        window.location.href = "dashboard.html";
    }
}

// 2. FUNÇÕES EXPORTADAS PARA O HTML
window.voltarEsalvar = async function() {
    const btn = document.querySelector('.btn-secundario');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin" style="width:16px; height:16px; border:2px solid #cbd5e1; border-top-color:#64748b; border-radius:50%; display:inline-block; vertical-align:middle; margin-right:8px;"></svg> 
            Salvando...
        `;
    }

    try {
        await salvarProgressoAuto(); 
        window.location.href = "dashboard.html";
    } catch (e) {
        console.error("Erro no save:", e);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span style="font-size: 1.2em; line-height: 1;">‹</span> Voltar para o Painel`;
        }
        alert("Erro ao salvar na nuvem.");
    }
};

window.toggleMenuDia = function(btn, event) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.menu-dia-content').forEach(m => { if (m !== menu) m.classList.remove('show'); });
    menu.classList.toggle('show');
};

document.addEventListener('click', () => document.querySelectorAll('.menu-dia-content').forEach(m => m.classList.remove('show')));

window.gerenciarBatidas = function(btn, qtd) {
    const cont = btn.closest('.celula-inputs').querySelector('.container-batidas');
    const tr = btn.closest('tr');
    
    if (qtd > 0) {
        for(let i=0; i<2; i++) {
            const inp = document.createElement('input');
            inp.className = 'ponto'; 
            inp.maxLength = 5; 
            inp.placeholder = '--';
            if (tr.classList.contains('folga')) inp.classList.add('folga-input');
            cont.appendChild(inp);
        }
    } else {
        const ins = cont.querySelectorAll('.ponto');
        if (ins.length > 2) { 
            ins[ins.length-1].remove(); 
            ins[ins.length-2].remove(); 
        } else {
            alert("Não é possível remover. A linha precisa ter no mínimo 2 batidas.");
            return;
        }
    }
    
    configurarEventos();
    calcularLinha(tr);
    salvarProgressoAuto();
};

window.definirComoFolga = function(btn) {
    const tr = btn.closest('tr');
    tr.classList.add('folga');
    tr.querySelectorAll('.ponto').forEach(i => { i.classList.add('folga-input'); i.value = ''; });
    calcularLinha(tr);
    salvarProgressoAuto();
};

window.definirComoTrabalho = function(btn) {
    const tr = btn.closest('tr');
    tr.classList.remove('folga');
    tr.querySelectorAll('.ponto').forEach(i => i.classList.remove('folga-input'));
    calcularLinha(tr);
    salvarProgressoAuto();
};

window.aplicarEscalaPersonalizada = function(btn) {
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
    salvarProgressoAuto();
};

// 3. AUTO-SAVE NA NUVEM
async function salvarProgressoAuto() {
    if (!cartaoAtual || !usuarioLogado) return;

    let linhas = document.querySelectorAll('.linha-ponto');
    let diasPreenchidos = 0;
    cartaoAtual.batidas = {}; 
    
    linhas.forEach(tr => {
        const dataDia = tr.getAttribute('data-dia');
        const isFolga = tr.classList.contains('folga');
        const inputs = Array.from(tr.querySelectorAll('.ponto')).map(i => i.value);
        
        cartaoAtual.batidas[dataDia] = {
            isFolga: isFolga,
            horas: inputs
        };

        if (isFolga) {
            diasPreenchidos++;
        } else {
            let preenchido = inputs.some(v => v.length === 5);
            if (preenchido) diasPreenchidos++;
        }
    });

    cartaoAtual.progresso = Math.round((diasPreenchidos / linhas.length) * 100);
    cartaoAtual.dataEdicao = Date.now();

    const docRef = doc(db, "cartoes", cartaoAtual.id);
    await updateDoc(docRef, {
        batidas: cartaoAtual.batidas,
        progresso: cartaoAtual.progresso,
        dataEdicao: cartaoAtual.dataEdicao
    });
    
    console.log("Nuvem atualizada!"); // Verifique isso no F12
}

// 4. LÓGICA DE GERAÇÃO DA FOLHA (Mantida intacta)
function gerarFolha(cfg) {
    const corpo = document.getElementById('corpo-tabela');
    if (!corpo) return; 
    corpo.innerHTML = ''; 

    let dataAtual = new Date(cfg.dataInicio + "T00:00:00");
    const dataFim = new Date(cfg.dataFim + "T00:00:00");

    while (dataAtual <= dataFim) {
        const numDia = dataAtual.getDay();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        let ehFolga = false;
        let destaqueFDSouFeriado = (numDia === 0 || numDia === 6 || ehFeriadoNacional(dataAtual));

        if (cfg.escala === "livre") {
            ehFolga = false; 
        } else if (cfg.escala === "seg-sex") {
            ehFolga = (numDia === 0 || numDia === 6);
        } else if (cfg.escala === "seg-sab") {
            ehFolga = (numDia === 0);
        } else if (cfg.escala === "6x2" || cfg.escala === "personalizada") {
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
        tr.setAttribute('data-dia', dataFormatada); 

        const batidasSalvasNoBanco = cartaoAtual.batidas[dataFormatada];
        
        if (batidasSalvasNoBanco && batidasSalvasNoBanco.isFolga !== undefined) {
            ehFolga = batidasSalvasNoBanco.isFolga;
        }

        if (cfg.escala === "livre" && destaqueFDSouFeriado) {
            tr.className = `linha-ponto destaque-vermelho ${ehFolga ? 'folga' : ''}`;
        } else {
            tr.className = `linha-ponto ${ehFolga ? 'folga' : ''}`;
        }
        
        let qtdDaLinha = parseInt(cfg.qtdBatidas) || 4; 
        if (batidasSalvasNoBanco && batidasSalvasNoBanco.horas) {
            qtdDaLinha = batidasSalvasNoBanco.horas.length;
            if (qtdDaLinha < 2) qtdDaLinha = 2; 
        }
        
        let inputsHtml = "";
        
        for (let i = 0; i < qtdDaLinha; i++) {
            let val = "";
            if (batidasSalvasNoBanco && batidasSalvasNoBanco.horas[i] !== undefined) {
                val = batidasSalvasNoBanco.horas[i];
            } else if (!ehFolga && cfg.intervaloFixo) {
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
                    <button class="btn-config" onclick="window.toggleMenuDia(this, event)">⚙️</button>
                    <div class="menu-dia-content">
                        <div class="menu-section">Batidas deste dia</div>
                        <button onclick="window.gerenciarBatidas(this, 2)">➕ Adicionar Par Extra</button>
                        <button onclick="window.gerenciarBatidas(this, -2)">➖ Remover Par</button>
                        <div class="divisor"></div>
                        <button onclick="window.definirComoFolga(this)">🏝️ Marcar como Folga</button>
                        <button onclick="window.definirComoTrabalho(this)">🛠️ Marcar como Trabalho</button>
                        <div class="divisor"></div>
                        <button onclick="window.aplicarEscalaPersonalizada(this)">⚙️ Escala a partir daqui</button>
                    </div>
                </div>
            </td>
            <td class="total-dia">00:00</td>
        `;
        corpo.appendChild(tr);
        dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    document.querySelectorAll('.linha-ponto').forEach(tr => calcularLinha(tr));
    configurarEventos();
}

function configurarEventos() {
    const inputs = Array.from(document.querySelectorAll('.ponto'));
    inputs.forEach((input, index) => {
        input.onfocus = () => input.select();
        input.onkeypress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
        
        input.oninput = (e) => {
            if (e.inputType === 'deleteContentBackward') return;
            let val = input.value.replace(':', '');
            if (val.length >= 2) {
                let h = val.substring(0, 2);
                if (parseInt(h) > 23) h = "23";
                input.value = h + ":" + val.substring(2);
            }
            if (input.value.length === 5) {
                let [h, m] = input.value.split(':');
                if (parseInt(m) > 59) input.value = h + ":59";
                calcularLinha(input.closest('tr'));
                pularCampoInteligente(input, index, 1);
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                completarHora(input);
                if (e.key === 'Tab') pularCampoInteligente(input, index, e.shiftKey ? -1 : 1);
                else if (e.key === 'Enter') pularLinha(input.closest('tr'));
            }
        };

        input.onblur = () => {
            completarHora(input);
            salvarProgressoAuto(); 
        };
    });
}

function completarHora(input) {
    if (!input.value) return; 
    let val = input.value.replace(':', '');
    if (val.length === 0) return;
    
    let h = "00", m = "00";
    if (val.length === 1) h = "0" + val; 
    else if (val.length === 2) h = val;       
    else if (val.length === 3) { h = val.substring(0, 2); m = val.charAt(2) + "0"; } 
    else if (val.length === 4) { h = val.substring(0, 2); m = val.substring(2, 4); }

    if (parseInt(h) > 23) h = "23";
    if (parseInt(m) > 59) m = "59";
    
    input.value = `${h}:${m}`;
    calcularLinha(input.closest('tr')); 
}

function pularCampoInteligente(input, index, direcao) {
    const linha = input.closest('tr');
    const inputsDaLinha = Array.from(linha.querySelectorAll('.ponto'));
    if (direcao === 1 && !linha.classList.contains('folga') && configAtual.intervaloFixo && input === inputsDaLinha[0] && inputsDaLinha.length >= 4) {
        inputsDaLinha[3].focus();
    } else {
        const todos = Array.from(document.querySelectorAll('.ponto'));
        let prox = index + direcao;
        while (todos[prox] && todos[prox].closest('tr').classList.contains('folga')) prox += direcao;
        if (todos[prox]) todos[prox].focus();
    }
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
            if (d < 0) d += 1440; 
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

function minParaHHMM(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

function atualizarTotalGeral() {
    let tot = 0;
    document.querySelectorAll('.total-dia').forEach(td => tot += hhmmParaMin(td.innerText));
    document.getElementById('total-geral-periodo').innerText = minParaHHMM(tot);
}

function ehFeriadoNacional(data) {
    const ano = data.getFullYear();
    const fixos = ['01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '25/12'];
    let a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
    let pascoa = new Date(ano, mes-1, dia), carnaval = new Date(pascoa); carnaval.setDate(pascoa.getDate()-47);
    let sextaSanta = new Date(pascoa); sextaSanta.setDate(pascoa.getDate()-2);
    let corpus = new Date(pascoa); corpus.setDate(pascoa.getDate()+60);
    const formata = dt => String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0');
    return fixos.includes(formata(data)) || [formata(carnaval), formata(sextaSanta), formata(pascoa), formata(corpus)].includes(formata(data));
}