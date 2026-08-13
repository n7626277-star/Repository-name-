const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- עזרים ---

// מחלץ File ID מכל סוגי קישורי Google Drive הנפוצים
function extractFileId(input) {
  if (!input) return null;
  const trimmed = input.trim();

  // אם המשתמש הדביק כבר רק את ה-ID (ללא קישור מלא)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,   // /file/d/ID/view
    /[?&]id=([a-zA-Z0-9_-]+)/,        // ?id=ID
    /\/d\/([a-zA-Z0-9_-]+)/           // /d/ID
  ];

  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// מוציא שם קובץ מתוך header של content-disposition, אם קיים
function extractFilename(headers, fallback) {
  const cd = headers.get('content-disposition');
  if (cd) {
    const match = cd.match(/filename="?([^";]+)"?/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return fallback;
}

// מבצע הורדה מגוגל דרייב, כולל מעקף למסך "לא ניתן לסרוק לוירוסים" בקבצים גדולים
async function fetchDriveFile(fileId) {
  const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  let response = await fetch(baseUrl, { redirect: 'follow' });
  const contentType = response.headers.get('content-type') || '';

  // אם גוגל מחזיר עמוד HTML (מסך אזהרה) במקום הקובץ עצמו - צריך לחלץ טוקן אישור
  if (contentType.includes('text/html')) {
    const html = await response.text();

    // ניסיון 1: טופס עם action ו-input fields (הפורמט הנוכחי של גוגל)
    const formActionMatch = html.match(/action="([^"]+)"/);
    const idMatch = html.match(/name="id" value="([^"]+)"/);
    const confirmMatch = html.match(/name="confirm" value="([^"]+)"/);
    const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);

    if (formActionMatch) {
      const action = formActionMatch[1].replace(/&amp;/g, '&');
      const params = new URLSearchParams();
      if (idMatch) params.set('id', idMatch[1]);
      if (confirmMatch) params.set('confirm', confirmMatch[1]);
      if (uuidMatch) params.set('uuid', uuidMatch[1]);

      const confirmUrl = `${action}?${params.toString()}`;
      response = await fetch(confirmUrl, { redirect: 'follow' });
    } else {
      // ניסיון 2: קישור confirm ישן יותר בתוך ה-HTML
      const oldConfirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
      if (oldConfirmMatch) {
        const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${oldConfirmMatch[1]}&id=${fileId}`;
        response = await fetch(confirmUrl, { redirect: 'follow' });
      } else {
        // לא הצלחנו למצוא טוקן אישור - כנראה שהקובץ לא ציבורי או שהמבנה השתנה
        throw new Error('לא ניתן לגשת לקובץ - ודאו שהשיתוף מוגדר כ"כל מי שיש לו את הקישור"');
      }
    }
  }

  if (!response.ok) {
    throw new Error(`גוגל דרייב החזיר שגיאה: ${response.status}`);
  }

  return response;
}

// --- נתיבים (Routes) ---

// מקבל קישור דרייב, מחזיר מידע + קישורים שימושיים
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  const fileId = extractFileId(url);

  if (!fileId) {
    return res.status(400).json({ error: 'לא זוהה קישור Google Drive תקין' });
  }

  res.json({
    fileId,
    previewUrl: `/preview/${fileId}`,
    downloadUrl: `/download/${fileId}`
  });
});

// עמוד צפייה - מטמיע את נגן הדרייב
app.get('/preview/:id', (req, res) => {
  const fileId = req.params.id;
  res.redirect(`https://drive.google.com/file/d/${fileId}/preview`);
});

// הורדה ישירה - השרת שולף את הקובץ מגוגל ומעביר אותו הלאה למשתמש
app.get('/download/:id', async (req, res) => {
  const fileId = req.params.id;
  try {
    const driveResponse = await fetchDriveFile(fileId);
    const filename = extractFilename(driveResponse.headers, `${fileId}.mp4`);
    const contentType = driveResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = driveResponse.headers.get('content-length');

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // הזרמת הקובץ (streaming) ישירות למשתמש בלי לטעון אותו כולו לזיכרון
    const reader = driveResponse.body.getReader();
    req.on('close', () => reader.cancel().catch(() => {}));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'שגיאה בהורדת הקובץ' });
  }
});

app.listen(PORT, () => {
  console.log(`השרת פועל על פורט ${PORT}`);
});
