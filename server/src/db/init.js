import bcrypt from 'bcryptjs';
import { ensureDatabase, getPool, query } from './pool.js';

const schema = [
  `CREATE TABLE IF NOT EXISTS sys_role (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name_zh VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NOT NULL,
    name_vi VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sys_user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(120) NOT NULL,
    real_name VARCHAR(80) NOT NULL,
    email VARCHAR(120),
    role_id INT NOT NULL,
    status ENUM('enabled','disabled') DEFAULT 'enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES sys_role(id)
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
    module VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    detail VARCHAR(500),
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

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

export async function initializeDatabase() {
  await ensureDatabase();
  const pool = getPool();
  for (const sql of schema) await pool.query(sql);

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
}
