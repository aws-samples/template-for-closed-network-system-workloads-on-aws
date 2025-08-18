import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class Bucket extends Construct {
  public readonly bucket: aws_s3.Bucket;
  constructor(scope: Construct, id: string, props: {
    versioned: boolean;
  }) {
    super(scope, id);
    const accessLogBucket = new aws_s3.Bucket(this, `${id}AccessLogBucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      objectOwnership: aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });
    this.bucket = new aws_s3.Bucket(this, `${id}Bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      serverAccessLogsBucket: accessLogBucket,
      autoDeleteObjects: true,
      objectOwnership: aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      versioned: props.versioned
    });

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(accessLogBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          "This bucket is for access logs of the bucket. So it doesn't need more access log bucket.",
      },
    ]);
  }
}
