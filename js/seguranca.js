/* ==========================================================================
   SEGURANÇA E PROTEÇÃO DE ROTAS - FIREBASE (CartaoPontoLex)
   ========================================================================== */

import { auth } from './firebase-config.js'; // Apenas importe
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const MODO_TESTE = false; // MUDE PARA FALSE QUANDO FOR PARA PRODUÇÃO

// O "Segurança": Fica vigiando quem tenta entrar
onAuthStateChanged(auth, (user) => {
    if (!user && !MODO_TESTE) {
        window.location.replace("index.html");
    } else if (!user && MODO_TESTE) {
        console.warn("MODO TESTE ATIVADO no seguranca.js: Ignorando bloqueio de tela.");
    }
});

// Criamos uma função global para o botão "Sair" funcionar no HTML
window.fazerLogout = function() {
    signOut(auth).then(() => {
        window.location.replace("index.html");
    });
};