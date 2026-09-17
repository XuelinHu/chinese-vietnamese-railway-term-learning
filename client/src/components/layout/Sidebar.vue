<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';

/**
 * 侧边栏。菜单完全由服务端下发（/api/auth/menus），前端不写死任何一项，
 * 这样在「菜单权限」里改授权后刷新即可生效。
 */
const { menuTree } = useAuth();
const { lang, tr } = useI18n();
const route = useRoute();

// 菜单名按当前语言取，缺省回退中文。
const labelOf = (menu) => menu[`name_${lang.value}`] || menu.name_zh;

const groups = computed(() => menuTree.value || []);

const isActive = (menu) =>
  route.path === menu.path || (menu.children || []).some((child) => child.path === route.path);
</script>

<template>
  <aside class="sidebar">
    <h2>{{ tr('app') }}</h2>
    <nav>
      <template v-for="menu in groups" :key="menu.id">
        <!-- 有子菜单的（管理台）渲染成分组 -->
        <template v-if="menu.children && menu.children.length">
          <div class="nav-group" :class="{ open: isActive(menu) }">
            <span class="nav-group-title">
              <span class="nav-icon">{{ menu.icon }}</span>{{ labelOf(menu) }}
            </span>
            <div class="nav-children">
              <RouterLink
                v-for="child in menu.children"
                :key="child.id"
                :to="child.path"
                class="nav-link"
                :class="{ active: route.path === child.path }"
              >
                <span class="nav-icon">{{ child.icon }}</span>{{ labelOf(child) }}
              </RouterLink>
            </div>
          </div>
        </template>

        <RouterLink v-else :to="menu.path" class="nav-link" :class="{ active: route.path === menu.path }">
          <span class="nav-icon">{{ menu.icon }}</span>{{ labelOf(menu) }}
        </RouterLink>
      </template>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  overflow-y: auto;
  max-height: 100vh;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  color: #d8e1e8;
  text-decoration: none;
  font-size: 0.94rem;
}

.nav-link:hover,
.nav-link.active {
  background: #26343d;
  color: #ffffff;
}

.nav-icon {
  flex: none;
  width: 1.2em;
  text-align: center;
}

.nav-group-title {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  color: #93a4b1;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-children {
  display: grid;
  gap: 4px;
  margin-left: 10px;
  padding-left: 10px;
  border-left: 1px solid #2c3a44;
}

@media (max-width: 900px) {
  .sidebar {
    max-height: none;
  }

  .nav-children {
    display: flex;
    overflow-x: auto;
    border-left: none;
    margin-left: 0;
    padding-left: 0;
  }

  .nav-group-title {
    display: none;
  }

  .nav-link {
    min-width: 132px;
    white-space: nowrap;
  }
}
</style>
