import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAYKwESZLQelQlyh5pWX0oE0eVOMI5Z3fY",
    authDomain: "cartaopontolex.firebaseapp.com",
    projectId: "cartaopontolex",
    storageBucket: "cartaopontolex.firebasestorage.app",
    messagingSenderId: "261448645689",
    appId: "1:261448645689:web:a6e7aebb12ef87c15b61e8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);