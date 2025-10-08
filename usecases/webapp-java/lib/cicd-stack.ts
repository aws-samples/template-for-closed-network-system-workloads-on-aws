import { StackProps, Stack, aws_ecr, aws_ecs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Constructs
import { Ecr } from './construct/ecr/ecr';
import { CodePipelineWebappJava } from './construct/codepipeline/codepipeline-webapp-java';
import path from 'path';

interface CicdStackProps extends StackProps {
  ecsService: aws_ecs.FargateService;
  containerName: string;
  filePathOfSourceArtifact: string;
}

export class CicdStack extends Stack {
  public readonly batchRepository: aws_ecr.Repository;
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    // Create ECR
    const webappContainerRepository = new Ecr(this, 'Webapp').containerRepository;
    this.batchRepository = new Ecr(this, 'Batch', path.join(__dirname, '../batch')).containerRepository;

    // Create Deploy Pipeline
    new CodePipelineWebappJava(this, `CodePipeline`, {
      bucketKey: props.filePathOfSourceArtifact,
      ecrRepository: webappContainerRepository,
      ecsService: props.ecsService,
      containerName: props.containerName,
    });

  }
}
