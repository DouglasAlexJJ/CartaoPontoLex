/* ==========================================================================
   JAVASCRIPT DO DASHBOARD (INTEGRADO COM FIRESTORE - NUVEM REAL)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let dadosUsuarioGlobal = null;

// 1. Verifica quem está logado antes de carregar os dados
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user;
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            dadosUsuarioGlobal = docSnap.data();
            console.log("Cargo detectado:", dadosUsuarioGlobal.tipoConta); 

            atualizarNomeSidebar(dadosUsuarioGlobal);
            console.log("Iniciando verificação de menu para o cargo:", dadosUsuarioGlobal.tipoConta);

            // --- AQUI ESTAVA O ERRO: A PORTEIRA AGORA ACEITA OS DOIS ---
            const menuEquipe = document.getElementById('menu-colaboradores');
            
            if (menuEquipe) {
    const cargo = dadosUsuarioGlobal.tipoConta;
    
    // Se for admin OU gestor, removemos a classe que esconde
    if (cargo === 'admin' || cargo === 'gestor') {
        console.log("✅ Permissão concedida! Removendo classe 'escondido'...");
        menuEquipe.classList.remove('escondido');
        
        // Garante que o link de convite seja gerado
        const inputLink = document.getElementById('link-convite-texto');
        if (inputLink) {
            const urlBase = window.location.origin;
            const idParaConvite = (cargo === 'admin') ? usuarioAtual.uid : dadosUsuarioGlobal.adminId;
            inputLink.value = `${urlBase}/index.html?invite=${idParaConvite}`;
        }
    } else {
        console.log("🚫 Permissão negada para o cargo:", cargo);
        menuEquipe.classList.add('escondido');
    }
    } else {
    console.error("❌ ERRO: O elemento 'menu-colaboradores' não foi encontrado no HTML!");
}

            carregarDashboard();
        } else {
            // Lógica de Onboarding (Novo usuário)
            const inviteId = sessionStorage.getItem('inviteId');
            const formGroupEmpresa = document.getElementById('perfil-empresa')?.closest('.form-group');
            if (inviteId && formGroupEmpresa) formGroupEmpresa.style.display = 'none';
            
            document.getElementById('perfil-nome').value = user.displayName || "";
            document.getElementById('modal-onboarding').classList.remove('escondido');
        }
    } else {
        window.location.href = "index.html";
    }
});

// 2. BUSCAR DADOS NA NUVEM
async function carregarDashboard() {
    if (!usuarioAtual || !dadosUsuarioGlobal) return;

    let q;
    if (dadosUsuarioGlobal.tipoConta === 'admin') {
        // O Admin vê tudo o que ele criou
        q = query(collection(db, "cartoes"), where("userId", "==", usuarioAtual.uid));
    } else {
        // O Colaborador vê os cartões do seu ADMIN (o patrão)
        // Assim eles compartilham o mesmo escritório!
        q = query(collection(db, "cartoes"), where("userId", "==", dadosUsuarioGlobal.adminId));
        
        // Esconde o menu de convites para o funcionário
        const menuConvite = document.getElementById('menu-colaboradores');
        if (menuConvite) menuConvite.classList.add('escondido');
    }

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
        const botaoExcluir = (dadosUsuarioGlobal.tipoConta !== 'colaborador')

        ultimos.forEach(cartao => {
            let corBadge = cartao.progresso === 100 ? 'progresso-alto' : (cartao.progresso > 30 ? 'progresso-medio' : 'progresso-baixo');
            let dataStr = new Date(cartao.dataEdicao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

            gridRecentes.innerHTML += `
                <div class="card-recente" onclick="abrirCartao('${cartao.id}')">
                    <div class="card-recente-header">
                        <h4>${cartao.config.reclamante}</h4>
                        <button class="btn-deletar" onclick="event.stopPropagation(); moverParaLixeira('${cartao.id}')">🗑️</button>
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
    if (dadosUsuarioGlobal.tipoConta === 'colaborador') {
        alert("Acesso negado: Somente Administradores ou Gestores podem excluir cartões.");
        return;
    }
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
    const donoDoCartaoId = (dadosUsuarioGlobal.tipoConta === 'colaborador') 
                           ? dadosUsuarioGlobal.adminId 
                           : usuarioAtual.uid;
    
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
        userId: donoDoCartaoId,
        criadoPor: usuarioAtual.email,
        dataEdicao: Date.now(),
        progresso: 0,
        config: config,
        batidas: {} 
    };

    await setDoc(doc(db, "cartoes", novoCartao.id), novoCartao);
    localStorage.setItem('cartaoAtualId', novoCartao.id);
    window.location.href = "app.html";
};

window.salvarPerfilInicial = async function() {
    const nome = document.getElementById('perfil-nome').value.trim();
    const tratamento = document.getElementById('perfil-tratamento').value;
    const oab = document.getElementById('perfil-oab').value.trim();
    
    // Verifica se existe um convite pendente na memória
    const inviteId = sessionStorage.getItem('inviteId');
    
    let dadosPerfil = {
        uid: usuarioAtual.uid,
        email: usuarioAtual.email,
        nome: nome,
        tratamento: tratamento,
        oab: oab,
        dataCriacao: Date.now()
    };

    if (inviteId) {
        // --- LOGICA DE COLABORADOR (FUNCIONÁRIO) ---
        console.log("Vinculando colaborador ao admin:", inviteId);
        
        // 1. Busca os dados da empresa do patrão
        const adminDoc = await getDoc(doc(db, "usuarios", inviteId));
        if (adminDoc.exists()) {
            const dadosAdmin = adminDoc.data();
            dadosPerfil.tipoConta = 'colaborador';
            dadosPerfil.empresa = dadosAdmin.empresa; // Herda o nome da empresa
            dadosPerfil.adminId = inviteId; // Vínculo eterno com o patrão
        }
        sessionStorage.removeItem('inviteId'); // Limpa a memória
    } else {
        // --- LOGICA DE ADMINISTRADOR (PATRÃO) ---
        const empresa = document.getElementById('perfil-empresa').value.trim();
        if (!empresa) {
            alert("Nome da Empresa é obrigatório para Administradores!");
            return;
        }
        dadosPerfil.tipoConta = 'admin';
        dadosPerfil.empresa = empresa;
    }

    if (!nome) { alert("O nome é obrigatório!"); return; }

    try {
        await setDoc(doc(db, "usuarios", usuarioAtual.uid), dadosPerfil);
        document.getElementById('modal-onboarding').classList.add('escondido');
        location.reload(); // Recarrega para aplicar as permissões
    } catch (e) {
        console.error(e);
        alert("Erro ao criar perfil.");
    }
};

window.abrirModalPerfil = function() {
    if(!dadosUsuarioGlobal) return;
    
    // Preenche os campos
    document.getElementById('edit-perfil-tratamento').value = dadosUsuarioGlobal.tratamento || "";
    document.getElementById('edit-perfil-nome').value = dadosUsuarioGlobal.nome || "";
    document.getElementById('edit-perfil-oab').value = dadosUsuarioGlobal.oab || "";
    
    const campoEmpresa = document.getElementById('edit-perfil-empresa');
    campoEmpresa.value = dadosUsuarioGlobal.empresa || "";

    // TRAVA DE SEGURANÇA: Colaborador não edita a empresa
    if (dadosUsuarioGlobal.tipoConta === 'colaborador') {
        campoEmpresa.disabled = true; // Bloqueia o campo
        campoEmpresa.style.backgroundColor = "#f1f5f9"; // Deixa cinza
        campoEmpresa.title = "Somente o Administrador pode alterar o nome da empresa.";
    } else {
        campoEmpresa.disabled = false;
        campoEmpresa.style.backgroundColor = "#ffffff";
    }

    document.getElementById('modal-perfil').classList.remove('escondido');
};

window.fecharModalPerfil = function() { 
    document.getElementById('modal-perfil').classList.add('escondido'); 
};

window.salvarEdicaoPerfil = async function() {
    const btn = document.querySelector('#modal-perfil .btn-primario');
    btn.innerText = "A guardar...";

    const novosDados = {
        ...dadosUsuarioGlobal,
        tratamento: document.getElementById('edit-perfil-tratamento').value,
        nome: document.getElementById('edit-perfil-nome').value.trim(),
        oab: document.getElementById('edit-perfil-oab').value.trim(),
        empresa: document.getElementById('edit-perfil-empresa').value.trim()
    };

    await setDoc(doc(db, "usuarios", usuarioAtual.uid), novosDados);
    dadosUsuarioGlobal = novosDados;
    atualizarNomeSidebar(novosDados);
    fecharModalPerfil();
    btn.innerText = "Atualizar Dados";
    alert("Perfil atualizado com sucesso!");
};

// --- FUNÇÕES DE CONVITE ---

window.abrirModalColaboradores = function() { 
    document.getElementById('modal-colaboradores').classList.remove('escondido'); 
    carregarMembrosEquipe();
};

async function carregarMembrosEquipe() {
    const container = document.getElementById('lista-membros-equipe');
    const meuAdminId = dadosUsuarioGlobal.tipoConta === 'admin' ? usuarioAtual.uid : dadosUsuarioGlobal.adminId;
    const q = query(collection(db, "usuarios"), where("adminId", "==", usuarioAtual.uid));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">Nenhum colaborador vinculado ainda.</p>';
        return;
    }

    container.innerHTML = '';
    querySnapshot.forEach((membroDoc) => {
        const membro = membroDoc.data();
        if (membro.uid === usuarioAtual.uid) return;
        const ehGestor = membro.tipoConta === 'gestor';
        const euSouAdmin = dadosUsuarioGlobal.tipoConta === 'admin';
        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #f1f5f9; background: #fff;">
                <div>
                    <strong style="display: block; font-size: 0.95em;">
                        ${membro.nome} ${ehGestor ? '<span style="color:#2563eb; font-size:0.7em;">(GESTOR)</span>' : ''}
                    </strong>
                    <small style="color: #64748b;">${membro.email}</small>
                </div>
                <div style="display: flex; gap: 5px;">
                    
                    ${euSouAdmin ? `
                        <button onclick="alterarCargoMembro('${membro.uid}', '${ehGestor ? 'colaborador' : 'gestor'}')" 
                                style="background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; padding: 5px 8px; border-radius: 4px; font-size: 0.7em; cursor: pointer;">
                            ${ehGestor ? '⬇ Rebaixar' : '⬆ Tornar Gestor'}
                        </button>
                    ` : ''}
                    
                    <button onclick="desvincularMembro('${membro.uid}')" 
                            style="background: #fff1f2; color: #ef4444; border: 1px solid #fecdd3; padding: 5px 8px; border-radius: 4px; font-size: 0.7em; cursor: pointer;">
                        Remover
                    </button>
                </div>
            </div>
        `;
    });
}

window.desvincularMembro = async function(membroUid) {
    if (!confirm("Tem certeza? O colaborador perderá acesso imediato aos cartões do escritório.")) return;

    try {
        const membroRef = doc(db, "usuarios", membroUid);
        // Ao remover o adminId e mudar o tipo de conta, ele perde acesso à query de cartões do Admin
        await updateDoc(membroRef, {
            adminId: null,
            tipoConta: 'pessoal',
            empresa: "Conta Pessoal (Sem Vínculo)"
        });
        
        alert("Colaborador desvinculado com sucesso!");
        carregarMembrosEquipe(); // Atualiza a lista
    } catch (e) {
        console.error(e);
        alert("Erro ao desvincular.");
    }
};

window.fecharModalColaboradores = function() { 
    document.getElementById('modal-colaboradores').classList.add('escondido'); 
};

window.copiarLinkConvite = function() {
    const inputLink = document.getElementById('link-convite-texto');
    inputLink.select(); // Seleciona o texto
    inputLink.setSelectionRange(0, 99999); // Para celulares
    navigator.clipboard.writeText(inputLink.value);
    
    alert("Link de convite copiado com sucesso!");
};

function atualizarNomeSidebar(perfil) {
    const forteNome = document.getElementById('sidebar-nome-exibicao');
    if (!forteNome) return;

    // 1. Define o nome (com tratamento se houver)
    const nomeBase = perfil.tratamento ? `${perfil.tratamento} ${perfil.nome}` : perfil.nome;

    // 2. Define a etiqueta baseada no tipo de conta
    let etiquetaHtml = '';
    if (perfil.tipoConta === 'admin') {
        etiquetaHtml = `<span class="badge-cargo badge-titular">Titular</span>`;
    } else if (perfil.tipoConta === 'gestor') {
        etiquetaHtml = `<span class="badge-cargo badge-gestor">Gestor</span>`;
    }

    // 3. Aplica ao HTML
    forteNome.innerHTML = `${nomeBase} ${etiquetaHtml}`;
    
    // Aproveita e atualiza o texto do plano se for colaborador
    const statusPlano = document.getElementById('sidebar-status-conta');
    if (statusPlano && perfil.tipoConta !== 'admin') {
        statusPlano.innerText = `Equipe: ${perfil.empresa}`;
    }
}
window.alterarCargoMembro = async function(membroUid, novoCargo) {
    if (dadosUsuarioGlobal.tipoConta !== 'admin') {
        alert("Erro: Somente o Administrador (Dono) pode alterar cargos da equipe.");
        return;
    }
    const acao = novoCargo === 'gestor' ? "promover a Gestor" : "rebaixar a Colaborador";
    if (!confirm(`Deseja realmente ${acao} este membro?`)) return;

    try {
        const membroRef = doc(db, "usuarios", membroUid);
        await updateDoc(membroRef, { tipoConta: novoCargo });
        alert("Cargo atualizado!");
        carregarMembrosEquipe();
    } catch (e) {
        console.error(e);
        alert("Erro ao alterar cargo.");
    }
};