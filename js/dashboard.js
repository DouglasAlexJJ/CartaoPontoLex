/* ==========================================================================
   JAVASCRIPT DO DASHBOARD (INTEGRADO COM FIRESTORE - NUVEM REAL)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// As suas chaves do Firebase
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

let usuarioAtual = null;
let salvosNuvem = [];

// 1. Verifica quem está logado antes de carregar os dados
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user;
        
        // 1. Verifica se o usuário já tem um perfil na coleção 'usuarios'
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Perfil já existe, carrega o dashboard normal
            const dadosPerfil = docSnap.data();
            atualizarNomeSidebar(dadosPerfil);
            carregarDashboard();
        } else {
            // Perfil NÃO existe, abre o onboarding
            document.getElementById('perfil-nome').value = user.displayName || "";
            document.getElementById('modal-onboarding').classList.remove('escondido');
        }
    } else {
        window.location.href = "index.html";
    }
});

// 2. BUSCAR DADOS NA NUVEM
async function carregarDashboard() {
    if (!usuarioAtual) return;

    const q = query(collection(db, "cartoes"), where("userId", "==", usuarioAtual.uid));
    const querySnapshot = await getDocs(q);
    
    salvosNuvem = [];
    querySnapshot.forEach((documento) => {
        salvosNuvem.push(documento.data());
    });

    const agora = Date.now();
    const trintaDiasEmMs = 30 * 24 * 60 * 60 * 1000;

    // Auto-limpeza LGPD na Nuvem
    for (let i = salvosNuvem.length - 1; i >= 0; i--) {
        let cartao = salvosNuvem[i];
        if (cartao.deletedAt && (agora - cartao.deletedAt) > trintaDiasEmMs) {
            await deleteDoc(doc(db, "cartoes", cartao.id.toString()));
            salvosNuvem.splice(i, 1);
        }
    }

    const ativos = salvosNuvem.filter(c => !c.deletedAt).sort((a, b) => b.dataEdicao - a.dataEdicao);
    const apagados = salvosNuvem.filter(c => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

    const gridRecentes = document.querySelector('.grid-recentes');
    const listaSidebar = document.querySelector('.lista-salvos');
    const dashboardMain = document.querySelector('.dashboard-main');

    const lixeiraExistente = document.getElementById('area-lixeira');
    if (lixeiraExistente) lixeiraExistente.remove();

    if (listaSidebar) {
        listaSidebar.innerHTML = '';
        ativos.forEach(cartao => {
            listaSidebar.innerHTML += `
                <li onclick="abrirCartao('${cartao.id}')">
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
                <div class="card-recente" onclick="abrirCartao('${cartao.id}')">
                    <div class="card-recente-header">
                        <h4>${cartao.config.reclamante}</h4>
                        <button class="btn-deletar" onclick="event.stopPropagation(); moverParaLixeira('${cartao.id}')" title="Mover para Lixeira">🗑️</button>
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

    if (apagados.length > 0 && dashboardMain) {
        let lixeiraHtml = `
            <div id="area-lixeira" class="sessao-lixeira">
                <h3>🗑️ Lixeira (Retenção LGPD: 30 dias)</h3>
                <div class="grid-recentes">
        `;
        apagados.forEach(cartao => {
            let diasRestantes = 30 - Math.floor((agora - cartao.deletedAt) / (1000 * 60 * 60 * 24));
            lixeiraHtml += `
                <div class="card-recente card-apagado">
                    <div class="card-recente-header">
                        <h4 style="text-decoration: line-through; color: #94a3b8;">${cartao.config.reclamante}</h4>
                        <button class="btn-restaurar" onclick="restaurarCartao('${cartao.id}')">♻️ Restaurar</button>
                    </div>
                    <p style="color: #ef4444; font-size: 0.8em; font-weight: bold;">Exclui em ${diasRestantes} dias</p>
                </div>
            `;
        });
        lixeiraHtml += `</div></div>`;
        dashboardMain.insertAdjacentHTML('beforeend', lixeiraHtml);
    }
}

// 3. EXPORTAR FUNÇÕES PARA O HTML (Como usamos 'module', temos que ligá-las ao window)
window.abrirCartao = function(id) {
    localStorage.setItem('cartaoAtualId', id);
    window.location.href = "app.html";
};

window.abrirModalNovo = function() { document.getElementById('modal-novo').classList.remove('escondido'); };
window.fecharModalNovo = function() { document.getElementById('modal-novo').classList.add('escondido'); };

window.toggleFolgaInicial = function() {
    const esc = document.getElementById('escala').value;
    document.getElementById('container-folga-inicial').style.display = (esc === "6x2" || esc === "personalizada") ? "block" : "none";
};

window.toggleIntervaloFixo = function() {
    document.getElementById('container-intervalo').style.display = document.getElementById('intervaloFixo').checked ? "block" : "none";
};

window.toggleBatidas = function() {
    document.getElementById('container-batidas-input').style.display = document.getElementById('checkBatidas').checked ? "block" : "none";
};

window.moverParaLixeira = async function(id) {
    if(!confirm("Tem certeza que deseja apagar?")) return;
    let cartao = salvosNuvem.find(c => c.id === id);
    if(cartao) {
        cartao.deletedAt = Date.now();
        await setDoc(doc(db, "cartoes", cartao.id.toString()), cartao);
        carregarDashboard(); 
    }
};

window.restaurarCartao = async function(id) {
    let cartao = salvosNuvem.find(c => c.id === id);
    if(cartao) {
        delete cartao.deletedAt;
        await setDoc(doc(db, "cartoes", cartao.id.toString()), cartao);
        carregarDashboard();
    }
};

window.salvarEIniciar = async function() {
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
        id: Date.now().toString(), 
        userId: usuarioAtual.uid, // <-- O SEGREDO: VINCULA ESTE CARTÃO AO ADVOGADO LOGADO
        dataEdicao: Date.now(),
        progresso: 0,
        config: config,
        batidas: {} 
    };

    // ENVIA PARA O COFRE DO GOOGLE
    await setDoc(doc(db, "cartoes", novoCartao.id), novoCartao);
    
    // Deixamos apenas o ID na memória local para o 'app.html' saber o que abrir a seguir
    localStorage.setItem('cartaoAtualId', novoCartao.id);
    window.location.href = "app.html";
};
window.salvarPerfilInicial = async function() {
    const nome = document.getElementById('perfil-nome').value.trim();
    const tratamento = document.getElementById('perfil-tratamento').value;
    const oab = document.getElementById('perfil-oab').value.trim();
    const empresa = document.getElementById('perfil-empresa').value.trim();

    if (!nome || !empresa) {
        alert("Nome e Empresa são obrigatórios para a conta de Administrador!");
        return;
    }

    const dadosPerfil = {
        uid: usuarioAtual.uid,
        email: usuarioAtual.email,
        nome: nome,
        tratamento: tratamento,
        oab: oab,
        empresa: empresa,
        tipoConta: 'admin', // Quem cria a conta é sempre Admin (o pagador)
        dataCriacao: Date.now()
    };

    try {
        await setDoc(doc(db, "usuarios", usuarioAtual.uid), dadosPerfil);
        document.getElementById('modal-onboarding').classList.add('escondido');
        atualizarNomeSidebar(dadosPerfil);
        carregarDashboard();
    } catch (e) {
        console.error("Erro ao salvar perfil:", e);
        alert("Erro ao salvar perfil. Tente novamente.");
    }
};

function atualizarNomeSidebar(perfil) {
    const nomeExibicao = perfil.tratamento ? `${perfil.tratamento} ${perfil.nome}` : perfil.nome;
    const forteNome = document.querySelector('.info-perfil strong');
    if (forteNome) forteNome.innerText = nomeExibicao;
}