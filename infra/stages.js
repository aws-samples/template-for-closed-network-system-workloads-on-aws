const appName = 'templateapp';

exports.stages = {
  default: {
    appName,
    awsProfile: 'defaultProfile',
    alias: 'default',
    deployEnv: 'dev',
    notifyEmail: 'default-mail@default-mail.com',
    enabledPrivateLink: false,
    windowsBastion: true,
    linuxBastion: true,
    domainName: 'app.templateapp.local',
  },
  johndoe: {
    appName,
    awsProfile: 'myProfile',
    alias: 'johndoe',
    deployEnv: 'dev',
    notifyEmail: 'suzukyz+serverless@amazon.co.jp',
    enabledPrivateLink: false,
    windowsBastion: true,
    linuxBastion: false,
    domainName: 'templateapp.local',
  },
};
