// Lambda function to process CSV file and replace all emails
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

/**
 * Processes a CSV file and replaces all email addresses with a specific email
 * @param {Object} event - The event object (can include parameters)
 * @param {Object} context - The Lambda context
 * @returns {Promise<Object>} - Result of the operation
 */
exports.handler = async (event, context) => {
  // Skip execution if PROCESS_CSV environment variable is not set to 'true'
  if (process.env.PROCESS_CSV !== 'true') {
    console.log('CSV processing is disabled. Set PROCESS_CSV=true to enable.');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'CSV processing is disabled' })
    };
  }
  
  // Check if email replacement is enabled
  const replaceEmails = process.env.REPLACE_EMAILS === 'true';
  console.log(`Email replacement is ${replaceEmails ? 'enabled' : 'disabled'}`);
  

  try {
    // Path to the downloaded CSV file
    const csvFolderPath = path.resolve(__dirname, '../cypress/downloads');
    console.log(`Looking for CSV files in: ${csvFolderPath}`);
    
    // Check if the directory exists
    if (!fs.existsSync(csvFolderPath)) {
      throw new Error(`Downloads directory not found: ${csvFolderPath}`);
    }
    
    const files = fs.readdirSync(csvFolderPath);
    console.log(`Found ${files.length} files in downloads directory`);
    
    // Find the Corporate Employees CSV file (handle spaces in filename)
    const csvFile = files.find(file => {
      const lowerCaseFile = file.toLowerCase();
      return lowerCaseFile.includes('corporate') && 
             lowerCaseFile.includes('employees') && 
             lowerCaseFile.endsWith('.csv');
    });
    
    if (!csvFile) {
      throw new Error('Corporate Employees CSV file not found in downloads folder');
    }
    
    const inputFilePath = path.join(csvFolderPath, csvFile);
    const outputFilePath = path.join(csvFolderPath, 'Processed_' + csvFile);
    
    // Read the CSV file
    const results = [];
    let headers = [];
    let emailColumnName = null;
    
    // Fields to exclude from the output CSV
    const excludeFields = [
      'User Image', 'Phone', 'Password', 'Edit', 'Send Email'
    ];
    
    // Keep track of the Created At field for filtering, but don't include it in output
    const dateFieldsToExcludeFromOutput = ['Created At'];
    
    // Helper to get the last day of previous month
    function getPreviousMonthDateRange() {
      const now = new Date();
      const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfPrevMonth = new Date(firstDayOfCurrentMonth - 1); // last day of prev month
      return { lastDayOfPrevMonth };
    }

    // Get the last day of previous month as cutoff date
    const { lastDayOfPrevMonth } = getPreviousMonthDateRange();
    console.log('Date filtering cutoff:');
    console.log('Including all entries up to:', lastDayOfPrevMonth.toISOString().slice(0, 10));

    // Process the CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(inputFilePath)
        .pipe(csv())
        .on('headers', (headerList) => {
          // Find the date column for filtering
          const dateColumnName = headerList.find(header => 
            header === 'Created At' || header.toLowerCase() === 'created at' || header.toLowerCase() === 'created'
          );
          console.log(`Found date column: ${dateColumnName || 'none'}`);
          
          // Find the email column (could be named 'Email', 'email', 'EMAIL', etc.)
          emailColumnName = headerList.find(header => 
            header.toLowerCase().includes('email')
          );
          
          // Filter out the excluded headers for output
          headers = headerList.filter(header => 
            !excludeFields.includes(header) && 
            !dateFieldsToExcludeFromOutput.includes(header)
          );
          
          console.log(`Headers for output: ${headers.join(', ')}`);
        })
        .on('data', (data) => {
          // Create a filtered object with only the fields we want to keep for output
          const filteredData = {};

          // Get the date for filtering
          const createdAtRaw = data['Created At'] || data['created at'] || data['created'] || '';
          let createdAtDate = null;
          
          if (createdAtRaw) {
            // Handle date format 'YYYY-MM-DD HH:MM:SS'
            const datePart = createdAtRaw.split(' ')[0];
            createdAtDate = new Date(datePart);
          }
          
          const username = data['Username'] || data['username'] || '';
          console.log(`Processing user: ${username}, Created At: ${createdAtRaw}`);

          // Skip if date is invalid
          if (!createdAtDate || isNaN(createdAtDate.getTime())) {
            console.log(`Excluded user: ${username} - invalid date: ${createdAtRaw}`);
            return;
          }
          
          // Skip if date is after the cutoff (last day of previous month)
          if (createdAtDate > lastDayOfPrevMonth) {
            console.log(`Excluded user: ${username} - date ${createdAtRaw} is after cutoff: ${lastDayOfPrevMonth.toISOString().slice(0, 10)}`);
            return;
          }
          
          console.log(`Including user: ${username} - date ${createdAtRaw} is before or on cutoff`);
          
          // Add all fields that aren't in the exclude lists
          for (const key in data) {
            if (!excludeFields.includes(key) && !dateFieldsToExcludeFromOutput.includes(key)) {
              filteredData[key] = data[key];
            }
          }

          // Replace the email with the specified one if enabled
          if (emailColumnName && !excludeFields.includes(emailColumnName)) {
            if (replaceEmails) {
              filteredData[emailColumnName] = 'hussain.imam@emumba.com';
              console.log(`Replaced email for user: ${filteredData['Username'] || 'Unknown'}`);
            }
            // If email replacement is disabled, keep the original email
          }

          results.push(filteredData);
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    console.log(`Filtered headers: ${headers.join(', ')}`);
    
    // Write the modified data back to a new CSV file
    const csvWriter = createObjectCsvWriter({
      path: outputFilePath,
      header: headers.map(header => ({ id: header, title: header }))
    });
    
    await csvWriter.writeRecords(results);
    
    console.log(`CSV processed successfully. Output saved to: ${outputFilePath}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'CSV processed successfully',
        inputFile: inputFilePath,
        outputFile: outputFilePath,
        recordsProcessed: results.length
      })
    };
    
  } catch (error) {
    console.error('Error processing CSV:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing CSV',
        error: error.message
      })
    };
  }
};

// This allows the function to be run directly from the command line
if (require.main === module) {
  // Set environment variable to true to enable processing
  process.env.PROCESS_CSV = 'true';
  
  // Check command line arguments for email replacement flag
  const args = process.argv.slice(2);
  if (args.includes('--replace-emails')) {
    process.env.REPLACE_EMAILS = 'true';
  } else if (args.includes('--keep-emails')) {
    process.env.REPLACE_EMAILS = 'false';
  } else {
    // Default behavior (can be changed as needed)
    process.env.REPLACE_EMAILS = 'true';
  }
  
  exports.handler({}, {})
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(err => console.error('Error:', err));
}
