import { ModuleRoadmap } from '@/components/module-roadmap';

export function DoctorsScreen() {
  return (
    <ModuleRoadmap
      title="پزشکان"
      intro="دفترچه‌ی اساتید، همکاران و پزشکان ارجاع — با همه‌چیزی که برای یک تماس درست لازم است."
      features={[
        {
          icon: 'person-add-outline',
          title: 'پروفایل پزشک',
          description: 'نام، تخصص و فوق‌تخصص، شماره‌ها، بیمارستان، آدرس مطب و ساعات کاری.',
          state: 'ready',
        },
        {
          icon: 'search-outline',
          title: 'جستجو بر اساس تخصص',
          description:
            'فهرست تخصص‌ها و فوق‌تخصص‌ها از قبل وارد شده است؛ «متخصص اطفال فوق‌تخصص عفونی» یک فیلتر است نه حدس.',
          state: 'ready',
        },
        {
          icon: 'star-outline',
          title: 'امتیازدهی شخصی',
          description:
            'سواد، اورینت بودن، برخورد با بیمار، پاسخگویی اورژانسی، استقبال از تماس و آموزش‌دهندگی — هرکدام ۱ تا ۵ با دلیل.',
          state: 'ready',
        },
        {
          icon: 'heart-outline',
          title: 'پروفایل اجتماعی',
          description: 'زادگاه، دانشگاه، علایق، نحوه‌ی آشنایی و سبک ارتباطی — برای گرم‌تر شدن همکاری.',
          state: 'ready',
        },
        {
          icon: 'gift-outline',
          title: 'مناسبت‌ها و پیام تبریک',
          description: 'تولد شمسی و مناسبت‌های تکرارشونده، یادآور زودهنگام و متن آماده برای ارسال از پیام‌رسان خودتان.',
          state: 'ready',
        },
        {
          icon: 'share-outline',
          title: 'اطلاعات ارجاع',
          description: 'شرایط پذیرش ارجاع، تعرفه، بیمه‌های طرف قرارداد و یادداشت شخصی.',
          state: 'ready',
        },
      ]}
    />
  );
}
