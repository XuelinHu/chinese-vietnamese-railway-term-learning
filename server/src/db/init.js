import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { applyMigrations } from './migrations.js';
import { getPool, query, withTransaction } from './pool.js';
import { shouldSeedDemoUsers } from './seed-policy.js';

const categories = [
  ['铁路基础设施', 'Railway Infrastructure', 'Cơ sở hạ tầng đường sắt'],
  ['轨道工程', 'Track Engineering', 'Kỹ thuật đường ray'],
  ['机车车辆', 'Rolling Stock', 'Đầu máy toa xe'],
  ['信号与通信', 'Signaling and Communication', 'Tín hiệu và thông tin'],
  ['调度指挥', 'Dispatching Command', 'Điều độ chỉ huy']
];

const terms = [
  [0, '铁路', 'railway', 'đường sắt', 'tie lu', 'easy', '供列车运行的交通系统。', 'A transport system for train operation.', 'Hệ thống giao thông dành cho tàu chạy.', '铁路连接城市与港口。', 'The railway connects cities and ports.', 'Đường sắt kết nối thành phố và cảng.'],
  [0, '车站', 'station', 'nhà ga', 'che zhan', 'easy', '办理旅客乘降或货物作业的地点。', 'A place for passenger boarding or freight operations.', 'Nơi phục vụ hành khách lên xuống hoặc xếp dỡ hàng hóa.', '列车将在下一车站停车。', 'The train will stop at the next station.', 'Tàu sẽ dừng ở nhà ga tiếp theo.'],
  [1, '钢轨', 'rail', 'ray thép', 'gang gui', 'medium', '承受车轮荷载并引导车辆运行的轨道部件。', 'A track component that bears wheel loads and guides vehicles.', 'Bộ phận đường ray chịu tải bánh xe và dẫn hướng phương tiện.', '钢轨需要定期检查。', 'Rails require regular inspection.', 'Ray thép cần được kiểm tra định kỳ.'],
  [1, '道岔', 'turnout', 'ghi đường sắt', 'dao cha', 'hard', '使列车从一股轨道转入另一股轨道的设备。', 'Equipment that allows trains to move from one track to another.', 'Thiết bị cho phép tàu chuyển từ đường ray này sang đường ray khác.', '道岔状态影响行车安全。', 'Turnout status affects operation safety.', 'Trạng thái ghi ảnh hưởng đến an toàn chạy tàu.'],
  [2, '机车', 'locomotive', 'đầu máy', 'ji che', 'medium', '提供牵引动力的铁路车辆。', 'A railway vehicle that provides traction power.', 'Phương tiện đường sắt cung cấp lực kéo.', '电力机车适合高速牵引。', 'Electric locomotives suit high-speed traction.', 'Đầu máy điện phù hợp với kéo tàu tốc độ cao.'],
  [2, '客车', 'passenger coach', 'toa khách', 'ke che', 'easy', '用于运送旅客的铁路车辆。', 'A railway vehicle used to carry passengers.', 'Toa xe đường sắt dùng để chở hành khách.', '客车内部配有座椅。', 'Passenger coaches are equipped with seats.', 'Toa khách được trang bị ghế ngồi.'],
  [3, '信号机', 'signal', 'tín hiệu đường sắt', 'xin hao ji', 'medium', '向司机显示行车条件的信号设备。', 'A device that displays movement authority to drivers.', 'Thiết bị hiển thị điều kiện chạy tàu cho lái tàu.', '司机必须确认信号机显示。', 'Drivers must confirm the signal aspect.', 'Lái tàu phải xác nhận hiển thị tín hiệu.'],
  [3, '闭塞', 'block system', 'hệ thống đóng đường', 'bi se', 'hard', '保证区间内列车安全间隔的行车制度。', 'An operating system that ensures safe train separation.', 'Chế độ vận hành bảo đảm khoảng cách an toàn giữa các tàu.', '自动闭塞提高线路通过能力。', 'Automatic block systems improve line capacity.', 'Đóng đường tự động nâng cao năng lực thông qua tuyến.'],
  [4, '调度命令', 'dispatching order', 'mệnh lệnh điều độ', 'diao du ming ling', 'hard', '调度员发布的行车组织指令。', 'An operation instruction issued by a dispatcher.', 'Chỉ lệnh tổ chức chạy tàu do điều độ viên ban hành.', '调度命令必须准确传达。', 'Dispatching orders must be communicated accurately.', 'Mệnh lệnh điều độ phải được truyền đạt chính xác.'],
  [4, '列车运行图', 'train diagram', 'biểu đồ chạy tàu', 'lie che yun xing tu', 'hard', '规定列车运行时间和顺序的技术文件。', 'A technical document defining train times and sequence.', 'Tài liệu kỹ thuật quy định thời gian và thứ tự chạy tàu.', '运行图是调度工作的基础。', 'The train diagram is the basis of dispatching.', 'Biểu đồ chạy tàu là cơ sở của công tác điều độ.']
];

const menus = [
  ['dashboard', '/dashboard', '📊', 10, null, '学习看板', 'Dashboard', 'Bảng học tập'],
  ['terms', '/terms', '📚', 20, null, '术语库', 'Terms', 'Thuật ngữ'],
  ['practice', '/practice', '✍️', 30, null, '练习平台', 'Practice', 'Luyện tập'],
  ['analysis', '/analysis', '📈', 40, null, '学习分析', 'Analytics', 'Phân tích'],
  ['profile', '/profile', '👤', 50, null, '个人中心', 'Profile', 'Cá nhân'],
  ['admin', '/admin', '⚙️', 900, null, '管理台', 'Admin', 'Quản trị'],
  ['admin.dashboard', '/admin/dashboard', '🧭', 901, 'admin', '数据看板', 'Admin Dashboard', 'Bảng quản trị'],
  ['admin.users', '/admin/users', '👥', 902, 'admin', '用户管理', 'Users', 'Người dùng'],
  ['admin.roles', '/admin/roles', '🛡️', 903, 'admin', '角色管理', 'Roles', 'Vai trò'],
  ['admin.menus', '/admin/menus', '🧩', 904, 'admin', '菜单权限', 'Menu Permissions', 'Quyền menu'],
  ['admin.categories', '/admin/categories', '🗂️', 905, 'admin', '分类管理', 'Categories', 'Danh mục'],
  ['admin.terms', '/admin/terms', '📝', 906, 'admin', '术语管理', 'Term Management', 'Quản lý thuật ngữ'],
  ['admin.practice-records', '/admin/practice-records', '📋', 907, 'admin', '练习记录', 'Practice Records', 'Lịch sử luyện tập'],
  ['admin.wrong-questions', '/admin/wrong-questions', '❌', 908, 'admin', '错题本', 'Wrong Questions', 'Câu sai'],
  ['admin.favorites', '/admin/favorites', '⭐', 909, 'admin', '收藏夹', 'Favorites', 'Yêu thích'],
  ['admin.login-logs', '/admin/login-logs', '🔑', 910, 'admin', '登录日志', 'Login Logs', 'Nhật ký đăng nhập'],
  ['admin.operation-logs', '/admin/operation-logs', '📜', 911, 'admin', '操作日志', 'Operation Logs', 'Nhật ký thao tác'],
  ['admin.agent-sessions', '/admin/agent-sessions', '💬', 912, 'admin', '智能体会话', 'AI Sessions', 'Phiên hội thoại AI'],
  ['admin.models', '/admin/models', '🤖', 913, 'admin', '模型管理', 'Model Management', 'Quản lý mô hình']
];

const models = [
  ['qwen3:8b', 'Qwen3 8B', 'qwen3', '8B', 'light', '通义千问3，中文能力强，响应快'],
  ['qwen2.5:7b', 'Qwen2.5 7B', 'qwen2.5', '7B', 'light', '通义千问2.5，稳定通用'],
  ['deepseek-r1:7b', 'DeepSeek-R1 7B', 'deepseek-r1', '7B', 'light', '深度求索推理模型，轻量版'],
  ['deepseek-r1:8b', 'DeepSeek-R1 8B', 'deepseek-r1', '8B', 'light', '深度求索推理模型，Llama 蒸馏版'],
  ['internlm2:7b', 'InternLM2 7B', 'internlm2', '7B', 'light', '上海AI实验室书生·浦语2'],
  ['qwen3:14b', 'Qwen3 14B', 'qwen3', '14B', 'recommended', '通义千问3，中文与多轮对话均衡（本机已装）'],
  ['qwen2.5:14b', 'Qwen2.5 14B', 'qwen2.5', '14B', 'recommended', '通义千问2.5，14B 通用档'],
  ['deepseek-r1:14b', 'DeepSeek-R1 14B', 'deepseek-r1', '14B', 'recommended', '深度求索推理模型，14B 蒸馏版'],
  ['glm4:9b', 'GLM-4 9B', 'glm4', '9B', 'recommended', '智谱清言 GLM-4，中文对话流畅'],
  ['yi:9b', 'Yi 9B', 'yi', '9B', 'recommended', '零一万物 Yi，中英双语'],
  ['qwen3:32b', 'Qwen3 32B', 'qwen3', '32B', 'advanced', '通义千问3，能力更强但显存吃紧'],
  ['qwen2.5:32b', 'Qwen2.5 32B', 'qwen2.5', '32B', 'advanced', '通义千问2.5，32B 档'],
  ['deepseek-r1:32b', 'DeepSeek-R1 32B', 'deepseek-r1', '32B', 'advanced', '深度求索推理模型，32B 蒸馏版'],
  ['deepseek-r1:70b', 'DeepSeek-R1 70B', 'deepseek-r1', '70B', 'too_large', '超出 24G 显存，需更大显卡'],
  ['yi:34b', 'Yi 34B', 'yi', '34B', 'too_large', '超出 24G 显存，需更大显卡']
];

const teacherDenied = new Set(['admin.users', 'admin.roles', 'admin.menus', 'admin.agent-sessions', 'admin.models']);
const studentAllowed = new Set(['dashboard', 'terms', 'practice', 'analysis', 'profile']);

async function seedRoles(run) {
  for (const [code, name_zh, name_en, name_vi] of [
    ['admin', '系统管理员', 'Administrator', 'Quản trị viên'],
    ['teacher', '教师', 'Teacher', 'Giáo viên'],
    ['student', '学生', 'Student', 'Sinh viên']
  ]) {
    await run('INSERT INTO sys_role (code, name_zh, name_en, name_vi) VALUES (:code, :name_zh, :name_en, :name_vi) ON CONFLICT (code) DO NOTHING', { code, name_zh, name_en, name_vi });
  }
}

async function seedUsers(run, enabled) {
  if (!enabled) return;
  const count = await run('SELECT COUNT(*) AS count FROM sys_user');
  if (Number(count[0].count) !== 0) return;
  const roles = await run('SELECT id, code FROM sys_role');
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  for (const [username, password, realName, email, role] of [
    ['admin', 'admin123', '系统管理员', 'admin@example.com', 'admin'],
    ['teacher', 'teacher123', '术语教师', 'teacher@example.com', 'teacher'],
    ['student', 'student123', '越南留学生', 'student@example.com', 'student']
  ]) {
    await run(
      'INSERT INTO sys_user (username, password_hash, real_name, email, role_id) VALUES (:username, :hash, :realName, :email, :roleId) ON CONFLICT (username) DO NOTHING',
      { username, hash: await bcrypt.hash(password, 10), realName, email, roleId: roleIds[role] }
    );
  }
}

async function seedCategories(run) {
  for (const [index, [name_zh, name_en, name_vi]] of categories.entries()) {
    await run(
      'INSERT INTO term_category (name_zh, name_en, name_vi, sort_order) VALUES (:name_zh, :name_en, :name_vi, :sort_order) ON CONFLICT (name_zh) DO NOTHING',
      { name_zh, name_en, name_vi, sort_order: index + 1 }
    );
  }
  const rows = await run('SELECT id, name_zh FROM term_category');
  return Object.fromEntries(rows.map((row) => [row.name_zh, row.id]));
}

async function seedTerms(run, categoryIds) {
  for (const [categoryIndex, term_zh, term_en, term_vi, pinyin, difficulty,
    definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi] of terms) {
    const name_zh = categories[categoryIndex][0];
    await run(
      `INSERT INTO railway_term
       (category_id, term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi, created_by)
       VALUES (:categoryId, :term_zh, :term_en, :term_vi, :pinyin, :difficulty, :definition_zh, :definition_en, :definition_vi, :example_zh, :example_en, :example_vi, 1)
       ON CONFLICT (term_zh) DO NOTHING`,
      { categoryId: categoryIds[name_zh], term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi }
    );
  }
}

async function seedMenus(run) {
  const roleRows = await run('SELECT id, code FROM sys_role');
  const roles = Object.fromEntries(roleRows.map((row) => [row.code, row.id]));
  const menuIds = {};
  for (const [code, path, icon, sort, parent, name_zh, name_en, name_vi] of menus) {
    const parentId = parent ? menuIds[parent] : 0;
    await run(
      `INSERT INTO sys_menu (parent_id, code, path, icon, name_zh, name_en, name_vi, sort_order)
       VALUES (:parentId, :code, :path, :icon, :name_zh, :name_en, :name_vi, :sort_order)
       ON CONFLICT (code) DO NOTHING`,
      { parentId, code, path, icon, name_zh, name_en, name_vi, sort_order: sort }
    );
    const rows = await run('SELECT id FROM sys_menu WHERE code = :code', { code });
    menuIds[code] = rows[0].id;
  }
  for (const [roleCode, roleId] of Object.entries(roles)) {
    const allowed = roleCode === 'admin'
      ? menus.map(([code]) => code)
      : roleCode === 'teacher'
        ? menus.map(([code]) => code).filter((code) => !teacherDenied.has(code))
        : [...studentAllowed];
    for (const code of allowed) {
      await run('INSERT INTO sys_role_menu (role_id, menu_id) VALUES (:roleId, :menuId) ON CONFLICT DO NOTHING', {
        roleId, menuId: menuIds[code]
      });
    }
  }
}

async function seedModels(run) {
  for (const [name, label, family, param_size, tier, description_zh] of models) {
    await run(
      `INSERT INTO agent_model (name, label, family, param_size, tier, description_zh, is_default)
       VALUES (:name, :label, :family, :param_size, :tier, :description_zh, :is_default)
       ON CONFLICT (name) DO NOTHING`,
      { name, label, family, param_size, tier, description_zh, is_default: name === 'qwen3:14b' ? 1 : 0 }
    );
  }
}

export async function initializeDatabase({
  seedDemoUsers = shouldSeedDemoUsers(env.isProduction, env.db.database, process.env.ALLOW_DEMO_SEED)
} = {}) {
  await applyMigrations({ pool: getPool(), database: env.db.database });
  await withTransaction(async (run) => {
    await seedRoles(run);
    await seedUsers(run, seedDemoUsers);
    const categoryIds = await seedCategories(run);
    await seedTerms(run, categoryIds);
    await seedMenus(run);
    await seedModels(run);
  });
}

export { closePool } from './pool.js';
