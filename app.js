// Глобальные переменные
let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
let currentUser = null;
let currentWorkspace = null;
let tasksSubscription = null;
let adminMode = false;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const modalTitle = document.getElementById('modalTitle');
const addTaskBtn = document.getElementById('addTaskBtn');
const addFirstTaskBtn = document.getElementById('addFirstTaskBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const exportBtn = document.getElementById('exportBtn');
const syncStatusBtn = document.getElementById('syncStatusBtn');
const syncIndicator = document.getElementById('syncIndicator');
const syncStatusBar = document.getElementById('syncStatusBar');
const currentUserBadge = document.getElementById('currentUserBadge');
const filters = document.querySelectorAll('.filter-btn');
const statsBar = document.getElementById('statsBar');
const totalTasks = document.getElementById('totalTasks');
const activeTasks = document.getElementById('activeTasks');
const completedTasks = document.getElementById('completedTasks');
const overdueTasks = document.getElementById('overdueTasks');

// Добавляем кнопку админа в заголовок
let adminButton = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализация приложения...');
    
    // Проверяем существующую сессию через 1 секунду
    setTimeout(async () => {
        try {
            if (typeof window.supabaseAuth === 'undefined') {
                console.error('supabaseAuth не загружен!');
                showToast('Ошибка загрузки приложения', 'error');
                return;
            }
            
            console.log('supabaseAuth загружен, проверяем сессию...');
            
            const sessionResult = await window.supabaseAuth.checkSession();
            console.log('Результат проверки сессии:', sessionResult);
            
            if (sessionResult.success) {
                currentUser = sessionResult.user;
                currentWorkspace = sessionResult.workspace;
                
                // Проверяем, является ли пользователь админом
                checkAdminStatus();
                
                updateUserInterface();
                loginScreen.style.display = 'none';
                appScreen.style.display = 'flex';
                
                await loadTasks();
                startRealtimeSubscription();
                updateSyncStatus(true);
            } else {
                console.log('Сессия не найдена, показываем экран входа');
            }
        } catch (error) {
            console.error('Ошибка инициализации:', error);
        }
    }, 1000);
});

// Инициализация
async function init() {
    console.log('Инициализация приложения...');
    
    try {
        const sessionResult = await window.supabaseAuth.checkSession();
        if (sessionResult.success) {
            currentUser = sessionResult.user;
            currentWorkspace = sessionResult.workspace;
            
            checkAdminStatus();
            updateUserInterface();
            
            loginScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            await loadTasks();
            startRealtimeSubscription();
            updateSyncStatus(true);
        }
    } catch (error) {
        console.error('Ошибка проверки сессии:', error);
    }
}

// Проверка статуса администратора
function checkAdminStatus() {
    if (!currentUser) return;
    
    // Админ определяется по имени пользователя (можно изменить на поле is_admin в базе)
    const adminUsernames = ['admin', 'administrator', 'root', 'superuser'];
    adminMode = adminUsernames.includes(currentUser.username.toLowerCase());
    
    console.log('Проверка админ статуса:', {
        username: currentUser.username,
        isAdmin: adminMode
    });
    
    // Если админ - добавляем кнопку админ-панели
    if (adminMode) {
        addAdminButton();
    }
}

// Добавление кнопки админа в интерфейс
function addAdminButton() {
    if (adminButton) return;
    
    // Создаем кнопку админа
    adminButton = document.createElement('button');
    adminButton.innerHTML = '<i class="fas fa-user-shield"></i>';
    adminButton.className = 'icon-btn';
    adminButton.title = 'Панель администратора';
    adminButton.style.background = '#10B981';
    adminButton.style.color = 'white';
    adminButton.style.marginRight = '10px';
    
    adminButton.addEventListener('click', () => {
        showAdminPanel();
    });
    
    // Добавляем кнопку в заголовок
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        headerActions.insertBefore(adminButton, headerActions.firstChild);
    }
}

// Обновление интерфейса пользователя
function updateUserInterface() {
    if (!currentUser || !currentWorkspace) return;
    
    // Отображаем информацию о пользователе
    let userText = `${currentUser.username} | ${currentWorkspace.name}`;
    if (adminMode) {
        userText = `👑 ${userText}`;
    }
    currentUserBadge.textContent = userText;
    
    // Для админа добавляем дополнительные возможности
    if (adminMode) {
        // Можно добавить дополнительные стили для админа
        currentUserBadge.style.color = '#10B981';
        currentUserBadge.style.fontWeight = 'bold';
    }
}

// Загрузка задач
async function loadTasks() {
    try {
        showSyncStatus('Загрузка задач...');
        const tasksData = await window.supabaseAuth.getTasks();
        
        tasks = tasksData.map(task => ({
            ...task,
            deadline: new Date(task.deadline),
            created_at: new Date(task.created_at),
            updated_at: new Date(task.updated_at)
        }));
        
        sortTasks();
        renderTasks();
        updateStats();
        hideSyncStatus();
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        showToast('Ошибка загрузки задач', 'error');
        hideSyncStatus();
    }
}

// Сортировка задач
function sortTasks() {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.deadline) - new Date(b.deadline);
    });
}

// Отображение задач
function renderTasks() {
    let filteredTasks = tasks;
    
    switch (currentFilter) {
        case 'high': filteredTasks = tasks.filter(t => t.priority === 'high'); break;
        case 'medium': filteredTasks = tasks.filter(t => t.priority === 'medium'); break;
        case 'low': filteredTasks = tasks.filter(t => t.priority === 'low'); break;
        case 'pending': filteredTasks = tasks.filter(t => !t.completed); break;
        case 'completed': filteredTasks = tasks.filter(t => t.completed); break;
    }
    
    taskList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        const emptyStateClone = emptyState.cloneNode(true);
        emptyStateClone.style.display = 'flex';
        taskList.appendChild(emptyStateClone);
        
        const addFirstBtn = emptyStateClone.querySelector('#addFirstTaskBtn');
        if (addFirstBtn) {
            addFirstBtn.addEventListener('click', () => {
                editingTaskId = null;
                modalTitle.textContent = 'Новая задача';
                taskForm.reset();
                document.getElementById('taskDeadline').value = getDefaultDeadline();
                taskModal.classList.add('active');
            });
        }
        
        statsBar.style.display = 'flex';
        return;
    }
    
    filteredTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        taskList.appendChild(taskElement);
    });
    
    statsBar.style.display = 'flex';
}

// Создание элемента задачи
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.priority}`;
    div.dataset.id = task.id;
    
    if (task.completed) div.classList.add('completed');
    
    const now = new Date();
    const deadlineDate = new Date(task.deadline);
    const isOverdue = !task.completed && deadlineDate < now;
    const isDueToday = !task.completed && deadlineDate.toDateString() === now.toDateString();
    const hoursLeft = Math.floor((deadlineDate - now) / (1000 * 60 * 60));
    const isUrgent = !task.completed && hoursLeft >= 0 && hoursLeft < 24;
    
    if (isOverdue) div.classList.add('overdue');
    if (isDueToday) div.classList.add('due-today');
    
    const formattedDate = deadlineDate.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    
    let deadlineClass = '';
    let deadlineIcon = 'far fa-clock';
    
    if (isOverdue) {
        deadlineClass = 'deadline-overdue';
        deadlineIcon = 'fas fa-exclamation-triangle';
    } else if (isDueToday) {
        deadlineClass = 'deadline-today';
        deadlineIcon = 'fas fa-bell';
    }
    
    let tagsArray = [];
    if (Array.isArray(task.tags)) {
        tagsArray = task.tags;
    } else if (typeof task.tags === 'string' && task.tags.trim() !== '') {
        tagsArray = task.tags.split(',').map(tag => tag.trim());
    }
    
    const tagsHtml = tagsArray.length > 0 
        ? `<div style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 5px;">
            ${tagsArray.map(tag => 
                `<span style="background: var(--gray-100); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--gray-600);">
                    ${tag}
                </span>`
            ).join('')}</div>` : '';
    
    const urgentBadge = isUrgent 
        ? `<span class="urgent-badge">
            <i class="fas fa-hourglass-end"></i> ${hoursLeft}ч
           </span>` : '';
    
    // Добавляем информацию о создателе (только для админа)
    const creatorInfo = adminMode && task.created_by_user 
        ? `<div style="margin-top: 5px; font-size: 11px; color: var(--gray-500);">
            <i class="fas fa-user"></i> Создал: ${task.created_by_user.username}
           </div>` 
        : '';
    
    div.innerHTML = `
        <div class="task-header">
            <div class="task-title ${task.completed ? 'completed' : ''}">
                ${task.title} ${urgentBadge}
            </div>
            <div class="task-priority ${task.priority}">
                ${getPriorityText(task.priority)}
            </div>
        </div>
        
        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
        
        ${tagsHtml}
        
        ${creatorInfo}
        
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
    
    div.querySelector('.complete').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskComplete(task.id);
    });
    
    div.querySelector('.edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editTask(task.id);
    });
    
    div.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task.id);
    });
    
    return div;
}

// Авторизация
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (username.length < 3) {
        showToast('Логин должен быть не менее 3 символов', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Пароль должен быть не менее 6 символов', 'error');
        return;
    }
    
    const loginBtn = document.getElementById('loginBtn');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    
    loginText.style.display = 'none';
    loginSpinner.style.display = 'inline-block';
    
    try {
        const result = await window.supabaseAuth.login(username, password);
        
        if (result.success) {
            currentUser = result.user;
            currentWorkspace = result.workspace;
            
            // Проверяем админ статус
            checkAdminStatus();
            
            // Сохраняем сессию
            window.supabaseAuth.saveSession(currentUser, currentWorkspace);
            
            // Обновляем интерфейс
            updateUserInterface();
            loginScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            
            await loadTasks();
            startRealtimeSubscription();
            updateSyncStatus(true);
            
            showToast('Вход выполнен!', 'success');
        } else {
            showToast(`Ошибка: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Ошибка входа', 'error');
    } finally {
        loginText.style.display = 'inline';
        loginSpinner.style.display = 'none';
    }
});

// Выход
logoutBtn.addEventListener('click', async () => {
    await window.supabaseAuth.logout();
    if (tasksSubscription) {
        tasksSubscription.unsubscribe();
        tasksSubscription = null;
    }
    
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
    tasks = [];
    currentUser = null;
    currentWorkspace = null;
    adminMode = false;
    
    // Удаляем кнопку админа если была
    if (adminButton) {
        adminButton.remove();
        adminButton = null;
    }
    
    updateSyncStatus(false);
    showToast('Вы вышли из системы', 'info');
});

// Real-time подписка
function startRealtimeSubscription() {
    if (!currentWorkspace) return;
    
    if (tasksSubscription) {
        tasksSubscription.unsubscribe();
    }
    
    tasksSubscription = window.supabaseAuth.supabase
        .channel('tasks-' + currentWorkspace.id)
        .on('postgres_changes', 
            {
                event: '*',
                schema: 'public',
                table: 'tasks',
                filter: `workspace_id=eq.${currentWorkspace.id}`
            },
            async (payload) => {
                console.log('Real-time update received:', payload);
                
                await loadTasks();
                
                if (payload.eventType === 'INSERT') {
                    showToast('Новая задача добавлена', 'success');
                } else if (payload.eventType === 'UPDATE') {
                    showToast('Задача обновлена', 'info');
                } else if (payload.eventType === 'DELETE') {
                    showToast('Задача удалена', 'warning');
                }
                
                updateSyncStatus(true);
                setTimeout(() => updateSyncStatus(true), 1000);
            }
        )
        .subscribe((status) => {
            console.log('Subscription status:', status);
            updateSyncStatus(status === 'SUBSCRIBED');
        });
}

// Обновление статуса синхронизации
function updateSyncStatus(connected) {
    const syncIcon = document.getElementById('syncIcon');
    if (connected) {
        syncIndicator.style.display = 'block';
        syncIndicator.style.background = '#10B981';
        syncIcon.className = 'fas fa-wifi';
    } else {
        syncIndicator.style.display = 'block';
        syncIndicator.style.background = '#EF4444';
        syncIcon.className = 'fas fa-wifi-slash';
    }
}

function showSyncStatus(message) {
    syncStatusBar.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${message}`;
    syncStatusBar.style.display = 'block';
}

function hideSyncStatus() {
    syncStatusBar.style.display = 'none';
}

// Обновление статистики
function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    const overdue = tasks.filter(t => 
        !t.completed && new Date(t.deadline) < new Date()
    ).length;
    
    totalTasks.textContent = total;
    activeTasks.textContent = active;
    completedTasks.textContent = completed;
    overdueTasks.textContent = overdue;
    
    statsBar.style.display = 'flex';
}

// Функции для работы с задачами
async function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
        await window.supabaseAuth.updateTask(taskId, { completed: !task.completed });
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('Ошибка обновления задачи', 'error');
    }
}

async function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    editingTaskId = taskId;
    modalTitle.textContent = 'Редактировать задачу';
    
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority;
    
    const deadlineDate = new Date(task.deadline);
    const year = deadlineDate.getFullYear();
    const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
    const day = String(deadlineDate.getDate()).padStart(2, '0');
    const hours = String(deadlineDate.getHours()).padStart(2, '0');
    const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
    
    document.getElementById('taskDeadline').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    let tagsValue = '';
    if (Array.isArray(task.tags)) {
        tagsValue = task.tags.join(', ');
    } else if (task.tags) {
        tagsValue = task.tags;
    }
    
    document.getElementById('taskTags').value = tagsValue;
    document.getElementById('taskId').value = taskId;
    
    taskModal.classList.add('active');
}

async function deleteTask(taskId) {
    if (!confirm('Удалить эту задачу?')) return;
    
    try {
        await window.supabaseAuth.deleteTask(taskId);
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('Ошибка удаления задачи', 'error');
    }
}

// Добавление задачи
addTaskBtn.addEventListener('click', () => {
    editingTaskId = null;
    modalTitle.textContent = 'Новая задача';
    taskForm.reset();
    document.getElementById('taskDeadline').value = getDefaultDeadline();
    taskModal.classList.add('active');
});

// Сохранение задачи
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const saveTaskBtn = document.getElementById('saveTaskBtn');
    const saveTaskText = document.getElementById('saveTaskText');
    const saveTaskSpinner = document.getElementById('saveTaskSpinner');
    
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
                .filter(tag => tag.length > 0)
        };
        
        if (!taskData.title || !taskData.priority || !taskData.deadline) {
            showToast('Заполните обязательные поля: название, приоритет и дедлайн', 'error');
            saveTaskText.style.display = 'inline';
            saveTaskSpinner.style.display = 'none';
            return;
        }
        
        if (editingTaskId) {
            await window.supabaseAuth.updateTask(editingTaskId, taskData);
        } else {
            await window.supabaseAuth.addTask(taskData);
        }
        
        taskModal.classList.remove('active');
        
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Ошибка сохранения задачи', 'error');
    } finally {
        saveTaskText.style.display = 'inline';
        saveTaskSpinner.style.display = 'none';
    }
});

// Экспорт
exportBtn.addEventListener('click', () => {
    if (tasks.length === 0) {
        showToast('Нет задач для экспорта', 'warning');
        return;
    }
    
    window.supabaseAuth.exportTasks(tasks);
    showToast('Задачи экспортированы', 'success');
});

// Закрытие модальных окон
closeModalBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
});

taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        taskModal.classList.remove('active');
    }
});

// Фильтры
filters.forEach(filter => {
    filter.addEventListener('click', () => {
        filters.forEach(f => f.classList.remove('active'));
        filter.classList.add('active');
        currentFilter = filter.dataset.filter;
        renderTasks();
    });
});

// Статус синхронизации
syncStatusBtn.addEventListener('click', () => {
    const isConnected = syncIndicator.style.display === 'block' && 
                        syncIndicator.style.background === '#10B981';
    showToast(isConnected ? 'Синхронизация активна' : 'Синхронизация отключена', 'info');
});

// АДМИН-ПАНЕЛЬ
function showAdminPanel() {
    if (!adminMode) {
        showToast('Доступ запрещен', 'error');
        return;
    }
    
    // Создаем модальное окно админ-панели
    const adminModal = document.createElement('div');
    adminModal.className = 'admin-modal';
    adminModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
        animation: fadeIn 0.3s ease;
    `;
    
    adminModal.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            width: 100%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            animation: slideUp 0.4s ease;
        ">
            <div style="
                padding: 25px;
                border-bottom: 1px solid var(--gray-200);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #10B981, #059669);
                border-radius: 20px 20px 0 0;
                color: white;
            ">
                <h2 style="margin: 0; font-size: 24px;">
                    <i class="fas fa-user-shield"></i> Панель администратора
                </h2>
                <button id="closeAdminPanel" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div style="padding: 25px;">
                <div style="margin-bottom: 30px;">
                    <h3 style="color: var(--gray-700); margin-bottom: 15px;">
                        <i class="fas fa-user-plus"></i> Создать нового пользователя
                    </h3>
                    
                    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <input type="text" id="adminUsername" placeholder="Логин пользователя" 
                                   style="width: 100%; padding: 12px; border: 2px solid var(--gray-200); border-radius: 10px;">
                        </div>
                        <div style="flex: 1;">
                            <input type="password" id="adminPassword" placeholder="Пароль (мин. 6 символов)" 
                                   style="width: 100%; padding: 12px; border: 2px solid var(--gray-200); border-radius: 10px;">
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <select id="adminWorkspace" 
                                style="width: 100%; padding: 12px; border: 2px solid var(--gray-200); border-radius: 10px;">
                            <option value="">Выберите пространство</option>
                        </select>
                    </div>
                    
                    <button id="createUserBtn" style="
                        background: linear-gradient(135deg, #3B82F6, #2563EB);
                        color: white;
                        border: none;
                        padding: 14px 28px;
                        border-radius: 10px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        width: 100%;
                    ">
                        <i class="fas fa-user-plus"></i> Создать пользователя
                    </button>
                    
                    <div id="adminMessage" style="
                        margin-top: 15px;
                        padding: 12px;
                        border-radius: 8px;
                        display: none;
                    "></div>
                </div>
                
                <div>
                    <h3 style="color: var(--gray-700); margin-bottom: 15px;">
                        <i class="fas fa-chart-bar"></i> Статистика системы
                    </h3>
                    
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    ">
                        <div style="
                            background: var(--gray-50);
                            padding: 15px;
                            border-radius: 10px;
                            text-align: center;
                        ">
                            <div style="font-size: 24px; font-weight: bold; color: #3B82F6;" id="adminTotalUsers">
                                <i class="fas fa-users"></i> ...
                            </div>
                            <div style="color: var(--gray-600); font-size: 14px;">Пользователей</div>
                        </div>
                        
                        <div style="
                            background: var(--gray-50);
                            padding: 15px;
                            border-radius: 10px;
                            text-align: center;
                        ">
                            <div style="font-size: 24px; font-weight: bold; color: #10B981;" id="adminTotalWorkspaces">
                                <i class="fas fa-layer-group"></i> ...
                            </div>
                            <div style="color: var(--gray-600); font-size: 14px;">Пространств</div>
                        </div>
                        
                        <div style="
                            background: var(--gray-50);
                            padding: 15px;
                            border-radius: 10px;
                            text-align: center;
                        ">
                            <div style="font-size: 24px; font-weight: bold; color: #8B5CF6;" id="adminTotalTasks">
                                <i class="fas fa-tasks"></i> ${tasks.length}
                            </div>
                            <div style="color: var(--gray-600); font-size: 14px;">Задач в системе</div>
                        </div>
                    </div>
                </div>
                
                <div id="usersListContainer" style="margin-top: 30px;">
                    <h3 style="color: var(--gray-700); margin-bottom: 15px;">
                        <i class="fas fa-list"></i> Список пользователей
                    </h3>
                    <div style="
                        background: var(--gray-50);
                        padding: 15px;
                        border-radius: 10px;
                        min-height: 100px;
                        text-align: center;
                    " id="adminUsersList">
                        <i class="fas fa-spinner fa-spin"></i> Загрузка пользователей...
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(adminModal);
    
    // Загружаем данные для админ-панели
    loadAdminData();
    
    // Обработчики событий для админ-панели
    document.getElementById('closeAdminPanel').addEventListener('click', () => {
        adminModal.remove();
    });
    
    document.getElementById('createUserBtn').addEventListener('click', async () => {
        await createUserFromAdminPanel();
    });
    
    // Закрытие по клику вне модального окна
    adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) {
            adminModal.remove();
        }
    });
}

// Загрузка данных для админ-панели
async function loadAdminData() {
    if (!adminMode) return;
    
    try {
        // Загружаем пространства для выпадающего списка
        const workspaces = await window.supabaseAuth.supabase
            .from('workspace')
            .select('*')
            .order('name');
        
        if (workspaces.data) {
            const select = document.getElementById('adminWorkspace');
            select.innerHTML = '<option value="">Выберите пространство</option>';
            
            workspaces.data.forEach(workspace => {
                const option = document.createElement('option');
                option.value = workspace.id;
                option.textContent = workspace.name;
                select.appendChild(option);
            });
        }
        
        // Загружаем статистику
        const usersCount = await window.supabaseAuth.supabase
            .from('app_users')
            .select('count', { count: 'exact' });
            
        const workspacesCount = await window.supabaseAuth.supabase
            .from('workspace')
            .select('count', { count: 'exact' });
        
        // Обновляем статистику
        if (usersCount.data) {
            document.getElementById('adminTotalUsers').innerHTML = 
                `<i class="fas fa-users"></i> ${usersCount.count}`;
        }
        
        if (workspacesCount.data) {
            document.getElementById('adminTotalWorkspaces').innerHTML = 
                `<i class="fas fa-layer-group"></i> ${workspacesCount.count}`;
        }
        
        // Загружаем список пользователей
        await loadAdminUsersList();
        
    } catch (error) {
        console.error('Ошибка загрузки данных админ-панели:', error);
        showAdminMessage('Ошибка загрузки данных', 'error');
    }
}

// Загрузка списка пользователей для админ-панели
async function loadAdminUsersList() {
    try {
        const users = await window.supabaseAuth.supabase
            .from('app_users')
            .select(`
                *,
                workspace:workspace_id(name)
            `)
            .order('created_at', { ascending: false });
        
        if (users.data) {
            const container = document.getElementById('adminUsersList');
            if (users.data.length === 0) {
                container.innerHTML = '<div style="color: var(--gray-500);">Нет пользователей</div>';
                return;
            }
            
            let html = '<div style="overflow-x: auto;">';
            html += '<table style="width: 100%; border-collapse: collapse;">';
            html += `
                <thead>
                    <tr style="background: var(--gray-100);">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--gray-200);">Логин</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--gray-200);">Пространство</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--gray-200);">Дата создания</th>
                    </tr>
                </thead>
                <tbody>
            `;
            
            users.data.forEach(user => {
                const workspaceName = user.workspace ? user.workspace.name : 'Неизвестно';
                const isCurrentUser = user.username === currentUser.username;
                
                html += `
                    <tr style="border-bottom: 1px solid var(--gray-100); ${isCurrentUser ? 'background: #F0F9FF;' : ''}">
                        <td style="padding: 10px;">
                            ${user.username} 
                            ${isCurrentUser ? '<span style="color: #10B981; font-weight: bold;">(Вы)</span>' : ''}
                        </td>
                        <td style="padding: 10px;">${workspaceName}</td>
                        <td style="padding: 10px;">${new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Ошибка загрузки списка пользователей:', error);
        document.getElementById('adminUsersList').innerHTML = 
            '<div style="color: #EF4444;">Ошибка загрузки пользователей</div>';
    }
}

// Создание пользователя из админ-панели
async function createUserFromAdminPanel() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const workspaceId = document.getElementById('adminWorkspace').value;
    
    if (!username || !password || !workspaceId) {
        showAdminMessage('Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAdminMessage('Пароль должен быть не менее 6 символов', 'error');
        return;
    }
    
    if (username.length < 3) {
        showAdminMessage('Логин должен быть не менее 3 символов', 'error');
        return;
    }
    
    try {
        // Используем функцию adminCreateUser из supabaseAuth (если она есть)
        if (window.supabaseAuth.adminCreateUser) {
            const result = await window.supabaseAuth.adminCreateUser(username, password, workspaceId);
            
            if (result.success) {
                showAdminMessage(`✅ Пользователь "${username}" создан успешно!`, 'success');
                
                // Очищаем поля
                document.getElementById('adminUsername').value = '';
                document.getElementById('adminPassword').value = '';
                
                // Обновляем список пользователей
                await loadAdminUsersList();
                
                // Обновляем статистику
                await loadAdminData();
            } else {
                showAdminMessage(`❌ Ошибка: ${result.error}`, 'error');
            }
        } else {
            // Альтернативный метод - напрямую через Supabase
            const passwordHash = await hashPassword(password);
            
            const { data, error } = await window.supabaseAuth.supabase
                .from('app_users')
                .insert([{
                    username: username,
                    password_hash: passwordHash,
                    workspace_id: workspaceId
                }])
                .select()
                .single();
            
            if (error) {
                if (error.code === '23505') {
                    throw new Error('Пользователь с таким логином уже существует');
                }
                throw error;
            }
            
            showAdminMessage(`✅ Пользователь "${username}" создан успешно!`, 'success');
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
            
            await loadAdminUsersList();
            await loadAdminData();
        }
        
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        showAdminMessage(`❌ Ошибка: ${error.message}`, 'error');
    }
}

// Вспомогательная функция для хэширования пароля
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Показать сообщение в админ-панели
function showAdminMessage(message, type) {
    const element = document.getElementById('adminMessage');
    if (!element) return;
    
    element.innerHTML = message;
    element.style.display = 'block';
    element.style.background = type === 'success' ? '#D1FAE5' : '#FEE2E2';
    element.style.color = type === 'success' ? '#065F46' : '#991B1B';
    element.style.border = `1px solid ${type === 'success' ? '#A7F3D0' : '#FECACA'}`;
    
    if (type === 'success') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Вспомогательные функции
function getPriorityText(priority) {
    const texts = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
    return texts[priority] || priority;
}

function getDefaultDeadline() {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    
    if (type === 'success') {
        toast.style.background = 'var(--success)';
    } else if (type === 'error') {
        toast.style.background = 'var(--danger)';
    } else if (type === 'warning') {
        toast.style.background = 'var(--warning)';
    } else {
        toast.style.background = 'var(--primary)';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Инициализация
init();
