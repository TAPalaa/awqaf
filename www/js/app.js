/**
 * منطق الصفحة الرئيسية:
 * الفرز الفوري، الحسابات الاختيارية، تأكيد الزيارات الشخصية،
 * التعديل والحذف المباشر، وتصدير ملف المهام PDF (طباعة أصلية بدون قصّ) ورسائل واتساب.
 */
(function () {
  const CFG = window.AWQAF_CONFIG;
  const API = window.AwqafAPI;

  const state = {
    schedules: [],
    filtered: [],
    visitsMap: {}, // scheduleId -> visitObj
    user: API.getSavedSession(),
    authMode: 'login',
    pendingVisitScheduleId: null
  };

  // عناصر الواجهة
  const els = {
    filterSearch: document.getElementById('filterSearch'),
    filterGov: document.getElementById('filterGov'),
    filterGender: document.getElementById('filterGender'),
    filterSchool: document.getElementById('filterSchool'),
    filterSubject: document.getElementById('filterSubject'),
    filterDay: document.getElementById('filterDay'),
    filterVisit: document.getElementById('filterVisit'),
    tableBody: document.getElementById('scheduleTableBody'),
    mobileCards: document.getElementById('mobileCardsWrap'),
    desktopTableWrap: document.getElementById('desktopTableWrap'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    statPeriods: document.getElementById('statPeriods'),
    statSchools: document.getElementById('statSchools'),
    statTeachers: document.getElementById('statTeachers'),
    statVisited: document.getElementById('statVisited'),
    authNavLabel: document.getElementById('authNavLabel'),
    logoutBtn: document.getElementById('logoutBtn'),
    statusBanner: document.getElementById('statusBanner'),
    statusBannerText: document.getElementById('statusBannerText'),
    connectionBadge: document.getElementById('connectionBadge')
  };

  // --------------------------------------------------------------------------
  // التهيئة الأولية
  // --------------------------------------------------------------------------
  function init() {
    populateStaticSelects();
    bindFilterEvents();
    updateAuthUI();

    // قراءة فلتر مدرسة من رابط الصفحة (عند العودة من صفحة الرفع)
    const urlParams = new URLSearchParams(window.location.search);
    const schoolParam = urlParams.get('school');

    refreshData(false).then(() => {
      if (schoolParam) {
        els.filterSchool.value = schoolParam;
        applyFilters();
      }
    });

    window.addEventListener('online', () => {
      updateConnectionBadge(true);
      refreshData(false);
    });
    window.addEventListener('offline', () => updateConnectionBadge(false));
    updateConnectionBadge(navigator.onLine);
  }

  function populateStaticSelects() {
    CFG.GOVERNORATES.forEach(gov => {
      els.filterGov.add(new Option(gov, gov));
      document.getElementById('editGov').add(new Option(gov, gov));
    });
    CFG.DAYS.forEach(day => {
      els.filterDay.add(new Option(day, day));
      document.getElementById('editDay').add(new Option(day, day));
    });

    // تعبئة قائمة المواد الثابتة في الفلتر + قائمة اقتراحات نافذة التعديل اليدوي
    if (Array.isArray(CFG.SUBJECTS)) {
      els.filterSubject.innerHTML = '<option value="">كل المواد</option>';
      const dl = document.createElement('datalist');
      dl.id = 'standardSubjectsList';
      CFG.SUBJECTS.forEach(sub => {
        els.filterSubject.add(new Option(sub, sub));
        const opt = document.createElement('option');
        opt.value = sub;
        dl.appendChild(opt);
      });
      document.body.appendChild(dl);
      const editSub = document.getElementById('editSubject');
      if (editSub) editSub.setAttribute('list', 'standardSubjectsList');
    }
  }

  function bindFilterEvents() {
    ['input', 'change'].forEach(evt => {
      els.filterSearch.addEventListener(evt, applyFilters);
    });
    [els.filterGov, els.filterGender].forEach(el => {
      el.addEventListener('change', () => {
        populateDynamicFilters();
        applyFilters();
      });
    });
    [els.filterSchool, els.filterSubject, els.filterDay, els.filterVisit].forEach(el => {
      el.addEventListener('change', applyFilters);
    });
  }

  // --------------------------------------------------------------------------
  // جلب البيانات + Cache عند انقطاع الإنترنت
  // --------------------------------------------------------------------------
  window.refreshData = async function (showNotice) {
    els.loadingState.classList.remove('hidden');
    els.emptyState.classList.add('hidden');
    els.desktopTableWrap.classList.add('hidden');
    els.mobileCards.classList.add('hidden');

    try {
      const res = await API.getInitialData();
      if (!res.ok) throw new Error(res.error || 'تعذر تحميل البيانات');

      state.schedules = res.schedules || [];
      setVisitsFromArray(res.visits || []);
      API.saveCache(res);

      if (res.demo) {
        showBanner('وضع المعاينة التجريبي مفعّل حالياً (لم يُربط رابط الخادم بعد في config.js). جميع الميزات تعمل محلياً للتجربة.');
      } else {
        hideBanner();
      }

      populateDynamicFilters();
      applyFilters();
      if (showNotice) showToast('تم تحديث البرامج بنجاح');
    } catch (err) {
      const cached = API.loadCache();
      if (cached && Array.isArray(cached.schedules)) {
        state.schedules = cached.schedules;
        setVisitsFromArray(cached.visits || []);
        const dt = cached.savedAt ? new Date(cached.savedAt).toLocaleString('ar-SY') : '';
        showBanner('أنت تتصفح آخر نسخة محفوظة على جهازك (بدون اتصال بالإنترنت) — آخر تحديث: ' + dt);
        populateDynamicFilters();
        applyFilters();
      } else {
        showToast(err.message || 'تعذر تحميل البرامج حالياً', true);
        els.emptyState.classList.remove('hidden');
      }
    } finally {
      els.loadingState.classList.add('hidden');
    }
  };

  function setVisitsFromArray(visitsArr) {
    state.visitsMap = {};
    (visitsArr || []).forEach(v => {
      state.visitsMap[v.scheduleId] = v;
    });
  }

  function populateDynamicFilters() {
    const selectedGov = els.filterGov.value;
    const selectedGender = els.filterGender.value;
    const prevSchool = els.filterSchool.value;

    const subset = state.schedules.filter(s =>
      (!selectedGov || s.gov === selectedGov) &&
      (!selectedGender || s.gender === selectedGender)
    );

    const schools = [...new Set(subset.map(s => s.school).filter(Boolean))].sort();

    els.filterSchool.innerHTML = '<option value="">كل الثانويات</option>';
    schools.forEach(sc => els.filterSchool.add(new Option(sc, sc)));
    if (schools.includes(prevSchool)) els.filterSchool.value = prevSchool;
  }

  // --------------------------------------------------------------------------
  // الفرز والعرض
  // --------------------------------------------------------------------------
  function applyFilters() {
    const q = (els.filterSearch.value || '').trim().toLowerCase();
    const gov = els.filterGov.value;
    const gender = els.filterGender.value;
    const school = els.filterSchool.value;
    const subject = els.filterSubject.value;
    const day = els.filterDay.value;
    const visitFilter = els.filterVisit.value;

    state.filtered = state.schedules.filter(item => {
      if (gov && item.gov !== gov) return false;
      if (gender && item.gender !== gender) return false;
      if (school && item.school !== school) return false;
      if (subject && item.subject !== subject) return false;
      if (day && item.day !== day) return false;

      const visit = state.visitsMap[item.id];
      if (visitFilter === 'unvisited' && visit) return false;
      if (visitFilter && visitFilter !== 'unvisited' && (!visit || visit.status !== visitFilter)) return false;

      if (q) {
        const hay = `${item.school} ${item.gov} ${item.subject} ${item.teacher} ${item.grade} ${item.day} ${item.period}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    renderStats();
    renderSchedules();
  }

  window.resetFilters = function () {
    els.filterSearch.value = '';
    els.filterGov.value = '';
    els.filterGender.value = '';
    els.filterSchool.value = '';
    els.filterSubject.value = '';
    els.filterDay.value = '';
    els.filterVisit.value = '';
    populateDynamicFilters();
    applyFilters();
  };

  function renderStats() {
    els.statPeriods.textContent = state.filtered.length;
    els.statSchools.textContent = new Set(state.filtered.map(x => x.school)).size;
    els.statTeachers.textContent = new Set(state.filtered.map(x => x.teacher)).size;
    const doneCount = state.filtered.filter(x => state.visitsMap[x.id] && state.visitsMap[x.id].status === 'تمت').length;
    els.statVisited.textContent = doneCount;
  }

  function renderSchedules() {
    if (state.filtered.length === 0) {
      els.emptyState.classList.remove('hidden');
      els.desktopTableWrap.classList.add('hidden');
      els.mobileCards.classList.add('hidden');
      return;
    }

    els.emptyState.classList.add('hidden');
    els.desktopTableWrap.classList.remove('hidden');
    els.mobileCards.classList.remove('hidden');

    // جدول الحاسوب
    els.tableBody.innerHTML = state.filtered.map(item => {
      const visit = state.visitsMap[item.id];
      const badge = buildVisitBadge(visit);
      const genderBadge = item.gender === 'إناث'
        ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200">إناث</span>'
        : '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">ذكور</span>';

      return `
        <tr class="hover:bg-emerald-50/40 transition">
          <td class="py-3.5 px-4">
            <div class="font-bold text-brand-dark text-sm">${escapeHtml(item.school)}</div>
            <div class="text-xs text-gray-500 mt-0.5"><i class="fa-solid fa-location-dot text-brand-gold ml-1"></i>${escapeHtml(item.gov)}</div>
          </td>
          <td class="py-3.5 px-3">${genderBadge}</td>
          <td class="py-3.5 px-3">
            <div class="font-semibold text-gray-800">${escapeHtml(item.day)}</div>
            <div class="text-xs text-gray-500">${escapeHtml(item.period)}</div>
          </td>
          <td class="py-3.5 px-3 font-bold text-brand-emerald">${escapeHtml(item.subject)}</td>
          <td class="py-3.5 px-3 text-gray-800">${escapeHtml(item.teacher)}</td>
          <td class="py-3.5 px-3 text-xs text-gray-600">${escapeHtml(item.grade)}</td>
          <td class="py-3.5 px-3">${badge}</td>
          <td class="py-3.5 px-4">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="openVisitModal('${item.id}')" title="تأكيد الزيارة" class="inline-flex items-center gap-1 text-xs font-semibold bg-brand-dark hover:bg-brand-emerald text-white px-2.5 py-1.5 rounded-lg transition">
                <i class="fa-solid fa-check-double text-brand-gold"></i>
                <span>${visit ? 'تحديث' : 'تأكيد'}</span>
              </button>
              <button onclick="openEditModal('${item.id}')" title="تعديل الحصة" class="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center transition">
                <i class="fa-solid fa-pen text-xs"></i>
              </button>
              <button onclick="confirmDeleteSchedule('${item.id}')" title="حذف الحصة" class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 flex items-center justify-center transition">
                <i class="fa-solid fa-trash text-xs"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // بطاقات الجوال
    els.mobileCards.innerHTML = state.filtered.map(item => {
      const visit = state.visitsMap[item.id];
      const badge = buildVisitBadge(visit);
      return `
        <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-bold text-brand-dark text-sm">${escapeHtml(item.school)}</h3>
              <p class="text-xs text-gray-500">${escapeHtml(item.gov)} • ${escapeHtml(item.gender)}</p>
            </div>
            ${badge}
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs bg-brand-bg p-2.5 rounded-xl">
            <div><span class="text-gray-500">المادة:</span> <strong class="text-brand-emerald">${escapeHtml(item.subject)}</strong></div>
            <div><span class="text-gray-500">المدرس:</span> <strong>${escapeHtml(item.teacher)}</strong></div>
            <div><span class="text-gray-500">الموعد:</span> <strong>${escapeHtml(item.day)} — ${escapeHtml(item.period)}</strong></div>
            <div><span class="text-gray-500">الصف:</span> <strong>${escapeHtml(item.grade)}</strong></div>
          </div>
          <div class="flex items-center justify-between gap-2 pt-1">
            <button onclick="openVisitModal('${item.id}')" class="flex-1 text-xs font-bold bg-brand-dark text-white py-2 rounded-xl">
              <i class="fa-solid fa-clipboard-check text-brand-gold ml-1"></i> ${visit ? 'تحديث الزيارة' : 'تأكيد الزيارة'}
            </button>
            <button onclick="openEditModal('${item.id}')" class="px-3 py-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-xl">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="confirmDeleteSchedule('${item.id}')" class="px-3 py-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-xl">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildVisitBadge(visit) {
    if (!visit) {
      return '<span class="badge-pending inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"><i class="fa-regular fa-circle"></i> لم تُزر</span>';
    }
    const meta = CFG.VISIT_STATUSES.find(s => s.value === visit.status) || CFG.VISIT_STATUSES[0];
    const dateSub = visit.visitDate ? `<span class="block text-[10px] opacity-80 mt-0.5">${escapeHtml(visit.visitDate)}</span>` : '';
    return `
      <div>
        <span class="${meta.badgeClass} inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold">
          <i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.label)}
        </span>
        ${dateSub}
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // نظام الدخول وإنشاء الحساب (Cookies مدى الحياة)
  // --------------------------------------------------------------------------
  function updateAuthUI() {
    if (state.user) {
      els.authNavLabel.textContent = state.user.fullName || state.user.username;
      els.logoutBtn.classList.remove('hidden');
    } else {
      els.authNavLabel.textContent = 'تسجيل الدخول';
      els.logoutBtn.classList.add('hidden');
    }
  }

  window.openAuthModal = function () {
    document.getElementById('authError').classList.add('hidden');
    document.getElementById('authModal').classList.remove('hidden');
  };

  window.closeAuthModal = function () {
    document.getElementById('authModal').classList.add('hidden');
    state.pendingVisitScheduleId = null;
  };

  window.switchAuthTab = function (mode) {
    state.authMode = mode;
    const isReg = mode === 'register';
    document.getElementById('fullNameWrap').classList.toggle('hidden', !isReg);
    document.getElementById('authSubmitBtn').textContent = isReg ? 'إنشاء الحساب والدخول' : 'دخول إلى الحساب';

    document.getElementById('tabLogin').className = isReg
      ? 'py-2 rounded-lg text-gray-500 transition'
      : 'py-2 rounded-lg bg-white text-brand-dark shadow-sm transition';
    document.getElementById('tabRegister').className = isReg
      ? 'py-2 rounded-lg bg-white text-brand-dark shadow-sm transition'
      : 'py-2 rounded-lg text-gray-500 transition';
    document.getElementById('authError').classList.add('hidden');
  };

  window.submitAuthForm = async function (e) {
    e.preventDefault();
    const errEl = document.getElementById('authError');
    const btn = document.getElementById('authSubmitBtn');
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const fullName = document.getElementById('authFullName').value.trim();

    errEl.classList.add('hidden');
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'جاري التحقق...';

    try {
      const res = state.authMode === 'register'
        ? await API.register(username, password, fullName)
        : await API.login(username, password);

      if (!res.ok) {
        errEl.textContent = res.error || 'تعذر تسجيل الدخول';
        errEl.classList.remove('hidden');
        return;
      }

      state.user = res.user;
      API.saveSession(res.user);
      if (Array.isArray(res.visits)) {
        setVisitsFromArray(res.visits);
      }
      updateAuthUI();
      applyFilters();

      const pendingId = state.pendingVisitScheduleId;
      document.getElementById('authModal').classList.add('hidden');
      document.getElementById('authForm').reset();
      showToast('مرحباً بك، ' + (res.user.fullName || res.user.username));

      if (pendingId) {
        state.pendingVisitScheduleId = null;
        openVisitModal(pendingId);
      } else {
        refreshData(false);
      }
    } catch (err) {
      errEl.textContent = err.message || 'تعذر الاتصال بالخدمة حالياً';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };

  window.handleLogout = function () {
    if (!confirm('هل تريد تسجيل الخروج من حسابك على هذا الجهاز؟')) return;
    API.clearSession();
    state.user = null;
    state.visitsMap = {};
    updateAuthUI();
    applyFilters();
    showToast('تم تسجيل الخروج بنجاح');
  };

  // --------------------------------------------------------------------------
  // تأكيد الزيارة الشخصية
  // --------------------------------------------------------------------------
  window.openVisitModal = function (scheduleId) {
    if (!state.user) {
      state.pendingVisitScheduleId = scheduleId;
      openAuthModal();
      showToast('يرجى تسجيل الدخول أولاً لحفظ الزيارة على حسابك');
      return;
    }

    const item = state.schedules.find(x => x.id === scheduleId);
    if (!item) return;

    const existing = state.visitsMap[scheduleId];
    document.getElementById('visitScheduleId').value = scheduleId;
    document.getElementById('visitSummaryBox').innerHTML = `
      <div class="font-bold text-brand-dark">${escapeHtml(item.school)} (${escapeHtml(item.gov)})</div>
      <div class="text-gray-600">${escapeHtml(item.subject)} — ${escapeHtml(item.teacher)}</div>
      <div class="text-gray-500">${escapeHtml(item.day)} • ${escapeHtml(item.period)} • ${escapeHtml(item.grade)}</div>
    `;

    const statusVal = existing ? existing.status : 'تمت';
    const radios = document.querySelectorAll('input[name="visitStatus"]');
    radios.forEach(r => { r.checked = (r.value === statusVal); });

    document.getElementById('visitDate').value = (existing && existing.visitDate)
      ? existing.visitDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    document.getElementById('visitNote').value = (existing && existing.note) ? existing.note : '';
    document.getElementById('clearVisitBtn').classList.toggle('hidden', !existing);
    document.getElementById('visitModal').classList.remove('hidden');
  };

  window.closeVisitModal = function () {
    document.getElementById('visitModal').classList.add('hidden');
  };

  window.submitVisitForm = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('saveVisitBtn');
    const scheduleId = document.getElementById('visitScheduleId').value;
    const status = document.querySelector('input[name="visitStatus"]:checked').value;
    const visitDate = document.getElementById('visitDate').value;
    const note = document.getElementById('visitNote').value.trim();

    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
    try {
      const res = await API.saveVisit(scheduleId, status, note, visitDate);
      if (!res.ok) {
        if (res.requireAuth) {
          closeVisitModal();
          openAuthModal();
          return;
        }
        throw new Error(res.error || 'تعذر حفظ الزيارة');
      }
      state.visitsMap[scheduleId] = res.visit;
      closeVisitModal();
      applyFilters();
      showToast('تم حفظ حالة الزيارة بنجاح');
    } catch (err) {
      showToast(err.message || 'تعذر حفظ الزيارة', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ الزيارة';
    }
  };

  window.removeCurrentVisit = async function () {
    const scheduleId = document.getElementById('visitScheduleId').value;
    try {
      const res = await API.deleteVisit(scheduleId);
      if (!res.ok) throw new Error(res.error);
      delete state.visitsMap[scheduleId];
      closeVisitModal();
      applyFilters();
      showToast('تم إلغاء تأكيد الزيارة');
    } catch (err) {
      showToast(err.message || 'تعذر إلغاء الزيارة', true);
    }
  };

  // --------------------------------------------------------------------------
  // إضافة / تعديل / حذف حصة مباشرة
  // --------------------------------------------------------------------------
  window.openEditModal = function (scheduleId) {
    const item = scheduleId ? state.schedules.find(x => x.id === scheduleId) : null;
    document.getElementById('editModalTitle').textContent = item ? 'تعديل بيانات الحصة' : 'إضافة حصة جديدة';
    document.getElementById('editId').value = item ? item.id : '';
    document.getElementById('editSchool').value = item ? item.school : (els.filterSchool.value || '');
    document.getElementById('editGov').value = item ? item.gov : (els.filterGov.value || CFG.GOVERNORATES[0]);
    document.getElementById('editGender').value = item ? item.gender : (els.filterGender.value || 'ذكور');
    document.getElementById('editDay').value = item ? item.day : (els.filterDay.value || CFG.DAYS[0]);
    document.getElementById('editPeriod').value = item ? item.period : 'الحصة الأولى';
    document.getElementById('editSubject').value = item ? item.subject : '';
    document.getElementById('editTeacher').value = item ? item.teacher : '';
    document.getElementById('editGrade').value = item ? item.grade : '';
    document.getElementById('editModal').classList.remove('hidden');
  };

  window.closeEditModal = function () {
    document.getElementById('editModal').classList.add('hidden');
  };

  window.submitEditForm = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('saveEditBtn');
    const id = document.getElementById('editId').value;
    const item = {
      id: id,
      school: document.getElementById('editSchool').value.trim(),
      gov: document.getElementById('editGov').value,
      gender: document.getElementById('editGender').value,
      day: document.getElementById('editDay').value,
      period: document.getElementById('editPeriod').value.trim(),
      subject: document.getElementById('editSubject').value.trim(),
      teacher: document.getElementById('editTeacher').value.trim(),
      grade: document.getElementById('editGrade').value.trim()
    };

    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
    try {
      const res = id ? await API.updateSchedule(item) : await API.addSchedule(item);
      if (!res.ok) throw new Error(res.error || 'تعذر الحفظ');

      if (id) {
        const idx = state.schedules.findIndex(x => x.id === id);
        if (idx >= 0) state.schedules[idx] = res.item;
      } else {
        state.schedules.push(res.item);
      }

      closeEditModal();
      populateDynamicFilters();
      applyFilters();
      showToast(id ? 'تم تحديث الحصة بنجاح' : 'تمت إضافة الحصة بنجاح');
    } catch (err) {
      showToast(err.message || 'تعذر حفظ التغييرات', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ التغييرات';
    }
  };

  window.confirmDeleteSchedule = async function (scheduleId) {
    const item = state.schedules.find(x => x.id === scheduleId);
    if (!item) return;
    if (!confirm(`هل أنت متأكد من حذف حصة (${item.subject} - ${item.teacher}) من مدرسة ${item.school}؟`)) return;

    try {
      const res = await API.deleteSchedule(scheduleId);
      if (!res.ok) throw new Error(res.error || 'تعذر حذف الحصة');
      state.schedules = state.schedules.filter(x => x.id !== scheduleId);
      populateDynamicFilters();
      applyFilters();
      showToast('تم حذف الحصة بنجاح');
    } catch (err) {
      showToast(err.message || 'تعذر حذف الحصة', true);
    }
  };

  // --------------------------------------------------------------------------
  // تصدير ملف المهام (PDF Checklist طباعة أصلية) + نسخ للواتساب
  // --------------------------------------------------------------------------
  function groupFilteredBySchool() {
    const groups = {};
    state.filtered.forEach(item => {
      const key = `${item.school} (${item.gov} - ${item.gender})`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }

  window.exportTasksPDF = function () {
    if (state.filtered.length === 0) {
      showToast('لا توجد حصص مفرزة لتصديرها', true);
      return;
    }

    const groups = groupFilteredBySchool();
    const todayStr = new Date().toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' });
    const supervisorName = state.user ? (state.user.fullName || state.user.username) : 'الموجه الاختصاصي';

    let blocksHtml = '';
    Object.keys(groups).forEach(schoolTitle => {
      const rowsHtml = groups[schoolTitle].map(item => {
        const v = state.visitsMap[item.id];
        const statusMark = v ? v.status : '☐';
        return `
          <tr>
            <td style="border:1px solid #d1d5db; padding:7px; text-align:center; font-weight:bold;">${escapeHtml(statusMark)}</td>
            <td style="border:1px solid #d1d5db; padding:7px;">${escapeHtml(item.day)} — ${escapeHtml(item.period)}</td>
            <td style="border:1px solid #d1d5db; padding:7px; font-weight:bold; color:#1b3b2b;">${escapeHtml(item.subject)}</td>
            <td style="border:1px solid #d1d5db; padding:7px;">${escapeHtml(item.teacher)}</td>
            <td style="border:1px solid #d1d5db; padding:7px;">${escapeHtml(item.grade)}</td>
            <td style="border:1px solid #d1d5db; padding:7px; min-width:100px;">${v && v.note ? escapeHtml(v.note) : ''}</td>
          </tr>
        `;
      }).join('');

      blocksHtml += `
        <div style="page-break-inside:avoid; margin-bottom:18px;">
          <div style="background:#1b3b2b; color:#fff; padding:8px 12px; border-radius:6px 6px 0 0; font-weight:bold; font-size:13px; border-bottom:2px solid #d4af37; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
            ${escapeHtml(schoolTitle)}
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead>
              <tr style="background:#f3f4f6; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
                <th style="border:1px solid #d1d5db; padding:6px; width:48px;">الإنجاز</th>
                <th style="border:1px solid #d1d5db; padding:6px;">اليوم والحصة</th>
                <th style="border:1px solid #d1d5db; padding:6px;">المادة</th>
                <th style="border:1px solid #d1d5db; padding:6px;">المدرس</th>
                <th style="border:1px solid #d1d5db; padding:6px;">الصف والشعبة</th>
                <th style="border:1px solid #d1d5db; padding:6px;">ملاحظات</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    });

    const printWin = window.open('', '_blank', 'width=850,height=900');
    if (!printWin) {
      showToast('يرجى السماح بالنوافذ المنبثقة لطباعة ملف المهام', true);
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>مهام الزيارات الميدانية — وزارة الأوقاف</title>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'IBM Plex Sans Arabic', sans-serif; padding: 20px; direction: rtl; color: #111827; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #d4af37; padding-bottom:10px; margin-bottom:16px;">
          <div>
            <div style="font-size:17px; font-weight:bold; color:#1b3b2b;">وزارة الأوقاف — دائرة التعليم الشرعي</div>
            <div style="font-size:13px; color:#2d5a40;">جدول مهام الزيارات الميدانية للثانويات الشرعية</div>
          </div>
          <div style="text-align:left; font-size:12px;">
            <div><strong>الموجه:</strong> ${escapeHtml(supervisorName)}</div>
            <div><strong>التاريخ:</strong> ${escapeHtml(todayStr)}</div>
            <div><strong>عدد الحصص:</strong> ${state.filtered.length}</div>
          </div>
        </div>
        ${blocksHtml}
        <div style="margin-top:24px; display:flex; justify-content:space-between; font-size:12px; border-top:1px dashed #999; padding-top:10px;">
          <div>توقيع الموجه الاختصاصي: ........................</div>
          <div>اعتماد دائرة التعليم الشرعي: ........................</div>
        </div>
        <script>
          window.onload = function () {
            setTimeout(function () { window.print(); }, 500);
          };
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  window.copyTasksWhatsApp = async function () {
    if (state.filtered.length === 0) {
      showToast('لا توجد حصص مفرزة لنسخها', true);
      return;
    }

    const groups = groupFilteredBySchool();
    const lines = [
      '🕌 *وزارة الأوقاف — دائرة التعليم الشرعي*',
      '📋 *خطة مهام الزيارات الميدانية*',
      '────────────────────'
    ];

    Object.keys(groups).forEach(schoolTitle => {
      lines.push(`\n🏫 *${schoolTitle}*`);
      groups[schoolTitle].forEach(item => {
        const v = state.visitsMap[item.id];
        const icon = v ? (v.status === 'تمت' ? '✅' : v.status === 'مؤجلة' ? '⏳' : '❌') : '▫️';
        lines.push(`${icon} ${item.day} (${item.period}) | *${item.subject}* — ${item.teacher} [${item.grade}]`);
      });
    });

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ خطة المهام بنجاح، يمكنك لصقها في واتساب');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('تم نسخ خطة المهام بنجاح');
    }
  };

  // --------------------------------------------------------------------------
  // أدوات مساعدة للواجهة
  // --------------------------------------------------------------------------
  function updateConnectionBadge(isOnline) {
    if (!els.connectionBadge) return;
    els.connectionBadge.innerHTML = isOnline
      ? '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>متصل</span>'
      : '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>وضع عدم الاتصال</span>';
  }

  function showBanner(msg) {
    els.statusBannerText.textContent = msg;
    els.statusBanner.classList.remove('hidden');
  }

  function hideBanner() {
    els.statusBanner.classList.add('hidden');
  }

  let toastTimer = null;
  function showToast(msg, isError) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastText');
    text.textContent = msg;
    icon.className = isError
      ? 'fa-solid fa-circle-exclamation text-red-400'
      : 'fa-solid fa-circle-check text-brand-gold';
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3400);
  }

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();