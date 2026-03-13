/* ==========================================================================
   SISTEMA DE AUTENTICAÇÃO COMPLETO - FIREBASE (CartaoPontoLex)
   ========================================================================== */
import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    GoogleAuthProvider,
    FacebookAuthProvider,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Captura parâmetros de convite
const urlParams = new URLSearchParams(window.location.search);
const inviteId = urlParams.get('invite');

if (inviteId) {
    sessionStorage.setItem('inviteId', inviteId);
    const msgBoasVindas = document.getElementById('titulo-login');
    if (msgBoasVindas) msgBoasVindas.innerText = "📝 Criar Conta de Colaborador";
}

// Provedores
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// Elementos da Interface
const btnAlternar = document.getElementById('alternar-modo');
const btnAcao = document.getElementById('btn-acao');
const tituloLogin = document.getElementById('titulo-login');
const containerNome = document.getElementById('container-nome');
let modoLogin = true;

// Alternar entre Login e Cadastro
if (btnAlternar) {
    btnAlternar.addEventListener('click', (e) => {
        e.preventDefault();
        modoLogin = !modoLogin;
        
        if (modoLogin) {
            tituloLogin.innerText = "Bem-vindo de Volta!";
            btnAcao.innerText = "Entrar com E-mail ➔";
            btnAlternar.innerText = "Não tem conta? Cadastre-se";
            if (containerNome) containerNome.style.display = 'none';
        } else {
            tituloLogin.innerText = "Criar sua Conta";
            btnAcao.innerText = "Cadastrar e Acessar ➔";
            btnAlternar.innerText = "Já tem conta? Faça Login";
            if (containerNome) containerNome.style.display = 'block';
        }
    });
}

// Lógica de Envio do Formulário (Submit)
const form = document.getElementById('login-form');
if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email-login').value;
        const senha = document.getElementById('senha-login').value;
        
        if (!email || !senha) {
            alert("Preencha e-mail e senha!");
            return;
        }

        btnAcao.innerText = "Aguarde...";
        btnAcao.disabled = true;

        if (modoLogin) {
            signInWithEmailAndPassword(auth, email, senha)
                .then(() => {
                    window.location.href = "dashboard.html";
                })
                .catch((error) => tratarErro(error));
        } else {
            createUserWithEmailAndPassword(auth, email, senha)
                .then(() => {
                    window.location.href = "dashboard.html";
                })
                .catch((error) => tratarErro(error));
        }
    });
}

// Tratamento de Erros Amigável
function tratarErro(error) {
    if (btnAcao) {
        btnAcao.disabled = false;
        btnAcao.innerText = modoLogin ? "Entrar com E-mail ➔" : "Cadastrar e Acessar ➔";
    }
    
    console.error("Erro Firebase:", error.code);
    
    let mensagem = "Ocorreu um erro na autenticação.";
    switch (error.code) {
        case 'auth/invalid-email':
            mensagem = "E-mail inválido.";
            break;
        case 'auth/invalid-credential':
            mensagem = "E-mail ou senha incorretos.";
            break;
        case 'auth/email-already-in-use':
            mensagem = "Este e-mail já está cadastrado.";
            break;
        case 'auth/weak-password':
            mensagem = "A senha deve ter pelo menos 6 caracteres.";
            break;
        case 'auth/popup-closed-by-user':
            mensagem = "Login cancelado.";
            break;
    }
    
    alert(mensagem);
}