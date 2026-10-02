export type ClinicalImpression = {
  abbr: string;
  full: string;
  persian?: string;
};

/**
 * Curated reference list of high-frequency medical impressions and abbreviations
 * encountered in Iranian hospital wards, emergency departments, and outpatient clinics.
 */
export const COMMON_IMPRESSIONS: readonly ClinicalImpression[] = [
  // Cardiology
  { abbr: 'AF', full: 'Atrial Fibrillation', persian: 'فیبریلاسیون دهلیزی' },
  { abbr: 'AFI', full: 'Atrial Flutter', persian: 'فلاتر دهلیزی' },
  { abbr: 'ACS', full: 'Acute Coronary Syndrome', persian: 'سندرم حاد کرونری' },
  { abbr: 'STEMI', full: 'ST-Elevation Myocardial Infarction', persian: 'سکته قلبی با صعود قطعه ST' },
  { abbr: 'NSTEMI', full: 'Non-ST-Elevation Myocardial Infarction', persian: 'سکته قلبی بدون صعود ST' },
  { abbr: 'HF', full: 'Heart Failure', persian: 'نارسایی قلبی' },
  { abbr: 'HFrEF', full: 'Heart Failure with Reduced EF' },
  { abbr: 'HFpEF', full: 'Heart Failure with Preserved EF' },
  { abbr: 'HTN', full: 'Hypertension', persian: 'فشار خون بالا' },
  { abbr: 'IHD', full: 'Ischemic Heart Disease', persian: 'بیماری ایسکمیک قلبی' },
  { abbr: 'DVT', full: 'Deep Vein Thrombosis', persian: 'ترومبوز ورید عمقی' },
  { abbr: 'PTE', full: 'Pulmonary Thromboembolism', persian: 'آمبولی ریه' },
  { abbr: 'PE', full: 'Pulmonary Embolism', persian: 'آمبولی ریه' },

  // Nephrology & Fluid/Electrolyte
  { abbr: 'AKI', full: 'Acute Kidney Injury', persian: 'آسیب حاد کلیه' },
  { abbr: 'CKD', full: 'Chronic Kidney Disease', persian: 'بیماری مزمن کلیه' },
  { abbr: 'ESRD', full: 'End-Stage Renal Disease', persian: 'بیماری مرحله نهایی کلیه' },
  { abbr: 'UTI', full: 'Urinary Tract Infection', persian: 'عفونت ادراری' },
  { abbr: 'BPH', full: 'Benign Prostatic Hyperplasia', persian: 'بزرگی خوش‌خیم پروستات' },
  { abbr: 'GN', full: 'Glomerulonephritis', persian: 'گلومرولونفریت' },
  { abbr: 'NS', full: 'Nephrotic Syndrome', persian: 'سندرم نفروتیک' },

  // Endocrinology & Metabolic
  { abbr: 'DM', full: 'Diabetes Mellitus', persian: 'دیابت ملیتوس' },
  { abbr: 'T1DM', full: 'Type 1 Diabetes Mellitus', persian: 'دیابت نوع ۱' },
  { abbr: 'T2DM', full: 'Type 2 Diabetes Mellitus', persian: 'دیابت نوع ۲' },
  { abbr: 'DKA', full: 'Diabetic Ketoacidosis', persian: 'کتواسیدوز دیابتی' },
  { abbr: 'HHS', full: 'Hyperosmolar Hyperglycemic State', persian: 'سندرم هایپراسمولار هایپرگلیسمیک' },
  { abbr: 'DLP', full: 'Dyslipidemia', persian: 'اختلال چربی خون' },
  { abbr: 'Hypo', full: 'Hypothyroidism', persian: 'کم‌کاری تیروئید' },
  { abbr: 'Hyper', full: 'Hyperthyroidism', persian: 'پرکاری تیروئید' },

  // Pulmonology
  { abbr: 'COPD', full: 'Chronic Obstructive Pulmonary Disease', persian: 'بیماری مزمن انسدادی ریه' },
  { abbr: 'Asthma', full: 'Bronchial Asthma', persian: 'آسم برونشیال' },
  { abbr: 'CAP', full: 'Community-Acquired Pneumonia', persian: 'پنومونی اکتسابی از جامعه' },
  { abbr: 'HAP', full: 'Hospital-Acquired Pneumonia', persian: 'پنومونی بیمارستانی' },
  { abbr: 'ARDS', full: 'Acute Respiratory Distress Syndrome', persian: 'سندرم دیسترس تنفسی حاد' },
  { abbr: 'Effusion', full: 'Pleural Effusion', persian: 'افیوژن پلور' },

  // Gastroenterology & Abdominal
  { abbr: 'GERD', full: 'Gastroesophageal Reflux Disease', persian: 'ریفلاکس معده به مری' },
  { abbr: 'PUD', full: 'Peptic Ulcer Disease', persian: 'زخم پپتیک' },
  { abbr: 'UGIB', full: 'Upper Gastrointestinal Bleeding', persian: 'خونریزی گوارشی فوقانی' },
  { abbr: 'LGIB', full: 'Lower Gastrointestinal Bleeding', persian: 'خونریزی گوارشی تحتانی' },
  { abbr: 'Cirrhosis', full: 'Liver Cirrhosis', persian: 'سیروز کبدی' },
  { abbr: 'IBD', full: 'Inflammatory Bowel Disease', persian: 'بیماری التهابی روده' },
  { abbr: 'UC', full: 'Ulcerative Colitis', persian: 'کولیت اولسراتیو' },
  { abbr: 'CD', full: 'Crohn Disease', persian: 'بیماری کرون' },
  { abbr: 'Pancreatitis', full: 'Acute Pancreatitis', persian: 'پانکراتیت حاد' },
  { abbr: 'SBO', full: 'Small Bowel Obstruction', persian: 'انسداد روده باریک' },

  // Surgery & Acute Abdomen
  { abbr: 'Appy', full: 'Acute Appendicitis', persian: 'آپاندیسیت حاد' },
  { abbr: 'Chole', full: 'Acute Cholecystitis', persian: 'کوله سیستیت حاد' },
  { abbr: 'Hernia', full: 'Inguinal Hernia', persian: 'فتق اینگوینال' },
  { abbr: 'Peritonitis', full: 'Acute Peritonitis', persian: 'پریتونیت حاد' },

  // Neurology
  { abbr: 'CVA', full: 'Cerebrovascular Accident (Stroke)', persian: 'سکته مغزی' },
  { abbr: 'TIA', full: 'Transient Ischemic Attack', persian: 'حمله ایسکمیک گذرا' },
  { abbr: 'ICH', full: 'Intracerebral Hemorrhage', persian: 'خونریزی داخل مغزی' },
  { abbr: 'SAH', full: 'Subarachnoid Hemorrhage', persian: 'خونریزی زیر عنکبوتیه' },
  { abbr: 'Seizure', full: 'Seizure Disorder / Epilepsy', persian: 'تشنج / صرع' },
  { abbr: 'Meningitis', full: 'Acute Meningitis', persian: 'مننژیت حاد' },

  // Infectious Diseases
  { abbr: 'Sepsis', full: 'Sepsis', persian: 'سپسیس' },
  { abbr: 'Septic Shock', full: 'Septic Shock', persian: 'شوک سپتیک' },
  { abbr: 'Cellulitis', full: 'Cellulitis', persian: 'سلولیت' },
  { abbr: 'TB', full: 'Tuberculosis', persian: 'سل' },

  // Hematology & Oncology
  { abbr: 'IDA', full: 'Iron Deficiency Anemia', persian: 'کم‌خونی فقر آهن' },
  { abbr: 'Anemia', full: 'Anemia', persian: 'کم‌خونی' },
  { abbr: 'ITP', full: 'Immune Thrombocytopenia' },
  { abbr: 'ALL', full: 'Acute Lymphoblastic Leukemia' },
  { abbr: 'AML', full: 'Acute Myeloid Leukemia' },

  // Rheumatology
  { abbr: 'SLE', full: 'Systemic Lupus Erythematosus', persian: 'لوپوس اریتماتوز سیستمیک' },
  { abbr: 'RA', full: 'Rheumatoid Arthritis', persian: 'آرتریت روماتوئید' },
];

/**
 * Returns prioritized suggestions matching a user's typed diagnosis query.
 * Exact abbreviation matches are placed first, followed by prefix and substring matches.
 */
export function matchImpressions(query: string, limit = 5): ClinicalImpression[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exactAbbr: ClinicalImpression[] = [];
  const prefixAbbr: ClinicalImpression[] = [];
  const otherMatches: ClinicalImpression[] = [];

  for (const item of COMMON_IMPRESSIONS) {
    const abbrLower = item.abbr.toLowerCase();
    const fullLower = item.full.toLowerCase();
    const persianLower = item.persian?.toLowerCase();

    if (abbrLower === q) {
      exactAbbr.push(item);
    } else if (abbrLower.startsWith(q)) {
      prefixAbbr.push(item);
    } else if (fullLower.includes(q) || (persianLower && persianLower.includes(q))) {
      otherMatches.push(item);
    }
  }

  return [...exactAbbr, ...prefixAbbr, ...otherMatches].slice(0, limit);
}
