const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const DOWNLOAD_SERVER = process.env.DOWNLOAD_SERVER_URL; // לדוגמה: https://repository-name-0tf0.onrender.com

const PROCESSED_FLAG = 'DriveBotProcessed'; // תווית IMAP מותאמת אישית לסימון מיילים שכבר טופלו

if (!EMAIL_USER || !EMAIL_APP_PASSWORD || !DOWNLOAD_SERVER) {
  console.error('חסרים משתני סביבה נדרשים (EMAIL_USER / EMAIL_APP_PASSWORD / DOWNLOAD_SERVER_URL)');
  process.exit(1);
}

// מחלץ File ID מתוך קישור Google Drive
function extractFileId(text) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function main() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
    logger: false
  });

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD }
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  try {
    // מחפשים מיילים שמכילים "drive.google.com" בגוף ההודעה
    const uids = await client.search({ body: 'drive.google.com' });

    console.log(`נמצאו ${uids.length} מיילים תואמי חיפוש, בודק מי מהם עוד לא טופל...`);

    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true, flags: true });
      const flags = Array.from(msg.flags || []);

      if (flags.includes(PROCESSED_FLAG)) {
        continue; // כבר טופל בעבר
      }

      const parsed = await simpleParser(msg.source);
      const bodyText = (parsed.text || '') + ' ' + (parsed.html || '');

      const urlMatch = bodyText.match(/https?:\/\/drive\.google\.com\/[^\s"'<>]+/);
      const fileId = urlMatch ? extractFileId(urlMatch[0]) : extractFileId(bodyText);

      if (!fileId) {
        console.log(`UID ${uid}: לא נמצא קישור דרייב תקין בגוף ההודעה, מסמן ומדלג`);
        await client.messageFlagsAdd(uid, [PROCESSED_FLAG]);
        continue;
      }

      const previewLink = `${DOWNLOAD_SERVER}/preview/${fileId}`;
      const downloadLink = `${DOWNLOAD_SERVER}/download/${fileId}`;

      const fromAddress = parsed.from && parsed.from.value && parsed.from.value[0]
        ? parsed.from.value[0].address
        : null;

      if (!fromAddress) {
        console.log(`UID ${uid}: לא נמצאה כתובת שולח, מסמן ומדלג`);
        await client.messageFlagsAdd(uid, [PROCESSED_FLAG]);
        continue;
      }

      const subject = parsed.subject || '(ללא נושא)';
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

      await transporter.sendMail({
        from: EMAIL_USER,
        to: fromAddress,
        subject: replySubject,
        inReplyTo: parsed.messageId,
        references: parsed.messageId,
        text: [
          'שלום,',
          '',
          'הקישורים מוכנים:',
          '',
          `צפייה: ${previewLink}`,
          `הורדה ישירה: ${downloadLink}`,
          '',
          '(מייל אוטומטי)'
        ].join('\n')
      });

      await client.messageFlagsAdd(uid, [PROCESSED_FLAG]);
      console.log(`UID ${uid}: נשלחה תשובה אל ${fromAddress} עבור fileId=${fileId}`);
    }
  } finally {
    lock.release();
  }

  await client.logout();
}

main().catch((err) => {
  console.error('שגיאה בהרצת הסקריפט:', err.message || err);
  process.exit(1);
});
