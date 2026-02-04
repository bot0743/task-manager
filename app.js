// Глобальные переменные
let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
let currentUser = null;
let tasksSubscription = null;

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

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализация приложения...');
    
    // Проверяем существующую сессию через 1 секунду (даем время загрузиться supabase-config.js)
    setTimeout(async () => {
        try {
            // Проверяем, загрузился ли supabaseAuth
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
                currentUserBadge.textContent = `ID: ${currentUser.id.substring(0, 8)}`;
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
    
    // Проверяем существующую сессию
    try {
        const sessionResult = await window.supabaseAuth.checkSession();
        if (sessionResult.success) {
            currentUser = sessionResult.user;
            currentUserBadge.textContent = `ID: ${currentUser.id.substring(0, 8)}`;
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
        
        statsBar.style.display = 'none';
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
    
    const tagsHtml = task.tags && task.tags.length > 0 
        ? `<div style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 5px;">
            ${task.tags.map(tag => 
                `<span style="background: var(--gray-100); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--gray-600);">
                    ${tag}
                </span>`
            ).join('')}</div>` : '';
    
    const urgentBadge = isUrgent 
        ? `<span class="urgent-badge">
            <i class="fas fa-hourglass-end"></i> ${hoursLeft}ч
           </span>` : '';
    
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
    
    const password = accessKeyInput.value.trim();
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
        const result = await window.supabaseAuth.loginWithPassword(password);
        
        if (result.success) {
            currentUser = result.user;
            currentUserBadge.textContent = `ID: ${currentUser.id.substring(0, 8)}`;
            loginScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            
            await loadTasks();
            startRealtimeSubscription();
            updateSyncStatus(true);
            
            showToast('Вход выполнен! Задачи синхронизируются в реальном времени', 'success');
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
    accessKeyInput.value = '';
    tasks = [];
    currentUser = null;
    updateSyncStatus(false);
    showToast('Вы вышли из системы', 'info');
});

// Real-time подписка
function startRealtimeSubscription() {
    if (!currentUser) return;
    
    if (tasksSubscription) {
        tasksSubscription.unsubscribe();
    }
    
    tasksSubscription = window.supabaseAuth.supabase
        .channel('tasks-' + currentUser.id)
        .on('postgres_changes', 
            {
                event: '*',
                schema: 'public',
                table: 'tasks',
                filter: `user_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('Real-time update received:', payload);
                
                // Обновляем UI
                await loadTasks();
                
                // Показываем уведомление
                if (payload.eventType === 'INSERT') {
                    showToast('Новая задача добавлена', 'success');
                } else if (payload.eventType === 'UPDATE') {
                    showToast('Задача обновлена', 'info');
                } else if (payload.eventType === 'DELETE') {
                    showToast('Задача удалена', 'warning');
                }
                
                // Мигаем индикатором синхронизации
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
}

// Функции для работы с задачами
async function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
        await window.supabaseAuth.updateTask(taskId, { completed: !task.completed });
        // Обновится через real-time
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
    document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';
    document.getElementById('taskId').value = taskId;
    
    taskModal.classList.add('active');
}

async function deleteTask(taskId) {
    if (!confirm('Удалить эту задачу?')) return;
    
    try {
        await window.supabaseAuth.deleteTask(taskId);
        // Удалится через real-time
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
                .filter(tag => tag.length > 0),
            completed: false
        };
        
        if (editingTaskId) {
            await window.supabaseAuth.updateTask(editingTaskId, taskData);
        } else {
            await window.supabaseAuth.addTask(taskData);
        }
        
        taskModal.classList.remove('active');
        // Обновится через real-time
        
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
