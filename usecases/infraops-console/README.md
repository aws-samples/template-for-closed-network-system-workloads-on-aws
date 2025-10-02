# infraops-console

## 概要とアーキテクチャ

infraops-consoleは、クローズドネットワーク環境でAWSリソースを安全に管理するためのWebコンソールアプリケーションです。EC2インスタンス、ECSサービス、RDSデータベースの操作を統合的に行うことができ、グループベースのアクセス制御（ABAC）により、組織内の複数チームが安全にリソースを共有できます。

### システムアーキテクチャ

![infraops-console](../../docs/images/infraops-console.drawio.png)

### 主要コンポーネント

- **Remix Web Application**: React/TypeScriptベースのフロントエンド
- **Amazon Cognito**: ユーザー認証とグループ管理
- **Identity Pool + ABAC**: 属性ベースアクセス制御
- **AWS SDK**: EC2、ECS、RDSリソースの操作
- **EventBridge Scheduler**: 自動起動/停止スケジューリング
- **Lambda Function**: ICE（Insufficient Capacity Error）自動復旧
- **SQS FIFO Queue**: イベント処理の信頼性確保

## 前提条件

### 必要なAWSリソース

1. **VPC環境**
   - プライベートサブネット

2. **VPCエンドポイント**
   - App Runner用VPCエンドポイント

3. **管理対象リソース**
   - EC2インスタンス（`GroupId`タグ付き）
   - ECSクラスター・サービス（`GroupId`タグ付き）
   - RDSクラスター・インスタンス（`GroupId`タグ付き）

### 設定ファイル

`parameter.ts`で以下の値を設定してください：

```typescript
export default {
  deployEnv: 'dev',                              // デプロイ環境
  sourceVpcId: 'vpc-xxxxxxxxx',                  // 対象VPCのID
  appRunnerVpcEndpointId: 'vpce-xxxxxxxxx'       // App Runner VPCエンドポイントID
};
```

### 必要な権限

デプロイを実行するIAMユーザー/ロールには以下の権限が必要です：
- CDK関連の権限（CloudFormation、IAM等）
    - Cognito User Pool/Identity Pool作成権限
    - Lambda、SQS、EventBridge作成権限
    - EC2、ECS、RDS操作権限

## セキュリティ考慮事項

### クローズドネットワーク環境

- **インターネット非公開**: App Runnerサービスは`isPubliclyAccessible: false`で設定
- **VPCエンドポイント経由**: すべての通信はVPCエンドポイント経由で実行
- **プライベート通信**: AWSサービス間の通信はAWSバックボーン内で完結

### 認証・認可

- **多要素認証**: Cognitoでの強力なパスワードポリシー
- **セッション管理**: 短時間のトークン有効期限（60分）
- **グループベース制御**: 管理者と一般ユーザーの明確な権限分離

### データ保護

- **最小権限の原則**: IAMポリシーでの細かな権限制御

## 機能一覧

### EC2インスタンス管理

- **基本操作**
  - インスタンス一覧表示
  - 起動/停止操作
  - 状態監視

- **高度な機能**
  - 代替インスタンスタイプ設定
  - ICE（容量不足エラー）自動復旧
  - スケジュール起動/停止

### ECSサービス管理

- **サービス操作**
  - サービス一覧表示
  - Desired Count変更
  - サービス状態監視

### RDSデータベース管理

- **データベース操作**
  - クラスター/インスタンス一覧表示
  - 起動/停止操作

### スケジューリング機能

- **自動化**
  - Cronベースのスケジュール設定
  - 起動/停止の自動実行
  - スケジュール管理（作成/削除/更新）

### ユーザー管理（管理者機能）

- **ユーザー操作**
  - ユーザー作成/削除
  - グループ割り当て
  - 権限管理

### ICE自動復旧機能

- **自動復旧**
  - CloudTrailイベント監視
  - 代替インスタンスタイプでの自動復旧
  - SQSキューによる信頼性確保

## How to Use

### デプロイ方法

1. **依存関係のインストール**
   ```bash
   cd usecases/infraops-console
   npm ci
   ```

2. **パラメータ設定**
   ```bash
   # parameter.tsを編集
   vim parameter.ts
   ```

3. **CDKデプロイ**
   ```bash
   # 初回デプロイ時
   npx cdk bootstrap

   # スタックデプロイ
   npx cdk deploy
   ```

4. **デプロイ完了確認**
   - CloudFormationコンソールでスタック作成完了を確認
   - Cognitoコンソールでユーザープール作成を確認

### 最初のユーザの作り方

デプロイ完了後、CloudFormationの出力に表示されるコマンドを実行して初期管理者ユーザーを作成します：

```bash
# 出力例（実際の値に置き換えてください）
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_xxxxxxxxx \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --region us-east-1 && \
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_xxxxxxxxx \
  --username admin@example.com \
  --group-name Admins \
  --region us-east-1
```

**注意**: `admin@example.com`と`TempPassword123!`を実際の値に置き換えてください。

### 利用方法

#### リソースの操作

1. **ログイン**
   - VPCエンドポイントのURLにアクセス
   - Cognitoの認証画面でログイン
   - 初回ログイン時はパスワード変更が必要

2. **EC2インスタンス操作**
   - ダッシュボードでインスタンス一覧を確認
   - 起動/停止ボタンで操作実行
   - 代替タイプ設定で容量不足対策

3. **スケジュール設定**
   - インスタンスを選択してスケジュール管理画面を表示
   - Cron形式でスケジュール設定
   - 起動/停止アクションを選択

4. **ECS/RDSリソース**
   - 各セクションでリソース一覧を確認
   - 必要に応じて操作を実行

#### （管理者向け）一般ユーザや追加の管理者ユーザの作り方

1. **ユーザー管理画面へアクセス**
   - 管理者でログイン
   - ヘッダーの「ユーザー管理」リンクをクリック

2. **新規ユーザー作成**
   ```
   - 「新規ユーザー追加」ボタンをクリック
   - メールアドレスを入力
   - 一時パスワードを設定
   - ロールを選択（Admin/User）
   - グループIDを設定（一般ユーザーの場合は必須）
   - 「作成」ボタンをクリック
   ```

3. **ユーザー種別の違い**
   - **管理者（Admin）**: すべてのリソースにアクセス可能、ユーザー管理機能利用可能
   - **一般ユーザー（User）**: 自分のグループIDに一致するリソースのみアクセス可能

4. **グループID設定**
   - 一般ユーザーには必ずグループIDを設定
   - 管理対象リソースの`GroupId`タグと一致させる
   - 例：`team-a`, `project-x`, `dev-environment`

## ユーザの権限管理の方法（特にABACの実現方法）

### ABAC（Attribute-Based Access Control）の概要

infraops-consoleでは、以下の属性を使用してアクセス制御を実現しています：

- **ユーザー属性**: Cognitoカスタム属性`custom:groupId`
- **リソース属性**: AWSリソースの`GroupId`タグ
- **プリンシパル属性**: Identity PoolのPrincipalTag`GroupId`

### 実装アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Cognito User    │    │ Identity Pool   │    │ IAM Role        │
│ custom:groupId  │───▶│ PrincipalTag    │───▶│ Policy          │
│ = "team-a"      │    │ GroupId="team-a"│    │ Condition       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                             ┌─────────────────┐
                                             │ AWS Resource    │
                                             │ Tag:GroupId     │
                                             │ = "team-a"      │
                                             └─────────────────┘
```

### 設定手順

#### 1. Cognitoユーザー属性設定

ユーザー作成時に`custom:groupId`属性を設定：

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_xxxxxxxxx \
  --username user@example.com \
  --user-attributes \
    Name=email,Value=user@example.com \
    Name=email_verified,Value=true \
    Name=custom:groupId,Value=team-a \
  --region us-east-1
```

#### 2. Identity Pool PrincipalTag設定

CDKスタックで自動設定される内容：

```typescript
new aws_cognito.CfnIdentityPoolPrincipalTag(this, 'IdentityPoolPrincipalTag', {
  identityPoolId: this.idPool.ref,
  identityProviderName: this.userPool.userPoolProviderName,
  principalTags: {
    'GroupId': 'custom:groupId',  // Cognitoカスタム属性をPrincipalTagにマッピング
  },
  useDefaults: false
});
```

#### 3. IAMポリシー条件設定

一般ユーザー用IAMロールのポリシー例：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:StartInstances",
        "ec2:StopInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/GroupId": "${aws:PrincipalTag/GroupId}"
        }
      }
    }
  ]
}
```

#### 4. リソースタグ設定

管理対象のAWSリソースに`GroupId`タグを設定：

```bash
# EC2インスタンスの例
aws ec2 create-tags \
  --resources i-1234567890abcdef0 \
  --tags Key=GroupId,Value=team-a \
  --region us-east-1

# ECSサービスの例
aws ecs tag-resource \
  --resource-arn arn:aws:ecs:us-east-1:123456789012:service/cluster-name/service-name \
  --tags key=GroupId,value=team-a \
  --region us-east-1

# RDSクラスターの例
aws rds add-tags-to-resource \
  --resource-name arn:aws:rds:us-east-1:123456789012:cluster:cluster-name \
  --tags Key=GroupId,Value=team-a \
  --region us-east-1
```

### アクセス制御の動作

1. **ユーザーログイン**: Cognitoで認証、`custom:groupId`属性取得
2. **トークン交換**: Identity PoolでPrincipalTag`GroupId`設定
3. **API呼び出し**: IAMロールでリソースアクセス
4. **条件評価**: `${aws:PrincipalTag/GroupId}`と`ResourceTag/GroupId`を比較
5. **アクセス許可**: 一致する場合のみアクセス許可

### 管理者権限

管理者は以下の特権を持ちます：

- **全リソースアクセス**: 条件なしでリソース操作可能
- **ユーザー管理**: Cognitoユーザーの作成/削除
- **グループ管理**: ユーザーのグループ割り当て

### グループ管理のベストプラクティス

1. **命名規則**: 一貫したグループID命名（例：`team-{name}`, `project-{name}`）
2. **最小権限**: 必要最小限のリソースアクセス
3. **定期監査**: グループ割り当ての定期的な見直し
4. **タグ管理**: リソースタグの一貫した管理
5. **ドキュメント化**: グループとリソースの対応関係を文書化

### トラブルシューティング

#### アクセス拒否エラー

1. **ユーザーのグループID確認**
   ```bash
   aws cognito-idp admin-get-user \
     --user-pool-id us-east-1_xxxxxxxxx \
     --username user@example.com
   ```

2. **リソースタグ確認**
   ```bash
   aws ec2 describe-instances \
     --instance-ids i-1234567890abcdef0 \
     --query 'Reservations[].Instances[].Tags'
   ```

3. **IAMポリシー確認**
   - CloudTrailでアクセス拒否ログを確認
   - IAMポリシーシミュレーターで条件評価をテスト

この権限管理システムにより、組織内の複数チームが安全にAWSリソースを共有し、各チームは自分たちのリソースのみにアクセスできる環境を実現しています。
