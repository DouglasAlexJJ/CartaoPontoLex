/* ==========================================================================
   JAVASCRIPT DO DASHBOARD (REFATORADO E ORGANIZADO - ESTILO RESTAURADO)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Configurações do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAYKwESZLQelQlyh5pWX0oE0eVOMI5Z3fY",
    authDomain: "cartaopontolex.firebaseapp.com",
    projectId: "cartaopontolex",
    storageBucket: "cartaopontolex.firebasestorage.app",
    messagingSenderId: "261448645689",
    appId: "1:261448645689:web:a6e7aebb12ef87c15b61e8"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const selectUF = document.getElementById('novo-cartao-uf');
const selectCidade = document.getElementById('novo-cartao-cidade');

selectUF.addEventListener('change', async () => {
    const uf = selectUF.value;
    
    // Limpa e desabilita se não tiver UF
    if (!uf) {
        selectCidade.innerHTML = '<option value="">Selecione a Cidade</option>';
        selectCidade.disabled = true;
        return;
    }

    try {
        selectCidade.innerHTML = '<option>Carregando...</option>';
        selectCidade.disabled = false;

        // Chamada à Brasil API para buscar cidades do estado
        const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}?providers=dados-abertos-br,gov,wikipedia`);
        const cidades = await response.json();

        // Popula o select de cidades
        selectCidade.innerHTML = '<option value="">Selecione a Cidade</option>';
        cidades.forEach(cidade => {
            const option = document.createElement('option');
            option.value = cidade.nome;
            option.textContent = cidade.nome;
            selectCidade.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar cidades:", error);
        selectCidade.innerHTML = '<option value="">Erro ao carregar</option>';
    }
});

// Estado Global
let usuarioAtual = null;
let dadosUsuarioGlobal = null;
let salvosNuvem = [];

/* ==========================================================================
   1. MONITORAMENTO DE AUTENTICAÇÃO
   ========================================================================== */

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    usuarioAtual = user;
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            dadosUsuarioGlobal = docSnap.data();
            configurarInterfacePorPerfil();
            carregarDashboard();
        } else {
            iniciarOnboarding(user);
        }
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
    }
});

/* ==========================================================================
   2. CONFIGURAÇÃO DA INTERFACE
   ========================================================================== */

function configurarInterfacePorPerfil() {
    if (!dadosUsuarioGlobal) return;

    const { tipoConta, adminId } = dadosUsuarioGlobal;
    const ehPessoal = tipoConta === 'pessoal';
    const ehDonoOuGestor = (tipoConta === 'admin' || tipoConta === 'gestor');

    // Elementos da UI
    const banner = document.getElementById('banner-assinatura');
    const btnNovoSidebar = document.querySelector('.sidebar-content .btn-primario');
    const menuEquipe = document.getElementById('menu-colaboradores');
    const inputLinkConvite = document.getElementById('link-convite-texto');

    // Atualiza nome e cargo na sidebar
    atualizarNomeSidebar(dadosUsuarioGlobal);

    // Controle do Banner de Assinatura
    if (banner) {
        banner.classList.toggle('escondido', !ehPessoal);
    }

    // Controle do Menu de Equipe e Link de Convite
    if (menuEquipe) {
        menuEquipe.classList.toggle('escondido', !ehDonoOuGestor);
    }

    if (ehDonoOuGestor && inputLinkConvite) {
        const urlBase = window.location.origin;
        const idParaConvite = (tipoConta === 'admin') ? usuarioAtual.uid : adminId;
        inputLinkConvite.value = `${urlBase}/index.html?invite=${idParaConvite}`;
    }

    // Estilização para conta pessoal (Upgrade)
    if (ehPessoal && btnNovoSidebar) {
        btnNovoSidebar.innerHTML = "💎 Assinar Plano";
        btnNovoSidebar.style.background = "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)";
        btnNovoSidebar.onclick = () => alert("Em breve: Escolha seu plano e comece a calcular!");
    }

    // Verifica convites pendentes
    if (ehPessoal) {
        const invitePendente = sessionStorage.getItem('inviteId');
        if (invitePendente) {
            const inputModal = document.getElementById('input-link-convite');
            if (inputModal) inputModal.value = invitePendente;
            window.abrirModalEntrarEquipe();
            sessionStorage.removeItem('inviteId');
        }
    }
}

function atualizarNomeSidebar(perfil) {
    const forteNome = document.getElementById('sidebar-nome-exibicao');
    const statusPlano = document.getElementById('sidebar-status-conta');
    if (!forteNome) return;

    const nomeBase = perfil.tratamento ? `${perfil.tratamento} ${perfil.nome}` : perfil.nome;
    let etiquetaHtml = '';

    if (perfil.tipoConta === 'admin') {
        etiquetaHtml = `<span class="badge-cargo badge-titular">Titular</span>`;
    } else if (perfil.tipoConta === 'gestor') {
        etiquetaHtml = `<span class="badge-cargo badge-gestor">Gestor</span>`;
    }

    forteNome.innerHTML = `${nomeBase} ${etiquetaHtml}`;

    if (statusPlano && perfil.tipoConta !== 'admin') {
        statusPlano.innerText = `Equipe: ${perfil.empresa || 'Sem vínculo'}`;
    }
}

function iniciarOnboarding(user) {
    const inviteId = sessionStorage.getItem('inviteId');
    const formGroupEmpresa = document.getElementById('perfil-empresa')?.closest('.form-group');
    
    if (inviteId && formGroupEmpresa) {
        formGroupEmpresa.style.display = 'none';
    }
    
    const inputNome = document.getElementById('perfil-nome');
    if (inputNome) inputNome.value = user.displayName || "";
    
    const modalOnboarding = document.getElementById('modal-onboarding');
    if (modalOnboarding) modalOnboarding.classList.remove('escondido');
}

/* ==========================================================================
   3. GESTÃO DE DADOS (DASHBOARD)
   ========================================================================== */

async function carregarDashboard() {
    if (!usuarioAtual || !dadosUsuarioGlobal) return;

    const { tipoConta, adminId } = dadosUsuarioGlobal;
    const ehDonoOuGestor = (tipoConta === 'admin' || tipoConta === 'gestor');

    try {
        // Define a query baseada no vínculo
        const uidBusca = (tipoConta === 'admin') ? usuarioAtual.uid : adminId;
        const q = query(collection(db, "cartoes"), where("userId", "==", uidBusca));
        const querySnapshot = await getDocs(q);
        
        salvosNuvem = [];
        querySnapshot.forEach(doc => salvosNuvem.push(doc.data()));

        await processarLimpezaLGPD();
        renderizarInterfaceDados(ehDonoOuGestor);
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
    }
}

async function processarLimpezaLGPD() {
    const agora = Date.now();
    const trintaDiasEmMs = 30 * 24 * 60 * 60 * 1000;

    for (let i = salvosNuvem.length - 1; i >= 0; i--) {
        const cartao = salvosNuvem[i];
        if (cartao.deletedAt && (agora - cartao.deletedAt) > trintaDiasEmMs) {
            await deleteDoc(doc(db, "cartoes", cartao.id.toString()));
            salvosNuvem.splice(i, 1);
        }
    }
}

function renderizarInterfaceDados(podeGerenciar) {
    const ativos = salvosNuvem.filter(c => !c.deletedAt).sort((a, b) => b.dataEdicao - a.dataEdicao);
    const apagados = salvosNuvem.filter(c => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

    renderizarSidebar(ativos);
    renderizarGridRecentes(ativos, podeGerenciar);
    renderizarLixeira(apagados, podeGerenciar);
}

function renderizarSidebar(ativos) {
    const listaSidebar = document.querySelector('.lista-salvos');
    if (!listaSidebar) return;

    listaSidebar.innerHTML = ativos.map(cartao => `
        <li onclick="abrirCartao('${cartao.id}')">
            📄 ${cartao.config.reclamante} <span class="badge-min">${cartao.progresso}%</span>
        </li>
    `).join('');
}

function renderizarGridRecentes(ativos, podeGerenciar) {
    const gridRecentes = document.querySelector('.grid-recentes');
    if (!gridRecentes) return;

    const ultimos = ativos.slice(0, 8);
    let html = ultimos.map(cartao => {
        const corBadge = cartao.progresso === 100 ? 'progresso-alto' : (cartao.progresso > 30 ? 'progresso-medio' : 'progresso-baixo');
        const dataStr = new Date(cartao.dataEdicao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const btnDelete = podeGerenciar ? `<button class="btn-deletar" onclick="event.stopPropagation(); moverParaLixeira('${cartao.id}')">🗑️</button>` : '';

        return `
            <div class="card-recente" onclick="abrirCartao('${cartao.id}')">
                <div class="card-recente-header">
                    <h4>${cartao.config.reclamante}</h4>
                    ${btnDelete}
                </div>
                <span class="badge-status ${corBadge}" style="display:inline-block; margin-bottom:10px;">${cartao.progresso}% Concluído</span>
                <p><strong>Empresa:</strong> ${cartao.config.reclamada || 'Não informada'}</p>
                <small class="data-edicao">Última edição: ${dataStr}</small>
            </div>
        `;
    }).join('');

    // Card de ação (Novo ou Upgrade)
    if (dadosUsuarioGlobal.tipoConta !== 'pessoal') {
        html += `
            <div class="card-recente vazio" onclick="abrirModalNovo()">
                <span class="icone-vazio">➕</span>
                <p>Novo Cartão</p>
                <small>Clique para iniciar</small>
            </div>
        `;
    } else {
        html += `
            <div class="card-recente vazio" style="border: 2px dashed #e0e7ff; background: #f8faff;" onclick="alert('Página de Planos em breve!')">
                <span class="icone-vazio">💎</span>
                <p>Ativar Assinatura</p>
                <small>Libere a criação de cartões</small>
            </div>
        `;
    }

    gridRecentes.innerHTML = html;
}

function renderizarLixeira(apagados, podeGerenciar) {
    const dashboardMain = document.querySelector('.dashboard-main');
    const lixeiraExistente = document.getElementById('area-lixeira');
    if (lixeiraExistente) lixeiraExistente.remove();

    if (apagados.length > 0 && podeGerenciar && dashboardMain) {
        const agora = Date.now();
        let lixeiraHtml = `
            <div id="area-lixeira" class="sessao-lixeira">
                <h3>🗑️ Lixeira (Retenção LGPD: 30 dias)</h3>
                <div class="grid-recentes">
        `;

        apagados.forEach(cartao => {
            const diasRestantes = 30 - Math.floor((agora - cartao.deletedAt) / (1000 * 60 * 60 * 24));
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

/* ==========================================================================
   4. AÇÕES DO USUÁRIO (WINDOW SCOPE)
   ========================================================================== */

window.abrirCartao = function(id) {
    localStorage.setItem('cartaoAtualId', id);
    window.location.href = "app.html";
};

window.moverParaLixeira = async function(id) {
    if (dadosUsuarioGlobal.tipoConta === 'colaborador') {
        alert("Acesso negado: Somente Administradores ou Gestores podem excluir cartões.");
        return;
    }
    if (!confirm("Mover para a lixeira? O arquivo será excluído permanentemente em 30 dias.")) return;
    try {
        await updateDoc(doc(db, "cartoes", id.toString()), { deletedAt: Date.now() });
        carregarDashboard();
    } catch (e) { console.error(e); }
};

window.restaurarCartao = async function(id) {
    try {
        await updateDoc(doc(db, "cartoes", id.toString()), { deletedAt: null });
        carregarDashboard();
    } catch (e) { console.error(e); }
};

window.fazerLogout = () => auth.signOut().then(() => window.location.href = "index.html");

// Gestão de Equipe
window.abrirModalColaboradores = async function() {
    document.getElementById('modal-colaboradores').classList.remove('escondido');
    carregarMembrosEquipe();
};

async function carregarMembrosEquipe() {
    const container = document.getElementById('lista-membros-equipe');
    if (!container) return;

    try {
        const meuAdminId = dadosUsuarioGlobal.tipoConta === 'admin' ? usuarioAtual.uid : dadosUsuarioGlobal.adminId;
        const q = query(collection(db, "usuarios"), where("adminId", "==", meuAdminId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">Nenhum colaborador vinculado ainda.</p>';
            return;
        }

        container.innerHTML = '';
        snap.forEach((membroDoc) => {
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
    } catch (e) { console.error(e); }
}

window.alterarCargoMembro = async function(uid, novoCargo) {
    if (dadosUsuarioGlobal.tipoConta !== 'admin') return alert("Apenas o titular pode alterar cargos.");
    if (confirm(`Deseja alterar o cargo deste membro?`)) {
        await updateDoc(doc(db, "usuarios", uid), { tipoConta: novoCargo });
        carregarMembrosEquipe();
    }
};

window.desvincularMembro = async function(uid) {
    if (confirm("Remover este colaborador da equipe?")) {
        await updateDoc(doc(db, "usuarios", uid), { adminId: null, tipoConta: 'pessoal', empresa: "Conta Pessoal" });
        carregarMembrosEquipe();
    }
};

window.processarConviteManual = async function() {
    const inputVal = document.getElementById('input-link-convite').value.trim();
    if (!inputVal) return alert("Cole o link de convite.");

    let idAdmin = inputVal.includes('invite=') ? inputVal.split('invite=')[1].split('&')[0] : inputVal;
    const btn = document.querySelector('#modal-entrar-equipe .btn-primario');
    btn.disabled = true;

    try {
        const adminDoc = await getDoc(doc(db, "usuarios", idAdmin));
        if (adminDoc.exists()) {
            const d = adminDoc.data();
            if (confirm(`Vincular ao escritório: ${d.empresa}?`)) {
                await updateDoc(doc(db, "usuarios", usuarioAtual.uid), { tipoConta: 'colaborador', adminId: idAdmin, empresa: d.empresa });
                location.reload();
            }
        } else { alert("Convite inválido."); }
    } catch (e) { console.error(e); }
    btn.disabled = false;
};

// Utilitários
window.copiarLinkConvite = () => {
    const input = document.getElementById('link-convite-texto');
    input.select();
    navigator.clipboard.writeText(input.value);
    alert("Link copiado!");
};

window.fecharModalColaboradores = () => document.getElementById('modal-colaboradores').classList.add('escondido');
window.abrirModalEntrarEquipe = () => document.getElementById('modal-entrar-equipe').classList.remove('escondido');
window.fecharModalEntrarEquipe = () => document.getElementById('modal-entrar-equipe').classList.add('escondido');
window.abrirModalNovo = () => {
    if (dadosUsuarioGlobal.tipoConta === 'pessoal') {
        alert("Sua conta atual não possui uma assinatura ativa. Assine um plano para criar novos cartões.");
        return;
    }
    document.getElementById('modal-novo').classList.remove('escondido');
};
window.fecharModalNovo = () => document.getElementById('modal-novo').classList.add('escondido');
window.abrirModalPerfil = function() {
    if(!dadosUsuarioGlobal) return;
    document.getElementById('edit-perfil-tratamento').value = dadosUsuarioGlobal.tratamento || "";
    document.getElementById('edit-perfil-nome').value = dadosUsuarioGlobal.nome || "";
    document.getElementById('edit-perfil-oab').value = dadosUsuarioGlobal.oab || "";
    const campoEmpresa = document.getElementById('edit-perfil-empresa');
    campoEmpresa.value = dadosUsuarioGlobal.empresa || "";
    if (dadosUsuarioGlobal.tipoConta === 'colaborador') {
        campoEmpresa.disabled = true;
        campoEmpresa.style.backgroundColor = "#f1f5f9";
    } else {
        campoEmpresa.disabled = false;
        campoEmpresa.style.backgroundColor = "#ffffff";
    }
    document.getElementById('modal-perfil').classList.remove('escondido');
};
window.fecharModalPerfil = () => document.getElementById('modal-perfil').classList.add('escondido');
window.toggleFolgaInicial = () => {
    const esc = document.getElementById('escala').value;
    document.getElementById('container-folga-inicial').style.display = (esc === "6x2" || esc === "personalizada") ? "block" : "none";
};
window.toggleIntervaloFixo = () => {
    document.getElementById('container-intervalo').style.display = document.getElementById('intervaloFixo').checked ? "block" : "none";
};
window.toggleBatidas = () => {
    document.getElementById('container-batidas-input').style.display = document.getElementById('checkBatidas').checked ? "block" : "none";
};

/* ==========================================================================
   5. LÓGICA DE ONBOARDING E CRIAÇÃO DE PERFIL
   ========================================================================== */

window.salvarPerfilInicial = async function() {
    const nome = document.getElementById('perfil-nome').value.trim();
    const tratamento = document.getElementById('perfil-tratamento').value;
    const oab = document.getElementById('perfil-oab').value.trim();
    
    if (!nome) { 
        alert('O nome é obrigatório!'); 
        return; 
    }

    const btn = document.querySelector('#modal-onboarding .btn-primario');
    btn.disabled = true;
    btn.innerText = "Salvando...";

    try {
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
            const adminDoc = await getDoc(doc(db, "usuarios", inviteId));
            if (adminDoc.exists()) {
                const dadosAdmin = adminDoc.data();
                dadosPerfil.tipoConta = 'colaborador';
                dadosPerfil.empresa = dadosAdmin.empresa;
                dadosPerfil.adminId = inviteId;
            }
            sessionStorage.removeItem('inviteId');
        } else {
            const empresa = document.getElementById('perfil-empresa').value.trim();
            if (!empresa) {
                alert("Nome da Empresa é obrigatório para Administradores!");
                btn.disabled = false;
                btn.innerText = "Concluir Configuração ➔";
                return;
            }
            dadosPerfil.tipoConta = 'admin';
            dadosPerfil.empresa = empresa;
        }

        await setDoc(doc(db, "usuarios", usuarioAtual.uid), dadosPerfil);
        document.getElementById('modal-onboarding').classList.add('escondido');
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Erro ao criar perfil.");
        btn.disabled = false;
        btn.innerText = "Concluir Configuração ➔";
    }
};

window.salvarEdicaoPerfil = async function() {
    const btn = document.querySelector('#modal-perfil .btn-primario');
    btn.innerText = "Salvando...";

    const novosDados = {
        ...dadosUsuarioGlobal,
        tratamento: document.getElementById('edit-perfil-tratamento').value,
        nome: document.getElementById('edit-perfil-nome').value.trim(),
        oab: document.getElementById('edit-perfil-oab').value.trim(),
        empresa: document.getElementById('edit-perfil-empresa').value.trim()
    };

    try {
        await setDoc(doc(db, "usuarios", usuarioAtual.uid), novosDados);
        dadosUsuarioGlobal = novosDados;
        atualizarNomeSidebar(novosDados);
        window.fecharModalPerfil();
        alert("Perfil atualizado!");
    } catch (e) {
        console.error(e);
        alert("Erro ao atualizar.");
    }
    btn.innerText = "Atualizar Dados";
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

    const donoDoCartaoId = (dadosUsuarioGlobal.tipoConta === 'colaborador') 
                           ? dadosUsuarioGlobal.adminId 
                           : usuarioAtual.uid;

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
        cidade: cidadeSelecionada,
        uf: ufSelecionada,
        criadoEm: new Date()
    };

    try {
        await setDoc(doc(db, "cartoes", novoCartao.id), novoCartao);
        localStorage.setItem('cartaoAtualId', novoCartao.id);
        window.location.href = "app.html";
    } catch (e) {
        console.error(e);
        alert("Erro ao criar cartão.");
    }
};
