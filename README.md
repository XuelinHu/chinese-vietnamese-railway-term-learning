# chinese-vietnamese-railway-term-learning

<p align="center">
  <img height="20" alt="Vue 3.5.13" src="https://img.shields.io/badge/vue-3.5.13-4FC08D" />
  <img height="20" alt="Vite 6.0.7" src="https://img.shields.io/badge/vite-6.0.7-646CFF" />
  <img height="20" alt="Express 4.21.2" src="https://img.shields.io/badge/express-4.21.2-000000" />
  <img height="20" alt="MySQL configured" src="https://img.shields.io/badge/mysql-configured-4479A1" />
  <img height="20" alt="License GPL-2.0" src="https://img.shields.io/badge/license-GPL--2.0-3DA639" />
</p>

面向越南留学生的铁道专业汉越术语翻译学习软件 V1.0

H5 前端 + Node.js 后台 + MySQL 数据库的铁道专业术语翻译学习平台。

## 功能范围

- 三语言界面：中文、English、Tiếng Việt
- 专业术语管理台：分类、三语术语、难度、释义、例句、启停用
- 练习平台：按分类/难度生成单选、判断、填空、翻译练习
- 数据分析：学习次数、正确率、错题、高频错误术语、分类统计
- 公共系统模块：登录、角色、用户、登录日志、操作日志

## 数据库配置

默认读取 `server/.env`：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Java@c1024
DB_NAME=railway_term_learning
JWT_SECRET=railway_term_learning_secret
```

首次启动后端会自动创建数据表和演示数据。请先确保 MySQL 已启动，并且 `root` 账号允许从本机连接。

## 启动

```bash
npm install
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000

演示账号：

- 管理员：admin / admin123
- 教师：teacher / teacher123
- 学生：student / student123

## 开源协议

本项目使用 GNU General Public License v2.0（GPL-2.0）开源，详见 `LICENSE`。
