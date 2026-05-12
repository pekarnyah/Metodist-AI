module.exports = {
  apps: [
    {
      name: 'control-bot',
      cwd: '/home/romanlagutkin/site-shkola/control-bot',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
