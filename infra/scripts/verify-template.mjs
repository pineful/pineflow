import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, "..", "cdk.out", "PineflowServerlessStack.template.json");
const template = JSON.parse(readFileSync(templatePath, "utf8"));
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

const routes = resourcesOf("AWS::ApiGatewayV2::Route");
assert(routes.length >= 5, "Expected all Pineflow API routes to be synthesized.");
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

const oac = resourcesOf("AWS::CloudFront::OriginAccessControl")[0];
assert(oac?.Properties?.OriginAccessControlConfig?.SigningBehavior === "always", "CloudFront OAC must always sign S3 origin requests.");

const responseHeadersPolicy = resourcesOf("AWS::CloudFront::ResponseHeadersPolicy")[0];
const csp =
  responseHeadersPolicy?.Properties?.ResponseHeadersPolicyConfig?.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";
assert(csp.includes("default-src 'self'"), "CloudFront CSP must define default-src 'self'.");
assert(csp.includes("connect-src"), "CloudFront CSP must restrict connect-src.");

const policies = resourcesOf("AWS::IAM::Policy");
const policyActions = JSON.stringify(policies.flatMap((policy) => policy.Properties.PolicyDocument.Statement));
assert(!policyActions.includes("dynamodb:Scan"), "Lambda role must not allow DynamoDB Scan.");
assert(!policyActions.includes("dynamodb:BatchWriteItem"), "Lambda role must not allow DynamoDB BatchWriteItem.");

const budgets = resourcesOf("AWS::Budgets::Budget");
const budgetAmounts = budgets.map((budget) => budget.Properties.Budget.BudgetLimit.Amount).sort();
assert(JSON.stringify(budgetAmounts) === JSON.stringify([1, 3, 5]), "Budgets must exist at $1, $3, and $5.");

console.log("Pineflow serverless guardrail verification passed.");
