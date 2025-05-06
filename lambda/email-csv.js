const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const ses = new AWS.SES();
const sqs = new AWS.SQS();
const csv = require('csv-parser');
const { Readable } = require('stream');
const { stringify } = require('csv-stringify/sync');

// Helper to send filtered CSV to admin
async function sendFilteredCsvEmail(filteredCsv, attachmentName, adminEmail) {
  const boundary = "NextPart";
  const rawMessage = [
    `From: ${adminEmail}`,
    `To: ${adminEmail}`,
    `Subject: 🗂️ Filtered Active Users CSV: ${attachmentName} 📋`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    'Attached is the filtered CSV containing only users with active subscriptions. 💪🏋️‍♂️\n\nStay healthy and keep moving! 🚴‍♀️',
    '',
    `--${boundary}`,
    'Content-Type: text/csv',
    `Content-Disposition: attachment; filename=\"${attachmentName}\"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(filteredCsv).toString('base64'),
    '',
    `--${boundary}--`,
    ''
  ].join('\r\n');
  await ses.sendRawEmail({ RawMessage: { Data: rawMessage } }).promise();
}

// Helper to determine reimbursement subject, message, and amount
function getGymPassportDeduction(checkIns, name) {
  const BASE_AMOUNT = 5500;
  if (checkIns >= 16) {
    return {
      subject: '🏆 Great Job! Your Gym Subscription is Fully Covered 🎉',
      body: `Hi ${name},\n Awesome work this month! You’ve completed 16 or more check-ins through Gym Passport.\n As part of our wellness program, we’re happy to share that Rs 5500 (100%) of your Gym Passport subscription fee will be covered by the company for this month.\n Keep up the great momentum and stay healthy! 💪\nBest Regards,\n Emumba Fitness Team 🏋️‍♂️`,
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
      body: `Hi ${name},\n You logged 8 to 11 check-ins through Gym Passport this month — a solid effort!\n You’re eligible for Rs 2750 (50%) coverage of your Gym Passport subscription fee. The remaining Rs 2750 will be deducted from your salary.\n You're doing great — let’s aim even higher next month! 🚀\nBest Regards,\n Emumba Fitness Team 🏃‍♂️`,
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
      subject: '🕒 Let’s Refocus on Fitness Next Month',
      body: `Hi ${name},\n We noticed you made fewer than 4 check-ins through Gym Passport this month.\n As per the company’s wellness policy, 0% of your Gym Passport subscription fee is eligible for reimbursement, and the full amount of Rs 5500 will be deducted from your salary.\n If you wish to unsubscribe from Gym Passport, you can do so via Equokka during the first 3 days of the upcoming month.\n We encourage you to stay active and take full advantage of this benefit if you choose to continue. Every check-in counts! 💡\nBest Regards,\n Emumba Fitness Team 🏢`,
      deduction: 5500
    };
  }
}


exports.handler = async (event) => {
  try {
    // SNS event contains S3 event notification
    console.log('Received event:', JSON.stringify(event, null, 2));
    console.log('Environment variables:', JSON.stringify({
      EMAIL_QUEUE_URL: process.env.EMAIL_QUEUE_URL,
      SOURCE_EMAIL: process.env.SOURCE_EMAIL,
      TARGET_EMAIL: process.env.TARGET_EMAIL
    }, null, 2));
    
    const snsRecord = event.Records[0].Sns;
    const s3Event = JSON.parse(snsRecord.Message);
    const record = s3Event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    console.log(`Processing S3 bucket: ${bucket}, key: ${key}`);

  // Download the CSV file
  const fileObj = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const fileContent = fileObj.Body;

  // Calculate previous month date range
  const now = new Date();
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfPrevMonth = new Date(firstDayOfCurrentMonth);
  firstDayOfPrevMonth.setMonth(firstDayOfCurrentMonth.getMonth() - 1);
  const lastDayOfPrevMonth = new Date(firstDayOfCurrentMonth - 1); // last day of prev month

  // Log the calculated previous month date range
  console.log('Date range for previous month filtering:');
  console.log('First day of previous month:', firstDayOfPrevMonth.toISOString().slice(0, 10));
  console.log('Last day of previous month:', lastDayOfPrevMonth.toISOString().slice(0, 10));

  // Parse CSV and filter for previous month and active subscription status
  const activeRows = [];
  await new Promise((resolve, reject) => {
    Readable.from(fileContent)
      .pipe(csv())
      .on('data', (row) => {
        // Get and parse Created At date
        const createdAtRaw = row['Created At'] || row['created at'] || row['created'] || '';
        let createdAtDate = null;
        if (createdAtRaw) {
          // Accept both 'YYYY-MM-DD HH:mm:ss' and 'YYYY-MM-DD' formats
          const datePart = createdAtRaw.split(' ')[0];
          createdAtDate = new Date(datePart);
        }
        // Only include if Created At is in previous month
        if (!createdAtDate || createdAtDate < firstDayOfPrevMonth || createdAtDate > lastDayOfPrevMonth) {
          return;
        }
        // Normalize header keys for robustness
        const status = (row['subscription status'] || row['Subscription Status'] || row['Status'] || row['status'] || '').toLowerCase();
        if (status === 'active') {
          activeRows.push(row);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`Number of active rows for previous month: ${activeRows.length}`);

  // Add check-ins and reimbursement info to each active row
  for (const row of activeRows) {
    // First, normalize the check-ins field name to avoid duplicates
    const checkInsRaw = row['Check Ins'] || row['Check ins'] || row['check ins'] || row['Checkins'] || row['checkins'] || '0';
    const checkIns = parseInt(checkInsRaw, 10) || 0;
    
    // Delete any existing check-ins fields to avoid duplicates
    delete row['Check ins'];
    delete row['check ins'];
    delete row['Checkins'];
    delete row['checkins'];
    
    // Set a standardized field name
    row['Check Ins'] = checkIns;
    
    // Calculate deduction based on check-ins
    const userName = row.Username || row.Name || row.username || row.name || '';
    const deductionInfo = getGymPassportDeduction(checkIns, userName);
    row['Amount to be Deducted'] = deductionInfo.deduction;
    
    console.log(`User: ${userName}, Check-ins: ${checkIns}, Deduction: ${deductionInfo.deduction}`);
  }

  // Sort active rows by check-ins (descending order) and then by name (alphabetically)
  activeRows.sort((a, b) => {
    const checkInsA = parseInt(a['Check Ins'] || 0, 10);
    const checkInsB = parseInt(b['Check Ins'] || 0, 10);
    
    // First sort by check-ins (descending)
    if (checkInsB !== checkInsA) {
      return checkInsB - checkInsA;
    }
    
    // If check-ins are equal, sort by name alphabetically
    const nameA = (a.Username || a.Name || a.username || a.name || '').toLowerCase();
    const nameB = (b.Username || b.Name || b.username || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  // Create filtered CSV
  let filteredCsv;
  if (activeRows.length > 0) {
    filteredCsv = stringify(activeRows, { header: true });
  } else {
    // Re-parse for headers only
    let headers = [];
    await new Promise((resolve, reject) => {
      Readable.from(fileContent)
        .pipe(csv())
        .on('headers', (h) => { headers = h; resolve(); })
        .on('error', reject);
    });
    filteredCsv = stringify([], { header: true, columns: headers });
  }

  // 1. Send filtered CSV to admin (always)
  console.log('Sending filtered CSV to admin...');
  await sendFilteredCsvEmail(filteredCsv, key.split('/').pop(), process.env.SOURCE_EMAIL);
  console.log('Filtered CSV sent to admin.');

  // 2. Push email jobs to SQS for each active user
  const queueUrl = process.env.EMAIL_QUEUE_URL;
  for (const row of activeRows) {
    const email = row.Email || row.email;
    const name = row.Username || row.Name || row.username || row.name || '';
    const checkInsRaw = row['Check Ins'] || row['Check ins'] || row['check ins'] || row['Checkins'] || row['checkins'] || '0';
    const checkIns = parseInt(checkInsRaw, 10) || 0;
    const { subject, body } = getGymPassportDeduction(checkIns, name);
    console.log(`Sending email to ${name} with ${checkIns} check-ins. Reimbursement info: ${row['Reimbursed Amount']}`);
    if (email) {
      const messageBody = JSON.stringify({
        email,
        name,
        subject,
        body,
        checkIns
      });
      try {
        await sqs.sendMessage({
          QueueUrl: queueUrl,
          MessageBody: messageBody
        }).promise();
        console.log(`Queued email job for: ${email}`);
      } catch (err) {
        console.error(`Failed to queue email for ${email}:`, err);
        // Optionally: notify admin here
      }
    }
  }

  // 3. Idempotency marker file
  const markerKey = key + '.emails_sent_marker';
  await s3.putObject({ Bucket: bucket, Key: markerKey, Body: 'sent' }).promise();
  console.log('Marker file created.');

  console.log('Lambda execution complete.');
  return { statusCode: 200, body: 'Filtered email sent and email jobs queued.' };
  } catch (error) {
    console.error('Error processing CSV file:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
