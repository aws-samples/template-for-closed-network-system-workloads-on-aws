import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { ec2Client } from '~/utils/aws.server';
import { requireUser } from '~/utils/auth.server';
import { ArchitectureType, VirtualizationType } from '@aws-sdk/client-ec2';

export async function loader({ request }: LoaderFunctionArgs) {
  // 認証チェック
  await requireUser(request);

  // クエリパラメータからインスタンスファミリーを取得
  const url = new URL(request.url);

  try {
      const filters = [{
          Name: 'location',
          Values: [process.env.AWS_REGION!]
        }];

      const { InstanceTypeOfferings } = await ec2Client.describeInstanceTypeOfferings({ filters });

      // インスタンスタイプの名前のみを抽出
      const instanceTypes = InstanceTypeOfferings?.map(type => type.InstanceType || '') || [];

      // インスタンスタイプを名前でソート
      instanceTypes.sort();

      // 利用可能なインスタンスファミリーのリストも取得
      const families = Array.from(new Set(instanceTypes.map(type => type.split('.')[0])));
      families.sort();

      return { instanceTypes, families };
  } catch (error) {
    console.error('Error fetching instance types:', error);
    return { error: 'インスタンスタイプの取得に失敗しました' };
  }
}
