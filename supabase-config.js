// supabase-config.js
(function() {
    console.log('Загрузка Supabase конфигурации...');
    
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase библиотека не загружена!');
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

    // Получение списка разрешенных пространств
    async function getAllowedWorkspaces() {
        try {
            // Здесь можно заменить на загрузку из файла или базы
            // Пример списка разрешенных пространств
            const allowedWorkspaces = {
                'office-2024': 'office2024pass',
                'projects': 'projects2024',
                'team-alpha': 'alpha2024'
                // Добавьте свои пространства и пароли
            };
            return allowedWorkspaces;
        } catch (error) {
            console.error('Ошибка загрузки пространств:', error);
            return {};
        }
    }

    // Аутентификация по workspace ID и паролю
    async function loginToWorkspace(workspaceId, password) {
        try {
            console.log('Попытка входа в пространство:', workspaceId);
            
            // Загружаем список разрешенных пространств
            const allowedWorkspaces = await getAllowedWorkspaces();
            
            // Проверяем существует ли пространство
            if (!allowedWorkspaces.hasOwnProperty(workspaceId)) {
                return { 
                    success: false, 
                    error: 'Пространство не найдено или доступ запрещен' 
                };
            }
            
            // Проверяем пароль
            if (allowedWorkspaces[workspaceId] !== password) {
                return { 
                    success: false, 
                    error: 'Неверный пароль' 
                };
            }
            
            // Генерируем уникальный email для этого пользователя в пространстве
            // Можно использовать комбинацию workspace + случайный ID для уникальности
            const userHash = btoa(`${workspaceId}:${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            const email = `user_${userHash}@${workspaceId}.taskmanager.app`;
            
            console.log('Сгенерированный email:', email);
            
            // Пытаемся войти
            const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (loginError) {
                console.log('Пользователь не найден, создаем нового...');
                
                // Регистрируем нового пользователя для этого пространства
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            workspace_id: workspaceId,
                            display_name: `Пользователь ${workspaceId}`
                        }
                    }
                });

                if (signUpError) {
                    console.error('Ошибка регистрации:', signUpError);
                    return { 
                        success: false, 
                        error: 'Ошибка создания пользователя' 
                    };
                }
                
                console.log('Новый пользователь создан для пространства:', workspaceId);
                
                // Ждем и пробуем войти снова
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const { data: retryLogin, error: retryError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (retryError) {
                    return { success: false, error: retryError.message };
                }
                
                currentUser = retryLogin.user;
                currentWorkspace = workspaceId;
                return { 
                    success: true, 
                    user: retryLogin.user, 
                    workspace: workspaceId 
                };
            }
            
            console.log('Вход успешен в пространство:', workspaceId);
            currentUser = loginData.user;
            currentWorkspace = workspaceId;
            
            // Проверяем метаданные пользователя
            if (loginData.user.user_metadata?.workspace_id !== workspaceId) {
                // Обновляем метаданные если нужно
                await supabaseClient.auth.updateUser({
                    data: { workspace_id: workspaceId }
                });
            }
            
            return { 
                success: true, 
                user: loginData.user, 
                workspace: workspaceId 
            };
            
        } catch (error) {
            console.error('Ошибка входа:', error);
            return { success: false, error: error.message };
        }
    }

    // Выход из системы
    async function logout() {
        const { error } = await supabaseClient.auth.signOut();
        currentUser = null;
        currentWorkspace = null;
        return !error;
    }

    // Проверка активной сессии
    async function checkSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        
        if (data.session) {
            currentUser = data.session.user;
            currentWorkspace = currentUser.user_metadata?.workspace_id;
            
            if (currentWorkspace) {
                // Проверяем валидность workspace
                const allowedWorkspaces = await getAllowedWorkspaces();
                if (!allowedWorkspaces.hasOwnProperty(currentWorkspace)) {
                    console.log('Рабочее пространство больше не доступно');
                    await logout();
                    return { success: false };
                }
                
                return { 
                    success: true, 
                    user: currentUser, 
                    workspace: currentWorkspace 
                };
            }
        }
        return { success: false };
    }

    // Получение задач с фильтром по workspace
    async function getTasks() {
        if (!currentUser || !currentWorkspace) {
            console.log('Не авторизован для получения задач');
            return [];
        }
        
        try {
            console.log('Получение задач для пространства:', currentWorkspace);
            
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('workspace_id', currentWorkspace)
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

    // Добавление задачи с привязкой к workspace
    async function addTask(task) {
        if (!currentUser || !currentWorkspace) {
            throw new Error('Не авторизован');
        }
        
        const taskData = {
            ...task,
            user_id: currentUser.id,
            workspace_id: currentWorkspace,
            deadline: new Date(task.deadline).toISOString()
        };
        
        console.log('Добавление задачи в пространство:', currentWorkspace);
        
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

    // Обновление задачи с проверкой workspace
    async function updateTask(taskId, updates) {
        if (!currentWorkspace) throw new Error('Не авторизован');
        
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };
        
        if (updates.deadline) {
            updateData.deadline = new Date(updates.deadline).toISOString();
        }
        
        console.log('Обновление задачи в пространстве:', currentWorkspace);
        
        // Проверяем что задача принадлежит текущему workspace
        const { data: task, error: checkError } = await supabaseClient
            .from('tasks')
            .select('workspace_id')
            .eq('id', taskId)
            .single();
        
        if (checkError || task.workspace_id !== currentWorkspace) {
            throw new Error('Задача не найдена или доступ запрещен');
        }
        
        const { data, error } = await supabaseClient
            .from('tasks')
            .update(updateData)
            .eq('id', taskId)
            .select()
            .single();
        
        if (error) {
            console.error('Ошибка обновления задачи:', error);
            throw error;
        }
        
        return data;
    }

    // Удаление задачи с проверкой workspace
    async function deleteTask(taskId) {
        if (!currentWorkspace) throw new Error('Не авторизован');
        
        // Проверяем что задача принадлежит текущему workspace
        const { data: task, error: checkError } = await supabaseClient
            .from('tasks')
            .select('workspace_id')
            .eq('id', taskId)
            .single();
        
        if (checkError || task.workspace_id !== currentWorkspace) {
            throw new Error('Задача не найдена или доступ запрещен');
        }
        
        console.log('Удаление задачи из пространства:', currentWorkspace);
        
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', taskId);
        
        if (error) {
            console.error('Ошибка удаления задачи:', error);
            throw error;
        }
        
        return true;
    }

    // Подписка на обновления в реальном времени с фильтром по workspace
    function subscribeToTasks(callback) {
        if (!currentUser || !currentWorkspace) {
            console.log('Не авторизован для подписки');
            return null;
        }
        
        console.log('Подписка на обновления для пространства:', currentWorkspace);
        
        const subscription = supabaseClient
            .channel('tasks-channel')
            .on('postgres_changes', 
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `workspace_id=eq.${currentWorkspace}`
                },
                (payload) => {
                    console.log('Real-time update получен для пространства:', currentWorkspace);
                    callback(payload);
                }
            )
            .subscribe();
        
        return subscription;
    }

    // Экспорт задач
    function exportTasks(tasks) {
        const data = {
            exported_at: new Date().toISOString(),
            workspace: currentWorkspace,
            tasks: tasks
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks_${currentWorkspace}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Экспорт функций в глобальную область видимости
    window.supabaseAuth = {
        loginWithPassword: loginToWorkspace, // Переименовали для совместимости
        logout,
        getCurrentUser: () => currentUser,
        getCurrentWorkspace: () => currentWorkspace,
        getTasks,
        addTask,
        updateTask,
        deleteTask,
        subscribeToTasks,
        exportTasks,
        checkSession,
        supabase: supabaseClient
    };

    console.log('Supabase Auth инициализирован:', window.supabaseAuth);
})();
