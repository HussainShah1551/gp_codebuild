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
    
    // Helper to determine reimbursement subject, message, and amount
    function getGymPassportDeduction(checkIns, name) {
      const BASE_AMOUNT = 5500;
      if (checkIns >= 16) {
        return {
          subject: '🏆 Great Job! Your Gym Subscription is Fully Covered 🎉',
          body: `Hi ${name},\n Awesome work this month! You've completed 16 or more check-ins through Gym Passport.\n As part of our wellness program, we're happy to share that Rs 5500 (100%) of your Gym Passport subscription fee will be covered by the company for this month.\n Keep up the great momentum and stay healthy! 💪\nBest Regards,\n Emumba Fitness Team 🏋️‍♂️`,
          deduction: 0
        };
      } else if (checkIns >= 12) {
        return {
          subject: '👏 Well Done! 75% of Your Gym Fee is Covered 🥈',
          body: `Hi ${name},\n You made 12 to 15 check-ins through Gym Passport this month — great job staying active!\n You qualify to have Rs 4125 (75%) of your Gym Passport subscription fee covered by the company this month. The remaining Rs 1375 will be automatically deducted from your salary.\n Stay consistent and keep moving! 🚴‍♀️\nBest Regards,\n Emumba Fitness Team 🏋️‍♀️`,
          deduction: 1375
        };
      } else if (checkIns >= 8) {
        return {
          subject: '💪 Keep It Up! 50% of Your Gym Fee is Covered 🏅',
          body: `Hi ${name},\n You logged 8 to 11 check-ins through Gym Passport this month — a solid effort!\n You're eligible for Rs 2750 (50%) coverage of your Gym Passport subscription fee. The remaining Rs 2750 will be deducted from your salary.\n You're doing great — let's aim even higher next month! 🚀\nBest Regards,\n Emumba Fitness Team 🏃‍♂️`,
          deduction: 2750
        };
      } else if (checkIns >= 4) {
        return {
          subject: '✅ Progress Made! 25% of Your Gym Fee is Covered',
          body: `Hi ${name},\n You made 4 to 7 check-ins through Gym Passport this month.\n You qualify for Rs 1375 (25%) coverage of your Gym Passport subscription fee. The remaining Rs 4125 will be deducted from your salary.\n Keep striving for more next month! 🌟\nBest Regards,\n Emumba Fitness Team 💼`,
          deduction: 4125
        };
      } else {
        return {
          subject: '🕒 Let\'s Refocus on Fitness Next Month',
          body: `Hi ${name},\n We noticed you made fewer than 4 check-ins through Gym Passport this month.\n As per the company's wellness policy, 0% of your Gym Passport subscription fee is eligible for reimbursement, and the full amount of Rs 5500 will be deducted from your salary.\n If you wish to unsubscribe from Gym Passport, you can do so via Equokka during the first 3 days of the upcoming month.\n We encourage you to stay active and take full advantage of this benefit if you choose to continue. Every check-in counts! 💡\nBest Regards,\n Emumba Fitness Team 🏢`,
          deduction: 5500
        };
      }
    }
    
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
          
          // Calculate deduction based on check-ins
          const checkInsRaw = data['Check Ins'] || data['Check ins'] || data['check ins'] || data['Checkins'] || data['checkins'] || '0';
          const checkIns = parseInt(checkInsRaw, 10) || 0;
          
          // Standardize the check-ins field
          filteredData['Check Ins'] = checkIns;
          
          // Calculate and add deduction amount
          const deductionInfo = getGymPassportDeduction(checkIns, username);
          filteredData['Amount to be Deducted'] = deductionInfo.deduction;
          
          // Make sure the Amount to be Deducted field will be included in the headers
          if (!headers.includes('Amount to be Deducted')) {
            headers.push('Amount to be Deducted');
          }
          
          console.log(`User: ${username}, Check-ins: ${checkIns}, Deduction: ${deductionInfo.deduction}`);

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
    console.log(`Number of records to write: ${results.length}`);
    
    // Make sure all fields in the results are represented in the headers
    if (results.length > 0) {
      const sampleRecord = results[0];
      Object.keys(sampleRecord).forEach(key => {
        if (!headers.includes(key)) {
          headers.push(key);
          console.log(`Added missing header: ${key}`);
        }
      });
    }
    
    // Sort results by check-ins (descending) and then alphabetically by username
    results.sort((a, b) => {
      // First sort by check-ins (descending)
      const checkInsA = parseInt(a['Check Ins'] || 0, 10);
      const checkInsB = parseInt(b['Check Ins'] || 0, 10);
      
      if (checkInsB !== checkInsA) {
        return checkInsB - checkInsA;
      }
      
      // If check-ins are equal, sort by username alphabetically
      const usernameA = (a.Username || '').toLowerCase();
      const usernameB = (b.Username || '').toLowerCase();
      return usernameA.localeCompare(usernameB);
    });
    
    console.log('Sorted results by check-ins (descending) and then alphabetically');
    
    // Write the modified data back to a new CSV file
    const csvWriter = createObjectCsvWriter({
      path: outputFilePath,
      header: headers.map(header => ({ id: header, title: header })),
      alwaysQuote: true // Ensure all fields are properly quoted
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
