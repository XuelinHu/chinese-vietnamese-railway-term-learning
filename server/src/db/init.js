import bcrypt from 'bcryptjs';
import { ensureDatabase, getPool, query } from './pool.js';

const schema = [
  `CREATE TABLE IF NOT EXISTS sys_role (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name_zh VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NOT NULL,
    name_vi VARCHAR(80) NOT NULL,
    remark VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(120) NOT NULL,
    real_name VARCHAR(80) NOT NULL,
    email VARCHAR(120),
    phone VARCHAR(30),
    avatar VARCHAR(255),
    remark VARCHAR(255),
    last_login_at TIMESTAMP NULL,
    role_id INT NOT NULL,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES sys_role(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_menu (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT DEFAULT 0,
    code VARCHAR(60) NOT NULL UNIQUE,
    path VARCHAR(120) NOT NULL,
    icon VARCHAR(40),
    name_zh VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NOT NULL,
    name_vi VARCHAR(80) NOT NULL,
    sort_order INT DEFAULT 0,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_role_menu (
    role_id INT NOT NULL,
    menu_id INT NOT NULL,
    PRIMARY KEY (role_id, menu_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_password_reset (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(120),
    code_hash VARCHAR(120) NOT NULL,
    attempts INT DEFAULT 0,
    used TINYINT(1) DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username_created (username, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_login_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip VARCHAR(80),
    user_agent VARCHAR(255),
    success TINYINT(1) NOT NULL,
    message VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_operation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    username VARCHAR(50),
    module VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    detail VARCHAR(500),
    ip VARCHAR(80),
    method VARCHAR(10),
    path VARCHAR(160),
    status INT,
    duration_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS term_category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_zh VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    name_vi VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS railway_term (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    term_zh VARCHAR(160) NOT NULL,
    term_en VARCHAR(160) NOT NULL,
    term_vi VARCHAR(160) NOT NULL,
    pinyin VARCHAR(200),
    difficulty ENUM('easy','medium','hard') DEFAULT 'easy',
    definition_zh TEXT,
    definition_en TEXT,
    definition_vi TEXT,
    example_zh TEXT,
    example_en TEXT,
    example_vi TEXT,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES term_category(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS practice_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    practice_type VARCHAR(40) NOT NULL,
    category_id INT,
    difficulty VARCHAR(20),
    total_count INT NOT NULL,
    correct_count INT NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    duration_seconds INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS practice_answer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id BIGINT NOT NULL,
    term_id INT NOT NULL,
    question_type VARCHAR(40) NOT NULL,
    question_text VARCHAR(255) NOT NULL,
    user_answer VARCHAR(255),
    correct_answer VARCHAR(255) NOT NULL,
    is_correct TINYINT(1) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES practice_record(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wrong_question (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    term_id INT NOT NULL,
    wrong_count INT DEFAULT 1,
    last_wrong_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_term (user_id, term_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS favorite_term (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    term_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_fav (user_id, term_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS agent_model (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    label VARCHAR(120) NOT NULL,
    family VARCHAR(60),
    param_size VARCHAR(20),
    tier ENUM('light','recommended','advanced','too_large') DEFAULT 'recommended',
    description_zh VARCHAR(255),
    is_default TINYINT(1) DEFAULT 0,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    pulled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS agent_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    model VARCHAR(120),
    message_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_updated (user_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS agent_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    role ENUM('user','assistant','system') NOT NULL,
    content TEXT,
    model VARCHAR(120),
    tokens INT DEFAULT 0,
    duration_ms INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_created (session_id, created_at),
    FOREIGN KEY (session_id) REFERENCES agent_session(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

// 已有库需要补列：init.js 的 CREATE TABLE IF NOT EXISTS 对已存在的表不生效，
// 而 MySQL 8.4 没有 ADD COLUMN IF NOT EXISTS，所以走 information_schema 探测。
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,63}$/;

async function ensureColumn(table, column, ddl) {
  // 标识符无法用占位符绑定，只能拼接 —— 因此必须白名单校验，否则是注入面。
  // query() 走的是 pool.execute() 预编译，容易给人虚假的安全感，但 DDL 段并未参数化。
  if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) {
    throw new Error(`Unsafe identifier in ensureColumn: ${table}.${column}`);
  }
  const rows = await query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column }
  );
  if (rows[0].count === 0) {
    // ALGORITHM=INSTANT 避免重建表；列名/表名已校验，ddl 是代码内常量
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}, ALGORITHM=INSTANT`);
    console.log(`[db] added column ${table}.${column}`);
  }
}

async function migrateColumns() {
  await ensureColumn('sys_user', 'phone', 'phone VARCHAR(30) NULL');
  await ensureColumn('sys_user', 'avatar', 'avatar VARCHAR(255) NULL');
  await ensureColumn('sys_user', 'remark', 'remark VARCHAR(255) NULL');
  await ensureColumn('sys_user', 'last_login_at', 'last_login_at TIMESTAMP NULL');
  await ensureColumn('sys_role', 'remark', 'remark VARCHAR(255) NULL');
  await ensureColumn('sys_operation_log', 'username', 'username VARCHAR(50) NULL');
  await ensureColumn('sys_operation_log', 'ip', 'ip VARCHAR(80) NULL');
  await ensureColumn('sys_operation_log', 'method', 'method VARCHAR(10) NULL');
  await ensureColumn('sys_operation_log', 'path', 'path VARCHAR(160) NULL');
  await ensureColumn('sys_operation_log', 'status', 'status INT NULL');
  await ensureColumn('sys_operation_log', 'duration_ms', 'duration_ms INT NULL');
}

const categories = [
  ['铁路基础设施', 'Railway Infrastructure', 'Cơ sở hạ tầng đường sắt', 1],
  ['轨道工程', 'Track Engineering', 'Kỹ thuật đường ray', 2],
  ['机车车辆', 'Rolling Stock', 'Đầu máy toa xe', 3],
  ['信号与通信', 'Signaling and Communication', 'Tín hiệu và thông tin', 4],
  ['调度指挥', 'Dispatching Command', 'Điều độ chỉ huy', 5]
];

const terms = [
  [1, '铁路', 'railway', 'đường sắt', 'tie lu', 'easy', '供列车运行的交通系统。', 'A transport system for train operation.', 'Hệ thống giao thông dành cho tàu chạy.', '铁路连接城市与港口。', 'The railway connects cities and ports.', 'Đường sắt kết nối thành phố và cảng.'],
  [1, '车站', 'station', 'nhà ga', 'che zhan', 'easy', '办理旅客乘降或货物作业的地点。', 'A place for passenger boarding or freight operations.', 'Nơi phục vụ hành khách lên xuống hoặc xếp dỡ hàng hóa.', '列车将在下一车站停车。', 'The train will stop at the next station.', 'Tàu sẽ dừng ở nhà ga tiếp theo.'],
  [2, '钢轨', 'rail', 'ray thép', 'gang gui', 'medium', '承受车轮荷载并引导车辆运行的轨道部件。', 'A track component that bears wheel loads and guides vehicles.', 'Bộ phận đường ray chịu tải bánh xe và dẫn hướng phương tiện.', '钢轨需要定期检查。', 'Rails require regular inspection.', 'Ray thép cần được kiểm tra định kỳ.'],
  [2, '道岔', 'turnout', 'ghi đường sắt', 'dao cha', 'hard', '使列车从一股轨道转入另一股轨道的设备。', 'Equipment that allows trains to move from one track to another.', 'Thiết bị cho phép tàu chuyển từ đường ray này sang đường ray khác.', '道岔状态影响行车安全。', 'Turnout status affects operation safety.', 'Trạng thái ghi ảnh hưởng đến an toàn chạy tàu.'],
  [3, '机车', 'locomotive', 'đầu máy', 'ji che', 'medium', '提供牵引动力的铁路车辆。', 'A railway vehicle that provides traction power.', 'Phương tiện đường sắt cung cấp lực kéo.', '电力机车适合高速牵引。', 'Electric locomotives suit high-speed traction.', 'Đầu máy điện phù hợp với kéo tàu tốc độ cao.'],
  [3, '客车', 'passenger coach', 'toa khách', 'ke che', 'easy', '用于运送旅客的铁路车辆。', 'A railway vehicle used to carry passengers.', 'Toa xe đường sắt dùng để chở hành khách.', '客车内部配有座椅。', 'Passenger coaches are equipped with seats.', 'Toa khách được trang bị ghế ngồi.'],
  [4, '信号机', 'signal', 'tín hiệu đường sắt', 'xin hao ji', 'medium', '向司机显示行车条件的信号设备。', 'A device that displays movement authority to drivers.', 'Thiết bị hiển thị điều kiện chạy tàu cho lái tàu.', '司机必须确认信号机显示。', 'Drivers must confirm the signal aspect.', 'Lái tàu phải xác nhận hiển thị tín hiệu.'],
  [4, '闭塞', 'block system', 'hệ thống đóng đường', 'bi se', 'hard', '保证区间内列车安全间隔的行车制度。', 'An operating system that ensures safe train separation.', 'Chế độ vận hành bảo đảm khoảng cách an toàn giữa các tàu.', '自动闭塞提高线路通过能力。', 'Automatic block systems improve line capacity.', 'Đóng đường tự động nâng cao năng lực thông qua tuyến.'],
  [5, '调度命令', 'dispatching order', 'mệnh lệnh điều độ', 'diao du ming ling', 'hard', '调度员发布的行车组织指令。', 'An operation instruction issued by a dispatcher.', 'Chỉ lệnh tổ chức chạy tàu do điều độ viên ban hành.', '调度命令必须准确传达。', 'Dispatching orders must be communicated accurately.', 'Mệnh lệnh điều độ phải được truyền đạt chính xác.'],
  [5, '列车运行图', 'train diagram', 'biểu đồ chạy tàu', 'lie che yun xing tu', 'hard', '规定列车运行时间和顺序的技术文件。', 'A technical document defining train times and sequence.', 'Tài liệu kỹ thuật quy định thời gian và thứ tự chạy tàu.', '运行图是调度工作的基础。', 'The train diagram is the basis of dispatching.', 'Biểu đồ chạy tàu là cơ sở của công tác điều độ.']
];

// 菜单树。code 是权限判定的稳定键，前端路由与之一一对应。
// parent 为 null 的是顶级菜单，其余挂在 'admin' 下。
const menus = [
  { code: 'dashboard', path: '/dashboard', icon: '📊', sort: 10, parent: null, zh: '学习看板', en: 'Dashboard', vi: 'Bảng học tập' },
  { code: 'terms', path: '/terms', icon: '📚', sort: 20, parent: null, zh: '术语库', en: 'Terms', vi: 'Thuật ngữ' },
  { code: 'practice', path: '/practice', icon: '✍️', sort: 30, parent: null, zh: '练习平台', en: 'Practice', vi: 'Luyện tập' },
  { code: 'analysis', path: '/analysis', icon: '📈', sort: 40, parent: null, zh: '学习分析', en: 'Analytics', vi: 'Phân tích' },
  { code: 'profile', path: '/profile', icon: '👤', sort: 50, parent: null, zh: '个人中心', en: 'Profile', vi: 'Cá nhân' },

  { code: 'admin', path: '/admin', icon: '⚙️', sort: 900, parent: null, zh: '管理台', en: 'Admin', vi: 'Quản trị' },
  { code: 'admin.dashboard', path: '/admin/dashboard', icon: '🧭', sort: 901, parent: 'admin', zh: '数据看板', en: 'Admin Dashboard', vi: 'Bảng quản trị' },
  { code: 'admin.users', path: '/admin/users', icon: '👥', sort: 902, parent: 'admin', zh: '用户管理', en: 'Users', vi: 'Người dùng' },
  { code: 'admin.roles', path: '/admin/roles', icon: '🛡️', sort: 903, parent: 'admin', zh: '角色管理', en: 'Roles', vi: 'Vai trò' },
  { code: 'admin.menus', path: '/admin/menus', icon: '🧩', sort: 904, parent: 'admin', zh: '菜单权限', en: 'Menu Permissions', vi: 'Quyền menu' },
  { code: 'admin.categories', path: '/admin/categories', icon: '🗂️', sort: 905, parent: 'admin', zh: '分类管理', en: 'Categories', vi: 'Danh mục' },
  { code: 'admin.terms', path: '/admin/terms', icon: '📝', sort: 906, parent: 'admin', zh: '术语管理', en: 'Term Management', vi: 'Quản lý thuật ngữ' },
  { code: 'admin.practice-records', path: '/admin/practice-records', icon: '📋', sort: 907, parent: 'admin', zh: '练习记录', en: 'Practice Records', vi: 'Lịch sử luyện tập' },
  { code: 'admin.wrong-questions', path: '/admin/wrong-questions', icon: '❌', sort: 908, parent: 'admin', zh: '错题本', en: 'Wrong Questions', vi: 'Câu sai' },
  { code: 'admin.favorites', path: '/admin/favorites', icon: '⭐', sort: 909, parent: 'admin', zh: '收藏夹', en: 'Favorites', vi: 'Yêu thích' },
  { code: 'admin.login-logs', path: '/admin/login-logs', icon: '🔑', sort: 910, parent: 'admin', zh: '登录日志', en: 'Login Logs', vi: 'Nhật ký đăng nhập' },
  { code: 'admin.operation-logs', path: '/admin/operation-logs', icon: '📜', sort: 911, parent: 'admin', zh: '操作日志', en: 'Operation Logs', vi: 'Nhật ký thao tác' },
  { code: 'admin.agent-sessions', path: '/admin/agent-sessions', icon: '💬', sort: 912, parent: 'admin', zh: '智能体会话', en: 'AI Sessions', vi: 'Phiên hội thoại AI' },
  { code: 'admin.models', path: '/admin/models', icon: '🤖', sort: 913, parent: 'admin', zh: '模型管理', en: 'Model Management', vi: 'Quản lý mô hình' }
];

const teacherDenied = new Set(['admin.users', 'admin.roles', 'admin.menus', 'admin.agent-sessions', 'admin.models']);
const studentAllowed = new Set(['dashboard', 'terms', 'practice', 'analysis', 'profile']);

// 模型目录。tag 均已联网核实存在于 ollama.com/library。
// tier 按本机 24G 显存分档：advanced 档 q4 约占 20GB，可用但吃紧；too_large 仅作展示并标注不可用。
const modelCatalog = [
  { name: 'qwen3:8b', label: 'Qwen3 8B', family: 'qwen3', param: '8B', tier: 'light', zh: '通义千问3，中文能力强，响应快' },
  { name: 'qwen2.5:7b', label: 'Qwen2.5 7B', family: 'qwen2.5', param: '7B', tier: 'light', zh: '通义千问2.5，稳定通用' },
  { name: 'deepseek-r1:7b', label: 'DeepSeek-R1 7B', family: 'deepseek-r1', param: '7B', tier: 'light', zh: '深度求索推理模型，轻量版' },
  { name: 'deepseek-r1:8b', label: 'DeepSeek-R1 8B', family: 'deepseek-r1', param: '8B', tier: 'light', zh: '深度求索推理模型，Llama 蒸馏版' },
  { name: 'internlm2:7b', label: 'InternLM2 7B', family: 'internlm2', param: '7B', tier: 'light', zh: '上海AI实验室书生·浦语2' },

  { name: 'qwen3:14b', label: 'Qwen3 14B', family: 'qwen3', param: '14B', tier: 'recommended', zh: '通义千问3，中文与多轮对话均衡（本机已装）' },
  { name: 'qwen2.5:14b', label: 'Qwen2.5 14B', family: 'qwen2.5', param: '14B', tier: 'recommended', zh: '通义千问2.5，14B 通用档' },
  { name: 'deepseek-r1:14b', label: 'DeepSeek-R1 14B', family: 'deepseek-r1', param: '14B', tier: 'recommended', zh: '深度求索推理模型，14B 蒸馏版' },
  { name: 'glm4:9b', label: 'GLM-4 9B', family: 'glm4', param: '9B', tier: 'recommended', zh: '智谱清言 GLM-4，中文对话流畅' },
  { name: 'yi:9b', label: 'Yi 9B', family: 'yi', param: '9B', tier: 'recommended', zh: '零一万物 Yi，中英双语' },

  { name: 'qwen3:32b', label: 'Qwen3 32B', family: 'qwen3', param: '32B', tier: 'advanced', zh: '通义千问3，能力更强但显存吃紧' },
  { name: 'qwen2.5:32b', label: 'Qwen2.5 32B', family: 'qwen2.5', param: '32B', tier: 'advanced', zh: '通义千问2.5，32B 档' },
  { name: 'deepseek-r1:32b', label: 'DeepSeek-R1 32B', family: 'deepseek-r1', param: '32B', tier: 'advanced', zh: '深度求索推理模型，32B 蒸馏版' },

  { name: 'deepseek-r1:70b', label: 'DeepSeek-R1 70B', family: 'deepseek-r1', param: '70B', tier: 'too_large', zh: '超出 24G 显存，需更大显卡' },
  { name: 'yi:34b', label: 'Yi 34B', family: 'yi', param: '34B', tier: 'too_large', zh: '超出 24G 显存，需更大显卡' }
];

async function seedMenus() {
  const count = await query('SELECT COUNT(*) AS count FROM sys_menu');
  if (count[0].count === 0) {
    const idByCode = {};
    for (const m of menus.filter((x) => !x.parent)) {
      const r = await query(
        `INSERT INTO sys_menu (parent_id, code, path, icon, name_zh, name_en, name_vi, sort_order)
         VALUES (0, :code, :path, :icon, :zh, :en, :vi, :sort)`,
        { code: m.code, path: m.path, icon: m.icon, zh: m.zh, en: m.en, vi: m.vi, sort: m.sort }
      );
      idByCode[m.code] = r.insertId;
    }
    for (const m of menus.filter((x) => x.parent)) {
      const r = await query(
        `INSERT INTO sys_menu (parent_id, code, path, icon, name_zh, name_en, name_vi, sort_order)
         VALUES (:parentId, :code, :path, :icon, :zh, :en, :vi, :sort)`,
        { parentId: idByCode[m.parent], code: m.code, path: m.path, icon: m.icon, zh: m.zh, en: m.en, vi: m.vi, sort: m.sort }
      );
      idByCode[m.code] = r.insertId;
    }
    console.log(`[db] seeded ${Object.keys(idByCode).length} menus`);
  }

  const grantCount = await query('SELECT COUNT(*) AS count FROM sys_role_menu');
  if (grantCount[0].count === 0) {
    const rows = await query('SELECT id, code FROM sys_menu');
    const idByCode = Object.fromEntries(rows.map((r) => [r.code, r.id]));
    const roles = await query('SELECT id, code FROM sys_role');
    for (const role of roles) {
      let codes;
      if (role.code === 'admin') codes = menus.map((m) => m.code);
      else if (role.code === 'teacher') codes = menus.map((m) => m.code).filter((c) => !teacherDenied.has(c));
      else codes = [...studentAllowed];
      for (const code of codes) {
        if (idByCode[code]) {
          await query('INSERT IGNORE INTO sys_role_menu (role_id, menu_id) VALUES (:roleId, :menuId)', {
            roleId: role.id, menuId: idByCode[code]
          });
        }
      }
    }
    console.log('[db] seeded role-menu grants');
  }
}

async function seedModelCatalog() {
  const count = await query('SELECT COUNT(*) AS count FROM agent_model');
  if (count[0].count > 0) return;
  for (const m of modelCatalog) {
    await query(
      `INSERT INTO agent_model (name, label, family, param_size, tier, description_zh, is_default)
       VALUES (:name, :label, :family, :param, :tier, :zh, :isDefault)`,
      { ...m, isDefault: m.name === 'qwen3:14b' ? 1 : 0 }
    );
  }
  console.log(`[db] seeded ${modelCatalog.length} model catalog entries`);
}

export async function initializeDatabase() {
  await ensureDatabase();
  const pool = getPool();
  for (const sql of schema) await pool.query(sql);

  // 老库补齐新列必须在种子数据之前，否则后续 INSERT 会因缺列失败
  await migrateColumns();

  const roleCount = await query('SELECT COUNT(*) AS count FROM sys_role');
  if (roleCount[0].count === 0) {
    await query(`INSERT INTO sys_role (code, name_zh, name_en, name_vi) VALUES
      ('admin','系统管理员','Administrator','Quản trị viên'),
      ('teacher','教师','Teacher','Giáo viên'),
      ('student','学生','Student','Sinh viên')`);
  }

  const userCount = await query('SELECT COUNT(*) AS count FROM sys_user');
  if (userCount[0].count === 0) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const teacherHash = await bcrypt.hash('teacher123', 10);
    const studentHash = await bcrypt.hash('student123', 10);
    await query(`INSERT INTO sys_user (username, password_hash, real_name, email, role_id) VALUES
      ('admin', :adminHash, '系统管理员', 'admin@example.com', 1),
      ('teacher', :teacherHash, '术语教师', 'teacher@example.com', 2),
      ('student', :studentHash, '越南留学生', 'student@example.com', 3)`, { adminHash, teacherHash, studentHash });
  }

  const categoryCount = await query('SELECT COUNT(*) AS count FROM term_category');
  if (categoryCount[0].count === 0) {
    for (const item of categories) {
      await query('INSERT INTO term_category (name_zh, name_en, name_vi, sort_order) VALUES (:zh, :en, :vi, :sort)', {
        zh: item[0], en: item[1], vi: item[2], sort: item[3]
      });
    }
  }

  const termCount = await query('SELECT COUNT(*) AS count FROM railway_term');
  if (termCount[0].count === 0) {
    for (const t of terms) {
      await query(`INSERT INTO railway_term
        (category_id, term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi, created_by)
        VALUES (:categoryId, :zh, :en, :vi, :pinyin, :difficulty, :defZh, :defEn, :defVi, :exZh, :exEn, :exVi, 1)`, {
        categoryId: t[0], zh: t[1], en: t[2], vi: t[3], pinyin: t[4], difficulty: t[5],
        defZh: t[6], defEn: t[7], defVi: t[8], exZh: t[9], exEn: t[10], exVi: t[11]
      });
    }
  }

  await seedMenus();
  await seedModelCatalog();
}
