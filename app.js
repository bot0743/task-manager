// Глобальные переменные
let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
let currentWorkspace = null;
let autoSaveTimeout = null;

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
const syncBtn = document.getElementById('syncBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importBtn2 = document.getElementById('importBtn2');
const importFile = document.getElementById('importFile');
const importModal = document.getElementById('importModal');
const exportModal = document.getElementById('exportModal');
const qrcodeModal = document.getElementById('qrcodeModal');
const importFileInput = document.getElementById('importFileInput');
const startImportBtn = document.getElementById('startImportBtn');
const startExportBtn = document.getElementById('startExportBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const downloadQRBtn = document.getElementById('downloadQRBtn');
const filters = document.querySelectorAll('.filter-btn');
const toast = document.getElementById('toast');
const currentUserBadge = document.getElementById('currentUserBadge');
const addFirstTaskBtn = document.getElementById('addFirstTaskBtn');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const syncStatus = document.getElementById('syncStatus');
const syncStatusText = document.getElementById('syncStatusText');

// Константы
const STORAGE_PREFIX = 'taskManager_';
const BACKUP_INTERVAL = 300000; // 5 минут

// Получение ключа хранилища для текущего рабочего пространства
function getStorageKey(workspace) {
    return `${STORAGE_PREFIX}${workspace}`;
}

// Генерация ID задачи
function generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Сохранение задач в localStorage
function saveTasksToStorage() {
    if (!currentWorkspace) return;
    
    try {
        const storageKey = getStorageKey(currentWorkspace);
        const data = {
            tasks: tasks,
            lastUpdated: new Date().toISOString(),
            workspace: currentWorkspace
        };
        
        localStorage.setItem(storageKey, JSON.stringify(data));
        
        // Показываем статус сохранения
        showSyncStatus('Сохранено', 'success');
        
        // Создаем резервную копию
        createBackup();
        
        return true;
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showSyncStatus('Ошибка сохранения', 'error');
        return false;
    }
}

// Загрузка задач из localStorage
function loadTasksFromStorage() {
    if (!currentWorkspace) return [];
    
    try {
        const storageKey = getStorageKey(currentWorkspace);
        const savedData = localStorage.getItem(storageKey);
        
        if (savedData) {
            const data = JSON.parse(savedData);
            tasks = data.tasks || [];
            
            // Восстанавливаем даты из строк
            tasks.forEach(task => {
                if (task.deadline) task.deadline = new Date(task.deadline);
                if (task.createdAt) task.createdAt = new Date(task.createdAt);
            });
            
            console.log(`Загружено ${tasks.length} задач из рабочего пространства "${currentWorkspace}"`);
            return tasks;
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showToast('Ошибка загрузки задач', 'error');
    }
    
    return [];
}

// Создание резервной копии
function createBackup() {
    if (!currentWorkspace) return;
    
    try {
        const backupKey = `${STORAGE_PREFIX}backup_${currentWorkspace}_${Date.now()}`;
        const storageKey = getStorageKey(currentWorkspace);
        const data = localStorage.getItem(storageKey);
        
        if (data) {
            // Сохраняем последние 5 резервных копий
            const backups = Object.keys(localStorage)
                .filter(key => key.startsWith(`${STORAGE_PREFIX}backup_${currentWorkspace}_`))
                .sort()
                .reverse()
                .slice(0, 4); // Оставляем 4 предыдущие
            
            // Удаляем старые резервные копии
            Object.keys(localStorage)
                .filter(key => key.startsWith(`${STORAGE_PREFIX}backup_${currentWorkspace}_`))
                .filter(key => !backups.includes(key))
                .forEach(key => localStorage.removeItem(key));
            
            localStorage.setItem(backupKey, data);
        }
    } catch (error) {
        console.error('Ошибка создания резервной копии:', error);
    }
}

// Авторизация
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const workspaceName = accessKeyInput.value.trim();
    const loginBtn = document.getElementById('loginBtn');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    
    if (workspaceName.length < 3) {
        showToast('Название должно быть не менее 3 символов', 'error');
        return;
    }
    
    // Показываем индикатор загрузки
    loginText.style.display = 'none';
    loginSpinner.style.display = 'inline-block';
    
    // Имитация загрузки
    setTimeout(() => {
        currentWorkspace = workspaceName;
        
        // Сохраняем в sessionStorage
        sessionStorage.setItem('taskManagerWorkspace', currentWorkspace);
        
        // Обновляем бейдж пользователя
        currentUserBadge.textContent = currentWorkspace;
        
        // Переходим в приложение
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        
        // Загружаем задачи
        loadTasks();
        
        // Скрываем индикатор
        loginText.style.display = 'inline';
        loginSpinner.style.display = 'none';
        
        showToast(`Рабочее пространство "${currentWorkspace}" загружено`, 'success');
        
        // Запускаем автосохранение
        startAutoSave();
    }, 500);
});

// Проверка авторизации при загрузке
window.addEventListener('load', () => {
    const savedWorkspace = sessionStorage.getItem('taskManagerWorkspace');
    
    if (savedWorkspace) {
        currentWorkspace = savedWorkspace;
        currentUserBadge.textContent = currentWorkspace;
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        loadTasks();
        startAutoSave();
    } else {
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// Выход из системы
logoutBtn.addEventListener('click', () => {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    currentWorkspace = null;
    sessionStorage.removeItem('taskManagerWorkspace');
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
    accessKeyInput.value = '';
    tasks = [];
    showToast('Вы вышли из системы', 'info');
});

// Загрузка задач
function loadTasks() {
    tasks = loadTasksFromStorage();
    sortTasks();
    renderTasks();
    updateStats();
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
        
        // Добавляем обработчик для кнопки "Создать задачу"
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
        
        return;
    }
    
    // Создаем элементы задач
    filteredTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        taskList.appendChild(taskElement);
    });
    
    updateStats();
}

// Обновление статистики
function updateStats() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const pendingTasks = totalTasks - completedTasks;
    const overdueTasks = tasks.filter(t => 
        !t.completed && new Date(t.deadline) < new Date()
    ).length;
    
    // Обновляем заголовок
    const appTitle = document.querySelector('.app-title');
    if (appTitle) {
        appTitle.innerHTML = `Task Manager <span class="task-counter">${totalTasks}</span>`;
    }
}

// Создание элемента задачи
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.priority}`;
    div.dataset.id = task.id;
    
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
    
    completeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskComplete(task.id);
    });
    
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTask(task.id);
    });
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task.id);
    });
    
    // Клик по задаче для быстрого завершения
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.task-actions')) {
            toggleTaskComplete(task.id);
        }
    });
    
    return div;
}

// Переключение статуса задачи
function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    
    // Сортируем и рендерим
    sortTasks();
    renderTasks();
    
    // Сохраняем
    saveTasksToStorage();
    
    showToast(task.completed ? 'Задача завершена' : 'Задача возобновлена', 'success');
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
    document.getElementById('taskId').value = taskId;
    
    // Открываем модальное окно
    taskModal.classList.add('active');
}

// Удаление задачи
function deleteTask(taskId) {
    if (!confirm('Удалить эту задачу?')) return;
    
    tasks = tasks.filter(task => task.id !== taskId);
    
    // Сортируем и рендерим
    sortTasks();
    renderTasks();
    
    // Сохраняем
    saveTasksToStorage();
    
    showToast('Задача удалена', 'success');
}

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
    document.getElementById('taskDeadline').value = getDefaultDeadline();
    taskModal.classList.add('active');
});

addFirstTaskBtn.addEventListener('click', () => {
    editingTaskId = null;
    modalTitle.textContent = 'Новая задача';
    taskForm.reset();
    document.getElementById('taskDeadline').value = getDefaultDeadline();
    taskModal.classList.add('active');
});

// Закрытие модальных окон
closeModalBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
});

cancelTaskBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
});

taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        taskModal.classList.remove('active');
    }
});

// Сохранение задачи
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if (editingTaskId) {
        // Обновляем задачу
        const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
        if (taskIndex !== -1) {
            taskData.id = editingTaskId;
            taskData.createdAt = tasks[taskIndex].createdAt;
            tasks[taskIndex] = taskData;
        }
        showToast('Задача обновлена', 'success');
    } else {
        // Создаем новую задачу
        taskData.id = generateTaskId();
        tasks.push(taskData);
        showToast('Задача создана', 'success');
    }
    
    // Сортируем и рендерим
    sortTasks();
    renderTasks();
    
    // Сохраняем
    saveTasksToStorage();
    
    // Закрываем модальное окно
    taskModal.classList.remove('active');
});

// Экспорт задач
exportBtn.addEventListener('click', () => {
    exportModal.classList.add('active');
});

document.getElementById('closeExportModalBtn').addEventListener('click', () => {
    exportModal.classList.remove('active');
});

exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) {
        exportModal.classList.remove('active');
    }
});

startExportBtn.addEventListener('click', () => {
    exportTasks();
});

// Импорт задач
importBtn.addEventListener('click', () => {
    importFile.click();
});

importBtn2.addEventListener('click', () => {
    importModal.classList.add('active');
});

document.getElementById('closeImportModalBtn').addEventListener('click', () => {
    importModal.classList.remove('active');
});

importModal.addEventListener('click', (e) => {
    if (e.target === importModal) {
        importModal.classList.remove('active');
    }
});

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        previewImport(file);
    }
});

// Синхронизация через QR-код
syncBtn.addEventListener('click', () => {
    showQRCode();
});

document.getElementById('closeQRCodeModalBtn').addEventListener('click', () => {
    qrcodeModal.classList.remove('active');
});

qrcodeModal.addEventListener('click', (e) => {
    if (e.target === qrcodeModal) {
        qrcodeModal.classList.remove('active');
    }
});

copyLinkBtn.addEventListener('click', () => {
    const exportData = getExportData('all', 'json');
    const dataStr = JSON.stringify(exportData);
    const url = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
    
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка скопирована', 'success');
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showToast('Ошибка копирования', 'error');
    });
});

downloadQRBtn.addEventListener('click', () => {
    const canvas = document.querySelector('#qrcode canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `tasks_${currentWorkspace}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('QR-код сохранен', 'success');
    }
});

// Вспомогательные функции
function getPriorityText(priority) {
    const texts = {
        high: 'Высокий',
        medium: 'Средний',
        low: 'Низкий'
    };
    return texts[priority] || priority;
}

function getDefaultDeadline() {
    const now = new Date();
    now.setHours(now.getHours() + 24); // Завтра в это же время
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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

function showSyncStatus(message, type = 'info') {
    syncStatusText.textContent = message;
    syncStatus.className = 'sync-status';
    
    // Добавляем цвет в зависимости от типа
    if (type === 'success') {
        syncStatus.style.background = 'var(--success)';
    } else if (type === 'error') {
        syncStatus.style.background = 'var(--danger)';
    } else if (type === 'info') {
        syncStatus.style.background = 'var(--primary)';
    }
    
    syncStatus.style.display = 'block';
    
    setTimeout(() => {
        syncStatus.style.display = 'none';
    }, 2000);
}

// Экспорт данных
function getExportData(scope = 'all', format = 'json') {
    let exportTasks = [];
    
    switch (scope) {
        case 'pending':
            exportTasks = tasks.filter(task => !task.completed);
            break;
        case 'completed':
            exportTasks = tasks.filter(task => task.completed);
            break;
        default:
            exportTasks = tasks;
    }
    
    const data = {
        workspace: currentWorkspace,
        exportedAt: new Date().toISOString(),
        tasks: exportTasks.map(task => ({
            ...task,
            deadline: task.deadline instanceof Date ? task.deadline.toISOString() : task.deadline,
            createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
            updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt
        })),
        stats: {
            total: exportTasks.length,
            completed: exportTasks.filter(t => t.completed).length,
            pending: exportTasks.filter(t => !t.completed).length
        }
    };
    
    return data;
}

function exportTasks() {
    const fileName = document.getElementById('exportFileName').value || 'tasks_export';
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    
    const data = getExportData(scope, format);
    
    let content, mimeType, fileExtension;
    
    if (format === 'csv') {
        // Конвертация в CSV
        const headers = ['Название', 'Описание', 'Приоритет', 'Дедлайн', 'Теги', 'Статус'];
        const rows = data.tasks.map(task => [
            `"${task.title.replace(/"/g, '""')}"`,
            `"${(task.description || '').replace(/"/g, '""')}"`,
            task.priority,
            new Date(task.deadline).toLocaleString('ru-RU'),
            `"${task.tags.join(', ')}"`,
            task.completed ? 'Завершена' : 'Активна'
        ]);
        
        content = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        mimeType = 'text/csv';
        fileExtension = 'csv';
    } else {
        // JSON формат
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
    }
    
    // Создаем и скачиваем файл
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    exportModal.classList.remove('active');
    showToast('Экспорт завершен', 'success');
}

// Предпросмотр импорта
function previewImport(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const preview = document.getElementById('importPreviewContent');
            
            if (!data.tasks || !Array.isArray(data.tasks)) {
                throw new Error('Некорректный формат файла');
            }
            
            let previewHtml = `
                <p><strong>Рабочее пространство:</strong> ${data.workspace || 'Не указано'}</p>
                <p><strong>Количество задач:</strong> ${data.tasks.length}</p>
                <p><strong>Дата экспорта:</strong> ${new Date(data.exportedAt || Date.now()).toLocaleString('ru-RU')}</p>
                <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
            `;
            
            data.tasks.slice(0, 5).forEach((task, index) => {
                previewHtml += `
                    <div class="import-preview-item ${task.priority}">
                        <strong>${index + 1}. ${task.title}</strong>
                        <div style="font-size: 12px; color: var(--gray-600);">
                            Приоритет: ${getPriorityText(task.priority)} | 
                            Дедлайн: ${new Date(task.deadline).toLocaleString('ru-RU')} |
                            Статус: ${task.completed ? 'Завершена' : 'Активна'}
                        </div>
                    </div>
                `;
            });
            
            if (data.tasks.length > 5) {
                previewHtml += `<p style="text-align: center; color: var(--gray-500);">... и еще ${data.tasks.length - 5} задач</p>`;
            }
            
            previewHtml += '</div>';
            preview.innerHTML = previewHtml;
            
            document.getElementById('importPreview').style.display = 'block';
            startImportBtn.disabled = false;
            
            // Сохраняем данные для импорта
            window.importData = data;
        } catch (error) {
            console.error('Ошибка чтения файла:', error);
            showToast('Ошибка чтения файла. Убедитесь, что файл в формате JSON', 'error');
            startImportBtn.disabled = true;
        }
    };
    
    reader.readAsText(file);
}

// Импорт задач
startImportBtn.addEventListener('click', () => {
    if (!window.importData || !window.importData.tasks) {
        showToast('Нет данных для импорта', 'error');
        return;
    }
    
    const importMode = document.querySelector('input[name="importMode"]:checked').value;
    const importTasks = window.importData.tasks;
    
    let importedCount = 0;
    let updatedCount = 0;
    
    switch (importMode) {
        case 'replace':
            // Заменяем все задачи
            tasks = importTasks.map(task => ({
                ...task,
                id: task.id || generateTaskId(),
                deadline: new Date(task.deadline),
                createdAt: new Date(task.createdAt || Date.now()),
                updatedAt: new Date(task.updatedAt || Date.now())
            }));
            importedCount = tasks.length;
            break;
            
        case 'merge':
            // Объединяем с текущими
            const existingIds = new Set(tasks.map(t => t.id));
            
            importTasks.forEach(importTask => {
                if (!existingIds.has(importTask.id)) {
                    tasks.push({
                        ...importTask,
                        id: importTask.id || generateTaskId(),
                        deadline: new Date(importTask.deadline),
                        createdAt: new Date(importTask.createdAt || Date.now()),
                        updatedAt: new Date(importTask.updatedAt || Date.now())
                    });
                    importedCount++;
                }
            });
            break;
            
        case 'update':
            // Обновляем существующие и добавляем новые
            const taskMap = new Map(tasks.map(t => [t.id, t]));
            
            importTasks.forEach(importTask => {
                const existingTask = taskMap.get(importTask.id);
                if (existingTask) {
                    // Обновляем существующую задачу
                    Object.assign(existingTask, {
                        ...importTask,
                        deadline: new Date(importTask.deadline),
                        updatedAt: new Date()
                    });
                    updatedCount++;
                } else {
                    // Добавляем новую задачу
                    tasks.push({
                        ...importTask,
                        id: importTask.id || generateTaskId(),
                        deadline: new Date(importTask.deadline),
                        createdAt: new Date(importTask.createdAt || Date.now()),
                        updatedAt: new Date(importTask.updatedAt || Date.now())
                    });
                    importedCount++;
                }
            });
            break;
    }
    
    // Сортируем и рендерим
    sortTasks();
    renderTasks();
    
    // Сохраняем
    saveTasksToStorage();
    
    // Закрываем модальное окно
    importModal.classList.remove('active');
    
    // Показываем результат
    let message = 'Импорт завершен. ';
    if (importedCount > 0) message += `Добавлено задач: ${importedCount}. `;
    if (updatedCount > 0) message += `Обновлено задач: ${updatedCount}.`;
    showToast(message, 'success');
});

// Показ QR-кода
function showQRCode() {
    const exportData = getExportData('all', 'json');
    const dataStr = JSON.stringify(exportData);
    const qrcodeDiv = document.getElementById('qrcode');
    
    // Очищаем предыдущий QR-код
    qrcodeDiv.innerHTML = '';
    
    // Генерируем QR-код
    QRCode.toCanvas(qrcodeDiv, dataStr, {
        width: 256,
        height: 256,
        margin: 1,
        color: {
            dark: '#1F2937',
            light: '#FFFFFF'
        }
    }, function(error) {
        if (error) {
            console.error('Ошибка генерации QR-кода:', error);
            showToast('Ошибка генерации QR-кода', 'error');
            return;
        }
        
        // Показываем модальное окно
        qrcodeModal.classList.add('active');
    });
}

// Автосохранение
function startAutoSave() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    autoSaveTimeout = setTimeout(() => {
        if (tasks.length > 0) {
            saveTasksToStorage();
        }
        startAutoSave();
    }, BACKUP_INTERVAL);
}

// Обработка drag & drop для импорта
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.json')) {
            previewImport(file);
            importModal.classList.add('active');
        } else {
            showToast('Поддерживаются только JSON файлы', 'error');
        }
    }
});

// Горячие клавиши
document.addEventListener('keydown', (e) => {
    // Ctrl+S или Cmd+S - сохранение
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveTasksToStorage();
        showToast('Сохранено', 'success');
    }
    
    // Esc - закрытие модальных окон
    if (e.key === 'Escape') {
        taskModal.classList.remove('active');
        importModal.classList.remove('active');
        exportModal.classList.remove('active');
        qrcodeModal.classList.remove('active');
    }
    
    // + - создание новой задачи
    if (e.key === '+' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addTaskBtn.click();
    }
});

// Инициализация
console.log('Task Manager Pro загружен');
