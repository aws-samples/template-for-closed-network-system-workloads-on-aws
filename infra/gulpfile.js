/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const { endsWith, startsWith, capitalize } = require('lodash');
const { series } = require('gulp');
const { spawn } = require('child_process');

const path = require('path');
const chalk = require('chalk');
const stages = require('./stages.js');
const _ = require('lodash');
require('dotenv').config();

const paths = {
  cloudAssemblyOutPath: path.resolve(__dirname + '/cloud_assembly_output'),
  workingDir: path.resolve(__dirname + '/'),
  sslDir: path.resolve(__dirname + '/ssl/'),
};

let deployStage = {};
let stageName = null;
let appVpcId = '';
let privateLinkVpcId = '';
let batchDefaultRegistryUri = '';
let batchRepositoryUri = '';
let ecrRegion = '';
let domain = '';
let certificateArn = '';

/* cdk diff */
exports.diff = series(setStage, diffBase, buildBaseEnv, diffWebapp, buildWebappEnv, diffBatch);
exports.diffServerless = series(setStage, diffBase, buildBaseEnv, diffServerlessWebapp, buildWebappEnv, diffBatch);
/* cdk synth */
exports.synth = series(
  setStage,
  series(synthBase, buildBaseEnv),
  series(synthWebapp, buildWebappEnv),
  series(synthBatch)
);
exports.synthSeverless = series(
  setStage,
  series(synthBase, buildBaseEnv),
  series(synthServerlessWebapp, buildWebappEnv),
  series(synthBatch)
);
exports.synthBase = series(setStage, synthBase);
exports.synthWebapp = series(setStage, buildBaseEnv, synthWebapp);
exports.synthServerlessWebapp = series(setStage, buildBaseEnv, synthServerlessWebapp);
exports.synthBatch = series(setStage, buildBaseEnv, synthBatch);

/* cdk list */
exports.list = series(setStage, listBase, listWebapp, listBatch);
exports.listServerless = series(setStage, listBase, listServerlessWebapp, listBatch);
/* cdk deploy */
exports.deploy = series(
  setStage,
  series(setup, bootstrapBase, deployBase, buildBaseEnv),
  series(bootstrapWebApp, getCertificateArn, deployWebapp, buildWebappEnv),
  series(bootstrapBatch, buildBatch, deployBatch)
);
exports.deployServerless = series(
  setStage,
  series(setup, bootstrapBase, deployBase, buildBaseEnv),
  series(bootstrapServerlessWebApp, getCertificateArn, deployServerlessWebapp, buildWebappEnv),
  series(bootstrapBatch, buildBatch, deployBatch)
);
exports.deployBase = series(setStage, series(bootstrapBase, deployBase));
exports.deployWebapp = series(
  setStage,
  bootstrapWebApp,
  buildBaseEnv,
  getCertificateArn,
  deployWebapp
);
exports.deployServerlessWebapp = series(
  setStage,
  bootstrapServerlessWebApp,
  buildBaseEnv,
  getCertificateArn,
  deployServerlessWebapp
);
exports.deployBatch = series(setStage, bootstrapBatch, buildBaseEnv, buildBatch, deployBatch);

/* cdk destroy */
exports.destroy = series(setStage, series(destroyBatch, destroyWebapp, destroyBase));
exports.destroyServerless = series(setStage, series(destroyBatch, destroyServerlessWebapp, destroyBase));
exports.destroyWebapp = series(setStage, destroyWebapp);
exports.destroyServerlessWebapp = series(setStage, destroyServerlessWebapp);
exports.destroyBatch = series(setStage, destroyBatch);
exports.destroyBase = series(setStage, destroyBase);

/* create certificate for ACM */
exports.createCertificate = series(
  setStage,
  setDomain,
  createRootPrivateKey,
  createRootCertificate,
  createICAPrivcateKey,
  createICACsr,
  createICACertificate,
  createServerPrivateKey,
  createServerCsr,
  createServerCertificate,
  importCertificate
);

/* functions */
function profile() {
  return `--profile ${deployStage.awsProfile}`;
}

function toolkit() {
  return `${capitalize(deployStage.alias)}${capitalize(deployStage.deployEnv)}${capitalize(
    deployStage.appName
  )}Toolkit`;
}

function deployBase() {
  return exec(
    'cdk',
    [
      `deploy --all ${profile()} --app 'npx ts-node --prefer-ts-exts bin/base.ts' --toolkit-stack-name ${toolkit()} ${addContext()} --require-approval=never --outputs-file ./cdk-base-outputs.json`,
    ],
    paths.workingDir
  );
}

function deployWebapp() {
  return exec(
    'cdk',
    [
      `deploy --all ${profile()} --app 'npx ts-node --prefer-ts-exts bin/webapp.ts' --toolkit-stack-name ${toolkit()} ${addContext()} --require-approval=never --outputs-file ./cdk-webapp-outputs.json`,
    ],
    paths.workingDir
  );
}

function deployServerlessWebapp() {
  return exec(
    'cdk',
    [
      `deploy --all ${profile()} --app 'npx ts-node --prefer-ts-exts bin/serverless-webapp.ts' --toolkit-stack-name ${toolkit()} ${addContext()} --require-approval=never --outputs-file ./cdk-webapp-outputs.json`,
    ],
    paths.workingDir
  );
}

function deployBatch() {
  return exec(
    'cdk',
    [
      `deploy --all ${profile()} --app 'npx ts-node --prefer-ts-exts bin/batch.ts' --toolkit-stack-name ${toolkit()} ${addContext()} --require-approval=never --outputs-file ./cdk-batch-outputs.json`,
    ],
    paths.workingDir
  );
}

function addContext() {
  let context = ` --context stage_alias=${stageName} --context app_name=${deployStage.appName} --context deploy_env=${deployStage.deployEnv}`;

  if (_.has(deployStage, 'notifyEmail')) {
    context = context.concat(` --context notify_email=${deployStage.notifyEmail}`);
  }

  if (_.has(deployStage, 'enabledPrivateLink')) {
    context = context.concat(` --context enabled_privatelink=${deployStage.enabledPrivateLink}`);
  }

  if (_.has(deployStage, 'windowsBastion')) {
    context = context.concat(` --context windows_bastion=${deployStage.windowsBastion}`);
  }

  if (_.has(deployStage, 'linuxBastion')) {
    context = context.concat(` --context linux_bastion=${deployStage.linuxBastion}`);
  }

  if (_.has(deployStage, 'domainName')) {
    context = context.concat(` --context domain_name=${deployStage.domainName}`);
  }

  if (privateLinkVpcId) {
    context = context.concat(` --context privatelink_vpc_id=${privateLinkVpcId}`);
  }

  if (appVpcId) {
    context = context.concat(` --context app_vpc_id=${appVpcId}`);
  }

  if (certificateArn) {
    context = context.concat(` --context certificate_arn=${certificateArn}`);
  }

  return context;
}

function getValueFromCdkOutputsData(cdkOutputData, stackName, keyName) {
  let stageKeys = {};
  let value = '';
  Object.keys(cdkOutputData).forEach((key) => {
    if (endsWith(key, stackName) && startsWith(key, capitalize(stageName))) {
      stageKeys = cdkOutputData[key];
    }
  });

  Object.keys(stageKeys).forEach((key) => {
    if (key.includes(keyName)) {
      value = stageKeys[key];
    }
  });
  return value;
}

async function buildBaseEnv(cb) {
  let data = fs.readFileSync('./cdk-base-outputs.json', 'utf8');
  let cdkOutputData = data ? JSON.parse(data) : {};

  // vpcId
  appVpcId = getValueFromCdkOutputsData(cdkOutputData, 'Base', 'VpcId');

  // batch repository uri
  const ecrBatchRepositoryUri = getValueFromCdkOutputsData(
    cdkOutputData,
    'Base',
    'BatchRepositoryUri'
  );
  batchDefaultRegistryUri = ecrBatchRepositoryUri.split('/')[0];
  batchRepositoryUri = ecrBatchRepositoryUri.split('/')[1];

  // ecr region
  ecrRegion = getValueFromCdkOutputsData(cdkOutputData, 'Base', 'Region');

  cb();
}

async function buildWebappEnv(cb) {
  let data = fs.readFileSync('./cdk-webapp-outputs.json', 'utf8');
  let cdkOutputData = data ? JSON.parse(data) : {};

  privateLinkVpcId = getValueFromCdkOutputsData(cdkOutputData, 'Webapp', 'VpcId');

  cb();
}

async function buildBatch(cb) {
  await exec(
    `cd ../batch && aws ecr get-login-password --region ${ecrRegion} ${profile()} | docker login --username AWS --password-stdin ${batchDefaultRegistryUri} && \
    docker build . -t ${deployStage.appName}-batch:latest && \
    docker tag ${
      deployStage.appName
    }-batch ${batchDefaultRegistryUri}/${batchRepositoryUri}:latest && \
    docker push ${batchDefaultRegistryUri}/${batchRepositoryUri}:latest`,
    [],
    paths.workingDir
  );

  cb();
}

async function exec(command, args, pwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: true,
      windowsVerbatimArguments: true,
      pwd,
    });

    proc.stdout.on('data', (data) => {
      console.log(chalk.blue(data.toString()));
    });

    proc.stderr.on('data', (data) => {
      console.log(chalk.blue(data.toString()));
    });

    proc.on('close', () => {
      return;
    });

    proc.on('exit', (code) => {
      const cmdArgs = args ? args.join(' ') : '';
      if (code == 0) {
        resolve(code);
        console.log(chalk.green(`Successfully executed: ${chalk.white(command + ' ' + cmdArgs)}`));
      } else {
        reject(code);
        console.error(chalk.red(`Error executing: ${chalk.white(command + ' ' + cmdArgs)}`));
      }
    });
  });
}

async function bootstrapBase(cb) {
  const qualifier = `${stageName.slice(0, 5)}${deployStage.deployEnv.slice(0, 5)}`;
  await exec(
    'cdk',
    [
      `bootstrap ${profile()} --toolkit-stack-name ${toolkit()} --qualifier ${qualifier} ${addContext()} --app 'npx ts-node --prefer-ts-exts bin/base.ts'`,
    ],
    paths.workingDir
  );
  cb();
}

async function bootstrapWebApp(cb) {
  const qualifier = `${stageName.slice(0, 5)}${deployStage.deployEnv.slice(0, 5)}`;
  await exec(
    'cdk',
    [
      `bootstrap ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --qualifier ${qualifier} --app 'npx ts-node --prefer-ts-exts bin/webapp.ts'`,
    ],
    paths.workingDir
  );
  cb();
}

async function bootstrapServerlessWebApp(cb) {
  const qualifier = `${stageName.slice(0, 5)}${deployStage.deployEnv.slice(0, 5)}`;
  await exec(
    'cdk',
    [
      `bootstrap ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --qualifier ${qualifier} --app 'npx ts-node --prefer-ts-exts bin/serverless-webapp.ts'`,
    ],
    paths.workingDir
  );
  cb();
}

async function bootstrapBatch(cb) {
  const qualifier = `${stageName.slice(0, 5)}${deployStage.deployEnv.slice(0, 5)}`;
  await exec(
    'cdk',
    [
      `bootstrap ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --qualifier ${qualifier} --app 'npx ts-node --prefer-ts-exts bin/batch.ts'`,
    ],
    paths.workingDir
  );
  cb();
}

async function destroyBatch(cb) {
  await exec(
    'cdk',
    [
      `destroy --all --app 'npx ts-node --prefer-ts-exts bin/batch.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --force`,
    ],
    paths.workingDir
  );
  cb();
}

async function destroyWebapp(cb) {
  await exec(
    'cdk',
    [
      `destroy --all --app 'npx ts-node --prefer-ts-exts bin/webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --force`,
    ],
    paths.workingDir
  );
  cb();
}

async function destroyServerlessWebapp(cb) {
  await exec(
    'cdk',
    [
      `destroy --all --app 'npx ts-node --prefer-ts-exts bin/serverless-webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --force`,
    ],
    paths.workingDir
  );
  cb();
}

async function destroyBase(cb) {
  await exec(
    'cdk',
    [
      `destroy --all --app 'npx ts-node --prefer-ts-exts bin/base.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()} --force`,
    ],
    paths.workingDir
  );
  cb();
}

async function diffBase(cb) {
  await exec(
    'cdk',
    [
      `diff --app 'npx ts-node --prefer-ts-exts bin/base.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function diffWebapp(cb) {
  await exec(
    'cdk',
    [
      `diff --app 'npx ts-node --prefer-ts-exts bin/webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}
async function diffServerlessWebapp(cb) {
  await exec(
    'cdk',
    [
      `diff --app 'npx ts-node --prefer-ts-exts bin/serverless-webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function diffBatch(cb) {
  await exec(
    'cdk',
    [
      `diff --app 'npx ts-node --prefer-ts-exts bin/batch.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function synthBase(cb) {
  await exec(
    'cdk',
    [
      `synth --app 'npx ts-node --prefer-ts-exts bin/base.ts' --all --quiet --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function synthWebapp(cb) {
  await exec(
    'cdk',
    [
      `synth --app 'npx ts-node bin/webapp.ts' --all ${profile()} --quiet --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function synthServerlessWebapp(cb) {
  await exec(
    'cdk',
    [
      `synth --app 'npx ts-node bin/serverless-webapp.ts' --all ${profile()} --quiet --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function synthBatch(cb) {
  await exec(
    'cdk',
    [
      `synth --app 'npx ts-node bin/batch.ts' --all ${profile()} --quiet --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function listBase(cb) {
  await exec(
    'cdk',
    [
      `list --app 'npx ts-node bin/base.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function listWebapp(cb) {
  await exec(
    'cdk',
    [
      `list --app 'npx ts-node bin/webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}
async function listServerlessWebapp(cb) {
  await exec(
    'cdk',
    [
      `list --app 'npx ts-node bin/serverless-webapp.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function listBatch(cb) {
  await exec(
    'cdk',
    [
      `list --app 'npx ts-node bin/batch.ts' ${profile()} --toolkit-stack-name ${toolkit()} ${addContext()}`,
    ],
    paths.workingDir
  );
  cb();
}

async function setup(cb) {
  await exec('npm', ['i'], paths.workingDir);
  cb();
}

async function setStage(cb) {
  stageName = _.replace(process.argv[3], '--', '');

  if (!stageName) {
    cb(new Error('No config to deploy, run $npm run <cmd> -- --<configName>'));
  }
  deployStage = _.get(stages, `stages[${stageName}]`, null);

  if (!deployStage) {
    cb(new Error('Deployment stage not found in config'));
  }
  cb();
}

function setDomain(cb) {
  // Get domain name from stages.js
  domain = deployStage.domainName;
  cb();
}

async function createRootPrivateKey(cb) {
  // Private root certificate's private key
  await exec(
    'openssl',
    [
      'genpkey -out ssl/ca.key -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -pass pass:template@pp1234',
    ],
    paths.workingDir
  );
  cb();
}

async function createRootCertificate(cb) {
  // Private root certificate
  await exec(
    'openssl',
    [
      'req -new -x509 -key ssl/ca.key -days 3650 -out ssl/ca.pem -passin pass:template@pp1234 -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=Template Common Name"',
    ],
    paths.workingDir
  );
  cb();
}

async function createICAPrivcateKey(cb) {
  // Private key for intermediate certificates
  await exec(
    'openssl',
    [
      'genpkey -out ssl/ica.key -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -pass pass:template@pp1234',
    ],
    paths.workingDir
  );
  cb();
}

async function createICACsr(cb) {
  // CSR for intermediate certificates
  await exec(
    'openssl',
    [
      'req -new -key ssl/ica.key -sha256 -outform PEM -keyform PEM -out ssl/ica.csr  -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=Template Common Name"',
    ],
    paths.workingDir
  );
  cb();
}

async function createICACertificate(cb) {
  // Certificate of intermediate certificates
  await exec(
    'openssl',
    [
      'x509 -extfile ssl/openssl_sign_inca.cnf -req -in ssl/ica.csr -sha256 -CA ssl/ca.pem -CAkey ssl/ca.key -set_serial 01  -extensions v3_ca  -days 3650 -out ssl/ica.pem',
    ],
    paths.workingDir
  );
  cb();
}

async function createServerPrivateKey(cb) {
  // Private Key for server certificate
  await exec('openssl', ['genrsa 2048 > ssl/server.key'], paths.workingDir);
  cb();
}

async function createServerCsr(cb) {
  // CSR for server certificate
  await exec(
    'openssl',
    [
      `req -new -key ssl/server.key -outform PEM -keyform PEM  -sha256 -out ssl/server.csr  -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=*.${domain}"`,
    ],
    paths.workingDir
  );
  cb();
}

async function createServerCertificate(cb) {
  // Server certificate
  await exec(
    'openssl',
    [
      'x509 -req -in ssl/server.csr -sha256 -CA ssl/ica.pem -CAkey ssl/ica.key -set_serial 01 -days 3650 -out ssl/server.pem',
    ],
    paths.workingDir
  );
  cb();
}

async function importCertificate(cb) {
  // Import certificate to ACM
  await exec(
    'set -e -o pipefail && aws',
    [
      `acm import-certificate --certificate fileb://ssl/server.pem --certificate-chain fileb://ssl/ica.pem --private-key fileb://ssl/server.key ${profile()} | tee certificate_arn.json`,
    ],
    paths.workingDir
  );

  cb();
}

async function getCertificateArn(cb) {
  // get certificate_arn
  let data = fs.readFileSync('./certificate_arn.json', 'utf8');
  let jsonOutputData = data ? JSON.parse(data) : {};
  certificateArn = jsonOutputData.CertificateArn;
  cb();
}
