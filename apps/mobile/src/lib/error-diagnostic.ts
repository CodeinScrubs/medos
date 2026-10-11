/** Default diagnostics are a projection, never a scrubbed copy of arbitrary text. */
export const DIAGNOSTIC_FRAME_LIMIT = 12;
const STACK_LIMIT = 64 * 1024;

// Deliberately reviewed operational/validation notices. Exact matching preserves
// useful instructions without trusting a native error or an appended private value.
const notices = {
  'place.choice': 'مکان تغییر کرده است؛ فهرست را دوباره بخوانید.',
  'place.missing': 'مکان در دسترس نیست؛ ممکن است حذف شده باشد.',
  'place.changed': 'مکان تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.',
  'place.restore': 'مکان حذف‌شده تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.',
  'place.selected': 'مکان انتخاب‌شده تغییر کرده است.',
  'place.doctor': 'پزشک یا مکان اصلی تغییر کرده است؛ دوباره انتخاب کنید.',
  'place.owner': 'انتخاب قبلی در دسترس نیست؛ دوباره انتخاب کنید.',
  'place.input': 'اطلاعات ویرایش معتبر نیست؛ مکان یا داخلی تغییر نکرد.',
  'place.phone': 'شمارهٔ تلفن ثبت نشده است.',
  'place.dialer': 'برنامهٔ تماس باز نشد؛ شماره را کپی کنید.',
  'place.location': 'آدرس یا موقعیت ثبت نشده است.',
  'place.map': 'برنامهٔ نقشه باز نشد؛ آدرس و برنامهٔ نقشه را بررسی کنید.',
  'extension.missing': 'داخلی در دسترس نیست؛ ممکن است حذف شده باشد.',
  'extension.choice': 'داخلی یا مکان اصلی تغییر کرده است؛ فهرست را دوباره بخوانید.',
  'extension.changed': 'داخلی تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.',
  'extension.restore': 'داخلی حذف‌شده تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.',
  'extension.parent': 'مکان اصلی در دسترس نیست؛ داخلی تغییر نکرد.',
  'extension.parent-deleted': 'مکان اصلی در دسترس نیست؛ ابتدا آن را بازیابی کنید.',
  'extension.star': 'انتخاب ستاره یا زمان ثبت معتبر نیست.',
  'extension.number': 'شمارهٔ داخلی برای کپی معتبر نیست.',
  'extension.copy': 'کپی داخلی انجام نشد؛ دوباره تلاش کنید.',
  'extension.copy-unconfirmed': 'کپی داخلی تأیید نشد؛ دوباره تلاش کنید.',
  'extension.usage': 'Optional extension usage recording failed',
  'extension.haptic': 'Optional extension haptic failed',
  'clipboard.unconfirmed': 'کپی جزئیات خطا تأیید نشد؛ دوباره تلاش کنید.',
  'share.in-progress': 'پنجرهٔ ارسال قبلی را ببندید. اگر خطا ادامه داشت، اپ را ببندید و دوباره باز کنید.',
  'share.capacity': 'گزارش‌های موقت قبلی هنوز نگه داشته می‌شوند؛ بعداً دوباره تلاش کنید.',
  'share.time': 'زمان گزارش معتبر نیست.',
  'share.size': 'اندازهٔ گزارش‌های موقت خوانده نشد؛ دوباره تلاش کنید.',
  'share.cleanup': 'پاک‌سازی گزارش موقت تأیید نشد؛ دوباره تلاش کنید.',
  'share.existing': 'گزارش موقت با این نام وجود دارد؛ دوباره تلاش کنید.',
  'share.missing': 'گزارش آمادهٔ ارسال در دسترس نیست؛ دوباره تلاش کنید.',
  'share.prepare': 'گزارش آماده نشد؛ دوباره تلاش کنید.',
  'share.incomplete': 'گزارش کامل ذخیره نشد؛ دوباره تلاش کنید.',
  'share.read': 'گزارش خطاها خوانده نشد؛ دوباره تلاش کنید.',
  'dataset.changed':
    'اطلاعات از بکاپ جایگزین شده است. نوشتهٔ این فرم باقی مانده، اما نمی‌تواند پروندهٔ بازگردانی‌شده را تغییر دهد.',
  'dataset.busy': 'بازگردانی یا ذخیرهٔ اطلاعات در حال انجام است؛ پس از پایان دوباره تلاش کنید.',
  'files.busy': 'ضبط یا ورود فایل، بکاپ یا بازگردانی در حال انجام است؛ بعد از پایان دوباره تلاش کنید.',
  'draft.unsupported': 'پیش‌نویس قابل خواندن نیست؛ متن اصلی آن را نگه دارید یا کپی کنید.',
  'draft.conflict': 'پیش‌نویس یا رکورد تغییر کرده است؛ پیش از ثبت دوباره آن را مرور کنید.',
  'draft.unsaved': 'پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.',
  'patient.conflict': 'پیش‌نویس یا پرونده تغییر کرده است؛ نسخه‌ها را بررسی کنید.',
  'encounter.conflict': 'پیش‌نویس یا نوبت بیمار تغییر کرده است؛ نسخه‌ها را بررسی کنید.',
  'lab.conflict': 'پیش‌نویس یا آزمایش در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.',
  'followup.conflict': 'پیش‌نویس تغییر کرده است؛ نسخه‌ها را بررسی کنید.',
  'request.conflict': 'پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ شما جایگزین نشد.',
  'consult.conflict': 'نسخهٔ تازه‌تری ذخیره شده است؛ نوشتهٔ شما جایگزین آن نشد.',
  'contact.conflict': 'پیش‌نویس همراه در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.',
  'vital.conflict': 'اندازه‌گیری یا پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشته نگه داشته شد.',
  'imaging.conflict': 'تصویربرداری یا پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشته نگه داشته شد.',
  'occasion.conflict': 'پیش‌نویس یا مناسبت در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.',
  'doctor.conflict':
    'همین بخش در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ شما حفظ شد. صفحه را پیش از ادامه مرور یا کپی کنید.',
  'caption.conflict': 'توضیح یا پیش‌نویس عکس تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.',
  'image.conflict': 'نسخهٔ عکس یا پیش‌نویس تغییر کرده است؛ ویرایش شما روی صفحه نگه داشته شد.',
  'note.conflict': 'مبنای نوت یا پیش‌نویس تغییر کرده است؛ نوشتهٔ شما باقی مانده. ابتدا نسخهٔ فعلی را بررسی کنید.',
  'note.parent': 'پروندهٔ بیمار در دسترس نیست؛ نوت تغییر نکرد.',
  'note.encounter': 'نوبت مربوط به این نوت در دسترس نیست؛ ارتباط نوت تغییر نکرد.',
  'note.identity': 'بیمار و نوبت نوت هنگام اصلاح قابل تغییر نیستند.',
  'note.patch': 'اطلاعات اصلاح نوت معتبر نیست؛ نوت تغییر نکرد.',
  'note.unavailable': 'این نوت دیگر قابل تغییر نیست؛ فهرست را دوباره بخوانید.',
  'note.version': 'نسخهٔ انتخاب‌شده تغییر کرده یا در دسترس نیست.',
  'note.owner': 'این نوت تغییر کرده یا متعلق به این پرونده نیست؛ دوباره آن را بررسی کنید.',
  'note.restore': 'این نوت تغییر کرده است؛ فهرست را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.',
  'trash.unavailable': 'این مورد دیگر در سطل زباله نیست؛ فهرست را دوباره بخوانید.',
  'trash.changed': 'این مورد تغییر کرده است؛ فهرست را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.',
  'note.time': 'زمان نوت معتبر نیست.',
  'note.raw-date': 'تاریخ و ساعت پیش‌نویس معتبر نیست؛ نوشته باقی مانده است.',
  'note.date': 'تاریخ و ساعت نوت را کامل و درست وارد کنید؛ پیش‌نویس باقی مانده است.',
  'contact.required': 'شماره تماس لازم است؛ پیش‌نویس نگه داشته شد.',
  'contact.incomplete': 'شماره تماس کامل نیست؛ پیش‌نویس نگه داشته شد.',
  'encounter.date': 'تاریخ معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'encounter.clock': 'ساعت معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'followup.reason': 'دلیل پیگیری را بنویسید.',
  'followup.date': 'تاریخ پیگیری معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'followup.clock': 'ساعت پیگیری معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'imaging.date': 'تاریخ تصویربرداری معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'occasion.date': 'تاریخ مناسبت معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'occasion.lead': 'فاصلهٔ یادآوری معتبر نیست.',
  'lab.date': 'تاریخ و ساعت نمونه‌گیری معتبر نیست؛ پیش‌نویس نگه داشته شد.',
  'lab.range-open': 'محدودهٔ باز را ثبت یا لغو کنید؛ پیش‌نویس نگه داشته شد.',
  'lab.empty': 'هیچ مقداری وارد نشده.',
  'lab.analyte': 'نام آزمایشِ مقدار واردشده را بنویسید.',
  'lab.number': 'مقدار عددی خوانا نیست؛ اعشار را با نقطه بنویسید، مثلاً 5.8.',
  'lab.range': 'محدودهٔ مرجع معتبر نیست.',
  'image.crop': 'کادر برش خارج از عکس است.',
  'image.ids': 'شناسهٔ علامت‌ها تکراری است.',
  'image.text': 'محدودهٔ نوشته معتبر نیست.',
  'image.mark': 'محدودهٔ علامت معتبر نیست.',
  'image.limit': 'علامت‌ها زیاد شده‌اند؛ یک نسخه ذخیره کنید و علامت‌های اضافی را بردارید.',
  'image.document': 'سند ویرایش عکس بیش از اندازه بزرگ است.',
  'image.draft': 'پیش‌نویس عکس بیش از اندازه بزرگ است.',
  'backup.type': 'این فایل، بکاپ MedOS نیست.',
  'backup.passphrase': 'رمز بکاپ اشتباه است.',
  'backup.damaged': 'فایل بکاپ آسیب دیده یا ناقص است.',
  'backup.short': 'فایل بکاپ زودتر از انتظار تمام شد.',
  'backup.archive': 'ساختار داخلی بکاپ شناخته نشد.',
  'backup.size': 'اندازهٔ فایل بکاپ خوانده نشد؛ دوباره تلاش کنید.',
  'backup.schema': 'نسخهٔ دیتابیس خوانده نشد؛ بکاپ یا بازگردانی را دوباره امتحان کنید.',
  'backup.key': 'رمز بکاپ تنظیم نشده است.',
  'backup.folder': 'پوشه‌ی بکاپ در دسترس نیست. از صفحه‌ی بکاپ دوباره انتخابش کنید.',
  'backup.newer': 'این بکاپ با نسخه‌ی جدیدتری از MedOS ساخته شده است. اول اپ را به‌روز کنید، بعد بازگردانی کنید.',
  'backup.pending': 'بازگردانی قبلی ناتمام است. ابتدا از پیام «بازگردانی ناتمام» فایل‌ها را برگردانید.',
  'backup.marker': 'اطلاعات بازگردانی ناتمام خوانا نیست. فایل‌های کنارگذاشته‌شده حفظ شدند؛ اطلاعات را پاک نکنید.',
  'backup.copy': 'بررسی فایل بکاپ در مقصد کامل نشد. بکاپ‌های قبلی نگه داشته شدند؛ دوباره تلاش کنید.',
  'backup.interrupted': 'اپ در میانه‌ی بکاپ بسته شد',
  'restore.media-kept': 'فایل‌ها سر جایشان برنگشتند. فایل‌های کنار گذاشته‌شده حفظ شده‌اند؛ هیچ چیزی را پاک نکنید.',
  'restore.media-reverted': 'فایل‌های بکاپ جابه‌جا نشدند و همه چیز به حالت قبل برگشت.',
} as const;

const kinds = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'DatasetChangedError',
  'DatasetBusyError',
  'FileWorkBusyError',
  'MediaRestoreError',
  'NoteDraftConflict',
  'PatientFormConflict',
  'ContactFormConflict',
  'EncounterFormConflict',
  'VitalFormConflict',
  'LabFormConflict',
  'ImagingFormConflict',
  'FollowUpFormConflict',
  'ConsultDraftConflict',
  'RequestDraftConflict',
  'TaskDraftConflict',
  'TaskScheduleConflict',
  'DoctorFormConflict',
  'OccasionFormConflict',
  'CaptionConflict',
  'ImageEditConflict',
] as const;
const nativeCodes = [
  'ERR_SHARING_IN_PROGRESS',
  'ERR_SHARING_FAILED',
  'ERR_SHARING_INVALID_ARGS',
  'ERR_UNAVAILABLE',
  'ERR_UNABLE_TO_READ_HANDLE',
  'ERR_UNABLE_TO_WRITE_HANDLE',
  'ERR_UNABLE_TO_CREATE',
  'ERR_UNABLE_TO_DELETE',
  'ERR_INVALID_PERMISSION',
  'ERR_DESTINATION_ALREADY_EXISTS',
  'ERR_UNABLE_TO_COPY',
  'ERR_UNABLE_TO_MOVE',
  'ERR_INTERNAL_SQLITE_ERROR',
  'ERR_OPEN_DATABASE',
  'ERR_ACCESS_CLOSED_RESOURCE',
  'copy-not-found',
  'source-size-unknown',
  'size-differs',
  'digest-differs',
  'bytes-differ',
  'unreadable',
] as const;
export type KnownCode = keyof typeof notices | (typeof nativeCodes)[number];
export type DiagnosticKind = (typeof kinds)[number] | 'unknown';
export type DiagnosticFrame =
  | { bundle: 'android'; coordinate: 'bytecode'; line: number; offset: number }
  | { bundle: 'android'; coordinate: 'source'; line: number; column: number };
export type ErrorDiagnostic = {
  kind: DiagnosticKind;
  code?: KnownCode;
  frames: DiagnosticFrame[];
  detailsOmitted: true;
  framesOmitted: boolean;
};

export const diagnosticContexts = {
  'feedback.alert': 'feedback.alert',
  'read.notice': 'read.notice',
  'places optional device feedback': 'places.feedback',
  'settings.preference': 'settings.preference',
  'diagnostics.share': 'diagnostics.share',
  'diagnostics.clear': 'diagnostics.clear',
  'diagnostics.clipboard': 'diagnostics.clipboard',
  'notification setup': 'notification.setup',
  'voice note playback': 'voice.playback',
  'startup: audio mode': 'startup.audio',
  'note.card': 'note.card',
  'reminder upkeep': 'reminder.upkeep',
  'task reminder reconciliation': 'task.reminder.reconcile',
  'follow-up reminder reconciliation': 'followup.reminder.reconcile',
  'occasion reminder reconciliation': 'occasion.reminder.reconcile',
  'occasion reminder repair': 'occasion.reminder.repair',
  'occasion reminder status after publication': 'occasion.publish.reminder',
  'doctor form reminder repair': 'doctor.draft.reminder',
  'follow-up restore reminder receipt': 'followup.restore.reminder',
  'باز کردن قفل کامل نشد': 'lock.authentication',
  'backup: verifying destination copy': 'backup.copy.verify',
  'restore.media.recovery': 'restore.media.recovery',
  'restore cleanup: DETACH DATABASE restore_src': 'restore.cleanup.detach',
  'restore cleanup: PRAGMA foreign_keys = ON': 'restore.cleanup.foreign-keys',
  'restore: فهرست‌های پیش‌فرض': 'restore.seeds',
  'restore: بازسازی جست‌وجو': 'restore.search',
  'restore: بازبینی پرچم آزمایش‌ها': 'restore.lab-flags',
  'restore: هماهنگی وضعیت بیماران': 'restore.patient-status',
  'restore: تاریخچه‌ی نوت‌ها': 'restore.note-history',
  'restore: یادآورها': 'restore.reminders',
  'restore: ذخیره‌ی رمز بکاپ': 'restore.backup-key',
  'restore: بستن فایل بکاپ': 'restore.source.close',
  'restore: نمایش پایان بازگردانی': 'restore.progress',
  'restore: recording unresolved media': 'restore.media.unresolved',
  'restore: closing source after failure': 'restore.source.close',
} as const;
export type KnownContext = (typeof diagnosticContexts)[keyof typeof diagnosticContexts];
export function safeContext(value: unknown): KnownContext | undefined {
  if (typeof value !== 'string') return undefined;
  if (Object.prototype.hasOwnProperty.call(diagnosticContexts, value))
    return diagnosticContexts[value as keyof typeof diagnosticContexts];
  return Object.values(diagnosticContexts).find((context) => context === value);
}
export function safeCode(value: unknown): KnownCode | undefined {
  return typeof value === 'string' &&
    (Object.prototype.hasOwnProperty.call(notices, value) || nativeCodes.some((code) => code === value))
    ? (value as KnownCode)
    : undefined;
}
function field(value: unknown, key: string): unknown {
  try {
    return value != null && (typeof value === 'object' || typeof value === 'function')
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}
function noticeCode(message: unknown): keyof typeof notices | undefined {
  return typeof message === 'string'
    ? (Object.keys(notices) as (keyof typeof notices)[]).find((code) => notices[code] === message)
    : undefined;
}
export function safeErrorMessage(error: unknown, fallback = 'خطای فنی رخ داد؛ دوباره تلاش کنید.'): string {
  const code = noticeCode(field(error, 'message'));
  if (code) return notices[code];
  if (errorDiagnostic(error).code === 'ERR_SHARING_IN_PROGRESS') return notices['share.in-progress'];
  return fallback;
}
/** Legacy text is untrusted too; it never becomes a raw display/export. */
export function safeLegacyErrorText(text: string, fallback?: string): string {
  return safeErrorMessage({ message: text }, fallback);
}

export function errorDiagnostic(error: unknown): ErrorDiagnostic {
  const name = field(error, 'name');
  const result: ErrorDiagnostic = {
    kind: kinds.find((kind) => kind === name) ?? 'unknown',
    frames: [],
    detailsOmitted: true,
    framesOmitted: false,
  };
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current != null && depth < 3 && !seen.has(current); depth++) {
    seen.add(current);
    result.code ??= safeCode(field(current, 'code'));
    const stack = field(current, 'stack');
    if (typeof stack === 'string') {
      if (stack.length > STACK_LIMIT) result.framesOmitted = true;
      for (const line of stack.slice(0, STACK_LIMIT).split('\n')) {
        if (!line.startsWith('    at ')) continue;
        const match =
          line.length <= 2048
            ? /^ {4}at .+? \((address at )?(?:index\.android\.bundle|index\.bundle):(\d{1,10}):(\d{1,10})\)$/.exec(line)
            : null;
        if (!match) {
          result.framesOmitted = true;
          continue;
        }
        const lineNumber = parseInt(match[2]!, 10);
        const coordinate = parseInt(match[3]!, 10);
        if (lineNumber < 1 || lineNumber > 2147483647 || coordinate > 2147483647 || (!match[1] && coordinate < 1)) {
          result.framesOmitted = true;
          continue;
        }
        if (result.frames.length >= DIAGNOSTIC_FRAME_LIMIT) {
          result.framesOmitted = true;
          continue;
        }
        result.frames.push(
          match[1]
            ? { bundle: 'android', coordinate: 'bytecode', line: lineNumber, offset: coordinate }
            : { bundle: 'android', coordinate: 'source', line: lineNumber, column: coordinate },
        );
      }
    }
    current = field(current, 'cause');
  }
  result.code ??= noticeCode(field(error, 'message'));
  return result;
}
export function diagnosticText(diagnostic: ErrorDiagnostic): string {
  return [
    diagnostic.kind,
    diagnostic.code,
    ...diagnostic.frames.map((frame) =>
      frame.coordinate === 'bytecode'
        ? `index.android.bundle:${frame.line}:offset ${frame.offset}`
        : `index.android.bundle:${frame.line}:column ${frame.column}`,
    ),
    'Arbitrary error text omitted.',
    diagnostic.framesOmitted ? 'Some frames omitted.' : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}
/** Preserve the previous handler/fatal behavior without forwarding raw metadata. */
export function safeErrorForHandler(error: unknown): Error {
  const diagnostic = errorDiagnostic(error);
  const safe = new Error(diagnosticText(diagnostic));
  safe.name = diagnostic.kind === 'unknown' ? 'Error' : diagnostic.kind;
  safe.stack =
    `${safe.name}: ${safe.message}\n` +
    diagnostic.frames
      .map((frame) =>
        frame.coordinate === 'bytecode'
          ? `    at diagnostic (address at index.android.bundle:${frame.line}:${frame.offset})`
          : `    at diagnostic (index.android.bundle:${frame.line}:${frame.column})`,
      )
      .join('\n');
  return safe;
}
