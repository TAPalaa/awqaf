# دليل التشغيل السريع — منصة برامج الثانويات الشرعية (النسخة الأولية v1.0)

## 1. التجربة الفورية على جهازك (خلال 10 ثوانٍ)
- فك ضغط المجلد في `D:\TAP\web\awqaf`.
- افتح ملف `www/index.html` مباشرة في المتصفح (أو شغّل `python desktop/app.py` لتجربة نسخة الحاسوب).
- ستعمل المنصة تلقائياً بـ **وضع المعاينة التجريبي** مع بيانات مدارس تجريبية حتى تختبر الفرز والتعديل وتأكيد الزيارات وتصدير الـ PDF ونسخ الواتساب فوراً.

## 2. الربط الفعلي بـ Google Sheets و Gemini AI (التشغيل الحقيقي)
1. أنشئ ملف **Google Sheets** جديد باسم `قاعدة_بيانات_الثانويات_الشرعية`.
2. من القائمة العلوية اختر **Extensions > Apps Script**.
3. انسخ محتوى الملف `backend/Code.gs` بالكامل والصقه في محرر Apps Script ثم احفظ.
4. من القائمة اليسرى في Apps Script افتح **Project Settings (⚙️) > Script Properties**، وأضف:
   - **Property:** `GEMINI_API_KEY`
   - **Value:** مفتاح Gemini API المجاني من Google AI Studio.
5. اختر الدالة `setupDatabase` من الشريط العلوي واضغط **Run** (مرة واحدة فقط) ليتم إنشاء الأوراق الثلاث (`البرامج`، `المستخدمين`، `الزيارات`) تلقائياً.
6. اضغط **Deploy > New deployment > Web app**:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
7. انسخ رابط الـ **Web App URL** والصقه داخل ملف `www/js/config.js` في السطر:
   ```js
   API_URL: 'ضع_الرابط_هنا',
   ```

## 3. بناء تطبيق الحاسوب (`Awqaf.exe`) محلياً
- شغّل ملف `desktop/build_exe.bat` بالضغط المزدوج عليه، وستجد الملف التنفيذي الجاهز في `dist/Awqaf.exe`.

## 4. النشر وبناء الـ `APK` والـ `EXE` تلقائياً عبر GitHub
- ارفع كامل محتويات هذا المجلد إلى مستودع جديد على **GitHub** (فرع `main`).
- من إعدادات المستودع فعّل **Settings > Pages > Source: GitHub Actions**.
- سيعمل ملف `.github/workflows/build.yml` تلقائياً لينشر الموقع، ويبني لك ملف **`Awqaf.exe`** وملف **`Awqaf.apk`** في تبويب **Actions**.
