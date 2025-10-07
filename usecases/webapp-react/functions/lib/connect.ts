const referSecrets = async (): Promise<{
  "engine": string;
  "host": string;
  "username": string;
  "password": string;
  "dbname": string;
  "port": number;
  "masterarn": string;
  "dbInstanceIdentifier": string;
  "dbClusterIdentifier": string;
}> => {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  const secretsManager = new SecretsManagerClient({
    region: process.env.AWS_REGION!,
  });
  const response = await secretsManager.send(
    new GetSecretValueCommand({
      SecretId: process.env.SECRET_NAME!,
    })
  );
  return JSON.parse(response.SecretString!);
};

export default async function Connection() {
  const { Client } = await import("pg");
  const secrets = await referSecrets();
  const {host, username, port} = secrets;
  const { Signer } = await import("@aws-sdk/rds-signer");
  const signer = new Signer({
    region: process.env.AWS_REGION!,
    username: username,
    hostname: process.env.PROXY_ENDPOINT!,
    port: port,
  });
  const token = await signer.getAuthToken();
  // client settings
  const client = new Client({
    host: process.env.PROXY_ENDPOINT!,
    user: username,
    password: token, //secrets.password,
    ssl: true,
  });
  return client;
}
