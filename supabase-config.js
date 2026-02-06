// supabase-config.js
(function() {
    console.log('Загрузка Supabase конфигурации...');
    
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase библиотека не загружена! Проверьте подключение.');
        return;
    }

    const SUPABASE_URL = 'https://qaaxrfrfybysixsmbagt.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_dNCNU3K-sNZy0UmUVRhUxA_J7qHWjw3';

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    });

    let currentUser = null;
    let currentWorkspace = null;

    // Функция для хэширования пароля SHA-256
    async function hashPassword(password) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error('Ошибка хэширования пароля:', error);
            throw error;
        }
    }

    // Аутентификация по логину и паролю
    async function login(username, password) {
        try {
            console.log('Попытка входа с логином:', username);
            
            const passwordHash = await hashPassword(password);
            
            const { data: userData, error: userError } = await supabaseClient
                .from('app_users')
                .select(`
                    *,
                    workspace:workspace_id(*)
                `)
                .eq('username', username)
                .eq('password_hash', passwordHash)
                .maybeSingle();

            if (userError) {
                console.error('Ошибка поиска пользователя:', userError);
                return { 
                    success: false, 
                    error: 'Ошибка сервера' 
                };
            }

            if (!userData) {
                return { 
                    success: false, 
                    error: 'Неверный логин или пароль' 
                };
            }

            if (!userData.workspace) {
                return {
                    success: false,
                    error: 'Пространство пользователя не найдено'
                };
            }

            currentUser = {
                id: userData.id,
                username: userData.username,
                workspace_id: userData.workspace_id
            };
            
            currentWorkspace = userData.workspace;

            console.log('Вход успешен:', {
                user: currentUser.username,
                workspace: currentWorkspace.name
            });

            return { 
                success: true, 
                user: currentUser,
                workspace: currentWorkspace
            };
            
        } catch (error) {
            console.error('Ошибка входа:', error);
            return { 
                success: false, 
                error: 'Ошибка сервера. Попробуйте позже.' 
            };
        }
    }

    // Проверка активной сессии
    async function checkSession() {
        try {
            const savedUser = localStorage.getItem('taskManagerUser');
            const savedWorkspace = localStorage.getItem('taskManagerWorkspace');
            
            if (savedUser && savedWorkspace) {
                currentUser = JSON.parse(savedUser);
                currentWorkspace = JSON.parse(savedWorkspace);
                
                return { 
                    success: true, 
                    user: currentUser,
                    workspace: currentWorkspace
                };
            }
            return { success: false };
        } catch (error) {
            console.error('Ошибка проверки сессии:', error);
            return { success: false };
        }
    }

    // Выход из системы
    async function logout() {
        try {
            currentUser = null;
            currentWorkspace = null;
            localStorage.removeItem('taskManagerUser');
            localStorage.removeItem('taskManagerWorkspace');
            return true;
        } catch (error) {
            console.error('Ошибка при выходе:', error);
            return false;
        }
    }

    // Получение задач для текущего workspace
    async function getTasks() {
        if (!currentUser || !currentWorkspace) {
            console.log('Не авторизован для получения задач');
            return [];
        }
        
        try {
            console.log('Получение задач для workspace:', currentWorkspace.id);
            
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('workspace_id', currentWorkspace.id)
                .order('completed', { ascending: true })
                .order('priority', { ascending: false })
                .order('deadline', { ascending: true });
            
            if (error) {
                console.error('Ошибка получения задач:', error);
                throw error;
            }
            
            console.log('Задачи получены:', data ? data.length : 0);
            return data || [];
        } catch (error) {
            console.error('Ошибка в getTasks:', error);
            return [];
        }
    }

    // Добавление задачи
    async function addTask(task) {
        if (!currentUser || !currentWorkspace) {
            throw new Error('Не авторизован');
        }
        
        const taskData = {
            title: task.title,
            description: task.description,
            priority: task.priority,
            deadline: new Date(task.deadline).toISOString(),
            tags: task.tags || [],
            workspace_id: currentWorkspace.id,
            created_by: currentUser.id
        };
        
        console.log('Добавление задачи:', taskData);
        
        const { data, error } = await supabaseClient
            .from('tasks')
            .insert([taskData])
            .select()
            .single();
        
        if (error) {
            console.error('Ошибка добавления задачи:', error);
            throw error;
        }
        
        return data;
    }

    // Обновление задачи
    async function updateTask(taskId, updates) {
        if (!currentUser || !currentWorkspace) {
            throw new Error('Не авторизован');
        }
        
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };
        
        if (updates.deadline) {
            updateData.deadline = new Date(updates.deadline).toISOString();
        }
        
        if (typeof updates.tags === 'string') {
            updateData.tags = updates.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        }
        
        console.log('Обновление задачи:', taskId, updateData);
        
        const { data, error } = await supabaseClient
            .from('tasks')
            .update(updateData)
            .eq('id', taskId)
            .eq('workspace_id', currentWorkspace.id)
            .select()
            .single();
        
        if (error) {
            console.error('Ошибка обновления задачи:', error);
            throw error;
        }
        
        return data;
    }

    // Удаление задачи
    async function deleteTask(taskId) {
        if (!currentUser || !currentWorkspace) {
            throw new Error('Не авторизован');
        }
        
        console.log('Удаление задачи:', taskId);
        
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', taskId)
            .eq('workspace_id', currentWorkspace.id);
        
        if (error) {
            console.error('Ошибка удаления задачи:', error);
            throw error;
        }
        
        return true;
    }

    // Подписка на обновления в реальном времени
    function subscribeToTasks(callback) {
        if (!currentWorkspace) {
            console.log('Не авторизован для подписки');
            return null;
        }
        
        console.log('Подписка на обновления для workspace:', currentWorkspace.id);
        
        const subscription = supabaseClient
            .channel('tasks-channel')
            .on('postgres_changes', 
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `workspace_id=eq.${currentWorkspace.id}`
                },
                (payload) => {
                    console.log('Real-time update получен:', payload);
                    if (callback) callback(payload);
                }
            )
            .subscribe((status) => {
                console.log('Статус подписки:', status);
            });
        
        return subscription;
    }

    // Экспорт задач
    function exportTasks(tasks) {
        if (!tasks || tasks.length === 0) {
            throw new Error('Нет задач для экспорта');
        }
        
        const data = {
            exported_at: new Date().toISOString(),
            workspace: currentWorkspace,
            user: currentUser,
            tasks_count: tasks.length,
            tasks: tasks.map(task => ({
                ...task,
                deadline: new Date(task.deadline).toISOString(),
                created_at: new Date(task.created_at).toISOString(),
                updated_at: new Date(task.updated_at).toISOString()
            }))
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks_${currentWorkspace.name}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Сохранение сессии в localStorage
    function saveSession(user, workspace) {
        try {
            localStorage.setItem('taskManagerUser', JSON.stringify(user));
            localStorage.setItem('taskManagerWorkspace', JSON.stringify(workspace));
            console.log('Сессия сохранена');
        } catch (error) {
            console.error('Ошибка сохранения сессии:', error);
        }
    }

    // Экспорт функций в глобальную область видимости
    window.supabaseAuth = {
        // Аутентификация
        login,
        logout,
        checkSession,
        saveSession,
        
        // Текущее состояние
        getCurrentUser: () => currentUser,
        getCurrentWorkspace: () => currentWorkspace,
        
        // Операции с задачами
        getTasks,
        addTask,
        updateTask,
        deleteTask,
        
        // Real-time и экспорт
        subscribeToTasks,
        exportTasks,
        
        // Клиент Supabase
        supabase: supabaseClient
    };

    console.log('Supabase Auth инициализирован успешно');

})();
