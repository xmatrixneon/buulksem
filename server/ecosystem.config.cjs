module.exports = {
  apps: [
    {
      name: 'sms-gateway',
      script: 'dist/server.js',
      instances: 8,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_memory_restart: '2G',
      node_args: '--max-old-space-size=4096',
      inspect: false,
      watch: false
    },
    {
      name: 'worker:status',
      script: 'dist/workers/status-worker.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        BULLMQ_STATUS_ENABLED: 'true',
        BULLMQ_CONCURRENCY_DEVICE_STATUS: '2',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/status-error.log',
      out_file: './logs/status-out.log'
    },
    {
      name: 'worker:fetch',
      script: 'dist/workers/fetch-worker.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        BULLMQ_FETCH_ENABLED: 'true',
        BULLMQ_CONCURRENCY_SMS_FETCH: '2',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/fetch-error.log',
      out_file: './logs/fetch-out.log'
    },
    {
      name: 'worker:keepalive',
      script: 'dist/workers/keepalive-worker.js',
      env: {
        BULLMQ_KEEPALIVE_ENABLED: 'true',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/keepalive-error.log',
      out_file: './logs/keepalive-out.log'
    },
    {
      name: 'worker:wakeup',
      script: 'dist/workers/wakeup-worker.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        BULLMQ_WAKEUP_ENABLED: 'true',
        BULLMQ_CONCURRENCY_DEVICE_WAKEUP: '4',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/wakeup-error.log',
      out_file: './logs/wakeup-out.log'
    },
    {
      name: 'worker:suspend',
      script: 'dist/workers/suspend-worker.js',
      env: {
        BULLMQ_SUSPEND_ENABLED: 'true',
        SMS_AUTO_SUSPEND_ENABLED: 'true',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/suspend-error.log',
      out_file: './logs/suspend-out.log'
    },
    {
      name: 'worker:cleanup',
      script: 'dist/workers/cleanup-worker.js',
      env: {
        BULLMQ_CLEANUP_ENABLED: 'true',
        MESSAGE_CLEANUP_ENABLED: 'true',
        FCM_SERVICE_ACCOUNT_KEY: '/var/www/manager/buulksem/server/service-account-key.json'
      },
      error_file: './logs/cleanup-error.log',
      out_file: './logs/cleanup-out.log'
    }
  ]
}
