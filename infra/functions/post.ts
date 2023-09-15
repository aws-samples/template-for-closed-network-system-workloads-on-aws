export const referSecrets = async () => {
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

export const handler = async (event: any): Promise<any> => {
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
  try{
    // client settings
    const token = await connect(secrets)
    const client = new Client({
      host: process.env.HOST!,
      port: secrets.port,
      user: secrets.username,
      password: token,
      ssl: true,
    });
    
    // Connection
    await client.connect();
    console.log('connected');
    const id=event.queryStringParameters.id;
    const job0001_flag=event.queryStringParameters.job0001_flag;
    const job0002_flag=event.queryStringParameters.job0002_flag;
    const job0003_flag=event.queryStringParameters.job0003_flag;
    const job0004_flag=event.queryStringParameters.job0004_flag;
    const job0005_flag=event.queryStringParameters.job0005_flag;
    
    // Query
    const res = await client.query("UPDATE sampleapp_table SET job0001_flag = $1, job0002_flag = $2, job0003_flag = $3, job0004_flag = $4, job0005_flag = $5 WHERE id = $6",[job0001_flag,job0002_flag,job0003_flag,job0004_flag,job0005_flag,id]);
    const response = {
      statusCode: 200,
      headers: {
          "Access-Control-Allow-Headers" : "Content-Type",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
      },
      body: JSON.stringify(res),
    };  
    return response;
    
  }catch (e) {
    console.log("Error...");
    console.log(e);
    const response = {
      statusCode: 400,
      headers: {
          "Access-Control-Allow-Headers" : "Content-Type",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
      },
      body: JSON.stringify(e),
    };  
    return response;
  }
};