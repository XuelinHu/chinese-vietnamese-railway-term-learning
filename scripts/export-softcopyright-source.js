import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const root = process.cwd();
const title = '面向越南留学生的铁道专业汉越术语翻译学习软件 V1.0';
const baseName = '面向越南留学生的铁道专业汉越术语翻译学习软件源代码';
const outDir = path.join(root, 'docs/softcopyright');
const mdPath = path.join(outDir, `${baseName}.md`);
const htmlPath = path.join(outDir, `${baseName}.html`);
const pdfPath = path.join(outDir, `${baseName}.pdf`);
const exportDir = '/home/xuelin/softcopyright-source-export';
const exportHtmlPath = path.join(exportDir, 'index.html');
const tempPdfPath = '/home/xuelin/software-source-document.tmp.pdf';

const backendFiles = [
  'server/package.json',
  'server/.env.example',
  'server/src/config/env.js',
  'server/src/db/pool.js',
  'server/src/db/init.js',
  'server/src/db/schema.sql',
  'server/src/middleware/auth.js',
  'server/src/utils/asyncHandler.js',
  'server/src/utils/pagination.js',
  'server/src/routes/auth.js',
  'server/src/routes/terms.js',
  'server/src/routes/practice.js',
  'server/src/routes/analysis.js',
  'server/src/routes/system.js',
  'server/src/index.js',
  'server/scripts/seed-test-data.js',
  'server/scripts/smoke-test.js'
];

const frontendFiles = [
  'client/package.json',
  'client/vite.config.js',
  'client/index.html',
  'client/src/main.js',
  'client/src/api/http.js',
  'client/src/locales/messages.js',
  'client/src/App.vue',
  'client/src/assets/styles.css'
];

const configFiles = [
  'package.json'
];

const descriptions = {
  'package.json': ['项目工作区配置', '定义前端、后端工作区及统一启动、构建脚本。', '工程配置'],
  'client/package.json': ['前端依赖配置', '定义 H5 前端 Vue3、Vite 构建和开发脚本。', '前端工程'],
  'client/vite.config.js': ['前端开发服务配置', '配置 Vite 插件、端口和接口代理。', '前端工程'],
  'client/index.html': ['前端入口模板', '定义 H5 应用挂载节点和页面标题。', '前端入口'],
  'client/src/main.js': ['前端启动入口', '创建 Vue 应用并挂载根组件。', '前端入口'],
  'client/src/api/http.js': ['接口请求封装', '封装请求、访问凭证保存和清理逻辑。', '前端接口'],
  'client/src/locales/messages.js': ['三语言资源', '维护中文、英文、越南语界面文案。', '国际化模块'],
  'client/src/App.vue': ['前端主页面组件', '实现登录、导航、术语管理、练习、分析和系统管理页面逻辑。', '前端业务页面'],
  'client/src/assets/styles.css': ['前端样式文件', '实现 H5 竖屏和后台横屏响应式布局。', '前端样式'],
  'server/package.json': ['后端依赖配置', '定义 Express、MySQL、JWT、测试脚本和造数脚本依赖。', '后端工程'],
  'server/.env.example': ['后端环境变量样例', '展示服务端口、数据库和鉴权配置项，源码稿中已脱敏。', '后端配置'],
  'server/src/config/env.js': ['环境配置读取', '读取服务端口、数据库和鉴权相关环境变量。', '后端配置'],
  'server/src/db/pool.js': ['数据库连接池', '创建数据库、初始化连接池并提供查询函数。', '数据访问层'],
  'server/src/db/init.js': ['数据库初始化', '创建核心业务表并写入基础角色、账号、分类和术语数据。', '数据初始化'],
  'server/src/db/schema.sql': ['数据库结构脚本', '以 SQL 形式列出后台 MySQL 核心表结构，便于部署和审阅数据层设计。', '数据访问层'],
  'server/src/middleware/auth.js': ['鉴权中间件', '解析访问凭证、加载用户角色并限制角色权限。', '安全权限'],
  'server/src/utils/asyncHandler.js': ['异步处理工具', '统一包装异步路由并传递异常。', '后端工具'],
  'server/src/utils/pagination.js': ['分页工具', '解析分页参数并生成统一分页返回结构。', '后端工具'],
  'server/src/routes/auth.js': ['认证路由', '实现登录、个人信息、修改密码和退出接口。', '认证模块'],
  'server/src/routes/terms.js': ['术语路由', '实现分类、术语查询、新增、编辑、删除和收藏接口。', '术语管理模块'],
  'server/src/routes/practice.js': ['练习路由', '实现练习出题、提交判分、练习记录和错题查询接口。', '练习模块'],
  'server/src/routes/analysis.js': ['分析路由', '实现学生端和管理端学习数据分析接口。', '数据分析模块'],
  'server/src/routes/system.js': ['系统管理路由', '实现用户、角色、登录日志和操作日志接口。', '系统管理模块'],
  'server/src/index.js': ['后端启动入口', '组装中间件、业务路由、健康检查和数据库初始化。', '后端入口'],
  'server/scripts/seed-test-data.js': ['测试数据脚本', '生成不少于一百条的业务测试数据。', '测试与运维'],
  'server/scripts/smoke-test.js': ['接口冒烟测试', '验证认证、分页、术语、练习、分析和系统管理接口。', '测试与运维']
};

function sanitize(content) {
  return content
    .replace(/Java@c1024/g, '***')
    .replace(/127\.0\.0\.1/g, '***')
    .replace(/192\.168\.[^\s`'"]+/g, '***')
    .replace(/172\.[^\s`'"]+/g, '***')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***@***')
    .replace(/JWT_SECRET=.*/g, 'JWT_SECRET=***')
    .replace(/railway_term_learning_secret/g, '***');
}

function fenceFor(file) {
  if (file.endsWith('.vue')) return 'vue';
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.html')) return 'html';
  if (file.endsWith('.json')) return 'json';
  if (file.endsWith('.env.example')) return 'env';
  if (file.endsWith('.sql')) return 'sql';
  return 'js';
}

function buildMarkdown() {
  const lines = [];
  const pushListItem = (text) => {
    lines.push(text);
    lines.push('');
  };
  lines.push(`# ${baseName}`);
  lines.push('');
  lines.push('## 一、源代码属性结构说明');
  lines.push('');
  pushListItem(`1. 软件名称：${title}`);
  pushListItem('2. 项目技术栈：H5、Vue3、Vite、Node.js、Express、MySQL、JavaScript、HTML、CSS。');
  pushListItem('3. 源码根目录：当前项目根目录，源码稿仅列出相对路径，不包含真实服务器路径。');
  pushListItem('4. 一级目录划分：server 为 Node.js 后台源码，是本源码稿重点；client 为 H5 前端源码；根目录配置用于统一工作区管理。');
  pushListItem('5. 二级目录划分：server/src 存放后台配置、数据库、鉴权中间件、路由和工具；server/scripts 存放测试数据和接口测试脚本；client/src 存放页面、接口、国际化和样式。');
  pushListItem('6. 三级目录划分：server/src/routes、server/src/db、server/src/middleware、server/src/utils 是后台核心目录；client/src/api、client/src/locales、client/src/assets 是前端支撑目录。');
  pushListItem('7. 选入范围说明：本文优先列出后台服务端源码，包括数据库初始化、鉴权、分页、认证、术语、练习、分析、系统管理和测试脚本；随后列出前端 H5 页面与接口代码；排除第三方依赖、构建产物、截图、PDF、锁文件和二进制资源。');
  pushListItem('8. 脱敏说明：源码稿中的数据库地址、密码、密钥、邮箱和网络地址已替换为 *** 或等价占位符，脱敏不影响代码结构和模块关系理解。');
  lines.push('## 二、三级目录结构树');
  lines.push('');
  lines.push('```text');
  lines.push('项目根目录');
  lines.push('  server');
  lines.push('    src');
  lines.push('      config');
  lines.push('      db');
  lines.push('      middleware');
  lines.push('      routes');
  lines.push('      utils');
  lines.push('      index.js');
  lines.push('    scripts');
  lines.push('      seed-test-data.js');
  lines.push('      smoke-test.js');
  lines.push('    package.json');
  lines.push('    .env.example');
  lines.push('  client');
  lines.push('    src');
  lines.push('      api');
  lines.push('      locales');
  lines.push('      assets');
  lines.push('      App.vue');
  lines.push('      main.js');
  lines.push('    index.html');
  lines.push('    package.json');
  lines.push('    vite.config.js');
  lines.push('  package.json');
  lines.push('```');
  lines.push('');
  lines.push('## 三、后台核心源代码正文');
  lines.push('');

  function appendFile(file, indexPrefix, index) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return;
    const [titleText, duty, module] = descriptions[file] || [file, '项目自研源码文件。', '自研模块'];
    const content = sanitize(fs.readFileSync(full, 'utf8'));
    lines.push(`### ${indexPrefix}.${index} ${file}`);
    lines.push('');
    lines.push(`1. 文件路径：${file}`);
    lines.push('');
    lines.push(`2. 文件职责：${duty}`);
    lines.push('');
    lines.push(`3. 所属模块：${module}。`);
    lines.push('');
    lines.push('源码正文：');
    lines.push('');
    lines.push(`\`\`\`${fenceFor(file)}`);
    lines.push(content.replace(/\s+$/g, ''));
    lines.push('```');
    lines.push('');
  }

  backendFiles.forEach((file, index) => appendFile(file, '3', index + 1));
  lines.push('## 四、前端 H5 源代码正文');
  lines.push('');
  frontendFiles.forEach((file, index) => appendFile(file, '4', index + 1));
  lines.push('## 五、工程配置源代码正文');
  lines.push('');
  configFiles.forEach((file, index) => appendFile(file, '5', index + 1));
  return lines.join('\n');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let inCode = false;
  let code = [];
  let codeLang = '';

  function flushParagraph() {
    if (!paragraph.length) return;
    out.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (!inCode) {
        flushParagraph();
        inCode = true;
        codeLang = line.slice(3);
        code = [];
      } else {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        inCode = false;
        codeLang = '';
      }
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      out.push(`<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return out.join('\n');
}

const markdown = buildMarkdown();
fs.writeFileSync(mdPath, markdown, 'utf8');

const body = markdownToHtml(markdown);
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${baseName}</title>
  <style>
    @page {
      size: A4;
      margin: 24mm 17mm 8mm;
      @top-left {
        content: "${title}";
        font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif;
        font-size: 9px;
        color: #374151;
        border-bottom: 1px solid #d1d5db;
        padding-top: 2mm;
      }
    }
    body { font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.36; }
    h1 { text-align: center; font-size: 17px; margin: 0 0 8px; }
    h2 { font-size: 13px; margin: 10px 0 5px; border-bottom: 1px solid #9ca3af; padding-bottom: 2px; page-break-after: avoid; }
    h3 { font-size: 10.5px; margin: 7px 0 3px; page-break-after: avoid; }
    p { margin: 2px 0; }
    pre { margin: 4px 0 8px; padding: 5px 6px; border-left: 2px solid #d1d5db; background: #fafafa; page-break-inside: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    code { font-family: Consolas, "Liberation Mono", monospace; font-size: 9.4px; line-height: 1.3; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

fs.writeFileSync(htmlPath, html, 'utf8');
fs.rmSync(exportDir, { recursive: true, force: true });
fs.mkdirSync(exportDir, { recursive: true });
fs.writeFileSync(exportHtmlPath, html, 'utf8');
execFileSync('/snap/bin/chromium', [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${tempPdfPath}`,
  `file://${exportHtmlPath}`
], { stdio: 'inherit' });
fs.copyFileSync(tempPdfPath, pdfPath);
fs.unlinkSync(tempPdfPath);

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${pdfPath}`);
