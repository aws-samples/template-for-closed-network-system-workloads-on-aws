const referSecrets = async () => {
	const {SecretsManager}  = await import("@aws-sdk/client-secrets-manager");
	try {
		const secretsManager = new SecretsManager({
		region: process.env.REGION!,
		})
		const response = await secretsManager.getSecretValue({
		SecretId: process.env.SECRET_NAME!,
		})
		return JSON.parse(response.SecretString!)
	} catch(err) {
		return JSON.stringify({err}, null, 2)
	}
}

export default async function Connection(){
	const {Client} = await import('pg');
	const secrets = await referSecrets();
	const connect = async (secrets:any) => {
		const {Signer} = await import("@aws-sdk/rds-signer");
        const signer = new Signer({
			'region': process.env.REGION!,
			'username': secrets.username,
			'hostname': process.env.HOST!,
			'port': secrets.port
		});
	
		let token = await signer.getAuthToken();
		return token;
	};
	// client settings
	const token = await connect(secrets)
	const client = new Client({
		host: process.env.HOST!,
		port: secrets.port,
		user: secrets.username,
		password: token,//secrets.password,
		ssl: true,
	});
	return client;
}


