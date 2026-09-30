import { Sequelize } from 'sequelize';

// Cache on global to survive Next.js hot module reloads
if (!global.__sequelizeInstance) {
  global.__sequelizeInstance = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host:    process.env.DB_HOST,
      dialect: 'mysql',
      port:    process.env.DB_PORT || 3306,
      logging: false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
    }
  );
}

export default global.__sequelizeInstance;
