import { auth, db } from './firebase-config.js'; 
import { 
    collection, query, where, getDocs, doc, 
    setDoc, deleteDoc, getDoc, updateDoc, addDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* ==========================================================================
   1. ESTADO GLOBAL
   ========================================================================== */

let usuarioAtual = null;
let dadosUsuarioGlobal = null;
let salvosNuvem = [];

/* ==========================================================================
   2. MONITORAMENTO DE AUTENTICAÇÃO
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
   3. CONFIGURAÇÃO DA INTERFACE E DASHBOARD
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

async function carregarDashboard() {
    if (!usuarioAtual || !dadosUsuarioGlobal) return;

    const { tipoConta, adminId } = dadosUsuarioGlobal;
    const ehDonoOuGestor = (tipoConta === 'admin' || tipoConta === 'gestor');

    try {
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
        
        const btnEdit = `<button class="btn-editar" style="background:none; border:none; font-size: 1.1em; cursor:pointer;" onclick="event.stopPropagation(); editarCartao('${cartao.id}')" title="Editar Parâmetros">✏️</button>`;
        const btnDelete = podeGerenciar ? `<button class="btn-deletar" style="margin-left: 5px;" onclick="event.stopPropagation(); moverParaLixeira('${cartao.id}')" title="Mover para Lixeira">🗑️</button>` : '';

        return `
            <div class="card-recente" onclick="abrirCartao('${cartao.id}')">
                <div class="card-recente-header">
                    <h4>${cartao.config.reclamante}</h4>
                    <div style="display: flex; align-items: center;">
                        ${btnEdit}
                        ${btnDelete}
                    </div>
                </div>
                <span class="badge-status ${corBadge}" style="display:inline-block; margin-bottom:10px;">${cartao.progresso}% Concluído</span>
                <p><strong>Empresa:</strong> ${cartao.config.reclamada || 'Não informada'}</p>
                <small class="data-edicao">Última edição: ${dataStr}</small>
            </div>
        `;
    }).join('');

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
            const dataExclusao = cartao.deletedAt || agora;
            const diasRestantes = 30 - Math.floor((agora - dataExclusao) / (1000 * 60 * 60 * 24));
            
            lixeiraHtml += `
                <div class="card-recente card-apagado" data-id="${cartao.id}">
                    <div class="card-recente-header">
                        <h4 style="text-decoration: line-through;">${cartao.config.reclamante}</h4>
                        <button class="btn-restaurar" onclick="restaurarDaLixeira('${cartao.id}')" title="Restaurar">🔄</button>
                    </div>
                    <p>Expira em: <strong>${diasRestantes} dias</strong></p>
                </div>
            `;
        });

        lixeiraHtml += `</div></div>`;
        dashboardMain.insertAdjacentHTML('beforeend', lixeiraHtml);
    }
}

/* ==========================================================================
   4. GESTÃO DE CARTÕES (CRUD)
   ========================================================================== */

window.abrirCartao = (id) => {
    localStorage.setItem('cartaoAtualId', id);
    window.location.href = "app.html";
};

window.editarCartao = function(id) {
    const cartao = salvosNuvem.find(c => c.id === id);
    if (!cartao) return;

    const config = cartao.config;

    document.getElementById('titulo-modal-cartao').innerText = "✏️ Editar Parâmetros";
    document.getElementById('btn-salvar-cartao').innerText = "Salvar Alterações";
    document.getElementById('cartao-edit-id').value = id;

    document.getElementById('reclamante').value = config.reclamante || '';
    document.getElementById('reclamada').value = config.reclamada || '';
    document.getElementById('dataInicio').value = config.dataInicio || '';
    document.getElementById('dataFim').value = config.dataFim || '';
    document.getElementById('escala').value = config.escala || 'seg-sex';
    document.getElementById('dataFolgaInicial').value = config.dataFolgaInicial || '';
    
    document.getElementById('padraoE').value = config.padraoE || '12:00';
    document.getElementById('padraoS').value = config.padraoS || '13:00';
    
    const checkIntervalo = document.getElementById('intervaloFixo');
    checkIntervalo.checked = !!config.intervaloFixo;
    if (typeof toggleIntervaloFixo === 'function') toggleIntervaloFixo();

    const checkBatidas = document.getElementById('checkBatidas');
    const inputQtdBatidas = document.getElementById('qtdBatidas');
    if (config.qtdBatidas && config.qtdBatidas !== 4) {
        checkBatidas.checked = true;
        inputQtdBatidas.value = config.qtdBatidas;
    } else {
        checkBatidas.checked = false;
        inputQtdBatidas.value = 4;
    }
    if (typeof toggleBatidas === 'function') toggleBatidas();

    const ufSelect = document.getElementById('novo-cartao-uf');
    ufSelect.value = config.uf || '';
    
    if (config.uf) {
        ufSelect.dispatchEvent(new Event('change'));
        setTimeout(() => {
            document.getElementById('novo-cartao-cidade').value = config.cidade || '';
        }, 800);
    } else {
        document.getElementById('novo-cartao-cidade').innerHTML = '<option value="">Selecione a Cidade</option>';
        document.getElementById('novo-cartao-cidade').disabled = true;
    }

    document.getElementById('modal-novo').classList.remove('escondido');
};

window.moverParaLixeira = async (id) => {
    if (!confirm("Deseja mover este cartão para a lixeira?")) return;
    try {
        await updateDoc(doc(db, "cartoes", id), { deletedAt: Date.now() });
        carregarDashboard();
    } catch (e) { console.error(e); }
};

window.restaurarDaLixeira = async (id) => {
    try {
        await updateDoc(doc(db, "cartoes", id), { deletedAt: null });
        carregarDashboard();
    } catch (e) { console.error(e); }
};

window.salvarEIniciar = async function() {
    const reclamante = document.getElementById('reclamante').value.trim();
    const dataIn = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const escala = document.getElementById('escala').value;
    const uf = document.getElementById('novo-cartao-uf').value;
    const cidade = document.getElementById('novo-cartao-cidade').value;
    const editId = document.getElementById('cartao-edit-id').value;

    if (!reclamante || !dataIn || !dataFim) {
        alert("Preencha os campos obrigatórios!");
        return;
    }

    const config = {
        reclamante,
        reclamada: document.getElementById('reclamada').value.trim(),
        dataInicio: dataIn,
        dataFim: dataFim,
        escala,
        uf,
        cidade,
        qtdBatidas: document.getElementById('checkBatidas').checked ? parseInt(document.getElementById('qtdBatidas').value) : 4,
        intervaloFixo: document.getElementById('intervaloFixo').checked,
        padraoE: document.getElementById('padraoE').value,
        padraoS: document.getElementById('padraoS').value,
        dataFolgaInicial: document.getElementById('dataFolgaInicial')?.value || ""
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "cartoes", editId), { config, dataEdicao: Date.now() });
            alert("Cartão atualizado!");
            carregarDashboard();
            window.fecharModalNovo();
        } else {
            const idNovo = Date.now().toString();
            await setDoc(doc(db, "cartoes", idNovo), {
                id: idNovo,
                userId: usuarioAtual.uid,
                config: config,
                batidas: {},
                dataEdicao: Date.now()
            });
            localStorage.setItem('cartaoAtualId', idNovo);
            window.location.href = "app.html";
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar.");
    }
};

/* ==========================================================================
   5. GESTÃO DE PERFIL E EQUIPE
   ========================================================================== */

window.iniciarOnboarding = (user) => {
    const inviteId = sessionStorage.getItem('inviteId');
    const formGroupEmpresa = document.getElementById('perfil-empresa')?.closest('.form-group');
    
    if (inviteId && formGroupEmpresa) {
        formGroupEmpresa.style.display = 'none';
    }
    
    const inputNome = document.getElementById('perfil-nome');
    if (inputNome) inputNome.value = user.displayName || "";
    
    const modalOnboarding = document.getElementById('modal-onboarding');
    if (modalOnboarding) modalOnboarding.classList.remove('escondido');
};

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

/* ==========================================================================
   6. MODAIS E UTILITÁRIOS
   ========================================================================== */

window.abrirModalNovo = function() {
    document.getElementById('modal-novo').classList.remove('escondido');
    document.getElementById('titulo-modal-cartao').innerText = "➕ Novo Cartão Ponto";
    document.getElementById('btn-salvar-cartao').innerText = "Gerar Cartão ➔";
    document.getElementById('cartao-edit-id').value = "";
    
    document.getElementById('reclamante').value = '';
    document.getElementById('reclamada').value = '';
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
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

window.abrirModalColaboradores = async () => {
    if (!dadosUsuarioGlobal) return;
    const uidBusca = (dadosUsuarioGlobal.tipoConta === 'admin') ? usuarioAtual.uid : dadosUsuarioGlobal.adminId;
    
    try {
        const q = query(collection(db, "usuarios"), where("adminId", "==", uidBusca));
        const querySnapshot = await getDocs(q);
        const lista = document.getElementById('lista-colaboradores-corpo');
        if (!lista) return;

        lista.innerHTML = '';
        querySnapshot.forEach(docSnap => {
            const colab = docSnap.data();
            lista.innerHTML += `
                <tr>
                    <td>${colab.nome}</td>
                    <td>${colab.email}</td>
                    <td><span class="badge-cargo">${colab.tipoConta}</span></td>
                </tr>
            `;
        });
        document.getElementById('modal-colaboradores').classList.remove('escondido');
    } catch (e) { console.error(e); }
};

window.fecharModalColaboradores = () => document.getElementById('modal-colaboradores').classList.add('escondido');
window.abrirModalEntrarEquipe = () => document.getElementById('modal-entrar-equipe').classList.remove('escondido');
window.fecharModalEntrarEquipe = () => document.getElementById('modal-entrar-equipe').classList.add('escondido');

window.copiarLinkConvite = () => {
    const input = document.getElementById('link-convite-texto');
    input.select();
    document.execCommand('copy');
    alert("Link copiado!");
};

window.fazerLogout = () => auth.signOut().then(() => window.location.href = "index.html");

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

function configurarBuscaCidades() {
    const selectUF = document.getElementById('novo-cartao-uf');
    const selectCidade = document.getElementById('novo-cartao-cidade');

    if (!selectUF || !selectCidade) return;

    selectUF.addEventListener('change', async () => {
        const uf = selectUF.value;
        if (!uf) {
            selectCidade.innerHTML = '<option value="">Selecione a Cidade</option>';
            selectCidade.disabled = true;
            return;
        }

        try {
            selectCidade.innerHTML = '<option>Carregando cidades...</option>';
            selectCidade.disabled = false;
            const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`);
            const cidades = await response.json();

            selectCidade.innerHTML = '<option value="">Selecione a Cidade</option>';
            cidades.forEach(cidade => {
                const option = document.createElement('option');
                option.value = cidade.nome;
                option.textContent = cidade.nome;
                selectCidade.appendChild(option);
            });
        } catch (error) {
            console.error("Erro ao buscar cidades:", error);
            selectCidade.innerHTML = '<option value="">Erro ao carregar cidades</option>';
        }
    });
}

configurarBuscaCidades();
