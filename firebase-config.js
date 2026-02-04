// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAVlZwbARYWzPWmSjnc24t0FOSlKP4UmOg",
  authDomain: "task-manager-c0fa9.firebaseapp.com",
  projectId: "task-manager-c0fa9",
  storageBucket: "task-manager-c0fa9.firebasestorage.app",
  messagingSenderId: "288647961766",
  appId: "1:288647961766:web:357c40995536c6bbbb6867"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);

// Получаем ссылку на базу данных
const db = firebase.firestore();

// Включаем режим отладки (только для разработки)
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Для отладки в консоли
console.log("Firebase инициализирован");

// Глобальные переменные для доступа
window.firebaseDB = db;
