/**
 * The Iranian specialty tree, seeded on first launch.
 *
 * `slug` is stable and is what code and future seeds refer to; the database id
 * is a UUID like every other row. Editing or adding specialties in-app is
 * allowed — re-seeding only inserts slugs that are missing, so user additions
 * and edits survive an app update.
 */

export type SpecialtySeed = {
  slug: string;
  nameFa: string;
  nameEn: string;
  parent?: string;
  kind: 'specialty' | 'subspecialty' | 'fellowship' | 'general';
  aliases?: string[];
};

export const SPECIALTY_SEED: SpecialtySeed[] = [
  { slug: 'gp', nameFa: 'پزشک عمومی', nameEn: 'General Practitioner', kind: 'general', aliases: ['عمومی', 'GP'] },

  /* ---------------------------------------------------------------- Internal */
  { slug: 'internal', nameFa: 'داخلی', nameEn: 'Internal Medicine', kind: 'specialty', aliases: ['اینترنال'] },
  {
    slug: 'gastro',
    nameFa: 'گوارش و کبد',
    nameEn: 'Gastroenterology & Hepatology',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['گوارش', 'GI'],
  },
  {
    slug: 'endocrine',
    nameFa: 'غدد و متابولیسم',
    nameEn: 'Endocrinology',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['غدد'],
  },
  {
    slug: 'nephro',
    nameFa: 'کلیه',
    nameEn: 'Nephrology',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['نفرولوژی'],
  },
  {
    slug: 'pulmo',
    nameFa: 'ریه',
    nameEn: 'Pulmonology',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['ریه و تنفس'],
  },
  { slug: 'rheum', nameFa: 'روماتولوژی', nameEn: 'Rheumatology', parent: 'internal', kind: 'subspecialty' },
  {
    slug: 'hemonc',
    nameFa: 'خون و انکولوژی بالغین',
    nameEn: 'Hematology & Oncology',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['خون', 'انکولوژی'],
  },
  {
    slug: 'icu-internal',
    nameFa: 'مراقبت‌های ویژه',
    nameEn: 'Critical Care Medicine',
    parent: 'internal',
    kind: 'subspecialty',
    aliases: ['ICU'],
  },
  {
    slug: 'allergy',
    nameFa: 'آلرژی و ایمونولوژی بالینی',
    nameEn: 'Allergy & Clinical Immunology',
    parent: 'internal',
    kind: 'subspecialty',
  },
  { slug: 'geriatrics', nameFa: 'طب سالمندان', nameEn: 'Geriatric Medicine', parent: 'internal', kind: 'subspecialty' },

  /* ------------------------------------------------------------- Paediatrics */
  { slug: 'peds', nameFa: 'کودکان', nameEn: 'Pediatrics', kind: 'specialty', aliases: ['اطفال'] },
  { slug: 'neonat', nameFa: 'نوزادان', nameEn: 'Neonatology', parent: 'peds', kind: 'subspecialty', aliases: ['NICU'] },
  { slug: 'peds-cardio', nameFa: 'قلب کودکان', nameEn: 'Pediatric Cardiology', parent: 'peds', kind: 'subspecialty' },
  {
    slug: 'peds-gastro',
    nameFa: 'گوارش کودکان',
    nameEn: 'Pediatric Gastroenterology',
    parent: 'peds',
    kind: 'subspecialty',
  },
  { slug: 'peds-endo', nameFa: 'غدد کودکان', nameEn: 'Pediatric Endocrinology', parent: 'peds', kind: 'subspecialty' },
  { slug: 'peds-nephro', nameFa: 'کلیه کودکان', nameEn: 'Pediatric Nephrology', parent: 'peds', kind: 'subspecialty' },
  {
    slug: 'peds-id',
    nameFa: 'عفونی کودکان',
    nameEn: 'Pediatric Infectious Diseases',
    parent: 'peds',
    kind: 'subspecialty',
  },
  {
    slug: 'peds-hemonc',
    nameFa: 'خون و انکولوژی کودکان',
    nameEn: 'Pediatric Hematology & Oncology',
    parent: 'peds',
    kind: 'subspecialty',
  },
  {
    slug: 'peds-neuro',
    nameFa: 'مغز و اعصاب کودکان',
    nameEn: 'Pediatric Neurology',
    parent: 'peds',
    kind: 'subspecialty',
  },
  { slug: 'peds-pulmo', nameFa: 'ریه کودکان', nameEn: 'Pediatric Pulmonology', parent: 'peds', kind: 'subspecialty' },
  {
    slug: 'peds-rheum',
    nameFa: 'روماتولوژی کودکان',
    nameEn: 'Pediatric Rheumatology',
    parent: 'peds',
    kind: 'subspecialty',
  },
  {
    slug: 'picu',
    nameFa: 'مراقبت‌های ویژه کودکان',
    nameEn: 'Pediatric Critical Care',
    parent: 'peds',
    kind: 'subspecialty',
    aliases: ['PICU'],
  },

  /* ----------------------------------------------------------------- Surgery */
  { slug: 'surgery', nameFa: 'جراحی عمومی', nameEn: 'General Surgery', kind: 'specialty', aliases: ['جراحی'] },
  { slug: 'thoracic', nameFa: 'جراحی توراکس', nameEn: 'Thoracic Surgery', parent: 'surgery', kind: 'subspecialty' },
  { slug: 'vascular', nameFa: 'جراحی عروق', nameEn: 'Vascular Surgery', parent: 'surgery', kind: 'subspecialty' },
  {
    slug: 'colorectal',
    nameFa: 'جراحی کولورکتال',
    nameEn: 'Colorectal Surgery',
    parent: 'surgery',
    kind: 'fellowship',
  },
  {
    slug: 'peds-surgery',
    nameFa: 'جراحی کودکان',
    nameEn: 'Pediatric Surgery',
    parent: 'surgery',
    kind: 'subspecialty',
  },
  { slug: 'transplant', nameFa: 'پیوند اعضا', nameEn: 'Transplant Surgery', parent: 'surgery', kind: 'fellowship' },
  {
    slug: 'laparoscopy',
    nameFa: 'جراحی لاپاروسکوپی',
    nameEn: 'Minimally Invasive Surgery',
    parent: 'surgery',
    kind: 'fellowship',
  },

  /* -------------------------------------------------------------- Cardiology */
  { slug: 'cardio', nameFa: 'قلب و عروق', nameEn: 'Cardiology', kind: 'specialty', aliases: ['قلب'] },
  {
    slug: 'interventional',
    nameFa: 'اینترونشنال کاردیولوژی',
    nameEn: 'Interventional Cardiology',
    parent: 'cardio',
    kind: 'fellowship',
    aliases: ['آنژیو'],
  },
  {
    slug: 'electrophysio',
    nameFa: 'الکتروفیزیولوژی',
    nameEn: 'Cardiac Electrophysiology',
    parent: 'cardio',
    kind: 'fellowship',
    aliases: ['EP'],
  },
  { slug: 'echo', nameFa: 'اکوکاردیوگرافی', nameEn: 'Echocardiography', parent: 'cardio', kind: 'fellowship' },
  {
    slug: 'cardiac-surgery',
    nameFa: 'جراحی قلب',
    nameEn: 'Cardiac Surgery',
    kind: 'specialty',
    aliases: ['جراحی قلب و عروق'],
  },

  /* ------------------------------------------------------------- Neuro & psy */
  { slug: 'neuro', nameFa: 'مغز و اعصاب', nameEn: 'Neurology', kind: 'specialty', aliases: ['نورولوژی'] },
  {
    slug: 'neurosurgery',
    nameFa: 'جراحی مغز و اعصاب',
    nameEn: 'Neurosurgery',
    kind: 'specialty',
    aliases: ['نوروسرجری'],
  },
  { slug: 'psych', nameFa: 'روانپزشکی', nameEn: 'Psychiatry', kind: 'specialty' },
  {
    slug: 'child-psych',
    nameFa: 'روانپزشکی کودک و نوجوان',
    nameEn: 'Child & Adolescent Psychiatry',
    parent: 'psych',
    kind: 'subspecialty',
  },

  /* ------------------------------------------------------------ Women & repro */
  { slug: 'obgyn', nameFa: 'زنان و زایمان', nameEn: 'Obstetrics & Gynecology', kind: 'specialty', aliases: ['زنان'] },
  { slug: 'gyn-onc', nameFa: 'انکولوژی زنان', nameEn: 'Gynecologic Oncology', parent: 'obgyn', kind: 'subspecialty' },
  { slug: 'perinatology', nameFa: 'پریناتولوژی', nameEn: 'Perinatology', parent: 'obgyn', kind: 'subspecialty' },
  {
    slug: 'infertility',
    nameFa: 'نازایی و ناباروری',
    nameEn: 'Reproductive Endocrinology & Infertility',
    parent: 'obgyn',
    kind: 'fellowship',
    aliases: ['IVF'],
  },

  /* ------------------------------------------------------------------ Others */
  { slug: 'ortho', nameFa: 'ارتوپدی', nameEn: 'Orthopedic Surgery', kind: 'specialty' },
  { slug: 'ortho-spine', nameFa: 'جراحی ستون فقرات', nameEn: 'Spine Surgery', parent: 'ortho', kind: 'fellowship' },
  {
    slug: 'ortho-knee',
    nameFa: 'زانو و آرتروسکوپی',
    nameEn: 'Knee & Arthroscopy',
    parent: 'ortho',
    kind: 'fellowship',
  },
  { slug: 'ortho-hand', nameFa: 'جراحی دست', nameEn: 'Hand Surgery', parent: 'ortho', kind: 'fellowship' },

  { slug: 'ophtho', nameFa: 'چشم‌پزشکی', nameEn: 'Ophthalmology', kind: 'specialty', aliases: ['چشم'] },
  { slug: 'retina', nameFa: 'شبکیه', nameEn: 'Retina', parent: 'ophtho', kind: 'fellowship' },
  { slug: 'cornea', nameFa: 'قرنیه', nameEn: 'Cornea', parent: 'ophtho', kind: 'fellowship' },
  { slug: 'glaucoma', nameFa: 'گلوکوم', nameEn: 'Glaucoma', parent: 'ophtho', kind: 'fellowship' },

  {
    slug: 'ent',
    nameFa: 'گوش و حلق و بینی',
    nameEn: 'Otorhinolaryngology',
    kind: 'specialty',
    aliases: ['ENT', 'گوش حلق بینی'],
  },
  { slug: 'derm', nameFa: 'پوست', nameEn: 'Dermatology', kind: 'specialty', aliases: ['پوست و مو'] },
  { slug: 'uro', nameFa: 'اورولوژی', nameEn: 'Urology', kind: 'specialty', aliases: ['کلیه و مجاری ادراری'] },
  {
    slug: 'id',
    nameFa: 'بیماری‌های عفونی و گرمسیری',
    nameEn: 'Infectious Diseases',
    kind: 'specialty',
    aliases: ['عفونی'],
  },
  { slug: 'emergency', nameFa: 'طب اورژانس', nameEn: 'Emergency Medicine', kind: 'specialty', aliases: ['اورژانس'] },
  { slug: 'anesthesia', nameFa: 'بیهوشی', nameEn: 'Anesthesiology', kind: 'specialty' },
  { slug: 'pain', nameFa: 'درد', nameEn: 'Pain Medicine', parent: 'anesthesia', kind: 'fellowship' },

  { slug: 'radiology', nameFa: 'رادیولوژی', nameEn: 'Radiology', kind: 'specialty', aliases: ['تصویربرداری'] },
  {
    slug: 'interventional-radio',
    nameFa: 'رادیولوژی مداخله‌ای',
    nameEn: 'Interventional Radiology',
    parent: 'radiology',
    kind: 'fellowship',
  },
  { slug: 'nuclear', nameFa: 'پزشکی هسته‌ای', nameEn: 'Nuclear Medicine', kind: 'specialty' },
  { slug: 'radio-onc', nameFa: 'رادیوتراپی و انکولوژی', nameEn: 'Radiation Oncology', kind: 'specialty' },

  { slug: 'pathology', nameFa: 'آسیب‌شناسی', nameEn: 'Pathology', kind: 'specialty', aliases: ['پاتولوژی'] },
  { slug: 'lab-sciences', nameFa: 'علوم آزمایشگاهی', nameEn: 'Laboratory Sciences', kind: 'specialty' },
  { slug: 'pmr', nameFa: 'طب فیزیکی و توانبخشی', nameEn: 'Physical Medicine & Rehabilitation', kind: 'specialty' },
  { slug: 'plastic', nameFa: 'جراحی پلاستیک و ترمیمی', nameEn: 'Plastic & Reconstructive Surgery', kind: 'specialty' },
  { slug: 'forensic', nameFa: 'پزشکی قانونی', nameEn: 'Forensic Medicine', kind: 'specialty' },
  { slug: 'occupational', nameFa: 'طب کار', nameEn: 'Occupational Medicine', kind: 'specialty' },
  { slug: 'community', nameFa: 'پزشکی اجتماعی', nameEn: 'Community Medicine', kind: 'specialty' },
  { slug: 'sports', nameFa: 'طب ورزشی', nameEn: 'Sports Medicine', kind: 'specialty' },
  { slug: 'genetics', nameFa: 'ژنتیک پزشکی', nameEn: 'Medical Genetics', kind: 'specialty' },
  { slug: 'traditional', nameFa: 'طب سنتی ایرانی', nameEn: 'Persian Traditional Medicine', kind: 'specialty' },
  { slug: 'family', nameFa: 'پزشکی خانواده', nameEn: 'Family Medicine', kind: 'specialty' },
  { slug: 'dentistry', nameFa: 'دندانپزشکی', nameEn: 'Dentistry', kind: 'specialty' },
  { slug: 'nutrition', nameFa: 'تغذیه', nameEn: 'Nutrition', kind: 'specialty' },
];
