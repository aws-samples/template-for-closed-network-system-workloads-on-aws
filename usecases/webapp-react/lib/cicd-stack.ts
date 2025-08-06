import { CfnOutput, StackProps, Stack, aws_codecommit, aws_ec2, aws_ecr, aws_s3 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Constructs
import { Ecr } from './construct/ecr/ecr';
import { CodePipelineWebappReact } from './construct/codepipeline/codepipeline-webapp-react';

interface CicdStackProps extends StackProps {
  s3Bucket: aws_s3.Bucket;
}

export class CicdStack extends Stack {
  public readonly batchRepository: aws_ecr.Repository;
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    // Create ECR
    this.batchRepository = new Ecr(this, 'Batch').containerRepository;

    // Create Pipeline
    const codecommitRepository = new aws_codecommit.Repository(this, 'SourceRepository', {
      repositoryName: `${id.toLowerCase()}-webapp-source`,
    });

    // Create Deploy Pipeline
    new CodePipelineWebappReact(this, `CodePipeline`, {
      codeCommitRepository: codecommitRepository,
      s3bucket: props.s3Bucket,
    });

    // Output
    new CfnOutput(this, 'SourceRepositoryName', {
      exportName: 'WebappSourceRepositoryName',
      value: codecommitRepository.repositoryName,
    });
    new CfnOutput(this, 'SourceRepositoryUrl', {
      exportName: 'WebappSourceRepositoryUrl',
      value: codecommitRepository.repositoryCloneUrlHttp,
    });
  }
}
