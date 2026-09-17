import { smtpConfigured, env } from '../config/env.js';

/**
 * 邮件发送。SMTP 未配置时不报错，而是把验证码交给调用方走日志/回显路径，
 * 这样找回密码功能在没有任何邮件服务的情况下依然可用。
 *
 * nodemailer 采用惰性加载：没配 SMTP 就永远不 require，避免它成为启动硬依赖。
 */

let transporterPromise = null;

async function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const { default: nodemailer } = await import('nodemailer');
      return nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: { user: env.smtp.user, pass: env.smtp.password }
      });
    })().catch((error) => {
      console.error('[mailer] transport init failed:', error.message);
      transporterPromise = null;
      return null;
    });
  }
  return transporterPromise;
}

/**
 * 发送验证码邮件。
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendResetCode({ to, username, code, ttlMinutes }) {
  const transporter = await getTransporter();
  if (!transporter) return { sent: false, reason: 'smtp_not_configured' };

  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject: '【汉越铁道术语学习软件】密码重置验证码',
      text: `您好 ${username}：\n\n您的密码重置验证码是：${code}\n有效期 ${ttlMinutes} 分钟，请勿泄露给他人。\n\n若非本人操作，请忽略本邮件。`,
      html: `<p>您好 <strong>${username}</strong>：</p>
             <p>您的密码重置验证码是：</p>
             <p style="font-size:24px;letter-spacing:4px;font-weight:700;color:#0f766e">${code}</p>
             <p>有效期 ${ttlMinutes} 分钟，请勿泄露给他人。</p>
             <p style="color:#758292">若非本人操作，请忽略本邮件。</p>`
    });
    return { sent: true };
  } catch (error) {
    console.error('[mailer] send failed:', error.message);
    return { sent: false, reason: error.message };
  }
}
