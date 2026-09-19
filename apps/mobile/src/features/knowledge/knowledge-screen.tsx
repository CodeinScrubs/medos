import { ModuleRoadmap } from '@/components/module-roadmap';

export function KnowledgeScreen() {
  return (
    <ModuleRoadmap
      title="دانش"
      intro="چیزهایی که یاد می‌گیرید، و اینکه از چه کسی یاد گرفته‌اید."
      features={[
        {
          icon: 'book-outline',
          title: 'خلاصه‌نویسی مباحث',
          description:
            'هر مبحث با یادداشت استادی که تدریسش کرده — ماه‌ها بعد سؤال این است که «استاد X درباره‌ی این چه گفت»، نه اینکه کتاب چه می‌گوید.',
          state: 'ready',
        },
        {
          icon: 'compass-outline',
          title: 'شناخت رشته‌ها',
          description: 'برای هر رشته: ماهیت کار، طول رزیدنتی، سبک زندگی، بازار کار، مزایا و معایب، و نظر شخصی خودتان.',
          state: 'ready',
        },
        {
          icon: 'receipt-outline',
          title: 'نسخه‌های روتین سرپایی',
          description:
            'قالب نسخه برای بیماری‌های شایع، با توصیه‌ها، هشدارها و برنامه‌ی پیگیری. نوشته‌ی خودتان، ذخیره و تکرارشدنی.',
          state: 'ready',
        },
        {
          icon: 'bulb-outline',
          title: 'دفترچه‌ی ایده‌ها',
          description: 'هر قابلیتی که به ذهنتان می‌رسد اینجا ثبت می‌شود تا در نسخه‌های بعدی ساخته شود.',
          state: 'ready',
        },
        {
          icon: 'mic-outline',
          title: 'وویس‌نوت',
          description: 'ضبط صدا روی هر نوت و هر مبحث، برای وقتی که تایپ کردن وقت نیست.',
          state: 'planned',
        },
      ]}
    />
  );
}
