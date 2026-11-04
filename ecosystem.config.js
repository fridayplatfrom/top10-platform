// ==============================================================================
// TOP 10 PLATFORM — PM2 PROCESS MANAGER CONFIGURATION
// Zero-downtime clustering, log management, and auto-restart
// Run with: pm2 start ecosystem.config.js --env production
// ==============================================================================

module.exports = {
  apps: [
    {
      name: 'top10-platform',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3456
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3456,
        BASE_URL: 'https://top10.example.com'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
