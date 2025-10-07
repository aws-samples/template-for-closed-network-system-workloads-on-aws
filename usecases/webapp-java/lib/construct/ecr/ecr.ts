import { aws_ecr, aws_ecr_assets, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecrdeploy from 'cdk-ecr-deployment';
import { NagSuppressions } from 'cdk-nag';

export class Ecr extends Construct {
  public readonly containerRepository: aws_ecr.Repository;
  public readonly ecrDeployment?: ecrdeploy.ECRDeployment;
  constructor(scope: Construct, id: string, imagePath?: string) {
    super(scope, id);

    this.containerRepository = new aws_ecr.Repository(this, `${id}Repository`, {
      imageScanOnPush: true,
      encryption: aws_ecr.RepositoryEncryption.KMS,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true // For develop environment
    });

    if (imagePath) {
      const dockerImageAsset = new aws_ecr_assets.DockerImageAsset(
        this,
        "DockerImageAsset",
        {
          directory: imagePath,
        }
      );

      this.ecrDeployment = new ecrdeploy.ECRDeployment(this, `${id}ImageDeployment`, {
        src: new ecrdeploy.DockerImageName(dockerImageAsset.imageUri),
        dest: new ecrdeploy.DockerImageName(this.containerRepository.repositoryUriForTag('latest')),
      })
    }


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

    // CDK Nag Suppressions
    if (imagePath && this.ecrDeployment) {
      NagSuppressions.addResourceSuppressions(this.ecrDeployment, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'The construct uses managed policies for ECR deployment functionality',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
        }
      ]);
    }
  }
}
