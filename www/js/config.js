/**
 * الإعدادات المركزية لمنصة إدارة برامج الثانويات الشرعية
 * وزارة الأوقاف — دائرة التعليم الشرعي
 *
 * عند نشر Google Apps Script كـ Web App، ضع الرابط هنا داخل API_URL.
 * طالما أن API_URL فارغ، تعمل المنصة تلقائياً في وضع المعاينة التجريبي لتجربة كل الميزات فوراً.
 */
window.AWQAF_CONFIG = {
  APP_TITLE: 'منصة برامج الثانويات الشرعية',
  MINISTRY_NAME: 'وزارة الأوقاف — دائرة التعليم الشرعي',
  VERSION: '1.0.0',

  // الصق رابط Google Apps Script Web App هنا بعد النشر (مثال: https://script.google.com/macros/s/.../exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbxFhrQQUw1HueXSqV_iikdLqPg2FSafaj191xMFq_6z0vYrzfpoQXqlfydP2gp71E0D/exec',

  // المحافظات السورية الـ 14 المعتمدة حصراً
  GOVERNORATES: [
    'دمشق',
    'ريف دمشق',
    'حلب',
    'حمص',
    'حماة',
    'اللاذقية',
    'طرطوس',
    'إدلب',
    'درعا',
    'السويداء',
    'القنيطرة',
    'دير الزور',
    'الحسكة',
    'الرقة'
  ],

  DAYS: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],

  PERIODS: [
    'الحصة الأولى',
    'الحصة الثانية',
    'الحصة الثالثة',
    'الحصة الرابعة',
    'الحصة الخامسة',
    'الحصة السادسة',
    'الحصة السابعة'
  ],

  VISIT_STATUSES: [
    { value: 'تمت', label: 'تمت الزيارة', badgeClass: 'badge-done', icon: 'fa-circle-check' },
    { value: 'مؤجلة', label: 'مؤجلة', badgeClass: 'badge-postponed', icon: 'fa-clock' },
    { value: 'غياب', label: 'غياب المدرس', badgeClass: 'badge-absent', icon: 'fa-user-xmark' }
  ],

  CACHE_KEY_DATA: 'awqaf_sharia_cache_v1',
  DEMO_DB_KEY: 'awqaf_sharia_demo_db_v1',
  COOKIE_USER: 'awqaf_user_session',
  COOKIE_DAYS: 3650 // حفظ الجلسة مدى الحياة (10 سنوات)
};
