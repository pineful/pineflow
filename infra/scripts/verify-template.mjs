import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, "..", "cdk.out", "PineflowServerlessStack.template.json");
const template = JSON.parse(readFileSync(templatePath, "utf8"));
const oidcTemplatePath = join(__dirname, "..", "bootstrap", "github-oidc-deploy-role.template.yaml");
const oidcTemplate = readFileSync(oidcTemplatePath, "utf8");
const resources = Object.values(template.Resources);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resourcesOf(type) {
  return resources.filter((resource) => resource.Type === type);
}

const userPool = resourcesOf("AWS::Cognito::UserPool")[0];
assert(userPool?.Properties?.AdminCreateUserConfig?.AllowAdminCreateUserOnly === true, "Cognito self sign-up must stay disabled.");

const userPoolClient = resourcesOf("AWS::Cognito::UserPoolClient")[0];
assert(
  userPoolClient?.Properties?.ExplicitAuthFlows?.includes("ALLOW_REFRESH_TOKEN_AUTH"),
  "Cognito app client must allow refresh token auth for open-tab sessions."
);
assert(userPoolClient?.Properties?.AccessTokenValidity === 60, "Cognito access tokens must stay limited to 60 minutes.");
assert(
  userPoolClient?.Properties?.RefreshTokenValidity === 1440,
  "Cognito refresh tokens must expire after one day for browser sessions."
);

const routes = resourcesOf("AWS::ApiGatewayV2::Route");
const routeKeys = routes.map((route) => route.Properties.RouteKey);
assert(routes.length >= 8, "Expected all Pineflow API routes to be synthesized.");
assert(routeKeys.includes("GET /api/usage"), "Operational usage route must be synthesized.");
assert(routeKeys.includes("PATCH /api/records/{recordId}"), "Record time correction route must be synthesized.");
assert(routeKeys.includes("DELETE /api/records/{recordId}"), "Record deletion route must be synthesized.");
assert(
  routes.every((route) => route.Properties.AuthorizationType === "JWT"),
  "Every API route, including health, must require JWT authorization."
);

const stage = resourcesOf("AWS::ApiGatewayV2::Stage")[0];
assert(stage?.Properties?.DefaultRouteSettings?.ThrottlingRateLimit === 1, "API Gateway rate limit must be 1 req/sec.");
assert(stage?.Properties?.DefaultRouteSettings?.ThrottlingBurstLimit === 5, "API Gateway burst limit must be 5.");

const lambda = resourcesOf("AWS::Lambda::Function").find(
  (resource) => resource.Properties.FunctionName === "pineflow-api"
);
assert(lambda?.Properties?.Runtime === "nodejs24.x", "Lambda runtime must stay on supported Node.js 24.x.");
assert(lambda?.Properties?.ReservedConcurrentExecutions === 1, "Lambda reserved concurrency must be 1.");
assert(lambda?.Properties?.MemorySize === 128, "Lambda memory must remain at the minimum 128 MB baseline.");

const table = resourcesOf("AWS::DynamoDB::Table")[0];
assert(table?.Properties?.ProvisionedThroughput?.ReadCapacityUnits === 1, "DynamoDB must start at 1 RCU.");
assert(table?.Properties?.ProvisionedThroughput?.WriteCapacityUnits === 1, "DynamoDB must start at 1 WCU.");
assert(table?.Properties?.DeletionProtectionEnabled === true, "DynamoDB deletion protection must be enabled.");

const logGroup = resourcesOf("AWS::Logs::LogGroup").find(
  (resource) => resource.Properties.LogGroupName === "/aws/lambda/pineflow-api"
);
assert(logGroup?.Properties?.RetentionInDays === 7, "CloudWatch log retention must be 7 days.");

const bucket = resourcesOf("AWS::S3::Bucket")[0];
const publicAccessBlock = bucket?.Properties?.PublicAccessBlockConfiguration;
assert(
  publicAccessBlock?.BlockPublicAcls &&
    publicAccessBlock?.BlockPublicPolicy &&
    publicAccessBlock?.IgnorePublicAcls &&
    publicAccessBlock?.RestrictPublicBuckets,
  "S3 public access block must stay fully enabled."
);
const lifecycleRules = bucket?.Properties?.LifecycleConfiguration?.Rules ?? [];
const intelligentTieringRule = lifecycleRules.find((rule) => rule.Id === "TransitionFrontendAssetsToIntelligentTiering");
assert(
  intelligentTieringRule?.Prefix === "assets/" &&
    intelligentTieringRule?.Transitions?.some(
      (transition) => transition.StorageClass === "INTELLIGENT_TIERING" && transition.TransitionInDays === 30
    ),
  "Frontend assets must transition to S3 Intelligent-Tiering after 30 days."
);
const incompleteUploadRule = lifecycleRules.find((rule) => rule.Id === "AbortIncompleteFrontendUploads");
assert(
  incompleteUploadRule?.AbortIncompleteMultipartUpload?.DaysAfterInitiation === 1,
  "S3 incomplete multipart uploads must be aborted after one day."
);

const oac = resourcesOf("AWS::CloudFront::OriginAccessControl")[0];
assert(oac?.Properties?.OriginAccessControlConfig?.SigningBehavior === "always", "CloudFront OAC must always sign S3 origin requests.");

const responseHeadersPolicy = resourcesOf("AWS::CloudFront::ResponseHeadersPolicy")[0];
const csp =
  responseHeadersPolicy?.Properties?.ResponseHeadersPolicyConfig?.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";
assert(csp.includes("default-src 'self'"), "CloudFront CSP must define default-src 'self'.");
assert(csp.includes("connect-src"), "CloudFront CSP must restrict connect-src.");
assert(csp.includes("https://api.open-meteo.com"), "CloudFront CSP must allow the public weather API.");
assert(csp.includes("https://api.bigdatacloud.net"), "CloudFront CSP must allow the public reverse geocoding API.");

const policies = resourcesOf("AWS::IAM::Policy");
const policyActions = JSON.stringify(policies.flatMap((policy) => policy.Properties.PolicyDocument.Statement));
assert(!policyActions.includes("dynamodb:Scan"), "Lambda role must not allow DynamoDB Scan.");
assert(!policyActions.includes("dynamodb:BatchWriteItem"), "Lambda role must not allow DynamoDB BatchWriteItem.");
assert(policyActions.includes("cloudwatch:GetMetricData"), "Lambda role must read CloudWatch usage metrics for the operations panel.");
assert(!policyActions.includes("ce:"), "Lambda role must not use Cost Explorer APIs from the app.");

const budgets = resourcesOf("AWS::Budgets::Budget");
const budgetAmounts = budgets.map((budget) => budget.Properties.Budget.BudgetLimit.Amount).sort();
assert(JSON.stringify(budgetAmounts) === JSON.stringify([1, 3, 5]), "Budgets must exist at $1, $3, and $5.");

assert(
  oidcTemplate.includes("Url: https://token.actions.githubusercontent.com"),
  "GitHub OIDC provider URL must stay pinned to GitHub Actions."
);
assert(
  oidcTemplate.includes("token.actions.githubusercontent.com:aud: sts.amazonaws.com"),
  "GitHub OIDC trust policy must require sts.amazonaws.com audience."
);
assert(
  oidcTemplate.includes("token.actions.githubusercontent.com:sub: !Sub repo:${GitHubOrg}/${GitHubRepo}:ref:refs/heads/${GitHubBranch}"),
  "GitHub OIDC trust policy must stay scoped to one repository branch."
);
assert(
  oidcTemplate.includes("CdkBootstrapCloudFormationExecutionRolePassRole"),
  "GitHub OIDC deploy role must pass the CDK CloudFormation execution role."
);
assert(
  oidcTemplate.includes("role/cdk-hnb659fds-cfn-exec-role-${AWS::AccountId}-${AWS::Region}"),
  "CDK PassRole permission must stay scoped to the bootstrap CloudFormation execution role."
);
assert(
  oidcTemplate.includes("iam:PassedToService: cloudformation.amazonaws.com"),
  "CDK PassRole permission must only pass roles to CloudFormation."
);
assert(
  oidcTemplate.includes("cloudformation:DescribeStackEvents"),
  "GitHub OIDC deploy role must read CloudFormation stack events while CDK monitors deployment."
);
assert(!oidcTemplate.includes("AdministratorAccess"), "GitHub OIDC deploy role must not use AdministratorAccess.");
assert(!oidcTemplate.includes("repo:${GitHubOrg}/${GitHubRepo}:*"), "GitHub OIDC deploy role must not allow every repository ref.");

console.log("Pineflow serverless guardrail verification passed.");
