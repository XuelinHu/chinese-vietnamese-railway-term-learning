const MAX_OFFSET = Number.MAX_SAFE_INTEGER;

function readInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function getPagination(query) {
  const pageSize = Math.min(Math.max(readInteger(query.pageSize, 10), 1), 100);
  const maxPage = Math.max(1, Math.floor(MAX_OFFSET / pageSize) + 1);
  const page = Math.min(Math.max(readInteger(query.page, 1), 1), maxPage);
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

export function paged(rows, total, page, pageSize) {
  const exactCount = BigInt(total || 0);
  const safeTotal = exactCount > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(exactCount);
  return {
    rows,
    total: safeTotal,
    page,
    pageSize
  };
}
