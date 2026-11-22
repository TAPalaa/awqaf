/**
 * ============================================================================
 * منصة إدارة برامج الثانويات الشرعية وتنظيم الزيارات الميدانية
 * وزارة الأوقاف — دائرة التعليم الشرعي
 * النسخة الأولية: v1.0.0
 * ============================================================================
 * التعليمات السريعة للإعداد:
 * 1. افتح ملف Google Sheets جديد.
 * 2. من القائمة العلوية اختر: Extensions (الإضافات) > Apps Script.
 * 3. الصق هذا الكود بالكامل واحفظه.
 * 4. من قائمة المشروع اليسرى: Project Settings (إعدادات المشروع) > Script Properties:
 *    أضف خاصية باسم: GEMINI_API_KEY وضع قيمتها مفتاح Gemini API من Google AI Studio.
 * 5. نفّذ الدالة setupDatabase مرة واحدة فقط لإنشاء الأوراق الثلاث تلقائياً.
 * 6. اضغط Deploy > New deployment > Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. انسخ رابط الـ Web App وضعه في ملف www/js/config.js داخل API_URL.
 * ============================================================================
 */

const SHEET_SCHEDULES = 'البرامج';
const SHEET_USERS = 'المستخدمين';
const SHEET_VISITS = 'الزيارات';

const GEMINI_MODEL = 'gemini-2.5-flash';
const PASSWORD_SALT = 'AWQAF_SHARIA_V1_SALT_2026';

const SYRIAN_GOVERNORATES = [
  'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
  'إدلب', 'درعا', 'السويداء', 'القنيطرة', 'دير الزور', 'الحسكة', 'الرقة'
];

// ----------------------------------------------------------------------------
// 1. تهيئة قاعدة البيانات (الأوراق الثلاث)
// ----------------------------------------------------------------------------
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEET_SCHEDULES, [
    'id', 'school', 'gov', 'gender', 'day', 'period', 'subject', 'teacher', 'grade', 'updatedAt'
  ]);

  ensureSheet_(ss, SHEET_USERS, [
    'username', 'passwordHash', 'fullName', 'createdAt'
  ]);

  ensureSheet_(ss, SHEET_VISITS, [
    'visitId', 'username', 'scheduleId', 'status', 'note', 'visitDate', 'updatedAt'
  ]);

  return { ok: true, message: 'تم تجهيز أوراق قاعدة البيانات بنجاح' };
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1b3b2b')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    schedules: ensureSheet_(ss, SHEET_SCHEDULES, [
      'id', 'school', 'gov', 'gender', 'day', 'period', 'subject', 'teacher', 'grade', 'updatedAt'
    ]),
    users: ensureSheet_(ss, SHEET_USERS, [
      'username', 'passwordHash', 'fullName', 'createdAt'
    ]),
    visits: ensureSheet_(ss, SHEET_VISITS, [
      'visitId', 'username', 'scheduleId', 'status', 'note', 'visitDate', 'updatedAt'
    ])
  };
}

// ----------------------------------------------------------------------------
// 2. نقاط الدخول HTTP (doGet / doPost)
// ----------------------------------------------------------------------------
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'getInitialData';

    if (action === 'ping') {
      return jsonResponse_({ ok: true, status: 'online', version: '1.0.0' });
    }

    if (action === 'getInitialData') {
      const username = (params.username || '').trim();
      const token = (params.token || '').trim();
      return jsonResponse_(handleGetInitialData_(username, token));
    }

    return jsonResponse_({ ok: false, error: 'طلب غير معروف' });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || 'حدث خطأ غير متوقع' });
  }
}

function doPost(e) {
  try {
    const rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);
    const action = payload.action || '';

    switch (action) {
      case 'getInitialData':
        return jsonResponse_(handleGetInitialData_(payload.username, payload.token));

      case 'register':
        return jsonResponse_(handleRegister_(payload));

      case 'login':
        return jsonResponse_(handleLogin_(payload));

      case 'uploadSchedules':
        return jsonResponse_(handleUploadSchedules_(payload));

      case 'addSchedule':
        return jsonResponse_(handleAddSchedule_(payload));

      case 'updateSchedule':
        return jsonResponse_(handleUpdateSchedule_(payload));

      case 'deleteSchedule':
        return jsonResponse_(handleDeleteSchedule_(payload));

      case 'saveVisit':
        return jsonResponse_(handleSaveVisit_(payload));

      case 'deleteVisit':
        return jsonResponse_(handleDeleteVisit_(payload));

      default:
        return jsonResponse_({ ok: false, error: 'إجراء غير مدعوم' });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || 'تعذر تنفيذ العملية حالياً' });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// 3. جلب البيانات الأساسية والزيارات الشخصية
// ----------------------------------------------------------------------------
function handleGetInitialData_(username, token) {
  const sheets = getSheets_();
  const schedules = readObjects_(sheets.schedules);

  // استخراج قائمة المدارس الفريدة مع المحافظة والنوع للاقتراح التلقائي في صفحة الرفع
  const schoolMap = {};
  schedules.forEach(function (row) {
    const key = (row.school || '').trim();
    if (key && !schoolMap[key]) {
      schoolMap[key] = {
        school: key,
        gov: row.gov || '',
        gender: row.gender || 'ذكور'
      };
    }
  });

  let userVisits = [];
  let validUser = null;

  if (username && token) {
    const userObj = verifyToken_(sheets.users, username, token);
    if (userObj) {
      validUser = { username: userObj.username, fullName: userObj.fullName };
      const allVisits = readObjects_(sheets.visits);
      userVisits = allVisits.filter(function (v) {
        return String(v.username).toLowerCase() === String(userObj.username).toLowerCase();
      });
    }
  }

  return {
    ok: true,
    schedules: schedules,
    schools: Object.values(schoolMap),
    visits: userVisits,
    user: validUser,
    serverTime: new Date().toISOString()
  };
}

// ----------------------------------------------------------------------------
// 4. نظام الحسابات (بدون ربط بحساب Google — تشفير SHA-256)
// ----------------------------------------------------------------------------
function handleRegister_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const username = normalizeUsername_(payload.username);
    const password = String(payload.password || '');
    const fullName = String(payload.fullName || username).trim();

    if (username.length < 3) {
      return { ok: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' };
    }
    if (password.length < 4) {
      return { ok: false, error: 'كلمة المرور يجب أن تكون 4 رموز على الأقل' };
    }

    const sheets = getSheets_();
    const users = readObjects_(sheets.users);
    const exists = users.some(function (u) {
      return normalizeUsername_(u.username) === username;
    });

    if (exists) {
      return { ok: false, error: 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر أو تسجيل الدخول' };
    }

    const passwordHash = hashPassword_(username, password);
    const now = new Date().toISOString();
    sheets.users.appendRow([username, passwordHash, fullName, now]);

    const token = makeSessionToken_(username, passwordHash);
    return {
      ok: true,
      user: { username: username, fullName: fullName, token: token }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleLogin_(payload) {
  const username = normalizeUsername_(payload.username);
  const password = String(payload.password || '');

  if (!username || !password) {
    return { ok: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  const sheets = getSheets_();
  const users = readObjects_(sheets.users);
  const target = users.find(function (u) {
    return normalizeUsername_(u.username) === username;
  });

  if (!target) {
    return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const expectedHash = hashPassword_(username, password);
  if (String(target.passwordHash) !== expectedHash) {
    return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const token = makeSessionToken_(username, expectedHash);
  const allVisits = readObjects_(sheets.visits);
  const userVisits = allVisits.filter(function (v) {
    return normalizeUsername_(v.username) === username;
  });

  return {
    ok: true,
    user: {
      username: target.username,
      fullName: target.fullName || target.username,
      token: token
    },
    visits: userVisits
  };
}

function verifyToken_(usersSheet, username, token) {
  const norm = normalizeUsername_(username);
  const users = readObjects_(usersSheet);
  const target = users.find(function (u) {
    return normalizeUsername_(u.username) === norm;
  });
  if (!target) return null;
  const expectedToken = makeSessionToken_(norm, String(target.passwordHash));
  return (token === expectedToken) ? target : null;
}

function normalizeUsername_(val) {
  return String(val || '').trim().toLowerCase();
}

function hashPassword_(username, password) {
  const raw = PASSWORD_SALT + ':' + username + ':' + password;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytesToHex_(digest);
}

function makeSessionToken_(username, passwordHash) {
  const raw = 'TOKEN:' + PASSWORD_SALT + ':' + username + ':' + passwordHash;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytesToHex_(digest);
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    const v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

// ----------------------------------------------------------------------------
// 5. الرفع الصامت واستخراج الحصص عبر Gemini AI
// ----------------------------------------------------------------------------
function handleUploadSchedules_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const school = String(payload.school || '').trim();
    const gov = String(payload.gov || '').trim();
    const gender = String(payload.gender || '').trim();
    const replaceOld = payload.replaceOld !== false;
    const files = Array.isArray(payload.files) ? payload.files : [];

    if (!school) return { ok: false, error: 'يرجى إدخال اسم الثانوية' };
    if (SYRIAN_GOVERNORATES.indexOf(gov) === -1) {
      return { ok: false, error: 'يرجى اختيار محافظة صحيحة من القائمة' };
    }
    if (gender !== 'ذكور' && gender !== 'إناث') {
      return { ok: false, error: 'يرجى تحديد نوع المدرسة (ذكور أو إناث)' };
    }
    if (files.length === 0) {
      return { ok: false, error: 'يرجى إرفاق ملف واحد على الأقل لبرنامج الدوام' };
    }

    // استخراج الحصص من جميع الملفات المرفوعة بصمت تام عبر Gemini
    let extractedRows = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rows = extractWithGemini_(f, school, gov, gender);
      extractedRows = extractedRows.concat(rows);
    }

    if (extractedRows.length === 0) {
      return {
        ok: false,
        error: 'لم نتمكن من قراءة حصص واضحة من الملفات المرفقة. يرجى التأكد من وضوح الجدول والمحاولة مجدداً.'
      };
    }

    const sheets = getSheets_();
    const sheet = sheets.schedules;

    // خيار استبدال برنامج المدرسة القديم لمنع التكرار
    if (replaceOld) {
      deleteRowsBySchool_(sheet, school, gov, gender);
    }

    const now = new Date().toISOString();
    const rowsToInsert = extractedRows.map(function (item) {
      return [
        generateId_('SCH'),
        school,
        gov,
        gender,
        cleanText_(item.day, 'غير محدد'),
        cleanText_(item.period, 'غير محددة'),
        cleanText_(item.subject, 'غير محددة'),
        cleanText_(item.teacher, 'غير محدد'),
        cleanText_(item.grade, 'غير محدد'),
        now
      ];
    });

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, 10).setValues(rowsToInsert);

    return {
      ok: true,
      insertedCount: rowsToInsert.length,
      school: school,
      gov: gov,
      gender: gender,
      replacedOld: replaceOld
    };
  } finally {
    lock.releaseLock();
  }
}

function extractWithGemini_(fileObj, school, gov, gender) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('لم يتم ضبط مفتاح الخدمة في إعدادات الخادم بعد.');
  }

const promptText = [
    'أنت نظام خبير في استخراج جداول دوام الثانويات الشرعية بكافة أشكالها (aSc Timetables، جداول يومية لجميع الشعب، جداول Excel، أو ملفين منفصلين أحدهما للمواد والآخر للمدرسين).',
    'بيانات المدرسة: المدرسة="' + school + '"، المحافظة="' + gov + '"، النوع="' + gender + '".',
    'قواعد الاستخراج الدقيقة:',
    '1. إذا كانت الصفحة لشعبة واحدة (مثل النابلسي)، اقرأ اسم الصف والشعبة من عنوان الصفحة وطبّقه على كل الحصص.',
    '2. إذا كانت الصفحة ليوم واحد وفيها كل الشعب (مثل الجويني)، اقرأ اليوم من العمود واستخرج كل شعبة وحصصها.',
    '3. إذا أُرفق ملفان/صورتان معاً (أحدهما للمواد والآخر للمدرسين مثل حموليلا)، طابق كل خلية (نفس اليوم والحصة والشعبة) وادمج اسم المادة مع اسم المدرس في سجل واحد.',
    '4. حوّل الاختصارات تلقائياً: E إلى "اللغة الإنكليزية"، F إلى "اللغة الفرنسية".',
    '5. تجاهل أعمدة الاستراحة والخلايا الفارغة تماماً.',
    'أعد مصفوفة JSON صالحة فقط بدون أي نص إضافي أو علامات ```، بالمفاتيح الدقيقة: day, period, subject, teacher, grade.'
  ].join('\n');

  const parts = [{ text: promptText }];

  if (fileObj.extractedText && String(fileObj.extractedText).trim().length > 0) {
    parts.push({
      text: 'محتوى الملف (' + (fileObj.name || 'جدول') + '):\n' + String(fileObj.extractedText).slice(0, 120000)
    });
  } else if (fileObj.base64 && fileObj.mimeType) {
    parts.push({
      inline_data: {
        mime_type: fileObj.mimeType,
        data: fileObj.base64
      }
    });
  } else {
    return [];
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);

  const reqBody = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(reqBody),
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const textResp = resp.getContentText();
  if (code < 200 || code >= 300) {
    Logger.log('Gemini API Error ' + code + ': ' + textResp);
    throw new Error('تعذر تحليل الملف المرفق حالياً، يرجى المحاولة بعد قليل.');
  }

  const parsed = JSON.parse(textResp);
  const candidateText =
    parsed &&
    parsed.candidates &&
    parsed.candidates[0] &&
    parsed.candidates[0].content &&
    parsed.candidates[0].content.parts &&
    parsed.candidates[0].content.parts[0] &&
    parsed.candidates[0].content.parts[0].text
      ? parsed.candidates[0].content.parts[0].text
      : '[]';

  const cleaned = candidateText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const arr = JSON.parse(cleaned);
  return Array.isArray(arr) ? arr : [];
}

function deleteRowsBySchool_(sheet, school, gov, gender) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const targetSchool = school.trim();
  const targetGov = gov.trim();
  const targetGender = gender.trim();

  // حذف من الأسفل للأعلى لتفادي إزاحة الفهارس
  for (let r = values.length - 1; r >= 1; r--) {
    const rowSchool = String(values[r][1] || '').trim();
    const rowGov = String(values[r][2] || '').trim();
    const rowGender = String(values[r][3] || '').trim();
    if (rowSchool === targetSchool && rowGov === targetGov && rowGender === targetGender) {
      sheet.deleteRow(r + 1);
    }
  }
}

// ----------------------------------------------------------------------------
// 6. إضافة وتعديل وحذف الحصص مباشرة من الصفحة الرئيسية
// ----------------------------------------------------------------------------
function handleAddSchedule_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const item = payload.item || {};
    const school = cleanText_(item.school, '');
    const gov = cleanText_(item.gov, '');
    const gender = cleanText_(item.gender, 'ذكور');

    if (!school || SYRIAN_GOVERNORATES.indexOf(gov) === -1) {
      return { ok: false, error: 'يرجى إدخال المدرسة والمحافظة بشكل صحيح' };
    }

    const sheets = getSheets_();
    const id = generateId_('SCH');
    const now = new Date().toISOString();

    const row = [
      id,
      school,
      gov,
      gender,
      cleanText_(item.day, 'الأحد'),
      cleanText_(item.period, 'الأولى'),
      cleanText_(item.subject, 'غير محددة'),
      cleanText_(item.teacher, 'غير محدد'),
      cleanText_(item.grade, 'غير محدد'),
      now
    ];
    sheets.schedules.appendRow(row);

    return {
      ok: true,
      item: {
        id: row[0], school: row[1], gov: row[2], gender: row[3],
        day: row[4], period: row[5], subject: row[6], teacher: row[7],
        grade: row[8], updatedAt: row[9]
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleUpdateSchedule_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const item = payload.item || {};
    const id = String(item.id || '').trim();
    if (!id) return { ok: false, error: 'معرّف الحصة غير موجود' };

    const sheets = getSheets_();
    const sheet = sheets.schedules;
    const values = sheet.getDataRange().getValues();

    for (let r = 1; r < values.length; r++) {
      if (String(values[r][0]).trim() === id) {
        const now = new Date().toISOString();
        const updatedRow = [
          id,
          cleanText_(item.school, values[r][1]),
          cleanText_(item.gov, values[r][2]),
          cleanText_(item.gender, values[r][3]),
          cleanText_(item.day, values[r][4]),
          cleanText_(item.period, values[r][5]),
          cleanText_(item.subject, values[r][6]),
          cleanText_(item.teacher, values[r][7]),
          cleanText_(item.grade, values[r][8]),
          now
        ];
        sheet.getRange(r + 1, 1, 1, 10).setValues([updatedRow]);
        return {
          ok: true,
          item: {
            id: updatedRow[0], school: updatedRow[1], gov: updatedRow[2], gender: updatedRow[3],
            day: updatedRow[4], period: updatedRow[5], subject: updatedRow[6], teacher: updatedRow[7],
            grade: updatedRow[8], updatedAt: updatedRow[9]
          }
        };
      }
    }

    return { ok: false, error: 'لم يتم العثور على الحصة المطلوبة' };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteSchedule_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const id = String(payload.id || '').trim();
    if (!id) return { ok: false, error: 'معرّف الحصة غير موجود' };

    const sheets = getSheets_();
    const sheet = sheets.schedules;
    const values = sheet.getDataRange().getValues();

    for (let r = 1; r < values.length; r++) {
      if (String(values[r][0]).trim() === id) {
        sheet.deleteRow(r + 1);
        return { ok: true, id: id };
      }
    }
    return { ok: false, error: 'لم يتم العثور على الحصة المطلوبة' };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// 7. نظام الزيارات الميدانية الشخصية لكل مشرف
// ----------------------------------------------------------------------------
function handleSaveVisit_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = getSheets_();
    const userObj = verifyToken_(sheets.users, payload.username, payload.token);
    if (!userObj) {
      return { ok: false, error: 'يرجى تسجيل الدخول أولاً لتأكيد الزيارة', requireAuth: true };
    }

    const scheduleId = String(payload.scheduleId || '').trim();
    const status = String(payload.status || 'تمت').trim();
    const note = String(payload.note || '').trim();
    const visitDate = String(payload.visitDate || Utilities.formatDate(new Date(), 'Asia/Damascus', 'yyyy-MM-dd')).trim();

    if (!scheduleId) return { ok: false, error: 'معرّف الحصة غير صالح' };

    const sheet = sheets.visits;
    const values = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    const normUser = normalizeUsername_(userObj.username);

    for (let r = 1; r < values.length; r++) {
      if (normalizeUsername_(values[r][1]) === normUser && String(values[r][2]).trim() === scheduleId) {
        const visitId = String(values[r][0]);
        const updated = [visitId, userObj.username, scheduleId, status, note, visitDate, now];
        sheet.getRange(r + 1, 1, 1, 7).setValues([updated]);
        return {
          ok: true,
          visit: {
            visitId: visitId, username: userObj.username, scheduleId: scheduleId,
            status: status, note: note, visitDate: visitDate, updatedAt: now
          }
        };
      }
    }

    const newVisitId = generateId_('VST');
    const newRow = [newVisitId, userObj.username, scheduleId, status, note, visitDate, now];
    sheet.appendRow(newRow);

    return {
      ok: true,
      visit: {
        visitId: newVisitId, username: userObj.username, scheduleId: scheduleId,
        status: status, note: note, visitDate: visitDate, updatedAt: now
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteVisit_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = getSheets_();
    const userObj = verifyToken_(sheets.users, payload.username, payload.token);
    if (!userObj) {
      return { ok: false, error: 'يرجى تسجيل الدخول أولاً', requireAuth: true };
    }

    const scheduleId = String(payload.scheduleId || '').trim();
    const normUser = normalizeUsername_(userObj.username);
    const sheet = sheets.visits;
    const values = sheet.getDataRange().getValues();

    for (let r = values.length - 1; r >= 1; r--) {
      if (normalizeUsername_(values[r][1]) === normUser && String(values[r][2]).trim() === scheduleId) {
        sheet.deleteRow(r + 1);
        return { ok: true, scheduleId: scheduleId };
      }
    }
    return { ok: true, scheduleId: scheduleId };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// 8. دوال مساعدة
// ----------------------------------------------------------------------------
function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const list = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (cell) { return String(cell).trim() === ''; })) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] instanceof Date ? row[c].toISOString() : String(row[c] === undefined ? '' : row[c]);
    }
    list.push(obj);
  }
  return list;
}

function cleanText_(val, fallback) {
  const s = String(val === undefined || val === null ? '' : val).trim();
  return s.length > 0 ? s : fallback;
}

function generateId_(prefix) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return prefix + '-' + new Date().getTime() + '-' + rand;
}
