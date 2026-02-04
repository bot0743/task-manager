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
const db = firebase.firestore();

// Секретный ключ для проверки паролей (шифруется перед сохранением)
const SECRET_KEY = "task-manager-secure-key-sdfbstbtebsb-2026";
