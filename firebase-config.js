// Ваша конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAVlZwbARYWzPWmSjnc24t0FOSlKP4UmOg",
  authDomain: "task-manager-c0fa9.firebaseapp.com",
  projectId: "task-manager-c0fa9",
  storageBucket: "task-manager-c0fa9.firebasestorage.app",
  messagingSenderId: "288647961766",
  appId: "1:288647961766:web:357c40995536c6bbbb6867"
};

// Инициализация Firebase (версия 8 CDN)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Получаем ссылку на Firestore
const db = firebase.firestore();

// Глобальная переменная для доступа к Firebase
window.firebaseApp = firebase;
window.firebaseDB = db;
