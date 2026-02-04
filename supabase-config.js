// supabase-config.js
const SUPABASE_URL = 'https://qaaxrfrfybysixsmbagt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dNCNU3K-sNZy0UmUVRhUxA_J7qHWjw3';

// Создаем клиент Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Глобальные переменные
let currentUser = null;

// Аутентификация по паролю
async function loginWithPassword(password) {
    try {
        console.log('Попытка входа с паролем:', password);
        
        // Создаем email из пароля для простоты
        const email = `${password}@taskmanager.local`;
        
        // Пытаемся войти
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (loginError) {
            console.log('Пользователь не найден, создаем нового...');
            
            // Регистрируем нового пользователя
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        display_name: `Пользователь ${password.substring(0, 8)}`
                    }
                }
            });

            if (signUpError) {
                console.error('Ошибка регистрации:', signUpError);
                return { success: false, error: signUpError.message };
            }
            
            console.log('Новый пользователь создан:', signUpData);
            currentUser = signUpData.user;
            return { success: true, user: signUpData.user };
        }
        
        console.log('Вход успешен:', loginData);
        currentUser = loginData.user;
        return { success: true, user: loginData.user };
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        return { success: false, error: error.message };
    }
}

// Выход из системы
async function logout() {
    const { error } = await supabase.auth.signOut();
    currentUser = null;
    return !error;
}

// Получение задач
async function getTasks() {
    if (!currentUser) return [];
    
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('priority', { ascending: false })
            .order('deadline', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Ошибка получения задач:', error);
        return [];
    }
}

// Добавление задачи
async function addTask(task) {
    if (!currentUser) throw new Error('Не авторизован');
    
    const taskData = {
        ...task,
        user_id: currentUser.id,
        deadline: new Date(task.deadline).toISOString()
    };
    
    const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// Обновление задачи
async function updateTask(taskId, updates) {
    const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// Удаление задачи
async function deleteTask(taskId) {
    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
    
    if (error) throw error;
    return true;
}

// Подписка на обновления в реальном времени
function subscribeToTasks(callback) {
    if (!currentUser) return null;
    
    const subscription = supabase
        .channel('tasks-channel')
        .on('postgres_changes', 
            {
                event: '*',
                schema: 'public',
                table: 'tasks',
                filter: `user_id=eq.${currentUser.id}`
            },
            (payload) => {
                console.log('Real-time update:', payload);
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

// Проверка активной сессии
async function checkSession() {
    const { data, error } = await supabase.auth.getSession();
    if (data.session) {
        currentUser = data.session.user;
        return { success: true, user: data.session.user };
    }
    return { success: false };
}

// Экспорт функций
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
    supabase
};

console.log('Supabase config loaded');
