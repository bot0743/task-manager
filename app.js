// Глобальные переменные
let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
let currentUser = null;
let unsubscribeTasks = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const accessKeyInput = document.getElementById('accessKey');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const modalTitle = document.getElementById('modalTitle');
const addTaskBtn = document.getElementById('addTaskBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const filters = document.querySelectorAll('.filter-btn');
const toast = document.getElementById('toast');
const currentUserBadge = document.getElementById('currentUserBadge');
const loadingOverlay = document.getElementById('loadingOverlay');

// Получаем ссылку на базу данных
const db = window.firebaseDB || firebase.firestore();

// Простая хэш-функция для пароля
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'user_' + Math.abs(hash).toString(36);
}

// Проверка пароля через Firebase
async function validatePassword(password) {
    try {
        const userId = hashPassword(password);
        
        // Проверяем, есть ли такой пользователь в Firebase
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (userDoc.exists) {
            return {
                success: true,
                userId: userId,
                username: userDoc.data().username || `Пользователь ${userId.substring(5, 11)}`
            };
        }
        
        // Если пользователь не существует, создаем нового
        await db.collection('users').doc(userId).set({
            username: `Пользователь ${userId.substring(5, 11)}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return {
            success: true,
            userId: userId,
            username: `Пользователь ${userId.substring(5, 11)}`
        };
    } catch (error) {
        console.error('Ошибка проверки пароля:', error);
        return { success: false, error: 'Ошибка подключения к серверу' };
    }
}

// Авторизация
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = accessKeyInput.value.trim();
    const loginBtn = document.getElementById('loginBtn');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    
    if (password.length < 4) {
        showToast('Пароль должен быть не менее 4 символов', 'error');
        return;
    }
    
    // Показываем индикатор загрузки
    loginText.style.display = 'none';
    loginSpinner.style.display = 'inline-block';
    
    try {
        const result = await validatePassword(password);
        
        if (result.success) {
            currentUser = {
                id: result.userId,
                username: result.username
            };
            
            // Сохраняем в sessionStorage
            sessionStorage.setItem('taskManagerAuth', JSON.stringify(currentUser));
            
            // Обновляем бейдж пользователя
            currentUserBadge.textContent = currentUser.username;
            
            // Переходим в приложение
            loginScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            
            // Загружаем задачи
            await loadTasks();
            
            showToast(`Добро пожаловать, ${currentUser.username}!`, 'success');
        } else {
            showToast('Ошибка авторизации', 'error');
        }
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        showToast('Ошибка подключения к серверу', 'error');
    } finally {
        // Скрываем индикатор
        loginText.style.display = 'inline';
        loginSpinner.style.display = 'none';
    }
});

// Проверка авторизации при загрузке
window.addEventListener('load', async () => {
    try {
        const savedAuth = sessionStorage.getItem('taskManagerAuth');
        
        if (savedAuth) {
            currentUser = JSON.parse(savedAuth);
            
            // Проверяем, существует ли пользователь
            const userDoc = await db.collection('users').doc(currentUser.id).get();
            
            if (userDoc.exists) {
                currentUserBadge.textContent = currentUser.username;
                loginScreen.style.display = 'none';
                appScreen.style.display = 'flex';
                await loadTasks();
            } else {
                sessionStorage.removeItem('taskManagerAuth');
                loginScreen.style.display = 'flex';
                appScreen.style.display = 'none';
            }
        } else {
            loginScreen.style.display = 'flex';
            appScreen.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// Выход из системы
logoutBtn.addEventListener('click', () => {
    if (unsubscribeTasks) {
        unsubscribeTasks();
    }
    
    currentUser = null;
    sessionStorage.removeItem('taskManagerAuth');
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
    accessKeyInput.value = '';
    tasks = [];
    showToast('Вы вышли из системы', 'info');
});

// Обновление списка задач
refreshBtn.addEventListener('click', () => {
    showToast('Список обновлен', 'success');
});

// Фильтрация задач
filters.forEach(filter => {
    filter.addEventListener('click', () => {
        filters.forEach(f => f.classList.remove('active'));
        filter.classList.add('active');
        currentFilter = filter.dataset.filter;
        renderTasks();
    });
});

// Открытие модального окна для новой задачи
addTaskBtn.addEventListener('click', () => {
    editingTaskId = null;
    modalTitle.textContent = 'Новая задача';
    taskForm.reset();
    
    // Устанавливаем дедлайн на завтра в 12:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    
    // Форматируем для input datetime-local
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    
    document.getElementById('taskDeadline').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    taskModal.classList.add('active');
});

// Закрытие модального окна
closeModalBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
});

// Закрытие модального окна при клике на фон
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        taskModal.classList.remove('active');
    }
});

// Сохранение задачи
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Необходима авторизация', 'error');
        return;
    }
    
    const saveTaskBtn = document.getElementById('saveTaskBtn');
    const saveTaskText = document.getElementById('saveTaskText');
    const saveTaskSpinner = document.getElementById('saveTaskSpinner');
    
    // Показываем индикатор
    saveTaskText.style.display = 'none';
    saveTaskSpinner.style.display = 'inline-block';
    
    try {
        const taskData = {
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            priority: document.getElementById('taskPriority').value,
            deadline: document.getElementById('taskDeadline').value,
            tags: document.getElementById('taskTags').value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0),
            completed: false,
            userId: currentUser.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingTaskId) {
            // Обновляем задачу
            taskData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('tasks').doc(editingTaskId).update(taskData);
            showToast('Задача обновлена', 'success');
        } else {
            // Создаем новую задачу
            await db.collection('tasks').add(taskData);
            showToast('Задача создана', 'success');
        }
        
        // Закрываем модальное окно
        taskModal.classList.remove('active');
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showToast('Ошибка сохранения задачи', 'error');
    } finally {
        // Скрываем индикатор
        saveTaskText.style.display = 'inline';
        saveTaskSpinner.style.display = 'none';
    }
});

// Загрузка задач в реальном времени
async function loadTasks() {
    if (!currentUser) return;
    
    try {
        loadingOverlay.classList.add('active');
        
        // Отписываемся от предыдущего слушателя
        if (unsubscribeTasks) {
            unsubscribeTasks();
        }
        
        // Подписываемся на обновления задач текущего пользователя
        unsubscribeTasks = db.collection('tasks')
            .where('userId', '==', currentUser.id)
            .orderBy('priority', 'desc')
            .orderBy('deadline')
            .onSnapshot((snapshot) => {
                tasks = [];
                snapshot.forEach(doc => {
                    const task = {
                        id: doc.id,
                        ...doc.data()
                    };
                    // Конвертируем timestamp Firestore в Date
                    if (task.createdAt && task.createdAt.toDate) {
                        task.createdAt = task.createdAt.toDate();
                    }
                    if (task.updatedAt && task.updatedAt.toDate) {
                        task.updatedAt = task.updatedAt.toDate();
                    }
                    tasks.push(task);
                });
                
                // Сортируем задачи
                sortTasks();
                
                // Рендерим задачи
                renderTasks();
                
                // Скрываем индикатор загрузки
                setTimeout(() => {
                    loadingOverlay.classList.remove('active');
                }, 300);
            }, (error) => {
                console.error('Ошибка загрузки задач:', error);
                showToast('Ошибка загрузки задач', 'error');
                loadingOverlay.classList.remove('active');
            });
        
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        showToast('Ошибка загрузки задач', 'error');
        loadingOverlay.classList.remove('active');
    }
}

// Сортировка задач
function sortTasks() {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    tasks.sort((a, b) => {
        // Сначала невыполненные, затем выполненные
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        
        // Затем по приоритету
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Затем по дедлайну
        return new Date(a.deadline) - new Date(b.deadline);
    });
}

// Отображение задач
function renderTasks() {
    // Фильтрация
    let filteredTasks = tasks;
    
    switch (currentFilter) {
        case 'high':
            filteredTasks = tasks.filter(task => task.priority === 'high');
            break;
        case 'medium':
            filteredTasks = tasks.filter(task => task.priority === 'medium');
            break;
        case 'low':
            filteredTasks = tasks.filter(task => task.priority === 'low');
            break;
        case 'pending':
            filteredTasks = tasks.filter(task => !task.completed);
            break;
        case 'completed':
            filteredTasks = tasks.filter(task => task.completed);
            break;
    }
    
    // Очищаем список
    taskList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        const emptyStateClone = emptyState.cloneNode(true);
        emptyStateClone.style.display = 'flex';
        taskList.appendChild(emptyStateClone);
        return;
    }
    
    // Создаем элементы задач
    filteredTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        taskList.appendChild(taskElement);
    });
}

// Создание элемента задачи
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.priority}`;
    
    // Проверяем статус выполнения
    if (task.completed) {
        div.classList.add('completed');
    }
    
    // Определяем статус дедлайна
    const now = new Date();
    const deadlineDate = new Date(task.deadline);
    const isOverdue = !task.completed && deadlineDate < now;
    const isDueToday = !task.completed && 
        deadlineDate.toDateString() === now.toDateString();
    
    // Проверяем срочность (менее 24 часов)
    const hoursLeft = Math.floor((deadlineDate - now) / (1000 * 60 * 60));
    const isUrgent = !task.completed && hoursLeft >= 0 && hoursLeft < 24;
    
    if (isOverdue) {
        div.classList.add('overdue');
    } else if (isDueToday) {
        div.classList.add('due-today');
    }
    
    // Форматирование даты
    const formattedDate = deadlineDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Определяем класс для срока
    let deadlineClass = '';
    let deadlineIcon = 'far fa-clock';
    
    if (isOverdue) {
        deadlineClass = 'deadline-overdue';
        deadlineIcon = 'fas fa-exclamation-triangle';
    } else if (isDueToday) {
        deadlineClass = 'deadline-today';
        deadlineIcon = 'fas fa-bell';
    }
    
    // Теги
    const tagsHtml = task.tags && task.tags.length > 0 
        ? `<div style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 5px;">
            ${task.tags.map(tag => 
                `<span style="background: var(--gray-100); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--gray-600);">
                    ${tag}
                </span>`
            ).join('')}
           </div>`
        : '';
    
    // Бейдж срочности
    const urgentBadge = isUrgent 
        ? `<span class="urgent-badge">
            <i class="fas fa-hourglass-end"></i> ${hoursLeft}ч
           </span>`
        : '';
    
    div.innerHTML = `
        <div class="task-header">
            <div class="task-title ${task.completed ? 'completed' : ''}">
                ${task.title}
                ${urgentBadge}
            </div>
            <div class="task-priority ${task.priority}">
                ${getPriorityText(task.priority)}
            </div>
        </div>
        
        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
        
        ${tagsHtml}
        
        <div class="task-footer">
            <div class="task-deadline ${deadlineClass}">
                <i class="${deadlineIcon}" style="font-size: 12px;"></i>
                <span>${formattedDate}</span>
                ${isOverdue ? '<span style="margin-left: 5px; font-size: 11px; color: #C62828;">(Просрочено)</span>' : ''}
            </div>
            
            <div class="task-actions">
                <button class="action-btn complete" data-id="${task.id}" title="${task.completed ? 'Возобновить' : 'Завершить'}">
                    <i class="fas fa-${task.completed ? 'undo' : 'check'}"></i>
                </button>
                <button class="action-btn edit" data-id="${task.id}" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" data-id="${task.id}" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    
    // Добавляем обработчики событий
    const completeBtn = div.querySelector('.complete');
    const editBtn = div.querySelector('.edit');
    const deleteBtn = div.querySelector('.delete');
    
    completeBtn.addEventListener('click', () => toggleTaskComplete(task.id));
    editBtn.addEventListener('click', () => editTask(task.id));
    deleteBtn.addEventListener('click', () => deleteTask(task.id));
    
    return div;
}

// Переключение статуса задачи
async function toggleTaskComplete(taskId) {
    if (!currentUser) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
        await db.collection('tasks').doc(taskId).update({
            completed: !task.completed,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(task.completed ? 'Задача возобновлена' : 'Задача завершена', 'success');
    } catch (error) {
        console.error('Ошибка обновления:', error);
        showToast('Ошибка обновления задачи', 'error');
    }
}

// Редактирование задачи
function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    editingTaskId = taskId;
    modalTitle.textContent = 'Редактировать задачу';
    
    // Заполняем форму
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority;
    
    // Форматируем дату для input[type="datetime-local"]
    const deadlineDate = new Date(task.deadline);
    const year = deadlineDate.getFullYear();
    const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
    const day = String(deadlineDate.getDate()).padStart(2, '0');
    const hours = String(deadlineDate.getHours()).padStart(2, '0');
    const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
    
    document.getElementById('taskDeadline').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';
    
    // Открываем модальное окно
    taskModal.classList.add('active');
}

// Удаление задачи
async function deleteTask(taskId) {
    if (!confirm('Удалить эту задачу?')) return;
    
    try {
        await db.collection('tasks').doc(taskId).delete();
        showToast('Задача удалена', 'success');
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showToast('Ошибка удаления задачи', 'error');
    }
}

// Вспомогательные функции
function getPriorityText(priority) {
    const texts = {
        high: 'Высокий',
        medium: 'Средний',
        low: 'Низкий'
    };
    return texts[priority] || priority;
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = 'toast';
    
    // Добавляем цвет в зависимости от типа
    if (type === 'success') {
        toast.style.background = 'var(--success)';
    } else if (type === 'error') {
        toast.style.background = 'var(--danger)';
    } else if (type === 'warning') {
        toast.style.background = 'var(--warning)';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
