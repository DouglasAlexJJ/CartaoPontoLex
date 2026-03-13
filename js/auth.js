import { auth, db } from './firebase-config.js'; 
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    GoogleAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();

// IDs CORRIGIDOS CONFORME SEU INDEX.HTML
const form = document.getElementById('login-form');
const btnAcao = document.getElementById('btn-acao-login'); 
const btnAlternar = document.getElementById('link-trocar-modo'); 
const tituloLogin = document.getElementById('titulo-login');

let modoLogin = true;

// Alternar entre Login e Cadastro
if (btnAlternar) {
    btnAlternar.addEventListener('click', (e) => {
        e.preventDefault();
        modoLogin = !modoLogin;
        tituloLogin.innerText = modoLogin ? "Bem-vindo de Volta!" : "Criar sua Conta";
        btnAcao.innerText = modoLogin ? "Entrar com E-mail ➔" : "Cadastrar e Acessar ➔";
        btnAlternar.innerText = modoLogin ? "Não tem conta? Crie uma agora!" : "Já tem conta? Faça Login";
    });
}

// Login com E-mail
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-login').value;
        const senha = document.getElementById('senha-login').value;

        try {
            btnAcao.innerText = "Aguarde...";
            btnAcao.disabled = true;

            if (modoLogin) {
                await signInWithEmailAndPassword(auth, email, senha);
            } else {
                await createUserWithEmailAndPassword(auth, email, senha);
            }
            window.location.href = "dashboard.html";
        } catch (error) {
            console.error("Erro:", error);
            alert("Falha na autenticação: " + error.message);
            btnAcao.disabled = false;
            btnAcao.innerText = modoLogin ? "Entrar com E-mail ➔" : "Cadastrar e Acessar ➔";
        }
    });
}

// Login com Google
const btnGoogle = document.getElementById('btn-google');
if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            window.location.href = "dashboard.html";
        } catch (error) {
            console.error("Erro Google:", error);
            alert("Erro ao logar com Google.");
        }
    });
}