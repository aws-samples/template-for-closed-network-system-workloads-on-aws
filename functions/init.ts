import Connection from './connect';
import { Logger } from '@aws-lambda-powertools/logger';
const logger = new Logger({ serviceName: 'initLambda' });

export const handler = async (event: any,context: any): Promise<any> => {
  const cfnResponse = require('cfn-response');
  if(event.RequestType == 'Create' || event.RequestType == 'Update'){
    try{
      const client=await Connection();
      // Connection
      await client.connect();
      logger.info('connected')

      // Query
      const res1 = await client.query('DROP TABLE IF EXISTS sampleapp_table;');
      logger.info(res1)
      const res2 = await client.query('CREATE TABLE IF NOT EXISTS sampleapp_table(id serial NOT NULL,name text COLLATE pg_catalog."default" NOT NULL,job0001_flag boolean NOT NULL DEFAULT false,job0002_flag boolean NOT NULL DEFAULT false,job0003_flag boolean NOT NULL DEFAULT false,job0004_flag boolean NOT NULL DEFAULT false,job0005_flag boolean NOT NULL DEFAULT false,CONSTRAINT sample_app_pkey PRIMARY KEY (id));')
      logger.info(res2)
      const res3 = await client.query("INSERT INTO sampleapp_table(name, job0001_flag, job0002_flag, job0003_flag, job0004_flag, job0005_flag) VALUES ('test record 1',true,true,true,true,true);")
      logger.info(res3)
      return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId);
    }catch (e) {
      logger.error(e.toString());
      return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId);
    }
  }
  return await cfnResponse.send(event, context, cfnResponse.SUCCESS, {"message":Date.now().toString()}, event.PhysicalResourceId); 
};