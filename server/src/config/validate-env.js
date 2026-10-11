export function productionConfigErrors(config = process.env) {
  if (config.NODE_ENV !== 'production') return [];

  const errors = [];
  if (!config.PGPASSWORD || config.PGPASSWORD.length < 16) {
    errors.push('PGPASSWORD must be set and at least 16 characters long');
  }
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32 || config.JWT_SECRET === 'change_me_to_a_long_random_string') {
    errors.push('JWT_SECRET must be set and at least 32 characters long');
  }
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
    errors.push('SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required');
  }
  return errors;
}

export function assertDatabaseName(name = 'railway_term_learning') {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(name)) {
    throw new Error('PGDATABASE must be a PostgreSQL identifier (up to 63 characters)');
  }
  return name;
}

export function assertProductionConfig(config = process.env) {
  const errors = productionConfigErrors(config);
  if (errors.length) throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
}
