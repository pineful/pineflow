#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PineflowServerlessStack } from "../lib/pineflow-serverless-stack";

const app = new cdk.App();

new PineflowServerlessStack(app, "PineflowServerlessStack", {
  description: "Pineflow serverless free-tier oriented stack",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-2"
  }
});
