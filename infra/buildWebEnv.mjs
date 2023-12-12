import lodash from 'lodash';
import { readFile, writeFile } from 'fs/promises';

const { endsWith, startsWith } = lodash;

const envFile = '../webapp/.env.production';
const stageName = process.argv[2];

let cdkOutputData = {};

async function append(data) {
  await writeFile(envFile, data, { flag: 'a' }, (err) => {
    if (err) {
      console.error(err);
      return;
    }
  });
}

async function buildWebAppEnv() {
  let data = await readFile(new URL('./cdk-infra-outputs.json', import.meta.url));
  cdkOutputData = data ? JSON.parse(data) : {};
  let stageKeys = {};

  Object.keys(cdkOutputData).forEach((key) => {
    if (endsWith(key, 'baseline') && startsWith(key, stageName)) {
      stageKeys = cdkOutputData[key];
    }
  });

  Object.keys(stageKeys).forEach((key) => {
    key.includes('userpoolid') ? append(`VITE_COGNITO_USERPOOLID=${stageKeys[key]}\n`) : '';
    key.includes('userpoolclientid') ? append(`VITE_COGNITO_WEBCLIENTID=${stageKeys[key]}\n`) : '';
    key.includes('identitypoolid') ? append(`VITE_COGNITO_IDENTITYPOOLID=${stageKeys[key]}\n`) : '';
    key.includes('cognitourl') ? append(`VITE_COGNITO_ENDPOINT=${stageKeys[key]}\n`) : '';
    key.includes('graphqlurl') ? append(`VITE_GRAPHQL_URL=${stageKeys[key]}\n`) : '';
    key.includes('region') ? append(`VITE_COGNITO_REGION=${stageKeys[key]}\n`) : '';
  });
}

await writeFile(envFile, '', { flag: 'w+' }, (err) => {
  if (err) {
    console.error(err);
    return;
  }
});

await buildWebAppEnv();
