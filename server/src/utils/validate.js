/**
 * zod 校验中间件。
 *
 * 注意：zod 虽然早已在 package.json 里，但此前全仓库零引用 —— 这是新建的约定，
 * 不是沿袭既有写法。版本锁定 ^3.25.76，zod v4 的 API 与此不同。
 */

function toMessage(error) {
  const issue = error.issues?.[0];
  if (!issue) return '参数不合法';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** 校验 req.body，通过后以解析结果覆盖（含默认值与类型转换）。 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({ message: toMessage(result.error), issues: result.error.issues });
    }
    req.body = result.data;
    next();
  };
}

/** 校验 req.query。Express 4 的 req.query 可写，但为清晰起见存到 req.validatedQuery。 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return res.status(400).json({ message: toMessage(result.error), issues: result.error.issues });
    }
    req.validatedQuery = result.data;
    next();
  };
}

export { toMessage };
