import { Service } from '@aws-sdk/client-ecs';
import { getVerifiedUserInfo } from './jwt-verify.server';
import { Instance } from '@aws-sdk/client-ec2';
import { DBCluster } from '@aws-sdk/client-rds';
import { ScheduleSummary, Tag } from '@aws-sdk/client-scheduler';

// 統一タグインターフェース
interface UnifiedTag {
  key: string;
  value: string;
}

// タグ抽出関数の型定義
type TagExtractor<T> = (resource: T) => UnifiedTag[];

// GroupIdでのフィルタリング専用関数
export async function filterByGroupId<T>(
  resources: T[],
  tagExtractor: TagExtractor<T>,
  request: Request
): Promise<T[]> {
  const {groupId, isAdmin} = await getVerifiedUserInfo(request);
  
  return isAdmin ? resources : resources.filter(resource => {
    const tags = tagExtractor(resource);
    const groupIdTag = tags.find(tag => tag.key === 'GroupId');
    return groupIdTag?.value === groupId;
  });
}

// リソース別タグ抽出関数

// EC2インスタンス用
export const extractEC2Tags: TagExtractor<any> = (instance: Instance) => {
  return (instance.Tags || []).map((tag: any) => ({
    key: tag.Key,
    value: tag.Value
  }));
};

// RDSクラスター用  
export const extractRDSTags: TagExtractor<any> = (cluster: DBCluster) => {
  return (cluster.TagList || []).map((tag: any) => ({
    key: tag.Key,
    value: tag.Value
  }));
};

// ECSサービス用
export const extractECSTags: TagExtractor<Service> = (service: Service) => {
  return (service.tags || []).map((tag: any) => ({
    key: tag.key,
    value: tag.value
  }));
};
