# infra

[View this page in English](./README.md)

AWS 上にサンプルアプリケーションやバッチシステムを動かす環境を構築する CDK のコードです。

## 準備

### 1. AWS CLI の設定

CDK を利用するため、コマンドを実行する端末で AWS の設定が必要になります。

```bash
$ aws configure --profile {プロファイル名}
```

と実行し、表示されるプロンプトに応じて、必要な情報を入力してください。

IAM ユーザ作成時に表示される、アクセスキーとシークレットキー、デフォルトのリージョンが確認されます。
詳しくは[aws configure を使用したクイック設定 - プロファイル](https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/cli-configure-quickstart.html#cli-configure-quickstart-profiles)をご参照ください。

### 2. stages.js の書き換え

本テンプレートは、タスクランナーの[gulp](https://gulpjs.com/)を利用してデプロイを行います。
gulp から参照される変数が`stages.js`で定義されているため、各自の環境に合わせて変更します。

```javascript
default: {
    appName,
    awsProfile: 'myProfile',
    alias: 'default',
    deployEnv: 'dev',
    notifyEmail: 'johndoe@johndoe.mail.com',
    enabledPrivateLink: false,
    windowsBastion: true,
    linuxBastion: true,
    domainName: 'templateapp.local',
  },
alias: {
    appName: '',               // アプリの名前を入力します。 例: demoapp, など
    awsProfile: '',            // 1で設定したProfile名を入力します。
    alias: '',                 // 個々人で環境面が被るのを回避するため、ユーザ名などの識別子を入力してください。 例: ysuzuki, など
    deployEnv: ''              // デプロイする環境の面を記載します。例: dev, stage, prod, など
    notifyEmail: '',           // ジョブが失敗した際の通知先メールアドレス
    enabledPrivateLink: false, // PrivateLinkを利用するかどうか。trueは利用し、falseは利用しない
    windowsBastion: true,      // WindowsのBastionインスタンスを利用する場合はtrue、利用しない場合はfalse
    linuxBastion: true,        // Amazon LinuxのBastionインスタンスを利用する場合はtrue、利用しない場合はfalse
    domainName: 'templateapp.local', // Private Hosted Zoneに登録されるドメイン名
}
```

### 3. 自己署名付き証明書の作成

HTTPS 通信を実装するために、今回は自己署名付き証明書を用います。
`infra`ディレクトリで次のコマンドを実行し、Amazon Certificate Manager に証明書をインポートしてください。
また、以下のコマンド実行前に、`OpenSSL`のインストールを実施してください。

```bash
$ npm install
$ npm run create-certificate -- --{alias}
```

## デプロイ

### 1. CDK

`infra`ディレクトリで以下のコマンドを実行してください。
自動的に CDK が実行され、AWS の各リソースが生成されます。

```bash
$ npm run deploy -- --{alias}
```

デプロイ後、ターミナル上に以下に示すようなコマンドが出力されますので、コピーして実行してください。
生成された EC2 インスタンス 用の Keypair がそれぞれ取得できます。
コンソール接続する場合や Fleet Manager から RDP 接続する際には、Keypair の取得を行ってください。（コマンド実行時には Profile の指定をお願いします）

```
// regionがap-northeast-1のWindowsインスタンスの場合
$ {alias}{stage}{appName}Webapp.WindowsGetSSHKeyForWindowsInstanceCommand = aws ssm get-parameter --name /ec2/keypair/key-XXXXXXXXXXXXXXXXX --region ap-northeast-1 --with-decryption --query Parameter.Value --output text

// regionがap-northeast-1のAmazonLinuxインスタンスの場合
$ {alias}{stage}{appName}Webapp.LinuxGetSSHKeyForLinuxInstanceCommand = aws ssm get-parameter --name /ec2/keypair/key-XXXXXXXXXXXXXXXXX --region ap-northeast-1 --with-decryption --query Parameter.Value --output text
```

また、CDK のデプロイが完了すると、`stages.js` に登録したメールアドレス宛に、Amazon SNS よりサブスクリプションの確認メールが届きます。

ジョブが失敗した通知を受けるために、届いたメールの内容に従い、サブスクリプションの Confirmation を実施してください。

また、バッチジョブは平日 21 時に実行される設定になっています。このあと実施する、サンプル Web アプリのデプロイによって登録される初期データは、ジョブがすべて成功する設定になっているため、メールは送信されません。
もし、失敗を確認したい場合は、`webapp-java/src/main/resources/data.sql`の 5 つある`true`のいずれかを`false`へ変更した上で、Web アプリのデプロイを行ってください。

### 2. サンプル Web アプリ

CDK のデプロイが完了したことで、AWS CodeCommit に サンプル Web アプリ用のリポジトリが作成されています。
以下の手順で、`webapp-java` ディレクトリのソースコードをプッシュすることで、サンプル Web アプリがパイプラインからデプロイされます。

```bash
$ cd ./webapp-java
$ git init
$ git remote add origin https://git-codecommit.{your region}.amazonaws.com/v1/repos/{your repository name}
$ git add .
$ git commit -m "Initial commit"
$ git push --set-upstream origin main
$ git checkout -b develop
$ git push --set-upstream origin develop
```

※CodePipeline のトリガーは develop ブランチを監視しています。そのため、develop ブランチの作成が必要になります。

パイプラインの状況を確認したい場合は、マネジメントコンソールより AWS CodePipeline へアクセスしてください。

#### CI/CD パイプライン

Web アプリ向けの CI/CD は BlackBelt で紹介されている[構成例(Page 52)](https://d1.awsstatic.com/webinars/jp/pdf/services/20201111_BlackBelt_AWS%20CodeStar_AWS_CodePipeline.pdf)を元に実装しています。

ご自身の Web アプリケーションに差し替えたい場合は、CodeCommit にプッシュするソースコードをご自身のものに差し替え、ご自身の環境やアプリケーションに合わせ、Dockerfile を修正してください。

### 4. 作成した環境の削除

生成した環境を削除したい場合は、以下のコマンドを実行してください。
ECR など、状況によっては残ってしまうリソースもあるため、手動での削除が必要な場合があります。
ご参考：[(ecr): add option to auto delete images upon ECR repository removal #12618 ](https://github.com/aws/aws-cdk/issues/12618)
コマンドが失敗した場合は、エラーメッセージや CloudFormation のコンソールで内容をご確認の上、対応ください。

```
$ npm run destroy -- --{alias}
```

### その他のコマンド

CDK のコマンドである、`diff, list`は、gulp で実装済みのため、これらのコマンドも gulp 経由で実行可能です。

```
$ npm run diff -- --{alias}
$ npm run list -- --{alias}
```

## AWS Step Functions で実装するジョブ管理基盤

ジョブ管理基盤は、「① ワークフローが作成できること」「② 再実行が可能なこと」「③ 失敗時に通知が出せること」といった機能が求められます。
① のワークフローについては、Step Functions で実現可能ですが、② や ③ は実装が必要になります。
本サンプルでは、この ②、③ の実装例をご提供します。

今回実装したサンプルは、Step Functions のステートマシンが親子関係になっており、親側がメインのワークフロー、子側で ② と ③ を実現しています。
ステートマシンにおけるワークフローの作成方法については、[公式のドキュメント](https://d1.awsstatic.com/webinars/jp/pdf/services/20201111_BlackBelt_AWS%20CodeStar_AWS_CodePipeline.pdf?page=52)をご参照ください。

ここでは、実装している ②、③ について解説します。
以下の図は、親のステートマシンから呼び出される、子のステートマシンを示しています。

![Job](../docs/images/job.png)

子のステートマシンでは、ある一つのジョブスクリプトが実行されますが、以下の流れに沿って実行されます。

1. ジョブスクリプトの当日の実行状態を確認する
2. ジョブが成功しているか判定する
   1. 成功していれば、ジョブはスキップされます
3. 成功以外であれば、ジョブスクリプトを実行する
4. ジョブスクリプトの結果が成功なら、実行状態を"SUCCEEDED"として登録し、このステートマシンを終了する
5. ジョブスクリプトの結果が失敗なら、実行状態を"FAILED"として登録する
6. 続けて、失敗したことをメールで通知する
7. ステートマシンとして失敗したことを設定し、終了する

状態の確認や状態の登録時に、DynamoDB にアクセスし、ジョブの実行状態が、実行日付とジョブの ID をキーとして、参照・登録されます。
このような実行状態の管理を行うことで、② のジョブの再実行を可能にしています。

③ のジョブの失敗通知は、Step Functions が SNS の API を実行することで、失敗したジョブ ID を連携し、購読されているメールアドレスに通知が送信されます。

## CDK の静的解析

本プロジェクトの CDK のコードは、[cdk-nag](https://github.com/cdklabs/cdk-nag/blob/main/README.md)を利用して静的解析を実施しています。
提供されているルールに沿った実装ができているか確認することで、致命的なセキュリティリスクを予防します。

例外化しているルールは、ソースコードの下部にまとめて記載しています。
必要に応じて例外化の追加・削除を実施ください。

具体的な使い方については、[AWS Cloud Development Kit と cdk-nag でアプリケーションのセキュリティとコンプライアンスを管理する](https://aws.amazon.com/jp/blogs/news/manage-application-security-and-compliance-with-the-aws-cloud-development-kit-and-cdk-nag/)、にて解説していますので、ご参照ください。

## Security Hub のチェック結果

Security Hub を有効にした場合、デフォルトで有効になる基準は以下の 2 つです。

- [AWS Foundational Security Best Practices (FSBP) standard](https://docs.aws.amazon.com/ja_jp/securityhub/latest/userguide/fsbp-standard.html)
- [Center for Internet Security (CIS) AWS Foundations Benchmark v1.2.0](https://docs.aws.amazon.com/ja_jp/securityhub/latest/userguide/cis-aws-foundations-benchmark.html)

これらのチェックが行われると、ベンチマークレポートで重要度が CRITICAL あるいは HIGH のレベルでレポートされる検出項目があります。
これらに対しては、別途対応が必要になります。

### ルートユーザへの MFA の適用

#### 検出項目

- [[CIS.1.13] Ensure MFA is enabled for the "root" account](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cis-controls.html#securityhub-cis-controls-1.13)
- [[CIS.1.14] Ensure hardware MFA is enabled for the "root" account](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cis-controls.html#securityhub-cis-controls-1.14)
- [[IAM.6] Hardware MFA should be enabled for the root user](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards-fsbp-controls.html#fsbp-iam-6)

#### 修復方法

- ルートユーザで AWS にログインし、以下のドキュメントに沿って MFA を有効化してください。
  - [AWS アカウント のルートユーザー (コンソール) 用にハードウェア TOTP トークンを有効にします](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_enable_physical.html#enable-hw-mfa-for-root)

### CodeBuild の特権モードの無効化

#### 検出項目

- [[CodeBuild.5] CodeBuild project environments should not have privileged mode enabled](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards-fsbp-controls.html#fsbp-codebuild-5)

#### 修復方法

- CodeBuild では、Docker イメージをビルドする必要がある場合を除き、特権モードは無効化してください。本テンプレートでは、Docker イメージのビルドを行っているため、有効化していますが、実際に利用される場合は、ご自身の環境に合った設定にご変更ください。
  - テンプレートだけの対応であれば、[CodePipeline のコンストラクト内の特権モードの設定](lib/constructs/codepipeline/codepipeline.ts#L65)を`false`に変更してください。
  - ご参考：[interface BuildEnvironment - privileged](https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-codebuild.BuildEnvironment.html#privileged)

## 本番利用時の考慮点

### EC2 へのパッチ適用について

運用管理のため EC2 インスタンスを利用する場合、パッチを当てる方法についてもご検討ください。
Session Manager を経由して手動でパッチを当てることも可能ですが、自動でパッチを当てるには、Patch Manager が有用です。
詳しくは、[AWS Systems Manager Patch Manager](https://docs.aws.amazon.com/ja_jp/systems-manager/latest/userguide/systems-manager-patch.html)をご参照ください。

また、パッチ適用といった変更管理における考え方に限らず、AWS では長年培った経験をもとにベストプラクティスをフレームワークとしてまとめた、[AWS Well-Architected Framework](https://docs.aws.amazon.com/ja_jp/wellarchitected/latest/framework/welcome.html)を公開しています。ぜひご参照ください。

### コンテナイメージのタグについて

本サンプルでは、バッチのコンテナイメージのタグに latest が付与されています。
Web アプリのコンテナイメージに対しては、CodeCommit へのコミットから始まるパイプラインによって、コミットハッシュを利用したバージョンニングを実施します。
バッチでも同様のパイプラインを導入することで、コミットハッシュを利用したバージョニングが可能です。

### HTTPS の証明書について

本サンプルでは、自己署名付き証明書を利用して HTTPS を用いた通信を行なっています。
自己署名付き証明書のため、あくまで検証用としてご利用ください。
