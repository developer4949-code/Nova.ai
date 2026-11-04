# AWS-infra.md — nova AI (v2 LOCKED)

> Source of truth for AWS infrastructure. Locked architecture is documented at the top, the CLI playbook follows, and the live deployment state sits at the bottom.
> Generated: 2026-10-01. Repo: `Nova.ai`.
> App: Next.js 15 + Node.js, `POST /api/analyze` → `unpdf.extractText`/`mammoth` → S3 `PutObject` → Bedrock Converse `moonshotai.kimi-k2.5` (us-east-1) → DynamoDB `PutItem` → JSON.
> Stateless: no local disk/session; browser localStorage is used for history. Any instance serves any request.

---

## 1. Locked architecture

```text
https://nova.kaushik-sahoo.is-a.dev (CNAME added by you after infra is up; deferred)
  |
  v (HTTP now; HTTPS completes after ACM validation)
ALB nova-alb [public-1a/1b, nova-ALB-SG :80/:443 open]
  -> TG nova-tg HTTP:3000 health GET /
  -> ASG nova-asg [public-1a/1b via IGW, nova-App-SG :3000 from ALB-SG only]
      LT nova-lt: AL2023 + Node22 + PM2 + next start :3000, IMDSv2, SSM
      1x t3.micro On-Demand (base, always on)
    + 1-3x Spot t3.micro/t3.small capacity-optimized (overflow)
      IAM: nova-EC2-Role (S3 contracts/*, DDB ScopeLogs, Bedrock Kimi us-east-1)
      |
      +-> S3 nova-contracts-assets [Gateway Endpoint, free]
      +-> DDB ScopeLogs [Gateway Endpoint, free]
      +-> Bedrock us-east-1 moonshotai.kimi-k2.5 [via IGW; no NAT]
      +-> CloudWatch /nova/app
```

Locked decisions: dedicated VPC `10.20.0.0/16`, public-only (no NAT, saving roughly $32/month), no WAF, no rate limiting, no CloudFront, no Route53 hosted zone (DNS stays with the registrar), and ASG `min 1 / desired 2 / max 4` with target tracking at `CPU 70%`.

Why no NAT works: the ASG runs in public subnets with a public IP and an IGW route. S3 and DynamoDB use free Gateway Endpoints. Bedrock is reached in `us-east-1` over the IGW because there is no VPC endpoint available from `ap-south-1`. Isolation is handled by security groups instead of private-subnet segmentation.

---

## 2. Parameters

| Key | Value | Source |
|---|---|---|
| `AWS_REGION` (main) | `ap-south-1` | `.env.example`, `lib/aws.ts`, `USER_DATA.sh` |
| `AWS_BEDROCK_REGION` | `us-east-1` | `lib/aws.ts` |
| `S3_BUCKET_NAME` | `nova-contracts-assets` | `.env.example` |
| `S3_PREFIX` | `contracts/` | `app/api/analyze/route.ts` |
| `DYNAMODB_TABLE_NAME` | `ScopeLogs` | `.env.example` |
| DDB key / billing / TTL | `LogId (S)` / `PAY_PER_REQUEST` / `ExpiresAt` (24h) | API route |
| Bedrock model | `moonshotai.kimi-k2.5` via `ConverseCommand`, `temp 1.0`, `maxTokens 4000`, env `BEDROCK_MODEL_ID` | API route |
| Compute | `AL2023 x86_64, Node 22, PM2, next start :3000, 30GB gp3` | `USER_DATA.sh` + launch template |
| ASG | `min 1 / desired 2 / max 4`, ELB health checks, 300s grace, target tracking at `CPU 70%` | `nova-asg` |
| Capacity | `OnDemandBase=1`, `OnDemandAbove=0%`, Spot `capacity-optimized`, overrides `[t3.micro, t3.small]` | MixedInstancesPolicy |
| Domain | `nova.kaushik-sahoo.is-a.dev` → `CNAME → ALB DNS` | registrar config |
| ACM | `nova.kaushik-sahoo.is-a.dev` in `ap-south-1`, DNS validation pending or issued | ACM |
| Limits in code | `PDF/DOCX ≤10MB`, `contract ≤120k chars`, `request ≤8k chars` | API route |

---

## 3. Network (dedicated VPC, no NAT)

- VPC `nova-VPC` on `10.20.0.0/16`, DNS support and hostnames enabled.
- Subnets (both `MapPublicIpOnLaunch=true`): `public-1a 10.20.1.0/24 (ap-south-1a)` and `public-1b 10.20.2.0/24 (ap-south-1b)`.
- `nova-IGW` attached; `nova-Public-RT` routes `0.0.0.0/0` to the IGW and is associated with both subnets.
- Free Gateway Endpoints: S3 and DynamoDB attached to the public route table.
- No NAT gateway, no private subnets, no VPC peering.

## 4. Security

- `nova-ALB-SG`: inbound `80,443` from `0.0.0.0/0`; outbound all.
- `nova-App-SG`: inbound `3000` only from `ALB-SG`; no `22` access, with SSM only.
- S3: `BlockPublicAccess=true`, SSE AES256, versioning suspended, lifecycle rule `contracts/*` expires in 1 day and aborts incomplete multipart uploads in 1 day.
- DynamoDB: owned SSE, TTL enabled on `ExpiresAt`.
- IAM: trust only `ec2.amazonaws.com`; private inline policy is scoped to the S3 bucket prefix, table, and Bedrock model ARNs; managed `SSMManagedInstanceCore` and `CloudWatchAgentServerPolicy` are attached. Launch template enforces IMDSv2.
- No static credentials: production uses an instance profile; local development uses the configured AWS profile.
- Explicitly off: WAF, ALB/WAF rate rules, API throttling, CloudFront, and Shield.

## 5. Data flow (stateless)

```text
POST /api/analyze (contractFile PDF/DOCX?, contractText?, clientRequest, tone, userId)
 -> extract (unpdf / mammoth)
 -> S3 PutObject contracts/<ts>-<file>
 -> Bedrock Converse (system + SOW + request) -> JSON
 -> normalizeResult -> DDB PutItem (LogId, Timestamp, UserId, Tone, IsScopeCreep, RiskLevel, ClientRequest[500], EstimatedHours, ContractKey, ExpiresAt=now+24h)
 -> JSON {isScopeCreep, riskLevel, violatedClause, analysis, estimatedExtraHours, suggestedEmailResponse}
```

## 6. Cost (ap-south-1, October 2026)

- 10-day base (desired 2 = 1 OD micro + 1 Spot micro): about $13 total (ALB about $7, OD about $2.78, Spot about $0.84, EBS for two 30GB volumes about $1.90, S3/DDB under $0.50).
- Spot fallback to `t3.small`: about $13.90; full scale of 4: about $16.60.
- Monthly run-rate idle: about $39. Bedrock token usage is the dominant variable under load.

---

## 7. AWS CLI creation playbook (idempotent)

> Prerequisites: `aws --version >= 2.32` and `aws login`. Example environment export:
>
> `export AWS_REGION=ap-south-1 BEDROCK_REGION=us-east-1 BUCKET=nova-contracts-assets TABLE=ScopeLogs`

```bash
# 0. identity
aws sts get-caller-identity

# 1. VPC + IGW + subnets + routes + endpoints
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.20.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=nova-VPC}]' --query 'Vpc.VpcId' --output text --region $AWS_REGION)
IGW_ID=$(aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=nova-IGW}]' --query 'InternetGateway.InternetGatewayId' --output text --region $AWS_REGION)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID --region $AWS_REGION 2>&1 || true
PUB_A=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.1.0/24 --availability-zone ap-south-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=nova-Public-1a}]' --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
PUB_B=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.2.0/24 --availability-zone ap-south-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=nova-Public-1b}]' --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
RT_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=nova-Public-RT}]' --query 'RouteTable.RouteTableId' --output text --region $AWS_REGION)
aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $AWS_REGION 2>&1 || true
aws ec2 associate-route-table --subnet-id $PUB_A --route-table-id $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 associate-route-table --subnet-id $PUB_B --route-table-id $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --service-name com.amazonaws.ap-south-1.s3 --route-table-ids $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --service-name com.amazonaws.ap-south-1.dynamodb --route-table-ids $RT_ID --region $AWS_REGION 2>&1 || true

# 2. S3 + DDB
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION 2>&1 || true
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --region $AWS_REGION
aws s3api put-bucket-encryption --bucket $BUCKET --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' --region $AWS_REGION
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration '{"Rules":[{"ID":"contracts-1d-expire","Status":"Enabled","Filter":{"Prefix":"contracts/"},"Expiration":{"Days":1},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}' --region $AWS_REGION
aws dynamodb create-table --table-name $TABLE --attribute-definitions AttributeName=LogId,AttributeType=S --key-schema AttributeName=LogId,KeyType=HASH --billing-mode PAY_PER_REQUEST --region $AWS_REGION 2>&1 || true
aws dynamodb wait table-exists --table-name $TABLE --region $AWS_REGION
aws dynamodb update-time-to-live --table-name $TABLE --time-to-live-specification Enabled=true,AttributeName=ExpiresAt --region $AWS_REGION 2>&1 || true

# 3. IAM (see /tmp/nova-policy.json for Bedrock + S3 prefix + DDB table ARNs)
aws iam create-role --role-name nova-EC2-Role --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>&1 || true
aws iam put-role-policy --role-name nova-EC2-Role --policy-name nova-App-Policy --policy-document file:///tmp/nova-policy.json
aws iam attach-role-policy --role-name nova-EC2-Role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>&1 || true
aws iam create-instance-profile --instance-profile-name nova-EC2-Profile 2>&1 || true
aws iam add-role-to-instance-profile --instance-profile-name nova-EC2-Profile --role-name nova-EC2-Role 2>&1 || true

# 4. SGs + TG + ALB + listener + ACM
ALB_SG=$(aws ec2 create-security-group --group-name nova-ALB-SG --description "nova ALB" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
APP_SG=$(aws ec2 create-security-group --group-name nova-App-SG --description "nova App EC2" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $AWS_REGION 2>&1 || true
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $AWS_REGION 2>&1 || true
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 3000 --source-group $ALB_SG --region $AWS_REGION 2>&1 || true
TG_ARN=$(aws elbv2 create-target-group --name nova-tg --protocol HTTP --port 3000 --vpc-id $VPC_ID --health-check-path / --target-type instance --query 'TargetGroups[0].TargetGroupArn' --output text --region $AWS_REGION)
ALB_ARN=$(aws elbv2 create-load-balancer --name nova-alb --scheme internet-facing --type application --subnets $PUB_A $PUB_B --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text --region $AWS_REGION)
aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$TG_ARN --region $AWS_REGION
aws acm request-certificate --domain-name nova.kaushik-sahoo.is-a.dev --validation-method DNS --region $AWS_REGION

# 5. LT + ASG mixed + CPU70%
AMI_ID=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query 'Parameter.Value' --output text --region $AWS_REGION)
aws ec2 create-launch-template --launch-template-name nova-lt --launch-template-data file:///tmp/sg-lt.json --region $AWS_REGION
aws autoscaling create-auto-scaling-group --auto-scaling-group-name nova-asg --vpc-zone-identifier "$PUB_A,$PUB_B" --min-size 1 --max-size 4 --desired-capacity 2 --health-check-type ELB --health-check-grace-period 300 --target-group-arns $TG_ARN --mixed-instances-policy file:///tmp/sg-mip.json --region $AWS_REGION
aws autoscaling put-scaling-policy --auto-scaling-group-name nova-asg --policy-name nova-cpu70 --policy-type TargetTrackingScaling --target-tracking-configuration '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":70.0}' --region $AWS_REGION
```

`/tmp/sg-mip.json` (locked): `OnDemandBaseCapacity=1`, `OnDemandPercentageAboveBaseCapacity=0`, `SpotAllocationStrategy=capacity-optimized`, `Overrides=[t3.micro, t3.small]`.

---

## 8. Created infrastructure (live state)

> **Not yet deployed.** Run the CLI playbook in Section 7, then fill in the resource IDs below.

| Resource | Name / ID | Region | Status | Verified |
|---|---|---|---|---|
| VPC | `nova-VPC` / `<VPC_ID>` (`10.20.0.0/16`) | `ap-south-1` | ? | `describe-vpcs` |
| Subnet | `nova-Public-1a` / `<SUBNET_1A_ID>` (`10.20.1.0/24`, 1a, public IP) | `ap-south-1` | ? | `describe-subnets` |
| Subnet | `nova-Public-1b` / `<SUBNET_1B_ID>` (`10.20.2.0/24`, 1b, public IP) | `ap-south-1` | ? | `describe-subnets` |
| IGW | `nova-IGW` / `<IGW_ID>` attached | `ap-south-1` | ? | `describe-internet-gateways` |
| Route table | `nova-Public-RT` / `<RT_ID>` (`0.0.0.0/0?IGW`) | `ap-south-1` | ? | `describe-route-tables` |
| VPC endpoint | `nova-S3-Endpoint` / `<VPCE_S3_ID>` | `ap-south-1` | ? | `describe-vpc-endpoints` |
| VPC endpoint | `nova-DDB-Endpoint` / `<VPCE_DDB_ID>` | `ap-south-1` | ? | `describe-vpc-endpoints` |
| S3 bucket | `nova-contracts-assets` | `ap-south-1` | ? | `head-bucket` |
| DynamoDB table | `ScopeLogs` | `ap-south-1` | ? | `describe-table` |
| IAM role | `nova-EC2-Role` | global | ? | `get-role` |
| Instance profile | `nova-EC2-Profile` | global | ? | `get-instance-profile` |
| Security group | `nova-ALB-SG` / `<ALB_SG_ID>` | `ap-south-1` | ? | `describe-security-groups` |
| Security group | `nova-App-SG` / `<APP_SG_ID>` | `ap-south-1` | ? | `describe-security-groups` |
| ALB | `nova-alb` / `<ALB_ARN>` | `ap-south-1` | ? | `describe-load-balancers` |
| ALB DNS | `<ALB_DNS>` | `ap-south-1` | ? | `describe-load-balancers` |
| Target group | `nova-tg` / `<TG_ARN>` | `ap-south-1` | ? | `describe-target-groups` |
| ACM cert | `nova.kaushik-sahoo.is-a.dev` / `<CERT_ARN>` | `ap-south-1` | ? | `describe-certificate` |
This file is intended to act as the operational source of truth for the app's AWS deployment and supporting configuration.
