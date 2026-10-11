export function shouldSeedDemoUsers(isProduction, database = '', allowDemoSeed = '') {
  return !isProduction && allowDemoSeed === '1' && /_(?:dev|test|demo)$/.test(database);
}
