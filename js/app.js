/* ==========================================================================
   MOTOR DA MESA DE TRABALHO (APP) - INTEGRADO COM FIRESTORE DA NUVEM
   ========================================================================== */

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
let configAtual = {};
let cartaoAtual = null;
let usuarioLogado = null;
let listaFeriadosGlobais = [];

// 1. Inicia buscando da Nuvem
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
        usuarioLogado = user;
        
        // 1. Primeiro buscamos o PERFIL de quem está logado para saber se é colaborador
        const perfilDoc = await getDoc(doc(db, "usuarios", user.uid));
        const dadosPerfil = perfilDoc.data();

        // 2. Passamos o perfil para a função de carregar o cartão
        await carregarCartaoDaNuvem(dadosPerfil);
        } else {
            window.location.href = "index.html";
        }
    });
});

async function carregarCartaoDaNuvem(perfilUsuario) {
    const idAtual = localStorage.getItem('cartaoAtualId');
    if (!idAtual) { window.location.href = "dashboard.html"; return; }

    const docRef = doc(db, "cartoes", idAtual);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        cartaoAtual = docSnap.data();
        
        // --- NOVA LÓGICA DE PROTEÇÃO INCLUSIVA ---
        const ehDono = cartaoAtual.userId === usuarioLogado.uid;
        
        // Verifica se o usuário logado é Colaborador OU Gestor do dono do cartão
        const ehParteDaEquipe = (
            (perfilUsuario.tipoConta === 'colaborador' || perfilUsuario.tipoConta === 'gestor') && 
            perfilUsuario.adminId === cartaoAtual.userId
        );

        if (ehDono || ehParteDaEquipe) {
            configAtual = cartaoAtual.config;
            if(!cartaoAtual.batidas) cartaoAtual.batidas = {}; 
            document.getElementById('info-reclamante').innerText = configAtual.reclamante;
            gerarFolha(configAtual);
        } else {
            alert("Acesso Negado! Este cartão pertence a outro escritório.");
            window.location.href = "dashboard.html";
        }
    } else {
        alert("Cartão não encontrado.");
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

window.gerenciarBatidas = function(elemento, qtd) {
    const tr = elemento.closest('tr');
    const cont = tr.querySelector('.container-batidas');
    
    if (qtd > 0) {
        // Lógica de adicionar (mantida igual)
        for(let i=0; i<2; i++) {
            const inp = document.createElement('input');
            inp.className = 'ponto'; 
            inp.maxLength = 5; 
            inp.placeholder = '--';
            if (tr.classList.contains('folga')) inp.classList.add('folga-input');
            cont.appendChild(inp);
        }
    } else {
        // Lógica de remover (Agora com verificação de segurança)
        const ins = Array.from(cont.querySelectorAll('.ponto'));
        
        if (ins.length > 2) { 
            const ultimo = ins[ins.length - 1];
            const penultimo = ins[ins.length - 2];

            // Verifica se algum dos dois inputs tem valor preenchido
            if (ultimo.value.trim() !== '' || penultimo.value.trim() !== '') {
                if (!confirm("Estas batidas possuem horários preenchidos. Tem certeza que deseja excluí-las?")) {
                    return; // Se o usuário cancelar, a função para aqui
                }
            }

            ultimo.remove(); 
            penultimo.remove(); 

            // Devolve o cursor de texto para a última caixinha que sobrou
            const inputsRestantes = cont.querySelectorAll('.ponto');
            if (inputsRestantes.length > 0) {
                inputsRestantes[inputsRestantes.length - 1].focus();
            }

        } else {
            alert("Não é possível remover. A linha precisa ter no mínimo 2 batidas.");
            return;
        }
    }
    
    configurarEventos();
    if (typeof calcularLinha === 'function') calcularLinha(tr);
    if (typeof salvarProgressoAuto === 'function') salvarProgressoAuto();
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
async function gerarFolha(cfg) {
    const corpo = document.getElementById('corpo-tabela');
    if (!corpo) return; 
    corpo.innerHTML = '<div style="padding:20px; text-align:center;">Carregando folha e feriados...</div>'; 

    // Carrega os feriados do ano do início do cartão antes de gerar
    const anoInicio = new Date(cfg.dataInicio + "T00:00:00").getFullYear();
    await carregarFeriados(anoInicio, cfg.uf);
    
    corpo.innerHTML = ''; 

    let dataAtual = new Date(cfg.dataInicio + "T00:00:00");
    const dataFim = new Date(cfg.dataFim + "T00:00:00");

    while (dataAtual <= dataFim) {
        const numDia = dataAtual.getDay();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        
        // Formato para comparar com a API (YYYY-MM-DD)
        const dataISO = dataAtual.toISOString().split('T')[0];
        
        let ehFolga = false;
        // MARCAÇÃO DE FERIADO: Verifica se a data está na lista da API Brasil
        const ehFeriado = listaFeriadosGlobais.includes(dataISO);
        let destaqueFDSouFeriado = (numDia === 0 || numDia === 6 || ehFeriado);

        // Lógica de Escalas
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

        // APLICAÇÃO VISUAL
        // Se for feriado ou domingo, adicionamos uma classe de destaque (que você pode estilizar no CSS)
        if (ehFeriado || numDia === 0) {
            tr.className = `linha-ponto destaque-feriado ${ehFolga ? 'folga' : ''}`;
            if(ehFeriado) tr.style.backgroundColor = "#fff5f5"; // Leve tom vermelho para feriado
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
            <td class="col-dia">
                <strong>${diasSemana[numDia]}</strong>${ehFeriado ? ' 🚩' : ''}<br>${dataFormatada}
            </td>
            <td class="celula-inputs">
                <div class="container-batidas">${inputsHtml}</div>
            </td>
            <td class="total-dia" style="color: #0284c7; font-weight: bold;">00:00</td>
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
            // --- ATALHO: TECLA '+' PARA ADICIONAR BATIDAS ---
            if (e.key === '+') {
                e.preventDefault(); 
                window.gerenciarBatidas(input, 2); 
                
                setTimeout(() => {
                    const todosInputsDestaLinha = input.closest('tr').querySelectorAll('.ponto');
                    const novoInput = todosInputsDestaLinha[todosInputsDestaLinha.length - 2];
                    if (novoInput) novoInput.focus();
                }, 10);
                return;
            }

            // --- ATALHO: TECLA '-' PARA REMOVER BATIDAS ---
            if (e.key === '-') {
                e.preventDefault(); // Impede que o sinal de - seja digitado na caixa
                window.gerenciarBatidas(input, -2);
                return;
            }

            // --- NAVEGAÇÃO PADRÃO (Tab / Enter) ---
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
    
    // Regra do Intervalo Fixo (Só aplica em dias normais)
    if (direcao === 1 && !linha.classList.contains('folga') && configAtual.intervaloFixo && input === inputsDaLinha[0] && inputsDaLinha.length >= 4) {
        inputsDaLinha[3].focus();
        return;
    }
    
    const todos = Array.from(document.querySelectorAll('.ponto'));
    let prox = index + direcao;
    
    while (todos[prox]) {
        let trProx = todos[prox].closest('tr');
        
        // 1. O PORTO SEGURO: Se a próxima caixinha for na MESMA linha que estou agora, 
        // ele PARA de procurar e vai para ela (me deixa terminar de editar a folga).
        if (trProx === linha) {
            break;
        }
        
        // 2. Se a próxima caixinha for em OUTRO dia, ele verifica se o novo dia é folga.
        // Se for folga, ele pula esse dia inteiro.
        if (trProx.classList.contains('folga')) {
            prox += direcao;
        } else {
            // Se o novo dia for dia de trabalho, ele para e entra.
            break;
        }
    }
    
    if (todos[prox]) todos[prox].focus();
}

function pularLinha(trAtual) {
    let prox = trAtual.nextElementSibling;
    
    // Ao apertar Enter, ele procura o próximo dia de trabalho, pulando as folgas
    while (prox && prox.classList.contains('folga')) {
        prox = prox.nextElementSibling;
    }
    
    if (prox) {
        const primeiroInput = prox.querySelector('.ponto');
        if (primeiroInput) primeiroInput.focus();
    }
}

function calcularLinha(tr) {
    const ins = tr.querySelectorAll('.ponto');
    const isDomingoOuFeriado = tr.classList.contains('destaque-vermelho'); // Vem do seu gerarFolha
    const isFolga = tr.classList.contains('folga');
    
    let totalDiurno = 0;
    let totalNoturnoFicto = 0;
    let totalNoturnoRelogio = 0;

    // 1. Soma todos os turnos do dia
    for (let i = 0; i < ins.length; i += 2) {
        const e = hhmmParaMin(ins[i]?.value);
        const s = hhmmParaMin(ins[i+1]?.value);
        
        if (e > 0 && s > 0) {
            const turno = calcularTurno(e, s);
            totalDiurno += turno.diurno;
            totalNoturnoFicto += turno.noturnoFicto;
            totalNoturnoRelogio += turno.noturnoRelogio;
        }
    }

    let tempoTotal = totalDiurno + totalNoturnoFicto;
    let tempoTotalEmHoras = tempoTotal / 60; // Para facilitar os limites
    
    // 2. Lógica de Horas Extras (Assumindo limite de 8h diárias por padrão)
    // O ideal será buscar esse limite da config (ex: cfg.horasDiarias)
    const LIMITE_DIARIO = 8; 
    let horasNormais = 0;
    let extras50 = 0;
    let extras100 = 0;

    if (isFolga || isDomingoOuFeriado) {
        // Trabalhou no dia de descanso? É tudo 100%!
        extras100 = tempoTotalEmHoras;
    } else {
        // Dia normal
        if (tempoTotalEmHoras > LIMITE_DIARIO) {
            horasNormais = LIMITE_DIARIO;
            extras50 = tempoTotalEmHoras - LIMITE_DIARIO;
        } else {
            horasNormais = tempoTotalEmHoras;
        }
    }

    // 3. Atualiza o HTML
    // Aqui nós preenchemos a coluna Total, mas já temos os dados das Extras!
    tr.querySelector('.total-dia').innerText = minParaHHMM(Math.round(tempoTotal));
    
    // Podemos guardar os dados no TR para depois somar no rodapé geral
    tr.dataset.normais = horasNormais.toFixed(2);
    tr.dataset.ext50 = extras50.toFixed(2);
    tr.dataset.ext100 = extras100.toFixed(2);
    tr.dataset.adcNoturno = (totalNoturnoFicto / 60).toFixed(2);

    atualizarTotalGeral();
}

function hhmmParaMin(t) {
    if (!t || t.length < 5) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h * 60) + m;
}

function minParaHHMM(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

function atualizarTotalGeral() {
    let totGeral = 0;
    let totNormais = 0;
    let totExt50 = 0;
    let totExt100 = 0;
    let totNoturno = 0;

    document.querySelectorAll('.linha-ponto').forEach(tr => {
        // 1. Soma do tempo total visual (o que aparece na coluna Total da tabela)
        const tempoVisual = tr.querySelector('.total-dia').innerText;
        totGeral += hhmmParaMin(tempoVisual);
        
        // 2. Soma das rubricas jurídicas (que estão escondidas no dataset da linha)
        totNormais += parseFloat(tr.dataset.normais || 0);
        totExt50 += parseFloat(tr.dataset.ext50 || 0);
        totExt100 += parseFloat(tr.dataset.ext100 || 0);
        totNoturno += parseFloat(tr.dataset.adcNoturno || 0);
    });

    // Atualiza o painel na tela
    document.getElementById('total-geral-periodo').innerText = minParaHHMM(totGeral);
    
    // Converte os decimais de volta para relógio e atualiza os visores coloridos
    const elNormais = document.getElementById('total-normais');
    if(elNormais) elNormais.innerText = decimalParaHHMM(totNormais);
    
    const elExt50 = document.getElementById('total-ext50');
    if(elExt50) elExt50.innerText = decimalParaHHMM(totExt50);
    
    const elExt100 = document.getElementById('total-ext100');
    if(elExt100) elExt100.innerText = decimalParaHHMM(totExt100);
    
    const elNoturno = document.getElementById('total-noturno');
    if(elNoturno) elNoturno.innerText = decimalParaHHMM(totNoturno);
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
function calcularTurno(entradaMin, saidaMin) {
    if (saidaMin <= entradaMin) saidaMin += 1440; // Virou a noite
    
    let minDiurno = 0;
    let minNoturno = 0;

    // Varre minuto a minuto (método mais seguro para lidar com madrugadas)
    for (let m = entradaMin; m < saidaMin; m++) {
        let minutoDoDia = m % 1440; // Garante que 24h vire 00h
        
        // Regra Noturna: Entre 22:00 (1320) e 05:00 (300)
        if (minutoDoDia >= 1320 || minutoDoDia < 300) {
            minNoturno++;
        } else {
            minDiurno++;
        }
    }

    // Aplica a Redução da Hora Noturna (Hora Ficta)
    // 1 minuto relógio = 1.142857 minutos trabalhistas
    let minNoturnoFicto = minNoturno * (60 / 52.5);

    return {
        diurno: minDiurno,
        noturnoRelogio: minNoturno,
        noturnoFicto: minNoturnoFicto,
        totalFicto: minDiurno + minNoturnoFicto
    };
}

function decimalParaHHMM(decimal) {
    if (!decimal || isNaN(decimal)) return "00:00";
    const horas = Math.floor(decimal);
    const minutos = Math.round((decimal - horas) * 60);
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}
// ==========================================================================
// FUNÇÕES DO MENU DE CONFIGURAÇÃO E AFASTAMENTOS
// ==========================================================================

window.toggleMenuConfig = function(event) {
    event.stopPropagation();
    const menu = document.getElementById('menu-config-app');
    menu.classList.toggle('escondido');
};

// Fecha o menu se clicar fora
document.addEventListener('click', () => {
    const menu = document.getElementById('menu-config-app');
    if (menu && !menu.classList.contains('escondido')) {
        menu.classList.add('escondido');
    }
});

// AFASTAMENTOS
window.abrirModalAfastamento = function(tipo) {
    document.getElementById('titulo-modal-afastamento').innerText = `Lançar ${tipo}`;
    document.getElementById('afastamento-tipo').value = tipo;
    
    // Limpa os campos
    document.getElementById('afastamento-inicio').value = '';
    document.getElementById('afastamento-fim').value = '';
    
    document.getElementById('modal-afastamento').classList.remove('escondido');
};

window.fecharModalAfastamento = function() {
    document.getElementById('modal-afastamento').classList.add('escondido');
};

window.aplicarAfastamento = function() {
    alert("Função de pintar a tabela e bloquear os dias será feita na próxima etapa!");
    fecharModalAfastamento();
};

// AJUSTE DE DATAS
window.abrirModalAjusteDatas = function() {
    if(!configAtual) return;
    document.getElementById('ajuste-data-inicio').value = configAtual.dataInicio;
    document.getElementById('ajuste-data-fim').value = configAtual.dataFim;
    document.getElementById('modal-ajuste-datas').classList.remove('escondido');
};

window.fecharModalAjusteDatas = function() {
    document.getElementById('modal-ajuste-datas').classList.add('escondido');
};

window.aplicarAjusteDatas = function() {
    alert("Função de recriar a tabela com as novas datas será feita na próxima etapa!");
    fecharModalAjusteDatas();
};
async function carregarFeriados(ano, uf) {
    try {
        // Busca Feriados Nacionais
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (resp.ok) {
            const dados = await resp.json();
            listaFeriadosGlobais = dados.map(f => f.date);
            console.log("Feriados Nacionais carregados:", listaFeriadosGlobais);
        }
    } catch (e) {
        console.error("Erro ao buscar feriados:", e);
    }
}