import Connection from './connect';
export const handler = async (event: any): Promise<any> => {
		try{
			
			const client = await Connection();
			// Connection
			await client.connect();
			console.log('connected');

			// Query
			const res = await client.query('SELECT * FROM sampleapp_table');
			const response = {
				statusCode: 200,
				headers: {
						"Access-Control-Allow-Headers" : "Content-Type",
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "OPTIONS,POST,GET"
				},
				body: JSON.stringify(res.rows),
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