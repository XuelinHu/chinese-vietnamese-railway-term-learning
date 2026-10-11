import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated, useAuth } from '../composables/useAuth';

/**
 * 路由表。
 *
 * meta.public  = 无需登录
 * meta.menu    = 需要的菜单编码（与 sys_menu.code 一致），由 /api/auth/menus 下发
 * meta.titleKey = locales/messages.js 里的词条键，供侧边栏与页面标题使用
 *
 * 组件一律懒加载：13 个管理台页面没必要进首屏包。
 */
const routes = [
  { path: '/', redirect: '/dashboard' },

  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/Login.vue'),
    meta: { public: true, titleKey: 'login' }
  },
  {
    path: '/oidc/callback',
    name: 'oidc-callback',
    component: () => import('../views/auth/OidcCallback.vue'),
    meta: { public: true, titleKey: 'login' }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/auth/Register.vue'),
    meta: { public: true, titleKey: 'register' }
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('../views/auth/ForgotPassword.vue'),
    meta: { public: true, titleKey: 'forgotPassword' }
  },

  // ---- 登录后的主壳 ----
  {
    path: '/',
    component: () => import('../layouts/AppLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { menu: 'dashboard', titleKey: 'dashboard' }
      },
      {
        path: 'terms',
        name: 'terms',
        component: () => import('../views/Terms.vue'),
        meta: { menu: 'terms', titleKey: 'terms' }
      },
      {
        path: 'practice',
        name: 'practice',
        component: () => import('../views/Practice.vue'),
        meta: { menu: 'practice', titleKey: 'practice' }
      },
      {
        path: 'analysis',
        name: 'analysis',
        component: () => import('../views/Analysis.vue'),
        meta: { menu: 'analysis', titleKey: 'analysis' }
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('../views/Profile.vue'),
        meta: { menu: 'profile', titleKey: 'profile' }
      },

      // ---- 管理台 ----
      {
        path: 'admin/dashboard',
        name: 'admin-dashboard',
        component: () => import('../views/admin/AdminDashboard.vue'),
        meta: { menu: 'admin.dashboard', titleKey: 'adminDashboard' }
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('../views/admin/Users.vue'),
        meta: { menu: 'admin.users', titleKey: 'users' }
      },
      {
        path: 'admin/roles',
        name: 'admin-roles',
        component: () => import('../views/admin/Roles.vue'),
        meta: { menu: 'admin.roles', titleKey: 'roles' }
      },
      {
        path: 'admin/menus',
        name: 'admin-menus',
        component: () => import('../views/admin/Menus.vue'),
        meta: { menu: 'admin.menus', titleKey: 'menuPermissions' }
      },
      {
        path: 'admin/categories',
        name: 'admin-categories',
        component: () => import('../views/admin/Categories.vue'),
        meta: { menu: 'admin.categories', titleKey: 'categories' }
      },
      {
        path: 'admin/terms',
        name: 'admin-terms',
        component: () => import('../views/admin/TermsAdmin.vue'),
        meta: { menu: 'admin.terms', titleKey: 'termManagement' }
      },
      {
        path: 'admin/practice-records',
        name: 'admin-practice-records',
        component: () => import('../views/admin/PracticeRecords.vue'),
        meta: { menu: 'admin.practice-records', titleKey: 'practiceRecords' }
      },
      {
        path: 'admin/wrong-questions',
        name: 'admin-wrong-questions',
        component: () => import('../views/admin/WrongQuestions.vue'),
        meta: { menu: 'admin.wrong-questions', titleKey: 'wrongQuestions' }
      },
      {
        path: 'admin/favorites',
        name: 'admin-favorites',
        component: () => import('../views/admin/Favorites.vue'),
        meta: { menu: 'admin.favorites', titleKey: 'favorites' }
      },
      {
        path: 'admin/login-logs',
        name: 'admin-login-logs',
        component: () => import('../views/admin/LoginLogs.vue'),
        meta: { menu: 'admin.login-logs', titleKey: 'loginLogs' }
      },
      {
        path: 'admin/operation-logs',
        name: 'admin-operation-logs',
        component: () => import('../views/admin/OperationLogs.vue'),
        meta: { menu: 'admin.operation-logs', titleKey: 'operationLogs' }
      },
      {
        path: 'admin/agent-sessions',
        name: 'admin-agent-sessions',
        component: () => import('../views/admin/AgentSessions.vue'),
        meta: { menu: 'admin.agent-sessions', titleKey: 'agentSessions' }
      },
      {
        path: 'admin/models',
        name: 'admin-models',
        component: () => import('../views/admin/Models.vue'),
        meta: { menu: 'admin.models', titleKey: 'modelManagement' }
      }
    ]
  },

  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const { loadMenus, can, menusLoaded } = useAuth();

  if (to.meta.public) {
    // 已登录还去登录页就直接送回首页，避免重复登录。
    if (isAuthenticated() && to.name === 'login') return { path: '/dashboard' };
    return true;
  }

  if (!isAuthenticated()) {
    return { path: '/login', query: to.fullPath === '/dashboard' ? {} : { redirect: to.fullPath } };
  }

  // 菜单权限是路由级兜底：直接敲 URL 也进不去没授权的菜单。
  if (!menusLoaded.value) await loadMenus();

  if (to.meta.menu && !can(to.meta.menu)) {
    return { path: '/dashboard' };
  }

  return true;
});

export default router;
