export function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10), 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '10', 10), 1), 100);
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

export function paged(rows, total, page, pageSize) {
  return {
    rows,
    total: Number(total || 0),
    page,
    pageSize
  };
}
