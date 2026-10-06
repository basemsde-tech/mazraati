/* Empty-state coaching: what to do next when a list/screen is empty. */

const COPY = {
  en: {
    customers: {
      title: "No customers yet",
      body: "Add a customer, then record a sale or payment against them.",
      cta: "Add customer",
    },
    suppliers: {
      title: "No suppliers yet",
      body: "Add a supplier so purchases and pay-supplier can link to them.",
      cta: "Add supplier",
    },
    animals: {
      title: "No animals yet",
      body: "Add animals (or groups) to track inventory and sales.",
      cta: "Add animal",
    },
    workers: {
      title: "No workers yet",
      body: "Add workers to track wages and pay-worker entries.",
      cta: "Add worker",
    },
    managers: {
      title: "No managers / funders yet",
      body: "Add a manager (same as funder) to track money in and out.",
      cta: "Add manager",
    },
    sales: {
      title: "No sales yet",
      body: "Open Cashier or New sale to record the first sale.",
      cta: "New sale",
    },
    payments: {
      title: "No payments yet",
      body: "Record a customer payment from Open bills or Payments.",
      cta: "Record payment",
    },
    expenses: {
      title: "No expenses yet",
      body: "Log feed, supplies, or other costs from Expenses.",
      cta: "Add expense",
    },
    invoices: {
      title: "No invoices yet",
      body: "Sales with invoice numbers appear here after you sell.",
      cta: "New sale",
    },
    history: {
      title: "Nothing here yet",
      body: "Activity shows up after you save sales, payments, or expenses.",
      cta: null,
    },
    backup: {
      title: "Backup & restore",
      body: "Export a JSON backup you can keep offline, or restore from a file.",
      cta: "Export backup",
    },
  },
  ar: {
    customers: {
      title: "لا زبائن بعد",
      body: "أضف زبونًا ثم سجّل بيعًا أو دفعة عليه.",
      cta: "إضافة زبون",
    },
    suppliers: {
      title: "لا مورّدين بعد",
      body: "أضف مورّدًا لربط المشتريات ودفع المورّد.",
      cta: "إضافة مورّد",
    },
    animals: {
      title: "لا حيوانات بعد",
      body: "أضف حيوانات (أو مجموعات) لتتبع المخزون والمبيعات.",
      cta: "إضافة حيوان",
    },
    workers: {
      title: "لا عمال بعد",
      body: "أضف عمالًا لتتبع الأجور ودفع العمال.",
      cta: "إضافة عامل",
    },
    managers: {
      title: "لا مديرين / ممولين بعد",
      body: "أضف مديرًا (نفس فكرة الممول) لتتبع المال دخولًا وخروجًا.",
      cta: "إضافة مدير",
    },
    sales: {
      title: "لا مبيعات بعد",
      body: "افتح الكاشير أو بيع جديد لتسجيل أول بيع.",
      cta: "بيع جديد",
    },
    payments: {
      title: "لا دفعات بعد",
      body: "سجّل دفعة زبون من الفواتير المفتوحة أو الدفعات.",
      cta: "تسجيل دفعة",
    },
    expenses: {
      title: "لا مصاريف بعد",
      body: "سجّل علفًا أو مستلزمات أو تكاليف أخرى من المصاريف.",
      cta: "إضافة مصروف",
    },
    invoices: {
      title: "لا فواتير بعد",
      body: "تظهر هنا المبيعات ذات أرقام الفواتير بعد البيع.",
      cta: "بيع جديد",
    },
    history: {
      title: "لا شيء هنا بعد",
      body: "يظهر النشاط بعد حفظ مبيعات أو دفعات أو مصاريف.",
      cta: null,
    },
    backup: {
      title: "نسخ احتياطي واستعادة",
      body: "صدّر نسخة JSON للاحتفاظ بها دون اتصال، أو استعد من ملف.",
      cta: "تصدير نسخة",
    },
  },
};

export function emptyCoach(kind, lang = "en") {
  const pack = COPY[lang === "ar" ? "ar" : "en"] || COPY.en;
  return pack[kind] || pack.history;
}
