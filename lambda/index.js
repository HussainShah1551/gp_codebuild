// Lambda function to trigger CodeBuild project for Gym Passport automation
// Repository: https://github.com/HussainShah1551/gp_codebuild.git
const AWS = require('aws-sdk');
const codebuild = new AWS.CodeBuild();
const s3 = new AWS.S3();

/**
 * Lambda handler that triggers a CodeBuild project to run Cypress tests
 * @param {Object} event - Lambda event object
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} - Response with build information
 */
exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Get the CodeBuild project name from environment variable
    const projectName = process.env.CODEBUILD_PROJECT_NAME;
    if (!projectName) {
      throw new Error('CODEBUILD_PROJECT_NAME environment variable is not set');
    }
    
    console.log(`Starting CodeBuild project: ${projectName}`);
    
    // Start the CodeBuild project
    const params = {
      projectName: projectName,
      environmentVariablesOverride: [
        {
          name: 'S3_BUCKET_NAME',
          value: 'emumba-gym-passport-csv',
          type: 'PLAINTEXT'
        },
        {
          name: 'RUN_DATE',
          value: new Date().toISOString(),
          type: 'PLAINTEXT'
        }
      ]
    };
    
    const buildResponse = await codebuild.startBuild(params).promise();
    const buildId = buildResponse.build.id;
    const buildArn = buildResponse.build.arn;
    
    console.log(`Successfully started build with ID: ${buildId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully triggered CodeBuild project',
        buildId: buildId,
        buildArn: buildArn
      })
    };
  } catch (error) {
    console.error('Error triggering CodeBuild project:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error triggering CodeBuild project',
        error: error.message
      })
    };
  }
};
