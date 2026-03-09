/* ==========================================================================
   SEGURANÇA E PROTEÇÃO DE ROTAS - FIREBASE (CartaoPontoLex)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// O "Segurança": Fica vigiando quem tenta entrar
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Não tem credencial? Expulsa para a página inicial!
        window.location.replace("index.html");
    } else {
        // Usuário autorizado! 
        // Vamos trocar aquele "Dr. Silva" genérico pelo nome/e-mail real dele
        const nomePerfil = document.querySelector('.info-perfil strong');
        if (nomePerfil) {
            // Por enquanto pega a parte do e-mail antes do @ (ex: dr.joao@gmail -> dr.joao)
            nomePerfil.innerText = user.email.split('@')[0]; 
        }
    }
});

// Criamos uma função global para o botão "Sair" funcionar no HTML
window.fazerLogout = function() {
    signOut(auth).then(() => {
        window.location.replace("index.html");
    });
};