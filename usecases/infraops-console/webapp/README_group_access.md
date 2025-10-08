# グループベースのアクセス制御機能

このドキュメントでは、EC2インスタンス管理ツールに実装されたグループベースのアクセス制御機能について説明します。

## 概要

グループベースのアクセス制御機能により、以下のことが可能になります：

1. 各ユーザーに特定のグループID（`groupId`）を割り当てる
2. EC2インスタンスに特定のグループID（`GroupId`タグ）を割り当てる
3. ユーザーは自分のグループIDに一致するインスタンスのみを表示・操作できる
4. 管理者（admin）はすべてのインスタンスを表示・操作できる

## 実装内容

### 1. ユーザーモデルの拡張

ユーザーモデルに`groupId`フィールドを追加しました。

```typescript
export type User = {
  email: string;
  role: 'admin' | 'user';
  groupId: string | null; // ユーザーが所属するグループのID、adminはnull可
  createdAt: string;
};
```

- `admin`ロールのユーザーは`groupId`が`null`の場合、すべてのグループのインスタンスにアクセスできます
- `user`ロールのユーザーは自分の`groupId`に一致するインスタンスのみアクセスできます

### 2. ユーザー管理画面の拡張

ユーザー管理画面に以下の機能を追加しました：

- ユーザー追加時にグループIDを設定できるようになりました
- ユーザー一覧にグループID列を追加しました
- 一般ユーザーにはグループIDが必須になりました

### 3. インスタンス一覧・操作の制限

- 管理者はすべてのインスタンスを表示・操作できます
- 一般ユーザーは自分のグループIDに一致するインスタンスのみ表示・操作できます
- 管理者のみインスタンスのグループID情報を表示できます

## セットアップ手順

### 1. 既存のユーザーデータの移行

既存のユーザーデータに`groupId`フィールドを追加するには、以下のスクリプトを実行します：

```bash
cd usecases/webapp-java/infraops-console/scripts
chmod +x migrate-users.sh
./migrate-users.sh
```

このスクリプトは以下の処理を行います：
- 管理者ユーザーの`groupId`を`null`に設定
- 一般ユーザーの`groupId`を`default-group`に設定

### 2. EC2インスタンスへのグループIDタグの追加

EC2インスタンスに`GroupId`タグを追加するには、以下のスクリプトを実行します：

```bash
cd usecases/webapp-java/infraops-console/scripts
chmod +x add-group-tags.sh
./add-group-tags.sh
```

このスクリプトは以下の処理を行います：
- `aws:cloudformation:stack-name`タグが`devSharedNetwork`のインスタンスを検索
- 各インスタンスに`GroupId`タグを追加（デフォルト値は`default-group`）
- 既に`GroupId`タグがあるインスタンスはスキップ

### 3. 新規ユーザーの作成

新規ユーザーを作成する場合は、管理者がユーザー管理画面から作成します。一般ユーザーを作成する場合は、グループIDの入力が必須です。

## グループIDの管理

### インスタンスのグループID変更

特定のインスタンスのグループIDを変更するには、AWS Management ConsoleまたはAWS CLIを使用します：

```bash
aws ec2 create-tags \
  --resources i-1234567890abcdef0 \
  --tags Key=GroupId,Value=your-group-id \
  --profile closedtemplate \
  --region us-east-1
```

### ユーザーのグループID変更

ユーザーのグループIDを変更するには、管理者がユーザー管理画面から該当ユーザーを削除し、新しいグループIDで再作成します。

## 注意事項

1. グループIDは任意の文字列を使用できますが、一貫性のある命名規則を使用することをお勧めします
