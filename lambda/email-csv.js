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
function getReimbursementEmail(checkIns, name) {
  if (checkIns >= 16) {
    return {
      subject: '🏆 Great Job! Your Gym Subscription is Fully Covered 🎉',
      body: `Hi ${name},\n\nAwesome work this month! You’ve completed 16 or more check-ins through Gym Passport.\n\nAs part of our wellness program, we’re happy to share that RS9500 (100%) of your Gym Passport subscription fee will be covered by the company for this month.\n\nKeep up the great momentum and stay healthy! 💪\n\nBest Regards,\nEmumba Fitness Team 🏋️‍♂️`,
      reimbursement: 9500
    };
  } else if (checkIns >= 12) {
    return {
      subject: '👏 Well Done! 75% of Your Gym Fee is Covered 🥈',
      body: `Hi ${name},\n\nYou made 12 to 15 check-ins through Gym Passport this month — great job staying active!\n\nYou qualify to have Rs7125 (75%) of your Gym Passport subscription fee covered by the company this month. The remaining ₹2375 will be automatically deducted from your salary.\n\nStay consistent and keep moving! 🚴‍♀️\n\nBest Regards,\nEmumba Fitness Team 🏋️‍♀️`,
      reimbursement: 7125
    };
  } else if (checkIns >= 8) {
    return {
      subject: '💪 Keep It Up! 50% of Your Gym Fee is Covered 🏅',
      body: `Hi ${name},\n\nYou logged 8 to 11 check-ins through Gym Passport this month — a solid effort!\n\nYou’re eligible for Rs4750 (50%) coverage of your Gym Passport subscription fee. The remaining Rs4750 will be deducted from your salary.\n\nYou're doing great — let’s aim even higher next month! 🚀\n\nBest Regards,\nEmumba Fitness Team 🏃‍♂️`,
      reimbursement: 4750
    };
  } else if (checkIns >= 4) {
    return {
      subject: '✅ Progress Made! 25% of Your Gym Fee is Covered',
      body: `Hi ${name},\n\nYou made 4 to 7 check-ins through Gym Passport this month.\n\nYou qualify for Rs2375 (25%) coverage of your Gym Passport subscription fee. The remaining Rs7125 will be deducted from your salary.\n\nKeep striving for more next month! 🌟\n\nBest Regards,\nEmumba Fitness Team 💼`,
      reimbursement: 2375
    };
  } else {
    return {
      subject: '🕒 Let’s Refocus on Fitness Next Month',
      body: `Hi ${name},\n\nWe noticed you made fewer than 4 check-ins through Gym Passport this month.\n\nAs per the company’s wellness policy, 0% of your Gym Passport subscription fee is eligible for reimbursement, and the full amount of Rs 9500 will be deducted from your salary.\n\nIf you wish to unsubscribe from Gym Passport, you can do so via Equokka during the first 3 days of the upcoming month.\n\nWe encourage you to stay active and take full advantage of this benefit if you choose to continue. Every check-in counts! 💡\n\nBest Regards,\nEmumba Fitness Team 🏢`,
      reimbursement: 0
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

  // Parse CSV and filter for active subscription status
  const activeRows = [];
  await new Promise((resolve, reject) => {
    Readable.from(fileContent)
      .pipe(csv())
      .on('data', (row) => {
        // Normalize header keys for robustness
        const status = (row['subscription status'] || row['Subscription Status'] || row['Status'] || row['status'] || '').toLowerCase();
        console.log(`Row status: ${status} for user: ${row.Username || row.Name || 'Unknown'}`);
        if (status === 'active' || status === 'Active') {
          activeRows.push(row);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`Number of active rows: ${activeRows.length}`);

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
    
    // Calculate reimbursement based on check-ins
    const userName = row.Username || row.Name || row.username || row.name || '';
    const reimbursementInfo = getReimbursementEmail(checkIns, userName);
    row['Reimbursed Amount'] = reimbursementInfo.reimbursement;
    
    console.log(`User: ${userName}, Check-ins: ${checkIns}, Reimbursement: ${reimbursementInfo.reimbursement}`);
  }

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
    const { subject, body } = getReimbursementEmail(checkIns, name);
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
