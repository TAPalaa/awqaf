/**
 * منطق صفحة رفع برامج المدارس (تجربة صامتة بالكامل):
 * قراءة ملفات Excel عبر SheetJS و Word عبر Mammoth.js،
 * وتجهيز PDF والصور بصيغة Base64 لإرسالها بصمت إلى الخلفية.
 */
(function () {
  const CFG = window.AWQAF_CONFIG;
  const API = window.AwqafAPI;

  let selectedFiles = [];
  let knownSchools = [];

  const els = {
    schoolInput: document.getElementById('schoolInput'),
    schoolsList: document.getElementById('existingSchoolsList'),
    govSelect: document.getElementById('govSelect'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    filesList: document.getElementById('filesList'),
    replaceOldCheck: document.getElementById('replaceOldCheck'),
    uploadForm: document.getElementById('uploadForm'),
    uploadError: document.getElementById('uploadError'),
    progressWrap: document.getElementById('progressWrap'),
    progressLabel: document.getElementById('progressLabel'),
    progressPercent: document.getElementById('progressPercent'),
    progressBar: document.getElementById('progressBar'),
    submitBtn: document.getElementById('submitUploadBtn'),
    uploadCard: document.getElementById('uploadCard'),
    successCard: document.getElementById('successCard'),
    successSummary: document.getElementById('successSummary'),
    viewSchoolBtn: document.getElementById('viewSchoolBtn')
  };

  function init() {
    // تعبئة المحافظات الـ 14 حصراً
    CFG.GOVERNORATES.forEach(gov => {
      els.govSelect.add(new Option(gov, gov));
    });

    // جلب قائمة المدارس السابقة للاقتراح الذكي
    loadKnownSchools();

    // تعبئة تلقائية للمحافظة والنوع عند اختيار مدرسة مسجلة سابقاً
    els.schoolInput.addEventListener('change', () => {
      const val = els.schoolInput.value.trim();
      const match = knownSchools.find(s => s.school === val);
      if (match) {
        if (match.gov) els.govSelect.value = match.gov;
        if (match.gender) {
          const r = document.querySelector(`input[name="schoolGender"][value="${match.gender}"]`);
          if (r) r.checked = true;
        }
      }
    });

    // أحداث السحب والإفلات
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => addFiles(e.target.files));

    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropZone.classList.add('dragover');
    });
    els.dropZone.addEventListener('dragleave', () => {
      els.dropZone.classList.remove('dragover');
    });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });

    els.uploadForm.addEventListener('submit', handleUploadSubmit);
  }

  async function loadKnownSchools() {
    const cached = API.loadCache();
    if (cached && Array.isArray(cached.schools)) {
      renderSchoolsDatalist(cached.schools);
    }
    try {
      const res = await API.getInitialData();
      if (res.ok && Array.isArray(res.schools)) {
        renderSchoolsDatalist(res.schools);
      }
    } catch (e) {}
  }

  function renderSchoolsDatalist(schools) {
    knownSchools = schools;
    els.schoolsList.innerHTML = schools
      .map(s => `<option value="${escapeAttr(s.school)}"></option>`)
      .join('');
  }

  function addFiles(fileList) {
    const allowedExt = ['pdf', 'xlsx', 'xls', 'docx', 'png', 'jpg', 'jpeg', 'webp'];
    Array.from(fileList || []).forEach(file => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!allowedExt.includes(ext)) {
        showError(`صيغة الملف "${file.name}" غير مدعومة. الصيغ المدعومة: PDF, Excel, Word, صور.`);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        showError(`حجم الملف "${file.name}" يتجاوز الحد المسموح (15 ميغابايت).`);
        return;
      }
      selectedFiles.push(file);
    });
    els.fileInput.value = '';
    renderFilesList();
  }

  function renderFilesList() {
    if (selectedFiles.length === 0) {
      els.filesList.innerHTML = '';
      return;
    }
    els.filesList.innerHTML = selectedFiles.map((f, idx) => {
      const sizeKB = Math.max(1, Math.round(f.size / 1024));
      const icon = getFileIcon(f.name);
      return `
        <div class="flex items-center justify-between gap-3 bg-brand-bg border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs">
          <div class="flex items-center gap-2.5 min-w-0">
            <i class="${icon} text-base"></i>
            <span class="font-semibold text-gray-800 truncate">${escapeHtml(f.name)}</span>
            <span class="text-gray-400 shrink-0">(${sizeKB} KB)</span>
          </div>
          <button type="button" onclick="removeSelectedFile(${idx})" class="text-red-500 hover:text-red-700 px-1.5">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  window.removeSelectedFile = function (idx) {
    selectedFiles.splice(idx, 1);
    renderFilesList();
  };

  function getFileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'fa-solid fa-file-pdf text-red-600';
    if (ext === 'xlsx' || ext === 'xls') return 'fa-solid fa-file-excel text-emerald-700';
    if (ext === 'docx') return 'fa-solid fa-file-word text-blue-700';
    return 'fa-solid fa-file-image text-amber-600';
  }

  // تجهيز كل ملف بصمت حسب نوعه
  async function prepareFilePayload(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    // ملفات Excel -> نص جدولي منظم عبر SheetJS
    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetsText = wb.SheetNames.map(sheetName => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        return `--- ورقة: ${sheetName} ---\n${csv}`;
      }).join('\n\n');
      return { name: file.name, mimeType: 'text/plain', extractedText: sheetsText };
    }

    // ملفات Word (.docx) -> نص منظم عبر Mammoth.js
    if (ext === 'docx') {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      return { name: file.name, mimeType: 'text/plain', extractedText: result.value || '' };
    }

    // ملفات PDF والصور -> Base64 لقراءة مرئية دقيقة في الخلفية
    const base64 = await fileToBase64(file);
    const mimeMap = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp'
    };
    return {
      name: file.name,
      mimeType: file.type || mimeMap[ext] || 'application/octet-stream',
      base64: base64
    };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const commaIdx = res.indexOf(',');
        resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
      };
      reader.onerror = () => reject(new Error('تعذر قراءة الملف: ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    hideError();

    const school = els.schoolInput.value.trim();
    const gov = els.govSelect.value;
    const gender = document.querySelector('input[name="schoolGender"]:checked').value;
    const replaceOld = els.replaceOldCheck.checked;

    if (!school) return showError('يرجى إدخال اسم الثانوية الشرعية.');
    if (!gov) return showError('يرجى اختيار المحافظة من القائمة.');
    if (selectedFiles.length === 0) return showError('يرجى إرفاق ملف واحد على الأقل لبرنامج الحصص.');

    els.submitBtn.disabled = true;
    setProgress(20, 'جاري تجهيز الملفات المرفقة...');

    try {
      const preparedFiles = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        preparedFiles.push(await prepareFilePayload(selectedFiles[i]));
      }

      setProgress(55, 'جاري قراءة وتنظيم جدول الحصص...');

      const res = await API.uploadSchedules({
        school,
        gov,
        gender,
        replaceOld,
        files: preparedFiles
      });

      if (!res.ok) {
        throw new Error(res.error || 'تعذر حفظ البرنامج حالياً، يرجى المحاولة مجدداً.');
      }

      setProgress(100, 'تم الحفظ بنجاح!');

      setTimeout(() => {
        els.uploadCard.classList.add('hidden');
        els.successCard.classList.remove('hidden');
        els.successSummary.textContent =
          `تم إدراج ${res.insertedCount} حصة بنجاح لـ (${school} — ${gov} / ${gender}).`;
        els.viewSchoolBtn.href = `index.html?school=${encodeURIComponent(school)}`;
      }, 350);
    } catch (err) {
      els.progressWrap.classList.add('hidden');
      showError(err.message || 'حدث خطأ أثناء رفع الملفات، يرجى التحقق من الاتصال والمحاولة مجدداً.');
    } finally {
      els.submitBtn.disabled = false;
    }
  }

  window.resetUploadPage = function () {
    selectedFiles = [];
    renderFilesList();
    els.uploadForm.reset();
    els.replaceOldCheck.checked = true;
    els.progressWrap.classList.add('hidden');
    els.successCard.classList.add('hidden');
    els.uploadCard.classList.remove('hidden');
  };

  function setProgress(pct, label) {
    els.progressWrap.classList.remove('hidden');
    els.progressBar.style.width = pct + '%';
    els.progressPercent.textContent = pct + '%';
    els.progressLabel.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin ml-1.5 text-brand-emerald"></i>${label}`;
  }

  function showError(msg) {
    els.uploadError.textContent = msg;
    els.uploadError.classList.remove('hidden');
  }

  function hideError() {
    els.uploadError.classList.add('hidden');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
