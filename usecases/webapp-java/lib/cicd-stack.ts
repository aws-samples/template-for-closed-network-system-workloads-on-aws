import { CfnOutput, StackProps, Stack, aws_codecommit, aws_ec2, aws_ecr, aws_ecs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Constructs
import { Ecr } from './construct/ecr/ecr';
import { CodePipelineWebappJava } from './construct/codepipeline/codepipeline-webapp-java';

interface CicdStackProps extends StackProps {
  ecsService: aws_ecs.FargateService;
  containerName: string;
}

export class CicdStack extends Stack {
  public readonly batchRepository: aws_ecr.Repository;
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    // Create ECR
    const webappContainerRepository = new Ecr(this, 'Webapp').containerRepository;
    this.batchRepository = new Ecr(this, 'Batch').containerRepository;

    // Create Pipeline
    const codecommitRepository = new aws_codecommit.Repository(this, 'SourceRepository', {
      repositoryName: `${id.toLowerCase()}-webapp-source`,
    });

    // Create Deploy Pipeline
    new CodePipelineWebappJava(this, `CodePipeline`, {
      codeCommitRepository: codecommitRepository,
      ecrRepository: webappContainerRepository,
      ecsService: props.ecsService,
      containerName: props.containerName,
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
