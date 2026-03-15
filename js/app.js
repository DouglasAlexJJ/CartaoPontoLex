/* ==========================================================================
   MOTOR DA MESA DE TRABALHO (APP) - INTEGRADO COM FIRESTORE DA NUVEM
   ========================================================================== */

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
let configAtual = {};
let cartaoAtual = null; // Tem que ser global para a gerarFolha ver
window.batidasGlobal = {};
let usuarioLogado = null;
let listaFeriadosGlobais = [];
let anoVisualizacaoAtual = null;

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

function atualizarCabecalho(cfg) {
    const reclamante = document.getElementById('info-reclamante');
    const reclamada = document.getElementById('info-reclamada');
    const periodo = document.getElementById('info-periodo');

    if (reclamante) reclamante.innerText = cfg.reclamante || "Nome não definido";
    
    // Exibe a Reclamada se houver
    if (reclamada) {
        reclamada.innerText = cfg.reclamada ? `Reclamada: ${cfg.reclamada}` : "";
    }

    // Formata o período: DD/MM/AAAA até DD/MM/AAAA
    if (periodo && cfg.dataInicio && cfg.dataFim) {
        const formatar = (data) => data.split('-').reverse().join('/');
        periodo.innerText = `Período: ${formatar(cfg.dataInicio)} até ${formatar(cfg.dataFim)}`;
    }
}

async function carregarCartaoDaNuvem(perfilUsuario) {
    const idAtual = localStorage.getItem('cartaoAtualId');
    if (!idAtual) { window.location.href = "dashboard.html"; return; }

    const docRef = doc(db, "cartoes", idAtual);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        // ATENÇÃO: Alimentando a variável GLOBAL cartaoAtual
        cartaoAtual = docSnap.data(); 
        
        const ehDono = cartaoAtual.userId === usuarioLogado.uid;
        const ehParteDaEquipe = (
            (perfilUsuario.tipoConta === 'colaborador' || perfilUsuario.tipoConta === 'gestor') && 
            perfilUsuario.adminId === cartaoAtual.userId
        );

        if (ehDono || ehParteDaEquipe) {
            configAtual = cartaoAtual.config;
            window.batidasGlobal = cartaoAtual.batidas || {}; 

            atualizarCabecalho(configAtual);
            
            // Agora a gerarFolha vai encontrar o cartaoAtual preenchido
            gerarFolha(configAtual); 
        } else {
            alert("Acesso Negado!");
            window.location.href = "dashboard.html";
        }
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

let timerSalvar;

// 1. A função que o HTML chama (oninput)
window.salvarComAtraso = function() {
    clearTimeout(timerSalvar);
    console.log("⏳ Aguardando pausa na digitação...");

    timerSalvar = setTimeout(async () => {
        try {
            await salvarProgressoAuto(); 
        } catch (e) {
            console.error("Erro no timer de salvamento:", e);
        }
    }, 2000); 
};

// 2. A função que realmente grava no Firebase (Executa uma vez só)
async function salvarProgressoAuto() {
    if (!cartaoAtual || !usuarioLogado) return;

    const idAtual = localStorage.getItem('cartaoAtualId');
    if (!idAtual) return;

    let linhas = document.querySelectorAll('.linha-ponto');
    
    // 1. IMPORTANTE: Usamos o objeto que já existe na memória (para não apagar os outros anos)
    if (!cartaoAtual.batidas) cartaoAtual.batidas = {};
    
    // 2. Lê apenas o ano atual que está na tela e atualiza o objeto principal
    linhas.forEach(tr => {
        const dataDia = tr.getAttribute('data-dia');
        const isF = tr.classList.contains('folga');
        const isFer = tr.classList.contains('destaque-feriado'); // Lembra do Feriado Manual!
        const h = Array.from(tr.querySelectorAll('.ponto')).map(i => i.value);
        
        const temHora = h.some(v => v && v.length === 5);
        
        if (temHora || isF || isFer) {
            // Atualiza ou insere este dia
            cartaoAtual.batidas[dataDia] = {
                f: isF,
                fer: isFer,
                h: h
            };
        } else {
            // Se o usuário apagou tudo desse dia na tela, remove do banco
            delete cartaoAtual.batidas[dataDia];
        }
    });

    // 3. Atualiza o progresso baseado no total de dias reais do processo (e não apenas da tela)
    const diasPreenchidos = Object.keys(cartaoAtual.batidas).length;
    
    // Calcula quantos dias existem no total do contrato
    const dataInicioObj = new Date(configAtual.dataInicio + "T00:00:00");
    const dataFimObj = new Date(configAtual.dataFim + "T00:00:00");
    const diasTotaisProcesso = Math.ceil((dataFimObj - dataInicioObj) / (1000 * 60 * 60 * 24)) + 1;

    cartaoAtual.progresso = Math.round((diasPreenchidos / diasTotaisProcesso) * 100);
    if (cartaoAtual.progresso > 100) cartaoAtual.progresso = 100; // Trava de segurança
    
    cartaoAtual.dataEdicao = Date.now();

    try {
        const docRef = doc(db, "cartoes", idAtual);
        await updateDoc(docRef, {
            batidas: cartaoAtual.batidas, // Salva TODOS os anos juntos
            config: configAtual, // SALVA O AJUSTE DE DATA AQUI!
            progresso: cartaoAtual.progresso,
            dataEdicao: cartaoAtual.dataEdicao
        });
        console.log(`✅ Nuvem sincronizada! Progresso: ${cartaoAtual.progresso}%`);
    } catch (e) {
        console.error("❌ Erro ao salvar no Firebase:", e);
    }
}

// 4. LÓGICA DE GERAÇÃO DA FOLHA (Mantida intacta)
async function gerarFolha(cfg) {
    const corpo = document.getElementById('corpo-tabela');
    if (!corpo) return; 

    // Define o ano inicial se for a primeira vez carregando
    if (!anoVisualizacaoAtual) {
        anoVisualizacaoAtual = new Date(cfg.dataInicio + "T00:00:00").getFullYear();
    }

    // Atualiza o label do ano no rodapé (se você já tiver o span/div lá)
    const labelAno = document.getElementById('label-ano-atual');
    if (labelAno) labelAno.innerText = anoVisualizacaoAtual;

    corpo.innerHTML = '<div style="padding:20px; text-align:center;">Carregando folha do ano ' + anoVisualizacaoAtual + '...</div>'; 

    // Carrega feriados apenas do ano que está sendo visualizado
    await carregarFeriados(anoVisualizacaoAtual, cfg.uf);
    corpo.innerHTML = ''; 

    let dataAtual = new Date(cfg.dataInicio + "T00:00:00");
    const dataFimProcesso = new Date(cfg.dataFim + "T00:00:00");

    // Loop por todos os dias do processo
    while (dataAtual <= dataFimProcesso) {
        const anoDoDia = dataAtual.getFullYear();

        // SÓ GERA O HTML SE O DIA FOR DO ANO SELECIONADO
        if (anoDoDia === anoVisualizacaoAtual) {
            const numDia = dataAtual.getDay();
            const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
            const dataISO = dataAtual.toISOString().split('T')[0];
            
            const ehFeriado = listaFeriadosGlobais.includes(dataISO);
            let ehFolga = false;

            // Lógica de Escalas
            if (cfg.escala === "seg-sex") {
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
            
            // Busca dados no formato compacto (f e h)
            const batidasSalvasNoBanco = (cartaoAtual && cartaoAtual.batidas) ? cartaoAtual.batidas[dataFormatada] : null;
            
            if (batidasSalvasNoBanco && batidasSalvasNoBanco.f !== undefined) {
                ehFolga = batidasSalvasNoBanco.f;
            }

            // Estilização de FDS e Feriado
            if (ehFeriado || numDia === 0) {
                tr.className = `linha-ponto destaque-feriado ${ehFolga ? 'folga' : ''}`;
                if(ehFeriado) tr.style.backgroundColor = "#fff5f5";
            } else {
                tr.className = `linha-ponto ${ehFolga ? 'folga' : ''}`;
            }
            
            let qtdDaLinha = parseInt(cfg.qtdBatidas) || 4; 
            if (batidasSalvasNoBanco && batidasSalvasNoBanco.h) {
                qtdDaLinha = batidasSalvasNoBanco.h.length;
            }
            
            let inputsHtml = "";
            for (let i = 0; i < qtdDaLinha; i++) {
                let val = "";
                if (batidasSalvasNoBanco && batidasSalvasNoBanco.h && batidasSalvasNoBanco.h[i] !== undefined) {
                    val = batidasSalvasNoBanco.h[i];
                } else if (!ehFolga && cfg.intervaloFixo) {
                    if (i === 1 && cfg.padraoE) val = cfg.padraoE;
                    if (i === 2 && cfg.padraoS) val = cfg.padraoS;
                }
                
                inputsHtml += `<input type="text" class="ponto ${ehFolga ? 'folga-input' : ''}" maxlength="5" value="${val}" placeholder="--" oninput="salvarComAtraso()">`;
            }

            // ATUALIZADO: Incluindo a coluna da engrenagem (⚙️) antes da data
            tr.innerHTML = `
                <td style="width: 40px; text-align: center; border: none;">
                    <button type="button" class="btn-config-dia" onclick="abrirMenuLinha(event, this.closest('tr'))" title="Opções do Dia">
                        ⚙️
                    </button>
                </td>
                <td class="col-dia">
                    <strong>${diasSemana[numDia]}</strong>${ehFeriado ? ' 🚩' : ''}<br>${dataFormatada}
                </td>
                <td class="celula-inputs">
                    <div class="container-batidas">${inputsHtml}</div>
                </td>
                <td class="total-dia" style="color: #0284c7; font-weight: bold;">00:00</td>
            `;

            corpo.appendChild(tr);
        }
        
        // Incrementa o dia
        dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    // Mostra/Esconde botões de navegação conforme o limite do processo
    const btnAnterior = document.getElementById('btn-ano-anterior');
    const btnProximo = document.getElementById('btn-ano-proximo');
    
    if (btnAnterior) {
        btnAnterior.style.display = (anoVisualizacaoAtual > new Date(cfg.dataInicio + "T00:00:00").getFullYear()) ? 'block' : 'none';
    }
    if (btnProximo) {
        btnProximo.style.display = (anoVisualizacaoAtual < new Date(cfg.dataFim + "T00:00:00").getFullYear()) ? 'block' : 'none';
    }

    document.querySelectorAll('.linha-ponto').forEach(tr => calcularLinha(tr));
    
    // Próximo passo: vamos corrigir sua configurarEventos para lidar com o Enter
    configurarEventos();
}

/* ==========================================================================
   NAVEGAÇÃO DE ANOS E PULO AUTOMÁTICO
   ========================================================================== */

// Função inteligente que verifica se tem um próximo ano e pula
window.verificarPuloDeAno = function() {
    if (typeof configAtual === 'undefined' || !configAtual) return;
    
    // CORREÇÃO: Força o salvamento imediato ANTES de destruir a tela atual!
    // Usamos a salvarProgressoAuto() direta, sem o "ComAtraso".
    if (typeof window.salvarProgressoAuto === 'function') {
        window.salvarProgressoAuto(); 
    } else if (typeof salvarProgressoAuto === 'function') {
        salvarProgressoAuto();
    }
    
    const anoFimProcesso = new Date(configAtual.dataFim + "T00:00:00").getFullYear();
    
    if (anoVisualizacaoAtual < anoFimProcesso) {
        // Pula para o próximo ano e avisa que veio pelo teclado (true)
        window.mudarAno(1, true); 
    } else {
        // Se já estiver no último ano do processo
        alert("Você chegou ao final do período deste cartão!");
    }
};

// Atualizada para focar no primeiro input quando virar o ano pelo teclado
window.mudarAno = async function(direcao, focarNoPrimeiro = false) {
    anoVisualizacaoAtual += direcao;
    window.scrollTo(0, 0);
    
    // Regera a folha (await garante que espera a tabela ser desenhada na tela)
    await gerarFolha(configAtual);
    
    // Se a virada de ano foi feita pelo Enter/Digitação, foca no 1º campo livre
    if (focarNoPrimeiro) {
        setTimeout(() => {
            // Procura o primeiro campo do ano novo que não seja folga
            const primeiroInput = document.querySelector('.ponto:not(.folga-input)');
            if (primeiroInput) {
                primeiroInput.focus();
                primeiroInput.select();
            }
        }, 150); // Dá um tempinho para o navegador respirar e renderizar
    }
};

function configurarEventos() {
    const inputs = Array.from(document.querySelectorAll('.ponto'));
    
    inputs.forEach((input, index) => {
        input.onfocus = () => input.select();
        
        input.onkeypress = (e) => { 
            if (!/[0-9*]/.test(e.key)) e.preventDefault(); 
        };
        
        input.oninput = (e) => {
            if (e.inputType === 'deleteContentBackward') return;
            let val = input.value.replace(':', '');
            
            if (val.includes('*')) {
                input.value = input.value.replace('*', '');
                return;
            }

            if (val.length >= 2) {
                let h = val.substring(0, 2);
                if (parseInt(h) > 23) h = "23";
                input.value = h + ":" + val.substring(2);
            }
            
            if (input.value.length === 5) {
                let [h, m] = input.value.split(':');
                if (parseInt(m) > 59) input.value = h + ":59";
                
                if (typeof calcularLinha === 'function') calcularLinha(input.closest('tr'));
                
                // --- MÁGICA: SE FOR O ÚLTIMO CAMPO DA PÁGINA (DIA 31/12) ---
                if (index === inputs.length - 1) {
                    window.verificarPuloDeAno();
                } else {
                    if (typeof pularCampoInteligente === 'function') {
                        pularCampoInteligente(input, index, 1);
                    }
                }
            }
        };

        input.onkeydown = (e) => {
            const tr = input.closest('tr');

            // Atalhos + e - para gerenciar batidas
            if (e.key === '+' && typeof window.gerenciarBatidas === 'function') {
                e.preventDefault(); 
                window.gerenciarBatidas(input, 2); 
                setTimeout(() => {
                    const todosInputs = tr.querySelectorAll('.ponto');
                    const novo = todosInputs[todosInputs.length - 2];
                    if (novo) novo.focus();
                }, 10);
                return;
            }

            if (e.key === '-' && typeof window.gerenciarBatidas === 'function') {
                e.preventDefault(); 
                window.gerenciarBatidas(input, -2);
                return;
            }

            // Teclas de navegação (Enter e Tab)
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                if (typeof completarHora === 'function') completarHora(input);

                const voltando = e.shiftKey; // Pressionou Shift + Tab para voltar

                // --- MÁGICA: ENTER OU TAB NO ÚLTIMO CAMPO ---
                if (!voltando && index === inputs.length - 1 && (e.key === 'Enter' || e.key === 'Tab')) {
                    window.verificarPuloDeAno();
                } else {
                    if (e.key === 'Tab' && typeof pularCampoInteligente === 'function') {
                        pularCampoInteligente(input, index, voltando ? -1 : 1);
                    } else if (e.key === 'Enter' && typeof pularLinha === 'function') {
                        pularLinha(tr);
                    }
                }
            }
        };

        input.onblur = () => {
            if (typeof completarHora === 'function') completarHora(input);
            if (typeof window.salvarComAtraso === 'function') window.salvarComAtraso();
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
    if (!configAtual) return;

    const ins = tr.querySelectorAll('.ponto');
    const dataString = tr.getAttribute('data-dia'); 
    const isFeriado = tr.classList.contains('destaque-feriado') || tr.classList.contains('destaque-vermelho');
    const isFolga = tr.classList.contains('folga');
    
    const [dia, mes, ano] = dataString.split('/');
    const dataObj = new Date(`${ano}-${mes}-${dia}T00:00:00`);
    const diaSemana = dataObj.getDay(); 

    let totalDiurno = 0;
    let totalNoturnoFicto = 0;

    for (let i = 0; i < ins.length; i += 2) {
        const e = hhmmParaMin(ins[i]?.value);
        const s = hhmmParaMin(ins[i+1]?.value);
        if (e > 0 && s > 0) {
            const turno = calcularTurno(e, s);
            totalDiurno += turno.diurno;
            totalNoturnoFicto += turno.noturnoFicto;
        }
    }

    let tempoTotalHoras = (totalDiurno + totalNoturnoFicto) / 60;
    
    // Garantindo que os parâmetros sejam números
    const LIMITE_DIARIO = Number(configAtual.horasDiarias || 8);
    const pctFolga1 = Number(configAtual.heFolga1 || 50); 
    const pctFolga2 = Number(configAtual.heFolga2 || 100); 
    const regrasEscada = configAtual.regrasExtra || [];

    let horasNormais = 0;
    let extrasPorFaixa = {}; 

    if (isFeriado || (isFolga && diaSemana === 0)) {
        // DOMINGO OU FERIADO
        extrasPorFaixa[pctFolga2] = (extrasPorFaixa[pctFolga2] || 0) + tempoTotalHoras;
    } else if (isFolga) {
        // SÁBADO OU FOLGA ESCALonada
        extrasPorFaixa[pctFolga1] = (extrasPorFaixa[pctFolga1] || 0) + tempoTotalHoras;
    } else {
        // DIA NORMAL (Segunda a Sexta) -> AQUI ENTRA A ESCADINHA
        if (tempoTotalHoras > LIMITE_DIARIO) {
            horasNormais = LIMITE_DIARIO;
            let saldoExtra = tempoTotalHoras - LIMITE_DIARIO;
            let acumuladoExtraNoDia = 0;

            // Ordenação rigorosa da escadinha
            const escadaOrdenada = [...regrasEscada].sort((a, b) => {
                let limA = a.limite === '' ? 999 : Number(a.limite);
                let limB = b.limite === '' ? 999 : Number(b.limite);
                return limA - limB;
            });

            if (escadaOrdenada.length === 0) {
                extrasPorFaixa[50] = saldoExtra;
            } else {
                escadaOrdenada.forEach(regra => {
                    if (saldoExtra <= 0) return;
                    
                    const pct = Number(regra.porcento);
                    const lim = regra.limite === '' ? null : Number(regra.limite);

                    if (lim === null) {
                        // Faixa final (ex: acima de 5h)
                        extrasPorFaixa[pct] = (extrasPorFaixa[pct] || 0) + saldoExtra;
                        saldoExtra = 0;
                    } else {
                        let espacoNestaFaixa = lim - acumuladoExtraNoDia;
                        if (espacoNestaFaixa > 0) {
                            let consumo = Math.min(saldoExtra, espacoNestaFaixa);
                            extrasPorFaixa[pct] = (extrasPorFaixa[pct] || 0) + consumo;
                            saldoExtra -= consumo;
                            acumuladoExtraNoDia += consumo;
                        }
                    }
                });
            }
        } else {
            horasNormais = tempoTotalHoras;
        }
    }

    // Salvamento nos Datasets
    tr.querySelector('.total-dia').innerText = minParaHHMM(Math.round(tempoTotalHoras * 60));
    tr.dataset.normais = horasNormais.toFixed(4);
    tr.dataset.extrasJson = JSON.stringify(extrasPorFaixa);
    tr.dataset.adcNoturno = (totalNoturnoFicto / 60).toFixed(4);

    if (typeof atualizarTotalGeral === 'function') atualizarTotalGeral();
}

function hhmmParaMin(t) {
    if (!t || t.length < 5) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h * 60) + m;
}

function minParaHHMM(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

function atualizarTotalGeral() {
    let totGeralMin = 0, totNormaisDec = 0, totNoturnoDec = 0;
    let acumuladorExtras = {};

    document.querySelectorAll('.linha-ponto').forEach(tr => {
        totGeralMin += hhmmParaMin(tr.querySelector('.total-dia').innerText);
        totNormaisDec += parseFloat(tr.dataset.normais || 0);
        totNoturnoDec += parseFloat(tr.dataset.adcNoturno || 0);

        try {
            const extras = JSON.parse(tr.dataset.extrasJson || '{}');
            for (let pct in extras) {
                // Força a porcentagem a ser tratada como número para somar certo
                let p = Number(pct);
                acumuladorExtras[p] = (acumuladorExtras[p] || 0) + Number(extras[pct]);
            }
        } catch (e) {}
    });

    // Atualiza fixos
    document.getElementById('total-geral-periodo').innerText = minParaHHMM(totGeralMin);
    document.getElementById('total-normais').innerText = decimalParaHHMM(totNormaisDec);
    document.getElementById('total-noturno').innerText = decimalParaHHMM(totNoturnoDec);

    // Atualiza Dinâmicos (Escadinha e Folgas)
    const container = document.getElementById('container-extras-dinamico');
    if (container) {
        container.innerHTML = "";
        // Ordena as chaves numericamente (50, 70, 80, 100...)
        Object.keys(acumuladorExtras).sort((a,b) => Number(a) - Number(b)).forEach(pct => {
            let valor = acumuladorExtras[pct];
            if (valor > 0.001) { // Só mostra se tiver tempo (evita lixo de processamento)
                const div = document.createElement('div');
                div.className = "resumo-item extra-dinamico";
                div.innerHTML = `
                    <span>Total ${pct}%</span>
                    <strong>${decimalParaHHMM(valor)}</strong>
                `;
                container.appendChild(div);
            }
        });
    }
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

// Adicionamos window. para o HTML conseguir enxergar a função
/* ==========================================================================
   MENU FLUTUANTE DA ENGRENAGEM (AÇÕES DA LINHA)
   ========================================================================== */

let linhaAtivaMenu = null;

// 1. Abre o menu na posição do mouse
window.abrirMenuLinha = function(event, tr) {
    event.stopPropagation(); // Evita que o clique feche o menu imediatamente
    linhaAtivaMenu = tr;
    
    const menu = document.getElementById('menu-acao-linha');
    menu.classList.remove('escondido');
    
    // Calcula a posição do mouse para desenhar o menu ali
    menu.style.top = `${event.pageY + 10}px`;
    menu.style.left = `${event.pageX + 10}px`;
};

// 2. Fecha o menu se o usuário clicar em qualquer outro lugar da tela
document.addEventListener('click', () => {
    const menu = document.getElementById('menu-acao-linha');
    if (menu && !menu.classList.contains('escondido')) {
        menu.classList.add('escondido');
    }
});

// 3. Roteia os cliques do menu para as funções corretas
window.acionarMenuLinha = function(acao) {
    if (!linhaAtivaMenu) return;

    if (acao === 'feriado') {
        alternarFeriadoManual(linhaAtivaMenu);
    } else if (acao === 'folga') {
        alternarFolgaManual(linhaAtivaMenu);
    } else if (acao === 'add-batida') {
        const inputRef = linhaAtivaMenu.querySelector('.ponto');
        if (inputRef) window.gerenciarBatidas(inputRef, 2);
    } else if (acao === 'rem-batida') {
        const inputRef = linhaAtivaMenu.querySelector('.ponto');
        if (inputRef) window.gerenciarBatidas(inputRef, -2);
    }

    // Fecha o menu após a ação
    document.getElementById('menu-acao-linha').classList.add('escondido');
};

// 4. As funções base de folga e feriado (garantindo a sobrescrita da API)
window.alternarFeriadoManual = function(tr) {
    if (!tr) return;
    const jaEhFeriado = tr.classList.contains('destaque-feriado');
    
    if (jaEhFeriado) {
        tr.classList.remove('destaque-feriado');
        tr.style.backgroundColor = "";
    } else {
        tr.classList.add('destaque-feriado');
        tr.style.backgroundColor = "#fff5f5";
    }
    if (typeof window.salvarComAtraso === 'function') window.salvarComAtraso();
};

window.alternarFolgaManual = function(tr) {
    if (!tr) return;
    tr.classList.toggle('folga');
    const inputs = tr.querySelectorAll('.ponto');
    
    if (tr.classList.contains('folga')) {
        inputs.forEach(input => {
            input.classList.add('folga-input');
            input.value = ""; 
        });
    } else {
        inputs.forEach(input => input.classList.remove('folga-input'));
    }
    if (typeof window.salvarComAtraso === 'function') window.salvarComAtraso();
};
/* ==========================================================================
   SISTEMA DE AFASTAMENTOS UNIFICADO
   ========================================================================== */

// 1. Abre o modal e limpa os campos antigos
window.abrirModalAfastamentoUnificado = function() {
    document.getElementById('modal-afastamento').classList.remove('escondido');
    
    // Reseta o formulário
    document.getElementById('afastamento-tipo-select').value = 'Férias';
    document.getElementById('afastamento-descricao').value = '';
    document.getElementById('grupo-outros-desc').classList.add('escondido');
    document.getElementById('afastamento-inicio').value = '';
    document.getElementById('afastamento-fim').value = '';

    // Fecha o menu principal de configurações se ele estiver aberto
    const menuPrincipal = document.getElementById('menu-config-app');
    if(menuPrincipal) menuPrincipal.classList.add('escondido');
};

// 2. Fecha o modal
window.fecharModalAfastamento = function() {
    document.getElementById('modal-afastamento').classList.add('escondido');
};

// 3. Mostra/Esconde o campo de "Outros" dinamicamente
window.verificarTipoAfastamento = function() {
    const tipo = document.getElementById('afastamento-tipo-select').value;
    const grupoOutros = document.getElementById('grupo-outros-desc');
    
    if (tipo === 'Outros') {
        grupoOutros.classList.remove('escondido');
    } else {
        grupoOutros.classList.add('escondido');
    }
};

// 4. Aplica o afastamento na tabela
window.aplicarAfastamento = function() {
    const tipoSelecionado = document.getElementById('afastamento-tipo-select').value;
    const descricao = document.getElementById('afastamento-descricao').value;
    const dataInicio = document.getElementById('afastamento-inicio').value;
    const dataFim = document.getElementById('afastamento-fim').value;

    if (!dataInicio || !dataFim) {
        alert("Por favor, selecione as datas inicial e final do afastamento.");
        return;
    }

    const dataInicioObj = new Date(dataInicio + "T00:00:00");
    const dataFimObj = new Date(dataFim + "T00:00:00");

    if (dataInicioObj > dataFimObj) {
        alert("A data inicial não pode ser maior que a data final.");
        return;
    }

    // Define o nome que vai aparecer (se for 'Outros' e tiver descrição, usa ela)
    const nomeMotivo = (tipoSelecionado === 'Outros' && descricao.trim() !== "") ? descricao : tipoSelecionado;

    let aplicou = false;
    let dataAtualLoop = new Date(dataInicioObj);

    // Percorre todos os dias do período
    while(dataAtualLoop <= dataFimObj) {
        const dataFormatada = dataAtualLoop.toLocaleDateString('pt-BR');
        
        // Pega a linha na tabela pelo atributo 'data-dia'
        const tr = document.querySelector(`tr[data-dia="${dataFormatada}"]`);

        if (tr) {
            aplicou = true;
            tr.classList.add('folga'); // Fica cinza
            
            // Apaga os horários e bloqueia visualmente
            const inputs = tr.querySelectorAll('.ponto');
            inputs.forEach(input => {
                input.classList.add('folga-input');
                input.value = ""; 
            });

            // Atualiza o objeto do Firebase na memória
            if (!cartaoAtual.batidas[dataFormatada]) {
                cartaoAtual.batidas[dataFormatada] = { h: [] };
            }
            cartaoAtual.batidas[dataFormatada].f = true;
            // Futuramente podemos exibir esse motivo na exportação
            cartaoAtual.batidas[dataFormatada].motivo = nomeMotivo; 
        }
        
        dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
    }

    if (aplicou) {
        // Dispara o salvamento e fecha o modal
        if (typeof window.salvarComAtraso === 'function') {
            window.salvarComAtraso();
        } else if (typeof salvarComAtraso === 'function') {
            salvarComAtraso();
        }
        
        fecharModalAfastamento();
        alert(`✅ ${nomeMotivo} aplicado com sucesso!`);
    } else {
        alert("Nenhum dia encontrado neste período na página atual.");
    }
};
/* ==========================================================================
   SISTEMA DE AJUSTE DE PERÍODO (INCLUIR/EXCLUIR DATAS)
   ========================================================================== */

// 1. Abre o modal e já preenche com as datas atuais do processo
window.abrirModalAjusteDatas = function() {
    if (typeof configAtual === 'undefined' || !configAtual) return;

    // Puxa as datas direto da configuração atual e joga nos inputs
    document.getElementById('ajuste-data-inicio').value = configAtual.dataInicio;
    document.getElementById('ajuste-data-fim').value = configAtual.dataFim;
    
    document.getElementById('modal-ajuste-datas').classList.remove('escondido');
    
    // Fecha o menu principal da engrenagem se estiver aberto
    const menuPrincipal = document.getElementById('menu-config-app');
    if (menuPrincipal) menuPrincipal.classList.add('escondido');
};

// 2. Fecha o modal
window.fecharModalAjusteDatas = function() {
    document.getElementById('modal-ajuste-datas').classList.add('escondido');
};

// 3. Aplica o novo período, limpa o lixo e regera a tela
window.aplicarAjusteDatas = function() {
    const novaInicio = document.getElementById('ajuste-data-inicio').value;
    const novaFim = document.getElementById('ajuste-data-fim').value;

    if (!novaInicio || !novaFim) {
        alert("Por favor, preencha a data inicial e final.");
        return;
    }

    const dataInicioObj = new Date(novaInicio + "T00:00:00");
    const dataFimObj = new Date(novaFim + "T00:00:00");

    if (dataInicioObj > dataFimObj) {
        alert("A data inicial não pode ser maior que a data final.");
        return;
    }

    // Pede confirmação pois essa ação pode apagar dias já digitados
    const confirma = confirm("Deseja confirmar a alteração do período? Datas que ficarem de fora do novo limite serão apagadas.");
    if (!confirma) return;

    // 3.1 Atualiza a configuração na memória
    configAtual.dataInicio = novaInicio;
    configAtual.dataFim = novaFim;

    // 3.2 Limpa o banco de dados (Apaga os dias que ficaram de fora)
    if (cartaoAtual && cartaoAtual.batidas) {
        for (let dataFormatada in cartaoAtual.batidas) {
            // Converte a data salva "DD/MM/YYYY" para objeto Date comparável
            const [dia, mes, ano] = dataFormatada.split('/');
            const dataBatidaObj = new Date(`${ano}-${mes}-${dia}T00:00:00`);
            
            // Se a data do banco for menor que o novo início OU maior que o novo fim, deleta!
            if (dataBatidaObj < dataInicioObj || dataBatidaObj > dataFimObj) {
                delete cartaoAtual.batidas[dataFormatada];
            }
        }
    }

    // 3.3 Atualiza o texto visual do período lá no topo da tela (Cabeçalho)
    const infoPeriodo = document.getElementById('info-periodo');
    if (infoPeriodo) {
        infoPeriodo.innerText = `Período: ${novaInicio.split('-').reverse().join('/')} a ${novaFim.split('-').reverse().join('/')}`;
    }

    // 3.4 Força a paginação a voltar para o primeiro ano do novo período
    anoVisualizacaoAtual = dataInicioObj.getFullYear();

    // 3.5 Salva no banco de dados e fecha o modal
    if (typeof window.salvarComAtraso === 'function') window.salvarComAtraso();
    fecharModalAjusteDatas();

    // 3.6 Regera a tabela para mostrar as novas linhas (ou esconder as removidas)
    gerarFolha(configAtual);
    
    alert("Período atualizado com sucesso!");
};
window.gerarPDF = function() {
    // 1. Verificação de segurança inicial
    if (!configAtual || !configAtual.dataInicio || !configAtual.dataFim) {
        alert("Erro: Configurações do período não encontradas.");
        return;
    }

    const { reclamante, reclamada, dataInicio, dataFim, qtdBatidas } = configAtual;
    const nBatidas = parseInt(qtdBatidas || 4);
    
    // 2. Criação das datas (Ordem correta para evitar o ReferenceError)
    const dataIn = new Date(dataInicio + "T00:00:00");
    const dataFi = new Date(dataFim + "T00:00:00");
    let dataVar = new Date(dataIn); // Inicializada aqui, ANTES de qualquer uso

    let acumGeralExtras = {};
    let totGeralNormais = 0;
    let totGeralNoturno = 0;
    let totGeralMinutos = 0;
    const mesesRelatorio = {};

    // 3. Loop pelo período total
    while (dataVar <= dataFi) {
        const diaFmt = dataVar.toLocaleDateString('pt-BR');
        const diaKeyUnderline = diaFmt.replace(/\//g, '_');
        
        // Busca o registro (que contém .h e .f)
        const registro = (window.batidasGlobal[diaFmt]) || (window.batidasGlobal[diaKeyUnderline]) || null;
        
        // Extrai o array de batidas (.h)
        const batidas = (registro && registro.h) ? registro.h : [];
        
        // Só processa se o dia tiver alguma batida digitada
        if (batidas.some(b => b && b.trim() !== "")) {
            const res = calcularValoresDiaParaRelatorio(dataVar, batidas);
            const mesAno = diaFmt.substring(3); // "03/2026"
            
            if (!mesesRelatorio[mesAno]) mesesRelatorio[mesAno] = [];
            mesesRelatorio[mesAno].push({ data: diaFmt, batidas, res });

            // Soma nos acumuladores
            totGeralNormais += res.normais;
            totGeralNoturno += res.noturno;
            totGeralMinutos += res.totalMinutos;
            for (let p in res.extras) { 
                acumGeralExtras[p] = (acumGeralExtras[p] || 0) + res.extras[p]; 
            }
        }
        // Incrementa o dia para a próxima volta do loop
        dataVar.setDate(dataVar.getDate() + 1);
    }

    // 4. Se não encontrou nada em nenhum ano/mês
    if (Object.keys(mesesRelatorio).length === 0) {
        alert("Não há batidas preenchidas no período selecionado.");
        return;
    }

    // 5. Montagem do Elemento HTML para o PDF
    const elemento = document.createElement('div');
    elemento.style.padding = '15px';
    elemento.style.fontFamily = 'Arial, sans-serif';

    // Cabeçalho das colunas (Entrada 1, Saída 1...)
    let colunasHeader = `<th style="border:1px solid #333; padding:5px;">DATA</th>`;
    for (let i = 1; i <= nBatidas / 2; i++) {
        colunasHeader += `<th style="border:1px solid #333;">ENT ${i}</th><th style="border:1px solid #333;">SAÍ ${i}</th>`;
    }
    colunasHeader += `<th style="border:1px solid #333;">TOTAL</th><th style="border:1px solid #333;">NOT.</th>`;

    // Gerar páginas por mês
    Object.keys(mesesRelatorio).forEach(mesAno => {
        const divMes = document.createElement('div');
        divMes.style.pageBreakAfter = 'always';
        divMes.innerHTML = `
            <div style="text-align:center; border-bottom:2px solid #000; margin-bottom:20px; padding-bottom:10px;">
                <h2 style="margin:0;">RELATÓRIO DE PONTO - ${mesAno}</h2>
                <p style="margin:5px 0;"><strong>Reclamante:</strong> ${reclamante} | <strong>Reclamada:</strong> ${reclamada}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size: 8.5px; text-align:center;">
                <thead><tr style="background:#f1f5f9;">${colunasHeader}</tr></thead>
                <tbody>
                    ${mesesRelatorio[mesAno].map(d => {
                        let cels = '';
                        for(let j=0; j<nBatidas; j++) {
                            cels += `<td style="border:1px solid #ccc; padding:3px;">${d.batidas[j] || '-'}</td>`;
                        }
                        return `<tr>
                            <td style="border:1px solid #ccc; font-weight:bold;">${d.data}</td>
                            ${cels}
                            <td style="border:1px solid #ccc; font-weight:bold; background:#fafafa;">${d.res.totalFormatado}</td>
                            <td style="border:1px solid #ccc;">${decimalParaHHMM(d.res.noturno)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
        elemento.appendChild(divMes);
    });

    // 6. Resumo Final (Última Página)
    const divResumo = document.createElement('div');
    let extrasHtml = '';
    Object.keys(acumGeralExtras).sort((a,b)=>a-b).forEach(p => {
        extrasHtml += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:10px;">Horas Extras ${p}%</td>
                <td style="padding:10px; text-align:right;"><strong>${decimalParaHHMM(acumGeralExtras[p])}</strong></td>
            </tr>
        `;
    });

    divResumo.innerHTML = `
        <div style="text-align:center; margin-top:30px;">
            <h2 style="background:#1e293b; color:white; padding:15px; border-radius:8px;">RESUMO CONSOLIDADO</h2>
        </div>
        <table style="width:100%; max-width:500px; margin:20px auto; border-collapse:collapse; border:1px solid #e2e8f0; font-size:14px;">
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:10px;">Total Horas Normais:</td>
                <td style="padding:10px; text-align:right;">${decimalParaHHMM(totGeralNormais)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:10px;">Total Adicional Noturno:</td>
                <td style="padding:10px; text-align:right;">${decimalParaHHMM(totGeralNoturno)}</td>
            </tr>
            ${extrasHtml}
            <tr style="background:#f8fafc; font-size:1.2em; border-top:2px solid #1e293b;">
                <td style="padding:15px;"><strong>TOTAL GERAL DO PERÍODO:</strong></td>
                <td style="padding:15px; text-align:right;"><strong>${minParaHHMM(totGeralMinutos)}</strong></td>
            </tr>
        </table>
    `;
    elemento.appendChild(divResumo);

    // 7. Configuração e Disparo do PDF
    const opt = {
        margin: [10, 8, 10, 8],
        filename: `Laudo_Ponto_${reclamante.split(' ')[0]}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: nBatidas > 6 ? 'landscape' : 'portrait' }
    };

    html2pdf().set(opt).from(elemento).save();
};

/**
 * FUNÇÃO DE CÁLCULO PARA O RELATÓRIO (Portando sua lógica da UI)
 */
function calcularValoresDiaParaRelatorio(dataObj, batidas) {
    let tDiurno = 0, tNotFicto = 0;
    for (let i = 0; i < batidas.length; i += 2) {
        const e = hhmmParaMin(batidas[i]);
        const s = hhmmParaMin(batidas[i+1]);
        if (e > 0 && s > 0) {
            const turno = calcularTurno(e, s);
            tDiurno += turno.diurno;
            tNotFicto += turno.noturnoFicto;
        }
    }

    const totalMinutos = tDiurno + tNotFicto;
    const tHoras = totalMinutos / 60;
    const diaSemana = dataObj.getDay(); // 0=Dom, 6=Sab

    // Pegamos as regras da config
    const limite = Number(configAtual.horasDiarias || 8);
    const pFolga1 = Number(configAtual.heFolga1 || 50);
    const pFolga2 = Number(configAtual.heFolga2 || 100);
    const escada = configAtual.regrasExtra || [];

    let resNormais = 0;
    let resExtras = {};

    // 1. Identifica Feriados (Opcional: Se você tiver lista de feriados, cheque aqui)
    const isFeriadoOuDom = (diaSemana === 0); // Simplificado: Domingo é sempre Folga 2

    if (isFeriadoOuDom) {
        resExtras[pFolga2] = tHoras;
    } else if (diaSemana === 6) { // Sábado
        resExtras[pFolga1] = tHoras;
    } else {
        // Dia Normal -> Escadinha
        if (tHoras > limite) {
            resNormais = limite;
            let saldo = tHoras - limite;
            let acumulado = 0;

            const ord = [...escada].sort((a,b) => (a.limite==='' ? 999 : Number(a.limite)) - (b.limite==='' ? 999 : Number(b.limite)));

            if (ord.length === 0) {
                resExtras[50] = saldo;
            } else {
                ord.forEach(r => {
                    if (saldo <= 0) return;
                    const p = Number(r.porcento);
                    const l = r.limite === '' ? null : Number(r.limite);
                    if (l === null) {
                        resExtras[p] = (resExtras[p] || 0) + saldo;
                        saldo = 0;
                    } else {
                        let disp = l - acumulado;
                        if (disp > 0) {
                            let consumo = Math.min(saldo, disp);
                            resExtras[p] = (resExtras[p] || 0) + consumo;
                            saldo -= consumo;
                            acumulado += consumo;
                        }
                    }
                });
            }
        } else {
            resNormais = tHoras;
        }
    }

    return {
        totalFormatado: minParaHHMM(totalMinutos),
        totalMinutos: totalMinutos,
        noturno: tNotFicto / 60,
        normais: resNormais,
        extras: resExtras,
        isDestaque: (diaSemana === 0 || diaSemana === 6)
    };
}