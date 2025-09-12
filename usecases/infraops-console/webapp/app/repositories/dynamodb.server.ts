import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  UpdateCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { clientConfig } from '~/utils/aws.server';

// DynamoDBクライアントの初期化
const dynamoClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * 指定されたキーでアイテムを取得する
 * @param tableName テーブル名
 * @param key キー
 * @returns アイテム、存在しない場合はnull
 */
export async function getItem<T extends Record<string, any>>(tableName: string, key: Record<string, any>): Promise<T | null> {
  console.log(`Getting item from ${tableName} with key:`, key);
  
  try {
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    });
    
    const response = await docClient.send(command);
    return (response.Item as T) || null;
  } catch (error) {
    console.error(`Error getting item from ${tableName}:`, error);
    throw error;
  }
}

/**
 * アイテムを保存する
 * @param tableName テーブル名
 * @param item 保存するアイテム
 */
export async function putItem<T extends Record<string, any>>(tableName: string, item: T): Promise<void> {
  console.log(`Putting item to ${tableName}:`, item);
  
  try {
    const command = new PutCommand({
      TableName: tableName,
      Item: item
    });
    
    await docClient.send(command);
  } catch (error) {
    console.error(`Error putting item to ${tableName}:`, error);
    throw error;
  }
}

/**
 * アイテムを更新する
 * @param tableName テーブル名
 * @param key キー
 * @param updateExpression 更新式
 * @param expressionAttributeValues 式の属性値
 * @param expressionAttributeNames 式の属性名
 * @returns 更新後のアイテム、更新に失敗した場合はnull
 */
export async function updateItem<T extends Record<string, any>>(
  tableName: string, 
  key: Record<string, any>,
  updateExpression: string,
  expressionAttributeValues: Record<string, any>,
  expressionAttributeNames?: Record<string, string>
): Promise<T | null> {
  console.log(`Updating item in ${tableName} with key:`, key);
  
  try {
    const command = new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    });
    
    const response = await docClient.send(command);
    return (response.Attributes as T) || null;
  } catch (error) {
    console.error(`Error updating item in ${tableName}:`, error);
    throw error;
  }
}

/**
 * アイテムを削除する
 * @param tableName テーブル名
 * @param key キー
 */
export async function deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
  console.log(`Deleting item from ${tableName} with key:`, key);
  
  try {
    const command = new DeleteCommand({
      TableName: tableName,
      Key: key
    });
    
    await docClient.send(command);
  } catch (error) {
    console.error(`Error deleting item from ${tableName}:`, error);
    throw error;
  }
}

/**
 * テーブルまたはインデックスをクエリする
 * @param tableName テーブル名
 * @param keyConditionExpression キー条件式
 * @param expressionAttributeValues 式の属性値
 * @param indexName インデックス名（オプション）
 * @param expressionAttributeNames 式の属性名（オプション）
 * @param filterExpression フィルタ式（オプション）
 * @param limit 取得件数の上限（オプション）
 * @param exclusiveStartKey 開始キー（ページネーション用、オプション）
 * @returns アイテムの配列と最後に評価されたキー（ページネーション用）
 */
export async function queryItems<T extends Record<string, any>>(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, any>,
  indexName?: string,
  expressionAttributeNames?: Record<string, string>,
  filterExpression?: string,
  limit?: number,
  exclusiveStartKey?: Record<string, any>
): Promise<{
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
}> {
  console.log(`Querying ${indexName ? `index ${indexName} in ` : ''}table ${tableName}`);
  
  try {
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      FilterExpression: filterExpression,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey
    });
    
    const response = await docClient.send(command);
    return {
      items: (response.Items as T[]) || [],
      lastEvaluatedKey: response.LastEvaluatedKey
    };
  } catch (error) {
    console.error(`Error querying ${indexName ? `index ${indexName} in ` : ''}table ${tableName}:`, error);
    throw error;
  }
}
