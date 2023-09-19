import Connection from './connect';
import { Logger } from '@aws-lambda-powertools/logger';
const logger = new Logger({ serviceName: 'getLambda' });
export const handler = async (event: any): Promise<any> => {
		try{
			
			const client = await Connection();
			// Connection
			await client.connect();
			logger.info('connected');

			// Query
			const res = await client.query('SELECT * FROM sampleapp_table');
			const response = {
				statusCode: 200,
				body: JSON.stringify(res.rows),
			};  
			return response;
		
	}catch (e) {
		logger.error(e.toString());
		const response = {
			statusCode: 400,
			body: JSON.stringify(e),
		};  
		return response;
	}
};