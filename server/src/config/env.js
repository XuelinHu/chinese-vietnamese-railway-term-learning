import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Java@c1024',
    database: process.env.DB_NAME || 'railway_term_learning'
  },
  jwtSecret: process.env.JWT_SECRET || 'railway_term_learning_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h'
};
