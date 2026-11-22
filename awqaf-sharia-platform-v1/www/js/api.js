/**
 * طبقة الاتصال السحابي، وإدارة الجلسة الدائمة (Cookies)، والتخزين المؤقت (Cache)،
 * بالإضافة لوضع المعاينة المحلي الكامل قبل ربط Google Apps Script.
 */
(function () {
  const CFG = window.AWQAF_CONFIG;

  // --------------------------------------------------------------------------
  // إدارة الـ Cookies طويلة الأمد + مرآة localStorage لتطبيقات الجوال والويندوز
  // --------------------------------------------------------------------------
  function setCookie(name, value, days) {
    try {
      const encoded = encodeURIComponent(value);
      const maxAge = (days || CFG.COOKIE_DAYS) * 24 * 60 * 60;
      document.cookie = `${name}=${encoded}; max-age=${maxAge}; path=/; SameSite=Lax`;
    } catch (e) {}
    try {
      localStorage.setItem(name, value);
    } catch (e) {}
  }

  function getCookie(name) {
    try {
      const prefix = name + '=';
      const parts = document.cookie.split(';');
      for (let i = 0; i < parts.length; i++) {
        const c = parts[i].trim();
        if (c.indexOf(prefix) === 0) {
          return decodeURIComponent(c.substring(prefix.length));
        }
      }
    } catch (e) {}
    try {
      return localStorage.getItem(name);
    } catch (e) {
      return null;
    }
  }

  function deleteCookie(name) {
    try {
      document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
    } catch (e) {}
    try {
      localStorage.removeItem(name);
    } catch (e) {}
  }

  function getSavedSession() {
    const raw = getCookie(CFG.COOKIE_USER);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && parsed.username && parsed.token) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(userObj) {
    if (!userObj) return;
    setCookie(CFG.COOKIE_USER, JSON.stringify({
      username: userObj.username,
      fullName: userObj.fullName || userObj.username,
      token: userObj.token
    }), CFG.COOKIE_DAYS);
  }

  function clearSession() {
    deleteCookie(CFG.COOKIE_USER);
  }

  // --------------------------------------------------------------------------
  // التخزين المؤقت (Cache) لدعم التصفح عند انقطاع الإنترنت
  // --------------------------------------------------------------------------
  function saveCache(data) {
    try {
      localStorage.setItem(CFG.CACHE_KEY_DATA, JSON.stringify({
        schedules: data.schedules || [],
        schools: data.schools || [],
        visits: data.visits || [],
        savedAt: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // وضع المعاينة التجريبي (يعمل تلقائياً إذا كان API_URL فارغاً)
  // --------------------------------------------------------------------------
  function isDemoMode() {
    return !CFG.API_URL || CFG.API_URL.trim() === '';
  }

  function getDemoDB() {
    const existing = localStorage.getItem(CFG.DEMO_DB_KEY);
    if (existing) {
      try { return JSON.parse(existing); } catch (e) {}
    }
    const seed = {
      schedules: [
        { id: 'SCH-101', school: 'الثانوية الشرعية للذكور - دمشق', gov: 'دمشق', gender: 'ذكور', day: 'الأحد', period: 'الحصة الأولى', subject: 'الفقه الإسلامي', teacher: 'أ. عبد الرحمن الحلبي', grade: 'الثالث الثانوي - ش1', updatedAt: new Date().toISOString() },
        { id: 'SCH-102', school: 'الثانوية الشرعية للذكور - دمشق', gov: 'دمشق', gender: 'ذكور', day: 'الأحد', period: 'الحصة الثانية', subject: 'التفسير وعلوم القرآن', teacher: 'أ. محمود الدمشقي', grade: 'الثاني الثانوي - ش2', updatedAt: new Date().toISOString() },
        { id: 'SCH-103', school: 'الثانوية الشرعية للإناث - الميدان', gov: 'دمشق', gender: 'إناث', day: 'الاثنين', period: 'الحصة الأولى', subject: 'الحديث الشريف', teacher: 'أ. فاطمة الزهراء الشامي', grade: 'الأول الثانوي - ش1', updatedAt: new Date().toISOString() },
        { id: 'SCH-104', school: 'الثانوية الشرعية للذكور - حلب (الخسروية)', gov: 'حلب', gender: 'ذكور', day: 'الثلاثاء', period: 'الحصة الثالثة', subject: 'اللغة العربية والنحو', teacher: 'أ. حسام الدين الشهابي', grade: 'الثالث الثانوي - ش1', updatedAt: new Date().toISOString() },
        { id: 'SCH-105', school: 'الثانوية الشرعية للإناث - حمص', gov: 'حمص', gender: 'إناث', day: 'الأربعاء', period: 'الحصة الثانية', subject: 'العقيدة الإسلامية', teacher: 'أ. سارة الرفاعي', grade: 'الثاني الثانوي - ش1', updatedAt: new Date().toISOString() },
        { id: 'SCH-106', school: 'الثانوية الشرعية للذكور - حماة', gov: 'حماة', gender: 'ذكور', day: 'الخميس', period: 'الحصة الرابعة', subject: 'أصول الفقه', teacher: 'أ. أنس الحموي', grade: 'الثالث الثانوي - ش2', updatedAt: new Date().toISOString() }
      ],
      users: [],
      visits: []
    };
    localStorage.setItem(CFG.DEMO_DB_KEY, JSON.stringify(seed));
    return seed;
  }

  function saveDemoDB(db) {
    localStorage.setItem(CFG.DEMO_DB_KEY, JSON.stringify(db));
  }

  function buildSchoolsList(schedules) {
    const map = {};
    schedules.forEach(s => {
      if (s.school && !map[s.school]) {
        map[s.school] = { school: s.school, gov: s.gov, gender: s.gender };
      }
    });
    return Object.values(map);
  }

  async function demoDispatch(action, payload) {
    await new Promise(r => setTimeout(r, 250));
    const db = getDemoDB();
    const session = getSavedSession();

    if (action === 'getInitialData') {
      const visits = session
        ? db.visits.filter(v => v.username.toLowerCase() === session.username.toLowerCase())
        : [];
      return {
        ok: true,
        demo: true,
        schedules: db.schedules,
        schools: buildSchoolsList(db.schedules),
        visits: visits,
        user: session ? { username: session.username, fullName: session.fullName } : null
      };
    }

    if (action === 'register') {
      const u = String(payload.username || '').trim().toLowerCase();
      const p = String(payload.password || '');
      const fn = String(payload.fullName || u).trim();
      if (u.length < 3) return { ok: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' };
      if (p.length < 4) return { ok: false, error: 'كلمة المرور يجب أن تكون 4 رموز على الأقل' };
      if (db.users.some(x => x.username.toLowerCase() === u)) {
        return { ok: false, error: 'اسم المستخدم مسجل مسبقاً' };
      }
      db.users.push({ username: u, password: p, fullName: fn });
      saveDemoDB(db);
      return { ok: true, user: { username: u, fullName: fn, token: 'DEMO-' + u } };
    }

    if (action === 'login') {
      const u = String(payload.username || '').trim().toLowerCase();
      const p = String(payload.password || '');
      const found = db.users.find(x => x.username.toLowerCase() === u && x.password === p);
      if (!found) return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      const visits = db.visits.filter(v => v.username.toLowerCase() === u);
      return {
        ok: true,
        user: { username: found.username, fullName: found.fullName, token: 'DEMO-' + found.username },
        visits: visits
      };
    }

    if (action === 'addSchedule') {
      const item = Object.assign({}, payload.item, {
        id: 'SCH-' + Date.now(),
        updatedAt: new Date().toISOString()
      });
      db.schedules.push(item);
      saveDemoDB(db);
      return { ok: true, item: item };
    }

    if (action === 'updateSchedule') {
      const idx = db.schedules.findIndex(x => x.id === payload.item.id);
      if (idx === -1) return { ok: false, error: 'لم يتم العثور على الحصة' };
      db.schedules[idx] = Object.assign({}, db.schedules[idx], payload.item, { updatedAt: new Date().toISOString() });
      saveDemoDB(db);
      return { ok: true, item: db.schedules[idx] };
    }

    if (action === 'deleteSchedule') {
      db.schedules = db.schedules.filter(x => x.id !== payload.id);
      saveDemoDB(db);
      return { ok: true, id: payload.id };
    }

    if (action === 'saveVisit') {
      if (!session) return { ok: false, error: 'يرجى تسجيل الدخول أولاً', requireAuth: true };
      const idx = db.visits.findIndex(v => v.username === session.username && v.scheduleId === payload.scheduleId);
      const visitObj = {
        visitId: idx >= 0 ? db.visits[idx].visitId : 'VST-' + Date.now(),
        username: session.username,
        scheduleId: payload.scheduleId,
        status: payload.status || 'تمت',
        note: payload.note || '',
        visitDate: payload.visitDate || new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString()
      };
      if (idx >= 0) db.visits[idx] = visitObj; else db.visits.push(visitObj);
      saveDemoDB(db);
      return { ok: true, visit: visitObj };
    }

    if (action === 'deleteVisit') {
      if (!session) return { ok: false, error: 'يرجى تسجيل الدخول أولاً', requireAuth: true };
      db.visits = db.visits.filter(v => !(v.username === session.username && v.scheduleId === payload.scheduleId));
      saveDemoDB(db);
      return { ok: true, scheduleId: payload.scheduleId };
    }

    if (action === 'uploadSchedules') {
      if (payload.replaceOld) {
        db.schedules = db.schedules.filter(s =>
          !(s.school === payload.school && s.gov === payload.gov && s.gender === payload.gender)
        );
      }
      const demoImported = [
        { day: 'الأحد', period: 'الحصة الأولى', subject: 'الفقه الإسلامي', teacher: 'أ. محمد خير العلي', grade: 'الأول الثانوي - ش1' },
        { day: 'الاثنين', period: 'الحصة الثانية', subject: 'القرآن الكريم والتلاوة', teacher: 'أ. خالد الصالح', grade: 'الثاني الثانوي - ش1' },
        { day: 'الأربعاء', period: 'الحصة الثالثة', subject: 'السيرة النبوية', teacher: 'أ. عمر الخطيب', grade: 'الثالث الثانوي - ش1' }
      ].map((r, i) => ({
        id: 'SCH-' + Date.now() + '-' + i,
        school: payload.school,
        gov: payload.gov,
        gender: payload.gender,
        day: r.day,
        period: r.period,
        subject: r.subject,
        teacher: r.teacher,
        grade: r.grade,
        updatedAt: new Date().toISOString()
      }));
      db.schedules = db.schedules.concat(demoImported);
      saveDemoDB(db);
      return {
        ok: true,
        demo: true,
        insertedCount: demoImported.length,
        school: payload.school,
        gov: payload.gov,
        gender: payload.gender
      };
    }

    return { ok: false, error: 'إجراء غير مدعوم' };
  }

  // --------------------------------------------------------------------------
  // الاتصال الفعلي مع Google Apps Script
  // --------------------------------------------------------------------------
  async function request(action, payload) {
    if (isDemoMode()) {
      return demoDispatch(action, payload || {});
    }

    const session = getSavedSession();
    const body = Object.assign({}, payload || {}, {
      action: action,
      username: (payload && payload.username) || (session ? session.username : ''),
      token: (payload && payload.token) || (session ? session.token : '')
    });

    // نستخدم text/plain لتجنب طلب CORS Preflight مع Google Apps Script
    const response = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error('تعذر الاتصال بالخدمة حالياً');
    }

    return await response.json();
  }

  window.AwqafAPI = {
    isDemoMode,
    getSavedSession,
    saveSession,
    clearSession,
    saveCache,
    loadCache,
    getInitialData: () => request('getInitialData', {}),
    register: (username, password, fullName) => request('register', { username, password, fullName }),
    login: (username, password) => request('login', { username, password }),
    uploadSchedules: (data) => request('uploadSchedules', data),
    addSchedule: (item) => request('addSchedule', { item }),
    updateSchedule: (item) => request('updateSchedule', { item }),
    deleteSchedule: (id) => request('deleteSchedule', { id }),
    saveVisit: (scheduleId, status, note, visitDate) => request('saveVisit', { scheduleId, status, note, visitDate }),
    deleteVisit: (scheduleId) => request('deleteVisit', { scheduleId })
  };
})();
