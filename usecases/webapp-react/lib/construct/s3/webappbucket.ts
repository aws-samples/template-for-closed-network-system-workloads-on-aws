import { aws_s3, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class WebAppBucket extends Construct {
  public readonly webAppBucket: aws_s3.Bucket;
  constructor(
    scope: Construct,
    id: string,
    props: {
      bucketName: string;
    }
  ) {
    super(scope, id);
    const webAppAccessLogBucket = new aws_s3.Bucket(this, `${id}WebAppAccessLogBucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      objectOwnership: aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });
    this.webAppBucket = new aws_s3.Bucket(this, `${id}WepAppBucket`, {
      bucketName: props.bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      serverAccessLogsBucket: webAppAccessLogBucket,
      autoDeleteObjects: true,
      objectOwnership: aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });
    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(webAppAccessLogBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          "This bucket is for access logs of the bucket. So it doesn't need more access log bucket.",
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.webAppBucket, [
      {
        id: 'AwsSolutions-S5',
        reason: 'This bucket is used for website hosting through internal-ALB.',
      },
    ]);
  }
}
