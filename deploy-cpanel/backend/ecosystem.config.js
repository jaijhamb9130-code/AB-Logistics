// PM2 process file — `pm2 start ecosystem.config.js` from this directory.
// Auto-restarts on crash, keeps the Node API on port 3009 alive across
// reboots (pair with `pm2 startup` + `pm2 save` on the cPanel SSH).

module.exports = {
  apps: [
    {
      name: 'ablogistics-api',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // pino logs go to stdout — PM2 captures both.
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
