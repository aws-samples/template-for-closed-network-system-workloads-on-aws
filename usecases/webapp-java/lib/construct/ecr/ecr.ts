import { aws_ecr, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class Ecr extends Construct {
  public readonly containerRepository: aws_ecr.Repository;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.containerRepository = new aws_ecr.Repository(this, `${id}Repository`, {
      imageScanOnPush: true,
      encryption: aws_ecr.RepositoryEncryption.KMS,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true // For develop environment
    });

    new CfnOutput(this, 'RepositoryName', {
      exportName: `${id}ContainerRepositoryName`,
      value: this.containerRepository.repositoryName,
    });
    new CfnOutput(this, 'RepositoryUri', {
      exportName: `${id}ContainerRepositoryUri`,
      value: this.containerRepository.repositoryUri,
    });
    new CfnOutput(this, 'EcrRegion', {
      exportName: `${id}Region`,
      value: this.containerRepository.env.region,
    });
  }
}
