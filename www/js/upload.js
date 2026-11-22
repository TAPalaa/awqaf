/**
 * منطق صفحة رفع برامج المدارس:
 * يدعم PDF متعدد الصفحات (صفحة بصفحة)، Excel، Word، الصور،
 * ودمج ملفين منفصلين (ملف مدرسين + ملف مواد) تلقائياً.
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
    CFG.GOVERNORATES.forEach(gov => els.govSelect.add(new Option(gov, gov)));
    loadKnownSchools();

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

    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => addFiles(e.target.files));

    els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('dragover'); });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragover'));
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });

    els.uploadForm.addEventListener('submit', handleUploadSubmit);
  }

  async function loadKnownSchools() {
    const cached = API.loadCache();
    if (cached && Array.isArray(cached.schools)) renderSchoolsDatalist(cached.schools);
    try {
      const res = await API.getInitialData();
      if (res.ok && Array.isArray(res.schools)) renderSchoolsDatalist(res.schools);
    } catch (e) {}
  }

  function renderSchoolsDatalist(schools) {
    knownSchools = schools;
    els.schoolsList.innerHTML = schools.map(s => `<option value="${escapeAttr(s.school)}"></option>`).join('');
  }

  function addFiles(fileList) {
    const allowedExt = ['pdf', 'xlsx', 'xls', 'docx', 'png', 'jpg', 'jpeg', 'webp'];
    Array.from(fileList || []).forEach(file => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!allowedExt.includes(ext)) {
        showError(`صيغة الملف "${file.name}" غير مدعومة.`);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        showError(`حجم الملف "${file.name}" يتجاوز 25 ميغابايت.`);
        return;
      }
      selectedFiles.push(file);
    });
    els.fileInput.value = '';
    renderFilesList();
  }

  function renderFilesList() {
    if (selectedFiles.length === 0) { els.filesList.innerHTML = ''; return; }
    els.filesList.innerHTML = selectedFiles.map((f, idx) => {
      const sizeKB = Math.max(1, Math.round(f.size / 1024));
      return `
        <div class="flex items-center justify-between gap-3 bg-brand-bg border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs">
          <div class="flex items-center gap-2.5 min-w-0">
            <i class="${getFileIcon(f.name)} text-base"></i>
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

  async function pdfToPageImages(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      setProgress(Math.round((p / pdf.numPages) * 20), `جاري تجهيز صفحة PDF (${p} من ${pdf.numPages})...`);
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      pages.push({
        name: `${file.name} - صفحة ${p}`,
        mimeType: 'image/jpeg',
        base64: base64
      });
    }
    return pages;
  }

  async function buildUploadQueue(files) {
    const queue = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name.split('.').pop() || '').toLowerCase();

      if (ext === 'pdf') {
        const pageImages = await pdfToPageImages(file);
        queue.push(...pageImages);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        wb.SheetNames.forEach(sheetName => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          if (csv.trim()) {
            queue.push({ name: `${file.name} (${sheetName})`, mimeType: 'text/plain', extractedText: csv });
          }
        });
      } else if (ext === 'docx') {
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        queue.push({ name: file.name, mimeType: 'text/plain', extractedText: result.value || '' });
      } else {
        const base64 = await fileToBase64(file);
        const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
        queue.push({ name: file.name, mimeType: file.type || mimeMap[ext] || 'image/jpeg', base64 });
      }
    }
    return queue;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        resolve(res.slice(res.indexOf(',') + 1));
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
    setProgress(5, 'جاري فحص وتجهيز الملفات...');

    try {
      const queue = await buildUploadQueue(selectedFiles);
      if (queue.length === 0) throw new Error('لم يتم العثور على صفحات صالحة للرفع.');

      let totalInserted = 0;
      let failedPages = 0;

      // دمج ملفين منفصلين من صفحة واحدة (مثل ملف مدرسين + ملف مواد)
      const shouldMergeTwo = (selectedFiles.length === 2 && queue.length === 2);

      if (shouldMergeTwo) {
        setProgress(60, 'جاري قراءة ودمج الملفين (المدرسين مع المواد)...');
        const res = await API.uploadSchedules({
          school, gov, gender, replaceOld,
          files: queue
        });
        if (res && res.ok) totalInserted += (res.insertedCount || 0);
      } else {
        for (let i = 0; i < queue.length; i++) {
          const pct = 20 + Math.round(((i + 1) / queue.length) * 78);
          setProgress(pct, `جاري قراءة وحفظ الصفحة ${i + 1} من ${queue.length}...`);

          const res = await API.uploadSchedules({
            school, gov, gender,
            replaceOld: (i === 0) ? replaceOld : false,
            files: [queue[i]]
          });

          if (res && res.ok) {
            totalInserted += (res.insertedCount || 0);
          } else {
            failedPages++;
          }
        }
      }

      if (totalInserted === 0) {
        throw new Error('لم نتمكن من استخراج حصص من الملفات المرفقة. تأكد من وضوح الجداول وحاول مجدداً.');
      }

      setProgress(100, 'تم الحفظ بنجاح!');

      setTimeout(() => {
        els.uploadCard.classList.add('hidden');
        els.successCard.classList.remove('hidden');
        const note = failedPages > 0 ? ` (تعذرت قراءة ${failedPages} صفحة)` : '';
        els.successSummary.textContent =
          `تم إدراج ${totalInserted} حصة بنجاح لـ (${school} — ${gov} / ${gender})${note}.`;
        els.viewSchoolBtn.href = `index.html?school=${encodeURIComponent(school)}`;
      }, 300);
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