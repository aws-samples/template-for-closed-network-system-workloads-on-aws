import { SQSEvent, SQSHandler } from 'aws-lambda';
import { 
  EC2Client, StartInstancesCommand, StopInstancesCommand, 
  DescribeInstancesCommand, ModifyInstanceAttributeCommand } from '@aws-sdk/client-ec2';

export interface StartInstancesRequestParameters {
  instanceId: string; 
}

const ec2Client = new EC2Client({});

// インスタンスのタグから代替インスタンスタイプを取得する関数
function getAlternativeInstanceTypeFromTags(tags: any[]): string | null {
  // AlternativeTypeタグを検索
  const alternativeTypeTag = tags.find(tag => tag.Key === 'AlternativeType');
  
  if (alternativeTypeTag && alternativeTypeTag.Value) {
    console.log(`Found AlternativeType tag with value: ${alternativeTypeTag.Value}`);
    return alternativeTypeTag.Value;
  }
  
  return null;
}

// インスタンスタイプの変更とインスタンスの起動を行う関数
async function modifyInstanceTypeAndLaunch(instanceId: string): Promise<void> {
  try {
    // インスタンスの詳細情報を取得（状態とタグの両方を一度に取得）
    const describeResult = await ec2Client.send(new DescribeInstancesCommand({
      InstanceIds: [instanceId]
    }));
    
    const instance = describeResult.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
      console.error(`Instance ${instanceId} not found`);
      return;
    }
    
    const state = instance.State?.Name;
    const currentInstanceType = instance.InstanceType;
    const tags = instance.Tags || [];
    
    console.log(`Instance ${instanceId} current state: ${state}, type: ${currentInstanceType}`);
    
    // インスタンスのタグから代替インスタンスタイプを取得
    const alternativeType = getAlternativeInstanceTypeFromTags(tags);
    
    // 代替インスタンスタイプがなければ終了
    if (!alternativeType) {
      console.error(`No AlternativeType tag found for instance ${instanceId}`);
      return;
    }
    
    console.log(`Current instance type: ${currentInstanceType}, Alternative type: ${alternativeType}`);
    
    // インスタンスが停止していない場合は停止する
    if (state !== "stopped") {
      console.log(`Stopping instance ${instanceId}...`);
      await ec2Client.send(new StopInstancesCommand({
        InstanceIds: [instanceId]
      }));
      
      // インスタンスの停止を確認するループ
      console.log(`Waiting for instance ${instanceId} to stop...`);
      let instanceStopped = false;
      while (!instanceStopped) {
        // 最新のインスタンス状態を取得
        const checkResult = await ec2Client.send(new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        }));
        const currentState = checkResult.Reservations?.[0]?.Instances?.[0]?.State?.Name;
        
        if (currentState === 'stopped') {
          instanceStopped = true;
          console.log(`Instance ${instanceId} is now stopped`);
        } else {
          console.log(`Instance state: ${currentState}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        }
      }
    } else {
      console.log(`Instance ${instanceId} is already stopped`);
    }

    // インスタンスタイプの変更
    console.log(`Modifying instance ${instanceId} to alternative type ${alternativeType}...`);
    await ec2Client.send(new ModifyInstanceAttributeCommand({
      InstanceId: instanceId,
      InstanceType: { Value: alternativeType }
    }));

    // インスタンスの起動
    console.log(`Starting instance ${instanceId} with alternative type...`);
    await ec2Client.send(new StartInstancesCommand({
      InstanceIds: [instanceId]
    }));
    
    console.log(`Successfully modified instance ${instanceId} to alternative type ${alternativeType}`);
  } catch (error) {
    console.error('Error modifying instance type:', error);
    throw error;
  }
}

// SQS のイベントの型で関数を定義
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const message: StartInstancesRequestParameters = JSON.parse(record.body);
      console.log('Processing message:', JSON.stringify(message));

      const instanceId = message.instanceId;
      if (!instanceId || instanceId === '') {
        console.log('Empty instance ID received');
        continue; // Skip this record and process the next one
      }
      
      console.log(`Processing instance ID: ${instanceId}`);
      // インスタンス ID に対し、インスタンスタイプの変更と起動を行う関数を実行
      await modifyInstanceTypeAndLaunch(instanceId);

    } catch (error) {
      console.error('Error processing message:', error);
      throw error; // This will cause the message to return to the queue
    }
  }
};
