import { query } from '../db/pool.js';

/** 写一条操作日志。审计失败不能影响业务，所以整体吞异常。 */
export async function logOperation({ req, userId, username, module, action, detail }) {
  try {
    await query(
      `INSERT INTO sys_operation_log (user_id, username, module, action, detail, ip, method, path, status)
       VALUES (:userId, :username, :module, :action, :detail, :ip, :method, :path, :status)`,
      {
        userId: userId ?? req?.user?.id ?? null,
        username: username ?? req?.user?.username ?? null,
        module,
        action,
        detail: detail ? String(detail).slice(0, 500) : null,
        ip: req?.ip || null,
        method: req?.method || null,
        path: req?.originalUrl ? String(req.originalUrl).slice(0, 160) : null,
        status: req?.auditStatus ?? 200
      }
    );
  } catch (error) {
    console.error('[audit] failed to write operation log:', error.message);
  }
}
