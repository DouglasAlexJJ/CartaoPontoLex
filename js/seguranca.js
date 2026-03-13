/* ==========================================================================
   SEGURANÇA E PROTEÇÃO DE ROTAS - FIREBASE (CartaoPontoLex)
   ========================================================================== */

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// O "Segurança": Fica vigiando quem tenta entrar
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("index.html");
    }
});

// Criamos uma função global para o botão "Sair" funcionar no HTML
window.fazerLogout = function() {
    signOut(auth).then(() => {
        window.location.replace("index.html");
    });
};