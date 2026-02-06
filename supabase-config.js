// supabase-config.js
(function() {
    console.log('Загрузка Supabase конфигурации...');
    
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase библиотека не загружена! Проверьте подключение.');
        return;
    }

    const SUPABASE_URL = 'https://qaaxrfrfybysixsmbagt.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_dNCNU3K-sNZy0UmUVRhUxA_J7qHWjw3'; // Ваш ANON ключ

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    });

    let currentUser = null;
    let currentWorkspace = null;

    // Хэширование пароля
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

    // Аутентификация
    async function login(username, password) {
        try {
            console.log('Попытка входа:', username);
            
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

            if (userError || !userData) {
                return { 
                    success: false, 
                    error: 'Неверный логин или пароль' 
                };
            }

            currentUser = {
                id: userData.id,
                username: userData.username,
                workspace_id: userData.workspace_id,
                is_admin: userData.is_admin || false
            };
            
            currentWorkspace = userData.workspace;

            return { 
                success: true, 
                user: currentUser,
                workspace: currentWorkspace
            };
            
        } catch (error) {
            console.error('Ошибка входа:', error);
            return { 
                success: false, 
                error: 'Ошибка сервера' 
            };
        }
    }

    // Проверка сессии
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

    // Добавить функцию для админа: создание пользователей
    async function adminCreateUser(username, password, workspaceId) {
        if (!currentUser || !currentUser.is_admin) {
            throw new Error('Требуются права администратора');
        }

        try {
            const passwordHash = await hashPassword(password);
            
            const { data, error } = await supabaseClient
                .from('app_users')
                .insert([{
                    username: username,
                    password_hash: passwordHash,
                    workspace_id: workspaceId
                }])
                .select()
                .single();
            
            if (error) throw error;
            return { success: true, user: data };
            
        } catch (error) {
            console.error('Ошибка создания пользователя:', error);
            return { success: false, error: error.message };
        }
    }

    // Сохранение сессии
    function saveSession(user, workspace) {
        localStorage.setItem('taskManagerUser', JSON.stringify(user));
        localStorage.setItem('taskManagerWorkspace', JSON.stringify(workspace));
    }

    // Экспорт функций
    window.supabaseAuth = {
        login,
        logout: async () => {
            currentUser = null;
            currentWorkspace = null;
            localStorage.removeItem('taskManagerUser');
            localStorage.removeItem('taskManagerWorkspace');
            return true;
        },
        checkSession,
        saveSession,
        getCurrentUser: () => currentUser,
        getCurrentWorkspace: () => currentWorkspace,
        adminCreateUser, // Только для админа
        supabase: supabaseClient
    };

})();
