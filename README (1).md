# מעביר קבצים מדרייב

כלי פשוט: מדביקים קישור Google Drive, מקבלים קישור לצפייה וקישור להורדה ישירה שהשרת מכין.

## איך זה עובד

- `public/index.html` — הדף שהמשתמש רואה (טופס להזנת קישור).
- `server.js` — שרת Node/Express שמחלץ את מזהה הקובץ, פונה לגוגל דרייב, מטפל
  במסך "לא ניתן לסרוק לוירוסים" שגוגל מציג לקבצים גדולים, ומזרים (streaming)
  את הקובץ ישירות למשתמש עם כותרת הורדה תקינה.

**חשוב:** GitHub עצמו (וגם GitHub Pages) לא מריצים קוד שרת — הם רק מאחסנים
את הקוד. כדי שהשרת ירוץ בפועל צריך לפרוס (deploy) אותו לשירות שמריץ Node,
למשל Render (יש חבילת חינם).

---

## שלב 1: העלאה ל-GitHub

```bash
cd drive-tool
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

(מחליפים `USERNAME/REPO_NAME` בפרטי הריפו שיצרת ב-GitHub)

---

## שלב 2: פריסה ל-Render (חינמי)

1. נכנסים ל-[render.com](https://render.com) ומתחברים עם חשבון GitHub.
2. **New +** → **Web Service**.
3. בוחרים את הריפו שהעלית.
4. הגדרות:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. לוחצים **Create Web Service**.

תוך כמה דקות Render ייתן כתובת כמו:
`https://drive-tool-xxxx.onrender.com`

זו הכתובת שנכנסים אליה כדי להשתמש בכלי.

> **הערה על החבילה החינמית:** בחבילת החינם של Render השרת "נרדם" אחרי כמה
> דקות של חוסר פעילות, והבקשה הראשונה אחרי שינה לוקחת כ-30-50 שניות
> להתעורר. זה תקין ולא תקלה.

---

## שלב 3: שימוש

1. נכנסים לכתובת של השרת.
2. מדביקים קישור דרייב (כמו `https://drive.google.com/file/d/XXXX/view`).
3. לוחצים "הכן קישור".
4. מקבלים שני קישורים: **צפייה** (נגן מוטמע) ו-**הורדה ישירה** (השרת מזרים
   את הקובץ).

## דרישה חשובה

הקובץ בדרייב חייב להיות משותף כ**"כל מי שיש לו את הקישור"** (Anyone with
the link), אחרת השרת לא יוכל לגשת אליו.

## הרצה מקומית (לבדיקות)

```bash
npm install
npm start
```
השרת יעלה על `http://localhost:3000`
