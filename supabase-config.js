// supabase-config.js
(function() {
    console.log('Загрузка Supabase конфигурации...');
    
    // Проверяем, загружена ли библиотека Supabase
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase библиотека не загружена! Проверьте подключение.');
        return;
    }

    const SUPABASE_URL = 'https://qaaxrfrfybysixsmbagt.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_dNCNU3K-sNZy0UmUVRhUxA_J7qHWjw3';

    // Создаем клиент Supabase
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false  // Изменим на false для PWA
        }
    });

    let currentUser = null;

    // Аутентификация по паролю
    async function loginWithPassword(password) {
    try {
        console.log('Попытка входа с паролем:', password);
        
        // Генерируем валидный email
        // Используем хэш пароля как часть email для уникальности
        const emailHash = btoa(password).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        const email = `user_${emailHash}@taskmanager.app`;  // Используем .app домен
        
        console.log('Сгенерированный email:', email);
        
        // Пытаемся войти
        const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (loginError) {
            console.log('Пользователь не найден, создаем нового...');
            
            // Регистрируем нового пользователя
            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        display_name: `User_${password.substring(0, 10)}`
                    },
                    emailRedirectTo: window.location.origin
                }
            });

            if (signUpError) {
                console.error('Ошибка регистрации:', signUpError);
                
                // Проверяем, если это ошибка подтверждения email
                if (signUpError.message.includes('signup requires email confirmation')) {
                    console.log('Требуется подтверждение email. Пробуем войти...');
                    // Пробуем войти снова после "регистрации"
                    const { data: retryLogin, error: retryError } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password
                    });
                    
                    if (retryError) {
                        return { success: false, error: retryError.message };
                    }
                    
                    currentUser = retryLogin.user;
                    return { success: true, user: retryLogin.user };
                }
                
                return { success: false, error: signUpError.message };
            }
            
            console.log('Новый пользователь создан:', signUpData);
            
            // Если пользователь создан, но требуется подтверждение
            if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                console.log('Требуется подтверждение email. Пробуем войти...');
                
                // Ждем немного и пробуем войти
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const { data: loginAfterSignup, error: loginAfterSignupError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (loginAfterSignupError) {
                    return { 
                        success: false, 
                        error: 'Требуется подтверждение email. Проверьте почту или попробуйте другой пароль.' 
                    };
                }
                
                currentUser = loginAfterSignup.user;
                return { success: true, user: loginAfterSignup.user };
            }
            
            currentUser = signUpData.user;
            return { success: true, user: signUpData.user };
        }
        
        console.log('Вход успешен:', loginData.user.email);
        currentUser = loginData.user;
        return { success: true, user: loginData.user };
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        return { success: false, error: error.message };
    }
}

    // Выход из системы
    async function logout() {
        const { error } = await supabaseClient.auth.signOut();
        currentUser = null;
        return !error;
    }

    // Проверка активной сессии
    async function checkSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        console.log('Проверка сессии:', data);
        
        if (data.session) {
            currentUser = data.session.user;
            console.log('Пользователь найден:', currentUser.email);
            return { success: true, user: currentUser };
        }
        return { success: false };
    }

    // Получение задач
    async function getTasks() {
        if (!currentUser) {
            console.log('Не авторизован для получения задач');
            return [];
        }
        
        try {
            console.log('Получение задач для пользователя:', currentUser.id);
            
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('user_id', currentUser.id)
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
        if (!currentUser) {
            throw new Error('Не авторизован');
        }
        
        const taskData = {
            ...task,
            user_id: currentUser.id,
            deadline: new Date(task.deadline).toISOString()
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
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };
        
        if (updates.deadline) {
            updateData.deadline = new Date(updates.deadline).toISOString();
        }
        
        console.log('Обновление задачи:', taskId, updateData);
        
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

    // Удаление задачи
    async function deleteTask(taskId) {
        console.log('Удаление задачи:', taskId);
        
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

    // Подписка на обновления в реальном времени
    function subscribeToTasks(callback) {
        if (!currentUser) {
            console.log('Не авторизован для подписки');
            return null;
        }
        
        console.log('Подписка на обновления для пользователя:', currentUser.id);
        
        const subscription = supabaseClient
            .channel('tasks-channel')
            .on('postgres_changes', 
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `user_id=eq.${currentUser.id}`
                },
                (payload) => {
                    console.log('Real-time update получен:', payload);
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
            tasks: tasks
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Экспорт функций в глобальную область видимости
    window.supabaseAuth = {
        loginWithPassword,
        logout,
        getCurrentUser: () => currentUser,
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
