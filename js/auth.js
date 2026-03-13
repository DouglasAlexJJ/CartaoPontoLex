/* ==========================================================================
   SISTEMA DE AUTENTICAÇÃO - CartaoPontoLex (CORRIGIDO)
   ========================================================================== */
import { auth, db } from './firebase-config.js'; 
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();

// Elementos capturados conforme os IDs do seu index.html
const form = document.getElementById('login-form');
const btnAcao = document.getElementById('btn-acao-login'); // ID corrigido
const btnAlternar = document.getElementById('link-trocar-modo'); // ID corrigido
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
            btnAlternar.innerText = "Não tem conta? Crie uma agora!";
            if (containerNome) containerNome.style.display = 'none';
        } else {
            tituloLogin.innerText = "Criar sua Conta";
            btnAcao.innerText = "Cadastrar e Acessar ➔";
            btnAlternar.innerText = "Já tem conta? Faça Login";
            if (containerNome) containerNome.style.display = 'block';
        }
    });
}

// Lógica de Login com Email
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email-login').value;
        const senha = document.getElementById('senha-login').value;

        if (!email || !senha) {
            alert("Preencha e-mail e senha!");
            return;
        }

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
            console.error("Erro no login:", error);
            btnAcao.disabled = false;
            btnAcao.innerText = modoLogin ? "Entrar com E-mail ➔" : "Cadastrar e Acessar ➔";
            
            let msg = "Erro na autenticação.";
            if (error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
            if (error.code === 'auth/email-already-in-use') msg = "E-mail já cadastrado.";
            alert(msg);
        }
    });
}

// Lógica do Google (ID conforme index.html: btn-google)
const btnGoogle = document.getElementById('btn-google');
if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            window.location.href = "dashboard.html";
        } catch (error) {
            console.error("Erro Google:", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                alert("Erro ao logar com Google.");
            }
        }
    });
}