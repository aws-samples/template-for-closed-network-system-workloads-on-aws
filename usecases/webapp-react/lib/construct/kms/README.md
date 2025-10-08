# EncryptionKey Construct

## Purpose

Create a AWS KMS key to encrypt Amazon Cloudwatch Logs LogGroup.

## Required resources

None

## Required parameters (props)

None

## Optional parameters (props)

- `servicePrincipals` <iam.ServicePrincipal[]>: To grant access from these principals

## Properties

| Name          |  Type   |                 Description |
| ------------- | :-----: | --------------------------: |
| encryptionKey | kms.Key | The key to encrypt LogGroup |
