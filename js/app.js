/* ==========================================================================
   MOTOR DA MESA DE TRABALHO (APP) - INTEGRADO COM FIRESTORE DA NUVEM
   ========================================================================== */

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const MODO_TESTE = false; // MUDE PARA FALSE QUANDO FOR PARA PRODUÇÃO
const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
window.batidasGlobal = {};
let listaFeriadosGlobais = [];
let anoVisualizacaoAtual = null;
let configAtual = {};
let cartaoAtual = null;
let usuarioLogado = null;

// 1. Inicia buscando da Nuvem
document.addEventListener('DOMContentLoaded', () => {
    
    // --- BYPASS DE TESTE LOCAL ---
    if (MODO_TESTE) {
        console.warn("MODO TESTE ATIVADO no app.js: Carregando dados fictícios.");
        usuarioLogado = { uid: "usuario_teste_123" };
        cartaoAtual = {
            id: "cartao_teste",
            userId: "usuario_teste_123",
            progresso: 0,
            batidas: {},
            config: {
                reclamante: "João da Silva (Ambiente de Teste)",
                dataInicio: "2024-01-01",
                dataFim: "2024-01-31",
                escala: "seg-sex",
                horasDiarias: 8,
                horasSemanais: 44
            }
        };
        configAtual = cartaoAtual.config;
        
        // Elemento pode não existir na página, então checamos antes
        const elReclamante = document.getElementById('info-reclamante');
        if (elReclamante) elReclamante.innerText = configAtual.reclamante;
        
        gerarFolha(configAtual);
        return; // Encerra aqui, impedindo que o Firebase seja acionado!
    }
    // ------------------------------

    onAuthStateChanged(auth, async (user) => {
        if (user) {
        usuarioLogado = user;
        
        const perfilDoc = await getDoc(doc(db, "usuarios", user.uid));
        const dadosPerfil = perfilDoc.data();

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

    // --- BLOQUEIO DE SALVAMENTO PARA MODO TESTE ---
    if (MODO_TESTE) {
        console.log(`✅ Simulação de Salvo (MODO TESTE)! Progresso: ${cartaoAtual.progresso}%`);
        console.log("Batidas na memória:", cartaoAtual.batidas);
        return; // O "return" faz a função parar aqui, protegendo o Firebase real
    }
    // ----------------------------------------------

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

function hhmmParaMin(horario) {
    if (!horario || horario.length < 5) return 0;
    const [h, m] = horario.split(':').map(Number);
    return (h * 60) + m;
}

function minParaHHMM(minutos) {
    if (isNaN(minutos) || minutos < 0) return "00:00";
    const h = Math.floor(minutos / 60);
    const m = Math.floor(minutos % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Função que calcula a duração entre duas batidas, separando Noturno e Diurno
function calcularIntervaloDiferenciado(ent, sai, aplicaSumula60 = false) {
    let entMin = hhmmParaMin(ent);
    let saiMin = hhmmParaMin(sai);
    if (saiMin <= entMin) saiMin += 1440; // Virou a noite

    let minDiurno = 0;
    let minNoturno = 0;
    let entrouNaMadrugada = false; // Radar da Súmula 60

    for (let m = entMin; m < saiMin; m++) {
        let minutoDoDia = m % 1440; 
        
        let isNoturno = (minutoDoDia >= 1320 || minutoDoDia < 300);
        
        if (isNoturno) {
            minNoturno++;
            entrouNaMadrugada = true; // O motor detetou que ele trabalhou de noite
        } else {
            // Se já passou das 05h da manhã (minuto >= 300) e ele veio da madrugada,
            // e o advogado pediu a Súmula 60, essa hora vira noturna!
            if (aplicaSumula60 && entrouNaMadrugada && minutoDoDia >= 300 && minutoDoDia < 1320) {
                minNoturno++; 
            } else {
                minDiurno++;
            }
        }
    }

    let minNoturnoFicto = minNoturno * (60 / 52.5);

    return {
        diurno: minDiurno,
        noturno: minNoturnoFicto,
        totalTrabalhado: minDiurno + minNoturnoFicto
    };
}

function calcularLinha(tr) {
    if (!tr) return;
    
    const campoTotal = tr.querySelector('.total-dia');
    const inputs = Array.from(tr.querySelectorAll('.ponto')).map(i => i.value);
    
    // Verifica se existe pelo menos uma batida preenchida nesta linha
    const temBatida = inputs.some(v => v && v.length === 5);

    // MUDANÇA AQUI: Só zera a linha se for folga E NÃO tiver batidas digitadas!
    if (!temBatida && (tr.classList.contains('folga') || tr.classList.contains('afastamento'))) {
        if (campoTotal) campoTotal.innerText = "00:00";
        tr.dataset.totalDiurnoMin = 0;
        tr.dataset.totalNoturnoMin = 0;
        tr.dataset.totalBruto = 0;
        return;
    }

    let totalDiurnoMin = 0;
    let totalNoturnoMin = 0;

    for (let i = 0; i < inputs.length; i += 2) {
        let ent = inputs[i];
        let sai = inputs[i + 1];
        if (ent && sai && ent.length === 5 && sai.length === 5) {
            let res = calcularIntervaloDiferenciado(ent, sai);
            totalDiurnoMin += res.diurno;
            totalNoturnoMin += res.noturno;
        }
    }

    const totalTrabalhadoMin = totalDiurnoMin + totalNoturnoMin;
    const horasTrabalhadasDec = totalTrabalhadoMin / 60;

    if (campoTotal) campoTotal.innerText = minParaHHMM(totalTrabalhadoMin);

    tr.dataset.totalDiurnoMin = totalDiurnoMin;
    tr.dataset.totalNoturnoMin = totalNoturnoMin;
    tr.dataset.totalBruto = horasTrabalhadasDec.toFixed(4); 
}

// -------------------------------------------------------------------------
// MOTOR JURÍDICO: APURAÇÃO DE HORAS EXTRAS (DIÁRIAS E SEMANAIS)
// -------------------------------------------------------------------------

/**
 * Analisa um array de dias de uma mesma semana de segunda a domingo.
 * @param {Array} diasDaSemana - Array de objetos contendo os minutos trabalhados no dia.
 * @param {Number} limiteDiarioMin - Padrão: 480 min (8 horas).
 * @param {Number} limiteSemanalMin - Padrão: 2640 min (44 horas).
 */
function apurarHorasExtrasSemana(diasDaSemana, limiteDiarioMin = 480, limiteSemanalMin = 2640) {
    let totalSemanaMin = 0;
    let heDiariasMin = 0;
    let heSemanaisMin = 0;

    diasDaSemana.forEach(dia => {
        if (dia.domFerMin > 0) return; 

        let trabMin = dia.totalTrabalhadoMin || 0; 
        if (trabMin > limiteDiarioMin) {
            heDiariasMin += (trabMin - limiteDiarioMin);
        }
        totalSemanaMin += trabMin;
    });

    let horasNormaisSemana = totalSemanaMin - heDiariasMin; 
    if (horasNormaisSemana > limiteSemanalMin) {
        heSemanaisMin = horasNormaisSemana - limiteSemanalMin;
    }

    // --- LÓGICA DA SÚMULA 85 (INCISO IV) ---
    // Tudo que passar das 44h brutas é "Hora Extra Cheia"
    let sumulaCheiaMin = totalSemanaMin > limiteSemanalMin ? (totalSemanaMin - limiteSemanalMin) : 0;
    
    // O "Apenas Adicional" são as horas diárias que foram "compensadas", ou seja, o que sobra 
    // das Extras Diárias depois de tirarmos as Extras Cheias.
    let sumulaAdicionalMin = heDiariasMin;
    if (sumulaCheiaMin > 0) {
        sumulaAdicionalMin = Math.max(0, heDiariasMin - sumulaCheiaMin);
    }

    return {
        totalTrabalhadoSemana: totalSemanaMin,
        heDiarias: heDiariasMin,
        heSemanais: heSemanaisMin,
        totalHe: heDiariasMin + heSemanaisMin,
        sumulaAdicional: sumulaAdicionalMin, // NOVO: Só o adicional
        sumulaCheia: sumulaCheiaMin          // NOVO: Hora extra completa
    };
}

// -------------------------------------------------------------------------
// MOTOR JURÍDICO: APURAÇÃO DO ART. 66 (INTERJORNADA - 11 HORAS)
// -------------------------------------------------------------------------

/**
 * Calcula se houve violação do descanso de 11 horas (660 min) entre duas jornadas.
 * Base legal: Art. 66 da CLT c/c Súmula 110 TST / OJ 355 SDI-1.
 * * @param {String} ultimaSaidaOntem - HH:MM da última batida do dia anterior
 * @param {String} primeiraEntradaHoje - HH:MM da primeira batida do dia atual
 * @param {Boolean} saiuDeMadrugada - True se a saída de ontem passou da meia-noite
 * @returns {Number} Minutos de horas extras (ofensa ao intervalo)
 */
function apurarArtigo66(ultimaSaidaOntem, primeiraEntradaHoje, saiuDeMadrugada = false) {
    if (!ultimaSaidaOntem || !primeiraEntradaHoje) return 0;

    let minSaidaAnterior = hhmmParaMin(ultimaSaidaOntem);
    let minEntradaHoje = hhmmParaMin(primeiraEntradaHoje);

    // Se o funcionário saiu de madrugada (ex: 02:00), somamos 1440 min (24h) 
    // para colocar a saída na linha do tempo correta.
    if (saiuDeMadrugada) {
        minSaidaAnterior += 1440; 
    }

    // Cálculo do descanso: Tempo restante do dia anterior + Tempo até a entrada de hoje
    let minutosDescanso = (1440 - minSaidaAnterior) + minEntradaHoje;

    // O limite legal é 11 horas fechadas (660 minutos)
    if (minutosDescanso < 660) {
        // Paga-se apenas o tempo suprimido (o que faltou para completar as 11h)
        let minutosViolados = 660 - minutosDescanso;
        return minutosViolados; 
    }

    return 0; // Respeitou o intervalo perfeitamente
}

// -------------------------------------------------------------------------
// MOTOR JURÍDICO: APURAÇÃO DO ART. 71 (INTRAJORNADA - ALMOÇO)
// -------------------------------------------------------------------------

/**
 * Calcula se houve violação do intervalo de refeição/descanso.
 * Base legal: Art. 71 da CLT.
 * @param {Array} batidas - Array de strings com as batidas do dia (ex: ["08:00", "12:00", "13:00", "18:00"])
 * @param {Number} totalTrabalhadoMin - Total de minutos efetivamente trabalhados no dia
 * @returns {Object} Objeto com o tempo realizado e os minutos violados (Diferença ou Fixo)
 */
function apurarArtigo71(batidas, totalTrabalhadoMin) {
    // Retira campos vazios e deixa apenas batidas válidas
    const batidasValidas = batidas.filter(b => b && b.length === 5);

    if (batidasValidas.length < 4) {
        // Se tem menos de 4 batidas (ex: trabalhou direto sem registar almoço)
        return calcularViolacaoIntrajornada(0, totalTrabalhadoMin);
    }

    let totalIntervaloMin = 0;

    // Analisa os espaços entre a saída de um turno e a entrada do próximo (dentro do dia)
    for (let i = 1; i < batidasValidas.length - 1; i += 2) {
        let saidaTurno = hhmmParaMin(batidasValidas[i]);
        let entradaProximoTurno = hhmmParaMin(batidasValidas[i+1]);

        if (saidaTurno > 0 && entradaProximoTurno > 0) {
            let descanso = entradaProximoTurno - saidaTurno;
            // Se cruzou a meia-noite durante o descanso
            if (descanso < 0) descanso += 1440; 
            totalIntervaloMin += descanso;
        }
    }

    return calcularViolacaoIntrajornada(totalIntervaloMin, totalTrabalhadoMin);
}

/**
 * Lógica auxiliar para definir qual é o limite de horas exigido e calcular a ofensa.
 */
function calcularViolacaoIntrajornada(intervaloRealizado, totalTrabalhado) {
    let intervaloExigido = 0;

    // Jornada superior a 6h exige 1 hora (60 min) de intervalo
    if (totalTrabalhado > 360) {
        intervaloExigido = 60;
    } 
    // Jornada entre 4h e 6h exige 15 min de intervalo
    else if (totalTrabalhado > 240 && totalTrabalhado <= 360) {
        intervaloExigido = 15;
    }

    let violacaoDiferenca = 0;
    let violacaoFixo = 0;

    if (intervaloRealizado < intervaloExigido) {
        violacaoDiferenca = intervaloExigido - intervaloRealizado; // Apenas o que faltou
        violacaoFixo = intervaloExigido; // Paga a hora/minutos cheios da lei
    }

    return {
        intervaloExigido: intervaloExigido,
        intervaloRealizado: intervaloRealizado,
        violadosDiferenca: violacaoDiferenca, // Cobre o Item 22 da sua lista
        violadosFixo: violacaoFixo            // Cobre o Item 23 da sua lista
    };
}

// -------------------------------------------------------------------------
// MOTOR JURÍDICO: CONSOLIDADOR DO PERÍODO (LAUDO TÉCNICO)
// -------------------------------------------------------------------------

/**
 * Lê todas as batidas do mês e gera um relatório completo com todas as infrações.
 * @param {Object} batidasObj - Objeto com as batidas salvas no Firebase
 * @param {Object} config - Configurações do cartão (limites de horas)
 * @returns {Object} Relatório estruturado para exportação (PDF/Excel)
 */

function gerarLaudoTecnico(batidasObj, config, opcoes = {}) {
    let relatorio = {
        dias: [], semanas: [],
        totais: {
            horasNormaisMin: 0, heDiariasMin: 0, heSemanaisMin: 0,
            adicionalNoturnoMin: 0, artigo66Min: 0, artigo71DiferencaMin: 0, artigo71FixoMin: 0,
            domingosFeriadosMin: 0, sumula85AdicionalMin: 0, sumula85CheiaMin: 0,
            artigo67Min: 0 // NOVO: Cofre do Artigo 67
        }
    };

    if (!config || !config.dataInicio || !config.dataFim) return relatorio;

    let dataAtual = new Date(config.dataInicio + "T00:00:00");
    let dataFinal = new Date(config.dataFim + "T00:00:00");
    let calendarioCompleto = [];
    
    while (dataAtual <= dataFinal) {
        let ano = dataAtual.getFullYear();
        let mes = String(dataAtual.getMonth() + 1).padStart(2, '0');
        let dia = String(dataAtual.getDate()).padStart(2, '0');
        let dataBR = `${dia}/${mes}/${ano}`;
        let dataEUA = `${ano}-${mes}-${dia}`;
        
        let dadosDoDia = {};
        if (batidasObj && batidasObj[dataBR]) dadosDoDia = batidasObj[dataBR];
        else if (batidasObj && batidasObj[dataEUA]) dadosDoDia = batidasObj[dataEUA];

        calendarioCompleto.push({ dataParaImprimir: dataBR, dados: dadosDoDia, dataDate: new Date(`${ano}-${mes}-${dia}T00:00:00`) });
        dataAtual.setDate(dataAtual.getDate() + 1); 
    }
    
    let semanaAtual = [];
    let ultimaSaidaAnterior = null;
    let saiuDeMadrugadaAnterior = false;
    let ultimaSaidaDate = null; // Cronómetro absoluto para o Art. 67

    calendarioCompleto.forEach((diaItem, index) => {
        let batidasDia = Array.isArray(diaItem.dados.h) ? diaItem.dados.h : []; 
        let minutosTrabalhadosDia = 0, diurnoDia = 0, noturnoDia = 0;
        let ultimaSaidaHoje = null, primeiraEntradaHoje = batidasDia.find(b => b && b.length === 5) || null;
        let saiuDeMadrugadaHoje = false;

        // CRONÓMETRO: Calcula o descanso desde a saída do dia anterior até a entrada de hoje
        let descansoPrevioMin = 0;
        if (ultimaSaidaDate && primeiraEntradaHoje) {
            let entradaDate = new Date(diaItem.dataDate.getTime() + hhmmParaMin(primeiraEntradaHoje) * 60000);
            descansoPrevioMin = (entradaDate - ultimaSaidaDate) / 60000;
        }

        for (let i = 0; i < batidasDia.length; i += 2) {
            let ent = batidasDia[i], sai = batidasDia[i + 1];
            if (ent && sai && ent.length === 5 && sai.length === 5) {
                // AGORA ELE PASSA A SÚMULA 60 PARA A MATEMÁTICA!
                let calc = calcularIntervaloDiferenciado(ent, sai, opcoes.sumula60); 
                
                diurnoDia += calc.diurno; 
                noturnoDia += calc.noturno; 
                minutosTrabalhadosDia += calc.totalTrabalhado;
                ultimaSaidaHoje = sai; 
                if (hhmmParaMin(sai) < hhmmParaMin(ent)) saiuDeMadrugadaHoje = true;
            }
        }

        let art71 = apurarArtigo71(batidasDia, minutosTrabalhadosDia);
        let art66Minutos = 0;
        if (ultimaSaidaAnterior && primeiraEntradaHoje) {
            art66Minutos = apurarArtigo66(ultimaSaidaAnterior, primeiraEntradaHoje, saiuDeMadrugadaAnterior);
        }

        let diaSemanaData = diaItem.dataDate.getDay(); 
        let isFeriado = diaItem.dados.fer || false;

        let objDia = {
            data: diaItem.dataParaImprimir,
            isFolga: diaItem.dados.f || false,
            isFeriado: isFeriado,
            isDomingo: (diaSemanaData === 0),
            domFerMin: isFeriado ? minutosTrabalhadosDia : 0, 
            batidas: batidasDia,
            totalTrabalhadoMin: minutosTrabalhadosDia,
            noturnoMin: noturnoDia,
            art71: art71,
            art66Minutos: art66Minutos,
            descansoPrevioMin: descansoPrevioMin, // Guarda o descanso para a análise da semana
            art67Minutos: 0 // Será preenchido no domingo se houver violação
        };

        relatorio.dias.push(objDia); 
        semanaAtual.push(objDia);
        
        relatorio.totais.adicionalNoturnoMin += noturnoDia; 
        relatorio.totais.artigo66Min += art66Minutos;
        relatorio.totais.artigo71DiferencaMin += art71.violadosDiferenca; 
        relatorio.totais.artigo71FixoMin += art71.violadosFixo;

        if (ultimaSaidaHoje) { 
            ultimaSaidaAnterior = ultimaSaidaHoje; 
            saiuDeMadrugadaAnterior = saiuDeMadrugadaHoje; 
            
            // Regista a hora exata da saída para o cronómetro do dia seguinte
            let minSai = hhmmParaMin(ultimaSaidaHoje);
            if (saiuDeMadrugadaHoje) minSai += 1440;
            ultimaSaidaDate = new Date(diaItem.dataDate.getTime() + minSai * 60000);
        } else { 
            ultimaSaidaAnterior = null; 
            saiuDeMadrugadaAnterior = false; 
            // Se foi folga, NÃO apagamos o ultimaSaidaDate, o cronómetro continua a rodar!
        }

        // --- FECHAMENTO DA SEMANA ---
        if (diaSemanaData === 0 || index === calendarioCompleto.length - 1) {
            
            let diasTrabalhadosNaSemana = semanaAtual.filter(d => d.totalTrabalhadoMin > 0).length;
            let teveFolgaNaSemana = (diasTrabalhadosNaSemana < semanaAtual.length);

            // --- LÓGICA DO ARTIGO 67 (Súmula 110) ---
            if (!teveFolgaNaSemana) {
                // Se trabalhou os 7 dias, procuramos a maior janela de descanso que ele teve.
                let maiorDescanso = Math.max(...semanaAtual.map(d => d.descansoPrevioMin));
                let limiteArt67Min = 35 * 60; // 35 horas = 2100 minutos
                
                if (maiorDescanso < limiteArt67Min) {
                    let violacaoArt67 = limiteArt67Min - maiorDescanso;
                    relatorio.totais.artigo67Min += violacaoArt67;
                    // Lança a violação no último dia da semana (Domingo)
                    semanaAtual[semanaAtual.length - 1].art67Minutos = violacaoArt67;
                }
            }

            let domingo = semanaAtual.find(d => d.isDomingo);
            if (domingo && domingo.totalTrabalhadoMin > 0 && !domingo.isFeriado) {
                if (!teveFolgaNaSemana) domingo.domFerMin = domingo.totalTrabalhadoMin;
                else domingo.domFerMin = 0; 
            }

            semanaAtual.forEach(d => { relatorio.totais.domingosFeriadosMin += d.domFerMin || 0; });

            let limiteDiarioMin = (parseFloat(config.horasDiarias) || 8) * 60;
            let limiteSemanalMin = (parseFloat(config.horasSemanais) || 44) * 60;
            let calcSemana = apurarHorasExtrasSemana(semanaAtual, limiteDiarioMin, limiteSemanalMin);
            
            relatorio.semanas.push(calcSemana);
            relatorio.totais.heDiariasMin += calcSemana.heDiarias; 
            relatorio.totais.heSemanaisMin += calcSemana.heSemanais;
            relatorio.totais.horasNormaisMin += (calcSemana.totalTrabalhadoSemana - calcSemana.totalHe);
            
            relatorio.totais.sumula85AdicionalMin += calcSemana.sumulaAdicional;
            relatorio.totais.sumula85CheiaMin += calcSemana.sumulaCheia;
            
            semanaAtual = []; 
        }
    });

    return relatorio;
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
// -------------------------------------------------------------------------
// CONTROLES DO MODAL DE EXPORTAÇÃO
// -------------------------------------------------------------------------

// Abre o modal de opções quando o usuário clica em "Exportar"
window.gerarPDF = function() {
    const modal = document.getElementById('modal-exportar-tecnico');
    if (modal) modal.classList.remove('escondido');
};

// Fecha o modal
window.fecharModalExportar = function() {
    const modal = document.getElementById('modal-exportar-tecnico');
    if (modal) modal.classList.add('escondido');
};

// O Botão de "Confirmar" dentro do modal chama esta função
window.processarPDFTecnico = async function() {
    // 1. FORÇA O SALVAMENTO DA ÚLTIMA DIGITAÇÃO
    if (document.activeElement) {
        document.activeElement.blur(); // Tira o foco do input para acionar o auto-save
    }
    // Aguarda 500 milissegundos para dar tempo de atualizar o cartaoAtual.batidas
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Coletar Opções Selecionadas no Modal
    const opcoes = {
        heDiaria: document.getElementById('opt-he-diurna')?.checked || false,
        heSemanal: document.getElementById('opt-he-semanal')?.checked || false,
        art71: document.getElementById('opt-art71')?.checked || false,
        art71Tipo: document.getElementById('opt-art71-tipo')?.value || 'suprimido',
        art66: document.getElementById('opt-art66')?.checked || false,
        art67: document.getElementById('opt-art67')?.checked || false,
        sumula85: document.getElementById('opt-sumula85')?.checked || false,
        sumula340: document.getElementById('opt-sumula340')?.checked || false,
        adcNoturno: document.getElementById('opt-adc-noturno')?.checked || false,
        sumula60: document.getElementById('opt-sumula60')?.checked || false,
        domFer: document.getElementById('opt-dom-fer')?.checked || false
    };

    fecharModalExportar();
    
    // 3. O NOSSO CÉREBRO ENTRA EM AÇÃO
    const laudoTecnico = gerarLaudoTecnico(cartaoAtual.batidas, configAtual, opcoes);
    
    // 4. Desenha o PDF
    if (typeof executarMontagemPDF === 'function') {
        executarMontagemPDF(opcoes, laudoTecnico);
    } else {
        alert("Erro interno: A função de montagem do PDF não foi carregada.");
    }
};

// -------------------------------------------------------------------------
// EXPORTAÇÃO: DESENHO DO LAUDO EM PDF
// -------------------------------------------------------------------------

window.executarMontagemPDF = function(opcoes, laudo) {
    const papelVirtual = document.createElement('div');
    papelVirtual.style.padding = '20px';
    papelVirtual.style.fontFamily = 'Arial, sans-serif';
    papelVirtual.style.color = '#333';

    let html = `
        <style>
            tr { page-break-inside: avoid; }
            .resumo-box { page-break-inside: avoid; margin-top: 30px; border: 1px solid #ccc; padding: 15px; background-color: #fafafa; }
        </style>
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0;">Laudo Técnico de Apuração de Horas</h2>
            <p style="margin: 5px 0;"><strong>Reclamante:</strong> ${configAtual.reclamante || 'Não informado'}</p>
        </div>
        
        <table border="1" style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11px;">
            <thead style="background-color: #f4f4f4;">
                <tr>
                    <th style="padding: 5px;">Data</th>
                    <th style="padding: 5px;">Batidas</th>
                    <th style="padding: 5px;">Trabalhado</th>
                    ${opcoes.domFer ? '<th style="padding: 5px;">Dom/Fer (100%)</th>' : ''}
                    ${opcoes.adcNoturno ? '<th style="padding: 5px;">Noturno</th>' : ''}
                    ${opcoes.art71 ? '<th style="padding: 5px;">Art. 71</th>' : ''}
                    ${opcoes.art66 ? '<th style="padding: 5px;">Art. 66</th>' : ''}
                    ${opcoes.art67 ? '<th style="padding: 5px;">Art. 67</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;

    laudo.dias.forEach(dia => {
        let textoVazio = 'Sem batidas (Falta)';
        if (dia.isDomFer) textoVazio = 'Domingo / Feriado';
        else if (dia.isFolga) textoVazio = 'Folga Compensatória';

        let batidasStr = dia.batidas.filter(b => b && b.length === 5).join(' - ') || textoVazio;
        let minArt71 = opcoes.art71Tipo === 'integral' ? dia.art71.violadosFixo : dia.art71.violadosDiferenca;
        let valorArt71 = minParaHHMM(minArt71);

        html += `
            <tr>
                <td style="padding: 5px;">${dia.data}</td>
                <td style="padding: 5px;">${batidasStr}</td>
                <td style="padding: 5px;">${minParaHHMM(dia.totalTrabalhadoMin)}</td>
                ${opcoes.domFer ? `<td style="padding: 5px; color: ${dia.domFerMin > 0 ? 'red' : 'black'};">${minParaHHMM(dia.domFerMin)}</td>` : ''}
                ${opcoes.adcNoturno ? `<td style="padding: 5px; color: ${dia.noturnoMin > 0 ? 'red' : 'black'};">${minParaHHMM(dia.noturnoMin)}</td>` : ''}
                ${opcoes.art71 ? `<td style="padding: 5px; color: ${minArt71 > 0 ? 'red' : 'black'};">${valorArt71}</td>` : ''}
                ${opcoes.art66 ? `<td style="padding: 5px; color: ${dia.art66Minutos > 0 ? 'red' : 'black'};">${minParaHHMM(dia.art66Minutos)}</td>` : ''}
                ${opcoes.art67 ? `<td style="padding: 5px; color: ${dia.art67Minutos > 0 ? 'red' : 'black'}; font-weight: ${dia.art67Minutos > 0 ? 'bold' : 'normal'};">${minParaHHMM(dia.art67Minutos)}</td>` : ''}
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    // 1. COLOQUE AS VARIÁVEIS AQUI, antes de começar o HTML do resumo:
    let totalArt71 = opcoes.art71Tipo === 'integral' ? laudo.totais.artigo71FixoMin : laudo.totais.artigo71DiferencaMin;
    let textoArt71 = opcoes.art71Tipo === 'integral' ? 'Integral (1h)' : 'Suprimido (Diferença)';
    let totalSumula340 = laudo.totais.heDiariasMin + laudo.totais.heSemanaisMin;

    // 2. AGORA SIM, injetamos as variáveis na lista do HTML:
    html += `
        <div class="resumo-box">
            <h3 style="margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Resumo Consolidado</h3>
            <ul style="list-style-type: none; padding-left: 0; font-size: 13px; line-height: 1.6;">
                
                ${opcoes.heDiaria && !opcoes.sumula85 && !opcoes.sumula340 ? `<li><strong>Horas Extras Diárias (> ${configAtual.horasDiarias}h):</strong> ${minParaHHMM(laudo.totais.heDiariasMin)}</li>` : ''}
                ${opcoes.heSemanal && !opcoes.sumula85 && !opcoes.sumula340 ? `<li><strong>Horas Extras Semanais (> ${configAtual.horasSemanais}h):</strong> ${minParaHHMM(laudo.totais.heSemanaisMin)}</li>` : ''}
                
                ${opcoes.sumula85 && !opcoes.sumula340 ? `<li><strong>Súmula 85 TST (Apenas Adicional):</strong> ${minParaHHMM(laudo.totais.sumula85AdicionalMin)}</li>` : ''}
                ${opcoes.sumula85 && !opcoes.sumula340 ? `<li><strong>Súmula 85 TST (Hora Extra Cheia):</strong> ${minParaHHMM(laudo.totais.sumula85CheiaMin)}</li>` : ''}
                
                ${opcoes.sumula340 ? `<li><strong>Súmula 340 TST (Comissionista - Apenas Adicional):</strong> ${minParaHHMM(totalSumula340)}</li>` : ''}
                
                ${opcoes.domFer ? `<li><strong>Domingos e Feriados Trabalhados (100%):</strong> ${minParaHHMM(laudo.totais.domingosFeriadosMin)}</li>` : ''}
                ${opcoes.adcNoturno ? `<li><strong>Adicional Noturno (com redução):</strong> ${minParaHHMM(laudo.totais.adicionalNoturnoMin)}</li>` : ''}
                
                ${opcoes.art71 ? `<li><strong>Violação Art. 71 (${textoArt71}):</strong> ${minParaHHMM(totalArt71)}</li>` : ''}
                
                ${opcoes.art66 ? `<li><strong>Violação Art. 66 (Interjornada):</strong> ${minParaHHMM(laudo.totais.artigo66Min)}</li>` : ''}
                ${opcoes.art67 ? `<li><strong>Violação Art. 67 (Descanso 35h Semanal):</strong> ${minParaHHMM(laudo.totais.artigo67Min)}</li>` : ''}
            </ul>
        </div>
    `;

    papelVirtual.innerHTML = html;

    if (typeof html2pdf === 'function') {
        const opt = {
            margin:       10,
            filename:     `Laudo_CartaoPonto_${configAtual.reclamante.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };
        
        // CORREÇÃO DO BUG: Sobe a tela para o topo para a biblioteca não se perder nas coordenadas!
        window.scrollTo(0, 0);
        
        html2pdf().set(opt).from(papelVirtual).save();
    } else {
        alert("Atenção: A biblioteca 'html2pdf' não foi encontrada.");
    }
};
/* ==========================================================================
   VERIFICADOR DE IMPORTAÇÃO (Abre as configurações automaticamente)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 1. O detetive olha para a URL
    const parametros = new URLSearchParams(window.location.search);
    
    // 2. Se ele encontrar o "importado=true"
    if (parametros.get('importado') === 'true') {
        
        // 3. Limpa a URL (esconde o importado=true) para que se o utilizador apertar F5, não volte a aparecer o alerta
        const idDoCartao = parametros.get('id');
        window.history.replaceState({}, document.title, window.location.pathname + "?id=" + idDoCartao);
        
        // 4. Espera 1 segundo (para a tabela terminar de ser desenhada no fundo) e ataca!
        setTimeout(() => {
            alert("Ficheiro importado com sucesso!\n\nPor favor, preencha o Estado, a Cidade e confirme a Escala para prosseguir.");
            
            // Chama a função que abre o modal de configurações
            if (typeof abrirModalConfig === 'function') {
                abrirModalConfig();
            } else if (typeof window.abrirModalConfig === 'function') {
                window.abrirModalConfig();
            } else {
                console.warn("Função abrirModalConfig não encontrada, o utilizador terá de clicar no botão manualmente.");
            }
        }, 1000);
    }
});