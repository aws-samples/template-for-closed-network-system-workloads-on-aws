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
  
  export const handler = async (event: any,context: any): Promise<any> => {
    const cfnResponse = require('cfn-response');
    if(event.RequestType == 'Create' || event.RequestType == 'Update'){
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
        
        // Query
        const res1 = await client.query('DROP TABLE IF EXISTS sampleapp_table;');
        console.log(res1);
        const res2 = await client.query('CREATE TABLE IF NOT EXISTS sampleapp_table(id serial NOT NULL,name text COLLATE pg_catalog."default" NOT NULL,job0001_flag boolean NOT NULL DEFAULT false,job0002_flag boolean NOT NULL DEFAULT false,job0003_flag boolean NOT NULL DEFAULT false,job0004_flag boolean NOT NULL DEFAULT false,job0005_flag boolean NOT NULL DEFAULT false,CONSTRAINT sample_app_pkey PRIMARY KEY (id));')
        console.log(res2);
        const res3 = await client.query("INSERT INTO sampleapp_table(name, job0001_flag, job0002_flag, job0003_flag, job0004_flag, job0005_flag) VALUES ('test record 1',true,true,true,true,true);")
        console.log(res3);
        return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId);
      }catch (e) {
        console.log("Error...");
        console.log(e);
        return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId);
      }
    }
    return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId);
    
  };