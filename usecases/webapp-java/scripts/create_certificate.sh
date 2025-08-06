#!/bin/bash
set -e

# 使用方法の説明
if [ $# -gt 1 ]; then
  echo "使用方法: $0 [AWSプロファイル]"
  echo "例: $0 myprofile"
  echo "注: AWSプロファイルを指定しない場合は、defaultプロファイルが使用されます。"
  exit 1
fi

# parameter.tsからステージ名とドメイン名を取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKING_DIR="${SCRIPT_DIR}/../"
PARAMETER_FILE="${WORKING_DIR}/parameter.ts"

# Node.jsを使用してparameter.tsから値を抽出
STAGE_NAME=$(node -e "
  const fs = require('fs');
  const content = fs.readFileSync('${PARAMETER_FILE}', 'utf8');
  const deployEnvMatch = content.match(/deployEnv: ['\"]([^'\"]+)['\"],/);
  if (deployEnvMatch && deployEnvMatch[1]) {
    console.log(deployEnvMatch[1]);
  }
")

DOMAIN_NAME=$(node -e "
  const fs = require('fs');
  const content = fs.readFileSync('${PARAMETER_FILE}', 'utf8');
  const domainNameMatch = content.match(/domainName: ['\"]([^'\"]+)['\"],/);
  if (domainNameMatch && domainNameMatch[1]) {
    console.log(domainNameMatch[1]);
  }
")

# 値が取得できなかった場合はエラー
if [ -z "$STAGE_NAME" ] || [ -z "$DOMAIN_NAME" ]; then
  echo "エラー: parameter.tsからステージ名またはドメイン名を取得できませんでした。"
  exit 1
fi

# AWSプロファイルは引数から取得（オプション）
AWS_PROFILE=${1:-default}

# ディレクトリの設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKING_DIR="${SCRIPT_DIR}/../"
SSL_DIR="${WORKING_DIR}/ssl"

# SSLディレクトリが存在しない場合は作成
mkdir -p ${SSL_DIR}

echo "ステージ名: ${STAGE_NAME}"
echo "ドメイン名: ${DOMAIN_NAME}"
echo "AWSプロファイル: ${AWS_PROFILE}"
echo "作業ディレクトリ: ${WORKING_DIR}"
echo "SSL証明書ディレクトリ: ${SSL_DIR}"

# ルート証明書の秘密鍵を作成
echo "ルート証明書の秘密鍵を作成中..."
openssl genpkey -out ${SSL_DIR}/ca.key -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -pass pass:template@pp1234

# ルート証明書を作成
echo "ルート証明書を作成中..."
openssl req -new -x509 -key ${SSL_DIR}/ca.key -days 3650 -out ${SSL_DIR}/ca.pem -passin pass:template@pp1234 -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=Template Common Name"

# 中間証明書の秘密鍵を作成
echo "中間証明書の秘密鍵を作成中..."
openssl genpkey -out ${SSL_DIR}/ica.key -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -pass pass:template@pp1234

# 中間証明書のCSRを作成
echo "中間証明書のCSRを作成中..."
openssl req -new -key ${SSL_DIR}/ica.key -sha256 -outform PEM -keyform PEM -out ${SSL_DIR}/ica.csr -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=Template Common Name"

# 中間証明書を作成
echo "中間証明書を作成中..."
openssl x509 -extfile ${SSL_DIR}/openssl_sign_inca.cnf -req -in ${SSL_DIR}/ica.csr -sha256 -CA ${SSL_DIR}/ca.pem -CAkey ${SSL_DIR}/ca.key -set_serial 01 -extensions v3_ca -days 3650 -out ${SSL_DIR}/ica.pem

# サーバー証明書の秘密鍵を作成
echo "サーバー証明書の秘密鍵を作成中..."
openssl genrsa 2048 > ${SSL_DIR}/server.key

# サーバー証明書のCSRを作成
echo "サーバー証明書のCSRを作成中..."
openssl req -new -key ${SSL_DIR}/server.key -outform PEM -keyform PEM -sha256 -out ${SSL_DIR}/server.csr -subj "/C=JP/ST=Tokyo/O=Template Sample App/CN=*.${DOMAIN_NAME}"

# サーバー証明書を作成
echo "サーバー証明書を作成中..."
openssl x509 -req -in ${SSL_DIR}/server.csr -sha256 -CA ${SSL_DIR}/ica.pem -CAkey ${SSL_DIR}/ica.key -set_serial 01 -days 3650 -out ${SSL_DIR}/server.pem

# 証明書をACMにインポート
echo "証明書をACMにインポート中..."
PROFILE_OPTION=""
if [ "${AWS_PROFILE}" != "default" ]; then
  PROFILE_OPTION="--profile ${AWS_PROFILE}"
fi

# 出力先ディレクトリを作成
OUTPUT_DIR="${SCRIPT_DIR}/../config"
mkdir -p ${OUTPUT_DIR}

# 証明書をインポートしてARNをJSONファイルに保存
aws acm import-certificate --certificate fileb://${SSL_DIR}/server.pem --certificate-chain fileb://${SSL_DIR}/ica.pem --private-key fileb://${SSL_DIR}/server.key ${PROFILE_OPTION} | tee ${OUTPUT_DIR}/certificate_arn.json

echo "証明書のARN: $(cat ${OUTPUT_DIR}/certificate_arn.json | grep CertificateArn | cut -d'"' -f4)"
echo "証明書の作成とインポートが完了しました。"
echo "証明書ARNは ${OUTPUT_DIR}/certificate_arn.json に保存されました。"
