# WebAppBucket Construct

## Purpose

Creates two s3 buckets(A bucket and B bucket).
A bucket is to store data or something.
B bucket is to store the logs that something access to A bucket.

## Required resources

None

## Required parameters (props)
- `bucketName` <string>: bucket name of A bucket

## Optional parameters (props)

None

## Properties

| Name   |   Type    | Description |
| ------ | :-------: | ----------: |
| webAppBucket | s3.Bucket | bucket A  |
