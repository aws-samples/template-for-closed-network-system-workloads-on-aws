import {
  aws_codebuild,
  aws_codecommit,
  aws_codepipeline,
  aws_codepipeline_actions,
  aws_iam,
  aws_kms,
  aws_logs,
  aws_s3,
} from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { EncryptionKey } from '../kms/key';

export class CodePipelineWebappReact extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      codeCommitRepository: aws_codecommit.IRepository;
      s3bucket: aws_s3.Bucket;
    }
  ) {
    super(scope, id);

    const pipeline = new aws_codepipeline.Pipeline(this, 'WebappPipeline', {
      enableKeyRotation: true,
    });

    // Source stage
    const sourceOutput = new aws_codepipeline.Artifact('SourceArtifact');
    const sourceAction = new aws_codepipeline_actions.CodeCommitSourceAction({
      actionName: 'GetSourceCodeFromCodeCommit',
      repository: props.codeCommitRepository,
      branch: 'develop',
      output: sourceOutput,
      trigger: aws_codepipeline_actions.CodeCommitTrigger.POLL,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    // Build stage
    const buildLogGroup = new aws_logs.LogGroup(this, 'BuildLogGroup', {
      encryptionKey: new EncryptionKey(this, 'BuildLogGroupEncryptionKey', {
        servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    const buildActionProject = new aws_codebuild.PipelineProject(this, 'BuildProject', {
      buildSpec: aws_codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'),
      encryptionKey: new aws_kms.Key(this, 'BuildActionProjectKey', { enableKeyRotation: true }),
      logging: {
        cloudWatch: {
          enabled: true,
          logGroup: buildLogGroup,
        },
      },
      environment: {
        privileged: true,
        buildImage: aws_codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
      },
    });

    const buildOutput = new aws_codepipeline.Artifact();
    const buildAction = new aws_codepipeline_actions.CodeBuildAction({
      actionName: 'BuildReactOnCodeBuild',
      project: buildActionProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });
    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    });

    // Deploy stage
    const deployAction = new aws_codepipeline_actions.S3DeployAction({
      actionName: 'DeployBuildFileToS3',
      input: buildOutput,
      bucket: props.s3bucket,
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(buildActionProject, [
      {
        id: 'AwsSolutions-CB3',
        reason: 'To build docker image on CodeBuild host.',
      },
    ]);
    NagSuppressions.addResourceSuppressions(pipeline.artifactBucket, [
      {
        id: 'AwsSolutions-S1',
        reason: "This bucket doesn't store sensitive data",
      },
    ]);
  }
}
