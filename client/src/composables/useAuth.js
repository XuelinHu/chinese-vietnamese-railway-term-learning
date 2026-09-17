import { computed, ref } from 'vue';
import { clearToken, get, getStoredUser, post, setToken } from '../api/http';

/**
 * 登录态唯一来源。
 *
 * user 从 localStorage 冷启动，登录成功后被服务端返回的完整档案覆盖；
 * 菜单权限由 /api/auth/menus 下发（后端按 role_code 关联 sys_role_menu）。
 */

const user = ref(getStoredUser());
const menuTree = ref([]);
const menuCodes = ref([]);
const menusLoaded = ref(false);

/** 供路由守卫同步读取，避免在每个守卫里 await。 */
export function currentUser() {
  return user.value;
}

export function isAuthenticated() {
  return Boolean(user.value && localStorage.getItem('token'));
}

function persist(next) {
  user.value = next;
  if (next) localStorage.setItem('user', JSON.stringify(next));
  else localStorage.removeItem('user');
}

export function useAuth() {
  const isLoggedIn = computed(() => Boolean(user.value));
  const roleCode = computed(() => user.value?.roleCode || '');
  const isAdmin = computed(() => roleCode.value === 'admin');
  const isStaff = computed(() => ['admin', 'teacher'].includes(roleCode.value));

  /**
   * 菜单级权限判断。
   * 管理台页面靠它决定是否渲染入口/是否允许直连 URL。
   */
  function can(code) {
    if (!code) return true;
    return menuCodes.value.includes(code);
  }

  async function loadMenus() {
    try {
      const data = await get('/auth/menus');
      menuTree.value = data.menus || [];
      menuCodes.value = data.codes || [];
      menusLoaded.value = true;
    } catch {
      menuTree.value = [];
      menuCodes.value = [];
    }
    return menuTree.value;
  }

  async function login(username, password) {
    const data = await post('/auth/login', { username, password });
    setToken(data.token);
    persist(data.user);
    await loadMenus();
    return data.user;
  }

  async function logout() {
    // 退出接口只写审计日志，失败不该挡住前端登出。
    try {
      await post('/auth/logout');
    } catch {
      /* 忽略 */
    }
    clearToken();
    persist(null);
    menuTree.value = [];
    menuCodes.value = [];
    menusLoaded.value = false;
  }

  /** 刷新当前用户档案，并同步到全局。 */
  async function refreshProfile() {
    const data = await get('/auth/profile');
    persist(data);
    return data;
  }

  return {
    user,
    menuTree,
    menuCodes,
    menusLoaded,
    isLoggedIn,
    roleCode,
    isAdmin,
    isStaff,
    can,
    login,
    logout,
    loadMenus,
    refreshProfile,
    setUser: persist
  };
}
