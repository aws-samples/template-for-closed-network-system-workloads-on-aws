const referSecrets = async () => {
	const {SecretsManager}  = await import("@aws-sdk/client-secrets-manager");
	const secretsManager = new SecretsManager({
	region: process.env.REGION!,
	})
	const response = await secretsManager.getSecretValue({
	SecretId: process.env.SECRET_NAME!,
	})
	return JSON.parse(response.SecretString!)
}

export default async function Connection(){
	const {Client} = await import('pg');
	const secrets = await referSecrets();
	const {Signer} = await import("@aws-sdk/rds-signer");
	const signer = new Signer({
		'region': process.env.REGION!,
		'username': secrets.username,
		'hostname': process.env.HOST!,
		'port': secrets.port
	});
	const token = await signer.getAuthToken();
	// client settings
	const client = new Client({
		host: process.env.HOST!,
		port: secrets.port,
		user: secrets.username,
		password: token,//secrets.password,
		ssl: true,
	});
	return client;
}


