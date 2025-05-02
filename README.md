# Gym Passport Automation

This project automates the process of downloading employee data from the Gym Passport platform, processing it, and storing it in an S3 bucket.

## Architecture

The automation uses AWS services to run the Cypress tests and process the CSV files:

1. **Lambda Function**: Triggers the CodeBuild project
2. **CodeBuild Project**: Runs the Cypress tests in a controlled environment
3. **S3 Bucket**: Stores the downloaded CSV files

## Prerequisites

- AWS CLI installed and configured
- AWS SAM CLI installed
- Node.js and npm installed
- GitHub repository with your Cypress tests

## Deployment

1. Update the GitHub repository information in `template.yaml`:

```yaml
Parameters:
  GitHubOwner:
    Default: YOUR_GITHUB_USERNAME  # Replace with your GitHub username
```

2. Deploy the AWS resources using SAM:

```bash
sam build
sam deploy --guided
```

3. Follow the prompts to complete the deployment.

## How It Works

1. The Lambda function is triggered (can be scheduled with EventBridge or triggered manually)
2. The Lambda function starts a CodeBuild project
3. CodeBuild:
   - Clones the GitHub repository
   - Installs dependencies with `npm ci`
   - Runs Cypress tests with `npx cypress run`
   - Uploads CSV files to the S3 bucket

## Local Testing

Before deploying to AWS, you can test the Cypress automation locally:

```bash
# Install dependencies
npm install

# Run Cypress tests in headed mode
npm run cy:browser

# Process CSV files
cd lambda
node processCSV.js --replace-emails
```

## Environment Variables

The following environment variables are used:

- `CODEBUILD_PROJECT_NAME`: Name of the CodeBuild project (set automatically during deployment)
- `S3_BUCKET_NAME`: Name of the S3 bucket for storing CSV files (default: emumba-gym-passport-csv)

## CSV Processing

The automation includes two CSV processing scripts:

1. `processCSV.js`: Filters and anonymizes CSV data
2. `email-csv.js`: Processes CSV data for reimbursement calculations

## AWS Resources Created

- Lambda Function: Triggers the CodeBuild project
- CodeBuild Project: Runs the Cypress tests
- S3 Bucket: Stores CSV files
- IAM Roles: Provides necessary permissions

## Customization

You can customize the automation by:

1. Modifying the Cypress tests in the `cypress/e2e` directory
2. Updating the CSV processing logic in the `lambda` directory
3. Adjusting the CodeBuild environment in `template.yaml`
