#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ApplicationStack } from "../lib/application-stack.js";

const app = new cdk.App();
const stage = "dev";

new ApplicationStack(app, `DigitalContentApp-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
