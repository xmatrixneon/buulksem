module.exports = {
  apps: [
    {
      name: 'sms-gateway',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'worker:status',
      script: 'dist/workers/status-worker.js',
      env: {
        BULLMQ_STATUS_ENABLED: 'true',
        BULLMQ_CONCURRENCY_DEVICE_STATUS: '3'
      },
      error_file: './logs/status-error.log',
      out_file: './logs/status-out.log'
    },
    {
      name: 'worker:fetch',
      script: 'dist/workers/fetch-worker.js',
      env: {
        BULLMQ_FETCH_ENABLED: 'true',
        BULLMQ_CONCURRENCY_SMS_FETCH: '5'
      },
      error_file: './logs/fetch-error.log',
      out_file: './logs/fetch-out.log'
    },
    {
      name: 'worker:suspend',
      script: 'dist/workers/suspend-worker.js',
      env: {
        BULLMQ_SUSPEND_ENABLED: 'true',
        SMS_AUTO_SUSPEND_ENABLED: 'true'
      },
      error_file: './logs/suspend-error.log',
      out_file: './logs/suspend-out.log'
    },
    {
      name: 'worker:cleanup',
      script: 'dist/workers/cleanup-worker.js',
      env: {
        BULLMQ_CLEANUP_ENABLED: 'true',
        MESSAGE_CLEANUP_ENABLED: 'true'
      },
      error_file: './logs/cleanup-error.log',
      out_file: './logs/cleanup-out.log'
    }
  ]
}
