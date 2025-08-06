import * as aws_kms from 'aws-cdk-lib/aws-kms';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class EncryptionKey extends Construct {
  public readonly encryptionKey: aws_kms.Key;
  constructor(
    scope: Construct,
    id: string,
    props?: {
      servicePrincipals?: ServicePrincipal[];
    }
  ) {
    super(scope, id);

    this.encryptionKey = new aws_kms.Key(this, id, {
      enableKeyRotation: true,
    });

    if (props && props.servicePrincipals) {
      props.servicePrincipals.map((servicePrincipal) => {
        this.encryptionKey.grantEncryptDecrypt(servicePrincipal);
      });
    }
  }
}
