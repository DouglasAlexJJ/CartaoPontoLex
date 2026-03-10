/* ==========================================================================
   SISTEMA DE AUTENTICAÇÃO COMPLETO - FIREBASE (CartaoPontoLex)
   ========================================================================== */
const urlParams = new URLSearchParams(window.location.search);
const inviteId = urlParams.get('invite');

if (inviteId) {
    console.log("Usuário convidado pelo Admin:", inviteId);
    // Guarda o ID na sessão para usar depois do cadastro
    sessionStorage.setItem('inviteId', inviteId);
    
    // Opcional: Mostrar um aviso visual de boas-vindas
    const msgBoasVindas = document.getElementById('titulo-login');
    if (msgBoasVindas) msgBoasVindas.innerText = "📝 Criar Conta de Colaborador";
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider,
    FacebookAuthProvider,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// Configuração dos Provedores Sociais
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

let modoLogin = true; 
const btnAcao = document.getElementById('btn-acao-login');
const linkTrocar = document.getElementById('link-trocar-modo');
const titulo = document.getElementById('titulo-login');
const msgErro = document.getElementById('msg-erro');
const btnGoogle = document.getElementById('btn-login-google');
const btnFacebook = document.getElementById('btn-login-facebook');

// --- LOGIN COM GOOGLE ---
btnGoogle.addEventListener('click', () => {
    msgErro.style.display = 'none';
    signInWithPopup(auth, googleProvider)
        .then((result) => {
            // Sucesso! Vai pro painel.
            window.location.href = "dashboard.html";
        }).catch((error) => tratarErro(error));
});

// --- LOGIN/CADASTRO COM E-MAIL ---
linkTrocar.addEventListener('click', (e) => {
    e.preventDefault();
    modoLogin = !modoLogin;
    msgErro.style.display = 'none';
    
    if (modoLogin) {
        titulo.innerText = "🔐 Entrar no Sistema";
        btnAcao.innerText = "Entrar com E-mail ➔";
        linkTrocar.innerText = "Não tem conta? Crie uma agora!";
    } else {
        titulo.innerText = "📝 Criar Nova Conta";
        btnAcao.innerText = "Cadastrar e Acessar ➔";
        linkTrocar.innerText = "Já tem uma conta? Faça Login.";
    }
});

btnAcao.addEventListener('click', () => {
    const email = document.getElementById('email-login').value;
    const senha = document.getElementById('senha-login').value;
    
    if (!email || !senha) {
        mostrarErro("Preencha e-mail e senha!");
        return;
    }

    btnAcao.innerText = "Aguarde...";
    btnAcao.disabled = true;

    if (modoLogin) {
        signInWithEmailAndPassword(auth, email, senha)
            .then(() => window.location.href = "dashboard.html")
            .catch((error) => tratarErro(error));
    } else {
        createUserWithEmailAndPassword(auth, email, senha)
            .then(() => window.location.href = "dashboard.html")
            .catch((error) => tratarErro(error));
    }
});

function tratarErro(error) {
    btnAcao.disabled = false;
    btnAcao.innerText = modoLogin ? "Entrar com E-mail ➔" : "Cadastrar e Acessar ➔";
    
    let mensagem = "Ocorreu um erro na autenticação.";
    if (error.code === 'auth/invalid-email') mensagem = "E-mail inválido.";
    if (error.code === 'auth/invalid-credential') mensagem = "E-mail ou senha incorretos.";
    if (error.code === 'auth/email-already-in-use') mensagem = "Este e-mail já está cadastrado.";
    if (error.code === 'auth/weak-password') mensagem = "A senha deve ter pelo menos 6 caracteres.";
    if (error.code === 'auth/popup-closed-by-user') mensagem = "A janela de login foi fechada.";
    
    mostrarErro(mensagem);
}

function mostrarErro(texto) {
    msgErro.innerText = texto;
    msgErro.style.display = 'block';
}