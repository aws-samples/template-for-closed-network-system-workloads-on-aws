const referSecrets = async () => {
	const AWS = await import("aws-sdk");
	try {
		const secretsManager = new AWS.SecretsManager({
		region: process.env.REGION!,
		})
		const response = await secretsManager.getSecretValue({
		SecretId: process.env.SECRET_NAME!,
		}).promise()
		return JSON.parse(response.SecretString!)
	} catch(err) {
		return JSON.stringify({err}, null, 2)
	}
}

export default async function Connection(){
	const {Client} = await import('pg');
	const secrets = await referSecrets();
	const connect = async (secrets:any) => {
		const AWS = await import("aws-sdk");
		const signer = new AWS.RDS.Signer({
			'region': process.env.REGION!,
			'username': secrets.username,
			'hostname': process.env.HOST!,
			'port': secrets.port
		});
	
		let token;
		await signer.getAuthToken({},(error:AWS.AWSError, result:string) => {
			if(error) {
				throw error;
			}
			token = result;
		});
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


