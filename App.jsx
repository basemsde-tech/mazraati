import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  isFirebaseReady, startCompanyCloud, subscribeCompanyCloud, getCompanyCloud,
  companySignUp, companySignIn, companySignOut, createCompany, joinCompany,
  companyPullFarm, companyPushFarm, companySyncActive, companyWaitBound,
} from "./firebaseCloud.js";
import { StatusPill, DataList, DataCard, statusToneOf, statusRowClass, payStatusKind } from "./statusPill.jsx";
import {
  buildWalkthroughFarm, walkthroughCounts, walkthroughHoldActive, setWalkthroughHold,
  savePreWalkthrough, readPreWalkthrough, clearPreWalkthrough,
} from "./walkthroughFarm.mjs";
import {
  milkUnitOf, milkOtherUnit, parseMilkQty, milkToLiters, milkFromLiters,
  milkConvertQty, milkPack, milkRecordLiters, milkEqAmount,
} from "./milkUnits.mjs";
import {
  DEDUCTION_REIMBURSEMENT, isDeductionReimbursement, deductionCents, deductionMemo,
  settleAmounts, recordPaymentSplit,
} from "./settlement.mjs";

/* =====================================================================
   MAZRAATI · مزرعتي
   Multi-species farm app: cattle, goats, sheep and poultry.
   One shared farm database, many profiles, every record stamped.
   ===================================================================== */

/* Releases carry a season name as well as a number. */
const VERSION = { code: "2.9.15", ar: "الموسم الأول", en: "First Season", date: "2026-08" };
/* Shown once after each app update (Settings can reopen). Keep short — last session only. */
const WHATS_NEW = {
  "2.9.15": {
    ar: [
      "تسجيل الدفعة: مصروف الزبون من جيبه يُحسم من المستحق، والنقد المأخوذ منفصل — مثال: عليه 100$، صرف 50$ للمزرعة، تأخذ 50$ ويُقفَل الحساب",
      "الحسم يُسجَّل مصروف مزرعة وصرفًا في صندوق النقد",
    ],
    en: [
      "Record Payment: a customer’s pocket farm expense comes off what they owe, cash taken is separate — owe 100, spent 50 for the farm, take 50, account closes",
      "That deduction logs as a farm expense and as a cash-box cash-out",
    ],
  },
  "2.9.14": {
    ar: [
      "الحسومات تُقيَّد رصيدًا على إجمالي المبيعات لا كدفعة نقد منفصلة — الصافي = الإجمالي − الحسومات − المحصّل",
      "كل تعويض يظهر في كشف الحساب بالوصف، ويُجمَع في ملخص التسوية بلون أخضر",
    ],
    en: [
      "Deductions credit the sales balance instead of a separate cash payout — net due = gross − deductions − collected",
      "Each reimbursement shows on the account ledger with its description, rolled into a green settlement line",
    ],
  },
  "2.9.13": {
    ar: [
      "تعويض المصروف يُسجَّل مع قبض الدفعة ويُخصم من المبلغ المقبوض فقط — لا من الفاتورة — وبحد المبلغ",
      "صندوق النقد يُظهر التعويض صف مصروف أحمر بالوصف المُدخل، والنقد الداخل هو ما بقي بعد الحسم",
      "إنتاج الحليب بالكغ؛ الليتر معاينة فقط دون أزرار تبديل، واستخدام المزرعة يجمع بالكغ الصحيح",
    ],
    en: [
      "Expense reimbursements sit on Record Payment and come off the cash received — not the invoice — capped at the payment",
      "Cash Box shows each reimbursement as a red expense row with the name you typed; cash in is what remains",
      "Milk is entered in kg with litres as a preview only — no unit toggles — and farm-use totals add kg correctly",
    ],
  },
  "2.9.11": {
    ar: [
      "تعويض المصروف يُخصم من هذا البيع ثم من كامل حساب الزبون — بلا سقف أسبوعي أو نصف شهري، والزائد رصيد لصالحه",
      "صندوق النقد يحصي النقد الفعلي فقط؛ الحسم من الحساب يظهر كمقاصة بلا حركة درج",
      "إضافة الحليب تحوّل الكغ ↔ الليتر مباشرة (1 ل ≈ 1.03 كغ) وتُحفظ القيمتان",
      "اختيار التاريخ زر واضح وتقويم داخل التطبيق — سهل على الجهاز اللوحي",
    ],
    en: [
      "Expense reimbursements come off this sale then the whole customer account — no weekly cap, leftover becomes credit",
      "Cash Box counts physical cash only; account offsets show as non-cash so the drawer still reconciles",
      "Milk addition converts kg ↔ litres live (1 L ≈ 1.03 kg) and stores both values",
      "Dates open from a clear button with an in-app calendar — easier on tablet",
    ],
  },
  "2.9.10": {
    ar: [
      "في حركات الحساب: إجمالي الحساب يبقى المبيعات، والتعويضات تُخصم منه وتظهر في الحسومات",
      "التعويض يظهر في صندوق النقد كحسم من الزبون وصرف للمصروف — بلا تغيير في رصيد الصندوق",
    ],
    en: [
      "On account transactions: reimbursements come off the account total into Deductions",
      "Reimbursements show in Cash Box as deducted from the customer and paid for the expense — cash on hand does not change",
    ],
  },
  "2.9.9": {
    ar: [
      "تعويض مصروف الزبون يُخصم من مستحقاته ويُسجَّل مصروف مزرعة — بلا حركة صندوق",
      "استخدام المزرعة للحليب عاد زرًا ظاهرًا، مع أسباب مخصّصة تُحفظ وسجل للكميات",
    ],
    en: [
      "Customer expense reimbursements deduct from what they owe and post as farm expenses — no cash-box movement",
      "Farm-use milk is a visible button again, with saved custom reasons and a quantity history",
    ],
  },
  "2.9.8": {
    ar: [
      "اختيار الزبون والمورد أصبح قائمة بحث — البيع السريع والمصاريف دون صف طويل من الأسماء",
      "كل تاريخ يظهر بيوم الأسبوع ثم اليوم/الشهر/السنة — الأحد 23/08/2026",
    ],
    en: [
      "Customer and supplier pickers are a searchable list — Quick Sale and expenses no longer use a long row of names",
      "Every date shows the weekday then day/month/year — Sunday 23/08/2026",
    ],
  },
  "2.9.6": {
    ar: [
      "ابدأ أو سجّل الدخول ببريد الشركة — نفس الحساب على كل الأجهزة، وكل حركة باسم من سجّلها ووقتها",
    ],
    en: [
      "Get started or sign in with the company email — same account on every device, every change stamped with who and when",
    ],
  },
  "2.9.5": {
    ar: [
      "البيع والبيع السريع يفتحان صندوق تحصيل: دفع كامل أو دفعة جزئية بدل زر حفظ",
    ],
    en: [
      "Sale and Quick Sale open a cashier prompt: pay in full or take a partial instead of Save",
    ],
  },
  "2.9.4": {
    ar: [
      "البيع السريع فيه خيار زبون عابر لمرة واحدة — بلا اسم، ويُسجَّل في الصندوق والحساب",
    ],
    en: [
      "Quick Sale has a walk-in / one-off customer option — no name needed, still posted to Cash Box",
    ],
  },
  "2.9.3": {
    ar: [
      "إصلاح تعطل شاشة حساب الزبون بعد شريط البحث والتصفية",
    ],
    en: [
      "Fix customer-account crash after the unified search and filter bar",
    ],
  },
  "2.9.2": {
    ar: [
      "حفظ البيع يعمل عندما تكون الكمية والسعر صحيحين، ويعرض سبب المنع بدل التعطيل الصامت",
      "تبديل سعر الوحدة أو السعر الكامل في البيع والبيع السريع",
      "ترتيب الحركات حسب يوم المزرعة ثم وقت التسجيل دون خلط أوقات الجلسة",
      "استخدام المزرعة وأدلة الشاشة صارت داخل زر ؟",
      "شريط بحث وتصفية موحّد: بحث سريع مع قائمة تصفية وترتيب دون إرباك الشاشة",
    ],
    en: [
      "Sale save works when qty and price are valid, and shows why it is blocked instead of failing silently",
      "Toggle unit price or full price on Sale and Quick Sale",
      "Lists sort by farm day then time logged, without mixing session stamps",
      "Farm use and on-screen guides moved behind a ? toolkit",
      "One compact search and filter bar: keyword search plus a filter/sort sheet without crowding the screen",
    ],
  },
  "2.9.0": {
    ar: [
      "الحذف أصبح مرتبطًا عبر المبيعات والمصاريف وصندوق النقد حتى لا تبقى حركات يتيمة",
      "يمكن تعديل أو حذف الدفعات ومصاريف الصندوق والعلاج مع بقاء الحسابات متوافقة",
      "خصم على الفاتورة/كشف الحساب يُخصم من الصافي دون حركة نقدية",
      "بيع سريع: زبون ومنتج وكمية وادفع الآن أو لاحقًا مع تسجيل الوقت في صندوق النقد",
      "خلفية حجرية أهدأ للعمل لساعات دون وهج أبيض",
      "الوضع الداكن أوضح للنصوص حتى لا تختفي الكتابة على البطاقات",
      "سجل الإصدارات متاح من شاشة التحديث عند الحاجة",
    ],
    en: [
      "Deletion now clears linked sales, expense, and Cash Box rows so leftover movements do not remain",
      "Payments, cash movements, and medicine costs can be edited or deleted with ledgers kept in sync",
      "Invoice and statement discounts reduce net totals without creating a cash movement",
      "Quick Sale records a customer, product, qty, and pay-now or later — paid sales appear in Cash Box",
      "A softer stone background for long farm-office sessions without harsh white glare",
      "Dark-mode text is brighter so labels stay readable on dark cards",
      "Version history is available from the What's New sheet when you need it",
    ],
  },
  "2.8.9": {
    ar: [
      "تسجيل الحليب في الإنتاج أصبح حلبة صباح ومساء معًا في حفظ واحد وصف واحد في السجل",
    ],
    en: [
      "Production now records morning and evening milk together in one save and one log row",
    ],
  },
  "2.8.8": {
    ar: [
      "مزرعة تجريبية على هذا الجهاز فقط لشرح التطبيق للزبون — لا تُرفع إلى سحابة الشركة",
      "من الإعدادات: تحميل جولة العمل أو الخروج وإرجاع بياناتك",
    ],
    en: [
      "A walkthrough farm on this device only, to show a client how the app works — never uploaded to company cloud",
      "Settings: load the guided farm, or exit and restore your own data",
    ],
  },
  "2.8.7": {
    ar: [
      "شارات الحالة أصبحت حبوبًا هادئة بألوان واضحة دون تعبئة صلبة",
      "الجداول تتحول إلى بطاقات على الشاشات الضيقة والمطوية وتبقى جداول على الأجهزة اللوحية",
    ],
    en: [
      "Status badges are now soft, scannable pills without harsh solid fills",
      "Orders and ledgers stack as cards on narrow/folded screens and stay tabular on tablets",
    ],
  },
  "2.8.6": {
    ar: [
      "تعويضات مصاريف الزبون أصبحت بنودًا مستقلة تُخصم من صافي الفاتورة من دون حركة نقدية",
      "الفواتير وكشوف الحساب والتصدير تعرض الإجمالي والتعويضات والصافي بوضوح",
      "أنواع مصاريف التعويض تُحفظ تلقائيًا في قائمة قابلة لإعادة الاستخدام عند البيع لاحقًا",
    ],
    en: [
      "Customer expense reimbursements are now separate credits against an invoice with no cash movement",
      "Invoices, statements, and exports clearly show gross, reimbursements, and net totals",
      "Reimbursement expense types are saved automatically in a reusable sale dropdown",
    ],
  },
  "2.8.5": {
    ar: [
      "تعزيز المصاريف: توافق السجلات القديمة، ومنع تكرار دفع الفاتورة الدورية للدورة نفسها",
      "المصاريف والتحليلات تعرض حركات الدفع الفعلية فقط مع إبقاء الفواتير غير المدفوعة ضمن المستحقات",
    ],
    en: [
      "Expenses hardening: legacy-record compatibility and duplicate protection for each recurring-bill cycle",
      "Expense totals and insights show actual paid transactions only while unpaid bills remain in payables",
    ],
  },
  "2.8.4": {
    ar: [
      "سجل المصاريف يعرض حركات الدفع الفعلية فقط؛ دفعة المورد تُسجّل مرة واحدة عند دفعها",
    ],
    en: [
      "The Expense Register now shows actual paid transactions only; supplier payments are recorded once when paid",
    ],
  },
  "2.8.3": {
    ar: [
      "دليل حيوانات أبسط يركز على الهوية والحالة والبيانات الأساسية",
      "تخصيص جدول صندوق النقد: كثافة الصفوف وترتيب الأعمدة وعرضها محفوظة على هذا الجهاز",
    ],
    en: [
      "A simpler Animals directory focused on identity, condition, and essential reference data",
      "Customize the Cash Box table density, column order, and widths—saved on this device",
    ],
  },
  "2.8.2": {
    ar: [
      "دليل حيوانات أبسط يركز على الهوية والحالة والبيانات الأساسية",
    ],
    en: [
      "A simpler Animals directory focused on identity, condition, and essential reference data",
    ],
  },
  "2.8.1": {
    ar: [
      "صندوق نقد أذكى: رصيد واضح، سجل قابل للبحث، وتفصيل مختصر للتدفقات",
    ],
    en: [
      "A smarter Cash Box with a clear balance, searchable register, and compact flow breakdown",
    ],
  },
  "2.8.0": {
    ar: [
      "واجهة مصروفات أذكى وأهدأ تعرض المهم أولاً وتخفي التفاصيل الاختيارية",
    ],
    en: [
      "A calmer, smarter Expenses workspace that prioritizes essentials and tucks away optional detail",
    ],
  },
  "2.7.0": {
    ar: [
      "تنظيم صفحة المصروفات مع إمكانية إخفاء وإظهار الفواتير المستحقة",
      "اختيار الليتر أو الكيلوغرام عند تسجيل مبيعات الحليب",
    ],
    en: [
      "Reorganized Expenses with hide/show controls for due bills",
      "Choose liters or kilograms when recording milk sales",
    ],
  },
  "2.6.6": {
    ar: [
      "اختيار إدخال سعر الوحدة أو إجمالي الفاتورة عند تسجيل مشتريات المورد",
    ],
    en: [
      "Choose unit price or bill total when recording quantity-based supplier purchases",
    ],
  },
  "2.6.5": {
    ar: [
      "إنشاء وطباعة فاتورة شراء للمورد وكشف حساب كامل من تبويب الموردين",
    ],
    en: [
      "Generate and print supplier purchase invoices and full account statements from Suppliers",
    ],
  },
  "2.6.4": {
    ar: [
      "مشتريات الموردين تسجّل الكمية بوحدة مناسبة: كغ/كيس، ليتر، رأس، جرعة أو قطعة",
      "كميات العلف والتبن تظهر في حساب المورد وسجل المصاريف وتُجمع بالكيلوغرام",
    ],
    en: [
      "Supplier purchases track category-aware quantities: kg/bag, litre, head, dose or item",
      "Feed and hay quantities appear in supplier/expense records and aggregate in kilograms",
    ],
  },
  "2.6.3": {
    ar: [
      "تبديل العملة يحدّث كل المبالغ فورًا حسب سعر الصرف المحدد",
      "الحسابات والتقارير والطباعة تتبع عرض الدولار أو الليرة أو العملتين",
    ],
    en: [
      "Currency switching now updates all amounts immediately using the set exchange rate",
      "Accounts, reports and print views follow USD, LBP or both",
    ],
  },
  "2.6.2": {
    ar: [
      "إصلاح تعطل التطبيق عند فتح المزرعة بعد التحديث",
    ],
    en: [
      "Fixed a crash when the farm loads after the last update",
    ],
  },
  "2.6.1": {
    ar: [
      "إصلاح دفعات الموردين: التوزيع التلقائي يحدّث الفواتير · التعديل لا يمسح الرصيد الزائد",
      "مستحقات لوحة الموردين من الحسابات النشطة فقط",
    ],
    en: [
      "Supplier payments: auto-alloc updates bills · editing a bill no longer wipes overpay credit",
      "Supplier dashboard totals use active accounts only",
    ],
  },
  "2.6.0": {
    ar: [
      "منصة الموردين: شراء → علينا حتى الدفع · ادفع الآن أو جزئيًا أو لاحقًا",
      "لوحة مستحقات ومتأخر ومدفوع هذا الشهر · حساب المورد: فواتير مفتوحة ودفعات",
      "الدفع الزائد يُحفظ كرصيد دائن للمورد",
    ],
    en: [
      "Suppliers: purchase → we owe until paid · pay now, part, or later",
      "Dashboard: total owed, overdue, paid this month · account: open bills & payments",
      "Overpay is kept as supplier credit",
    ],
  },
  "2.5.9": {
    ar: [
      "تثبيت حفظ دفعات الموردين بدون تكرار عند التعديل",
    ],
    en: [
      "Supplier payment saves no longer risk duplicating on edit",
    ],
  },
  "2.5.8": {
    ar: [
      "مشتريات الموردين: المدفوع يخرج من الصندوق · المتبقي يظهر «علينا»",
      "تعديل فاتورة المورد يحدّث صندوق النقد والمستحقات بشكل صحيح",
    ],
    en: [
      "Supplier purchases: paid amount leaves the cash box · remainder shows as “we owe”",
      "Editing a supplier bill now keeps cash and payables in sync",
    ],
  },
  "2.5.7": {
    ar: [
      "إصلاح ألوان النصوص على الأزرار والبطاقات — عناوين المنتجات تظهر بوضوح",
    ],
    en: [
      "Fixed button and card text contrast — product titles are readable again",
    ],
  },
  "2.5.6": {
    ar: [
      "أيقونة التطبيق بشعار مزرعتي",
    ],
    en: [
      "App icon updated with the Mazraati logo",
    ],
  },
  "2.5.5": {
    ar: [
      "الدفع أوضح: قيمة الفاتورة · المدفوع · المتبقي — بدون خيار «دفعة جزئية»",
      "المدفوع يظهر في صندوق النقد تلقائيًا",
    ],
    en: [
      "Clearer pay split: bill · paid · remainder — no “part paid” option",
      "Paid amounts show in the cash box automatically",
    ],
  },
  "2.5.4": {
    ar: [
      "إصلاح تعطّل تحميل التطبيق بعد تحديث الإنتاج",
    ],
    en: [
      "Fix app crash on load after the production update",
    ],
  },
  "2.5.3": {
    ar: [
      "سجل الحليب المضاف أسفل شاشة الإنتاج — مع تصفية ومجموع",
    ],
    en: [
      "Milk stock log on the production page — with filters and totals",
    ],
  },
  "2.5.2": {
    ar: [
      "إنتاج أوضح — أضف حليب للمخزون بكمية ووحدة (ل / كغ)",
      "إزالة الحقول الزائدة من شاشة الإنتاج",
    ],
    en: [
      "Clearer production — add milk stock with amount and unit (L / kg)",
      "Removed clutter from the production screen",
    ],
  },
  "2.5.1": {
    ar: [
      "دفعات الموردين تظهر بوضوح في صندوق النقد",
      "تصفية قابلة للطي — أقل تشتيتًا",
      "ترتيب: تبديل لخيارين أو قائمة لأكثر",
    ],
    en: [
      "Supplier payments clearer in the cash box",
      "Collapsible filters — less clutter",
      "Sort: toggle for two options, dropdown for more",
    ],
  },
  "2.5.0": {
    ar: [
      "حسابات الموردين — فواتير العلف والدواء وغيرها مع رصيد مستحق ودفعات",
      "معاينة المستندات قبل الطباعة",
      "صندوق النقد ومزامنة الشركة",
    ],
    en: [
      "Supplier accounts — feed, medicine and other bills with balance due and payments",
      "In-app document preview before printing",
      "Cash box and company sync",
    ],
  },
};
/* Bump when onboarding must re-prompt existing farms for company details. */
const SETUP_VERSION = "1.6.4";

const SHARED_KEY = "mazraati-farm-v1";
const DEVICE_KEY = "mazraati-device-v1";
const CLOUD_KEY = "mazraati-cloud-v1";
/* Keys used before the app was renamed; read once, then carried across. */
const LEGACY = { shared: "alreif-farm-v3", device: "alreif-device-v3", cloud: "alreif-cloud-v1" };

const CASH_COLUMNS = [
  { key: "date", label: "cashEntryDate", min: 100, max: 220, width: 125 },
  { key: "ref", label: "cashRef", min: 100, max: 260, width: 135 },
  { key: "statement", label: "cashStatement", min: 180, max: 640, width: 340 },
  { key: "in", label: "cashIn", min: 120, max: 300, width: 155, align: "end" },
  { key: "out", label: "cashOut", min: 120, max: 300, width: 155, align: "end" },
  { key: "balance", label: "cashBalance", min: 130, max: 320, width: 170, align: "end" },
];
const CASH_COLUMN_KEYS = CASH_COLUMNS.map((c) => c.key);
const CASH_DENSITIES = ["compact", "comfortable", "spacious"];
function sanitizeCashTablePrefs(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const order = [];
  if (Array.isArray(source.order)) source.order.forEach((key) => {
    if (CASH_COLUMN_KEYS.includes(key) && !seen.has(key)) { seen.add(key); order.push(key); }
  });
  CASH_COLUMN_KEYS.forEach((key) => { if (!seen.has(key)) order.push(key); });
  const widths = {};
  CASH_COLUMNS.forEach((col) => {
    const value = Number(source.widths && source.widths[col.key]);
    widths[col.key] = Number.isFinite(value)
      ? Math.min(col.max, Math.max(col.min, Math.round(value)))
      : col.width;
  });
  return {
    density: CASH_DENSITIES.includes(source.density) ? source.density : "comfortable",
    order,
    widths,
  };
}

/* ------------------------------ palette ------------------------------ */
/* Warm stone light for long farm-office hours — off-white, not glare-white. */
const THEMES = {
  light: {
    ink: "#1C1917", inkSoft: "#534E47", line: "#D4CDC3", rule: "#B8AFA3",
    field: "#1B6B5A", fieldDeep: "#0C3A31", tag: "#C9A227",
    bg: "#E8E4DC", card: "#F6F3EE", paper: "#EFEBE4",
    green: "#1F8F72", amber: "#C4842D", red: "#B53A4A", blue: "#2A5F6E",
    glow: "rgba(27,107,90,.08)", glowGold: "rgba(201,162,39,.07)",
    shadow: "rgba(40,32,24,.07)", overlay: "rgba(28,25,23,.45)",
  },
  dark: {
    ink: "#F3F7F4", inkSoft: "#C8D5CE", line: "#2C3F38", rule: "#3A5249",
    field: "#3FBE9A", fieldDeep: "#0E2A24", tag: "#D4B03A",
    bg: "#0F1613", card: "#1A2420", paper: "#151E1A",
    green: "#3CB892", amber: "#D49A3C", red: "#E05A6A", blue: "#4A8A9A",
    glow: "rgba(47,168,136,.14)", glowGold: "rgba(212,176,58,.08)",
    shadow: "rgba(0,0,0,.35)", overlay: "rgba(0,0,0,.62)",
  },
};
const C = { ...THEMES.light };

const AVATAR_COLORS = ["#1B6B5A", "#B53A4A", "#2A5F6E", "#C4842D", "#3D6B5A", "#8A5A2B", "#1F5673", "#5C6B2D"];
const AVATARS = ["🧔🏽", "🧑🏽‍🌾", "👷🏽", "👩🏽", "🧑🏽‍⚕️", "👨🏽‍🦱", "👩🏽‍🌾", "🧑🏽"];

/* ============================ SPECIES ============================
   Everything species-specific lives here: what it is called, how it is
   counted, what it produces, how it is logged and what a record holds. */
const SPECIES = {
  cow: {
    icon: "🐄", color: "#1B6B5A", mode: "individual", produce: "milk",
    ar: "أبقار", arOne: "بقرة", en: "Cattle", enOne: "Cow",
    idAr: "رقم الأذن", idEn: "Ear tag no.",
    /* 283 days average (normal range 279–287); dried off 60 days before calving;
       heat returns every ~21 days if she did not hold; vet check reliable 30–45 days. */
    gestation: 283, gestMin: 279, gestMax: 287, dryOff: 60, cycle: 21, checkFrom: 30, checkTo: 45,
    weaning: 90, typical: 20, weight: true,
    breeds: [["holstein", "هولشتاين", "Holstein"], ["friesian", "فريزيان", "Friesian"],
      ["jersey", "جيرسي", "Jersey"], ["brown", "براون سويس", "Brown Swiss"],
      ["simmental", "سيمنتال", "Simmental"], ["montbeliarde", "مونبيليارد", "Montbéliarde"],
      ["ayrshire", "أيرشاير", "Ayrshire"], ["guernsey", "غيرنزي", "Guernsey"],
      ["angus", "أنغوس", "Angus"], ["shami", "شامي", "Damascus"],
      ["jawlani", "جولاني", "Jawlani"], ["baladi", "بلدي", "Baladi"],
      ["cross", "خليط", "Crossbreed"], ["other", "أخرى — اكتب الاسم", "Other — type the name"]],
    statuses: ["healthy", "served", "pregnant", "lactating", "dry", "sick"],
    youngAr: "عجل", youngEn: "Calf",
  },
  goat: {
    icon: "🐐", color: "#B53A4A", mode: "individual", produce: "milk",
    ar: "ماعز", arOne: "عنزة", en: "Goats", enOne: "Goat",
    idAr: "رقم الأذن", idEn: "Ear tag no.",
    /* ~150 days; dried off 40–60 days before kidding. */
    gestation: 150, gestMin: 145, gestMax: 155, dryOff: 50, cycle: 21, checkFrom: 30, checkTo: 45,
    weaning: 60, typical: 3, weight: true,
    breeds: [["shami", "شامي", "Shami / Damascus"], ["baladi", "بلدي", "Baladi"],
      ["alpine", "ألبين", "Alpine"], ["saanen", "سانين", "Saanen"],
      ["toggenburg", "توجنبرج", "Toggenburg"], ["nubian", "أنجلو نوبيان", "Anglo-Nubian"],
      ["boer", "بور", "Boer"], ["angora", "أنغورا", "Angora"], ["cyprus", "قبرصي", "Cyprus"],
      ["cross", "خليط", "Crossbreed"], ["other", "أخرى — اكتب الاسم", "Other — type the name"]],
    statuses: ["healthy", "served", "pregnant", "lactating", "dry", "sick"],
    youngAr: "جدي", youngEn: "Kid",
  },
  sheep: {
    icon: "🐑", color: "#2A5F6E", mode: "individual", produce: "milk",
    ar: "أغنام", arOne: "نعجة", en: "Sheep", enOne: "Ewe",
    idAr: "رقم الأذن", idEn: "Ear tag no.",
    /* ~152 days; dried off 30–60 days before lambing; heat returns every ~17 days. */
    gestation: 152, gestMin: 145, gestMax: 155, dryOff: 45, cycle: 17, checkFrom: 30, checkTo: 45,
    weaning: 75, typical: 1.5, weight: true, wool: true,
    breeds: [["awassi", "عواسي", "Awassi"], ["baladi", "بلدي", "Baladi"],
      ["naimi", "نعيمي", "Naimi"], ["najdi", "نجدي", "Najdi"], ["barki", "برقي", "Barki"],
      ["romanov", "رومانوف", "Romanov"], ["suffolk", "سافولك", "Suffolk"],
      ["chios", "خيوس", "Chios"], ["cross", "خليط", "Crossbreed"],
      ["other", "أخرى — اكتب الاسم", "Other — type the name"]],
    statuses: ["healthy", "served", "pregnant", "lactating", "dry", "sick"],
    youngAr: "خروف", youngEn: "Lamb",
  },
  chicken: {
    icon: "🐔", color: "#C4842D", mode: "flock", produce: "eggs",
    ar: "دواجن", arOne: "قطيع دجاج", en: "Poultry", enOne: "Flock",
    idAr: "اسم القطيع", idEn: "Flock name",
    gestation: 21, typical: 0.8, weight: false,
    breeds: [["layer", "بيّاض", "Layer"], ["lohmann", "لوهمان", "Lohmann"], ["isa", "إيزا براون", "ISA Brown"],
      ["baladi", "بلدي", "Baladi"], ["fayoumi", "فيومي", "Fayoumi"], ["sasso", "ساسو", "Sasso"],
      ["broiler", "لاحم", "Broiler"], ["cobb", "كوب", "Cobb"], ["ross", "روس", "Ross"],
      ["turkey", "رومي", "Turkey"], ["cross", "خليط", "Crossbreed"],
      ["other", "أخرى — اكتب الاسم", "Other — type the name"]],
    statuses: ["laying", "growing", "sick", "stopped"],
    youngAr: "كتكوت", youngEn: "Chick",
  },
};
const SP_KEYS = ["cow", "goat", "sheep", "chicken"];
const spOf = (a) => SPECIES[a && a.species] || SPECIES.cow;
const isFlock = (a) => spOf(a).mode === "flock";
const producesMilk = (a) => spOf(a).produce === "milk";
const producesEggs = (a) => spOf(a).produce === "eggs";

const STATUS = {
  healthy: { c: "#1F8F72", ar: "سليمة", en: "Healthy" },
  lactating: { c: "#1B6B5A", ar: "حلوب", en: "Milking" },
  served: { c: "#8A5A2B", ar: "ملقّحة", en: "Served" },
  pregnant: { c: "#C4842D", ar: "عشار", en: "Pregnant" },
  dry: { c: "#5C7268", ar: "جافة", en: "Dry" },
  sick: { c: "#B53A4A", ar: "مريضة", en: "Sick" },
  laying: { c: "#1F8F72", ar: "بيّاض", en: "Laying" },
  growing: { c: "#C4842D", ar: "تربية", en: "Growing" },
  stopped: { c: "#5C7268", ar: "متوقف", en: "Stopped" },
};
const MED = {
  vaccine: { i: "💉", ar: "لقاح", en: "Vaccine" },
  antibiotic: { i: "💊", ar: "مضاد حيوي", en: "Antibiotic" },
  vitamin: { i: "🧪", ar: "فيتامينات", en: "Vitamins" },
  mineral: { i: "🧂", ar: "أملاح ومعادن", en: "Minerals" },
  parasite: { i: "🪱", ar: "مضاد ديدان", en: "Deworming" },
  mastitis: { i: "🥛", ar: "علاج التهاب الضرع", en: "Mastitis treatment" },
  painkiller: { i: "🌡️", ar: "خافض حرارة ومسكّن", en: "Painkiller" },
  treatment: { i: "🩹", ar: "علاج آخر", en: "Other treatment" },
};
/* Common vitamin and mineral products, offered as suggestions rather than a fixed list. */
const VITAMINS = [
  ["ad3e", "AD3E", "AD3E"], ["b complex", "فيتامين B مركّب", "Vitamin B complex"],
  ["calcium", "كالسيوم", "Calcium"], ["selenium", "سيلينيوم + فيتامين E", "Selenium + vitamin E"],
  ["multi", "فيتامينات متعددة", "Multivitamin"], ["mineral", "أملاح معدنية", "Mineral mix"],
];
const ROLES = [
  ["owner", "صاحب المزرعة", "Farm owner"], ["milker", "حلّاب", "Milker"],
  ["worker", "عامل", "Farm worker"], ["book", "محاسب", "Bookkeeper"], ["health", "صحة القطيع", "Herd health"],
];
const FEEDS = [
  ["hay", "🌾"], ["concentrate", "🥣"], ["barley", "🌿"], ["corn", "🌽"], ["bran", "🫓"], ["silage", "🍃"], ["otherFeed", "📦"],
];
const BAG_KG = 50;
/* Optional stock quantity metadata for supplier purchases. Money remains the AP total. */
const PURCHASE_QTY = {
  feed: { units: ["kg", "bag"], defaultUnit: "kg", step: { kg: 25, bag: 1 }, feed: true },
  hay: { units: ["kg", "bag"], defaultUnit: "kg", step: { kg: 25, bag: 1 } },
  fuel: { units: ["L"], defaultUnit: "L", step: { L: 10 } },
  water: { units: ["L"], defaultUnit: "L", step: { L: 10 } },
  livestock: { units: ["head"], defaultUnit: "head", step: { head: 1 } },
  vet: { units: ["dose"], defaultUnit: "dose", step: { dose: 1 } },
  medicine: { units: ["dose"], defaultUnit: "dose", step: { dose: 1 } },
  parts: { units: ["item"], defaultUnit: "item", step: { item: 1 } },
  supplies: { units: ["item"], defaultUnit: "item", step: { item: 1 } },
  other: { units: ["item"], defaultUnit: "item", step: { item: 1 } },
};
const purchaseQtyMeta = (cat) => PURCHASE_QTY[cat] || null;
const purchaseUnitLabel = (unit, t) => unit === "bag" ? t("bag")
  : unit === "kg" ? t("kgU") : unit === "L" ? t("L")
    : unit === "head" ? t("headUnit") : unit === "dose" ? t("doseUnit") : t("itemUnit");
const expenseQtyLabel = (e, t) => !(e && e.qty > 0) ? ""
  : `${n1(e.qty)} ${purchaseUnitLabel(e.unit || "item", t)}`;
/* Farm money-out: groups for the picker, flat EXPENSES for labels / sums.
   Legacy keys (labour, other, feed, …) stay so old entries keep working. */
const EXPENSE_GROUPS = [
  ["feedLive", "🐄", "أعلاف وماشية", "Feed & Livestock", "#A4243B"],
  ["machine", "🚜", "آليات ومعدات", "Machinery & Equipment", "#8A5A2B"],
  ["property", "🏠", "عقار ومرافق", "Property & Utilities", "#B8791F"],
  ["office", "📁", "مكتب وإدارة", "Office & Admin", "#2C3E70"],
  ["finance", "💳", "التزامات مالية", "Financial Obligations", "#6B4A7A"],
  ["otherGrp", "📦", "أخرى", "Other", "#6C7488"],
];
const EXPENSES = [
  ["feed", "🌾", "علف", "Feed", "#A4243B", "feedLive"],
  ["hay", "🌿", "تبن / قش", "Hay", "#8B5A2B", "feedLive"],
  ["vet", "🩺", "بيطرة", "Vet bills", "#C4626F", "feedLive"],
  ["medicine", "💊", "أدوية وعلاج", "Medicines", "#D9A0A8", "feedLive"],
  ["livestock", "🚚", "شراء حيوانات", "Livestock purchase", "#6B4A7A", "feedLive"],
  ["fuel", "⛽", "وقود", "Fuel", "#8A5A2B", "machine"],
  ["repairs", "🔧", "إصلاحات", "Repairs", "#7A5312", "machine"],
  ["service", "🛠️", "صيانة دورية", "Servicing", "#9A6B3A", "machine"],
  ["parts", "⚙️", "قطع غيار", "Parts", "#6C5A40", "machine"],
  ["electricity", "⚡", "كهرباء", "Electricity", "#B8791F", "property"],
  ["water", "💧", "ماء", "Water", "#3A7CA5", "property"],
  ["fencing", "🪵", "أسوار", "Fencing", "#6B5344", "property"],
  ["supplies", "🧰", "مستلزمات", "Supplies", "#5C6B5A", "property"],
  ["license", "📜", "تراخيص", "Licensing", "#2C3E70", "office"],
  ["insurance", "🛡️", "تأمين", "Insurance", "#3D4F7A", "office"],
  ["software", "💻", "برامج", "Software", "#4A5F8A", "office"],
  ["stationery", "📎", "قرطاسية", "Stationery", "#6C7488", "office"],
  ["loan", "🏦", "قروض", "Loans", "#6B4A7A", "finance"],
  ["rent", "🔑", "إيجار", "Rent", "#8A4A6A", "finance"],
  ["vendorPay", "🤝", "دفعات موردين", "Vendor payments", "#5A4A6B", "finance"],
  ["labour", "👷", "عمال وأجور", "Labour", "#C4626F", "otherGrp"],
  ["other", "📦", "مصاريف أخرى", "Other", "#6C7488", "otherGrp"],
];
const expOf = (k) => EXPENSES.find((x) => x[0] === k) || EXPENSES[EXPENSES.length - 1];
const expGroupOf = (k) => expOf(k)[5] || "otherGrp";
const groupMeta = (gk) => EXPENSE_GROUPS.find((g) => g[0] === gk) || EXPENSE_GROUPS[EXPENSE_GROUPS.length - 1];
const expensesInGroup = (gk) => EXPENSES.filter((e) => e[5] === gk);
const catMeta = (k, custom) => {
  const c = (custom || []).find((x) => x.key === k);
  if (c) return { custom: c, icon: c.icon || "📦", color: c.color || "#6C7488", group: c.group || "otherGrp" };
  const e = expOf(k);
  return { icon: e[1], ar: e[2], en: e[3], color: e[4], group: e[5] };
};
const catLabel = (k, lang, custom) => {
  const m = catMeta(k, custom);
  if (m.custom) return lang === "ar" ? m.custom.ar : m.custom.en || m.custom.ar;
  return lang === "ar" ? m.ar : m.en;
};
const catIcon = (k, custom) => catMeta(k, custom).icon;
const catColor = (k, custom) => catMeta(k, custom).color;
/* Cent-based money — avoid float drift on pay / due / status. */
const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);
const isOwing = (n) => toCents(n) > 0;
const rememberNames = (existing, extras, max = 100) => {
  const saved = [];
  const seen = new Set();
  [...(existing || []), ...(extras || [])].forEach((name) => {
    const clean = String(name || "").trim();
    const key = clean.toLocaleLowerCase();
    if (clean && !seen.has(key) && saved.length < max) {
      seen.add(key);
      saved.push(clean);
    }
  });
  return saved;
};
const namesChanged = (a, b) => (a || []).length !== (b || []).length
  || (a || []).some((name, i) => name !== (b || [])[i]);
const isCustomerPaidExpense = (e) => !!(e && e.type === "expense" && (e.paidBy === "customer" || e.saleReimburseId));
const expenseCatFromName = (name, custom) => {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "other";
  const built = EXPENSES.find((row) => row[0] === n || String(row[2]).toLowerCase() === n
    || String(row[3]).toLowerCase() === n);
  if (built) return built[0];
  const own = (custom || []).find((x) => x.key === n
    || String(x.ar || "").toLowerCase() === n || String(x.en || "").toLowerCase() === n);
  return own ? own.key : "other";
};
const milkUseLabel = (e, t) => {
  const reason = (e && e.reason) || "";
  if (reason === "home") return t("milkUseHome");
  if (reason === "calves") return t("milkUseCalves");
  if (reason === "waste") return t("milkUseWaste");
  const label = (e && e.reasonLabel) || (reason.startsWith("custom:") ? reason.slice(7) : "");
  return label || t("milkUseOther");
};
const moneyStatus = (billC, paidC) => {
  const dueC = Math.max(0, billC - paidC);
  if (dueC <= 0) return "paid";
  if (paidC <= 0) return "unpaid";
  return "partial";
};
/* Cash that left the box for a non-supplier expense. Supplier bills use supplierPay. */
const expenseCounted = (e) => {
  if (e.supplierId || isCustomerPaidExpense(e)) return 0;
  const st = e.payStatus || "paid";
  if (st === "unpaid") return 0;
  if (st === "partial") return fromCents(Math.min(toCents(e.amount), toCents(e.paidAmount)));
  return fromCents(toCents(e.amount));
};
/* Full purchase cost for P&L (accrual) — owed or paid. */
const expenseAccrued = (e) => fromCents(toCents(e.amount));
/* Paid portion that should become a supplierPay cash-out. */
const supplierCashOut = (e) => {
  if (!e || !e.supplierId) return 0;
  const st = e.payStatus || "paid";
  if (st === "unpaid") return 0;
  if (st === "partial") return fromCents(Math.min(toCents(e.amount), toCents(e.paidAmount)));
  return fromCents(toCents(e.amount));
};
/* Older paid supplier bills may lack a supplierPay row — imply one for ledgers/cash. */
function withImpliedSupplierPays(entries) {
  const list = entries || [];
  const linked = new Set(list.filter((e) => e.type === "supplierPay" && e.expenseId).map((e) => e.expenseId));
  const implied = [];
  list.forEach((e) => {
    if (e.type !== "expense" || !e.supplierId || linked.has(e.id)) return;
    const amount = supplierCashOut(e);
    if (!(amount > 0.0001)) return;
    implied.push({
      type: "supplierPay", id: `implied-${e.id}`, supplierId: e.supplierId, amount,
      expenseId: e.id, at: e.at, vendor: e.vendor || "", method: "cash",
      note: e.note || "", implied: true,
    });
  });
  return implied.length ? [...implied, ...list] : list;
}

function impliedExpenseId(id) {
  const s = String(id || "");
  return s.startsWith("implied-") ? s.slice("implied-".length) : null;
}
/* Collect the ledger rows that must leave together so Cash Box, Expenses,
   Sales and supplier tabs do not keep a half-deleted movement. */
function relatedEntryIds(list, seedId) {
  const src = list || [];
  const impliedOf = impliedExpenseId(seedId);
  const seed = src.find((e) => e.id === seedId) || (impliedOf ? src.find((e) => e.id === impliedOf) : null);
  const ids = new Set();
  if (seedId) ids.add(seedId);
  if (!seed || !seed.id) return ids;
  ids.add(seed.id);
  if (seed.type === "sale") {
    src.forEach((e) => { if (e.id && e.saleId === seed.id) ids.add(e.id); });
  } else if (seed.type === "saleReimburse") {
    src.forEach((e) => { if (e.id && e.saleReimburseId === seed.id) ids.add(e.id); });
  } else if (seed.type === "payment") {
    src.forEach((e) => { if (e.id && e.paymentId === seed.id) ids.add(e.id); });
  } else if (seed.type === "expense") {
    src.forEach((e) => { if (e.id && e.expenseId === seed.id) ids.add(e.id); });
    if (seed.saleReimburseId) ids.add(seed.saleReimburseId);
  } else if (seed.type === "milkBulk") {
    const d = dayKey(seed.at);
    const sp = seed.species || "";
    src.forEach((e) => {
      if (e.type === "milkBulk" && e.id && dayKey(e.at) === d && (e.species || "") === sp) ids.add(e.id);
    });
  } else if (seed.type === "milk") {
    const d = dayKey(seed.at);
    src.forEach((e) => {
      if (e.type === "milk" && e.id && e.animalId === seed.animalId && dayKey(e.at) === d) ids.add(e.id);
    });
  }
  return ids;
}
function purgeRelatedEntries(list, seedId) {
  const src = list || [];
  const impliedOf = impliedExpenseId(seedId);
  const seed = src.find((e) => e.id === seedId) || (impliedOf ? src.find((e) => e.id === impliedOf) : null);
  /* Phantom cash-out for a paid supplier bill with no supplierPay row:
     unpay the bill instead of leaving a cash line that cannot be deleted. */
  if (impliedOf && (!seed || seed.type === "expense")) {
    return src
      .filter((e) => !(e.type === "supplierPay" && e.expenseId === impliedOf) && e.id !== impliedOf)
      .map((e) => (e.id === impliedOf
        ? { ...e, paidAmount: 0, payStatus: "unpaid", dueDate: e.dueDate || dayKey(e.at) }
        : e));
  }
  const ids = relatedEntryIds(src, seedId);
  let next = src.filter((e) => e.id && !ids.has(e.id));
  const remaining = new Set(next.map((e) => e.id));
  next = next.filter((e) => {
    if (e.saleId && !remaining.has(e.saleId) && (e.type === "payment" || e.type === "saleReimburse" || isCustomerPaidExpense(e))) return false;
    if (e.saleReimburseId && !remaining.has(e.saleReimburseId)) return false;
    if (e.expenseId && !remaining.has(e.expenseId) && e.type === "supplierPay") return false;
    return true;
  });
  if (seed && seed.type === "supplierPay" && seed.expenseId) {
    const bill = next.find((e) => e.id === seed.expenseId && e.type === "expense");
    if (bill) {
      const paidC = next.filter((e) => e.type === "supplierPay" && e.expenseId === bill.id)
        .reduce((a, p) => a + toCents(p.amount), 0);
      const billC = toCents(bill.amount);
      const st = moneyStatus(billC, paidC);
      next = next.map((e) => (e.id === bill.id
        ? { ...e, paidAmount: fromCents(Math.min(billC, paidC)), payStatus: st,
          dueDate: st === "paid" ? "" : (e.dueDate || dayKey(e.at)) }
        : e));
    }
  }
  return next;
}
function deleteWarnFor(e, t, seedId) {
  if (impliedExpenseId(seedId) && (!e || e.type === "expense")) return t("deletePayWarn");
  if (!e) return t("deleteLinkedWarn");
  if (e.type === "sale") return t("deleteWarn");
  if (e.type === "expense") return t("deleteExpenseWarn");
  if (e.type === "supplierPay") return t("deletePayWarn");
  if (e.type === "payment") return t("deletePaymentWarn");
  if (e.type === "med") return t("deleteMedWarn");
  return t("deleteLinkedWarn");
}

const PRODUCTS = [
  ["milk", "🥛", "حليب", "Milk", "ليتر", "L"],
  ["labneh", "🥣", "لبنة", "Labneh", "كغ", "kg"],
  ["cheese", "🧀", "جبنة", "Cheese", "كغ", "kg"],
  ["eggs", "🥚", "بيض", "Eggs", "بيضة", "eggs"],
  ["animal", "🐄", "حيوان", "Livestock", "رأس", "head"],
  ["other", "📦", "أخرى", "Other", "وحدة", "unit"],
];
/* Looked up by name, not by index — the catalogue is meant to grow. */
const PROD_MILK = PRODUCTS[0];
const PROD_OTHER = PRODUCTS[PRODUCTS.length - 1];

/* ------------------------------ strings ------------------------------ */
const T = {
  ar: {
    dir: "rtl", brand: "مزرعتي", sub: "نظام إدارة المزارع",
    home: "الرئيسية", overview: "نظرة عامة", cashBox: "صندوق النقد", cashBoxSub: "سجل قبض وصرف مع رصيد جارٍ",
    cashIn: "قبض", cashOut: "صرف", cashBalance: "الرصيد", cashValue: "القيمة",
    cashRef: "المرجع", cashStatement: "البيان", cashEntryDate: "تاريخ القيد",
    cashReceivedFrom: "قبض من", cashPaidFor: "صرف", cashOpening: "رصيد افتتاحي",
    cashFilterAll: "الكل", cashFilterIn: "قبض فقط", cashFilterOut: "صرف فقط",
    cashEmpty: "لا حركات نقدية في هذه الفترة.", cashTotals: "المجموع",
    cashExport: "تصدير Excel", cashAccount: "الصندوق / المزرعة",
    cashOverview: "ملخص الصندوق", cashClosing: "الرصيد الختامي", cashNet: "صافي الحركة",
    cashRegister: "سجل الصندوق", cashSearch: "ابحث في البيان أو المرجع…",
    cashViewTotals: "إجمالي العرض", cashFullPeriod: "الفترة كاملة", cashFilteredHint: "الرصيد الجاري مخفي لأن العرض مفلتر",
    cashShowRef: "إظهار المرجع", cashHideRef: "إخفاء المرجع",
    cashShowFlow: "إظهار تفصيل التدفقات", cashHideFlow: "إخفاء تفصيل التدفقات",
    cashFlowBreakdown: "تفصيل التدفقات", cashFlowSource: "المصدر / البند",
    cashNoResults: "لا توجد حركات تطابق هذا العرض.", cashNoResultsSub: "جرّب مسح البحث أو تغيير نوع الحركة.",
    cashExportComplete: "تصدير الفترة كاملة", cashOpenSource: "فتح القيد",
    cashCustomerReceipts: "قبض الزبائن", cashOtherOut: "مصروفات أخرى",
    cashDeductedFrom: "حُسم من", cashDeductPaid: "حسم / صرف",
    cashTableSettings: "تخصيص الجدول", cashTableSettingsHint: "اسحب الأعمدة لترتيبها واضبط عرض كل عمود ظاهر.",
    cashDensity: "كثافة الصفوف", cashDensityCompact: "مضغوط", cashDensityComfortable: "مريح", cashDensitySpacious: "واسع",
    cashColumnWidth: "عرض العمود", cashDragColumn: "اسحب لتغيير ترتيب العمود",
    cashResizeColumn: "غيّر عرض العمود", cashMoveEarlier: "حرّك إلى السابق", cashMoveLater: "حرّك إلى التالي",
    cashResetTable: "استعادة الترتيب الافتراضي",
    animals: "الحيوانات", entry: "الإنتاج", sales: "المبيعات", suppliers: "الموردون", reports: "التقارير", settings: "الإعدادات",
    farmWork: "عمل المزرعة", officeWork: "عمل المكتب",
    obligations: "الالتزامات", addObligation: "إضافة فاتورة دورية", obligationTypes: "نوع الالتزام",
    contract: "عقد", recurringBill: "فاتورة دورية", rent: "إيجار",
    partyName: "الطرف / الجهة", nextDue: "تاريخ الاستحقاق", frequency: "التكرار",
    freqOnce: "مرة واحدة", freqWeekly: "أسبوعي", freqMonthly: "شهري", freqYearly: "سنوي",
    markBillPaid: "تسجيل كمدفوع", dueBills: "فواتير مستحقة", duePayments: "مستحقات الزبائن",
    expenses: "المصاريف", moneyOut: "المصاريف", moneySpent: "المصروف هذا الشهر", moneySpentPeriod: "المصروف",
    billsDue: "فواتير مستحقة", topCategory: "أكبر بند", farmNet: "صافي المزرعة",
    seeCashBox: "الصرف المدفوع → صندوق النقد", expenseRegister: "سجل المصاريف", paidExpensesOnly: "المصاريف المدفوعة فقط", openBills: "غير المسددة",
    stillToPay: "لم تُدفع بعد", paidToday: "مدفوعة", expPaid: "مدفوعة", expPartial: "متبقي", expUnpaid: "غير مدفوعة",
    noPaidExpenses: "لا توجد مصاريف مدفوعة في هذه الفترة", noPaidExpensesSub: "الفواتير غير المدفوعة تبقى في حساب المورد أو قسم الاستحقاقات.",
    billTotal: "قيمة الفاتورة", remainder: "المتبقي", payAll: "دفع الكل", payNone: "بدون دفع",
    supplierPayHint: "المدفوع يخرج من صندوق النقد · المتبقي يبقى «علينا» للمورد",
    supplierCashOutHint: "سيُسجَّل صرفًا في صندوق النقد",
    supplierOweHint: "سيظهر كمبلغ علينا لهذا المورد",
    paySplitHint: "أدخل المدفوع — المتبقي يُحسب تلقائيًا ويظهر في صندوق النقد.",
    higherThanUsual: "أعلى من المعتاد", thisWeek: "هذا الأسبوع", thisMonth: "هذا الشهر", lastMonth: "الشهر الماضي",
    customRange: "فترة مخصصة", searchExpenses: "ابحث عن فاتورة أو مورد…", vendor: "المورد / الجهة",
    addSupplier: "إضافة مورد", supplierName: "اسم المورد", supplierNote: "ملاحظة",
    supplierCreated: "تم إنشاء المورد", noSuppliers: "لا موردين بعد.",
    noSuppliersSub: "أضف مورّد علف أو دواء أو خدمات لتتبع ما تدين به.",
    openSupplier: "فتح الحساب", paySupplier: "دفع للمورد", logSupplierBill: "تسجيل شراء",
    supplierBuy: "شراء من المورد", supplierBuySub: "يسجَّل كفاتورة علينا حتى تدفع",
    supplierWhatBought: "ماذا اشتريت؟", supplierOpenBills: "فواتير مفتوحة",
    supplierNoBills: "لا فواتير بعد — سجّل شراءً من هذا المورد",
    supplierNoOpen: "لا فواتير غير مسددة", supplierPayThis: "ادفع",
    supplierActivity: "كل الحركات", supplierBillsTab: "المستحقات", supplierPaysTab: "الدفعات",
    supplierLeadOwe: "المبلغ المتبقي علينا لهذا المورد",
    supplierLeadClear: "لا مستحقات — الحساب مسدّد",
    payBillNow: "ادفع هذه الفاتورة",
    supplierOutstanding: "إجمالي علينا", supplierOverdueKpi: "متأخر",
    supplierPaidMonth: "مدفوع هذا الشهر", lastActivity: "آخر حركة",
    statusClear: "مسدد", statusOwing: "علينا", statusOverdue: "متأخر",
    payLater: "ادفع لاحقًا", payNowMode: "ادفع الآن", payPartialMode: "دفعة جزئية",
    supplierCreditHint: "أي مبلغ فوق المستحق يُحفظ كرصيد دائن للمورد",
    supplierCredit: "رصيد دائن",
    saving: "جاري الحفظ…",
    totalBought: "إجمالي المشتريات", paidToSupplier: "المدفوع للمورد", weOwe: "علينا",
    supplierBills: "فواتير المورد", supplierPays: "دفعات المورد",
    pickSupplier: "اختر المورد", newSupplier: "مورد جديد", noSupplierLink: "بدون حساب مورد",
    supplierTags: "يورّد", tagFeed: "علف", tagMed: "دواء", tagOther: "أخرى",
    searchSuppliers: "ابحث عن مورد…", backToSuppliers: "الموردون",
    supplierAccounts: "حسابات الموردين", manageSupplier: "إدارة المورد",
    archiveSupplier: "أرشفة المورد", deleteSupplier: "حذف المورد",
    logExpense: "تسجيل مصروف", editExpense: "تعديل المصروف", noExpensesYet: "لا مصاريف بعد.",
    noExpensesYetSub: "سجّل أول مصروف بثلاث خطوات فقط.", recurringSetup: "فواتير متكررة",
    billsPanel: "الفواتير المستحقة", spendBreakdown: "توزيع المصروف", payWhat: "كم دفعت؟",
    dueOn: "تستحق في", groupFeedLive: "أعلاف وماشية", groupMachine: "آليات ومعدات",
    groupProperty: "عقار ومرافق", groupOffice: "مكتب وإدارة", groupFinance: "التزامات مالية",
    pickGroup: "اختر النوع", pickItem: "اختر البند", saveExpense: "حفظ المصروف",
    netHint: "المبيعات ناقص المصروف", upcomingBills: "فواتير قادمة",
    customerCreated: "تم إنشاء الزبون", accountReady: "رقم الحساب جاهز", viewAccount: "فتح الحساب",
    addAnother: "إضافة زبون آخر", noObligations: "لا التزامات مسجّلة.", noObligationsSub: "أضف عقودًا وفواتير وإيجارات لتتذكّر مواعيدها.",
    dueToday: "مستحق اليوم", dueInDays: "مستحق خلال", overdueBy: "متأخر", paymentAlreadyRecorded: "دُفعت هذه الدورة مسبقًا", farmAlerts: "تنبيهات المزرعة",
    financialAlerts: "تنبيهات مالية", allClear: "لا مستحقات عاجلة.", productionToday: "إنتاج اليوم",
    appUpdate: "تحديث التطبيق", checkUpdate: "التحقق من التحديث", updateNow: "تحديث الآن",
    updateReady: "يتوفر إصدار جديد", upToDate: "أنت على أحدث إصدار.", updateChecking: "جاري التحقق…",
    updateFail: "تعذّر التحقق — تحقق من الاتصال.", updating: "جاري التحديث…",
    whatsNew: "ماذا الجديد", whatsNewLead: "أبرز ما أُضيف في آخر تحديث:",
    viewWhatsNew: "معاينة آخر تحديث", gotIt: "حسنًا",
    versionHistory: "سجل الإصدارات", showVersionHistory: "عرض الإصدارات السابقة",
    hideVersionHistory: "إخفاء الإصدارات السابقة",
    openFullAccount: "فتح الحساب · ملء الشاشة", viewTransactions: "عرض الحركات",
    archiveAccount: "أرشفة الحساب", deleteAccount: "حذف الحساب", restoreAccount: "استعادة الحساب",
    archivedAccounts: "حسابات مؤرشفة", archiveWarn: "يُخفى الحساب من قائمة الزبائن لكن تبقى كل الحركات محفوظة للرجوع إليها.",
    archiveConfirm: "أرشفة هذا الحساب؟",
    deleteAccountWarn: "سيُحذف الزبون من القائمة. سجل المبيعات والدفعات يبقى في دفتر المزرعة.",
    confirmDeleteAccount: "تأكيد الحذف", enterPinConfirm: "أدخل رمز الدخول للتأكيد",
    accountArchived: "تمت الأرشفة", accountDeleted: "تم الحذف", accountRestored: "تمت الاستعادة",
    exportArchive: "تصدير نسخة احتياطية", noArchived: "لا حسابات مؤرشفة.", manageAccount: "إدارة الحساب",
    obligationDocs: "المستندات المرفقة", addDocument: "إضافة مستند", docReserved: "محفوظ",
    who: "مَن يستخدم هذا الجهاز اليوم؟", whoSub: "اختر المستخدم — المبيعات والحركات تُسجَّل باسمه ووقتها.",
    welcomeTitle: "نظام إدارة المزارع", welcomeSub: "منصة مكتبية لإدارة المبيعات والإنتاج والمصاريف — لكل مزرعة أو شركة.",
    getStarted: "ابدأ", signIn: "تسجيل الدخول", continueBtn: "متابعة",
    haveAccount: "لدي حساب",
    welcomeCloudLead: "حساب واحد للشركة — بريد وكلمة مرور. على أي جهاز استخدم نفس البريد.",
    cloudStartLead: "اسمك يظهر على كل عملية تسجّلها. بريد الشركة يُستخدم لتسجيل الدخول من كل الأجهزة.",
    cloudSignInLead: "أدخل بريد الشركة وكلمة المرور لتحميل المزرعة.",
    coCompanyEmail: "بريد الشركة",
    coPassShort: "كلمة المرور ستة أحرف على الأقل.",
    coEmailBad: "أدخل بريدًا صحيحًا.",
    coEmailTaken: "هذا البريد مسجَّل — سجّل الدخول.",
    coSignInBad: "البريد أو كلمة المرور غير صحيحة.",
    coNoFarmOnAccount: "لا مزرعة على هذا الحساب. استخدم ابدأ لإنشاء واحدة.",
    cloudUnavailable: "المزامنة غير متاحة بعد — يمكنك استخدام هذا الجهاز.",
    useDeviceOnly: "استخدام هذا الجهاز فقط",
    noProfiles: "لا يوجد مستخدمون بعد.", firstOne: "أنشئ ملف المزرعة والمستخدم الأول.",
    createProfile: "إضافة مستخدم", yourName: "اسم الموظف", nameHint: "الاسم كما يُنادى به في المزرعة",
    chooseRole: "المهنة / الوظيفة", chooseAvatar: "اختر صورة", startNow: "بدء العمل",
    nameNeeded: "الرجاء إدخال الاسم.", nameTaken: "هذا الاسم مستخدَم مسبقًا.",
    companyNeeded: "الرجاء إدخال اسم المزرعة أو الشركة.",
    passcode: "رمز الدخول", createPass: "إنشاء رمز الدخول", confirmPass: "تأكيد الرمز",
    enterPass: "أدخل رمز الدخول", wrongPass: "الرمز غير صحيح.", passShort: "الرمز أربعة أرقام على الأقل.",
    passMismatch: "الرمزان غير متطابقين.", passHint: "أربعة أرقام على الأقل لحماية حسابك.",
    passOptional: "رمز الدخول اختياري — يُفضَّل تعيينه.", enter: "دخول", notYou: "لست أنت؟",
    skip: "تخطي", noPass: "بدون رمز", security: "الحماية", setPass: "تعيين رمز دخول",
    stepOf: "الخطوة", of: "من",
    setupFarmTitle: "إعداد المزرعة", setupFarmLead: "هذه البيانات تُعرّف شركتك على الفواتير والتقارير.",
    setupUserTitle: "المستخدم والصلاحية", setupUserLead: "اسمك ووظيفتك ورمز الدخول.",
    setupContactTitle: "الهوية والتواصل", setupContactLead: "الشعار والهاتف والعنوان — اختياري ويمكن تعديله لاحقًا.",
    companyName: "اسم المزرعة / الشركة", companyNameHint: "يظهر في أعلى التطبيق وعلى كل فاتورة.",
    employeeName: "اسم الموظف", farmEmail: "البريد الإلكتروني",
    emailSoon: "مزامنة الشركة بالبريد من الإعدادات",
    emailSoonHint: "الإعدادات ← النسخ والمزامنة ← سجّل بالبريد وأنشئ شركة أو انضم برمز الدعوة.",
    completeFarmSetup: "أكمل بيانات المزرعة", completeFarmSetupLead: "حدّث هوية شركتك بعد الترقية — يظهر على الفواتير والتقارير.",
    finishSetup: "حفظ ومتابعة", attachLogo: "إرفاق الشعار",
    changePass: "تغيير الرمز", removePass: "إزالة الرمز", passRemoved: "تم إلغاء رمز الدخول.",
    forgotPass: "نسيت الرمز؟", resetPass: "إعادة تعيين الرمز",
    resetPassLead: "أكد اسم المزرعة لإعادة التعيين، ثم عيّن رمزًا جديدًا.",
    resetPassLeadName: "أكد اسمك لإعادة التعيين، ثم عيّن رمزًا جديدًا.",
    resetFarmName: "اكتب اسم المزرعة", resetProfileName: "اكتب اسمك كما في الملف",
    resetNameWrong: "الاسم غير مطابق.", resetPassOk: "تم تعيين رمز جديد.",
    save: "حفظ", saved: "تم الحفظ", cancel: "إلغاء", close: "إغلاق", next: "التالي", prev: "السابق",
    optional: "اختياري", all: "الكل", today: "اليوم", week: "هذا الأسبوع", month: "هذا الشهر", custom: "تاريخ محدد",
    days: "يوم", none: "لا شيء", unknown: "غير محدد", total: "المجموع", count: "العدد",
    addAnimal: "إضافة حيوان", pickSpecies: "ما نوع الحيوان؟", identity: "التعريف", details: "التفاصيل",
    prodStatus: "الإنتاج والحالة", animalName: "الاسم", nameOptional: "اختياري",
    idNeeded: "الرجاء إدخال الرقم أو الاسم.", idTaken: "هذا الرقم مستخدَم مسبقًا.",
    photo: "الصورة", takePhoto: "التقاط صورة", changePhoto: "تغيير الصورة", removePhoto: "حذف الصورة",
    photoHint: "الصورة تساعد العمال على تمييز الحيوان بسرعة.",
    birds: "عدد الطيور", flockStart: "تاريخ بدء القطيع", coop: "الخُم", coopHint: "مثال: الخم الشمالي",
    dob: "تاريخ الميلاد", knowDob: "أعرف التاريخ", knowAge: "أعرف العمر تقريبًا",
    age: "العمر", years: "سنة", months: "شهر", weight: "الوزن", kg: "كغ",
    breed: "السلالة", status: "الحالة", expected: "الإنتاج اليومي المتوقع", expectedShort: "المتوقع",
    parity: "عدد الولادات", source: "المصدر", born: "مولود في المزرعة", bought: "مشترى",
    price: "سعر الشراء", medicineNote: "الدواء الحالي", medicineHint: "دواء يُعطى بانتظام",
    notes: "ملاحظات", dueDate: "تاريخ الولادة المتوقع", dueIn: "الولادة بعد", edit: "تعديل",
    repro: "متابعة الحمل", serviceDate: "تاريخ التلقيح", serviceHint: "من هذا التاريخ يُحسب كل شيء",
    recordService: "تسجيل تلقيح", natural: "طبيعي", ai: "تلقيح اصطناعي",
    timeline: "الجدول الزمني", watchHeat: "راقب عودة الشياع", watchHeatSub: "إن عادت للشياع فلم يثبت الحمل",
    pregCheck: "موعد فحص الحمل", pregCheckSub: "الفحص موثوق بين ٣٠ و٤٥ يومًا",
    confirmPreg: "أكّد: عشار ✓", notPreg: "لم يثبت الحمل ✗", stillWaiting: "لم أفحص بعد",
    dryOffDate: "موعد التجفيف", dryOffSub: "يُوقف الحليب ٦٠ يومًا قبل الولادة لتستريح الضرع",
    dryNow: "جفّفها الآن", dryDone: "تم التجفيف", expectedCalving: "الولادة المتوقعة",
    calvingWindow: "الفترة المتوقعة", recordBirth: "تسجيل الولادة", overdueBirth: "تجاوزت موعد الولادة",
    daysIn: "مضى على التلقيح", monthsIn: "شهر", notServed: "لم يُسجَّل تلقيح",
    reproHint: "سجّل تاريخ التلقيح، ويحسب التطبيق الفحص والتجفيف والولادة — وأنت تؤكّد كل خطوة.",
    step1: "التلقيح", step2: "فحص الحمل", step3: "التجفيف", step4: "الولادة",
    breedOther: "اكتب اسم السلالة", medName: "اسم الدواء", medNameHint: "اختياري — الاسم التجاري",
    suggestions: "مقترحات",
    editAnimal: "تعديل البيانات", history: "السجل", changeStatus: "تغيير الحالة",
    noAnimals: "لا توجد حيوانات بعد.", noAnimalsSub: "أضف أول حيوان لتبدأ التسجيل.",
    milk: "الحليب", eggs: "البيض", liters: "ليتر", L: "ل", egg: "بيضة", eggsUnit: "بيضة",
    morning: "حلبة الصباح", evening: "حلبة المساء", collect: "جمع البيض", broken: "مكسور",
    milkMode: "طريقة تسجيل الحليب", perAnimal: "لكل حيوان", herdTotal: "مجموع القطيع",
    perAnimalSub: "تعرف إنتاج كل بقرة على حدة", herdTotalSub: "حليب الصباح وحليب المساء — ثم المجموع والمخزون",
    morningMilk: "حليب الصباح", eveningMilk: "حليب المساء", dayMilkTotal: "مجموع اليوم",
    milkProduced: "أُنتج", milkSoldToday: "بِيع", milkLeft: "في المخزون",
    logPerCow: "تسجيل لكل بقرة (اختياري)", hidePerCow: "إخفاء تفاصيل الأبقار",
    saveDayMilk: "حفظ الحليب", goSellMilk: "بيع الحليب", afterMilkHint: "بعد الحفظ يظهر المخزون مع وقت الإنتاج لتتبّع الطزاجة.",
    oversellWarn: "الكمية أكبر من المخزون المتاح", milkBalance: "مخزون الحليب",
    milkLogHint: "أدخل حليب الصباح والمساء معًا ثم احفظ.",
    addMilkStock: "إضافة حليب للمخزون", milkUnit: "الوحدة", milkUnitL: "ليتر", milkUnitKg: "كغ",
    milkDensityHint: "1 ل ≈ 1.03 كغ",
    milkStockLog: "سجل الحليب", milkLogEmpty: "لا إضافات حليب في هذه الفترة.",
    milkSessionAll: "كل الحلبات", milkLogPreview: "معاينة المجموع", milkSession: "الحلبة",
    milkStockTitle: "المخزون", milkFresh: "طازج", milkOk: "جيد", milkAging: "يبدأ يقدّم", milkOld: "قديم",
    milkProducedAt: "أُنتج", milkLoggedBy: "سجّله", milkAge: "العمر", milkHours: "س",
    milkUse: "استخدام مزرعة", milkUseSub: "منزل · عجول · هدر — يخصم من المخزون فورًا",
    milkUsed: "استُخدم", milkUseHome: "منزل", milkUseCalves: "عجول", milkUseWaste: "هدر", milkUseOther: "أخرى",
    milkNoStock: "لا حليب في المخزون بعد", milkLotsLeft: "دفعات متبقية", milkLiveStock: "يتحدّث مع كل بيع أو استخدام",
    farmDay: "إنتاج اليوم", eggsTodayBlock: "بيض اليوم", moreFarmActions: "المزيد",
    recommended: "موصى به",
    backBtn: "رجوع", backTo: "رجوع إلى", quickJump: "انتقال سريع",
    saveAndSell: "حفظ ثم بيع", saveAndNew: "حفظ وإضافة آخر", backToCustomers: "كل الزبائن",
    backToHerd: "القطيع", goExpenses: "المصاريف", goAnimals: "الحيوانات",
    totalMilk: "مجموع الحلبة", switchMode: "تغيير الطريقة", bulkDay: "مسجّل بالمجموع",
    bulkNote: "بعض الأيام مسجّلة بالمجموع، لذلك لا يوجد توزيع لكل حيوان فيها.",
    whichHerd: "أي قطيع؟", allMilking: "كل الحلوب",
    birthDetails: "تفاصيل الولادة", birthKind: "نوع الولادة", single: "مفرد", twins: "توأم",
    triplets: "ثلاثة", more: "أكثر", males: "ذكور", females: "إناث", stillborn: "نافق عند الولادة",
    newborns: "المواليد", gender: "الجنس", male: "ذكر", female: "أنثى", birthSummary: "الخلاصة",
    entryDate: "تاريخ الحلبة", forDay: "ليوم", loggedOn: "سُجّل في", backdated: "تسجيل متأخر",
    prevDay: "اليوم السابق", nextDay: "اليوم التالي", pickDay: "اختر اليوم", noFuture: "لا يمكن اختيار يوم قادم.",
    meds: "الدواء", giveMed: "إعطاء دواء", pickAnimal: "أي حيوان؟", pickType: "ما الدواء المُعطى؟",
    addCost: "ما الكلفة؟", weighIn: "تسجيل الوزن", losses: "النفوق", lossCount: "عدد النافق",
    lossReason: "السبب", disease: "مرض", predator: "افتراس", heat: "حرارة", other: "غير ذلك",
    births: "الولادات", birthCount: "عدد المواليد", newborn: "المواليد",
    workers: "العمال", addWorker: "إضافة عامل", workerName: "اسم العامل", workerType: "نوع الأجرة",
    daily: "مياومة", monthly: "شهري", salary: "الراتب الشهري", present: "حاضر", absent: "غائب",
    dailyWorkers: "عمال مياومة", monthlyStaff: "موظفون شهريون", payroll: "أجرة اليوم",
    noWorkers: "لا يوجد عمال مسجَّلون.", noWorkersSub: "أضف العمال لتسجيل الحضور والأجور.",
    feed: "العلف", feedCost: "كلفة العلف", forWhich: "لأي قسم؟",
    addExpense: "تسجيل مصروف", category: "البند", amount: "المبلغ",
    expenseNote: "الوصف", expenseNoteHint: "اختياري — مثال: فاتورة مولّد شهر ٧",
    newCategory: "بند جديد", categoryName: "اسم البند", pickIcon: "اختر رمزًا", addCategory: "أضف بندًا",
    detailedFeed: "تسجيل مفصّل للعلف", quickAmount: "مبلغ سريع", byCategory: "حسب البند",
    biggestCost: "أكبر بند", perDayCost: "المعدل اليومي", noExpenses: "لا مصاريف في هذه الفترة.",
    autoLabour: "يُحتسب من حضور العمال تلقائيًا", autoMed: "يُحتسب من سجل الأدوية تلقائيًا",
    manageCategories: "بنود المصاريف", customCat: "بنود خاصة بك",
    attach: "إرفاق الفاتورة", attachHint: "صوّر الفاتورة أو الإيصال — تبقى محفوظة مع المصروف.",
    attachment: "المرفق", viewReceipt: "عرض الفاتورة", changeAttach: "تغيير الصورة",
    removeAttach: "حذف المرفق", download: "تحميل", withReceipt: "مع فاتورة", noReceipt: "بدون فاتورة",
    attached: "مرفق", attachedOn: "أُرفقت", storageUsed: "المساحة المستخدمة", storageOf: "من",
    attachCount: "عدد المرفقات", storageWarn: "المساحة تقارب الامتلاء — احذف بعض الصور أو خذ نسخة احتياطية.",
    receiptsOnly: "الفواتير فقط", allExpenses: "الكل",
    customers: "الزبائن", addCustomer: "إضافة زبون", customerName: "اسم الزبون", phone: "رقم الهاتف",
    customerPrice: "سعر خاص بالزبون", useDefault: "السعر العام", regular: "زبون دائم",
    dailyQty: "الكمية اليومية المعتادة", dailyRound: "توزيع اليوم",
    dailyRoundSub: "سجّل تسليم اليوم لكل الزبائن الدائمين دفعة واحدة.",
    noRegulars: "لا يوجد زبائن دائمون.", deliver: "تسليم",
    newSale: "بيع جديد", pickCustomer: "لمن تم البيع؟", product: "المنتج", qty: "الكمية",
    reimbursements: "تعويضات مصاريف الزبون", reimbursement: "تعويض مصروف", expenseName: "نوع / اسم المصروف",
    chooseOrAddExpenseType: "اختر نوعًا محفوظًا أو اكتب نوعًا جديدًا — سيُحفظ تلقائيًا للاستخدام لاحقًا.",
    addReimbursement: "إضافة تعويض", removeReimbursement: "حذف سطر التعويض", grossSubtotal: "الإجمالي قبل التعويض", reimbursementTotal: "إجمالي التعويضات",
    netInvoiceTotal: "صافي الفاتورة", reimburseNameNeeded: "اختر نوع المصروف لكل مبلغ تعويض.",
    reimburseOverGross: "لا يمكن أن يتجاوز التعويض مستحقات هذا الزبون.",
    reimburseFromBalance: "إذا دفع الزبون مصروف مزرعة من جيبه يُحسم من مستحقاته، والنقد الذي تأخذه منفصل. يُسجَّل الحسم مصروفًا وصرفًا في الصندوق.",
    cashToDrawer: "النقد الداخل",
    reimburseMemo: "ملاحظة (اختياري)", reimburseOnSale: "من هذا البيع", reimburseOnAccount: "من رصيد الحساب",
    resultingBalance: "رصيد الحساب بعد القيد", netDueNow: "المطلوب الآن",
    expSourceAll: "كل المصادر", expSourceReimburse: "تعويض الزبون", expSourceCash: "نقد الصندوق",
    cashOffset: "مقاصة حساب", cashOffsetHint: "بنود المقاصة تظهر في السجل ولا تُحتسب في قبض/صرف الدرج.",
    paidByCustomer: "دفعه الزبون",
    milkUseAddReason: "سبب جديد", milkUseReasonHint: "اكتب سببًا واحفظه — يظهر في القائمة في المرات التالية.",
    milkUseHistory: "سجل استخدام المزرعة", milkUseEmpty: "لا استخدام مزرعة في هذه الفترة.", reimburseReadOnly: "التعويضات المرتبطة محفوظة وتظهر هنا للقراءة فقط.",
    creditsCollected: "الرصيد الدائن / المحصّل", actualPaid: "المدفوع فعليًا",
    accountTotal: "إجمالي الحساب", deductions: "الحسومات والتعويضات", noDeductions: "لا حسومات في هذه الفترة.",
    deductHint: "الحسومات تعويضات من المزرعة تُقيَّد على رصيد الحساب، وتُسجَّل مصروفًا وصرفًا في الصندوق.",
    settlementNet: "صافي المستحق",
    accountReimburse: "تعويض على الحساب",
    unitPrice: "سعر الوحدة", payStatus: "حالة الدفع", paidS: "مدفوع", unpaid: "غير مدفوع",
    partial: "متبقي", amountPaid: "المبلغ المدفوع", outstanding: "المستحقات",
    collected: "المحصّل", balance: "الرصيد", due: "المتبقي", recordPayment: "تسجيل دفعة",
    paymentAmount: "قيمة الدفعة", method: "طريقة الدفع", cash: "نقدًا", transfer: "تحويل",
    invoice: "فاتورة", receipt: "إيصال", statement: "كشف حساب", purchaseInvoice: "فاتورة شراء", invoiceNo: "رقم الفاتورة",
    priceAsTotal: "إدخال الإجمالي", pricePerUnit: "سعر الوحدة", priceFull: "السعر الكامل",
    calculatedTotal: "الإجمالي المحسوب", calculatedUnit: "سعر الوحدة المحسوب",
    needCustomer: "اختر زبونًا قبل الحفظ.", needQty: "أدخل كمية أكبر من صفر.",
    needPrice: "أدخل سعرًا أكبر من صفر.", needAmount: "أدخل إجمالي بيع أكبر من صفر.",
    receiptNo: "رقم الإيصال", overdue: "متأخر", daysLate: "يوم تأخير", markPaid: "تسديد كامل المبلغ",
    noCustomers: "لا يوجد زبائن بعد.", noCustomersSub: "أضف أول زبون لتبدأ تسجيل المبيعات.",
    noSales: "لا توجد مبيعات في هذه الفترة.", allocAuto: "تُوزَّع الدفعة على أقدم الفواتير تلقائيًا.",
    thanks: "شكرًا لتعاملكم معنا", signCustomer: "توقيع الزبون", signReceived: "استلمها",
    credit: "رصيد لصالح الزبون", totalSold: "إجمالي المبيعات", lastOrder: "آخر طلب",
    avgOrder: "متوسط الطلب", since: "زبون منذ", accountNo: "رقم الحساب",
    avgInvoice: "معدّل الفاتورة", oldestDebt: "أقدم تأخير", noLate: "لا يوجد تأخير",
    exportAccount: "تصدير الحساب", accountOf: "حساب", perUnit: "سعر الوحدة",
    account: "الحساب", accounts: "الحسابات المفتوحة", transactions: "الحركات",
    openAccount: "فتح الحساب", closeTab: "إغلاق", noOpenAccounts: "لا حسابات مفتوحة",
    sortBy: "ترتيب", sortNameAsc: "الاسم (أ–ي)", sortNameDesc: "الاسم (ي–أ)", sortAccount: "رقم الحساب",
    sortProduct: "المنتج", sortNewest: "الأحدث", sortOldest: "الأقدم",
    searchTx: "ابحث في الحركات…", searchCustomers: "ابحث عن زبون…", searchParty: "ابحث بالاسم أو الهاتف…",
    noPartyMatch: "لا توجد نتائج", pickNone: "بدون اختيار", filters: "تصفية", clearFilters: "إزالة التصفية",
    showFilters: "إظهار التصفية", hideFilters: "إخفاء التصفية", filtersOn: "تصفية مفعّلة",
    applyFilters: "تم", resetFilters: "إعادة التصفية", filterAndSort: "تصفية وترتيب",
    sortDate: "التاريخ", sortAmount: "المبلغ", sortAlpha: "أبجدي",
    sortAsc: "تصاعدي", sortDesc: "تنازلي",
    herdOverview: "نظرة على القطيع", searchAnimals: "ابحث بالاسم أو الرقم أو السلالة…",
    noAnimalsMatch: "لا توجد حيوانات مطابقة", noAnimalsMatchSub: "غيّر البحث أو أزل التصفية لرؤية القطيع.",
    basicDetails: "البيانات الأساسية", moreDetails: "تفاصيل أكثر", needsAttention: "تحتاج متابعة",
    animalDirectory: "دليل الحيوانات", totalHeads: "إجمالي الرؤوس",
    hideDueBills: "إخفاء الفواتير المستحقة", showDueBills: "إظهار الفواتير المستحقة",
    expenseOverview: "نظرة سريعة", showInsights: "إظهار تحليل المصروف", hideInsights: "إخفاء تحليل المصروف",
    milkSaleUnit: "وحدة بيع الحليب", milkUnitMismatch: "وحدة البيع تُحوَّل تلقائياً من/إلى المخزون (1 ل ≈ 1.03 كغ).",
    fromDate: "من تاريخ", toDate: "إلى تاريخ", dateClear: "مسح التاريخ", pickDate: "اختر التاريخ",
    statusAll: "الكل", inRange: "ضمن الفترة المحددة",
    owingInRange: "المستحق في هذه الفترة", txCount: "عدد الحركات", editTx: "تعديل الحركة",
    deleteTx: "حذف الحركة", confirmDelete: "تأكيد الحذف", deleted: "تم الحذف",
    deleteWarn: "سيُحذف هذا البيع نهائيًا مع دفعاته وتعويضات المصاريف المرتبطة به من المبيعات وصندوق النقد.",
    deleteExpenseWarn: "سيُحذف هذا المصروف مع دفعة الصندوق وحركة المورد المرتبطة به.",
    deletePayWarn: "ستُلغى دفعة الصندوق هذه ويُحدَّث حساب المورد/المصاريف حتى لا تبقى حركة بلا مقابل.",
    deletePaymentWarn: "ستُحذف دفعة الصندوق هذه وتعويضات المصروف المرتبطة بها ويُحدَّث حساب الزبون. تبقى فاتورة البيع إن وُجدت.",
    deleteMedWarn: "سيُحذف علاج الدواء من المصاريف وصندوق النقد.",
    deleteLinkedWarn: "سيُحذف هذا القيد مع أي حركات مرتبطة تظهر في تبويبات أخرى.",
    discount: "خصم", discountNote: "سبب الخصم",
    discountOverNet: "الخصم أكبر من صافي الفاتورة بعد التعويضات.",
    quickSale: "بيع سريع", quickSaleHint: "زبون أو بيع عابر · منتج · كمية — ثم الصندوق: كامل أو جزئي",
    walkIn: "زبون عابر", walkInHint: "بيع لمرة واحدة — لا حاجة لاسم",
    cashier: "الصندوق", charge: "تحصيل", payInFull: "دفع كامل",
    amountReceived: "المبلغ المستلم", amountDue: "المطلوب",
    chargeFull: "تحصيل الكامل", takePartial: "تحصيل الجزئي",
    putOnAccount: "على الحساب", pickPayMode: "اختر طريقة الدفع",
    cashierFullHint: "يُسجَّل في الصندوق الآن",
    cashierPartialHint: "الباقي يبقى على حساب الزبون",
    cashierLaterHint: "الفاتورة كاملة على الحساب — بدون دفعة الآن",
    editPayment: "تعديل الدفعة", editCashMove: "تعديل حركة الصندوق", saleDate: "تاريخ البيع", paymentDate: "تاريخ الدفع",
    notes2: "ملاحظات", noTx: "لا حركات مطابقة.", lastPayment: "آخر دفعة", payments: "الدفعات",
    colQty: "الكمية", colUnit: "السعر", colTotal: "الإجمالي", colPaid: "المدفوع", colDue: "المتبقي",
    colStatus: "الحالة", colNotes: "ملاحظات", actions: "إجراءات", welcomeBack: "أهلًا بعودتك",
    chooseUser: "اختر المستخدم",
    summary: "الملخص الذكي", charts: "الرسوم البيانية", pl: "الأرباح والخسائر",
    production: "الإنتاج", health: "الصحة", labor: "العمال والأجور", log: "سجل التسجيلات",
    income: "المدخول", costsL: "المصاريف", profit: "صافي الأرباح", labour: "اليد العاملة",
    medicine: "الأدوية", purchases: "شراء حيوانات", salesIncome: "مبيعات",
    exportPdf: "تصدير PDF", excel: "تصدير Excel", totalLiters: "مجموع الحليب",
    totalEggs: "مجموع البيض", avgPerHead: "المعدل لكل رأس", topAnimal: "الأفضل إنتاجًا",
    lowYield: "إنتاج منخفض", activeTx: "علاجات الفترة", calving: "ولادات قريبة",
    dryList: "متوقفة عن الإنتاج", herdSize: "عدد القطيع", vsPrev: "مقارنة بالفترة السابقة",
    costBreak: "توزيع المصاريف", dailyProd: "الإنتاج اليومي", perHead: "الإنتاج حسب الحيوان",
    paidVsDue: "المحصّل مقابل المستحق", allTypes: "كل الأنواع", noData: "لا توجد بيانات كافية.",
    noEntries: "لا توجد تسجيلات في هذه الفترة.", entriesToday: "تسجيلات اليوم",
    rate: "سعر الصرف", milkPrice: "سعر الحليب", eggPrice: "سعر البيضة", dailyWage: "أجرة المياومة",
    perL: "لليتر", perEgg: "للبيضة", perDay: "لليوم", language: "اللغة", guide: "دليل الاستخدام",
    switchUser: "تبديل المستخدم", people: "المستخدمون",
    setCatFarm: "المزرعة", setCatMoney: "الأسعار والعملة", setCatMilk: "تسجيل الحليب",
    setCatWeather: "الطقس والموقع", setCatPeople: "الأشخاص والأمان", setCatData: "النسخ والمزامنة",
    setCatSystem: "التطبيق والتخزين", setDanger: "منطقة خطر",
    setTipFarm: "الاسم والشعار يظهران على الفواتير والتقارير. الهاتف والعنوان اختياريان.",
    setTipRate: "يحوّل الدولار إلى الليرة في كل المبالغ المعروضة. حدّثه عند تغيّر السوق.",
    setTipMoneyView: "اختر إظهار دولار فقط، ليرة فقط، أو الاثنين معًا. يتوفّر أيضًا من الشريط العلوي.",
    setTipMilkMode: "سجّل حليب الصباح والمساء. المخزون يخصم تلقائيًا عند البيع أو الاستخدام.",
    setTipPrices: "أسعار البيع الافتراضية وأجرة المياومة لحساب الرواتب والتقارير.",
    setTipWeather: "الموقع يفعّل طقس المزرعة ونصائح الحرّ والمطر.",
    setTipPeople: "المستخدمون يسجّلون بأسمائهم. الرمز اختياري لحماية ملفك. العمال للحضور والأجور.",
    setTipCloud: "بريد الشركة واحد للجميع. سجّل الدخول به على أي جهاز — المبيعات تُختَم باسم من يستخدم الجهاز.",
    setTipBackup: "النسخة JSON كاملة وقابلة للاسترجاع. Excel وCSV وPDF للقراءة فقط.",
    setTipStorage: "الصور المرفقة تستهلك المساحة. احذف الإيصالات القديمة إن امتلأت الذاكرة.",
    setTipUpdate: "بعد رفع نسخة جديدة، اضغط للتحقق ثم ثبّت التحديث.",
    setShowHistory: "سجل سعر الصرف", setHideHistory: "إخفاء السجل",
    setNotSet: "غير محدّد", setOnDevice: "على هذا الجهاز", setSynced: "مزامنة",
    setUnsaved: "تعديلات غير محفوظة",
    hideSidebar: "إخفاء القائمة", showSidebar: "إظهار القائمة",
    palHint: "نفّذ أمرًا أو ابحث…", palActions: "أوامر", palGo: "انتقل إلى",
    palFarm: "المزرعة", palPeople: "أشخاص", palFavs: "المفضلة",
    palEditFavs: "تعديل المفضلة", palDoneFavs: "تم", palAddFav: "أضف للمفضلة",
    palRemoveFav: "إزالة", palFavEmpty: "اضغط ✎ لاختيار الأوامر الأكثر استخدامًا",
    palPinHint: "اضغط نجمة لتثبيت أو إلغاء التثبيت",
    cycleMoney: "بدّل عرض العملة",
    dismiss: "إخفاء", farmStock: "المخزون اليوم", farmTasksHint: "الأوامر الأخرى عبر Ctrl+K",
    cmdFeed: "تسجيل علف / مصروف",
    setCatDocs: "الفواتير والمستندات", setTipDocs: "خصّص شكل الفواتير والكشوف ضمن حدود التطبيق.",
    docThanks: "رسالة الشكر", docThanksHint: "اتركه فارغًا لاستخدام النص الافتراضي",
    docFooterNote: "ملاحظة أسفل الصفحة", docShowSigns: "عرض خانات التوقيع",
    docShowParty: "عرض المُصدِر والمستلم", docShowRate: "عرض سعر الصرف",
    docPrintMoney: "عملات الطباعة", docFollowView: "حسب عرض التطبيق",
    docAlwaysBoth: "دولار وليرة دائمًا", docUsdOnly: "دولار فقط", docLbpOnly: "ليرة فقط",
    moneyPreview: "معاينة", ctxOpen: "فتح", ctxEdit: "تعديل", ctxPrint: "طباعة",
    ctxSale: "بيع جديد", ctxPay: "تسجيل دفعة", ctxMed: "دواء", ctxRepro: "التكاثر",
    ctxMilk: "تسجيل إنتاج", ctxManage: "إدارة الحساب", ctxArchive: "أرشفة",
    ctxReceipt: "عرض المرفق", ctxDelete: "حذف",
    sharedNote: "يرى جميع المستخدمين البيانات نفسها.",
    by: "المُسجِّل", todayAt: "اليوم", yesterday: "أمس", never: "لا يوجد تسجيل",
    loading: "جارٍ فتح بيانات المزرعة…", saveFail: "لم يتم الحفظ. تحقق من الاتصال.",
    storageFull: "الذاكرة ممتلئة. احذف بعض الصور.", retry: "إعادة المحاولة", refresh: "تحديث",
    noStore: "التخزين غير متاح: البيانات لن تُحفظ بعد إغلاق التطبيق.",
    deviceOnly: "البيانات محفوظة على هذا الجهاز فقط. سجّل ببريد الشركة نفسه على أي جهاز للمزامنة.",
    help: "شرح", terms: "شرح المصطلحات", steps: "الخطوات", tip: "ملاحظة",
    preparedBy: "أعدّ التقرير", generated: "تاريخ الإصدار", period: "الفترة",
    signOwner: "صاحب المزرعة", signSupplier: "توقيع المورد", signVet: "الطبيب البيطري",
    setup: "ابدأ من هنا", setupAnimals: "أضف حيواناتك", setupPrices: "أدخل الأسعار",
    setupWorkers: "أضف العمال", setupCustomers: "أضف الزبائن",
    cloud: "مزامنة الشركة", cloudSub: "بريد شركة واحد — ومزرعة واحدة تتزامن على كل الأجهزة.",
    cloudUrl: "رابط قديم (اختياري)", cloudToken: "مفتاح الوصول (اختياري)", cloudTest: "اختبار الرابط القديم",
    cloudOn: "مفعّلة", cloudOff: "متوقفة", cloudOk: "تم الاتصال بنجاح.",
    cloudFail: "تعذّر الاتصال.", cloudHint: "بريد الشركة واحد للجميع — سجّل الدخول به على أي جهاز لحفظ المزرعة ومزامنتها.",
    cloudEasy: "إنشاء رابط قديم (غير موصى)", cloudEasyBusy: "جاري إنشاء الرابط…",
    cloudEasyOk: "تم إنشاء الرابط.",
    cloudEasyFail: "تعذّر إنشاء الرابط.",
    cloudCopy: "نسخ الرابط القديم", cloudCopied: "تم النسخ.",
    cloudJoin: "للمطورين فقط — رابط بدون حسابات.",
    cloudSecret: "الرابط القديم ليس آمنًا للشركات — استخدم مزامنة البريد.",
    cloudAdvanced: "طريقة قديمة (رابط بدون تسجيل)",
    coEmail: "البريد الإلكتروني", coPassword: "كلمة المرور", coName: "الاسم",
    coSignIn: "تسجيل الدخول", coSignUp: "إنشاء حساب", coSignOut: "تسجيل الخروج",
    coCreate: "إنشاء شركة", coJoin: "الانضمام للشركة", coCompany: "اسم الشركة",
    coInvite: "رمز الدعوة", coInviteHint: "شارك هذا الرمز مع موظفي الشركة فقط.",
    coNoFirebase: "المزامنة غير متاحة بعد — يمكنك استخدام هذا الجهاز.",
    coNeedAuth: "سجّل الدخول بالبريد أولاً.",
    coReady: "مزامنة الشركة نشطة",
    coBusy: "جاري العمل…",
    coErr: "تعذّر إكمال العملية.",
    coSignedInAs: "مسجّل كـ",
    backup: "النسخ الاحتياطي", backupSub: "احفظ نسخة من بيانات المزرعة.",
    restore: "استرجاع نسخة", restoreWarn: "سيحل الملف محل كل البيانات الحالية.",
    chooseFormat: "اختر نوع الملف", fullBackup: "نسخة كاملة (JSON)", fullBackupSub: "الوحيدة القابلة للاسترجاع",
    sheetFile: "جدول (Excel)", sheetFileSub: "للقراءة والطباعة", csvFile: "سجل (CSV)",
    csvFileSub: "يفتح في أي برنامج", pdfFile: "تقرير (PDF)", pdfFileSub: "للطباعة والتوقيع",
    pickFile: "اختر ملف النسخة", restoreOk: "تم الاسترجاع.", restoreBad: "الملف غير صالح.",
    restoreFound: "يحتوي الملف على", confirmRestore: "استرجاع واستبدال البيانات",
    walkthrough: "مزرعة تجريبية", walkthroughBtn: "تحميل جولة العمل (هذا الجهاز فقط)",
    walkthroughTip: "بيانات نموذجية لشرح التطبيق. تُحفظ هنا فقط ولا تُرسل إلى سحابة الشركة.",
    walkthroughWarn: "ستظهر مزرعة نموذجية على هذا الجهاز فقط. لن تُرفع إلى الشركة. يمكنك الخروج لاحقًا وإرجاع بياناتك.",
    walkthroughSyncWarn: "مزامنة الشركة نشطة — سنوقف الرفع والسحب أثناء الجولة حتى لا تُستبدل البيانات أو تُنشر.",
    walkthroughOk: "الجولة جاهزة على هذا الجهاز.",
    walkthroughExit: "الخروج من الجولة",
    walkthroughExitWarn: "ستُزال بيانات الجولة من هذا الجهاز. إن وُجدت نسخة سابقة تُعاد، وإلا تُجلب مزرعة الشركة إن كانت المزامنة مفعّلة.",
    walkthroughBanner: "جولة عمل على هذا الجهاز فقط — غير متزامنة مع الشركة.",
    walkthroughLoad: "بدء الجولة",
    resetAll: "مسح كل البيانات", resetWarn: "سيُحذف كل شيء ولا يمكن التراجع.",
    confirmReset: "نعم، احذف كل البيانات", print: "طباعة", quick: "إجراءات سريعة",
    goodMorning: "صباح الخير", goodDay: "نهارك سعيد", goodEvening: "مساء الخير",
    todayAtFarm: "المزرعة اليوم", alerts: "تنبيهات",
    shSummary: "الملخص", shProd: "الإنتاج", shMed: "الأدوية", shWorkers: "العمال",
    shMoney: "المصاريف", shHerd: "الحيوانات", shSales: "المبيعات", shCustomers: "الزبائن", shLog: "السجل",
    colDate: "التاريخ", colTime: "الوقت", colUser: "المستخدم", colType: "النوع",
    colValue: "القيمة", colCost: "الكلفة", colNote: "ملاحظة", colName: "الاسم", colItem: "البند",
    species: "النوع", flockSize: "حجم القطيع", mortality: "نسبة النفوق", eggRate: "نسبة الإنتاج",
    feedType: "نوع العلف", hay: "تبن", concentrate: "علف مركز", barley: "شعير", corn: "ذرة",
    bran: "نخالة", silage: "سيلاج", otherFeed: "علف آخر",
    qtyUnit: "وحدة القياس", purchaseQty: "كم اشتريت؟", kgU: "كيلو", bag: "كيس", bagHint: "الكيس ٥٠ كغ عادةً",
    headUnit: "رأس", doseUnit: "جرعة", itemUnit: "قطعة",
    unitPriceFeed: "سعر الوحدة", supplier: "المورّد", lastPrice: "آخر سعر",
    feedPerHead: "كلفة العلف لكل رأس يوميًا", feedPerLiter: "كلفة العلف لليتر", feedPerEgg: "كلفة العلف للبيضة",
    feedBreak: "العلف حسب النوع", totalFeed: "مجموع العلف", feedQty: "الكمية",
    currency: "العملة", usd: "دولار", lbp: "ليرة",
    menu: "القائمة", version: "الإصدار",
    dashboard: "لوحة القيادة", desktopView: "شاشة الحاسوب", phoneView: "شاشة الهاتف",
    search: "بحث", commandHint: "اضغط Ctrl+K للبحث السريع", runCommand: "أمر سريع",
    batchEntry: "تسجيل القطيع دفعة واحدة", batchHint: "أدخل الأرقام ثم احفظ الكل بضغطة واحدة. استخدم Tab للانتقال.",
    saveAll: "حفظ الكل", changed: "تغيّر", nothingChanged: "لم تغيّر شيئًا بعد.",
    selectRow: "اختر صفًا لعرض التفاصيل", recent: "آخر الحركات",
    aging: "أعمار الديون", d030: "٠–٣٠ يوم", d3160: "٣١–٦٠ يوم", d60: "أكثر من ٦٠",
    perSpecies: "حسب النوع", quickForms: "تسجيلات أخرى", openMenu: "فتح", rows: "سطر",
    todayShort: "اليوم", expectedShort2: "المتوقع", lastLog: "آخر تسجيل", noSelection: "لا شيء محدد",
    goTo: "انتقل إلى", allCustomers: "كل الزبائن", totalDue: "إجمالي المستحقات",
    reproCol: "الحمل", enterMoves: "Enter ينتقل للسطر التالي", jumpToday: "اليوم",
    bulkPanel: "مجموع القطيع لهذا اليوم", issuedBy: "الصادرة عن", issuedTo: "الصادرة إلى",
    invoiceTotals: "الإجمالي", noPhone: "—", appName: "مزرعتي", poweredBy: "مُدار عبر تطبيق مزرعتي",
    farmIdentity: "هوية مزرعتك", identityHint: "اسمك التجاري وشعارك — يظهران في التطبيق وعلى كل فاتورة.",
    farmPhone: "هاتف المزرعة", farmAddress: "العنوان", addressHint: "مثال: البقاع — زحلة",
    setFarmName: "أضف اسم مزرعتك", setupIdentity: "أدخل اسم مزرعتك وشعارها",
    farmLogo: "شعار المزرعة", uploadLogo: "رفع الشعار",
    changeLogo: "تغيير الشعار", removeLogo: "حذف الشعار", logoHint: "يظهر في التطبيق وعلى الفواتير.",
    farmName: "اسم المزرعة", farmNameHint: "يظهر على الفواتير والتقارير",
    weather: "الطقس", locationT: "موقع المزرعة", setLocation: "حدّد موقع المزرعة",
    useMyLocation: "استخدم موقعي الحالي", searchCity: "ابحث عن البلدة أو المدينة",
    locNotFound: "لم يُعثر على الموقع.", locDenied: "تعذّر تحديد الموقع.", weatherOff: "الطقس غير متاح الآن.",
    feels: "الإحساس", humidity: "الرطوبة", wind: "الرياح", rainChance: "احتمال المطر",
    high: "الكبرى", low: "الصغرى", weatherHint: "نصيحة اليوم",
    theme: "المظهر", themeLight: "فاتح", themeDark: "داكن",
    themeHint: "خلفية رمادية مريحة للعين — مع وضع ليلي.",
    moneyView: "عرض المبالغ", bothMoney: "دولار + ليرة", usdOnly: "دولار فقط", lbpOnly: "ليرة فقط",
    moneyViewHint: "يظهر الدولار بخط عريض والليرة بجانبه بلون باهت.", preview: "معاينة", payCurrency: "عملة الدفع", enterIn: "أدخل بـ",
    paidIn: "دُفع بـ", rateUsed: "سعر الصرف المعتمد",
    rateUpdated: "آخر تحديث للسعر", rateStale: "لم يُحدَّث سعر الصرف منذ", updateRate: "تحديث السعر",
    rateHistory: "سجل أسعار الصرف", rateNow: "سعر اليوم",
    docGen: "إصدار مستند", docType: "نوع المستند", docLang: "لغة المستند", bilingual: "عربي + English",
    printNow: "طباعة المستند", generate: "إصدار", previewDoc: "معاينة المستند", backToOptions: "تعديل الخيارات",
  },
  en: {
    dir: "ltr", brand: "MAZRAATI", sub: "Farm Management System",
    home: "Home", overview: "Overview", cashBox: "Cash box", cashBoxSub: "In and out log with running balance",
    cashIn: "Cash in", cashOut: "Cash out", cashBalance: "Balance", cashValue: "Amount",
    cashRef: "Reference", cashStatement: "Statement", cashEntryDate: "Entry date",
    cashReceivedFrom: "Received from", cashPaidFor: "Paid", cashOpening: "Opening balance",
    cashFilterAll: "All", cashFilterIn: "In only", cashFilterOut: "Out only",
    cashEmpty: "No cash movements in this period.", cashTotals: "Totals",
    cashExport: "Export Excel", cashAccount: "Cash box / Farm",
    cashOverview: "Cash overview", cashClosing: "Closing balance", cashNet: "Net movement",
    cashRegister: "Cash register", cashSearch: "Search statement or reference…",
    cashViewTotals: "View totals", cashFullPeriod: "Full period", cashFilteredHint: "Running balance is hidden while this view is filtered",
    cashShowRef: "Show reference", cashHideRef: "Hide reference",
    cashShowFlow: "Show flow breakdown", cashHideFlow: "Hide flow breakdown",
    cashFlowBreakdown: "Flow breakdown", cashFlowSource: "Source / category",
    cashNoResults: "No movements match this view.", cashNoResultsSub: "Clear the search or change the movement type.",
    cashExportComplete: "Export full period", cashOpenSource: "Open source",
    cashCustomerReceipts: "Customer receipts", cashOtherOut: "Other expenses",
    cashDeductedFrom: "Deducted from", cashDeductPaid: "Deducted / Paid",
    cashTableSettings: "Customize table", cashTableSettingsHint: "Drag columns into order and adjust each visible column width.",
    cashDensity: "Row density", cashDensityCompact: "Compact", cashDensityComfortable: "Comfortable", cashDensitySpacious: "Spacious",
    cashColumnWidth: "Column width", cashDragColumn: "Drag to reorder column",
    cashResizeColumn: "Resize column", cashMoveEarlier: "Move earlier", cashMoveLater: "Move later",
    cashResetTable: "Reset table layout",
    animals: "Animals", entry: "Production", sales: "Sales", suppliers: "Suppliers", reports: "Reports", settings: "Settings",
    farmWork: "Farm work", officeWork: "Office work",
    obligations: "Obligations", addObligation: "Add recurring bill", obligationTypes: "Type",
    contract: "Contract", recurringBill: "Recurring bill", rent: "Rent",
    partyName: "Party / vendor", nextDue: "Due date", frequency: "Frequency",
    freqOnce: "One-time", freqWeekly: "Weekly", freqMonthly: "Monthly", freqYearly: "Yearly",
    markBillPaid: "Mark paid", dueBills: "Bills due", duePayments: "Customer dues",
    expenses: "Expenses", moneyOut: "Expenses", moneySpent: "Spent this month", moneySpentPeriod: "Money spent",
    billsDue: "Bills due", topCategory: "Top category", farmNet: "Farm net",
    seeCashBox: "Paid cash outs → Cash box", expenseRegister: "Expense register", paidExpensesOnly: "Paid expenses only", openBills: "Open bills",
    stillToPay: "Still to pay", paidToday: "Paid", expPaid: "Paid", expPartial: "Remainder", expUnpaid: "Unpaid",
    noPaidExpenses: "No paid expenses in this period", noPaidExpensesSub: "Unpaid bills remain in the supplier account or due-bills section.",
    billTotal: "Bill total", remainder: "Remainder", payAll: "Pay all", payNone: "Pay nothing",
    supplierPayHint: "Paid amount leaves the cash box · remainder stays as “we owe” the supplier",
    supplierCashOutHint: "Will post as cash out in the cash box",
    supplierOweHint: "Will show as amount we owe this supplier",
    paySplitHint: "Enter paid — remainder is calculated and the paid part hits the cash box.",
    higherThanUsual: "Higher than usual", thisWeek: "This week", thisMonth: "This month", lastMonth: "Last month",
    customRange: "Custom dates", searchExpenses: "Search receipt or vendor…", vendor: "Vendor",
    addSupplier: "Add supplier", supplierName: "Supplier name", supplierNote: "Note",
    supplierCreated: "Supplier created", noSuppliers: "No suppliers yet.",
    noSuppliersSub: "Add a feed, medicine or service supplier to track what you owe.",
    openSupplier: "Open account", paySupplier: "Pay supplier", logSupplierBill: "Log purchase",
    supplierBuy: "Buy from supplier", supplierBuySub: "Saved as a bill we owe until you pay",
    supplierWhatBought: "What did you buy?", supplierOpenBills: "Open bills",
    supplierNoBills: "No bills yet — log a purchase from this supplier",
    supplierNoOpen: "No unpaid bills", supplierPayThis: "Pay",
    supplierActivity: "All activity", supplierBillsTab: "Outstanding", supplierPaysTab: "Payments",
    supplierLeadOwe: "Amount still owed to this supplier",
    supplierLeadClear: "Nothing owed — account is clear",
    payBillNow: "Pay this bill",
    supplierOutstanding: "Total owed", supplierOverdueKpi: "Overdue",
    supplierPaidMonth: "Paid this month", lastActivity: "Last activity",
    statusClear: "Clear", statusOwing: "Owing", statusOverdue: "Overdue",
    payLater: "Pay later", payNowMode: "Pay now", payPartialMode: "Partial pay",
    supplierCreditHint: "Anything above what is owed is kept as supplier credit",
    supplierCredit: "Supplier credit",
    saving: "Saving…",
    totalBought: "Total bought", paidToSupplier: "Paid to supplier", weOwe: "We owe",
    supplierBills: "Supplier bills", supplierPays: "Supplier payments",
    pickSupplier: "Pick supplier", newSupplier: "New supplier", noSupplierLink: "No supplier account",
    supplierTags: "Supplies", tagFeed: "Feed", tagMed: "Medicine", tagOther: "Other",
    searchSuppliers: "Search suppliers…", backToSuppliers: "Suppliers",
    supplierAccounts: "Supplier accounts", manageSupplier: "Manage supplier",
    archiveSupplier: "Archive supplier", deleteSupplier: "Delete supplier",
    logExpense: "Log expense", editExpense: "Edit expense", noExpensesYet: "No expenses yet.",
    noExpensesYetSub: "Log your first spend in three simple steps.", recurringSetup: "Recurring bills",
    billsPanel: "Bills due", spendBreakdown: "Where money went", payWhat: "How much paid?",
    dueOn: "Due on", groupFeedLive: "Feed & Livestock", groupMachine: "Machinery & Equipment",
    groupProperty: "Property & Utilities", groupOffice: "Office & Admin", groupFinance: "Financial Obligations",
    pickGroup: "Pick a type", pickItem: "Pick a category", saveExpense: "Save expense",
    netHint: "Sales minus expenses", upcomingBills: "Upcoming bills",
    customerCreated: "Customer created", accountReady: "Account number", viewAccount: "Open account",
    addAnother: "Add another", noObligations: "No bills yet.", noObligationsSub: "Track recurring bills, rent and contracts with due dates.",
    dueToday: "Due today", dueInDays: "Due in", overdueBy: "Overdue", paymentAlreadyRecorded: "This cycle was already paid", farmAlerts: "Farm alerts",
    financialAlerts: "Financial alerts", allClear: "Nothing urgent due.", productionToday: "Today's production",
    appUpdate: "App update", checkUpdate: "Check for updates", updateNow: "Update now",
    updateReady: "New version available", upToDate: "You're on the latest version.", updateChecking: "Checking…",
    updateFail: "Could not check — try again online.", updating: "Updating…",
    whatsNew: "What's new", whatsNewLead: "Highlights from the latest update:",
    viewWhatsNew: "Preview last update", gotIt: "Got it",
    versionHistory: "Version history", showVersionHistory: "Show earlier versions",
    hideVersionHistory: "Hide earlier versions",
    openFullAccount: "Open account · full screen", viewTransactions: "View transactions",
    archiveAccount: "Archive account", deleteAccount: "Delete account", restoreAccount: "Restore account",
    archivedAccounts: "Archived accounts", archiveWarn: "Hides the customer from the list but keeps all transactions for reference.",
    archiveConfirm: "Archive this account?",
    deleteAccountWarn: "Removes the customer from the list. Sales and payment history stays in the farm log.",
    confirmDeleteAccount: "Confirm delete", enterPinConfirm: "Enter your passcode to confirm",
    accountArchived: "Archived", accountDeleted: "Deleted", accountRestored: "Restored",
    exportArchive: "Export backup", noArchived: "No archived accounts.", manageAccount: "Manage account",
    obligationDocs: "Attached documents", addDocument: "Add document", docReserved: "On file",
    who: "Who is using this tablet today?", whoSub: "Pick the user — sales and other changes are stamped with their name and time.",
    welcomeTitle: "Farm Management System", welcomeSub: "Desktop software for sales, production and costs — for every farm or company.",
    getStarted: "Get started", signIn: "Sign in", continueBtn: "Continue",
    haveAccount: "I already have an account",
    welcomeCloudLead: "One company account — email and password. Use the same email on every device.",
    cloudStartLead: "Your name is stamped on every change you record. The company email signs the whole farm in on every device.",
    cloudSignInLead: "Enter the company email and password to load the farm.",
    coCompanyEmail: "Company email",
    coPassShort: "Password must be at least 6 characters.",
    coEmailBad: "Enter a valid email.",
    coEmailTaken: "That email is already registered — sign in.",
    coSignInBad: "Email or password is incorrect.",
    coNoFarmOnAccount: "No farm on this account. Use Get started to create one.",
    cloudUnavailable: "Cloud is not available yet — you can still use this device.",
    useDeviceOnly: "Use this device only",
    noProfiles: "No users yet.", firstOne: "Create the farm profile and the first user.",
    createProfile: "Add a user", yourName: "Employee name", nameHint: "The name people use on the farm",
    chooseRole: "Occupation / role", chooseAvatar: "Pick a picture", startNow: "Start working",
    nameNeeded: "Please enter a name.", nameTaken: "That name is already taken.",
    companyNeeded: "Please enter the farm or company name.",
    passcode: "Passcode", createPass: "Create a passcode", confirmPass: "Confirm passcode",
    enterPass: "Enter your passcode", wrongPass: "Wrong passcode.", passShort: "At least 4 digits.",
    passMismatch: "The two entries do not match.", passHint: "At least 4 digits to protect your account.",
    passOptional: "A passcode is optional — recommended.", enter: "Enter", notYou: "Not you?",
    skip: "Skip", noPass: "No passcode", security: "Security", setPass: "Set a passcode",
    stepOf: "Step", of: "of",
    setupFarmTitle: "Farm setup", setupFarmLead: "These details identify your company on invoices and reports.",
    setupUserTitle: "User & access", setupUserLead: "Your name, role and passcode.",
    setupContactTitle: "Identity & contact", setupContactLead: "Logo, phone and address — optional; you can edit later.",
    companyName: "Farm / company name", companyNameHint: "Shown at the top of the app and on every invoice.",
    employeeName: "Employee name", farmEmail: "Email",
    emailSoon: "Company email sync is in Settings",
    emailSoonHint: "Settings → Backup & sync → sign in with email, then create or join a company.",
    completeFarmSetup: "Complete farm details", completeFarmSetupLead: "Update your company identity after this upgrade — shown on invoices and reports.",
    finishSetup: "Save & continue", attachLogo: "Attach logo",
    changePass: "Change passcode", removePass: "Remove passcode", passRemoved: "Passcode removed.",
    forgotPass: "Forgot passcode?", resetPass: "Reset passcode",
    resetPassLead: "Confirm the farm name to reset, then set a new passcode.",
    resetPassLeadName: "Confirm your profile name to reset, then set a new passcode.",
    resetFarmName: "Type the farm name", resetProfileName: "Type your profile name",
    resetNameWrong: "Name does not match.", resetPassOk: "New passcode set.",
    save: "Save", saved: "Saved", cancel: "Cancel", close: "Close", next: "Next", prev: "Back",
    optional: "optional", all: "All", today: "Today", week: "This Week", month: "This Month", custom: "Custom",
    days: "days", none: "None", unknown: "Not set", total: "Total", count: "Count",
    addAnimal: "Add an animal", pickSpecies: "What kind of animal?", identity: "Identity", details: "Details",
    prodStatus: "Production & condition", animalName: "Name", nameOptional: "optional",
    idNeeded: "Please enter the number or name.", idTaken: "That number is already used.",
    photo: "Photo", takePhoto: "Take a photo", changePhoto: "Change photo", removePhoto: "Remove photo",
    photoHint: "A photo helps workers recognise the animal quickly.",
    birds: "Number of birds", flockStart: "Flock start date", coop: "Coop", coopHint: "e.g. north coop",
    dob: "Date of birth", knowDob: "I know the date", knowAge: "I know the rough age",
    age: "Age", years: "years", months: "months", weight: "Weight", kg: "kg",
    breed: "Breed", status: "Condition", expected: "Expected daily production", expectedShort: "Expected",
    parity: "Previous births", source: "Origin", born: "Born on the farm", bought: "Purchased",
    price: "Purchase price", medicineNote: "Current medicine", medicineHint: "Given regularly",
    notes: "Notes", dueDate: "Expected birth date", dueIn: "Due in", edit: "Edit",
    repro: "Breeding & pregnancy", serviceDate: "Service date", serviceHint: "everything is counted from this date",
    recordService: "Record a service", natural: "Natural", ai: "Artificial insemination",
    timeline: "Timeline", watchHeat: "Watch for return to heat", watchHeatSub: "if she comes back into heat, she did not hold",
    pregCheck: "Pregnancy check due", pregCheckSub: "a check is reliable between 30 and 45 days",
    confirmPreg: "Confirm: pregnant ✓", notPreg: "Did not hold ✗", stillWaiting: "Not checked yet",
    dryOffDate: "Dry-off date", dryOffSub: "milking stops 60 days before calving so the udder can rest",
    dryNow: "Dry her off now", dryDone: "Dried off", expectedCalving: "Expected calving",
    calvingWindow: "Likely window", recordBirth: "Record the birth", overdueBirth: "Past her due date",
    daysIn: "Days since service", monthsIn: "months", notServed: "No service recorded",
    reproHint: "Record the service date and the app works out the check, the dry-off and the calving — you confirm each step.",
    step1: "Service", step2: "Pregnancy check", step3: "Dry off", step4: "Calving",
    breedOther: "Type the breed name", medName: "Medicine name", medNameHint: "optional — the product name",
    suggestions: "Suggestions",
    editAnimal: "Edit details", history: "History", changeStatus: "Change condition",
    noAnimals: "No animals yet.", noAnimalsSub: "Add your first animal to start logging.",
    milk: "Milk", eggs: "Eggs", liters: "Liters", L: "L", egg: "egg", eggsUnit: "eggs",
    morning: "Morning milking", evening: "Evening milking", collect: "Egg collection", broken: "Broken",
    milkMode: "How milk is recorded", perAnimal: "Per animal", herdTotal: "Herd total",
    perAnimalSub: "you know what each animal gives", herdTotalSub: "Morning and evening milk — then total and stock",
    morningMilk: "Morning milk", eveningMilk: "Evening milk", dayMilkTotal: "Day total",
    milkProduced: "Produced", milkSoldToday: "Sold", milkLeft: "In stock",
    logPerCow: "Log each cow (optional)", hidePerCow: "Hide per-cow details",
    saveDayMilk: "Save milk", goSellMilk: "Sell milk", afterMilkHint: "After saving, stock shows with production time for freshness.",
    oversellWarn: "More than milk available in stock", milkBalance: "Milk stock",
    milkLogHint: "Enter morning and evening milk together, then save.",
    addMilkStock: "Add milk to stock", milkUnit: "Unit", milkUnitL: "Litre", milkUnitKg: "kg",
    milkDensityHint: "1 L ≈ 1.03 kg",
    milkStockLog: "Milk stock log", milkLogEmpty: "No milk additions in this period.",
    milkSessionAll: "All milkings", milkLogPreview: "Total preview", milkSession: "Milking",
    milkStockTitle: "Stock", milkFresh: "Fresh", milkOk: "Good", milkAging: "Aging", milkOld: "Old",
    milkProducedAt: "Produced", milkLoggedBy: "Logged by", milkAge: "Age", milkHours: "h",
    milkUse: "Farm use", milkUseSub: "Home · calves · waste — deducts from stock immediately",
    milkUsed: "Used", milkUseHome: "Home", milkUseCalves: "Calves", milkUseWaste: "Waste", milkUseOther: "Other",
    milkNoStock: "No milk in stock yet", milkLotsLeft: "Remaining lots", milkLiveStock: "Updates with every sale or use",
    farmDay: "Today's production", eggsTodayBlock: "Eggs today", moreFarmActions: "More",
    recommended: "Recommended",
    backBtn: "Back", backTo: "Back to", quickJump: "Quick jump",
    saveAndSell: "Save & sell", saveAndNew: "Save & add another", backToCustomers: "All customers",
    backToHerd: "Herd", goExpenses: "Expenses", goAnimals: "Animals",
    totalMilk: "Milking total", switchMode: "Change method", bulkDay: "recorded as a total",
    bulkNote: "Some days were recorded as a herd total, so there is no per-animal split for those days.",
    whichHerd: "Which herd?", allMilking: "All milking animals",
    birthDetails: "Birth details", birthKind: "Type of birth", single: "Single", twins: "Twins",
    triplets: "Triplets", more: "More", males: "Males", females: "Females", stillborn: "Born dead",
    newborns: "Newborns", gender: "Sex", male: "Male", female: "Female", birthSummary: "Summary",
    entryDate: "Milking date", forDay: "for", loggedOn: "entered on", backdated: "back-dated entry",
    prevDay: "Previous day", nextDay: "Next day", pickDay: "Pick the day", noFuture: "You cannot pick a future day.",
    meds: "Medicine", giveMed: "Give medicine", pickAnimal: "Which animal?", pickType: "What was given?",
    addCost: "How much did it cost?", weighIn: "Record weight", losses: "Losses", lossCount: "Number lost",
    lossReason: "Reason", disease: "Disease", predator: "Predator", heat: "Heat", other: "Other",
    births: "Births", birthCount: "Number born", newborn: "Newborn",
    workers: "Workers", addWorker: "Add worker", workerName: "Worker's name", workerType: "How are they paid?",
    daily: "Daily", monthly: "Monthly", salary: "Monthly salary", present: "Present", absent: "Absent",
    dailyWorkers: "Daily workers", monthlyStaff: "Monthly staff", payroll: "Pay today",
    noWorkers: "No workers added.", noWorkersSub: "Add workers to track attendance and pay.",
    feed: "Feed", feedCost: "Feed cost", forWhich: "For which section?",
    addExpense: "Record an expense", category: "Category", amount: "Amount",
    expenseNote: "Description", expenseNoteHint: "optional — e.g. generator bill for July",
    newCategory: "New category", categoryName: "Category name", pickIcon: "Pick an icon", addCategory: "Add a category",
    detailedFeed: "Detailed feed entry", quickAmount: "Quick amount", byCategory: "By category",
    biggestCost: "Biggest category", perDayCost: "Daily average", noExpenses: "No expenses in this period.",
    autoLabour: "worked out from worker attendance", autoMed: "worked out from the medicine records",
    manageCategories: "Expense categories", customCat: "Your own categories",
    attach: "Attach the invoice", attachHint: "Photograph the invoice or receipt — it stays with the expense.",
    attachment: "Attachment", viewReceipt: "View the invoice", changeAttach: "Change the photo",
    removeAttach: "Remove attachment", download: "Download", withReceipt: "With invoice", noReceipt: "No invoice",
    attached: "attached", attachedOn: "attached", storageUsed: "Storage used", storageOf: "of",
    attachCount: "Attachments", storageWarn: "Storage is nearly full — remove some photos or take a backup.",
    receiptsOnly: "With invoice only", allExpenses: "All",
    customers: "Customers", addCustomer: "Add customer", customerName: "Customer name", phone: "Phone",
    customerPrice: "Customer's own price", useDefault: "Farm price", regular: "Regular customer",
    dailyQty: "Usual daily quantity", dailyRound: "Today's round",
    dailyRoundSub: "Invoice every regular customer in one go.",
    noRegulars: "No regular customers yet.", deliver: "Deliver",
    newSale: "New sale", pickCustomer: "Who bought it?", product: "Product", qty: "Quantity",
    reimbursements: "Customer expense reimbursements", reimbursement: "Expense reimbursement", expenseName: "Expense type / name",
    chooseOrAddExpenseType: "Choose a saved type or enter a new one — it will be saved automatically for future sales.",
    addReimbursement: "Add reimbursement", removeReimbursement: "Remove reimbursement row", grossSubtotal: "Gross subtotal", reimbursementTotal: "Reimbursement total",
    netInvoiceTotal: "Net invoice total", reimburseNameNeeded: "Choose an expense category for every reimbursement amount.",
    reimburseOverGross: "Reimbursement cannot exceed this customer’s owing.",
    reimburseFromBalance: "If the customer paid a farm expense from their pocket, it comes off what they owe — cash you take is separate. The deduction logs as a farm expense and a cash-box cash-out.",
    cashToDrawer: "Cash in",
    reimburseMemo: "Note (optional)", reimburseOnSale: "Off this sale", reimburseOnAccount: "Off account balance",
    resultingBalance: "Account balance after posting", netDueNow: "Due now",
    expSourceAll: "All sources", expSourceReimburse: "Customer reimbursement", expSourceCash: "Cash-box paid",
    cashOffset: "Account offset", cashOffsetHint: "Offset lines appear in the register and are not counted in drawer in/out.",
    paidByCustomer: "Paid by customer",
    milkUseAddReason: "New reason", milkUseReasonHint: "Type a reason to save it — it stays on the list next time.",
    milkUseHistory: "Farm-use log", milkUseEmpty: "No farm-use milk in this period.", reimburseReadOnly: "Linked reimbursements are preserved and shown here read-only.",
    creditsCollected: "Credits / Collected", actualPaid: "Actual paid",
    accountTotal: "Account total", deductions: "Reimbursements & deductions", noDeductions: "No deductions in this range.",
    deductHint: "Deductions are farm reimbursements credited to the account, and logged as expenses and cash-box cash-out.",
    settlementNet: "Net due",
    accountReimburse: "Account reimbursement",
    unitPrice: "Unit price", payStatus: "Payment status", paidS: "Paid", unpaid: "Unpaid",
    partial: "Remainder", amountPaid: "Amount paid", outstanding: "Outstanding",
    collected: "Collected", balance: "Balance", due: "Due", recordPayment: "Record a payment",
    paymentAmount: "Payment amount", method: "Method", cash: "Cash", transfer: "Transfer",
    invoice: "Invoice", receipt: "Receipt", statement: "Statement", purchaseInvoice: "Purchase invoice", invoiceNo: "Invoice no.",
    priceAsTotal: "Enter total", pricePerUnit: "Price per unit", priceFull: "Full price",
    calculatedTotal: "Calculated total", calculatedUnit: "Calculated unit price",
    needCustomer: "Pick a customer before saving.", needQty: "Enter a quantity greater than zero.",
    needPrice: "Enter a price greater than zero.", needAmount: "Enter a sale total greater than zero.",
    receiptNo: "Receipt no.", overdue: "Overdue", daysLate: "days late", markPaid: "Settle the full amount",
    noCustomers: "No customers yet.", noCustomersSub: "Add your first customer to record sales.",
    noSales: "No sales in this period.", allocAuto: "Applied to the oldest invoices first.",
    thanks: "Thank you for your business", signCustomer: "Customer signature", signReceived: "Received by",
    credit: "Credit in customer's favour", totalSold: "Total sold", lastOrder: "Last order",
    avgOrder: "Average order", since: "Customer since", accountNo: "Account no.",
    avgInvoice: "Average invoice", oldestDebt: "Oldest overdue", noLate: "Nothing overdue",
    exportAccount: "Export account", accountOf: "Account", perUnit: "Unit price",
    account: "Account", accounts: "Open accounts", transactions: "Transactions",
    openAccount: "Open account", closeTab: "Close", noOpenAccounts: "No open accounts",
    sortBy: "Sort", sortNameAsc: "Name (A–Z)", sortNameDesc: "Name (Z–A)", sortAccount: "Account no.",
    sortProduct: "Product", sortNewest: "Newest", sortOldest: "Oldest",
    searchTx: "Search transactions…", searchCustomers: "Search customers…", searchParty: "Search name or phone…",
    noPartyMatch: "No matches", pickNone: "None", filters: "Filters", clearFilters: "Clear filters",
    showFilters: "Show filters", hideFilters: "Hide filters", filtersOn: "Filters on",
    applyFilters: "Done", resetFilters: "Reset filters", filterAndSort: "Filter & sort",
    sortDate: "Date", sortAmount: "Amount", sortAlpha: "A–Z",
    sortAsc: "Ascending", sortDesc: "Descending",
    herdOverview: "Herd at a glance", searchAnimals: "Search name, tag, or breed…",
    noAnimalsMatch: "No matching animals", noAnimalsMatchSub: "Change the search or clear filters to see the herd.",
    basicDetails: "Basic details", moreDetails: "More details", needsAttention: "Needs attention",
    animalDirectory: "Animal directory", totalHeads: "Total heads",
    hideDueBills: "Hide due bills", showDueBills: "Show due bills",
    expenseOverview: "At a glance", showInsights: "Show spending insights", hideInsights: "Hide spending insights",
    milkSaleUnit: "Milk sale unit", milkUnitMismatch: "Sale unit is converted to stock automatically (1 L ≈ 1.03 kg).",
    fromDate: "From", toDate: "To", dateClear: "Clear date", pickDate: "Pick a date",
    statusAll: "All", inRange: "in the selected range",
    owingInRange: "Owing in this range", txCount: "Transactions", editTx: "Edit transaction",
    deleteTx: "Delete transaction", confirmDelete: "Confirm delete", deleted: "Deleted",
    deleteWarn: "This sale, its payments, and linked expense reimbursements will be removed from Sales and Cash Box.",
    deleteExpenseWarn: "This expense and its linked cash/supplier payment will be removed.",
    deletePayWarn: "This cash payment will be removed and the supplier/expense balance will be updated so nothing is left unpaid in cash only.",
    deletePaymentWarn: "This cash receipt and its linked expense reimbursements will be removed, and the customer balance updated. The sale invoice stays if it exists.",
    deleteMedWarn: "This medicine cost will be removed from Expenses and Cash Box.",
    deleteLinkedWarn: "This entry and any linked records that appear in other tabs will be removed.",
    discount: "Discount", discountNote: "Discount note",
    discountOverNet: "Discount cannot exceed the invoice net after reimbursements.",
    quickSale: "Quick Sale", quickSaleHint: "Customer or walk-in · product · qty — then cashier: full or partial",
    walkIn: "Walk-in", walkInHint: "One-off sale — no name needed",
    cashier: "Cashier", charge: "Charge", payInFull: "Pay in full",
    amountReceived: "Amount received", amountDue: "Amount due",
    chargeFull: "Charge full", takePartial: "Take partial",
    putOnAccount: "Put on account", pickPayMode: "Choose how they pay",
    cashierFullHint: "Posted to Cash Box now",
    cashierPartialHint: "The remainder stays on the customer account",
    cashierLaterHint: "Whole invoice on account — no payment now",
    editPayment: "Edit payment", editCashMove: "Edit cash movement", saleDate: "Sale date", paymentDate: "Payment date",
    notes2: "Notes", noTx: "No matching transactions.", lastPayment: "Last payment", payments: "Payments",
    colQty: "Qty", colUnit: "Unit price", colTotal: "Total", colPaid: "Paid", colDue: "Due",
    colStatus: "Status", colNotes: "Notes", actions: "Actions", welcomeBack: "Welcome back",
    chooseUser: "Choose your profile",
    summary: "Smart summary", charts: "Charts", pl: "Profit & Loss",
    production: "Production", health: "Health", labor: "Workers & Pay", log: "Entry log",
    income: "Income", costsL: "Costs", profit: "Net profit", labour: "Labour",
    medicine: "Medicine", purchases: "Livestock purchase", salesIncome: "Sales",
    exportPdf: "Export PDF", excel: "Export Excel", totalLiters: "Total milk",
    totalEggs: "Total eggs", avgPerHead: "Average per head", topAnimal: "Best producer",
    lowYield: "Low producers", activeTx: "Treatments this period", calving: "Births due",
    dryList: "Not producing", herdSize: "Herd size", vsPrev: "vs previous period",
    costBreak: "Cost breakdown", dailyProd: "Daily production", perHead: "Production per animal",
    paidVsDue: "Collected vs outstanding", allTypes: "All types", noData: "Not enough data yet.",
    noEntries: "Nothing logged in this period.", entriesToday: "entries today",
    rate: "Exchange rate", milkPrice: "Milk price", eggPrice: "Egg price", dailyWage: "Daily wage",
    perL: "per liter", perEgg: "per egg", perDay: "per day", language: "Language", guide: "How to use the app",
    switchUser: "Switch user", people: "People",
    setCatFarm: "Farm", setCatMoney: "Prices & currency", setCatMilk: "Milk logging",
    setCatWeather: "Weather & location", setCatPeople: "People & security", setCatData: "Backup & sync",
    setCatSystem: "App & storage", setDanger: "Danger zone",
    setTipFarm: "Name and logo appear on invoices and reports. Phone and address are optional.",
    setTipRate: "Converts USD to LBP on every amount. Update it when the market moves.",
    setTipMoneyView: "Show USD only, LBP only, or both. Also available from the top bar.",
    setTipMilkMode: "Log morning and evening milk. Stock drops automatically on every sale or farm use.",
    setTipPrices: "Default selling prices and the daily wage used for payroll and reports.",
    setTipWeather: "Location unlocks farm weather and heat/rain tips.",
    setTipPeople: "Users stamp entries with their name. PIN is optional. Workers power attendance & wages.",
    setTipCloud: "One company email for everyone. Sign in with it on any device — sales are stamped with whoever is using the tablet.",
    setTipBackup: "JSON is a full restorable backup. Excel, CSV and PDF are for reading only.",
    setTipStorage: "Attached photos use space. Remove old receipts if storage fills up.",
    setTipUpdate: "After uploading a new build, check here then install the update.",
    setShowHistory: "Rate history", setHideHistory: "Hide history",
    setNotSet: "Not set", setOnDevice: "On this device", setSynced: "Synced",
    setUnsaved: "Unsaved changes",
    hideSidebar: "Hide sidebar", showSidebar: "Show sidebar",
    palHint: "Run a command or search…", palActions: "Actions", palGo: "Go to",
    palFarm: "Farm", palPeople: "People", palFavs: "Favorites",
    palEditFavs: "Edit favorites", palDoneFavs: "Done", palAddFav: "Add to favorites",
    palRemoveFav: "Remove", palFavEmpty: "Tap ✎ to pick your most-used commands",
    palPinHint: "Tap the star to pin or unpin",
    cycleMoney: "Cycle currency display",
    dismiss: "Dismiss", farmStock: "Today's stock", farmTasksHint: "More actions via Ctrl+K",
    cmdFeed: "Log feed / expense",
    setCatDocs: "Invoices & documents", setTipDocs: "Personalize invoices and statements within the app's layout.",
    docThanks: "Thank-you message", docThanksHint: "Leave blank to use the default text",
    docFooterNote: "Footer note", docShowSigns: "Show signature lines",
    docShowParty: "Show issuer & recipient boxes", docShowRate: "Show exchange rate",
    docPrintMoney: "Print currencies", docFollowView: "Follow app display",
    docAlwaysBoth: "Always USD + LBP", docUsdOnly: "USD only", docLbpOnly: "LBP only",
    moneyPreview: "Preview", ctxOpen: "Open", ctxEdit: "Edit", ctxPrint: "Print",
    ctxSale: "New sale", ctxPay: "Record payment", ctxMed: "Medicine", ctxRepro: "Reproduction",
    ctxMilk: "Log production", ctxManage: "Manage account", ctxArchive: "Archive",
    ctxReceipt: "View attachment", ctxDelete: "Delete",
    sharedNote: "Everyone sees the same data.",
    by: "Logged by", todayAt: "Today", yesterday: "Yesterday", never: "No entry yet",
    loading: "Opening the farm…", saveFail: "Not saved. Check your connection.",
    storageFull: "Storage is full. Remove some photos.", retry: "Try again", refresh: "Refresh",
    noStore: "Storage unavailable: data will not survive closing the app.",
    deviceOnly: "Data is saved on this device only. Sign in with the same company email on any device to sync.",
    help: "Help", terms: "What the words mean", steps: "Steps", tip: "Note",
    preparedBy: "Prepared by", generated: "Generated", period: "Period",
    signOwner: "Farm owner", signSupplier: "Supplier signature", signVet: "Veterinarian",
    setup: "Start here", setupAnimals: "Add your animals", setupPrices: "Enter your prices",
    setupWorkers: "Add your workers", setupCustomers: "Add your customers",
    cloud: "Company sync", cloudSub: "One company email — one farm that syncs on every device.",
    cloudUrl: "Legacy link (optional)", cloudToken: "Access key (optional)", cloudTest: "Test legacy link",
    cloudOn: "On", cloudOff: "Off", cloudOk: "Connected successfully.",
    cloudFail: "Could not connect.", cloudHint: "One company email for everyone — sign in with it on any device to save and sync the farm.",
    cloudEasy: "Create legacy link (not recommended)", cloudEasyBusy: "Creating link…",
    cloudEasyOk: "Legacy link created.",
    cloudEasyFail: "Could not create a link.",
    cloudCopy: "Copy legacy link", cloudCopied: "Copied.",
    cloudJoin: "Developer fallback only — link with no accounts.",
    cloudSecret: "Legacy links are not secure for companies — use email sync.",
    cloudAdvanced: "Legacy (link without login)",
    coEmail: "Email", coPassword: "Password", coName: "Name",
    coSignIn: "Sign in", coSignUp: "Create account", coSignOut: "Sign out",
    coCreate: "Create company", coJoin: "Join company", coCompany: "Company name",
    coInvite: "Invite code", coInviteHint: "Share this code only with company staff.",
    coNoFirebase: "Cloud is not available yet — you can still use this device.",
    coNeedAuth: "Sign in with email first.",
    coReady: "Company sync is active",
    coBusy: "Working…",
    coErr: "Could not complete that action.",
    coSignedInAs: "Signed in as",
    backup: "Backup", backupSub: "Save a copy of the farm data.",
    restore: "Restore a backup", restoreWarn: "The file will replace all current data.",
    chooseFormat: "Choose the file type", fullBackup: "Full backup (JSON)", fullBackupSub: "the only restorable file",
    sheetFile: "Spreadsheet (Excel)", sheetFileSub: "to read and print", csvFile: "Log (CSV)",
    csvFileSub: "opens anywhere", pdfFile: "Report (PDF)", pdfFileSub: "to print and sign",
    pickFile: "Choose the backup file", restoreOk: "Restored.", restoreBad: "That file is not valid.",
    restoreFound: "The file contains", confirmRestore: "Restore and replace data",
    walkthrough: "Walkthrough farm", walkthroughBtn: "Load walkthrough (this device only)",
    walkthroughTip: "Sample data to show a client how the app works. Saved here only — never sent to company cloud.",
    walkthroughWarn: "A sample farm will appear on this device only. It is not uploaded to the company. You can exit later and restore your data.",
    walkthroughSyncWarn: "Company sync is on — we will pause upload and download during the tour so this sample is not replaced or published.",
    walkthroughOk: "Walkthrough is ready on this device.",
    walkthroughExit: "Exit walkthrough",
    walkthroughExitWarn: "Walkthrough data will be removed from this device. Your previous farm is restored if we saved it, otherwise the company farm is pulled if sync is on.",
    walkthroughBanner: "Walkthrough on this device only — not synced with the company.",
    walkthroughLoad: "Start walkthrough",
    resetAll: "Erase all data", resetWarn: "Everything is deleted and cannot be undone.",
    confirmReset: "Yes, erase everything", print: "Print", quick: "Quick actions",
    goodMorning: "Good morning", goodDay: "Good day", goodEvening: "Good evening",
    todayAtFarm: "The farm today", alerts: "Alerts",
    shSummary: "Summary", shProd: "Production", shMed: "Medicine", shWorkers: "Workers",
    shMoney: "Costs", shHerd: "Animals", shSales: "Sales", shCustomers: "Customers", shLog: "Log",
    colDate: "Date", colTime: "Time", colUser: "User", colType: "Type",
    colValue: "Value", colCost: "Cost", colNote: "Note", colName: "Name", colItem: "Item",
    species: "Species", flockSize: "Flock size", mortality: "Mortality", eggRate: "Lay rate",
    feedType: "Feed type", hay: "Hay", concentrate: "Concentrate", barley: "Barley", corn: "Corn",
    bran: "Bran", silage: "Silage", otherFeed: "Other feed",
    qtyUnit: "Unit", purchaseQty: "How much did you buy?", kgU: "kg", bag: "Bag", bagHint: "a bag is usually 50 kg",
    headUnit: "head", doseUnit: "dose", itemUnit: "item",
    unitPriceFeed: "Price per unit", supplier: "Supplier", lastPrice: "Last price",
    feedPerHead: "Feed cost per head per day", feedPerLiter: "Feed cost per liter", feedPerEgg: "Feed cost per egg",
    feedBreak: "Feed by type", totalFeed: "Total feed", feedQty: "Quantity",
    currency: "Currency", usd: "Dollar", lbp: "Lira",
    menu: "Menu", version: "Version",
    dashboard: "Dashboard", desktopView: "Desktop view", phoneView: "Phone view",
    search: "Search", commandHint: "Press Ctrl+K to jump anywhere", runCommand: "Quick command",
    batchEntry: "Log the whole herd at once", batchHint: "Type the numbers, then save them all in one go. Tab moves along.",
    saveAll: "Save all", changed: "changed", nothingChanged: "Nothing changed yet.",
    selectRow: "Select a row to see the details", recent: "Recent activity",
    aging: "Debt ageing", d030: "0–30 days", d3160: "31–60 days", d60: "Over 60",
    perSpecies: "By species", quickForms: "Other entries", openMenu: "Open", rows: "rows",
    todayShort: "Today", expectedShort2: "Expected", lastLog: "Last logged", noSelection: "Nothing selected",
    goTo: "Go to", allCustomers: "All customers", totalDue: "Total outstanding",
    reproCol: "Pregnancy", enterMoves: "Enter moves to the next row", jumpToday: "Today",
    bulkPanel: "Herd total for this day", issuedBy: "From", issuedTo: "To",
    invoiceTotals: "Total", noPhone: "—", appName: "Mazraati", poweredBy: "Run on the Mazraati app",
    farmIdentity: "Your farm's identity", identityHint: "Your business name and logo — shown in the app and on every invoice.",
    farmPhone: "Farm phone", farmAddress: "Address", addressHint: "e.g. Bekaa — Zahle",
    setFarmName: "Add your farm's name", setupIdentity: "Enter your farm's name and logo",
    farmLogo: "Farm logo", uploadLogo: "Upload a logo",
    changeLogo: "Change logo", removeLogo: "Remove logo", logoHint: "Appears in the app and on invoices.",
    farmName: "Farm name", farmNameHint: "Shown on invoices and reports",
    weather: "Weather", locationT: "Farm location", setLocation: "Set the farm location",
    useMyLocation: "Use my current location", searchCity: "Search for your town or city",
    locNotFound: "Location not found.", locDenied: "Could not get your location.", weatherOff: "Weather is unavailable.",
    feels: "Feels like", humidity: "Humidity", wind: "Wind", rainChance: "Chance of rain",
    high: "High", low: "Low", weatherHint: "Today's tip",
    theme: "Appearance", themeLight: "Light", themeDark: "Dark",
    themeHint: "Soft grey light mode for easier viewing — plus dark mode.",
    moneyView: "Money display", bothMoney: "Dollar + lira", usdOnly: "Dollar only", lbpOnly: "Lira only",
    moneyViewHint: "The dollar shows in bold with the lira faded beside it.", preview: "Preview", payCurrency: "Payment currency", enterIn: "Enter in",
    paidIn: "Paid in", rateUsed: "Rate applied",
    rateUpdated: "Rate last updated", rateStale: "The exchange rate has not been updated for",
    updateRate: "Update the rate", rateHistory: "Exchange rate history", rateNow: "Today's rate",
    docGen: "Generate a document", docType: "Document type", docLang: "Document language", bilingual: "Arabic + English",
    printNow: "Print document", generate: "Generate", previewDoc: "Document preview", backToOptions: "Edit options",
  },
};

/* ------------------------------ helpers ------------------------------ */
const iso = (d) => new Date(d).toISOString();
const dayKey = (v) => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/* Storage and comparison stay ISO (YYYY-MM-DD). On screen: weekday + DD/MM/YYYY. */
const DATE_LANG = { lang: "ar" };
const DOW = {
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const DOW_SHORT = {
  ar: ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};
const MONTHS = {
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const asDate = (v) => {
  if (!v && v !== 0) return null;
  const src = (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
    ? `${v}T12:00:00`
    : v;
  const d = src instanceof Date ? src : new Date(src);
  return Number.isFinite(d.getTime()) ? d : null;
};
const dmyNum = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const dateLangOf = (lang) => (lang === "ar" || lang === "en") ? lang : (DATE_LANG.lang === "ar" ? "ar" : "en");
const dmy = (v, lang) => {
  const d = asDate(v);
  if (!d) return "";
  return `${DOW[dateLangOf(lang)][d.getDay()]} ${dmyNum(d)}`;
};
const dm = (v) => {
  const d = asDate(v);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "";
};
const nf = (n) => Math.round(n || 0).toLocaleString("en-US");
/* Dollars keep their cents. Lira has no subunit in practice, so nf stays
   whole for lira, counts and quantities. Rounding money to the dollar made
   a $115.50 invoice print as $116 and the printed total stop matching the rows. */
const nm = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (n) => (Math.round((n || 0) * 10) / 10).toLocaleString("en-US");
const hhmm = (v) => {
  const src = (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? `${v}T12:00:00` : v;
  const d = src instanceof Date ? src : new Date(src);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const L = (lang, ar, en) => (lang === "ar" ? ar : en);

const spName = (key, lang, one) => {
  const s = SPECIES[key]; if (!s) return "";
  return lang === "ar" ? (one ? s.arOne : s.ar) : (one ? s.enOne : s.en);
};
/* Everything that follows from one service date. Nothing is applied
   automatically — the app proposes, the farmer confirms. */
function repro(a) {
  const sp = spOf(a);
  if (!a || !a.served || !sp.gestation) return null;
  const start = new Date(`${a.served}T12:00:00`);
  const plus = (n) => { const d = new Date(start); d.setDate(d.getDate() + n); return d; };
  const due = plus(sp.gestation);
  const dry = plus(sp.gestation - (sp.dryOff || 60));
  /* count whole calendar days, so the answer never depends on the time of day */
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const dayGap = (a, b) => Math.round((midnight(a) - midnight(b)) / 864e5);
  const daysIn = dayGap(Date.now(), start);
  const dLeft = dayGap(due, Date.now());
  return {
    start, due, dry,
    heat: plus(sp.cycle || 21),                       // she returns to heat if she did not hold
    checkFrom: plus(sp.checkFrom || 30), checkTo: plus(sp.checkTo || 45),
    daysIn, monthsIn: daysIn / 30.44, daysToDue: dLeft,
    daysToDry: dayGap(dry, Date.now()),
    dueMin: plus(sp.gestMin || sp.gestation - 4), dueMax: plus(sp.gestMax || sp.gestation + 4),
    needsCheck: a.status === "served" && daysIn >= (sp.checkFrom || 30),
    watchHeat: a.status === "served" && daysIn >= (sp.cycle || 21) && daysIn < (sp.checkFrom || 30),
    dryDue: a.status === "pregnant" && dayGap(dry, Date.now()) <= 0,
    overdue: dLeft < 0 && ["pregnant", "dry"].includes(a.status),
  };
}
const breedLabel = (a, lang) => {
  if (a.breed === "other" && a.breedName) return a.breedName;
  const b = (spOf(a).breeds || []).find((x) => x[0] === a.breed);
  if (!b) return T[lang].unknown;
  return (lang === "ar" ? b[1] : b[2]).replace(/ —.*$/, "");
};
const statusLabel = (k, lang) => (STATUS[k] ? (lang === "ar" ? STATUS[k].ar : STATUS[k].en) : "—");
const statusColor = (k) => (STATUS[k] ? STATUS[k].c : C.inkSoft);
const headCount = (a) => (isFlock(a) ? (a.birds || 0) : 1);
const animalLabel = (a) => (isFlock(a) ? (a.name || a.tag || "—") : `#${a.tag}${a.name ? ` · ${a.name}` : ""}`);

const backdated = (e) => !!(e && e.loggedAt && dayKey(e.at) !== dayKey(e.loggedAt));
function stamp(e, lang) {
  if (!e) return "";
  const when = e.loggedAt || e.at;
  const d = new Date(when), k = dayKey(when);
  const shown = k === dayKey(Date.now()) ? `${T[lang].todayAt} ${hhmm(d)}`
    : k === dayKey(Date.now() - 864e5) ? `${T[lang].yesterday} ${hhmm(d)}`
      : `${dmy(when, lang)} ${hhmm(d)}`;
  const mark = backdated(e) ? ` · ${T[lang].forDay} ${dmy(e.at, lang)}` : "";
  const who = (e.byName || "").trim();
  return `${who ? `${who} · ` : ""}${shown}${mark}`;
}
/* Tiny hover point — name and time stay off the row until the mark is hovered or tapped. */
function WhoHint({ e, lang }) {
  const [on, setOn] = useState(false);
  const label = stamp(e, lang);
  if (!e || !label) return null;
  return (
    <button type="button" className={`who-hint${on ? " is-on" : ""}`} title={label} aria-label={label}
      onClick={(ev) => { ev.stopPropagation(); setOn((v) => !v); }}
      onKeyDown={(ev) => ev.stopPropagation()}
      onBlur={() => setOn(false)}
      onMouseLeave={() => setOn(false)}>
      <span className="who-hint-dot" aria-hidden="true" />
      <span className="who-hint-tip">{label}</span>
    </button>
  );
}
/* midday keeps a chosen day on that day in every timezone */
const dayStamp = (dk) => (dk === dayKey(Date.now()) ? iso(Date.now()) : iso(new Date(`${dk}T12:00:00`)));
const sessionStamp = (dk, session) => {
  if (dk === dayKey(Date.now())) return iso(Date.now());
  const hh = session === "pm" ? "18:00:00" : "06:00:00";
  return iso(new Date(`${dk}T${hh}`));
};
const parseWhen = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) { const n = v.getTime(); return Number.isFinite(n) ? n : 0; }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00`).getTime();
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : 0;
};
const txDay = (e) => {
  if (!e) return "";
  if (typeof e.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day)) return e.day;
  return dayKey(e.at || e.loggedAt || "");
};
const cmpTx = (a, b, dir = "newest") => {
  const da = txDay(a), db = txDay(b);
  if (da !== db) return dir === "newest" ? db.localeCompare(da) : da.localeCompare(db);
  const ta = parseWhen(a.loggedAt || a.at), tb = parseWhen(b.loggedAt || b.at);
  if (ta !== tb) return dir === "newest" ? tb - ta : ta - tb;
  const ia = String(a.id || a.key || "");
  const ib = String(b.id || b.key || "");
  return dir === "newest" ? ib.localeCompare(ia) : ia.localeCompare(ib);
};
const parseSort = (sort) => {
  if (sort === "oldest") return { field: "date", dir: "asc" };
  if (sort === "amountAsc") return { field: "amount", dir: "asc" };
  if (sort === "amountDesc") return { field: "amount", dir: "desc" };
  if (sort === "alphaDesc" || sort === "nameDesc") return { field: "alpha", dir: "desc" };
  if (sort === "alphaAsc" || sort === "nameAsc") return { field: "alpha", dir: "asc" };
  return { field: "date", dir: "desc" };
};
const joinSort = (field, dir) => {
  if (field === "date") return dir === "asc" ? "oldest" : "newest";
  if (field === "amount") return dir === "asc" ? "amountAsc" : "amountDesc";
  return dir === "desc" ? "alphaDesc" : "alphaAsc";
};
const sortChipLabel = (t, sort) => {
  const { field, dir } = parseSort(sort);
  const name = field === "amount" ? t("sortAmount") : field === "alpha" ? t("sortAlpha") : t("sortDate");
  return `${name} ${dir === "asc" ? "↑" : "↓"}`;
};
const cmpBySort = (a, b, sort, amountOf, alphaOf) => {
  const { field, dir } = parseSort(sort);
  if (field === "amount") {
    const d = (toCents(amountOf ? amountOf(a) : 0) - toCents(amountOf ? amountOf(b) : 0)) * (dir === "asc" ? 1 : -1);
    return d || cmpTx(a, b, "newest");
  }
  if (field === "alpha") {
    const d = String((alphaOf && alphaOf(a)) || "").localeCompare(String((alphaOf && alphaOf(b)) || ""), undefined, { sensitivity: "base" });
    return (dir === "asc" ? d : -d) || cmpTx(a, b, "newest");
  }
  return cmpTx(a, b, dir === "asc" ? "oldest" : "newest");
};
function compareEntries(a, b, newestFirst = true) {
  return cmpTx(a, b, newestFirst ? "newest" : "oldest");
}
const qtyMoney = (qty, unit) => fromCents(toCents((Number(qty) || 0) * (Number(unit) || 0)));
const unitFromTotal = (total, qty) => {
  const q = Number(qty) || 0;
  if (!(q > 0)) return 0;
  return +((fromCents(toCents(total)) / q).toFixed(4));
};
function datePresetBounds(kind) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (kind === "today") { const dk = dayKey(now); return { from: dk, to: dk }; }
  if (kind === "week") {
    const c = new Date(); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() - 6);
    return { from: dayKey(c), to: dayKey(now) };
  }
  if (kind === "month") return { from: dayKey(new Date(y, m, 1)), to: dayKey(now) };
  return { from: "", to: "" };
}
function saleSaveReason(t, { cid, qty, price, amount, priceMode, discountOver }) {
  if (!cid) return t("needCustomer");
  if (!(Number(qty) > 0)) return t("needQty");
  if (priceMode === "unit" && !(Number(price) > 0)) return t("needPrice");
  if (!(Number(amount) > 0)) return t("needAmount");
  if (discountOver) return t("discountOverNet");
  return "";
}
const dayLabel = (dk, lang) => (dk === dayKey(Date.now()) ? T[lang].today
  : dk === dayKey(Date.now() - 864e5) ? T[lang].yesterday : dmy(dk, lang));
function ageText(a, lang) {
  let months = null;
  if (a.dob) months = Math.max(0, Math.round((Date.now() - new Date(a.dob)) / 2628e6));
  else if (a.ageYears) months = Math.round(a.ageYears * 12);
  if (months === null) return T[lang].unknown;
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m} ${T[lang].months}`;
  return m ? `${y} ${T[lang].years} ${m} ${T[lang].months}` : `${y} ${T[lang].years}`;
}

/* ---------------------------- storage + cloud ---------------------------- */
const withTimeout = (p, ms = 5000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const cloud = { url: "", token: "", on: false };
const isJsonBin = (u) => /api\.jsonbin\.io\/v3\/b\//i.test(u || "");
const isJsonBlob = (u) => /jsonblob\.com/i.test(u || "");
const cloudReadUrl = () => {
  const u = (cloud.url || "").replace(/\/$/, "");
  if (isJsonBin(u) && !/\/latest$/i.test(u)) return `${u}/latest`;
  return cloud.url;
};
const cloudWriteUrl = () => {
  const u = (cloud.url || "").replace(/\/$/, "");
  if (isJsonBin(u)) return u.replace(/\/latest$/i, "");
  return cloud.url;
};
const cloudHeaders = () => {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (cloud.token) {
    h.Authorization = `Bearer ${cloud.token}`;
    h["X-Access-Key"] = cloud.token;
    h["X-Master-Key"] = cloud.token;
  }
  return h;
};
async function cloudGet() {
  const r = await withTimeout(fetch(cloudReadUrl(), { method: "GET", headers: cloudHeaders() }), 12000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const farm = j && ((j.version != null || Array.isArray(j.entries)) ? j : (j.record || j.data || j.value || null));
  if (!farm) throw new Error("empty");
  return typeof farm === "string" ? farm : JSON.stringify(farm);
}
async function cloudSet(value) {
  const r = await withTimeout(fetch(cloudWriteUrl(), { method: "PUT", headers: cloudHeaders(), body: value }), 12000);
  if (!r.ok) {
    const r2 = await withTimeout(fetch(cloudWriteUrl(), { method: "POST", headers: cloudHeaders(), body: value }), 12000);
    if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
  }
  return true;
}
/* Three tiers, chosen automatically:
   host   – the Claude artifact storage API (shared across everyone using the link)
   device – the browser's own storage, used when the app is hosted on its own domain
   memory – last resort, so the app still runs even if both are blocked
   Cloud sync, when configured, sits in front of all three. */
function localOK() {
  try { const k = "__mazraati_probe"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; }
  catch (e) { return false; }
}
const store = {
  mem: {},
  _kind: null,
  get kind() {
    if (this._kind) return this._kind;
    if (typeof window === "undefined") return (this._kind = "memory");
    if (window.storage) return (this._kind = "host");
    if (localOK()) return (this._kind = "device");
    return (this._kind = "memory");
  },
  get available() { return this.kind !== "memory"; },
  async get(key, shared) {
    const remote = shared && !walkthroughHoldActive();
    if (remote && companySyncActive()) {
      try { const v = await companyPullFarm(); this.mem[key] = v; return { key, value: v, shared }; } catch (e) { /* fall back */ }
    }
    if (remote && cloud.on && cloud.url) {
      try { const v = await cloudGet(); this.mem[key] = v; return { key, value: v, shared }; } catch (e) { /* fall back */ }
    }
    if (this.kind === "host") return await withTimeout(window.storage.get(key, shared));
    if (this.kind === "device") {
      const v = window.localStorage.getItem(key);
      if (v === null) throw new Error("missing");
      return { key, value: v, shared };
    }
    if (!(key in this.mem)) throw new Error("missing");
    return { key, value: this.mem[key], shared };
  },
  async set(key, value, shared) {
    this.mem[key] = value;
    let cErr = null;
    const remote = shared && !walkthroughHoldActive();
    if (remote && companySyncActive()) { try { await companyPushFarm(value); } catch (e) { cErr = e; } }
    else if (remote && cloud.on && cloud.url) { try { await cloudSet(value); } catch (e) { cErr = e; } }
    if (this.kind === "host") return await withTimeout(window.storage.set(key, value, shared));
    if (this.kind === "device") { try { window.localStorage.setItem(key, value); } catch (e) { if (!cErr) cErr = e; } }
    if (cErr) throw cErr;
    return { key, value, shared };
  },
};
async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  try {
    const h = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let h = 5381; bytes.forEach((b) => { h = ((h * 33) ^ b) >>> 0; }); return `f${h.toString(16)}`;
  }
}
async function compressImage(file, max = 260, q = 0.55) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  return cv.toDataURL("image/jpeg", q);
}

/* ---------------------------- weather ---------------------------- */
const WMO = [
  [[0], "☀️", "صحو", "Clear"], [[1, 2], "🌤️", "غيوم قليلة", "Partly cloudy"], [[3], "☁️", "غائم", "Cloudy"],
  [[45, 48], "🌫️", "ضباب", "Fog"], [[51, 53, 55, 56, 57], "🌦️", "رذاذ", "Drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "مطر", "Rain"], [[71, 73, 75, 77, 85, 86], "❄️", "ثلج", "Snow"],
  [[95, 96, 99], "⛈️", "عواصف رعدية", "Thunderstorm"],
];
const wmo = (code, lang) => {
  const hit = WMO.find((w) => w[0].includes(code)) || WMO[0];
  return { icon: hit[1], label: lang === "ar" ? hit[2] : hit[3] };
};
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
    + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1";
  const r = await withTimeout(fetch(url), 7000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const c = j.current || {}, d = j.daily || {};
  return { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature),
    hum: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m), code: c.weather_code,
    max: Math.round((d.temperature_2m_max || [])[0]), min: Math.round((d.temperature_2m_min || [])[0]),
    rain: (d.precipitation_probability_max || [])[0] || 0, at: Date.now() };
}
async function geocode(name) {
  const r = await withTimeout(fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ar`), 7000);
  if (!r.ok) throw new Error("geo");
  const j = await r.json();
  const hit = (j.results || [])[0];
  if (!hit) throw new Error("none");
  return { name: hit.name, lat: hit.latitude, lon: hit.longitude };
}
/* Turns the forecast into advice a farmer can act on today. */
function weatherAdvice(w, lang, animals) {
  if (!w) return null;
  const ar = lang === "ar";
  const hasFlock = (animals || []).some(isFlock);
  const hasMilk = (animals || []).some(producesMilk);
  const thi = w.temp + 0.36 * (w.hum / 100) * w.temp + 41.2;
  if (w.temp >= 38) return { tone: C.red, icon: "🥵", text: ar ? "حرارة شديدة: وفّر الظل والماء البارد، وقلّل الحركة نهارًا." : "Severe heat: shade, cool water, and no handling during midday." };
  if (thi >= 78 && hasMilk) return { tone: C.red, icon: "🥵", text: ar ? "إجهاد حراري مرتفع للحلوب: توقّع انخفاض الحليب، زد الماء والتهوية." : "High heat stress for milkers: expect a drop in milk; increase water and airflow." };
  if (w.temp >= 32) return { tone: C.amber, icon: "🌡️", text: ar ? "حرارة مرتفعة: راقب الماء والتهوية، خاصة في الخم." : "Hot day: watch water and ventilation, especially in the coop." };
  if (w.temp <= 4) return { tone: C.blue, icon: "🥶", text: ar ? "برد شديد: احمِ المواليد والكتاكيت ووفّر الفرشة الجافة." : "Cold: protect newborns and chicks, and keep bedding dry." };
  if (w.rain >= 60) return { tone: C.blue, icon: "🌧️", text: ar ? `احتمال مطر ${w.rain}٪: غطِّ العلف${hasFlock ? " وأبقِ الدواجن داخل الخم" : ""}.` : `${w.rain}% chance of rain: cover the feed${hasFlock ? " and keep poultry inside" : ""}.` };
  if (w.wind >= 40) return { tone: C.amber, icon: "💨", text: ar ? "رياح قوية: ثبّت أبواب الخم والمظلات." : "Strong wind: secure coop doors and shade covers." };
  return { tone: C.green, icon: "👍", text: ar ? "الطقس مناسب لعمل المزرعة اليوم." : "Good conditions for farm work today." };
}

/* Service worker update helpers — lets users pull a new build on demand. */
const swRef = { reg: null };
function watchSwUpdate(reg, onReady) {
  swRef.reg = reg;
  const mark = () => onReady(true);
  if (reg.waiting && navigator.serviceWorker.controller) mark();
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) mark();
    });
  });
}
async function checkAppUpdate(onReady, onMsg) {
  if (!("serviceWorker" in navigator)) { onMsg("fail"); return; }
  onMsg("checking");
  try {
    const reg = swRef.reg || await navigator.serviceWorker.getRegistration("./");
    if (!reg) { onMsg("fail"); return; }
    swRef.reg = reg;
    await reg.update();
    if (reg.waiting && navigator.serviceWorker.controller) { onReady(true); onMsg("ready"); return; }
    await new Promise((r) => setTimeout(r, 1600));
    if (reg.waiting && navigator.serviceWorker.controller) { onReady(true); onMsg("ready"); }
    else onMsg("latest");
  } catch (e) { onMsg("fail"); }
}
function applyAppUpdate(onMsg) {
  onMsg("updating");
  const reg = swRef.reg;
  if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

const emptyFarm = () => ({
  version: 3, settings: { rate: 0, milkPrice: 0, eggPrice: 0, wage: 0, logo: "", farmName: "", farmPhone: "", farmAddress: "", farmEmail: "", loc: null, milkMode: "total", milkUnit: "L", categories: [], saleReimburseTypes: [], milkUseReasons: [], setupV: "", docTpl: { thanks: "", footerNote: "", showSigns: true, showParty: true, showRate: true, printMoney: "follow" } },
  profiles: [], animals: [], workers: [], customers: [], suppliers: [], obligations: [], entries: [],
});
const PROTECTED_ENTRIES = new Set(["sale", "saleReimburse", "payment", "supplierPay", "customerAdd", "customerDelete", "customerArchive", "supplierAdd", "supplierDelete", "supplierArchive", "animalAdd", "animalEdit", "workerAdd", "profile", "profileSecurity", "purchase", "status", "due", "setting", "birth", "loss", "obligationAdd", "obligationEdit", "milkUse"]);
function trimEntries(list) {
  const keep = [], vol = [];
  list.forEach((e) => (PROTECTED_ENTRIES.has(e.type) ? keep : vol).push(e));
  return [...keep, ...vol.slice(0, 2000)].sort((a, b) => cmpTx(a, b, "newest"));
}
function migrate(farm) {
  if (!farm) return emptyFarm();
  const f = { ...emptyFarm(), ...farm };
  if (!f.animals || !f.animals.length) {
    if (Array.isArray(farm.cows) && farm.cows.length) f.animals = farm.cows.map((c) => ({ ...c, species: "cow" }));
  }
  f.animals = (f.animals || []).map((a) => ({ ...a, species: a.species || "cow" }));
  f.entries = (f.entries || []).map((e) => (e.cowId && !e.animalId ? { ...e, animalId: e.cowId } : e));
  if (f.settings && f.settings.eggPrice === undefined) f.settings = { ...f.settings, eggPrice: 0 };
  f.settings = { logo: "", farmName: "", farmPhone: "", farmAddress: "", farmEmail: "", loc: null, milkMode: "total", milkUnit: "L", categories: [], saleReimburseTypes: [], milkUseReasons: [], setupV: "", docTpl: { thanks: "", footerNote: "", showSigns: true, showParty: true, showRate: true, printMoney: "follow" }, ...f.settings };
  if (!Array.isArray(f.settings.saleReimburseTypes)) f.settings.saleReimburseTypes = [];
  if (!Array.isArray(f.settings.milkUseReasons)) f.settings.milkUseReasons = [];
  f.settings.docTpl = { thanks: "", footerNote: "", showSigns: true, showParty: true, showRate: true, printMoney: "follow", ...(f.settings.docTpl || {}) };
  if (!Array.isArray(f.obligations)) f.obligations = [];
  if (!Array.isArray(f.suppliers)) f.suppliers = [];
  /* Older records used separate types for feed and livestock purchases.
     Normalize new expense fields without changing their historic paid meaning. */
  f.entries = (f.entries || []).map((e) => {
    let row = e;
    if (e.type === "feed") row = { ...e, type: "expense", category: "feed", amount: e.amount ?? e.cost };
    else if (e.type === "purchase") row = { ...e, type: "expense", category: "livestock", amount: e.amount ?? e.cost };
    if (row.type !== "expense") return row;
    const amount = fromCents(toCents(row.amount ?? row.cost));
    const rawPaidC = row.paidAmount === undefined
      ? (row.payStatus === "unpaid" || row.payStatus === "partial" ? 0 : toCents(amount))
      : Math.max(0, Math.min(toCents(amount), toCents(row.paidAmount)));
    const status = ["paid", "partial", "unpaid"].includes(row.payStatus)
      ? row.payStatus : moneyStatus(toCents(amount), rawPaidC);
    const paidAmount = status === "paid" ? amount : status === "unpaid" ? 0 : fromCents(rawPaidC);
    const category = row.category || "other";
    return {
      ...row, amount, category, payStatus: status, paidAmount,
      dueDate: row.dueDate || (status === "paid" ? "" : dayKey(row.at || Date.now())),
      vendor: row.vendor || row.supplier || "", obligationId: row.obligationId || null,
      group: row.group || expGroupOf(category),
    };
  });
  return f;
}
const mergeById = (base = [], next = []) => { const m = new Map((base || []).map((x) => [x.id, x])); (next || []).forEach((x) => m.set(x.id, x)); return [...m.values()]; };
async function readSharedFarm(fallback) {
  try { const r = await store.get(SHARED_KEY, true); if (r && r.value) return migrate(JSON.parse(r.value)); }
  catch (e) { /* local */ }
  return fallback;
}
async function loadShared() {
  try { const r = await store.get(SHARED_KEY, true); if (r && r.value) return migrate(JSON.parse(r.value)); }
  catch (e) { /* first run, or renamed since */ }
  try {
    const old = await store.get(LEGACY.shared, true);
    if (old && old.value) {
      const farm = migrate(JSON.parse(old.value));
      try { await store.set(SHARED_KEY, JSON.stringify(farm), true); } catch (e2) { /* keep going */ }
      return farm;
    }
  } catch (e) { /* nothing to carry over */ }
  const blank = emptyFarm();
  try { await store.set(SHARED_KEY, JSON.stringify(blank), true); } catch (e) { /* memory only */ }
  return blank;
}

/* --------------------------- production maths --------------------------- */
/* Milk logs are herd totals by default (session "day"). Older am/pm and
   per-animal rows still count. Stock is FIFO across lots so sales and farm
   use always keep available liters and freshness up to date. */
function milkLotsRaw(list) {
  const perSeen = {}, bulkSeen = {}, lots = [];
  (list || []).forEach((e) => {
    if (e.type === "milk") {
      const k = `${dayKey(e.at)}|${e.animalId}|${e.session || "am"}`;
      if (k in perSeen) return;
      perSeen[k] = 1;
      lots.push({
        id: e.id, key: k, at: e.at, liters: milkRecordLiters(e), unit: e.unit,
        session: e.session || "am",
        animalId: e.animalId, byName: e.byName, loggedAt: e.loggedAt, type: "milk",
      });
    } else if (e.type === "milkBulk") {
      const sess = e.session || "day";
      const k = `${dayKey(e.at)}|${sess}|${e.species || ""}`;
      if (k in bulkSeen) return;
      bulkSeen[k] = 1;
      lots.push({
        id: e.id, key: k, at: e.at, liters: milkRecordLiters(e), unit: e.unit,
        session: sess,
        species: e.species, byName: e.byName, loggedAt: e.loggedAt, type: "milkBulk",
      });
    }
  });
  return lots;
}
function effectiveMilkLots(list) {
  const byDay = {};
  milkLotsRaw(list).forEach((l) => {
    const d = dayKey(l.at);
    (byDay[d] = byDay[d] || []).push(l);
  });
  const out = [];
  Object.keys(byDay).sort().forEach((d) => {
    const lots = byDay[d];
    const amB = lots.find((l) => l.type === "milkBulk" && l.session === "am");
    const pmB = lots.find((l) => l.type === "milkBulk" && l.session === "pm");
    if (amB || pmB) {
      if (amB) out.push(amB);
      if (pmB) out.push(pmB);
      return;
    }
    const dayBulk = lots.find((l) => l.type === "milkBulk" && l.session === "day");
    if (dayBulk) { out.push(dayBulk); return; }
    const per = lots.filter((l) => l.type === "milk");
    if (!per.length) return;
    const seen = {}; let liters = 0; let at = per[0].at;
    per.forEach((p) => {
      const k = `${p.animalId}|${p.session}`;
      if (seen[k]) return;
      seen[k] = 1;
      liters += p.liters;
      if (new Date(p.at) < new Date(at)) at = p.at;
    });
    out.push({
      key: `per|${d}`, at, liters, session: "day", byName: per[0].byName,
      loggedAt: per[0].loggedAt, type: "milk",
    });
  });
  return out;
}
/* One production-log row per farm day: morning + evening + total. */
function groupMilkDayRows(lots) {
  const byDay = {};
  (lots || []).forEach((l) => {
    const d = dayKey(l.at);
    const g = byDay[d] || {
      key: `day|${d}`, day: d, at: d, loggedAt: l.loggedAt || l.at,
      byName: l.byName || "—", unit: l.unit, am: 0, pm: 0, extra: 0,
    };
    const sess = l.session || "am";
    if (sess === "pm") g.pm += l.liters || 0;
    else if (sess === "am") g.am += l.liters || 0;
    else g.extra += l.liters || 0;
    const when = l.loggedAt || l.at;
    if (parseWhen(when) >= parseWhen(g.loggedAt)) {
      g.loggedAt = when;
      if (l.byName) g.byName = l.byName;
      if (l.unit) g.unit = l.unit;
    }
    byDay[d] = g;
  });
  return Object.keys(byDay).sort().map((d) => {
    const g = byDay[d];
    const total = +((g.am || 0) + (g.pm || 0) + (g.extra || 0)).toFixed(2);
    return { ...g, liters: total, total, session: "day" };
  });
}
function foldMilkBulkLog(list) {
  const used = new Set();
  const out = [];
  (list || []).forEach((e) => {
    if (e.id && used.has(e.id)) return;
    if (e.type === "milkBulk" && (e.session === "am" || e.session === "pm")) {
      const mate = (list || []).find((x) => x !== e && !(x.id && used.has(x.id)) && x.type === "milkBulk"
        && (x.session === "am" || x.session === "pm") && x.session !== e.session
        && dayKey(x.at) === dayKey(e.at));
      if (mate) {
        if (e.id) used.add(e.id);
        if (mate.id) used.add(mate.id);
        const am = e.session === "am" ? e : mate;
        const pm = e.session === "pm" ? e : mate;
        const later = parseWhen(e.loggedAt || e.at) >= parseWhen(mate.loggedAt || mate.at) ? e : mate;
        out.push({
          ...later,
          session: "day",
          liters: milkRecordLiters(am) + milkRecordLiters(pm),
          amLiters: milkRecordLiters(am),
          pmLiters: milkRecordLiters(pm),
          unit: later.unit || am.unit || pm.unit,
        });
        return;
      }
    }
    out.push(e);
  });
  return out;
}
function milkFreshBand(ageH) {
  if (ageH < 12) return "fresh";
  if (ageH < 24) return "ok";
  if (ageH < 48) return "aging";
  return "old";
}
function milkDeductions(list, asOf) {
  const seen = {}; let sold = 0; let used = 0;
  (list || []).forEach((e) => {
    if (asOf && dayKey(e.at) > asOf) return;
    if (e.type === "sale" && (e.product || "milk") === "milk") {
      if (e.id && seen[e.id]) return;
      if (e.id) seen[e.id] = 1;
      sold += milkRecordLiters(e);
    } else if (e.type === "milkUse") {
      if (e.id && seen[e.id]) return;
      if (e.id) seen[e.id] = 1;
      used += milkRecordLiters(e);
    }
  });
  return { sold, used, total: sold + used };
}
function milkStock(list, asOf = dayKey(Date.now())) {
  const lots = effectiveMilkLots(list).filter((l) => dayKey(l.at) <= asOf)
    .sort((a, b) => parseWhen(a.at) - parseWhen(b.at) || String(a.id || "").localeCompare(String(b.id || "")));
  const { sold, used, total: deduct } = milkDeductions(list, asOf);
  let rem = deduct;
  const now = Date.now();
  const preview = lots.map((l) => {
    const take = Math.min(l.liters, rem);
    rem -= take;
    const remaining = +(l.liters - take).toFixed(2);
    const ageH = Math.max(0, (now - parseWhen(l.at)) / 36e5);
    return { ...l, remaining, consumed: take, ageH, fresh: milkFreshBand(ageH) };
  });
  const produced = +lots.reduce((s, l) => s + l.liters, 0).toFixed(2);
  const available = Math.max(0, +(produced - deduct).toFixed(2));
  return {
    produced, sold, used, available,
    lots: preview.filter((l) => l.remaining > 0.001),
    allLots: preview,
  };
}
function milkTotals(list) {
  const lots = milkLotsRaw(list);
  const byAnimal = {};
  lots.filter((l) => l.type === "milk").forEach((l) => {
    byAnimal[l.animalId] = (byAnimal[l.animalId] || 0) + l.liters;
  });
  const byDay = {};
  effectiveMilkLots(list).forEach((l) => {
    const d = dayKey(l.at);
    byDay[d] = (byDay[d] || 0) + l.liters;
  });
  const total = Object.values(byDay).reduce((s, v) => s + v, 0);
  return {
    total, byAnimal, rows: lots, byDay,
    hasBulk: lots.some((l) => l.type === "milkBulk"),
  };
}
function milkSessionLiters(list, day, session) {
  const dayList = (list || []).filter((e) => dayKey(e.at) === day);
  const hasAmPm = dayList.some((e) => e.type === "milkBulk" && (e.session === "am" || e.session === "pm"));
  if (!hasAmPm) {
    const dayBulk = dayList.find((e) => e.type === "milkBulk" && (e.session === "day" || !e.session));
    if (dayBulk) return session === "day" ? milkRecordLiters(dayBulk) : 0;
  }
  const bulk = dayList.find((e) => e.type === "milkBulk" && e.session === session);
  if (bulk) return milkRecordLiters(bulk);
  if (session === "day") {
    return milkSessionLiters(list, day, "am") + milkSessionLiters(list, day, "pm");
  }
  const seen = {}; let sum = 0;
  dayList.filter((e) => e.type === "milk" && e.session === session).forEach((e) => {
    if (seen[e.animalId]) return;
    seen[e.animalId] = 1;
    sum += milkRecordLiters(e);
  });
  return sum;
}
function milkDayProduced(list, day) {
  const dayList = (list || []).filter((e) => dayKey(e.at) === day);
  const hasAmPm = dayList.some((e) => e.type === "milkBulk" && (e.session === "am" || e.session === "pm"));
  if (hasAmPm) return milkSessionLiters(list, day, "am") + milkSessionLiters(list, day, "pm");
  const dayBulk = dayList.find((e) => e.type === "milkBulk" && (e.session === "day" || !e.session));
  if (dayBulk) return dayBulk.liters || 0;
  return milkSessionLiters(list, day, "am") + milkSessionLiters(list, day, "pm");
}
function milkSoldLiters(list, day) {
  const seen = {}; let sold = 0;
  (list || []).filter((e) => e.type === "sale" && (e.product || "milk") === "milk" && dayKey(e.at) === day)
    .forEach((e) => { if (seen[e.id]) return; seen[e.id] = 1; sold += milkRecordLiters(e); });
  return sold;
}
function milkUsedLiters(list, day) {
  const seen = {}; let used = 0;
  (list || []).filter((e) => e.type === "milkUse" && dayKey(e.at) === day)
    .forEach((e) => { if (seen[e.id]) return; seen[e.id] = 1; used += milkRecordLiters(e); });
  return used;
}
function milkDayBalance(list, day) {
  const am = milkSessionLiters(list, day, "am");
  const pm = milkSessionLiters(list, day, "pm");
  const produced = milkDayProduced(list, day);
  const sold = milkSoldLiters(list, day);
  const used = milkUsedLiters(list, day);
  const stock = milkStock(list, day);
  return {
    am, pm, produced, sold, used,
    available: stock.available,
    dayLeft: Math.max(0, +(produced - sold - used).toFixed(2)),
  };
}
function prodTotals(list, kind) {
  if (kind === "milk") return milkTotals(list);
  const seen = {}; let total = 0; const byAnimal = {}; const rows = []; const byDay = {};
  list.filter((e) => e.type === kind).forEach((e) => {
    const k = `${dayKey(e.at)}|${e.animalId}|${e.session || "d"}`;
    if (k in seen) return;
    seen[k] = 1;
    const v = e.count || 0;
    total += v; byAnimal[e.animalId] = (byAnimal[e.animalId] || 0) + v;
    byDay[dayKey(e.at)] = (byDay[dayKey(e.at)] || 0) + v;
    rows.push(e);
  });
  return { total, byAnimal, rows, byDay };
}
/* Account numbers are positional — derived from the order customers were
   created in, never stored. Nothing to keep in sync, nothing to collide. */
function accNo(customers, id) {
  const i = customers.findIndex((c) => c.id === id);
  return i < 0 ? "\u2014" : `C-${String(i + 1).padStart(4, "0")}`;
}
const WALKIN_ID = "cust-walkin";
const isWalkInCustomer = (c) => !!(c && (c.id === WALKIN_ID || c.kind === "walkin"));
const makeWalkInCustomer = () => ({
  id: WALKIN_ID, kind: "walkin", name: "Walk-in", product: "milk",
  priceL: 0, defaultQty: 0, at: iso(Date.now()),
});
const withWalkInCustomer = (list) => {
  const rows = list || [];
  return rows.some((c) => c.id === WALKIN_ID || c.kind === "walkin") ? rows : [...rows, makeWalkInCustomer()];
};
const customerLabel = (c, t) => (isWalkInCustomer(c) ? t("walkIn") : ((c && c.name) || "—"));
const customerNameById = (customers, id, t) => {
  if (id === WALKIN_ID) return t("walkIn");
  return customerLabel((customers || []).find((x) => x.id === id), t);
};
function supplierNo(suppliers, id) {
  const i = suppliers.findIndex((s) => s.id === id);
  return i < 0 ? "\u2014" : `V-${String(i + 1).padStart(4, "0")}`;
}
const OBL_TYPES = [["contract", "📄", "contract"], ["bill", "🧾", "recurringBill"], ["rent", "🏠", "rent"]];
const OBL_FREQ = [["once", "freqOnce"], ["weekly", "freqWeekly"], ["monthly", "freqMonthly"], ["yearly", "freqYearly"]];
function advanceDue(dk, freq) {
  const d = new Date(dk);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return dayKey(d);
}
function obligationAlert(ob, lang, t) {
  if (!ob.active || !ob.nextDue) return null;
  const days = Math.ceil((new Date(ob.nextDue) - Date.now()) / 864e5);
  const typ = OBL_TYPES.find((x) => x[0] === ob.type);
  const label = typ ? t(typ[2]) : ob.type;
  const amt = ob.amount ? ` · ${fmtC(ob.amount, ob.rate || 0, lang)}` : "";
  if (days < 0) return { tone: C.red, id: ob.id, text: L(lang, `${label} «${ob.title}» متأخر ${Math.abs(days)} ${t("days")}${amt}`, `${label} «${ob.title}» overdue ${Math.abs(days)} ${t("days")}${amt}`) };
  if (days === 0) return { tone: C.red, id: ob.id, text: L(lang, `${label} «${ob.title}» ${t("dueToday")}${amt}`, `${label} «${ob.title}» ${t("dueToday")}${amt}`) };
  if (days <= 7) return { tone: C.amber, id: ob.id, text: L(lang, `${label} «${ob.title}» ${t("dueInDays")} ${days} ${t("days")}${amt}`, `${label} «${ob.title}» ${t("dueInDays")} ${days} ${t("days")}${amt}`) };
  return null;
}
function moneyColor(kind, val = 0) {
  if (kind === "due" || kind === "owing" || kind === "cost") return val > 0 ? C.red : C.green;
  if (kind === "paid" || kind === "income" || kind === "collected") return C.green;
  if (kind === "partial") return C.amber;
  return C.ink;
}
function initials(name) {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0];
}

/* Cash box: real money in (payments) and out (paid expenses / supplier pays / medicine).
   Payment reimbursements are farm expenses (cash out). The receipt is grossed up by the
   deduction so drawer net equals cash actually taken. Older sale reimbursements stay
   as non-cash offsets so historical drawers still reconcile. */
function cashMoveAmount(e) {
  if (e.type === "payment") return +(e.amount || 0);
  if (e.type === "supplierPay") return +(e.amount || 0);
  if (e.type === "expense") return +expenseCounted(e);
  if (e.type === "med") return +(e.cost || 0);
  return 0;
}
function paymentTenderAmount(e, src) {
  const cash = cashMoveAmount(e);
  if (!e || e.type !== "payment") return cash;
  const extra = (src || []).filter((x) => x.origin === "payment_reimbursement" && x.paymentId === e.id)
    .reduce((s, x) => s + (toCents(x.amount) > 0 ? fromCents(toCents(x.amount)) : 0), 0);
  return +(cash + extra).toFixed(2);
}
function cashDeductAmount(e) {
  if (e.origin === "payment_reimbursement") return 0;
  if (e.type === "saleReimburse" && toCents(e.amount) > 0) return +(e.amount || 0);
  if (isCustomerPaidExpense(e) && !e.saleReimburseId && toCents(e.amount) > 0) return +(e.amount || 0);
  return 0;
}
function buildCashBox(entries, { customers = [], suppliers = [], lang, t, custom, from, to } = {}) {
  const cust = (id) => customerNameById(customers, id, t);
  const supp = (id) => (suppliers.find((s) => s.id === id) || {}).name || "—";
  const src = withImpliedSupplierPays(entries);
  const byId = Object.fromEntries(src.filter((e) => e.type === "expense").map((e) => [e.id, e]));
  const moves = src.filter((e) => {
    const amt = e.type === "payment" ? paymentTenderAmount(e, src) : cashMoveAmount(e);
    const deduct = cashDeductAmount(e);
    if (!(amt > 0.0001) && !(deduct > 0.0001)) return false;
    const k = dayKey(e.at);
    if (from && k < from) return false;
    if (to && k > to) return false;
    return true;
  }).slice().sort((a, b) => cmpTx(a, b, "oldest"));

  let opening = 0;
  if (from) {
    src.forEach((e) => {
      const amt = e.type === "payment" ? paymentTenderAmount(e, src) : cashMoveAmount(e);
      if (!(amt > 0.0001)) return;
      if (dayKey(e.at) >= from) return;
      if (e.type === "payment") opening += amt;
      else if (e.type === "supplierPay" || e.type === "expense" || e.type === "med") opening -= amt;
    });
  }
  opening = +opening.toFixed(2);

  let bal = opening;
  let inN = 0, outN = 0;
  const rows = moves.map((e, i) => {
    const deduct = +cashDeductAmount(e).toFixed(2);
    if (deduct > 0.0001) {
      const who = cust(e.customerId);
      const item = e.name || e.note || t("reimbursement");
      const pref = "DC";
      const ref = `${pref}${String(i + 1).padStart(6, "0")}`;
      const parts = [
        { text: t("cashOffset"), tone: "muted" },
        { text: " · " },
        { text: t("cashDeductedFrom"), tone: "out" },
        { text: " " },
        { text: who, tone: "name" },
        { text: ` · ${t("cashPaidFor")} `, tone: "muted" },
        { text: item, tone: "name" },
      ];
      return {
        id: e.id, at: e.at, day: dayKey(e.at), ref, parts, dir: "deduct",
        debit: deduct, credit: deduct, balance: bal, source: e, nonCash: true,
      };
    }
    const amt = +(e.type === "payment" ? paymentTenderAmount(e, src) : cashMoveAmount(e)).toFixed(2);
    const isIn = e.type === "payment";
    if (isIn) { bal = +(bal + amt).toFixed(2); inN += amt; }
    else { bal = +(bal - amt).toFixed(2); outN += amt; }
    const pref = isIn ? "RC" : (e.type === "supplierPay" ? "VP" : e.type === "med" ? "MD" : "PA");
    const ref = `${pref}${String(i + 1).padStart(6, "0")}`;
    let parts;
    if (isIn) {
      parts = [
        { text: t("cashReceivedFrom"), tone: "in" },
        { text: " " },
        { text: cust(e.customerId), tone: "name" },
        e.note ? { text: ` — ${e.note}`, tone: "muted" } : null,
      ].filter(Boolean);
    } else if (e.type === "supplierPay") {
      const who = e.vendor || supp(e.supplierId);
      const linked = e.expenseId ? byId[e.expenseId] : null;
      const cat = linked ? catLabel(linked.category, lang, custom) : null;
      parts = [
        { text: t("cashPaidFor"), tone: "out" },
        { text: " · " },
        { text: who, tone: "name" },
        cat ? { text: ` · ${cat}`, tone: "muted" } : { text: ` · ${t("supplierPays")}`, tone: "muted" },
        e.method === "transfer" ? { text: ` · ${t("transfer")}`, tone: "muted" } : null,
        e.note ? { text: ` — ${e.note}`, tone: "muted" } : null,
      ].filter(Boolean);
    } else if (e.type === "med") {
      const m = MED[e.medType];
      const medName = m ? (lang === "ar" ? m.ar : m.en) : t("medicine");
      parts = [
        { text: t("cashPaidFor"), tone: "out" },
        { text: " · " },
        { text: medName, tone: "name" },
        e.name ? { text: ` (${e.name})`, tone: "muted" } : null,
        e.note ? { text: ` — ${e.note}`, tone: "muted" } : null,
      ].filter(Boolean);
    } else {
      const payReimb = e.origin === "payment_reimbursement";
      const label = payReimb ? (e.note || e.name || catLabel(e.category, lang, custom)) : catLabel(e.category, lang, custom);
      const who = e.vendor || e.party || (payReimb ? cust(e.customerId) : "");
      parts = [
        { text: payReimb ? t("reimbursement") : t("cashPaidFor"), tone: "out" },
        { text: " · " },
        { text: label, tone: "name" },
        who ? { text: ` · ${who}`, tone: "muted" } : null,
        !payReimb && e.note ? { text: ` — ${e.note}`, tone: "muted" } : null,
      ].filter(Boolean);
    }
    return {
      id: e.id, at: e.at, day: dayKey(e.at), ref, parts, dir: isIn ? "in" : "out",
      debit: isIn ? amt : 0, credit: isIn ? 0 : amt, balance: bal, source: e,
    };
  });
  return {
    opening, rows, totalIn: +inN.toFixed(2), totalOut: +outN.toFixed(2),
    closing: rows.length ? rows[rows.length - 1].balance : opening,
  };
}
function CashParts({ parts }) {
  return <span>
    {(parts || []).map((p, i) => {
      const color = p.tone === "in" ? C.green : p.tone === "out" ? C.red
        : p.tone === "name" ? C.field : p.tone === "muted" ? C.inkSoft : C.ink;
      const weight = p.tone === "in" || p.tone === "out" || p.tone === "name" ? 700 : 500;
      return <span key={i} style={{ color, fontWeight: weight }}>{p.text}</span>;
    })}
  </span>;
}

function buildLedger(entries, customers) {
  const sales = entries.filter((e) => e.type === "sale").slice().sort((a, b) => cmpTx(a, b, "oldest"));
  const pays = entries.filter((e) => e.type === "payment").slice().sort((a, b) => cmpTx(a, b, "oldest"));
  const saleIds = new Set(sales.map((s) => s.id));
  const reimbursements = entries.filter((e) => e.type === "saleReimburse" && saleIds.has(e.saleId)
    && toCents(e.amount) > 0).slice().sort((a, b) => cmpTx(a, b, "oldest"));
  const reimbBySale = {};
  reimbursements.forEach((r) => {
    if (!reimbBySale[r.saleId]) reimbBySale[r.saleId] = [];
    reimbBySale[r.saleId].push(r);
  });
  const recC = {}; sales.forEach((s) => { recC[s.id] = 0; });
  const poolC = {};
  const reimbPoolC = {};
  const extraOnSaleC = {};
  const netBySaleC = {};
  sales.forEach((s) => {
    const ownReimbC = (reimbBySale[s.id] || []).reduce((sum, r) => sum + toCents(r.amount), 0);
    const saleC = toCents(s.amount);
    const appliedOwnC = Math.min(saleC, ownReimbC);
    const afterReimb = saleC - appliedOwnC;
    const discC = Math.min(afterReimb, Math.max(0, toCents(s.discountAmount)));
    netBySaleC[s.id] = afterReimb - discC;
    extraOnSaleC[s.id] = 0;
    const extraReimbC = Math.max(0, ownReimbC - saleC);
    if (extraReimbC > 0) reimbPoolC[s.customerId] = (reimbPoolC[s.customerId] || 0) + extraReimbC;
  });
  const paymentDeductions = (entries || []).filter((e) => isDeductionReimbursement(e)
    && e.type === "expense" && deductionCents(e) > 0)
    .slice().sort((a, b) => cmpTx(a, b, "oldest"));
  paymentDeductions.forEach((e) => {
    if (!e.customerId) return;
    reimbPoolC[e.customerId] = (reimbPoolC[e.customerId] || 0) + deductionCents(e);
  });
  /* Leftover reimbursement (sale overflow + payment credits) reduces other invoices as a deduction, not as cash collected. */
  sales.forEach((s) => {
    const takeC = Math.min(netBySaleC[s.id], reimbPoolC[s.customerId] || 0);
    if (takeC > 0) {
      extraOnSaleC[s.id] += takeC;
      netBySaleC[s.id] -= takeC;
      reimbPoolC[s.customerId] -= takeC;
    }
  });
  pays.filter((p) => p.saleId && p.saleId in recC).forEach((p) => {
    const paidC = Math.max(0, toCents(p.amount));
    const roomC = Math.max(0, netBySaleC[p.saleId] - recC[p.saleId]);
    const appliedC = Math.min(roomC, paidC);
    recC[p.saleId] += appliedC;
    if (paidC > appliedC) poolC[p.customerId] = (poolC[p.customerId] || 0) + paidC - appliedC;
  });
  pays.filter((p) => !p.saleId || !(p.saleId in recC)).forEach((p) => {
    poolC[p.customerId] = (poolC[p.customerId] || 0) + Math.max(0, toCents(p.amount));
  });
  const list = sales.map((s, i) => {
    const grossC = toCents(s.amount);
    const reimbRows = reimbBySale[s.id] || [];
    const ownReimbC = reimbRows.reduce((sum, r) => sum + toCents(r.amount), 0);
    const appliedOwnC = Math.min(grossC, ownReimbC);
    const extraC = extraOnSaleC[s.id] || 0;
    const afterOwnC = grossC - appliedOwnC;
    const discountC = Math.min(afterOwnC, Math.max(0, toCents(s.discountAmount)));
    const reimbC = appliedOwnC + extraC;
    const netC = Math.max(0, grossC - reimbC - discountC);
    const remainingC = Math.max(0, netC - recC[s.id]);
    const takeC = Math.min(remainingC, poolC[s.customerId] || 0);
    if (takeC > 0) { recC[s.id] += takeC; poolC[s.customerId] -= takeC; }
    const paidC = Math.min(netC, recC[s.id]);
    const dueC = Math.max(0, netC - paidC);
    const paidAmount = fromCents(paidC);
    const due = fromCents(dueC);
    const extraRow = extraC > 0 ? [{ id: `${s.id}-reimb-acct`, name: "", amount: fromCents(extraC), accountAlloc: true }] : [];
    return { ...s, grossAmount: fromCents(grossC), reimbAmount: fromCents(reimbC),
      discountAmount: fromCents(discountC), discountNote: s.discountNote || "",
      netAmount: fromCents(netC), reimbRows: [...reimbRows, ...extraRow], paidAmount, due, no: `INV-${String(i + 1).padStart(4, "0")}`,
      status: dueC <= 0 ? "paid" : paidC > 0 ? "partial" : "unpaid",
      lateDays: dueC <= 0 ? 0 : Math.max(0, Math.floor((Date.now() - parseWhen(s.at)) / 864e5)) };
  });
  Object.keys(poolC).forEach((cid) => { if (!(poolC[cid] > 0)) delete poolC[cid]; });
  Object.keys(reimbPoolC).forEach((cid) => { if (!(reimbPoolC[cid] > 0)) delete reimbPoolC[cid]; });
  const byCustomer = {};
  const blank = () => ({ gross: 0, net: 0, sold: 0, reimbursed: 0, discounted: 0, deductions: 0, paid: 0, due: 0, oldest: 0, count: 0, credit: 0 });
  (customers || []).forEach((c) => { byCustomer[c.id] = blank(); });
  list.forEach((s) => {
    const b = byCustomer[s.customerId] || (byCustomer[s.customerId] = blank());
    b.gross = fromCents(toCents(b.gross) + toCents(s.grossAmount));
    b.reimbursed = fromCents(toCents(b.reimbursed) + toCents(s.reimbAmount));
    b.discounted = fromCents(toCents(b.discounted) + toCents(s.discountAmount));
    b.deductions = fromCents(toCents(b.reimbursed) + toCents(b.discounted));
    b.net = fromCents(toCents(b.net) + toCents(s.netAmount));
    b.sold = b.net;
    b.paid = fromCents(toCents(b.paid) + toCents(s.paidAmount));
    b.due = fromCents(toCents(b.due) + toCents(s.due));
    b.count += 1;
    if (isOwing(s.due)) b.oldest = Math.max(b.oldest, s.lateDays);
  });
  Object.keys(poolC).forEach((cid) => {
    if (!byCustomer[cid]) byCustomer[cid] = blank();
    if (poolC[cid] > 0) byCustomer[cid].credit = fromCents(poolC[cid]);
  });
  Object.keys(reimbPoolC).forEach((cid) => {
    if (!byCustomer[cid]) byCustomer[cid] = blank();
    if (reimbPoolC[cid] > 0) {
      byCustomer[cid].credit = fromCents(toCents(byCustomer[cid].credit) + reimbPoolC[cid]);
    }
  });
  Object.keys(byCustomer).forEach((cid) => {
    const b = byCustomer[cid];
    if (!isOwing(b.due)) { b.due = 0; b.oldest = 0; }
    if (!(toCents(b.credit) > 0)) b.credit = 0;
  });
  return { list, byCustomer, pays, reimbursements, paymentDeductions };
}
function buildSupplierLedger(entries, suppliers) {
  const src = withImpliedSupplierPays(entries);
  const bills = src.filter((e) => e.type === "expense" && e.supplierId)
    .slice().sort((a, b) => cmpTx(a, b, "oldest"));
  const pays = src.filter((e) => e.type === "supplierPay").slice().sort((a, b) => cmpTx(a, b, "oldest"));
  const recC = {}; bills.forEach((b) => { recC[b.id] = 0; });
  pays.filter((p) => p.expenseId && p.expenseId in recC).forEach((p) => { recC[p.expenseId] += toCents(p.amount); });
  const poolC = {};
  pays.filter((p) => !p.expenseId || !(p.expenseId in recC)).forEach((p) => {
    poolC[p.supplierId] = (poolC[p.supplierId] || 0) + toCents(p.amount);
  });
  /* Overpay on a linked bill spills into supplier credit. */
  bills.forEach((b) => {
    const billC = toCents(b.amount);
    if (recC[b.id] > billC) {
      poolC[b.supplierId] = (poolC[b.supplierId] || 0) + (recC[b.id] - billC);
      recC[b.id] = billC;
    }
  });
  const list = bills.map((b, i) => {
    const billC = toCents(b.amount);
    let paidC = recC[b.id] || 0;
    const need = Math.max(0, billC - paidC);
    const take = Math.min(need, poolC[b.supplierId] || 0);
    if (take > 0) { paidC += take; poolC[b.supplierId] -= take; recC[b.id] = paidC; }
    const paidAmount = fromCents(Math.min(billC, paidC));
    const due = fromCents(Math.max(0, billC - toCents(paidAmount)));
    const dueDate = b.dueDate || dayKey(b.at);
    /* Compare calendar days in UTC Y-M-D parts so TZ does not shift “due on”. */
    const lateDays = due > 0 ? (() => {
      const [yy, mm, dd] = String(dueDate).split("-").map(Number);
      const [ty, tm, td] = dayKey(Date.now()).split("-").map(Number);
      if (!yy || !ty) return 0;
      return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(yy, mm - 1, dd)) / 864e5));
    })() : 0;
    return { ...b, paidAmount, due, dueDate, no: `BILL-${String(i + 1).padStart(4, "0")}`,
      status: moneyStatus(billC, toCents(paidAmount)), lateDays, overdue: due > 0 && lateDays > 0 };
  });
  const bySupplier = {};
  const blank = () => ({ bought: 0, paid: 0, due: 0, oldest: 0, count: 0, credit: 0, openCount: 0, overdueDue: 0, lastAt: null });
  (suppliers || []).forEach((s) => { bySupplier[s.id] = blank(); });
  list.forEach((b) => {
    const row = bySupplier[b.supplierId] || (bySupplier[b.supplierId] = blank());
    row.bought = fromCents(toCents(row.bought) + toCents(b.amount));
    row.paid = fromCents(toCents(row.paid) + toCents(b.paidAmount));
    row.due = fromCents(toCents(row.due) + toCents(b.due));
    row.count += 1;
    if (b.due > 0) {
      row.openCount += 1;
      row.oldest = Math.max(row.oldest, b.lateDays);
      if (b.overdue) row.overdueDue = fromCents(toCents(row.overdueDue) + toCents(b.due));
    }
    if (!row.lastAt || parseWhen(b.at) > parseWhen(row.lastAt)) row.lastAt = b.at;
  });
  pays.forEach((p) => {
    const row = bySupplier[p.supplierId];
    if (!row) return;
    if (!row.lastAt || parseWhen(p.at) > parseWhen(row.lastAt)) row.lastAt = p.at;
  });
  Object.keys(poolC).forEach((sid) => {
    if (bySupplier[sid] && poolC[sid] > 0) bySupplier[sid].credit = fromCents(poolC[sid]);
  });
  return { list, bySupplier, pays: pays.filter((p) => !p.implied), allPays: pays,
    byBill: Object.fromEntries(list.map((b) => [b.id, b])) };
}
function computeSums(list, S, workers, days, includePayroll = true) {
  const milk = milkTotals(list), eggs = prodTotals(list, "eggs");
  const sales = list.filter((e) => e.type === "sale");
  const reimbBySaleC = {};
  list.filter((e) => e.type === "saleReimburse" && e.saleId).forEach((e) => {
    reimbBySaleC[e.saleId] = (reimbBySaleC[e.saleId] || 0) + Math.max(0, toCents(e.amount));
  });
  const grossInvoiced = fromCents(sales.reduce((sum, sale) => sum + toCents(sale.amount), 0));
  const payDeductC = list.filter((e) => isDeductionReimbursement(e) && e.type === "expense")
    .reduce((sum, e) => sum + deductionCents(e), 0);
  const reimbursed = fromCents(sales.reduce((sum, sale) =>
    sum + Math.min(toCents(sale.amount), reimbBySaleC[sale.id] || 0), 0) + payDeductC);
  const discounted = fromCents(sales.reduce((sum, sale) => {
    const afterReimb = Math.max(0, toCents(sale.amount) - (reimbBySaleC[sale.id] || 0));
    return sum + Math.min(afterReimb, Math.max(0, toCents(sale.discountAmount)));
  }, 0));
  const invoiced = fromCents(Math.max(0, toCents(grossInvoiced) - toCents(reimbursed) - toCents(discounted)));
  const collected = list.filter((e) => e.type === "payment").reduce((a, b) => a + b.amount, 0);
  const byProduct = {};
  sales.forEach((s) => {
    const afterReimb = Math.max(0, toCents(s.amount) - (reimbBySaleC[s.id] || 0));
    const discC = Math.min(afterReimb, Math.max(0, toCents(s.discountAmount)));
    const net = fromCents(Math.max(0, afterReimb - discC));
    byProduct[s.product] = fromCents(toCents(byProduct[s.product]) + toCents(net));
  });
  const byCategory = {};
  const add = (k, v) => { byCategory[k] = (byCategory[k] || 0) + (v || 0); };
  /* Accrual: supplier purchases count in full whether owed or paid.
     Customer-paid reimbursements are expenses on the expense register, but when
     this list also has sales they already reduced invoiced AR — skip them here. */
  const skipCustomerPaidCosts = list.some((e) => e.type === "sale");
  list.filter((e) => e.type === "expense").forEach((e) => {
    if (skipCustomerPaidCosts && (isCustomerPaidExpense(e) || isDeductionReimbursement(e))) return;
    add(e.category || "other", expenseAccrued(e));
  });
  /* a medicine record is both a health note and a cost — recorded once, counted once */
  list.filter((e) => e.type === "med").forEach((e) => add("medicine", e.cost));
  const feedRows = list.filter((e) => e.type === "expense" && ["feed", "hay"].includes(e.category || ""));
  const feedByType = {}; const feedQty = {};
  feedRows.forEach((e) => { const k = e.feedType || (e.category === "hay" ? "hay" : "otherFeed");
    const amt = expenseAccrued(e);
    feedByType[k] = (feedByType[k] || 0) + amt;
    if (e.qty && amt > 0) feedQty[k] = (feedQty[k] || 0) + (e.unit === "bag" ? e.qty * BAG_KG : e.qty); });
  const att = {};
  list.filter((e) => e.type === "attend").forEach((e) => { const k = `${dayKey(e.at)}|${e.workerId}`; if (!(k in att)) att[k] = e; });
  const shifts = Object.values(att).filter((e) => e.present).length;
  const monthly = (workers || []).filter((w) => w.type === "monthly").reduce((a, b) => a + (b.salary || 0), 0);
  const laborPayroll = includePayroll ? shifts * (S.wage || 0) + (monthly * days) / 30 : 0;
  add("labour", laborPayroll);                       // wages join the same ledger
  const laborCost = byCategory.labour || 0;
  const feedCost = (byCategory.feed || 0) + (byCategory.hay || 0);
  const medCost = byCategory.medicine || 0;
  const buyCost = byCategory.livestock || 0;
  const estValue = milk.total * (S.milkPrice || 0) + eggs.total * (S.eggPrice || 0);
  const income = invoiced;
  const costs = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const losses = list.filter((e) => e.type === "loss").reduce((a, b) => a + (b.count || 0), 0);
  const birthRows = list.filter((e) => e.type === "birth");
  const births = birthRows.reduce((a, b) => a + (b.count || 0), 0);
  const birthMales = birthRows.reduce((a, b) => a + (b.males || 0), 0);
  const birthFemales = birthRows.reduce((a, b) => a + (b.females || 0), 0);
  const stillborn = birthRows.reduce((a, b) => a + (b.dead || 0), 0);
  const twinning = birthRows.length ? birthRows.filter((b) => (b.count || 1) > 1).length / birthRows.length : 0;
  return { milk: milk.total, byMilk: milk.byAnimal, milkBulk: milk.hasBulk, eggs: eggs.total, byEggs: eggs.byAnimal,
    grossInvoiced, reimbursed, discounted, deductions: fromCents(toCents(reimbursed) + toCents(discounted)), invoiced, collected, byProduct, estValue, byCategory, laborPayroll,
    medCost, feedCost, feedByType, feedQty, buyCost, laborCost, shifts,
    income, costs, profit: income - costs, losses, births, birthMales, birthFemales, stillborn, twinning, birthRows };
}
const pct = (now, before) => (before ? ((now - before) / before) * 100 : null);

function smartSummary({ lang, t, sums, prev, days, animals, workers, scoped, S, outstanding, customers, ledger }) {
  const out = [];
  const ar = lang === "ar";
  const money = (v) => fmt(v, S.rate, lang);
  const milkers = animals.filter((a) => producesMilk(a) && a.status !== "dry" && a.status !== "sick");
  const birds = animals.filter(producesEggs).reduce((s, a) => s + headCount(a), 0);

  if (sums.milk > 0) {
    const perHead = sums.milk / days / Math.max(1, milkers.length);
    out.push({ icon: "🥛", text: ar
      ? `أُنتج ${nf(sums.milk)} ليتر حليب خلال ${days} يومًا، بمعدل ${n1(perHead)} ليتر لكل رأس يوميًا.`
      : `${nf(sums.milk)} liters of milk over ${days} days, averaging ${n1(perHead)} L per head per day.` });
    const p = pct(sums.milk, prev.milk);
    if (p !== null && Math.abs(p) >= 3) out.push({ icon: p > 0 ? "📈" : "📉", tone: p > 0 ? C.green : C.red, text: ar
      ? `${p > 0 ? "ارتفع" : "انخفض"} إنتاج الحليب ${Math.abs(p).toFixed(0)}٪ عن الفترة السابقة (${nf(prev.milk)} ليتر).`
      : `Milk is ${p > 0 ? "up" : "down"} ${Math.abs(p).toFixed(0)}% versus the previous period (${nf(prev.milk)} L).` });
  }
  if (sums.eggs > 0) {
    const rate = birds > 0 ? (sums.eggs / days / birds) * 100 : null;
    out.push({ icon: "🥚", text: ar
      ? `جُمعت ${nf(sums.eggs)} بيضة${rate !== null ? `، أي نسبة إنتاج ${rate.toFixed(0)}٪ من عدد الطيور` : ""}.`
      : `${nf(sums.eggs)} eggs collected${rate !== null ? `, a lay rate of ${rate.toFixed(0)}%` : ""}.` });
    if (rate !== null && rate < 55) out.push({ icon: "⚠️", tone: C.amber, text: ar
      ? "نسبة إنتاج البيض أقل من المعدل الجيد (٦٠–٨٠٪). راجع العلف والإضاءة ودرجة الحرارة."
      : "The lay rate is below the healthy 60–80% range. Check feed, lighting and temperature." });
  }
  if (sums.milk === 0 && sums.eggs === 0) out.push({ icon: "📋", text: ar ? "لم يُسجَّل أي إنتاج في هذه الفترة." : "No production was logged in this period." });

  const margin = sums.income > 0 ? (sums.profit / sums.income) * 100 : null;
  out.push({ icon: sums.profit >= 0 ? "💰" : "🔻", tone: sums.profit >= 0 ? C.green : C.red, text: ar
    ? `${sums.profit >= 0 ? "الربح الصافي" : "الخسارة"} ${money(Math.abs(sums.profit))} من مدخول ${money(sums.income)} ومصاريف ${money(sums.costs)}${margin !== null ? ` (هامش ${margin.toFixed(0)}٪)` : ""}.`
    : `${sums.profit >= 0 ? "Net profit" : "Loss"} of ${money(Math.abs(sums.profit))} from ${money(sums.income)} income and ${money(sums.costs)} costs${margin !== null ? ` (${margin.toFixed(0)}% margin)` : ""}.` });

  if (sums.estValue > 0 && sums.invoiced < sums.estValue * 0.75) out.push({ icon: "🧮", tone: C.amber, text: ar
    ? `قيمة الإنتاج التقديرية ${money(sums.estValue)} بينما الفواتير ${money(sums.invoiced)} — الفارق استهلاك داخلي أو إنتاج غير مُسجَّل بيعه.`
    : `Production is worth about ${money(sums.estValue)} but only ${money(sums.invoiced)} was invoiced — the gap is home use or unrecorded sales.` });

  if (sums.feedCost > 0 && (sums.milk > 0 || sums.eggs > 0)) {
    const perL = sums.milk > 0 ? sums.feedCost / sums.milk : null;
    const perE = sums.eggs > 0 ? sums.feedCost / sums.eggs : null;
    const bits = [];
    if (perL !== null) bits.push(ar ? `${money(perL)} لكل ليتر حليب` : `${money(perL)} per liter of milk`);
    if (perE !== null) bits.push(ar ? `${money(perE)} لكل بيضة` : `${money(perE)} per egg`);
    out.push({ icon: "🌾", text: ar
      ? `كلفة العلف ${money(sums.feedCost)}: ${bits.join("، ")}.`
      : `Feed cost ${money(sums.feedCost)}: ${bits.join(", ")}.` });
    if (perL !== null && S.milkPrice > 0 && perL > S.milkPrice * 0.6) out.push({ icon: "⚠️", tone: C.red, text: ar
      ? `العلف يستهلك ${((perL / S.milkPrice) * 100).toFixed(0)}٪ من سعر بيع الليتر — الهامش ضيق.`
      : `Feed eats ${((perL / S.milkPrice) * 100).toFixed(0)}% of the milk price — the margin is thin.` });
  }
  const top = Object.entries(sums.byCategory || {}).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0) out.push({ icon: "📊", text: ar
    ? `أكبر بند مصاريف هو ${catLabel(top[0], "ar")} بقيمة ${money(top[1])} (${((top[1] / sums.costs) * 100).toFixed(0)}٪ من المصاريف).`
    : `Biggest cost is ${catLabel(top[0], "en")} at ${money(top[1])} (${((top[1] / sums.costs) * 100).toFixed(0)}% of costs).` });

  if (outstanding > 0) {
    const worst = (customers || []).map((c) => ({ c, b: (ledger && ledger.byCustomer[c.id]) || { due: 0, oldest: 0 } }))
      .filter((x) => x.b.due > 0).sort((a, b) => b.b.due - a.b.due)[0];
    out.push({ icon: "⏳", tone: C.red, text: ar
      ? `المستحقات غير المحصّلة ${money(outstanding)}${worst ? `، أكبرها على ${customerLabel(worst.c, t)} بقيمة ${money(worst.b.due)} منذ ${worst.b.oldest} يومًا` : ""}.`
      : `Outstanding receivables ${money(outstanding)}${worst ? `, largest from ${customerLabel(worst.c, t)} at ${money(worst.b.due)}, ${worst.b.oldest} days old` : ""}.` });
  }

  const due = animals.filter((a) => a.due && (new Date(a.due) - Date.now()) / 864e5 <= 30 && new Date(a.due) >= Date.now());
  if (due.length) out.push({ icon: "🍼", tone: C.amber, text: ar
    ? `${due.length} ${due.length > 2 ? "حيوانات" : "حيوان"} ستلد خلال ٣٠ يومًا: ${due.map((a) => animalLabel(a)).join("، ")}.`
    : `${due.length} due to give birth within 30 days: ${due.map((a) => animalLabel(a)).join(", ")}.` });

  if (sums.losses > 0) {
    const flockHeads = animals.filter(isFlock).reduce((s, a) => s + headCount(a), 0);
    const r = flockHeads > 0 ? (sums.losses / (flockHeads + sums.losses)) * 100 : null;
    out.push({ icon: "💀", tone: r !== null && r > 5 ? C.red : C.amber, text: ar
      ? `نفق ${sums.losses} رأس${r !== null ? ` أي ${r.toFixed(1)}٪ من القطيع` : ""}.${r !== null && r > 5 ? " النسبة مرتفعة، يُنصح بمراجعة بيطرية." : ""}`
      : `${sums.losses} losses recorded${r !== null ? `, about ${r.toFixed(1)}% of the flock` : ""}.${r !== null && r > 5 ? " That is high — a vet check is advised." : ""}` });
  }
  if (sums.births > 0) {
    const mix = sums.birthMales + sums.birthFemales > 0 ? (ar ? ` (${sums.birthMales} ذكور، ${sums.birthFemales} إناث)` : ` (${sums.birthMales} male, ${sums.birthFemales} female)`) : "";
    out.push({ icon: "🐣", tone: C.green, text: ar
      ? `سُجِّل ${sums.births} مولودًا جديدًا${mix}${sums.twinning > 0 ? `، ونسبة التوائم ${Math.round(sums.twinning * 100)}٪` : ""}.`
      : `${sums.births} newborns recorded${mix}${sums.twinning > 0 ? `, twinning rate ${Math.round(sums.twinning * 100)}%` : ""}.` });
    if (sums.stillborn > 0) out.push({ icon: "💀", tone: C.red, text: ar
      ? `${sums.stillborn} مولودًا نفق عند الولادة.` : `${sums.stillborn} born dead.` });
  }

  const sick = animals.filter((a) => a.status === "sick");
  if (sick.length || sums.medCost > 0) out.push({ icon: "🩺", text: ar
    ? `${sick.length} حالة مرضية، وكلفة الأدوية ${money(sums.medCost)}.`
    : `${sick.length} sick, medicine cost ${money(sums.medCost)}.` });
  if (sums.shifts > 0) out.push({ icon: "👷", text: ar
    ? `${sums.shifts} يوم عمل مياومة بأجور ${money(sums.shifts * (S.wage || 0))}.`
    : `${sums.shifts} daily-worker shifts costing ${money(sums.shifts * (S.wage || 0))}.` });

  const loggedDays = new Set(scoped.filter((e) => e.type === "milk" || e.type === "eggs").map((e) => dayKey(e.at))).size;
  if (days > 1 && loggedDays < days) out.push({ icon: "📅", tone: C.amber, text: ar
    ? `لم يُسجَّل الإنتاج في ${days - loggedDays} يومًا من أصل ${days}، لذا قد تكون الأرقام ناقصة.`
    : `Production was not logged on ${days - loggedDays} of ${days} days, so figures may be incomplete.` });
  return out;
}

/* ------------------------------ file writers ------------------------------ */
function downloadBlob(text, filename, mime) {
  const blob = new Blob(["\ufeff", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
}
const xesc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function buildSpreadsheetML(sheets, rtl) {
  const cell = (v) => {
    if (v === null || v === undefined || v === "") return "<Cell/>";
    const isNum = typeof v === "number" && isFinite(v);
    return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${xesc(v)}</Data></Cell>`;
  };
  const body = sheets.map((sh) => {
    const name = xesc(String(sh.name).slice(0, 30).replace(/[[\]:*?/\\]/g, " "));
    const cols = (sh.cols || []).map((w) => `<Column ss:Width="${Math.round((w || 12) * 7)}"/>`).join("");
    const rows = sh.rows.map((r, i) => `<Row${i === 0 ? ' ss:StyleID="hdr"' : ""}>${(r || []).map(cell).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${name}"><Table>${cols}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">${rtl ? "<DisplayRightToLeft/>" : ""}<FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
<Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2C3E70" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style></Styles>
${body}</Workbook>`;
}

function buildSheets({ lang, t, sums, S, days, period, me, animals, workers, customers, scoped, scopedSales, ledger, outstanding, summaryLines }) {
  const aOf = (id) => animals.find((a) => a.id === id);
  const aLbl = (id) => { const a = aOf(id); return a ? `${spOf(a).icon} ${animalLabel(a)}` : "—"; };
  const d = (e) => dmy(e.at, lang), h = (e) => hhmm(e.at);
  const r2 = (n) => Math.round((n || 0) * 100) / 100;
  const money = (n) => fmt(n, S.rate, lang);
  const sheets = [];

  sheets.push({ name: t("shSummary"), cols: [44, 16, 18], rows: [
    [S.farmName || t("appName")],
    [S.farmAddress || "", S.farmPhone || ""],
    [t("poweredBy"), `v${VERSION.code}`],
    [t("period"), period, `${days} ${t("days")}`],
    [t("generated"), `${dmy(Date.now(), lang)} ${hhmm(Date.now())}`],
    [t("preparedBy"), me.name], [t("rate"), S.rate, "LBP / USD"], [],
    [t("colItem"), t("amount")],
    [t("accountTotal"), money(sums.grossInvoiced)],
    [t("deductions"), money(-(sums.deductions || 0))],
    [t("salesIncome"), money(sums.invoiced)],
    [t("feed"), money(-sums.feedCost)],
    [t("labour"), money(-sums.laborCost)],
    [t("medicine"), money(-sums.medCost)],
    [t("purchases"), money(-sums.buyCost)],
    [t("profit"), money(sums.profit)], [],
    [t("collected"), money(sums.collected)], [t("outstanding"), money(outstanding)], [],
    [t("totalLiters"), r2(sums.milk)], [t("totalEggs"), r2(sums.eggs)],
    [t("losses"), sums.losses], [t("births"), sums.births],
    [t("herdSize"), animals.reduce((s, a) => s + headCount(a), 0)], [],
    [t("summary")], ...summaryLines.map((l) => [l.text]),
  ] });

  const prodRows = [];
  const milkRows = milkTotals(scoped).rows;
  groupMilkDayRows(milkRows.filter((e) => e.type === "milkBulk")).forEach((e) => prodRows.push([
    dmy(e.day), hhmm(e.loggedAt || e.at), t("herdTotal"), t("milk"),
    `${t("morning")} ${n1(e.am || 0)} · ${t("evening")} ${n1(e.pm || 0)}`, e.total, t("L"), e.byName,
  ]));
  milkRows.filter((e) => e.type === "milk").forEach((e) => prodRows.push([d(e), h(e),
    aLbl(e.animalId), t("milk"),
    e.session === "am" ? t("morning") : e.session === "pm" ? t("evening") : t("dayMilkTotal"), e.liters, t("L"), e.byName]));
  prodTotals(scoped, "eggs").rows.forEach((e) => prodRows.push([d(e), h(e), aLbl(e.animalId), t("eggs"), "", e.count, t("eggsUnit"), e.byName]));
  sheets.push({ name: t("shProd"), cols: [12, 8, 20, 10, 14, 10, 8, 16],
    rows: [[t("colDate"), t("colTime"), t("colName"), t("colType"), "", t("colValue"), "", t("colUser")], ...prodRows] });

  sheets.push({ name: t("shHerd"), cols: [10, 18, 12, 14, 14, 10, 12, 14, 12, 12, 22, 26],
    rows: [[t("species"), t("colName"), t("status"), t("breed"), t("age"), t("count"), `${t("weight")} ${t("kg")}`,
      t("expected"), t("parity"), t("source"), t("medicineNote"), t("notes")],
    ...animals.map((a) => [spName(a.species, lang, true), animalLabel(a), statusLabel(a.status, lang), breedLabel(a, lang),
      isFlock(a) ? "" : ageText(a, lang), headCount(a), a.weight || "", a.expected || "", a.parity || 0,
      a.source === "bought" ? t("bought") : t("born"), a.medicine || "", a.notes || ""])] });

  sheets.push({ name: t("shSales"), cols: [12, 8, 20, 12, 10, 16, 20, 20, 20, 20, 20, 13, 16],
    rows: [[t("colDate"), t("colTime"), t("customerName"), t("product"), t("qty"), t("unitPrice"), t("grossSubtotal"),
      t("reimbursementTotal"), t("discount"), t("netInvoiceTotal"), t("amountPaid"), t("due"), t("payStatus"), t("colUser")],
    ...(scopedSales || []).map((iv) => {
      const pr = PRODUCTS.find((p) => p[0] === iv.product) || PROD_OTHER;
      return [dmy(iv.at), hhmm(iv.at), customerNameById(customers, iv.customerId, t), lang === "ar" ? pr[2] : pr[3],
        `${iv.qty} ${saleQtyUnit(iv, lang, t)}`, money(iv.price), money(iv.grossAmount), money(iv.reimbAmount),
        money(iv.discountAmount || 0), money(iv.netAmount), money(iv.paidAmount), isOwing(iv.due) ? money(iv.due) : "",
        iv.status === "paid" ? t("paidS") : iv.status === "partial" ? t("partial") : t("unpaid"), iv.byName];
    })] });

  sheets.push({ name: t("shCustomers"), cols: [22, 16, 18, 12, 10, 18, 18, 18, 18, 18, 11, 12],
    rows: [[t("customerName"), t("phone"), t("customerPrice"), t("dailyQty"), t("invoice"), t("totalSold"),
      t("grossSubtotal"), t("reimbursementTotal"), t("collected"), t("due"), t("daysLate"), t("payStatus")],
    ...(customers || []).map((c) => {
      const b = (ledger && ledger.byCustomer[c.id]) || { sold: 0, paid: 0, due: 0, oldest: 0, count: 0 };
      return [customerLabel(c, t), c.phone || "", c.priceL ? money(c.priceL) : "", c.defaultQty || "", b.count, money(b.sold),
        money(b.gross || b.sold), money(b.reimbursed), money(b.paid), isOwing(b.due) ? money(b.due) : "",
        isOwing(b.due) ? b.oldest : 0, isOwing(b.due) ? t("unpaid") : t("paidS")];
    }), [], [t("outstanding"), "", "", "", "", "", "", "", "", money(outstanding)]] });

  sheets.push({ name: t("shMed"), cols: [12, 8, 20, 14, 10, 16],
    rows: [[t("colDate"), t("colTime"), t("colName"), t("colType"), t("colCost"), t("colUser")],
    ...scoped.filter((e) => e.type === "med").map((e) => [d(e), h(e), aLbl(e.animalId),
      MED[e.medType] ? (lang === "ar" ? MED[e.medType].ar : MED[e.medType].en) : "", money(e.cost), e.byName])] });

  sheets.push({ name: t("shWorkers"), cols: [12, 8, 20, 12, 10, 16],
    rows: [[t("colDate"), t("colTime"), t("colName"), t("colValue"), t("colCost"), t("colUser")],
    ...scoped.filter((e) => e.type === "attend").map((e) => {
      const w = (workers || []).find((x) => x.id === e.workerId);
      return [d(e), h(e), w ? w.name : "—", e.present ? t("present") : t("absent"), e.present ? money(S.wage) : "", e.byName];
    })] });

  sheets.push({ name: t("shMoney"), cols: [12, 8, 18, 26, 12, 10, 16],
    rows: [[t("colDate"), t("colTime"), t("category"), t("colItem"), t("amount"), t("attachment"), t("colUser")],
    ...scoped.filter((e) => e.type === "expense").map((e) => [d(e), h(e),
      catLabel(e.category, lang, S.categories),
      [e.feedType ? t(e.feedType) : "", expenseQtyLabel(e, t),
        e.supplier || "", e.note || "", e.species ? spName(e.species, lang) : "",
        e.animalId ? aLbl(e.animalId) : ""].filter(Boolean).join(" · "),
      money(-(e.amount || 0)), e.receipt ? t("attached") : "", e.byName]),
    [], [t("byCategory")],
    ...Object.entries(sums.byCategory || {}).filter(([, v]) => v > 0).map(([k, v]) => ["", "", catLabel(k, lang, S.categories), "", money(-v), "", ""])] });

  const label = { milk: t("milk"), eggs: t("eggs"), med: t("meds"), attend: t("workers"), feed: t("feed"),
    sale: t("newSale"), saleReimburse: t("reimbursement"), payment: t("recordPayment"), purchase: t("purchases"), setting: t("settings"),
    animalAdd: t("addAnimal"), animalEdit: t("editAnimal"), workerAdd: t("addWorker"), customerAdd: t("addCustomer"),
    profile: t("createProfile"), profileSecurity: t("security"), status: t("changeStatus"), due: t("dueDate"),
    loss: t("losses"), birth: t("births"), weight: t("weighIn") };
  const scopedSaleIds = new Set((scopedSales || []).map((s) => s.id));
  const auditRows = [...scoped, ...((ledger && ledger.reimbursements) || [])
    .filter((r) => scopedSaleIds.has(r.saleId) && !scoped.some((e) => e.id === r.id))];
  sheets.push({ name: t("shLog"), cols: [12, 8, 16, 18, 22, 12],
    rows: [[t("colDate"), t("colTime"), t("colUser"), t("colType"), t("colNote"), t("colValue")],
    ...auditRows.map((e) => [d(e), h(e), e.byName, label[e.type] || e.type,
      e.animalId ? aLbl(e.animalId) : e.workerId ? ((workers.find((w) => w.id === e.workerId) || {}).name || "")
        : e.customerId ? customerNameById(customers, e.customerId, t) : e.name || e.field || "",
      e.liters ?? e.count ?? e.cost ?? e.amount ?? e.kg ?? e.value ?? (e.present === undefined ? "" : (e.present ? t("present") : t("absent")))])] });

  return sheets;
}
function exportExcel(opts) {
  return writeSheets(buildSheets(opts), opts.lang, `Mazraati-${dayKey(Date.now())}`);
}
/* One customer's ledger as its own workbook — the sheet a farmer actually
   sends to the person who owes them money. */
function exportAccount({ customer, no, rows, pays, lang, t, S }) {
  const money = (v) => fmt(v, S.rate, lang);
  const gross = fromCents(rows.reduce((sum, x) => sum + toCents(x.grossAmount), 0));
  const reimbursed = fromCents(rows.reduce((sum, x) => sum + toCents(x.reimbAmount), 0));
  const net = fromCents(rows.reduce((sum, x) => sum + toCents(x.netAmount), 0));
  const sheets = [
    { name: t("account"), cols: [18, 26], rows: [
      [t("customerName"), customerLabel(customer, t)],
      [t("accountNo"), no],
      [t("phone"), customer.phone || "\u2014"],
      [t("since"), dmy(customer.at)],
      [t("rate"), S.rate],
      [],
      [t("accountTotal"), money(gross)],
      [t("deductions"), money(fromCents(toCents(reimbursed) + rows.reduce((sum, x) => sum + toCents(x.discountAmount), 0)))],
      [t("reimbursementTotal"), money(reimbursed)],
      [t("discount"), money(fromCents(rows.reduce((sum, x) => sum + toCents(x.discountAmount), 0)))],
      [t("netInvoiceTotal"), money(net)],
      [t("collected"), money(fromCents(rows.reduce((sum, x) => sum + toCents(x.paidAmount), 0)))],
      [t("due"), money(fromCents(rows.reduce((sum, x) => sum + toCents(x.due), 0)))],
    ] },
    { name: t("transactions"), cols: [12, 12, 14, 10, 10, 12, 12, 12, 12, 12, 12, 24], rows: [
      [t("colDate"), t("invoiceNo"), t("product"), t("colQty"), t("colUnit"),
       t("grossSubtotal"), t("reimbursementTotal"), t("discount"), t("netInvoiceTotal"), t("colPaid"), t("colDue"), t("colStatus"), t("colNotes")],
      ...rows.flatMap((x) => { const pr = PRODUCTS.find((p) => p[0] === x.product);
        const saleRow = [dmy(x.at), x.no, pr ? (lang === "ar" ? pr[2] : pr[3]) : x.product,
          x.qty, money(x.price), money(x.grossAmount), money(x.reimbAmount), money(x.discountAmount || 0), money(x.netAmount), money(x.paidAmount), money(x.due),
          x.status === "paid" ? t("paidS") : x.status === "partial" ? t("partial") : t("unpaid"),
          x.note || ""];
        const reimbRows = (x.reimbRows || []).map((r) => [dmy(r.at), x.no, `↩ ${t("reimbursement")}`,
          "", "", "", money(r.amount), "", "", "", "", r.name || ""]);
        return [saleRow, ...reimbRows];
      }),
    ] },
    { name: t("payments"), cols: [12, 12, 14, 24], rows: [
      [t("colDate"), t("paymentAmount"), t("method"), t("colNote")],
      ...pays.map((p) => [dmy(p.at), money(p.amount), p.method === "transfer" ? t("transfer") : t("cash"), p.note || ""]),
    ] },
  ];
  return writeSheets(sheets, lang, `${customerLabel(customer, t)}-${no}`);
}
function writeSheets(sheets, lang, fname) {
  const X = typeof window !== "undefined" ? window.XLSX : null;
  if (X && X.utils) {
    const wb = X.utils.book_new();
    if (lang === "ar") wb.Workbook = { Views: [{ RTL: true }] };
    sheets.forEach((sh) => {
      const ws = X.utils.aoa_to_sheet(sh.rows);
      ws["!cols"] = (sh.cols || []).map((w) => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, String(sh.name).slice(0, 30));
    });
    X.writeFile(wb, `${fname}.xlsx`);
    return "xlsx";
  }
  downloadBlob(buildSpreadsheetML(sheets, lang === "ar"), `${fname}.xls`, "application/vnd.ms-excel");
  return "xls";
}
function backupCSV(data, t, lang) {
  const q = (v) => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
  const out = [];
  const sec = (title, head, rows) => { out.push(q(title)); out.push(head.map(q).join(",")); rows.forEach((r) => out.push(r.map(q).join(","))); out.push(""); };
  sec(t("shHerd"), [t("species"), t("colName"), t("status"), t("breed"), t("count"), t("expected"), t("medicineNote"), t("notes")],
    (data.animals || []).map((a) => [a.species, animalLabel(a), a.status, a.breed, headCount(a), a.expected, a.medicine, a.notes]));
  sec(t("shCustomers"), [t("customerName"), t("phone"), t("customerPrice"), t("dailyQty")],
    (data.customers || []).map((c) => [c.name, c.phone, c.priceL, c.defaultQty]));
  sec(t("workers"), [t("colName"), t("workerType"), t("salary")],
    (data.workers || []).map((w) => [w.name, w.type, w.salary || ""]));
  sec(t("shLog"), [t("colDate"), t("colTime"), t("colUser"), t("colType"), t("colValue"), t("colNote")],
    (data.entries || []).map((e) => [dayKey(e.at), hhmm(e.at), e.byName, e.type,
      e.liters ?? e.count ?? e.cost ?? e.amount ?? e.kg ?? "", e.name || e.field || e.medType || e.product || ""]));
  return out.join("\n");
}

/* ============================ UI KIT ============================ */
let sh1, sh2, inp, primaryBtn, secondaryBtn, rowBtn;
const pad = { padding: 0 };
function refreshUiTokens() {
  sh1 = `0 1px 2px ${C.shadow}, 0 0 0 1px ${C.line}`;
  sh2 = `0 8px 24px ${C.shadow}, 0 0 0 1px ${C.line}`;
  inp = { border: `1px solid ${C.line}`, borderRadius: 10,
    padding: "13px 14px", fontSize: 16.5, fontFamily: "var(--body)", background: C.card, color: C.ink, width: "100%", outline: "none",
    transition: "border-color .15s ease, box-shadow .15s ease" };
  primaryBtn = { background: `linear-gradient(180deg, ${C.field} 0%, ${C.fieldDeep} 100%)`, color: "#fff", border: "none",
    borderRadius: 10, padding: "15px 18px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)",
    width: "100%", minHeight: 44, letterSpacing: ".01em", boxShadow: `0 6px 16px ${C.field}33` };
  secondaryBtn = { background: C.paper, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10,
    padding: "14px 18px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", width: "100%",
    minHeight: 44, boxShadow: `0 1px 2px ${C.shadow}` };
  rowBtn = { display: "flex", alignItems: "center", gap: 13, background: C.card, border: `1px solid ${C.line}`,
    borderInlineStart: `4px solid ${C.field}`, borderRadius: 12, padding: 14, cursor: "pointer",
    textAlign: "start", fontFamily: "var(--body)", width: "100%", color: C.ink,
    boxShadow: `0 1px 2px ${C.shadow}`, transition: "transform .15s ease, box-shadow .15s ease" };
}
function applyThemeColors(mode) {
  Object.assign(C, THEMES[mode] || THEMES.light);
  refreshUiTokens();
  try { if (typeof document !== "undefined") document.documentElement.dataset.theme = mode; } catch (e) { /* */ }
}
refreshUiTokens();

/* App brand mark — official Mazraati logo (not the farm company logo) */
const APP_MARK_SRC = "data:image/jpeg;base64,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";
function AppMark({ size = 40, light = false, word = true, lang = "ar" }) {
  const h = word ? Math.max(52, Math.round(size * 1.55)) : size;
  const maxW = word ? Math.max(120, Math.round(size * 3.4)) : size;
  return <span className={`app-mark${light ? " light" : ""}`} title={lang === "ar" ? "مزرعتي" : "Mazraati"}
    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: light ? "rgba(255,255,255,.96)" : "#fff",
      borderRadius: word ? 12 : 10, padding: word ? "6px 8px" : 3,
      boxShadow: light ? "0 4px 16px rgba(0,0,0,.18)" : "0 1px 3px rgba(21,42,36,.08)",
      lineHeight: 0 }}>
    <img src={APP_MARK_SRC} alt={lang === "ar" ? "مزرعتي" : "Mazraati"}
      style={{ height: h, width: "auto", maxWidth: maxW, objectFit: "contain", display: "block" }} />
  </span>;
}
function toneOf(v, { pos = C.green, neg = C.red, zero = C.inkSoft, base } = {}) {
  if (base) return base;
  if (v > 0) return pos;
  if (v < 0) return neg;
  return zero;
}
function Card({ children, style, accent }) {
  return <div style={{ background: C.card, borderRadius: 6, padding: 16, boxShadow: sh1,
    borderTop: accent ? `4px solid ${accent}` : "none", ...style }}>{children}</div>;
}
function Title({ children, sub }) {
  return <div style={{ marginBottom: 12, borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
    <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 }}>{children}</div>
    {sub && <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 400, marginTop: 3 }}>{sub}</div>}
  </div>;
}
function HelpTip({ text }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const close = () => setOn(false);
    const t = setTimeout(() => window.addEventListener("click", close), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", close); };
  }, [on]);
  return <span className="help-tip" style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginInlineStart: 6 }}>
    <button type="button" aria-label="?" aria-expanded={on} onClick={(e) => { e.stopPropagation(); setOn((v) => !v); }}
      style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${on ? C.field : C.line}`,
        background: on ? C.field : C.card, color: on ? "#fff" : C.inkSoft, fontSize: 11, fontWeight: 700,
        cursor: "pointer", padding: 0, lineHeight: 1, fontFamily: "var(--mono)", flexShrink: 0 }}>?</button>
    {on && <span role="tooltip" className="help-tip-pop" onClick={(e) => e.stopPropagation()}>{text}</span>}
  </span>;
}
function SetSection({ open, onToggle, icon, title, tip, summary, accent, children }) {
  return <div className="set-sec" style={accent ? { borderInlineStart: `3px solid ${accent}` } : undefined}>
    <button type="button" className="set-sec-head" onClick={onToggle} aria-expanded={open}>
      <span className="set-sec-ic" aria-hidden="true">{icon}</span>
      <span className="set-sec-title">{title}{tip ? <HelpTip text={tip} /> : null}</span>
      {!open && summary ? <span className="set-sec-sum">{summary}</span> : <span style={{ flex: 1 }} />}
      <span className={`nav-group-chev${open ? " open" : ""}`} aria-hidden="true">›</span>
    </button>
    {open && <div className="set-sec-body">{children}</div>}
  </div>;
}
function SetLabel({ children, tip }) {
  return <div style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 700, color: C.inkSoft, marginBottom: 5 }}>
    <span>{children}</span>{tip ? <HelpTip text={tip} /> : null}
  </div>;
}
function Row({ k, v, tone }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14,
    padding: "6px 0", borderBottom: `1px dotted ${C.line}` }}>
    <span style={{ color: C.inkSoft, fontWeight: 400 }}>{k}</span>
    <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: tone || C.ink, textAlign: "end", fontSize: 13.5 }}>{v}</span>
  </div>;
}
function Kpi({ label, value, tone, sub, hint }) {
  return <div className="kpi-card" title={hint || undefined} style={{ background: C.card, borderRadius: 14, padding: "14px 15px", boxShadow: sh1,
    border: `1px solid ${C.line}`, borderInlineStart: `4px solid ${tone || C.field}` }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, letterSpacing: ".02em" }}>{label}</div>
    <div className="kpi-val" style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 23, color: C.ink,
      letterSpacing: "-.03em", marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
  </div>;
}
function Scroller({ children, style }) {
  return <div className="hscroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, ...style }}>{children}</div>;
}
function Chip({ active, onClick, children, color = C.field }) {
  return <button type="button" onClick={onClick} className={`chip touch-target${active ? " on" : ""}`} style={{ border: `1.5px solid ${active ? color : C.line}`,
    background: active ? color : C.card, color: active ? "#fff" : C.ink, borderRadius: 999,
    padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: "var(--body)", flexShrink: 0, minHeight: 44, minWidth: 44,
    transition: "transform .12s ease, box-shadow .12s ease" }}>{children}</button>;
}
function partyNeedle(item, q) {
  const n = (q || "").trim().toLowerCase();
  if (!n) return true;
  return `${item.label || ""} ${item.hint || ""} ${item.search || ""}`.toLowerCase().includes(n);
}
/** Searchable list for customers/suppliers. Pinned extras (walk-in, none) stay visible. */
function SearchPick({ value, onChange, items = [], extras = [], placeholder, emptyLabel, onAdd, addLabel, t }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const catalog = [...extras, ...items];
  const selected = catalog.find((x) => String(x.id) === String(value ?? ""));
  const shownExtras = extras.filter((x) => partyNeedle(x, q));
  const shownItems = items.filter((x) => partyNeedle(x, q));
  const shown = [...shownExtras, ...shownItems];
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    const tmr = setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (err) { /* */ } }, 20);
    return () => {
      clearTimeout(tmr);
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = (id) => { onChange(id); setQ(""); setOpen(false); };
  const openList = () => { setOpen(true); setQ(""); };
  return (
    <div className="spick-row">
      <div className="spick" ref={wrapRef}>
        <div className={`spick-field${open ? " open" : ""}`}
          onClick={() => { if (!open) openList(); }}>
          <span className="spick-ico" aria-hidden="true"><IcoSearch /></span>
          {open
            ? <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder || t("searchParty")} aria-label={placeholder || t("searchParty")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && shown[0]) { e.preventDefault(); pick(shown[0].id); }
                }} />
            : <span className={`spick-val${selected ? "" : " ph"}`}>
                {selected ? <>
                  {selected.icon ? <span className="spick-em">{selected.icon}</span> : null}
                  {selected.label}
                  {selected.hint ? <span className="spick-hint"> · {selected.hint}</span> : null}
                </> : (placeholder || t("searchParty"))}
              </span>}
          <span className="spick-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
        </div>
        {open && <div className="spick-list" role="listbox">
          {shown.length === 0
            ? <div className="spick-empty">{emptyLabel || t("noPartyMatch")}</div>
            : shown.map((x) => {
              const on = String(x.id) === String(value ?? "");
              return <button type="button" key={String(x.id)} role="option" aria-selected={on}
                className={`spick-opt${on ? " on" : ""}`} onClick={() => pick(x.id)}>
                {x.icon ? <span className="spick-em">{x.icon}</span> : null}
                <span className="spick-opt-copy">
                  <span className="spick-opt-lb">{x.label}</span>
                  {x.hint ? <span className="spick-opt-hint">{x.hint}</span> : null}
                </span>
              </button>;
            })}
        </div>}
      </div>
      {onAdd ? <button type="button" className="spick-add" title={addLabel} aria-label={addLabel} onClick={onAdd}>➕</button> : null}
    </div>
  );
}
function DatePick({ value, onChange, max, min, readOnly, disabled, className, style, ariaLabel, compact, allowClear }) {
  const locked = !!(readOnly || disabled);
  const lang = dateLangOf();
  const L = T[lang] || T.ar;
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 8, left: 8, width: 300 });
  const selected = (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : "";
  const today = dayKey(Date.now());
  const seed = selected || ((max && max < today) ? max : today);
  const [viewYm, setViewYm] = useState(seed.slice(0, 7));
  const shiftMonth = (n) => {
    const [y, m] = viewYm.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setViewYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const place = useCallback(() => {
    const btn = wrapRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, Math.max(276, Math.min(window.innerWidth - 16, 320)));
    const rtl = document.documentElement.dir === "rtl";
    let left = rtl ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const estH = 380;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 8 && r.top > estH + 8) top = Math.max(8, r.top - estH - 6);
    setPos({ top, left, width: w });
  }, []);
  useEffect(() => {
    if (!open) return;
    setViewYm(seed.slice(0, 7));
    place();
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, seed]);
  const pick = (dk) => {
    if (locked || !onChange) return;
    if (max && dk > max) return;
    if (min && dk < min) return;
    onChange(dk);
    setOpen(false);
  };
  const [vy, vm] = viewYm.split("-").map(Number);
  const first = new Date(vy, vm - 1, 1);
  const daysIn = new Date(vy, vm, 0).getDate();
  const lead = first.getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const cal = open && !locked ? createPortal(
    <div ref={popRef} className="date-cal" role="dialog" aria-label={ariaLabel || L.pickDate}
      style={{ top: pos.top, left: pos.left, width: pos.width }}>
      <div className="date-cal-head">
        <button type="button" className="date-cal-nav" aria-label={L.prev || "‹"} onClick={() => shiftMonth(-1)}>‹</button>
        <div className="date-cal-title">{MONTHS[lang][vm - 1]} {vy}</div>
        <button type="button" className="date-cal-nav" aria-label={L.next || "›"} onClick={() => shiftMonth(1)}>›</button>
      </div>
      <div className="date-cal-dow">
        {DOW_SHORT[lang].map((lb) => <span key={lb}>{lb}</span>)}
      </div>
      <div className="date-cal-grid">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} className="date-cal-day muted" />;
          const dk = `${viewYm}-${String(d).padStart(2, "0")}`;
          const off = (min && dk < min) || (max && dk > max);
          const on = dk === selected;
          const isToday = dk === today;
          return <button type="button" key={dk} disabled={off}
            className={`date-cal-day${on ? " on" : ""}${isToday ? " today" : ""}${off ? " off" : ""}`}
            onClick={() => !off && pick(dk)}>{d}</button>;
        })}
      </div>
      <div className="date-cal-foot">
        <button type="button" onClick={() => {
          const dk = today;
          if ((min && dk < min) || (max && dk > max)) { setViewYm(today.slice(0, 7)); return; }
          pick(today);
        }}>{L.today}</button>
        {allowClear && selected ? <button type="button" onClick={() => { onChange(""); setOpen(false); }}>{L.dateClear}</button> : null}
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <div ref={wrapRef} className={`date-pick${compact ? " compact" : ""}${locked ? " locked" : ""}${className ? ` ${className}` : ""}`}
      style={style}>
      <button type="button" className={`date-pick-btn${open ? " open" : ""}`} disabled={locked}
        aria-label={ariaLabel || L.pickDate} aria-expanded={open}
        onClick={() => { if (!locked) setOpen((o) => !o); }}>
        <span className="date-pick-ico" aria-hidden="true"><IcoCalendar /></span>
        <span className={`date-pick-val${selected ? "" : " ph"}`}>{selected ? dmy(selected, lang) : (ariaLabel || "—")}</span>
        <span className="date-pick-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {cal}
    </div>
  );
}
function PriceModeToggle({ t, mode, onChange }) {
  return <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
    <Chip active={mode === "unit"} onClick={() => onChange("unit")}>{t("pricePerUnit")}</Chip>
    <Chip active={mode === "total"} onClick={() => onChange("total")}>{t("priceFull")}</Chip>
  </div>;
}
function EditMoneySheet({ entry, lang, t, S, onSave, onDelete, onClose }) {
  const isMed = entry.type === "med";
  const [amount, setAmount] = useState(isMed ? (entry.cost || 0) : (entry.amount || 0));
  const [date, setDate] = useState(dayKey(entry.at));
  const [note, setNote] = useState(entry.note || "");
  const [method, setMethod] = useState(entry.method || "cash");
  const title = entry.type === "payment" ? t("editPayment")
    : entry.type === "med" ? t("medicine") : t("editCashMove");
  return <Sheet title={`✏️ ${title}`} onClose={onClose}>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginBottom: 12 }}>
      <MoneyStepper big usd={amount} onChange={setAmount} rate={S.rate} lang={lang} t={t} step={5} />
    </div>
    {(entry.type === "payment" || entry.type === "supplierPay") && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
        {[["cash", "💵", t("cash")], ["transfer", "📲", t("transfer")]].map(([k, ic, lb]) => {
          const on = method === k;
          return <button type="button" key={k} onClick={() => setMethod(k)} style={{
            background: on ? C.field : C.card, color: on ? "#fff" : C.ink,
            border: `1.5px solid ${on ? C.field : C.line}`, borderRadius: 6, padding: "12px 6px",
            cursor: "pointer", fontFamily: "var(--body)" }}>
            <div style={{ fontSize: 21 }}>{ic}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3 }}>{lb}</div>
          </button>;
        })}
      </div>
    </>}
    <DatePick value={date} max={dayKey(Date.now())} onChange={setDate} />
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notes2")}
      style={{ ...inp, marginBottom: 14 }} />
    <button type="button" style={{ ...primaryBtn, opacity: amount > 0 ? 1 : .45 }}
      onClick={() => amount > 0 && onSave({
        amount, cost: amount, method, note: note.trim(), at: dayStamp(date),
      })}>✓ {t("save")}</button>
    {onDelete && <DeleteConfirmBlock t={t} warn={deleteWarnFor(entry, t, entry.id)} onDelete={onDelete} />}
  </Sheet>;
}
function DeleteConfirmBlock({ t, warn, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return <button type="button" style={{ ...secondaryBtn, marginTop: 10, color: C.red, borderColor: C.red }}
      onClick={() => setConfirm(true)}>🗑️ {t("deleteTx")}</button>;
  }
  return <div style={{ marginTop: 10, background: "#F5E2E4", borderRadius: 4, padding: 12 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: "#7A1A2E", marginBottom: 9 }}>{warn}</div>
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" style={{ ...primaryBtn, flex: 1, background: C.red, padding: "11px 8px", fontSize: 14 }}
        onClick={onDelete}>{t("confirmDelete")}</button>
      <button type="button" style={{ ...secondaryBtn, flex: 1, padding: "11px 8px", fontSize: 14 }}
        onClick={() => setConfirm(false)}>{t("cancel")}</button>
    </div>
  </div>;
}
function FilterGroup({ label, children }) {
  return <div className="sf-group">
    {label ? <div className="sf-group-lb">{label}</div> : null}
    <div className="sf-group-body">{children}</div>
  </div>;
}
function IcoSearch() {
  return <svg className="sf-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.4-3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
function IcoCalendar() {
  return <svg className="sf-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 3.5v4M16 3.5v4M3.5 10h17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
function IcoSliders() {
  return <svg className="sf-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="15" cy="7" r="2.25" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="9" cy="17" r="2.25" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>;
}
function IcoX() {
  return <svg className="sf-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
function IcoArrowDownUp() {
  return <svg className="sf-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M8 5v14M8 5l-3 3M8 5l3 3M16 19V5M16 19l-3-3M16 19l3-3"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function SortPair({ t, sort, onChange, fields }) {
  const { field, dir } = parseSort(sort);
  const opts = fields || [["date", t("sortDate")], ["amount", t("sortAmount")], ["alpha", t("sortAlpha")]];
  const defaultDir = (k) => (k === "alpha" ? "asc" : "desc");
  return <div className="sf-sort">
    <div className="sf-seg" role="group" aria-label={t("sortBy")}>
      {opts.map(([k, lb]) => (
        <button type="button" key={k} className={`sf-seg-btn${field === k ? " on" : ""}`}
          aria-pressed={field === k}
          onClick={() => onChange(joinSort(k, k === field ? dir : defaultDir(k)))}>{lb}</button>
      ))}
    </div>
    <button type="button" className="sf-dir" aria-label={dir === "asc" ? t("sortAsc") : t("sortDesc")}
      title={dir === "asc" ? t("sortAsc") : t("sortDesc")}
      onClick={() => onChange(joinSort(field, dir === "asc" ? "desc" : "asc"))}>
      <IcoArrowDownUp />
    </button>
  </div>;
}
function SearchFilterBar({ t, q, onQ, qPlaceholder, chips, extra, activeCount, onReset, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    document.body.classList.add("sf-open");
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("sf-open");
    };
  }, [open]);
  const chipList = (chips || []).filter(Boolean);
  const count = activeCount != null ? activeCount : chipList.length;
  const hasPanel = children != null && children !== false;
  return <div className="sf-wrap" ref={wrapRef}>
    <div className="sf-bar" role="search">
      {onQ ? <label className="sf-search">
        <span className="sf-ico" aria-hidden="true"><IcoSearch /></span>
        <input value={q || ""} onChange={(e) => onQ(e.target.value)}
          placeholder={qPlaceholder || t("search")} aria-label={qPlaceholder || t("search")} />
        {(q || "").trim()
          ? <button type="button" className="sf-clear" aria-label={t("clearFilters")} title={t("clearFilters")}
              onClick={() => onQ("")}><IcoX /></button>
          : null}
      </label> : null}
      {hasPanel ? <button type="button" className={`sf-gear${open ? " on" : ""}${count > 0 ? " hot" : ""}`}
        aria-label={t("filterAndSort")} title={t("filterAndSort")} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <IcoSliders />
        {count > 0 ? <span className="sf-badge">{count > 9 ? "9+" : count}</span> : null}
      </button> : null}
      {extra}
    </div>
    {open && hasPanel && <>
      <div className="sf-scrim" onClick={() => setOpen(false)} />
      <div className="sf-pop" role="dialog" aria-label={t("filterAndSort")}>
        <div className="sf-pop-handle" aria-hidden="true" />
        {children}
        <div className="sf-pop-actions">
          {onReset ? <button type="button" className="sf-reset" onClick={onReset}>{t("resetFilters")}</button> : <span />}
          <button type="button" className="sf-apply" onClick={() => setOpen(false)}>{t("applyFilters")}</button>
        </div>
      </div>
    </>}
    {chipList.length > 0 && <div className="sf-chips">
      {chipList.map((c) => (
        <button key={c.key} type="button" className="sf-chip" onClick={c.onRemove}
          aria-label={`${t("clearFilters")}: ${c.label}`} title={c.label}>
          {c.label} <span aria-hidden="true"><IcoX /></span>
        </button>
      ))}
    </div>}
  </div>;
}
function HelpKit({ t, actions = [], items = [], tone }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  if (!actions.length && !items.length) return null;
  return <div className="help-kit" ref={ref}>
    <button type="button" className={`help-kit-btn${tone === "inv" ? " inv" : ""}`}
      aria-label={t("help")} title={t("help")} aria-expanded={open}
      onClick={() => setOpen((o) => !o)}>?</button>
    {open && <div className="help-kit-pop" role="dialog" aria-label={t("help")}>
      {actions.map((a) => (
        <button key={a.key} type="button" className="help-kit-act"
          onClick={() => { setOpen(false); a.run && a.run(); }}>
          {a.icon ? `${a.icon} ` : ""}{a.label}
        </button>
      ))}
      {items.map((txt, i) => <p key={i} className="help-kit-txt">{txt}</p>)}
    </div>}
  </div>;
}
function DateFilterPills({ t, from, to, onChange }) {
  const today = datePresetBounds("today");
  const week = datePresetBounds("week");
  const month = datePresetBounds("month");
  const none = !from && !to;
  const isToday = from === today.from && to === today.to;
  const isWeek = from === week.from && to === week.to;
  const isMonth = from === month.from && to === month.to;
  const custom = !none && !isToday && !isWeek && !isMonth;
  return <div className="sf-span">
    <div className="sf-group-body">
      <Chip active={none} onClick={() => onChange("", "")}>{t("statusAll")}</Chip>
      <Chip active={isToday} onClick={() => onChange(today.from, today.to)}>{t("today")}</Chip>
      <Chip active={isWeek} onClick={() => onChange(week.from, week.to)}>{t("thisWeek")}</Chip>
      <Chip active={isMonth} onClick={() => onChange(month.from, month.to)}>{t("thisMonth")}</Chip>
      <Chip active={custom} onClick={() => onChange(from || today.from, to || today.to)}>{t("customRange")}</Chip>
    </div>
    {(from || to || custom) && <div className="sf-dates">
      <DatePick compact allowClear value={from || ""} onChange={(v) => onChange(v, to || "")} ariaLabel={t("fromDate")} />
      <DatePick compact allowClear value={to || ""} onChange={(v) => onChange(from || "", v)} ariaLabel={t("toDate")} />
    </div>}
  </div>;
}
function SalePriceToggle({ t, S, lang, priceMode, onMode, qty, unitPrice, amount, onUnit, onTotal, step, currency, setCurrency }) {
  return <>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <Chip active={priceMode === "unit"} onClick={() => onMode("unit")}>{t("pricePerUnit")}</Chip>
      <Chip active={priceMode === "total"} onClick={() => onMode("total")}>{t("priceFull")}</Chip>
    </div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginBottom: 12, boxShadow: sh1 }}>
      {priceMode === "unit"
        ? <>
          <MoneyStepper usd={unitPrice} onChange={onUnit} rate={S.rate} lang={lang} t={t} step={step}
            currency={currency} setCurrency={setCurrency} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12,
            paddingTop: 10, borderTop: `1px solid ${C.line}`, fontWeight: 700 }}>
            <span style={{ color: C.inkSoft }}>{t("calculatedTotal")}</span>
            <Money usd={amount} rate={S.rate} lang={lang} tone={C.field} />
          </div>
        </>
        : <>
          <MoneyStepper usd={amount} onChange={onTotal} rate={S.rate} lang={lang} t={t} step={Math.max(1, step)}
            currency={currency} setCurrency={setCurrency} />
          {qty > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12,
            paddingTop: 10, borderTop: `1px solid ${C.line}`, fontWeight: 700 }}>
            <span style={{ color: C.inkSoft }}>{t("calculatedUnit")}</span>
            <Money usd={unitPrice} rate={S.rate} lang={lang} tone={C.field} />
          </div>}
        </>}
    </div>
  </>;
}
function Step({ n, label }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "2px 0 8px" }}>
    <span style={{ width: 22, height: 22, borderRadius: 3, background: C.field, color: "#fff",
      display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, fontFamily: "var(--mono)" }}>{n}</span>
    <span style={{ fontWeight: 700, fontSize: 14.5, color: C.inkSoft }}>{label}</span>
  </div>;
}
/* Display preference, chosen per device in Settings: usd | lbp | both */
const MONEY = { view: "both" };
function Money({ usd, rate, size = 20, lang, tone = C.ink, forceView }) {
  const view = (typeof forceView === "string" && forceView) || MONEY.view;
  const lira = `${nf((usd || 0) * rate)} ${lang === "ar" ? "ل.ل" : "LBP"}`;
  const bold = { fontFamily: "var(--mono)", fontWeight: 700, fontSize: size, color: tone, letterSpacing: "-.02em" };
  const faded = { fontFamily: "var(--mono)", fontWeight: 500, fontSize: Math.max(10.5, size * 0.58),
    color: tone === C.ink ? C.inkSoft : tone, opacity: .55, whiteSpace: "nowrap" };
  if (!(rate > 0) || view === "usd") return <span style={bold}>${nm(usd)}</span>;
  if (view === "lbp") return <span style={{ ...bold, fontSize: Math.max(13, size * 0.86) }}>{lira}</span>;
  return <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", lineHeight: 1.2 }}>
    <span style={bold}>${nm(usd)}</span><span style={faded}>{lira}</span>
  </span>;
}
function MoneyToggle({ value, onChange, rate, lang, t, previewUsd = 100, size }) {
  const opts = [
    ["both", t("bothMoney"), "$+ل"],
    ["usd", t("usdOnly"), "$"],
    ["lbp", t("lbpOnly"), "ل.ل"],
  ];
  if (size === "sm") {
    const ix = Math.max(0, opts.findIndex((o) => o[0] === value));
    const cur = opts[ix] || opts[0];
    const next = opts[(ix + 1) % opts.length][0];
    return <button type="button" className="dk-pill money-cycle" title={`${t("cycleMoney")}: ${cur[1]}`}
      onClick={() => onChange(next)}>{cur[2]}</button>;
  }
  return <div className="money-tog">
    <div className="money-tog-seg" role="group" aria-label={t("moneyView")}>
      {opts.map(([k, full]) => (
        <button key={k} type="button" className={value === k ? "on" : ""} title={full}
          onClick={() => onChange(k)}>{full}</button>
      ))}
    </div>
    {rate > 0 && <div className="money-tog-prev">
      <span className="money-tog-prev-lb">{t("moneyPreview")}</span>
      <Money usd={previewUsd} rate={rate} lang={lang} size={18} forceView={value} />
    </div>}
  </div>;
}
function CtxMenu({ menu, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const t = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
      window.addEventListener("keydown", onKey);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const { x, y, items } = menu;
  const maxW = 220, estH = items.length * 36 + 8;
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - maxW - 8);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - estH - 8);
  return <div ref={ref} className="ctx-menu" style={{ left: Math.max(8, left), top: Math.max(8, top) }}
    onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
    {items.map((it, i) => it === "—"
      ? <div key={`s${i}`} className="ctx-sep" />
      : <button key={it.key || i} type="button" className={it.danger ? "ctx-item danger" : "ctx-item"}
          disabled={it.disabled} onClick={() => { onClose(); it.run && it.run(); }}>
          <span className="ctx-ic">{it.icon || ""}</span>{it.label}
        </button>)}
  </div>;
}
function docTplOf(S) {
  return { thanks: "", footerNote: "", showSigns: true, showParty: true, showRate: true, printMoney: "follow",
    ...((S && S.docTpl) || {}) };
}
function printMoneyView(tpl) {
  const mode = (tpl && tpl.printMoney) || "follow";
  if (mode === "usd" || mode === "lbp" || mode === "both") return mode;
  return MONEY.view || "both";
}
/* Text form of the same rule, for labels, chips and table cells. */
const liraShort = (v, lang) => (v >= 1e6 ? `${(v / 1e6).toFixed(v / 1e6 >= 10 ? 0 : 1)}${lang === "ar" ? "م" : "M"}` : nf(v));
function fmt(usd, rate, lang, forceView) {
  const v = forceView || MONEY.view;
  if (!(rate > 0) || v === "usd") return `$${nm(usd)}`;
  const lira = `${nf((usd || 0) * rate)} ${lang === "ar" ? "ل.ل" : "LBP"}`;
  if (v === "lbp") return lira;
  return `$${nm(usd)} · ${lira}`;
}
function fmtC(usd, rate, lang, forceView) {
  const v = forceView || MONEY.view;
  if (!(rate > 0) || v === "usd") return `$${nm(usd)}`;
  const unit = lang === "ar" ? "ل.ل" : "LBP";
  if (v === "lbp") return `${liraShort((usd || 0) * rate, lang)} ${unit}`;
  return `$${nm(usd)} · ${liraShort((usd || 0) * rate, lang)} ${unit}`;
}
function fmtDue(usd, rate, lang, forceView) {
  return isOwing(usd) ? fmtC(usd, rate, lang, forceView) : "—";
}

function Stepper({ value, onChange, step = 1, suffix, big, decimals, compact }) {
  const [typing, setTyping] = useState(null);
  const s = big ? 66 : compact ? 36 : 52;
  const btn = (l, d) => <button type="button" onClick={() => { setTyping(null); onChange(Math.max(0, +((value || 0) + d).toFixed(2))); }}
    style={{ width: s, height: s, borderRadius: compact ? 4 : 6, border: "none", cursor: "pointer", flexShrink: 0,
      background: l === "+" ? C.field : C.paper, color: l === "+" ? "#fff" : C.ink,
      fontSize: big ? 30 : compact ? 18 : 24, fontWeight: 700, fontFamily: "var(--mono)", boxShadow: compact ? "none" : sh1 }}>{l}</button>;
  const shown = typing !== null ? typing : (((value || 0) % 1 === 0) ? String(value || 0) : (value || 0).toFixed(decimals || 2));
  return <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, justifyContent: "center" }}>
    {btn("−", -step)}
    <div style={{ minWidth: big ? 116 : compact ? 72 : 98, textAlign: "center" }}>
      <input value={shown} inputMode="decimal"
        onFocus={(e) => { setTyping(String(value || 0)); setTimeout(() => e.target.select(), 0); }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.,]/g, "");
          setTyping(raw);
          const n = parseFloat(String(raw).replace(",", "."));
          if (!isNaN(n)) onChange(Math.max(0, n));
          else if (raw === "" || raw === "." || raw === ",") onChange(0);
        }}
        onBlur={() => { if (typing === null) return; const n = parseFloat(String(typing).replace(",", ".")); onChange(isNaN(n) ? 0 : Math.max(0, n)); setTyping(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", textAlign: "center", border: `1.5px dashed ${C.line}`, borderRadius: compact ? 4 : 5,
          background: C.paper, padding: compact ? "4px 2px" : "6px 2px", fontFamily: "var(--mono)", fontWeight: 700,
          fontSize: big ? 38 : compact ? 18 : 27, color: C.ink, outline: "none" }} />
      {suffix && <div style={{ fontSize: compact ? 11 : 12.5, fontWeight: 600, color: C.inkSoft, marginTop: 3 }}>{suffix}</div>}
    </div>
    {btn("+", step)}
  </div>;
}
/* Amounts are stored in USD but can be entered in either currency;
   the rate applied at that moment is recorded with the entry. */
function MoneyStepper({ usd, onChange, rate, lang, t, step = 5, big, currency, setCurrency }) {
  const [own, setOwn] = useState("usd");
  const cur = currency || own;
  const setCur = setCurrency || setOwn;
  const live = cur === "usd" ? (usd || 0) : Math.round((usd || 0) * rate);
  const lbpStep = Math.max(1000, Math.round((step * rate) / 1000) * 1000);
  const commit = (v) => onChange(cur === "usd" ? v : (rate > 0 ? +(v / rate).toFixed(4) : 0));
  return <div>
    {rate > 0 && <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
      <Chip active={cur === "usd"} onClick={() => setCur("usd")}>$ {t("usd")}</Chip>
      <Chip active={cur === "lbp"} onClick={() => setCur("lbp")}>ل.ل {t("lbp")}</Chip>
    </div>}
    <Stepper big={big} value={live} onChange={commit} step={cur === "usd" ? step : lbpStep}
      suffix={cur === "usd" ? "$ USD" : (lang === "ar" ? "ل.ل" : "LBP")} />
    {rate > 0 && <div style={{ textAlign: "center", marginTop: 8, fontFamily: "var(--mono)",
      fontSize: 13.5, fontWeight: 600, color: C.inkSoft }}>
      {cur === "usd" ? `= ${nf((usd || 0) * rate)} ${lang === "ar" ? "ل.ل" : "LBP"}` : `= $${(usd || 0).toFixed(2)}`}
    </div>}
  </div>;
}

function Sheet({ title, children, onClose, onBack, backLabel, sub, keepPrint }) {
  return <div className={`sheet-wrap${keepPrint ? " keep-print" : ""}`}><div className="sheet">
    <div className="grabber" />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, flex: 1 }}>
        {onBack && <button type="button" onClick={onBack} title={backLabel || "Back"}
          style={{ width: 40, height: 40, borderRadius: 4, border: `1px solid ${C.line}`, background: C.paper,
            fontSize: 22, cursor: "pointer", flexShrink: 0, color: C.ink, lineHeight: 1 }}>‹</button>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20 }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500, marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      <button type="button" onClick={onClose} style={{ width: 40, height: 40, borderRadius: 4, border: `1px solid ${C.line}`,
        background: C.paper, fontSize: 18, cursor: "pointer", flexShrink: 0, color: C.ink }}>✕</button>
    </div>
    {children}
  </div></div>;
}
function Empty({ icon, title, sub, cta, onCta }) {
  return <div style={{ background: C.card, borderRadius: 6, padding: "32px 20px", textAlign: "center", boxShadow: sh1 }}>
    <div style={{ fontSize: 44 }}>{icon}</div>
    <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, marginTop: 8 }}>{title}</div>
    {sub ? <div style={{ fontSize: 14.5, color: C.inkSoft, fontWeight: 500, margin: "6px 0 16px" }}>{sub}</div>
      : <div style={{ height: 16 }} />}
    {cta && <button style={primaryBtn} onClick={onCta}>{cta}</button>}
  </div>;
}
function Keypad({ value, onChange, max = 6, onSubmit }) {
  const key = (label, fn, style) => <button type="button" key={label} onClick={fn} style={{ height: 58, borderRadius: 6, border: "none",
    background: C.card, color: C.ink, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 24, cursor: "pointer", boxShadow: sh1, ...style }}>{label}</button>;
  useEffect(() => {
    if (!onSubmit) return;
    const onKey = (e) => { if (e.key === "Enter" && value.length >= 4) { e.preventDefault(); onSubmit(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onSubmit]);
  return <div>
    <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "6px 0 18px" }}>
      {Array.from({ length: max }, (_, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: "50%",
        background: i < value.length ? C.field : "transparent", border: `2.5px solid ${i < value.length ? C.field : C.line}` }} />)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => key(d, () => value.length < max && onChange(value + d)))}
      <span />
      {key("0", () => value.length < max && onChange(value + "0"))}
      {key("⌫", () => onChange(value.slice(0, -1)), { background: C.paper, fontSize: 20 })}
    </div>
  </div>;
}
function PhotoPicker({ photo, onPick, onClear, t }) {
  const [busy, setBusy] = useState(false);
  return <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
    <label style={{ width: 96, height: 96, borderRadius: 6, background: photo ? "transparent" : "#ECE9E0",
      border: `1.5px solid ${C.line}`, display: "grid", placeItems: "center", cursor: "pointer",
      overflow: "hidden", flexShrink: 0, position: "relative" }}>
      {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 34 }}>{busy ? "⏳" : "📷"}</span>}
      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; setBusy(true);
          try { onPick(await compressImage(f)); } catch (err) { /* unreadable */ } setBusy(false); e.target.value = ""; }} />
    </label>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{photo ? t("changePhoto") : t("takePhoto")}</div>
      <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500, marginTop: 2 }}>{t("photoHint")}</div>
      {photo && <button onClick={onClear} style={{ marginTop: 8, background: "none", border: "none", color: C.red,
        fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0 }}>✕ {t("removePhoto")}</button>}
    </div>
  </div>;
}

/* ---------------------------- animal cards ---------------------------- */
function Stamp({ status, lang }) {
  return <StatusPill status={status}>{statusLabel(status, lang)}</StatusPill>;
}
function StatusChoice({ value, options, onChange, lang }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {options.map((k) => (
        <button key={k} type="button" className={`status-choice touch-target${value === k ? " on" : ""}`}
          data-tone={statusToneOf(k)} onClick={() => onChange(k)}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel(k, lang)}
        </button>
      ))}
    </div>
  );
}

function AnimalCard({ a, lang, t, today, last, onClick }) {
  const sp = spOf(a), flock = isFlock(a);
  const unit = producesEggs(a) ? t("eggsUnit") : t("L");
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick && onClick(e); } }}
      className={`data-card data-card--${statusToneOf(a.status)}`} style={{ width: "100%", textAlign: "start", cursor: "pointer",
      background: C.card, border: `1px solid ${C.line}`,
      borderRadius: 12, padding: 0, overflow: "visible", fontFamily: "var(--body)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px",
        background: C.paper, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 14 }}>{sp.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, letterSpacing: ".05em", flex: 1 }}>{spName(a.species, lang)}</span>
        <Stamp status={a.status} lang={lang} />
      </div>
      <div style={{ padding: "11px 12px 12px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 3, background: C.paper, border: `1px solid ${C.line}`,
            display: "grid", placeItems: "center", fontSize: 22, overflow: "hidden", flexShrink: 0 }}>
            {a.photo ? <img src={a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : sp.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: flock ? 15 : 21,
              letterSpacing: "-.02em", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {flock ? a.name : `#${a.tag}`}
            </div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {flock ? `${nf(a.birds)} ${t("birds")}` : (a.name || breedLabel(a, lang))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11 }}>
          <span style={{ fontSize: 12, color: C.inkSoft }}>{t("today")}</span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }}>
            {today > 0 ? `${n1(today)} ${unit}` : "—"}
          </span>
        </div>
        <div style={{ marginTop: 9, paddingTop: 7, borderTop: `1px dotted ${C.line}`, display: "flex",
          justifyContent: "flex-end" }}>
          {last ? <WhoHint e={last} lang={lang} /> : <span style={{ fontSize: 10, color: C.inkSoft }}>{t("never")}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- charts ------------------------------- */
function BarsSVG({ data, color = C.field, unit = "", height = 150 }) {
  const w = 340, pad2 = 24, max = Math.max(1, ...data.map((d) => d.value));
  const bw = data.length ? (w - pad2 * 2) / data.length : 0;
  return <svg className="chart-bars" viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: "auto", direction: "ltr" }}>
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="1" />
        <stop offset="100%" stopColor={color} stopOpacity=".72" />
      </linearGradient>
    </defs>
    <line x1={pad2} y1={height - 22} x2={w - pad2} y2={height - 22} stroke={C.line} strokeWidth="1.5" />
    {data.map((d, i) => {
      const h = Math.max(2, (d.value / max) * (height - 56));
      const x = pad2 + i * bw + bw * 0.18, bwi = bw * 0.64;
      return <g key={i} className="chart-bar" style={{ animationDelay: `${i * 45}ms` }}>
        <rect x={x} y={height - 22 - h} width={bwi} height={h} rx="6" fill={d.color || "url(#barGrad)"} />
        <text x={x + bwi / 2} y={height - 27 - h} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={C.inkSoft} fontFamily="var(--mono)">{d.value ? nf(d.value) : ""}</text>
        <text x={x + bwi / 2} y={height - 8} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={C.inkSoft} fontFamily="var(--mono)">{d.label}</text>
      </g>;
    })}
    {unit && <text x={pad2} y={12} fontSize="10" fontWeight="700" fill={C.inkSoft}>{unit}</text>}
  </svg>;
}
function StackedSVG({ parts, total }) {
  const w = 340, h = 30; let x = 0;
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", direction: "ltr" }}>
    {parts.map((p, i) => { const pw = total > 0 ? (p.value / total) * w : 0;
      const el = <rect key={i} x={x} y="5" width={Math.max(0, pw - 2)} height={h - 10} rx="2" fill={p.color} />;
      x += pw; return el; })}
  </svg>;
}
function HBarsSVG({ rows, formatValue = nf }) {
  const w = 340, rowH = 25, max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.target || 0)));
  return <svg viewBox={`0 0 ${w} ${rows.length * rowH + 6}`} style={{ width: "100%", height: "auto", direction: "ltr" }}>
    {rows.map((r, i) => { const y = i * rowH + 5, bw = (r.value / max) * (w - 100), tw = r.target ? (r.target / max) * (w - 100) : 0;
      return <g key={i}>
        <text x="0" y={y + 12} fontSize="10.5" fontWeight="700" fill={C.ink}>{r.label}</text>
        <rect x="58" y={y + 2} width={Math.max(2, bw)} height="12" rx="1" fill={r.color || C.field} />
        {r.target > 0 && <line x1={58 + tw} y1={y} x2={58 + tw} y2={y + 16} stroke={C.red} strokeWidth="2" strokeDasharray="3 2" />}
        <text x={w - 3} y={y + 12} textAnchor="end" fontSize="10" fontWeight="600"
          fill={C.inkSoft} fontFamily="var(--mono)">{formatValue(r.value)}</text>
      </g>; })}
  </svg>;
}
function Legend({ items, rate = 0, lang }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 9 }}>
    {items.filter((i) => i.value > 0).map((i) => <span key={i.label} style={{ display: "flex", alignItems: "center",
      gap: 5, fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>
      <span style={{ width: 10, height: 10, borderRadius: 1, background: i.color }} /> {i.label} {fmtC(i.value, rate, lang)}</span>)}
  </div>;
}

/* ============================ FORMS ============================ */
function SpeciesPicker({ value, onPick, lang }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
    {SP_KEYS.map((k) => {
      const s = SPECIES[k], on = value === k;
      return <button key={k} onClick={() => onPick(k)} style={{ background: on ? s.color : C.card,
        color: on ? "#fff" : C.ink, border: `1.5px solid ${on ? s.color : C.line}`, borderRadius: 6,
        padding: "16px 8px", cursor: "pointer", fontFamily: "var(--body)", boxShadow: on ? sh2 : sh1 }}>
        <div style={{ fontSize: 34 }}>{s.icon}</div>
        <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 4 }}>{spName(k, lang)}</div>
        <div style={{ fontSize: 11.5, opacity: .75, fontWeight: 600 }}>
          {s.mode === "flock" ? (lang === "ar" ? "قطيع" : "by flock") : (lang === "ar" ? "فردي" : "individual")}
        </div>
      </button>;
    })}
  </div>;
}

function AnimalForm({ lang, t, animals, initial, onSave, onClose, onBack, backLabel }) {
  const [species, setSpecies] = useState(initial?.species || null);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [photo, setPhoto] = useState(initial?.photo || "");
  const [tag, setTag] = useState(initial?.tag || "");
  const [name, setName] = useState(initial?.name || "");
  const [birds, setBirds] = useState(initial?.birds || 0);
  const [coop, setCoop] = useState(initial?.coop || "");
  const [dobMode, setDobMode] = useState(initial?.ageYears && !initial?.dob ? "age" : "dob");
  const [dob, setDob] = useState(initial?.dob || "");
  const [ageYears, setAgeYears] = useState(initial?.ageYears || 0);
  const [breed, setBreed] = useState(initial?.breed || "");
  const [breedName, setBreedName] = useState(initial?.breedName || "");
  const [status, setStatus] = useState(initial?.status || "");
  const [expected, setExpected] = useState(initial?.expected || 0);
  const [err, setErr] = useState("");

  const sp = species ? SPECIES[species] : null;
  const flock = sp && sp.mode === "flock";
  useEffect(() => {
    if (!sp || initial) return;
    setBreed(sp.breeds[0][0]); setStatus(sp.statuses[0]);
    setExpected(flock ? Math.round((birds || 0) * sp.typical) : sp.typical);
  }, [species]);

  const titles = [t("pickSpecies"), t("identity"), t("details")];
  const idOk = () => {
    const v = String(flock ? name : tag).trim();
    if (!v) { setErr(t("idNeeded")); return false; }
    if (!flock && animals.some((a) => a.species === species && String(a.tag) === v && a.id !== initial?.id)) { setErr(t("idTaken")); return false; }
    setErr(""); return true;
  };
  const submit = () => onSave({
    id: initial?.id || uid(), species, photo,
    tag: flock ? "" : String(tag).trim(), name: name.trim(), birds: flock ? birds : 0, coop: coop.trim(),
    dob: dobMode === "dob" ? dob : "", ageYears: dobMode === "age" ? ageYears : 0,
    breed, breedName: breed === "other" ? breedName.trim() : "",
    served: initial?.served || "", method: initial?.method || "",
    source: initial?.source || "born", price: initial?.price || 0,
    parity: initial?.parity || 0, weight: initial?.weight || 0, expected,
    status, due: initial?.due || "", medicine: initial?.medicine || "", notes: initial?.notes || "",
    at: initial?.at || iso(Date.now()),
  });
  const unitLabel = sp && sp.produce === "eggs" ? t("eggsUnit") : t("liters");

  return <Sheet title={initial ? `✏️ ${t("editAnimal")}` : `➕ ${t("addAnimal")}`} sub={sp ? `${sp.icon} ${spName(species, lang, true)}` : ""} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {[0, 1, 2].map((n) => <div key={n} style={{ flex: 1, height: 6, borderRadius: 6,
        background: n <= step ? C.field : C.line }} />)}
    </div>
    <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{titles[step]}</div>

    {step === 0 && <SpeciesPicker value={species} onPick={(k) => { setSpecies(k); setStep(1); }} lang={lang} />}

    {step === 1 && sp && <>
      <PhotoPicker photo={photo} onPick={setPhoto} onClear={() => setPhoto("")} t={t} />
      <div style={{ height: 14 }} />
      <Step n="1" label={lang === "ar" ? sp.idAr : sp.idEn} />
      {flock
        ? <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
            placeholder={lang === "ar" ? "قطيع البياض" : "Layer flock"} style={{ ...inp, fontSize: 18, fontWeight: 700 }} />
        : <input value={tag} onChange={(e) => { setTag(e.target.value.replace(/[^0-9]/g, "")); setErr(""); }}
            inputMode="numeric" placeholder="101" style={{ ...inp, fontFamily: "var(--display)", fontWeight: 700, fontSize: 30, textAlign: "center" }} />}
      {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 7 }}>⚠️ {err}</div>}
      <div style={{ height: 14 }} />
      {flock ? <>
        <Step n="2" label={t("birds")} />
        <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 14, boxShadow: sh1 }}>
          <Stepper big value={birds} onChange={(v) => { setBirds(v); setExpected(Math.round(v * sp.typical)); }} step={10} suffix={t("birds")} />
        </div>
        <Step n="3" label={`${t("coop")} — ${t("optional")}`} />
        <input value={coop} onChange={(e) => setCoop(e.target.value)} placeholder={t("coopHint")} style={inp} />
      </> : <>
        <Step n="2" label={`${t("animalName")} — ${t("nameOptional")}`} />
        <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
      </>}
    </>}

    {step === 2 && sp && <>
      <Step n="1" label={flock ? t("flockStart") : t("dob")} />
      {flock
        ? <DatePick value={dob} onChange={setDob} />
        : <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Chip active={dobMode === "dob"} onClick={() => setDobMode("dob")}>{t("knowDob")}</Chip>
            <Chip active={dobMode === "age"} onClick={() => setDobMode("age")}>{t("knowAge")}</Chip>
          </div>
          {dobMode === "dob"
            ? <DatePick value={dob} onChange={setDob} />
            : <div style={{ background: C.card, borderRadius: 6, padding: 14, boxShadow: sh1 }}>
                <Stepper value={ageYears} onChange={setAgeYears} step={1} suffix={t("years")} /></div>}
        </>}
      <div style={{ height: 14 }} />
      <Step n="2" label={t("breed")} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: breed === "other" ? 10 : 14 }}>
        {sp.breeds.map(([k, ar, en]) => <Chip key={k} active={breed === k} onClick={() => setBreed(k)} color={sp.color}>
          {(lang === "ar" ? ar : en).replace(/ —.*$/, "")}</Chip>)}
      </div>
      {breed === "other" && <input value={breedName} onChange={(e) => setBreedName(e.target.value)}
        placeholder={t("breedOther")} style={{ ...inp, marginBottom: 14 }} />}
      <Step n="3" label={t("status")} />
      <div style={{ marginBottom: 14 }}>
        <StatusChoice value={status} options={sp.statuses} onChange={setStatus} lang={lang} />
      </div>
      <Step n="4" label={`${t("expected")} (${unitLabel})`} />
      <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 6, boxShadow: sh1 }}>
        <Stepper big value={expected} onChange={setExpected} step={flock ? 10 : 1} suffix={unitLabel} decimals={1} />
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 500 }}>
        💡 {flock
          ? L(lang, `القطيع الجيد يعطي ٦٠–٨٠٪ من عدد الطيور بيضًا يوميًا.`,
              `A healthy flock lays 60–80% of its bird count daily.`)
          : L(lang, "يُستخدم لتنبيهك عند انخفاض الإنتاج.", "Used to warn you when production drops.")}
      </div>
    </>}

    {step > 0 && <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
      <button type="button" style={{ ...secondaryBtn, flex: 1 }} onClick={() => setStep(step - 1)}>‹ {t("prev")}</button>
      {step < 2
        ? <button type="button" style={{ ...primaryBtn, flex: 2 }} onClick={() => { if (step === 1 && !idOk()) return; setStep(step + 1); }}>{t("next")} ›</button>
        : <button type="button" style={{ ...primaryBtn, flex: 2 }} onClick={submit}>✓ {t("save")}</button>}
    </div>}
  </Sheet>;
}

function DayPicker({ date, setDate, lang, t }) {
  const today = dayKey(Date.now());
  const shift = (n) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    const k = dayKey(d);
    if (k > today) return;
    setDate(k);
  };
  const isToday = date === today;
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 12, marginBottom: 12 }}>
    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>📅 {t("entryDate")}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => shift(-1)} aria-label={t("prevDay")} style={{ width: 44, height: 44, borderRadius: 4,
        border: `1px solid ${C.line}`, background: C.paper, fontSize: 18, cursor: "pointer", color: C.ink, flexShrink: 0 }}>
        {lang === "ar" ? "›" : "‹"}</button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17 }}>{dayLabel(date, lang)}</div>
        {(date === today || date === dayKey(Date.now() - 864e5)) &&
          <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: C.inkSoft }}>{dmy(date, lang)}</div>}
      </div>
      <button onClick={() => shift(1)} disabled={isToday} aria-label={t("nextDay")}
        style={{ width: 44, height: 44, borderRadius: 4, border: `1px solid ${C.line}`, background: C.paper,
          fontSize: 18, cursor: isToday ? "not-allowed" : "pointer", opacity: isToday ? .35 : 1, color: C.ink, flexShrink: 0 }}>
        {lang === "ar" ? "‹" : "›"}</button>
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Chip active={isToday} onClick={() => setDate(today)}>{t("today")}</Chip>
      <Chip active={date === dayKey(Date.now() - 864e5)} onClick={() => setDate(dayKey(Date.now() - 864e5))}>{t("yesterday")}</Chip>
      <DatePick compact value={date} max={today} onChange={setDate} />
    </div>
    {!isToday && <div style={{ marginTop: 9, background: "#F6EFDD", border: `1px solid ${C.tag}`, borderRadius: 3,
      padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: "#7A5312" }}>
      ⏳ {t("backdated")} — {t("forDay")} {dayLabel(date, lang)}</div>}
  </div>;
}

function ProdSheet({ animal, lang, t, existing, date, setDate, lastAm, lastPm, onSave, onClose, onBack, backLabel }) {
  const eggs = producesEggs(animal);
  const [am, setAm] = useState(existing.am || 0);
  const [pm, setPm] = useState(existing.pm || 0);
  const [count, setCount] = useState(existing.count || 0);
  const [broken, setBroken] = useState(existing.broken || 0);
  const sp = spOf(animal);
  /* moving to another day must reload that day's numbers */
  useEffect(() => { setAm(existing.am || 0); setPm(existing.pm || 0);
    setCount(existing.count || 0); setBroken(existing.broken || 0); }, [date, animal.id]);

  if (eggs) return <Sheet title={`🥚 ${t("collect")}`} sub={`${animalLabel(animal)} · ${dayLabel(date, lang)}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    {setDate && <DayPicker date={date} setDate={setDate} lang={lang} t={t} />}
    <div style={{ background: C.card, borderRadius: 4, border: `1px solid ${C.line}`, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15.5, fontWeight: 700 }}>🥚 {t("eggs")}</span>
        {lastAm && <WhoHint e={lastAm} lang={lang} />}
      </div>
      <Stepper big value={count} onChange={setCount} step={10} suffix={t("eggsUnit")} />
    </div>
    <div style={{ background: C.card, borderRadius: 4, border: `1px solid ${C.line}`, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>💔 {t("broken")}</div>
      <Stepper value={broken} onChange={setBroken} step={1} suffix={t("eggsUnit")} />
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 4, padding: 15, marginBottom: 12,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 600 }}>{t("expected")} {nf(animal.expected)} · {t("eggRate")}</span>
      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 24 }}>
        {animal.birds > 0 ? `${Math.round((count / animal.birds) * 100)}%` : "—"}</span>
    </div>
    <button style={primaryBtn} onClick={() => onSave({ count, broken })}>✓ {t("save")}</button>
  </Sheet>;

  return <Sheet title={`🥛 ${t("milk")}`} sub={`${sp.icon} ${animalLabel(animal)} · ${dayLabel(date, lang)}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    {setDate && <DayPicker date={date} setDate={setDate} lang={lang} t={t} />}
    {[["am", `🌅 ${t("morning")}`, am, setAm, lastAm], ["pm", `🌙 ${t("evening")}`, pm, setPm, lastPm]].map(([k, label, v, set, last]) => (
      <div key={k} style={{ background: C.card, borderRadius: 4, border: `1px solid ${C.line}`, padding: 15, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{label}</span>
          <span style={{ textAlign: "end" }}>{last ? <WhoHint e={last} lang={lang} /> : <span style={{ fontSize: 11, color: C.inkSoft }}>{t("never")}</span>}</span>
        </div>
        <Stepper big value={v} onChange={set} step={1} suffix={t("liters")} decimals={1} />
      </div>
    ))}
    <div style={{ background: C.field, color: "#fff", borderRadius: 4, padding: 15, marginBottom: 12,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 600 }}>{t("total")} · {dayLabel(date, lang)}</span>
      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 26 }}>{n1(am + pm)} {t("L")}</span>
    </div>
    <button style={primaryBtn} onClick={() => onSave({ am, pm })}>✓ {t("save")}</button>
  </Sheet>;
}

function ReproSheet({ animal, lang, t, onAct, onClose, onBack, backLabel }) {
  const sp = spOf(animal);
  const [served, setServed] = useState(animal.served || dayKey(Date.now()));
  const [method, setMethod] = useState(animal.method || "natural");
  const r = repro({ ...animal, served });
  const D = (d) => dmy(d);
  const done = (k) => ({ served: !!animal.served, check: ["pregnant", "dry", "lactating"].includes(animal.status),
    dry: ["dry"].includes(animal.status), birth: false })[k];

  const Stage = ({ n, icon, title, sub, date, state, children }) => (
    <div style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: `1px dotted ${C.line}` }}>
      <div style={{ width: 30, flexShrink: 0, textAlign: "center" }}>
        <div style={{ width: 30, height: 30, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 15,
          background: state === "done" ? C.green : state === "now" ? C.tag : "#ECE9E0",
          color: state === "done" || state === "now" ? "#fff" : C.inkSoft }}>{state === "done" ? "✓" : icon}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
          {date && <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: state === "now" ? C.red : C.inkSoft }}>{date}</span>}
        </div>
        {sub && <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{sub}</div>}
        {children}
      </div>
    </div>
  );

  return <Sheet title={`🍼 ${t("repro")}`} sub={`${sp.icon} ${animalLabel(animal)}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 12 }}>💡 {t("reproHint")}</div>

    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📅 {t("serviceDate")}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>{t("serviceHint")}</div>
      <DatePick value={served} max={dayKey(Date.now())} onChange={setServed} style={{ marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <Chip active={method === "natural"} onClick={() => setMethod("natural")}>🐂 {t("natural")}</Chip>
        <Chip active={method === "ai"} onClick={() => setMethod("ai")}>💉 {t("ai")}</Chip>
      </div>
      {served !== animal.served && <button style={{ ...primaryBtn, marginTop: 12 }}
        onClick={() => onAct("service", { served, method })}>✓ {t("recordService")}</button>}
    </div>

    {r && animal.served && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
        <Kpi label={t("daysIn")} value={`${r.daysIn} ${t("days")}`} tone={C.field} />
        <Kpi label={t("monthsIn")} value={r.monthsIn.toFixed(1)} tone={C.field} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 4 }}>{t("timeline")}</div>

      <Stage n={1} icon="1" title={t("step1")} date={dmy(animal.served)} state="done"
        sub={animal.method === "ai" ? t("ai") : t("natural")} />

      <Stage n={2} icon="2" title={t("step2")} date={`${D(r.checkFrom)} → ${D(r.checkTo)}`}
        state={done("check") ? "done" : r.needsCheck ? "now" : "next"} sub={t("pregCheckSub")}>
        {animal.status === "served" && <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
          {r.watchHeat && <div style={{ background: "#F6EFDD", borderRadius: 3, padding: "8px 10px",
            fontSize: 12.5, fontWeight: 600, color: "#7A5312" }}>👀 {t("watchHeat")} — {t("watchHeatSub")}</div>}
          <div style={{ display: "flex", gap: 7 }}>
            <button style={{ ...primaryBtn, flex: 1, padding: "11px 8px", fontSize: 14 }}
              onClick={() => onAct("pregnant")}>{t("confirmPreg")}</button>
            <button style={{ ...secondaryBtn, flex: 1, padding: "11px 8px", fontSize: 14, color: C.red, borderColor: C.red }}
              onClick={() => onAct("notPregnant")}>{t("notPreg")}</button>
          </div>
        </div>}
      </Stage>

      <Stage n={3} icon="3" title={t("step3")} date={D(r.dry)}
        state={done("dry") ? "done" : r.dryDue ? "now" : "next"}
        sub={`${t("dryOffSub")}${r.daysToDry > 0 ? ` · ${L(lang, "بعد", "in")} ${r.daysToDry} ${t("days")}` : ""}`}>
        {animal.status === "pregnant" && <button style={{ ...(r.dryDue ? primaryBtn : secondaryBtn), marginTop: 9, padding: "11px 8px", fontSize: 14 }}
          onClick={() => onAct("dry")}>🥛 {t("dryNow")}</button>}
      </Stage>

      <Stage n={4} icon="4" title={t("step4")} date={D(r.due)}
        state={r.overdue ? "now" : "next"}
        sub={`${t("calvingWindow")}: ${D(r.dueMin)} → ${D(r.dueMax)}${r.daysToDue >= 0 ? ` · ${t("dueIn")} ${r.daysToDue} ${t("days")}` : ""}`}>
        {r.overdue && <div style={{ background: "#F5E2E4", borderRadius: 3, padding: "8px 10px", marginTop: 8,
          fontSize: 12.5, fontWeight: 600, color: "#7A1A2E" }}>⚠️ {t("overdueBirth")}</div>}
        {["pregnant", "dry"].includes(animal.status) && <button style={{ ...primaryBtn, marginTop: 9, padding: "11px 8px", fontSize: 14 }}
          onClick={() => onAct("birth")}>🐣 {t("recordBirth")}</button>}
      </Stage>
    </>}
    {!animal.served && <div style={{ color: C.inkSoft, fontSize: 14, textAlign: "center", padding: "10px 0" }}>{t("notServed")}</div>}
  </Sheet>;
}

function milkUnitLb(u, t) { return milkUnitOf(u) === "kg" ? t("kg") : t("L"); }
function milkEqHint(qty, unit, t) {
  const n = parseMilkQty(qty);
  if (!(n > 0)) return null;
  const other = milkOtherUnit(unit);
  const equiv = milkEqAmount(n, unit);
  const shown = (Math.round(equiv * 10) / 10).toFixed(1);
  return <div className="milk-unit-eq">{`(~${shown} ${milkUnitLb(other, t)})`}</div>;
}
function milkKgLine(e, t) {
  const liters = milkRecordLiters(e);
  const kg = milkFromLiters(liters, "kg");
  return `${n1(kg)} ${t("kg")} (~${n1(liters)} ${t("L")})`;
}
function saleQtyUnit(sale, lang, t) {
  if ((sale?.product || "milk") === "milk") return t("kg");
  const pr = PRODUCTS.find((p) => p[0] === sale?.product) || PROD_OTHER;
  return lang === "ar" ? pr[4] : pr[5];
}

/* Bill / paid / remainder — cent-safe; no separate “part paid” mode. */
function payState(amount, paid) {
  const billC = Math.max(0, toCents(amount));
  const gotC = Math.max(0, Math.min(billC, toCents(paid)));
  const dueC = Math.max(0, billC - gotC);
  return {
    bill: fromCents(billC), paid: fromCents(gotC), due: fromCents(dueC),
    status: moneyStatus(billC, gotC),
  };
}
function PaySplit({ amount, paid, onChange, rate, lang, t, supplierLinked }) {
  const p = payState(amount, paid);
  return <div style={{ display: "grid", gap: 10, background: C.paper, border: `1px solid ${C.line}`,
    borderRadius: 8, padding: 12, marginBottom: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      <Kpi label={t("billTotal")} value={fmtC(p.bill, rate, lang)} />
      <Kpi label={t("amountPaid")} value={fmtC(p.paid, rate, lang)} tone={C.green} />
      <Kpi label={supplierLinked ? t("weOwe") : t("remainder")} value={fmtC(p.due, rate, lang)} tone={moneyColor("due", p.due)} />
    </div>
    {supplierLinked && (p.paid > 0.009 || p.due > 0.009) && (
      <div style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
        {p.paid > 0.009 && <div style={{ background: "#E6F6F0", color: "#0F5C4D", borderRadius: 4, padding: "8px 10px" }}>
          💵 {t("supplierCashOutHint")} · {fmtC(p.paid, rate, lang)}</div>}
        {p.due > 0.009 && <div style={{ background: "#FBEFEF", color: "#9A5252", borderRadius: 4, padding: "8px 10px" }}>
          📋 {t("supplierOweHint")} · {fmtC(p.due, rate, lang)}</div>}
      </div>
    )}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip active={p.status === "paid"} onClick={() => onChange(p.bill)} color={C.green}>{t("payAll")}</Chip>
      <Chip active={p.status === "unpaid"} onClick={() => onChange(0)} color={C.red}>{t("payNone")}</Chip>
    </div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8, textAlign: "center" }}>{t("amountPaid")}</div>
      <MoneyStepper usd={p.paid} onChange={(v) => onChange(Math.max(0, Math.min(p.bill, v)))}
        rate={rate} lang={lang} t={t} step={5} />
    </div>
  </div>;
}

/* Till-style checkout for sales: take the full amount, or a partial, then post. */
function CashierPayPrompt({ t, lang, S, amount, err, onConfirm }) {
  const [mode, setMode] = useState(null);
  const [tender, setTender] = useState(0);
  const paid = mode === "full" ? amount
    : mode === "later" ? 0
    : fromCents(Math.min(toCents(tender), toCents(amount)));
  const p = payState(amount, paid);
  const pick = (m) => {
    setMode(m);
    if (m === "partial" && !(tender > 0.009)) setTender(0);
    if (m === "full") setTender(amount);
    if (m === "later") setTender(0);
  };
  const ready = mode === "full" || mode === "later" || (mode === "partial" && paid > 0.009);
  const confirmLabel = mode === "full" ? `💵 ${t("chargeFull")} · ${fmtC(amount, S.rate, lang)}`
    : mode === "partial" ? `💵 ${t("takePartial")} · ${fmtC(paid, S.rate, lang)}`
    : mode === "later" ? `📋 ${t("putOnAccount")}`
    : t("pickPayMode");
  const payBtn = (k, icon, label, color, sub) => {
    const on = mode === k;
    return <button type="button" onClick={() => pick(k)} style={{
      background: on ? color : C.card, color: on ? "#fff" : C.ink,
      border: `2px solid ${on ? color : C.line}`, borderRadius: 10, padding: "16px 10px",
      cursor: "pointer", fontFamily: "var(--body)", minHeight: 92, textAlign: "center" }}>
      <div style={{ fontSize: 26, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 7 }}>{label}</div>
      {sub && <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, opacity: on ? .92 : .75 }}>{sub}</div>}
    </button>;
  };
  return <>
    <div style={{ background: C.field, color: "#fff", borderRadius: 10, padding: "18px 16px", marginBottom: 14,
      textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", opacity: .85, marginBottom: 4 }}>{t("amountDue")}</div>
      <Money usd={amount} rate={S.rate} lang={lang} size={36} tone="#fff" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
      {payBtn("full", "💵", t("payInFull"), C.green, fmtC(amount, S.rate, lang))}
      {payBtn("partial", "💰", t("payPartialMode"), C.amber, t("remainder"))}
    </div>
    {mode === "partial" && <>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8, textAlign: "center" }}>{t("amountReceived")}</div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
        <MoneyStepper big usd={paid} onChange={(v) => setTender(fromCents(Math.min(toCents(amount), Math.max(0, toCents(v)))))}
          rate={S.rate} lang={lang} t={t} step={1} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12,
        fontWeight: 700 }}>
        <span>{t("remainder")}</span>
        <Money usd={p.due} rate={S.rate} lang={lang} size={20} tone={p.due > 0.009 ? C.red : C.green} />
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "-4px 0 12px" }}>💡 {t("cashierPartialHint")}</div>
    </>}
    {mode === "full" && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "-2px 0 12px" }}>💡 {t("cashierFullHint")}</div>}
    {mode === "later" && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "0 0 12px" }}>💡 {t("cashierLaterHint")}</div>}
    <button type="button" onClick={() => pick("later")} style={{
      ...secondaryBtn, marginBottom: 12,
      borderColor: mode === "later" ? C.amber : C.line,
      background: mode === "later" ? "#F6EFDD" : C.paper }}>📋 {t("payLater")} · {t("putOnAccount")}</button>
    {err && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {err}</div>}
    <button type="button" style={{ ...primaryBtn, opacity: ready ? 1 : .45, padding: "16px 18px", fontSize: 17,
      background: mode === "later" ? C.amber : primaryBtn.background }}
      onClick={() => ready && onConfirm(paid)}>{confirmLabel}</button>
  </>;
}

function BulkMilkSheet({ lang, t, date, setDate, existing, lastAm, lastPm, onSave, onClose }) {
  const u = "kg";
  const [am, setAm] = useState(() => milkFromLiters(existing.am || 0, u));
  const [pm, setPm] = useState(() => milkFromLiters(existing.pm || 0, u));
  useEffect(() => {
    setAm(milkFromLiters(existing.am || 0, u));
    setPm(milkFromLiters(existing.pm || 0, u));
  }, [date, existing.am, existing.pm]);
  const total = am + pm;
  const suffix = milkUnitLb(u, t);
  return <Sheet title={`🥛 ${t("addMilkStock")}`} sub={dayLabel(date, lang)} onClose={onClose}>
    <DayPicker date={date} setDate={setDate} lang={lang} t={t} />
    <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 12 }}>
      {t("milkDensityHint")}</div>
    {[["am", `🌅 ${t("morningMilk")}`, am, setAm], ["pm", `🌙 ${t("eveningMilk")}`, pm, setPm]].map(([k, label, v, set]) => (
      <div key={k} style={{ background: C.card, borderRadius: 6, border: `1px solid ${C.line}`, padding: 15, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{label}</div>
        <Stepper big value={v} onChange={(n) => set(Math.max(0, n))} step={5} suffix={suffix} decimals={2} />
        {milkEqHint(v, u, t)}
      </div>))}
    <div style={{ background: C.field, color: "#fff", borderRadius: 6, padding: 14, marginBottom: 12,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 600 }}>{t("dayMilkTotal")}</span>
      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 24 }}>{n1(total)} {suffix}</span>
    </div>
    <button style={primaryBtn} onClick={() => onSave({ am, pm, unit: u })}>✓ {t("saveDayMilk")}</button>
  </Sheet>;
}

function MilkUseSheet({ lang, t, stock, date, onSave, onClose, savedReasons = [] }) {
  const unit = "kg";
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("home");
  const [customName, setCustomName] = useState("");
  const [useDate, setUseDate] = useState(date || dayKey(Date.now()));
  const availL = stock?.available || 0;
  const avail = milkFromLiters(availL, unit);
  const needL = milkToLiters(qty, unit);
  const u = milkUnitLb(unit, t);
  const presets = [
    ["home", t("milkUseHome")], ["calves", t("milkUseCalves")], ["waste", t("milkUseWaste")],
  ];
  const customs = (savedReasons || []).map((name) => String(name || "").trim()).filter(Boolean);
  const pick = customName.trim();
  const chosenCustom = reason.startsWith("custom:") ? reason.slice(7) : "";
  const canSave = qty > 0 && needL <= availL + 0.001 && (reason !== "new" || pick);
  return <Sheet title={`🥛 ${t("milkUse")}`} onClose={onClose}>
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px",
      marginBottom: 12, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
      <span>{t("milkLeft")}</span>
      <span style={{ fontFamily: "var(--mono)", color: avail > 0 ? C.field : C.red }}>{n1(avail)} {u}</span>
    </div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("qty")}</div>
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 12, boxShadow: sh1 }}>
      <Stepper big value={qty} onChange={(n) => setQty(Math.max(0, n))} step={1} suffix={u} decimals={2} />
      {milkEqHint(qty, unit, t)}
    </div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("lossReason")}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
      {presets.map(([k, lb]) => (
        <button key={k} type="button" onClick={() => { setReason(k); setCustomName(""); }} style={{
          background: reason === k ? C.field : C.card, color: reason === k ? "#fff" : C.ink,
          border: `1.5px solid ${reason === k ? C.field : C.line}`, borderRadius: 5, padding: "11px 8px",
          fontWeight: 700, fontSize: 13.5, cursor: "pointer",
        }}>{lb}</button>
      ))}
    </div>
    {customs.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {customs.map((name) => {
        const on = chosenCustom === name;
        return <Chip key={name} active={on} onClick={() => { setReason(`custom:${name}`); setCustomName(""); }}>{name}</Chip>;
      })}
    </div>}
    <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>{t("milkUseReasonHint")}</div>
    <input value={reason === "new" || !chosenCustom ? customName : ""}
      onChange={(e) => { setCustomName(e.target.value); setReason("new"); }}
      placeholder={t("milkUseAddReason")} style={{ ...inp, marginBottom: 12 }} />
    <DatePick value={useDate} max={dayKey(Date.now())} onChange={setUseDate} />
    {qty > avail + 0.001 && <div style={{ background: "#F8E9EC", borderRadius: 8, padding: "10px 12px", marginBottom: 10,
      fontWeight: 600, color: C.red, fontSize: 13.5 }}>⚠️ {t("oversellWarn")} ({n1(avail)} {u})</div>}
    <button style={{ ...primaryBtn, opacity: canSave ? 1 : .45 }}
      onClick={() => {
        if (!canSave) return;
        const label = reason === "new" ? pick : chosenCustom;
        const code = label ? "custom" : reason;
        onSave({ ...milkPack(qty, unit), qty,
          reason: code, reasonLabel: label || "", at: dayStamp(useDate) });
      }}>✓ {t("save")}</button>
  </Sheet>;
}

function MilkStockCard({ stock, lang, t, onUse, unit = "L", simple }) {
  const u = milkUnitLb(unit, t);
  const show = (n) => n1(milkFromLiters(n, unit));
  const tone = { fresh: C.green, ok: C.field, aging: C.amber, old: C.red };
  const label = { fresh: t("milkFresh"), ok: t("milkOk"), aging: t("milkAging"), old: t("milkOld") };
  const s = stock || { available: 0, produced: 0, sold: 0, used: 0, lots: [] };
  const [showLots, setShowLots] = useState(false);
  const kit = <HelpKit t={t} tone="inv" items={[t("milkUseSub"), t("afterMilkHint"), t("milkLogHint")]} />;
  const useBtn = onUse ? <button type="button" onClick={onUse}
    style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.55)",
      background: "#fff", color: C.field, fontWeight: 800, fontSize: 13.5, cursor: "pointer",
      fontFamily: "var(--body)", whiteSpace: "nowrap" }}>− {t("milkUse")}</button> : null;
  if (simple) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      background: C.field, color: "#fff", borderRadius: 8, padding: "14px 16px" }}>
      <div>
        <div style={{ fontSize: 12, opacity: .85, fontWeight: 600 }}>{t("milkLeft")}</div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 28 }}>{show(s.available)} {u}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{useBtn}{kit}</div>
    </div>;
  }
  return <div style={{ display: "grid", gap: 10 }}>
    <div style={{ background: C.field, color: "#fff", borderRadius: 8, padding: "14px 16px",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, opacity: .85, fontWeight: 600 }}>{t("milkLeft")}</div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 26 }}>{show(s.available)} {u}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: .9, textAlign: "end", fontWeight: 600, lineHeight: 1.45 }}>
          <div>{t("milkProduced")} {show(s.produced)} {u}</div>
          <div>{t("milkSoldToday")} {show(s.sold)} {u}</div>
          <div>{t("milkUsed")} {show(s.used)} {u}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{useBtn}{kit}</div>
      </div>
    </div>
    {s.lots.length > 0 && (
      <button type="button" onClick={() => setShowLots((v) => !v)} className="dk-pill" style={{ justifySelf: "start" }}>
        {showLots ? "▾" : "▸"} {t("milkLotsLeft")} · {s.lots.length}
      </button>
    )}
    {showLots && s.lots.map((lot) => (
      <div key={lot.key || lot.id || lot.at} style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 11px",
        borderInlineStart: `4px solid ${tone[lot.fresh] || C.line}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{show(lot.remaining)} {u}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: tone[lot.fresh] }}>{label[lot.fresh]}</span>
        </div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
          {dmy(lot.at)} {hhmm(new Date(lot.at))}
          {lot.session === "am" ? ` · ${t("morning")}` : lot.session === "pm" ? ` · ${t("evening")}` : ""}
        </div>
      </div>
    ))}
    {s.lots.length === 0 && <div style={{ color: C.inkSoft, fontSize: 13.5 }}>{t("milkNoStock")}</div>}
  </div>;
}

function BirthSheet({ animal, animals, lang, t, onSave, onClose, onBack, backLabel }) {
  const [id, setId] = useState(animal ? animal.id : (animals.length === 1 ? animals[0].id : null));
  const a = animals.find((x) => x.id === id) || animal;
  const [kind, setKind] = useState("single");
  const [males, setMales] = useState(1);
  const [females, setFemales] = useState(0);
  const [dead, setDead] = useState(0);
  const total = males + females;
  const kinds = [["single", 1, t("single")], ["twins", 2, t("twins")], ["triplets", 3, t("triplets")], ["more", 4, t("more")]];
  const pick = (k, n) => { setKind(k); setMales(n); setFemales(0); };
  const young = a ? (lang === "ar" ? spOf(a).youngAr : spOf(a).youngEn) : "";
  return <Sheet title={`🐣 ${t("recordBirth")}`} sub={a ? `${spOf(a).icon} ${animalLabel(a)}` : ""} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    {!animal && <>
      <Step n="1" label={t("pickAnimal")} />
      <Scroller>{animals.map((x) => <Chip key={x.id} active={id === x.id} onClick={() => setId(x.id)} color={spOf(x).color}>
        {spOf(x).icon} {animalLabel(x)}</Chip>)}</Scroller>
    </>}
    <Step n={animal ? "1" : "2"} label={t("birthKind")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      {kinds.map(([k, n, lb]) => <button key={k} onClick={() => pick(k, n)} style={{ background: kind === k ? C.field : C.card,
        color: kind === k ? "#fff" : C.ink, border: `1px solid ${kind === k ? C.field : C.line}`, borderRadius: 4,
        padding: "12px 4px", cursor: "pointer", fontFamily: "var(--body)" }}>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 19 }}>{n}{k === "more" ? "+" : ""}</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{lb}</div></button>)}
    </div>
    <Step n={animal ? "2" : "3"} label={`${t("gender")} — ${t("newborns")}`} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>♂ {t("males")}</div>
        <Stepper value={males} onChange={setMales} step={1} />
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>♀ {t("females")}</div>
        <Stepper value={females} onChange={setFemales} step={1} />
      </div>
    </div>
    <Step n={animal ? "3" : "4"} label={`${t("stillborn")} — ${t("optional")}`} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13, marginBottom: 14 }}>
      <Stepper value={dead} onChange={setDead} step={1} />
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 4, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, opacity: .85, marginBottom: 3 }}>{t("birthSummary")}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>
        {total} {young} · ♂ {males} · ♀ {females}{dead > 0 ? ` · 💀 ${dead}` : ""}
      </div>
    </div>
    <button style={{ ...primaryBtn, opacity: id && total > 0 ? 1 : .45 }}
      onClick={() => id && total > 0 && onSave({ animalId: id, count: total, males, females, dead, kind })}>✓ {t("save")}</button>
  </Sheet>;
}

function PickAnimalSheet({ title, animals, lang, t, filter, onPick, onClose, onAdd, footer }) {
  const list = animals.filter(filter || (() => true));
  return <Sheet title={title} onClose={onClose}>
    {list.length === 0
      ? <Empty icon="🐄" title={t("noAnimals")} sub={t("noAnimalsSub")} cta={onAdd ? `➕ ${t("addAnimal")}` : null} onCta={onAdd} />
      : <div style={{ display: "grid", gap: 9 }}>
        {list.map((a) => <button key={a.id} onClick={() => onPick(a)} style={{ ...rowBtn, padding: "12px 14px" }}>
          <span style={{ width: 42, height: 42, borderRadius: 5, background: `${spOf(a).color}1A`,
            display: "grid", placeItems: "center", fontSize: 21, overflow: "hidden" }}>
            {a.photo ? <img src={a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : spOf(a).icon}
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 16 }}>{animalLabel(a)}</span>
            <span style={{ display: "block", fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>
              {spName(a.species, lang, true)}{isFlock(a) ? ` · ${nf(a.birds)} ${t("birds")}` : ` · ${statusLabel(a.status, lang)}`}
            </span>
          </span>
          <span style={{ fontSize: 18, color: C.inkSoft }}>›</span>
        </button>)}
      </div>}
    {footer}
  </Sheet>;
}

function MedSheet({ animals, lang, t, rate, pre, onSave, onClose, onBack, backLabel }) {
  const [id, setId] = useState(pre || null);
  const [type, setType] = useState(null);
  const [cost, setCost] = useState(0);
  const [name, setName] = useState("");
  const [receipt, setReceipt] = useState("");
  const a = animals.find((x) => x.id === id);
  return <Sheet title={`💉 ${t("giveMed")}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <Step n="1" label={t("pickAnimal")} />
    <Scroller>{animals.map((x) => <Chip key={x.id} active={id === x.id} onClick={() => setId(x.id)} color={spOf(x).color}>
      {spOf(x).icon} {animalLabel(x)}</Chip>)}</Scroller>
    <Step n="2" label={t("pickType")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
      {Object.entries(MED).map(([k, m]) => <button key={k} onClick={() => setType(k)} style={{ background: C.card,
        border: `1.5px solid ${type === k ? C.field : C.line}`, borderRadius: 6, padding: "13px 6px", cursor: "pointer", boxShadow: sh1 }}>
        <div style={{ fontSize: 24 }}>{m.i}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{lang === "ar" ? m.ar : m.en}</div></button>)}
    </div>
    <Step n="3" label={t("addCost")} />
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 12, boxShadow: sh1, display: "grid", gap: 8, justifyItems: "center" }}>
      <Stepper value={cost} onChange={setCost} step={5} suffix="$ USD" />
      {rate > 0 && <Money usd={cost} rate={rate} size={15} lang={lang} />}
    </div>
    <AttachPicker value={receipt} onPick={setReceipt} onClear={() => setReceipt("")} t={t} />
    <button style={{ ...primaryBtn, opacity: id && type ? 1 : .45 }}
      onClick={() => id && type && onSave({ animalId: id, medType: type, cost, name: name.trim(), receipt })}>✓ {t("save")}</button>
  </Sheet>;
}

function CountSheet({ title, icon, animals, lang, t, mode, onSave, onClose }) {
  const [id, setId] = useState(animals.length === 1 ? animals[0].id : null);
  const [count, setCount] = useState(mode === "loss" ? 1 : 1);
  const [reason, setReason] = useState("disease");
  return <Sheet title={`${icon} ${title}`} onClose={onClose}>
    <Step n="1" label={t("pickAnimal")} />
    <Scroller>{animals.map((x) => <Chip key={x.id} active={id === x.id} onClick={() => setId(x.id)} color={spOf(x).color}>
      {spOf(x).icon} {animalLabel(x)}</Chip>)}</Scroller>
    <Step n="2" label={mode === "loss" ? t("lossCount") : t("birthCount")} />
    <div style={{ background: C.card, borderRadius: 6, padding: 15, marginBottom: 12, boxShadow: sh1 }}>
      <Stepper big value={count} onChange={setCount} step={1} />
    </div>
    {mode === "loss" && <>
      <Step n="3" label={t("lossReason")} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[["disease", t("disease")], ["predator", t("predator")], ["heat", t("heat")], ["other", t("other")]].map(([k, lb]) =>
          <Chip key={k} active={reason === k} onClick={() => setReason(k)} color={C.red}>{lb}</Chip>)}
      </div>
    </>}
    <button style={{ ...primaryBtn, opacity: id && count > 0 ? 1 : .45 }}
      onClick={() => id && count > 0 && onSave({ animalId: id, count, reason })}>✓ {t("save")}</button>
  </Sheet>;
}

function WeightSheet({ animals, lang, t, onSave, onClose }) {
  const [id, setId] = useState(null);
  const a = animals.find((x) => x.id === id);
  const [kg, setKg] = useState(0);
  useEffect(() => { if (a) setKg(a.weight || 0); }, [id]);
  return <Sheet title={`⚖️ ${t("weighIn")}`} onClose={onClose}>
    <Step n="1" label={t("pickAnimal")} />
    <Scroller>{animals.map((x) => <Chip key={x.id} active={id === x.id} onClick={() => setId(x.id)} color={spOf(x).color}>
      {spOf(x).icon} {animalLabel(x)}</Chip>)}</Scroller>
    <Step n="2" label={t("weight")} />
    <div style={{ background: C.card, borderRadius: 6, padding: 15, marginBottom: 12, boxShadow: sh1 }}>
      <Stepper big value={kg} onChange={setKg} step={5} suffix={t("kg")} />
    </div>
    {a && a.weight > 0 && kg !== a.weight && <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 12,
      color: kg > a.weight ? C.green : C.red }}>{kg > a.weight ? "▲" : "▼"} {Math.abs(kg - a.weight)} {t("kg")}</div>}
    <button style={{ ...primaryBtn, opacity: id && kg > 0 ? 1 : .45 }} onClick={() => id && kg > 0 && onSave({ animalId: id, kg })}>✓ {t("save")}</button>
  </Sheet>;
}

const CAT_ICONS = ["📦", "⛽", "⚡", "💧", "🔧", "🏗️", "🚜", "📱", "🧾", "🏦", "🌱", "🧴"];

/* Receipts are photographed at a higher resolution than animal photos so the
   figures stay readable, then compressed to keep the farm record small. */
function AttachPicker({ value, onPick, onClear, t, onView }) {
  const [busy, setBusy] = useState(false);
  return <div style={{ background: C.card, border: `1px solid ${value ? C.field : C.line}`, borderRadius: 4,
    padding: 12, marginBottom: 12 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <label style={{ width: 74, height: 74, borderRadius: 3, background: C.paper, border: `1px solid ${C.line}`,
        display: "grid", placeItems: "center", cursor: "pointer", overflow: "hidden", flexShrink: 0 }}>
        {value ? <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 26 }}>{busy ? "⏳" : "🧾"}</span>}
        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={async (e) => { const f = e.target.files && e.target.files[0]; e.target.value = "";
            if (!f) return; setBusy(true);
            try { onPick(await compressImage(f, 1100, 0.6)); } catch (err) { /* unreadable image */ }
            setBusy(false); }} />
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{value ? `📎 ${t("attached")}` : `📷 ${t("attach")}`}</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{t("attachHint")}</div>
        {value && <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
          {onView && <button onClick={onView} style={{ background: "none", border: "none", color: C.field,
            fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>🔍 {t("viewReceipt")}</button>}
          <button onClick={onClear} style={{ background: "none", border: "none", color: C.red,
            fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>✕ {t("removeAttach")}</button>
        </div>}
      </div>
    </div>
  </div>;
}

function ReceiptSheet({ src, title, sub, lang, t, onClose, onRemove, onPrint, onBack, backLabel }) {
  return <Sheet title={`🧾 ${title}`} sub={sub} onClose={onClose} onBack={onBack} backLabel={backLabel} keepPrint={!onPrint}>
    <div className="receipt-print-body" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 8, marginBottom: 12 }}>
      <img src={src} alt="" style={{ width: "100%", height: "auto", display: "block", borderRadius: 2 }} />
    </div>
    <div className="no-print" style={{ display: "flex", gap: 9 }}>
      <button style={{ ...secondaryBtn, flex: 1 }} onClick={() => {
        const a = document.createElement("a");
        a.href = src; a.download = `receipt-${dayKey(Date.now())}.jpg`;
        document.body.appendChild(a); a.click();
        setTimeout(() => document.body.removeChild(a), 800);
      }}>⬇️ {t("download")}</button>
      <button style={{ ...secondaryBtn, flex: 1 }} onClick={() => {
        if (onPrint) onPrint({ src, title, sub });
        else window.print();
      }}>🖨️ {t("print")}</button>
    </div>
    {onRemove && <button className="no-print" style={{ ...secondaryBtn, marginTop: 9, color: C.red, borderColor: C.red }}
      onClick={onRemove}>✕ {t("removeAttach")}</button>}
  </Sheet>;
}

function ExpenseSheet({ lang, t, S, custom, species, animals, lastPriceOf, onSave, onSaveFeed, onAddCategory, onClose, initial, onSaveAndNew, onDelete, suppliers = [], preSupplierId }) {
  const fromSupplier = !initial && !!preSupplierId;
  const [step, setStep] = useState(initial ? 2 : 1);
  const [group, setGroup] = useState(initial ? expGroupOf(initial.category || "other") : null);
  const [cat, setCat] = useState(initial?.category || null);
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [note, setNote] = useState(initial?.note || "");
  const [vendor, setVendor] = useState(initial?.vendor || "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId || preSupplierId || null);
  const [date, setDate] = useState(initial?.at ? dayKey(initial.at) : dayKey(Date.now()));
  const [cur, setCur] = useState(initial?.currency || "usd");
  const [adding, setAdding] = useState(false);
  const [receipt, setReceipt] = useState(initial?.receipt || "");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📦");
  const initPay = initial
    ? (initial.payStatus === "paid" || !initial.payStatus
      ? (initial.amount || 0)
      : (initial.paidAmount || 0))
    : 0;
  /* Supplier purchases default to owing; plain expenses default to paid-as-you-type. */
  const [paidAmount, setPaidAmount] = useState(fromSupplier ? 0 : initPay);
  const [paidTouched, setPaidTouched] = useState(!!initial || fromSupplier);
  const [dueDate, setDueDate] = useState(initial?.dueDate || dayKey(Date.now()));

  const activeSuppliers = (suppliers || []).filter((s) => !s.archived);
  const pickSupplier = (s) => {
    setSupplierId(s ? s.id : null);
    setVendor(s ? s.name : "");
    if (!initial) {
      if (s) {
        /* Linking a supplier → treat as AP unless the user already set a payment. */
        if (!paidTouched) { setPaidTouched(true); setPaidAmount(0); }
      } else if (!paidTouched) {
        setPaidAmount(amount);
      }
    }
  };
  const setBill = (v) => {
    setAmount(v);
    if (!paidTouched) setPaidAmount(v);
    else setPaidAmount((p) => Math.min(p, v));
  };
  const setPaid = (v) => { setPaidTouched(true); setPaidAmount(v); };

  const builtins = expensesInGroup(group || "otherGrp").map((e) => ({
    key: e[0], icon: e[1], label: lang === "ar" ? e[2] : e[3], color: e[4],
    auto: e[0] === "labour" || e[0] === "medicine",
  }));
  const customs = (custom || []).filter((c) => !group || (c.group || "otherGrp") === group)
    .map((c) => ({ key: c.key, icon: c.icon || "📦", label: lang === "ar" ? c.ar : c.en || c.ar, color: c.color || "#6C7488" }));
  const items = [...builtins, ...customs];
  const pay = payState(amount, paidAmount);

  const buildPayload = () => {
    const chosen = activeSuppliers.find((s) => s.id === supplierId);
    const vendorName = (chosen ? chosen.name : vendor).trim();
    return {
      category: cat, amount: pay.bill, note: note.trim(), vendor: vendorName,
      supplierId: chosen ? chosen.id : null,
      at: dayStamp(date), currency: cur, rateUsed: S.rate, receipt,
      payStatus: pay.status,
      paidAmount: pay.paid,
      dueDate: pay.status === "paid" ? "" : dueDate,
      group: expGroupOf(cat) || group || "otherGrp",
      ...(initial?.id ? { id: initial.id } : {}),
    };
  };

  if (adding) return <Sheet title={`＋ ${t("newCategory")}`} onClose={() => setAdding(false)}>
    <Step n="1" label={t("categoryName")} />
    <input value={newName} onChange={(e) => setNewName(e.target.value)} style={{ ...inp, fontSize: 18, fontWeight: 700, marginBottom: 14 }} autoFocus />
    <Step n="2" label={t("pickIcon")} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
      {CAT_ICONS.map((ic) => <button key={ic} type="button" onClick={() => setNewIcon(ic)} style={{ width: 52, height: 52, borderRadius: 4,
        fontSize: 24, cursor: "pointer", background: newIcon === ic ? C.field : C.card, color: C.ink,
        border: `1.5px solid ${newIcon === ic ? C.field : C.line}` }}>{ic}</button>)}
    </div>
    <button type="button" style={{ ...primaryBtn, opacity: newName.trim() ? 1 : .45 }} onClick={() => {
      const n = newName.trim(); if (!n) return;
      const key = `c-${uid()}`;
      onAddCategory({ key, ar: n, en: n, icon: newIcon, color: "#4A3B78", group: group || "otherGrp" });
      setCat(key); setAdding(false); setNewName(""); setStep(2);
    }}>✓ {t("addCategory")}</button>
  </Sheet>;

  const linked = !!(supplierId || (vendor || "").trim());
  const sheetTitle = initial ? `✏️ ${t("editExpense")}`
    : fromSupplier || supplierId ? `🧾 ${t("logSupplierBill")}` : `💸 ${t("logExpense")}`;
  return <Sheet title={sheetTitle} onClose={onClose}
    onBack={step > 1 ? () => setStep((s) => s - 1) : undefined} backLabel={t("prev")}>
    {step === 1 && <>
      <Step n="1" label={t("pickGroup")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {EXPENSE_GROUPS.map(([gk, ic, ar, en, col]) => (
          <button type="button" key={gk} onClick={() => { setGroup(gk); setCat(null); }}
            style={{ background: group === gk ? col : C.card, color: group === gk ? "#fff" : C.ink,
              border: `2px solid ${group === gk ? col : C.line}`, borderRadius: 6, padding: "16px 10px",
              cursor: "pointer", fontFamily: "var(--body)", textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>{ic}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6,
              color: group === gk ? "#fff" : C.ink }}>{lang === "ar" ? ar : en}</div>
          </button>))}
      </div>
      {group && <>
        <Step n="2" label={t("pickItem")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {items.map((c) => <button type="button" key={c.key} onClick={() => setCat(c.key)} style={{
            background: cat === c.key ? c.color : C.card, color: cat === c.key ? "#fff" : C.ink,
            border: `1.5px solid ${cat === c.key ? c.color : C.line}`, borderRadius: 4, padding: "14px 6px",
            cursor: "pointer", fontFamily: "var(--body)" }}>
            <div style={{ fontSize: 24 }}>{c.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4, lineHeight: 1.25,
              color: cat === c.key ? "#fff" : C.ink }}>{c.label}</div>
          </button>)}
          <button type="button" onClick={() => setAdding(true)} style={{ background: C.card, border: `1px dashed ${C.line}`,
            borderRadius: 4, padding: "14px 4px", cursor: "pointer", fontFamily: "var(--body)", color: C.inkSoft }}>
            <div style={{ fontSize: 24 }}>＋</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>{t("newCategory")}</div>
          </button>
        </div>
        {cat === "feed" && onSaveFeed && <button type="button" style={{ ...secondaryBtn, marginBottom: 12, borderColor: C.field }}
          onClick={onSaveFeed}>🌾 {t("detailedFeed")} ›</button>}
        {cat === "labour" && <div style={{ background: "#F6EFDD", borderRadius: 3, padding: "9px 11px", fontSize: 12.5,
          fontWeight: 600, color: "#7A5312", marginBottom: 12 }}>ℹ️ {t("autoLabour")}</div>}
        {cat === "medicine" && <div style={{ background: "#F6EFDD", borderRadius: 3, padding: "9px 11px", fontSize: 12.5,
          fontWeight: 600, color: "#7A5312", marginBottom: 12 }}>ℹ️ {t("autoMed")}</div>}
      </>}
      <button type="button" style={{ ...primaryBtn, opacity: cat ? 1 : .45, marginTop: 8 }}
        onClick={() => cat && setStep(2)}>{t("next")} ›</button>
    </>}

    {step === 2 && <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: C.paper,
        border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px" }}>
        <span style={{ fontSize: 22 }}>{catIcon(cat, custom)}</span>
        <span style={{ flex: 1, fontWeight: 700 }}>{catLabel(cat, lang, custom)}</span>
        {!initial && <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none",
          color: C.field, fontWeight: 700, cursor: "pointer" }}>{t("edit")}</button>}
      </div>
      <Step n="2" label={t("amount")} />
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 15, marginBottom: 12 }}>
        <MoneyStepper big usd={amount} onChange={setBill} rate={S.rate} lang={lang} t={t} step={5} currency={cur} setCurrency={setCur} />
      </div>
      <PaySplit amount={amount} paid={paidAmount} onChange={setPaid} rate={S.rate} lang={lang} t={t}
        supplierLinked={linked || fromSupplier} />
      {pay.status !== "paid" && <>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("dueOn")}</div>
        <DatePick value={dueDate} onChange={setDueDate} />
      </>}
      <Step n="3" label={`${dmy(date)}`} />
      <DatePick value={date} max={dayKey(Date.now())} onChange={setDate} style={{ marginBottom: 14 }} />
      <button type="button" style={{ ...primaryBtn, opacity: amount > 0 ? 1 : .45, marginBottom: 10 }}
        onClick={() => amount > 0 && setStep(3)}>{t("next")} ›</button>
      <button type="button" style={{ ...secondaryBtn, opacity: amount > 0 ? 1 : .45 }}
        onClick={() => amount > 0 && onSave(buildPayload())}>✓ {t("saveExpense")}</button>
      {!initial && onSaveAndNew && <button type="button" style={{ ...secondaryBtn, marginTop: 8, opacity: amount > 0 ? 1 : .45 }}
        onClick={() => amount > 0 && onSaveAndNew(buildPayload())}>＋ {t("saveAndNew")}</button>}
      {initial && onDelete && <DeleteConfirmBlock t={t} warn={t("deleteExpenseWarn")} onDelete={onDelete} />}
    </>}

    {step === 3 && <>
      <Step n="3" label={`${t("optional")}`} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("pickSupplier")}</div>
      <SearchPick t={t} value={supplierId || ""}
        onChange={(id) => pickSupplier(id ? (activeSuppliers.find((s) => s.id === id) || null) : null)}
        extras={[{ id: "", label: t("noSupplierLink") }]}
        items={activeSuppliers.map((s) => ({ id: s.id, label: s.name, hint: s.phone || "", search: `${s.name} ${s.phone || ""}` }))} />
      {!supplierId && <>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("vendor")}</div>
        <input value={vendor} onChange={(e) => {
          const name = e.target.value;
          setVendor(name);
          if (!initial && name.trim() && !paidTouched) { setPaidTouched(true); setPaidAmount(0); }
        }} placeholder={t("newSupplier")}
          style={{ ...inp, marginBottom: 12 }} />
      </>}
      <PaySplit amount={amount} paid={paidAmount} onChange={setPaid} rate={S.rate} lang={lang} t={t}
        supplierLinked={linked} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("expenseNote")}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("expenseNoteHint")} style={{ ...inp, marginBottom: 12 }} />
      <AttachPicker value={receipt} onPick={setReceipt} onClear={() => setReceipt("")} t={t} />
      {pay.status !== "paid" && <>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("dueOn")}</div>
        <DatePick value={dueDate} onChange={setDueDate} />
      </>}
      <button type="button" style={{ ...primaryBtn, opacity: cat && amount > 0 ? 1 : .45 }}
        onClick={() => cat && amount > 0 && onSave(buildPayload())}>✓ {t("saveExpense")}</button>
      {!initial && onSaveAndNew && <button type="button" style={{ ...secondaryBtn, marginTop: 8, opacity: cat && amount > 0 ? 1 : .45 }}
        onClick={() => cat && amount > 0 && onSaveAndNew(buildPayload())}>＋ {t("saveAndNew")}</button>}
      {initial && onDelete && <DeleteConfirmBlock t={t} warn={t("deleteExpenseWarn")} onDelete={onDelete} />}
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => setStep(2)}>{t("prev")}</button>
    </>}
  </Sheet>;
}

function FeedSheet({ lang, t, S, species, lastPriceOf, animals, onSave, onClose, onBack, backLabel, suppliers = [] }) {
  const [feedType, setFeedType] = useState("hay");
  const [unit, setUnit] = useState("bag");
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [sp, setSp] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState(null);
  const [receipt, setReceipt] = useState("");
  const [cur, setCur] = useState("usd");
  useEffect(() => { const p = lastPriceOf(feedType, unit); if (p) setPrice(p); }, [feedType, unit]);
  const total = +(qty * price).toFixed(2);
  const heads = animals.filter((a) => !sp || a.species === sp).reduce((s2, a) => s2 + headCount(a), 0);
  const last = lastPriceOf(feedType, unit);
  const activeSuppliers = (suppliers || []).filter((s) => !s.archived);
  return <Sheet title={`🌾 ${t("feedCost")}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <Step n="1" label={t("feedType")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      {FEEDS.map(([k, ic]) => <button key={k} onClick={() => setFeedType(k)} style={{ background: feedType === k ? C.field : C.paper,
        color: feedType === k ? "#fff" : C.ink, border: `1px solid ${feedType === k ? C.field : C.line}`,
        borderRadius: 4, padding: "11px 3px", cursor: "pointer" }}>
        <div style={{ fontSize: 20 }}>{ic}</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{t(k)}</div></button>)}
    </div>
    <Step n="2" label={t("qtyUnit")} />
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <Chip active={unit === "bag"} onClick={() => setUnit("bag")}>🛍️ {t("bag")}</Chip>
      <Chip active={unit === "kg"} onClick={() => setUnit("kg")}>⚖️ {t("kgU")}</Chip>
    </div>
    <div style={{ background: C.card, borderRadius: 4, border: `1px solid ${C.line}`, padding: 14, marginBottom: 6 }}>
      <Stepper big value={qty} onChange={setQty} step={unit === "bag" ? 1 : 25} suffix={unit === "bag" ? t("bag") : t("kgU")} />
    </div>
    <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 400, marginBottom: 14 }}>💡 {t("bagHint")}</div>
    <Step n="3" label={`${t("unitPriceFeed")} — ${unit === "bag" ? t("bag") : t("kgU")}`} />
    {last > 0 && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 400, marginBottom: 8 }}>
      🕘 {t("lastPrice")}: <span style={{ fontFamily: "var(--mono)" }}>${last}</span></div>}
    <div style={{ background: C.card, borderRadius: 4, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
      <MoneyStepper usd={price} onChange={(v) => setPrice(+v.toFixed(4))} rate={S.rate} lang={lang} t={t} step={1} currency={cur} setCurrency={setCur} />
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 4, padding: 15, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{t("total")}</span>
        <span style={{ textAlign: "end" }}><Money usd={total} rate={S.rate} lang={lang} size={26} tone="#fff" /></span>
      </div>
      {heads > 0 && total > 0 && <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.25)",
        fontSize: 12.5, fontWeight: 500, opacity: .92 }}>
        {t("feedPerHead")}: <Money usd={+(total / heads).toFixed(2)} rate={S.rate} lang={lang} size={13} tone="#fff" /></div>}
    </div>
    {species.length > 1 && <>
      <Step n="4" label={`${t("forWhich")} — ${t("optional")}`} />
      <Scroller>
        <Chip active={!sp} onClick={() => setSp("")}>{t("all")}</Chip>
        {species.map((k) => <Chip key={k} active={sp === k} onClick={() => setSp(k)} color={SPECIES[k].color}>
          {SPECIES[k].icon} {spName(k, lang)}</Chip>)}
      </Scroller></>}
    <Step n={species.length > 1 ? "5" : "4"} label={`${t("supplier")} — ${t("optional")}`} />
    <SearchPick t={t} value={supplierId || ""}
      onChange={(id) => {
        if (!id) { setSupplierId(null); return; }
        const s = activeSuppliers.find((x) => x.id === id);
        setSupplierId(id);
        if (s) setSupplier(s.name);
      }}
      extras={[{ id: "", label: t("noSupplierLink") }]}
      items={activeSuppliers.map((s) => ({ id: s.id, label: s.name, hint: s.phone || "", search: `${s.name} ${s.phone || ""}` }))} />
    {!supplierId && <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ ...inp, marginBottom: 14 }}
      placeholder={t("newSupplier")} />}
    {supplierId && <div style={{ height: 8 }} />}
    <Step n={species.length > 1 ? "6" : "5"} label={`${t("attachment")} — ${t("optional")}`} />
    <AttachPicker value={receipt} onPick={setReceipt} onClear={() => setReceipt("")} t={t} />
    <button style={{ ...primaryBtn, opacity: total > 0 ? 1 : .45 }} onClick={() => total > 0 && onSave({
      category: "feed", feedType, unit, qty, unitPrice: price, amount: total, species: sp,
      supplier: (supplierId ? (activeSuppliers.find((s) => s.id === supplierId) || {}).name : supplier).trim() || supplier.trim(),
      supplierId: supplierId || null, vendor: (supplierId ? (activeSuppliers.find((s) => s.id === supplierId) || {}).name : supplier).trim() || supplier.trim(),
      payStatus: "paid", paidAmount: total,
      currency: cur, rateUsed: S.rate, receipt })}>✓ {t("save")}</button>
  </Sheet>;
}

function WorkerForm({ lang, t, onSave, onClose, onBack, backLabel }) {
  const [name, setName] = useState(""); const [type, setType] = useState("daily");
  const [salary, setSalary] = useState(0); const [err, setErr] = useState("");
  return <Sheet title={`➕ ${t("addWorker")}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <Step n="1" label={t("workerName")} />
    <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} style={{ ...inp, fontSize: 18, fontWeight: 700 }} />
    {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 7 }}>⚠️ {err}</div>}
    <div style={{ height: 14 }} />
    <Step n="2" label={t("workerType")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
      {[["daily", "📅", t("daily")], ["monthly", "🗓️", t("monthly")]].map(([k, ic, lb]) => (
        <button key={k} onClick={() => setType(k)} style={{ background: C.card, border: `1.5px solid ${type === k ? C.field : C.line}`,
          borderRadius: 6, padding: "13px 6px", cursor: "pointer", boxShadow: sh1 }}>
          <div style={{ fontSize: 22 }}>{ic}</div><div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 3 }}>{lb}</div></button>))}
    </div>
    {type === "monthly" && <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 14, boxShadow: sh1 }}>
      <Stepper value={salary} onChange={setSalary} step={25} suffix="$ USD" /></div>}
    <button style={primaryBtn} onClick={() => { const n = name.trim(); if (!n) return setErr(t("nameNeeded"));
      onSave({ id: uid(), name: n, type, salary: type === "monthly" ? salary : 0, at: iso(Date.now()) }); }}>✓ {t("save")}</button>
  </Sheet>;
}

function CustomerForm({ lang, t, S, customers, onSave, onClose, onBack, backLabel }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [product, setProduct] = useState("milk");
  const [own, setOwn] = useState(false); const [price, setPrice] = useState(S.milkPrice || 0);
  const [daily, setDaily] = useState(0); const [err, setErr] = useState("");
  const unit = product === "eggs" ? t("eggsUnit") : t("liters");
  return <Sheet title={`➕ ${t("addCustomer")}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <Step n="1" label={t("customerName")} />
    <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} style={{ ...inp, fontSize: 18, fontWeight: 700 }} />
    {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 7 }}>⚠️ {err}</div>}
    <div style={{ height: 14 }} />
    <Step n="2" label={`${t("phone")} — ${t("optional")}`} />
    <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} style={inp} />
    <div style={{ height: 14 }} />
    <Step n="3" label={t("product")} />
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {PRODUCTS.slice(0, 2).map(([k, ic, ar, en]) => <Chip key={k} active={product === k}
        onClick={() => { setProduct(k); setPrice(k === "eggs" ? S.eggPrice : S.milkPrice); }}>{ic} {lang === "ar" ? ar : en}</Chip>)}
    </div>
    <Step n="4" label={`${t("dailyQty")} — ${t("optional")}`} />
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 6, boxShadow: sh1 }}>
      <Stepper value={daily} onChange={setDaily} step={5} suffix={unit} />
    </div>
    <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500, marginBottom: 14 }}>💡 {t("dailyRoundSub")}</div>
    <Step n="5" label={t("customerPrice")} />
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <Chip active={!own} onClick={() => setOwn(false)}>{t("useDefault")}</Chip>
      <Chip active={own} onClick={() => setOwn(true)}>{t("unitPrice")}</Chip>
    </div>
    {own && <div style={{ background: C.card, borderRadius: 6, padding: 14, boxShadow: sh1 }}>
      <Stepper value={price} onChange={(v) => setPrice(+v.toFixed(2))} step={0.05} suffix="$ USD" /></div>}
    <button style={{ ...primaryBtn, marginTop: 18 }} onClick={() => {
      const n = name.trim(); if (!n) return setErr(t("nameNeeded"));
      if (customers.some((c) => c.name.trim().toLowerCase() === n.toLowerCase())) return setErr(t("nameTaken"));
      onSave({ id: uid(), name: n, phone: phone.trim(), product, priceL: own ? price : 0, defaultQty: daily, at: iso(Date.now()) });
    }}>✓ {t("save")}</button>
  </Sheet>;
}

function CustomerCreatedSheet({ lang, t, S, customer, acc, onViewFull, onView, onAddAnother, onClose, onBack, backLabel }) {
  const pr = PRODUCTS.find((x) => x[0] === (customer.product || "milk")) || PROD_MILK;
  const unit = (customer.product || "milk") === "eggs" ? t("eggsUnit") : t("liters");
  const price = customer.priceL > 0 ? customer.priceL : (customer.product === "eggs" ? S.eggPrice : S.milkPrice);
  return <Sheet title={`✓ ${t("customerCreated")}`} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    <div style={{ textAlign: "center", background: "#E8F5F0", borderRadius: 8, padding: "20px 16px", marginBottom: 16, border: `1px solid ${C.green}44` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.green, marginBottom: 6 }}>{t("accountReady")}</div>
      <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 32, color: C.field, letterSpacing: ".06em" }}>{acc}</div>
    </div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
      <Row k={t("customerName")} v={customer.name} tone={C.ink} />
      {customer.phone && <Row k={t("phone")} v={customer.phone} />}
      <Row k={t("product")} v={`${pr[1]} ${lang === "ar" ? pr[2] : pr[3]}`} />
      <Row k={t("unitPrice")} v={<Money usd={price} rate={S.rate} lang={lang} tone={C.ink} />} />
      {(customer.defaultQty || 0) > 0 && <Row k={t("dailyQty")} v={`${nf(customer.defaultQty)} ${unit}`} />}
    </div>
    <button style={{ ...primaryBtn, marginBottom: 10 }} onClick={onViewFull}>⛶ {t("openFullAccount")}</button>
    <button style={{ ...secondaryBtn, marginBottom: 10 }} onClick={onView}>🧾 {t("viewAccount")}</button>
    <button style={{ ...secondaryBtn, marginBottom: 10 }} onClick={onAddAnother}>➕ {t("addAnother")}</button>
    <button style={secondaryBtn} onClick={onClose}>{t("close")}</button>
  </Sheet>;
}

const SUPPLIER_TAGS = [["feed", "🌾", "tagFeed"], ["med", "💊", "tagMed"], ["other", "📦", "tagOther"]];
/* Common purchase types when logging a buy from a supplier (flat, one screen). */
const SUPPLIER_BUY_CATS = [
  "feed", "hay", "vet", "medicine", "livestock", "fuel", "repairs", "parts",
  "electricity", "water", "supplies", "other",
];

/* One-screen purchase from a supplier: default owing; pay now / later / partial. */
function SupplierBillSheet({ supplier, lang, t, S, custom, initial, onSave, onDelete, onClose, busy }) {
  const cats = (() => {
    const keys = [...SUPPLIER_BUY_CATS];
    (custom || []).forEach((c) => { if (c.key && !keys.includes(c.key)) keys.push(c.key); });
    return keys.map((k) => ({
      key: k, icon: catIcon(k, custom), label: catLabel(k, lang, custom), color: catColor(k, custom),
    }));
  })();
  const [cat, setCat] = useState(initial?.category || "feed");
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [priceMode, setPriceMode] = useState(initial?.priceMode === "unit" ? "unit" : "total");
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice
    || (initial?.qty > 0 && initial?.amount > 0 ? initial.amount / initial.qty : 0));
  const initialQtyMeta = purchaseQtyMeta(initial?.category || "feed");
  const [qty, setQty] = useState(initial?.qty || 0);
  const [unit, setUnit] = useState(initial?.unit || initialQtyMeta?.defaultUnit || "");
  const [feedType, setFeedType] = useState(initial?.feedType || (initial?.category === "hay" ? "hay" : "otherFeed"));
  /* Legacy bills with no payStatus were treated as fully paid. */
  const initPaid = !initial ? 0
    : !initial.payStatus ? (initial.amount || 0)
    : initial.payStatus === "paid" ? (initial.amount || 0)
    : (initial.paidAmount || 0);
  const [paidAmount, setPaidAmount] = useState(initPaid);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(initial?.at ? dayKey(initial.at) : dayKey(Date.now()));
  const [dueDate, setDueDate] = useState(initial?.dueDate || dayKey(Date.now()));
  const [note, setNote] = useState(initial?.note || "");
  const [cur, setCur] = useState(initial?.currency || "usd");
  const qtyMeta = purchaseQtyMeta(cat);
  const pay = payState(amount, paidAmount);
  const mode = pay.status === "paid" ? "now" : pay.status === "partial" ? "partial" : "later";
  const setBill = (v) => {
    const next = fromCents(toCents(v));
    setAmount(next);
    setPaidAmount((p) => fromCents(Math.min(toCents(p), toCents(next))));
  };
  const setUnitCost = (v, nextQty = qty) => {
    const next = fromCents(toCents(v));
    setUnitPrice(next);
    setBill(fromCents(toCents(next * nextQty)));
  };
  const setPurchaseQty = (v) => {
    const next = Math.max(0, Number(v) || 0);
    setQty(next);
    if (priceMode === "unit") setBill(fromCents(toCents(unitPrice * next)));
    else if (next > 0) setUnitPrice(unitFromTotal(amount, next));
  };
  const choosePriceMode = (nextMode) => {
    if (nextMode === priceMode) return;
    if (nextMode === "unit" && qty > 0) {
      const derived = fromCents(toCents(amount / qty));
      setUnitPrice(derived);
      setBill(fromCents(toCents(derived * qty)));
    }
    setPriceMode(nextMode);
  };
  const setMode = (m) => {
    if (m === "later") setPaidAmount(0);
    else if (m === "now") setPaidAmount(amount);
    else setPaidAmount((p) => (p > 0 && p < amount ? p : fromCents(Math.round(toCents(amount) / 2))));
  };
  const chooseCat = (nextCat) => {
    if (nextCat === cat) return;
    const meta = purchaseQtyMeta(nextCat);
    setCat(nextCat);
    setQty(0);
    setUnit(meta?.defaultUnit || "");
    setFeedType(nextCat === "hay" ? "hay" : "otherFeed");
    if (!meta) setPriceMode("total");
    else if (priceMode === "unit") setBill(0);
  };
  const locked = busy || saving;
  const invalid = !(amount > 0) || !cat || (qtyMeta && !(qty > 0))
    || (priceMode === "unit" && !(unitPrice > 0));
  const save = () => {
    if (locked || invalid) return;
    setSaving(true);
    onSave({
      id: initial?.id, category: cat, amount: pay.bill, note: note.trim(),
      qty: qtyMeta ? qty : undefined, unit: qtyMeta ? unit : undefined,
      priceMode: qtyMeta ? priceMode : "total",
      unitPrice: qtyMeta && priceMode === "unit" ? fromCents(toCents(unitPrice)) : undefined,
      feedType: cat === "feed" ? feedType : cat === "hay" ? "hay" : undefined,
      vendor: supplier.name, supplierId: supplier.id, supplier: supplier.name,
      at: dayStamp(date), currency: cur, rateUsed: S.rate,
      payStatus: pay.status, paidAmount: pay.paid,
      dueDate: pay.status === "paid" ? "" : dueDate,
      group: expGroupOf(cat) || "otherGrp",
    });
  };
  return <Sheet title={initial ? `✏️ ${t("logSupplierBill")}` : `🧾 ${t("supplierBuy")}`}
    sub={supplier.name} onClose={onClose}>
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px",
      marginBottom: 14, fontSize: 13, fontWeight: 600, color: C.inkSoft, lineHeight: 1.45 }}>
      💡 {t("supplierBuySub")}
    </div>
    <Step n="1" label={t("supplierWhatBought")} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
      {cats.map((c) => {
        const on = cat === c.key;
        return <button type="button" key={c.key} onClick={() => chooseCat(c.key)} style={{
          background: on ? c.color : C.card, color: on ? "#fff" : C.ink,
          border: `1.5px solid ${on ? c.color : C.line}`, borderRadius: 6, padding: "10px 4px",
          cursor: "pointer", fontFamily: "var(--body)" }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>{c.icon}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4, lineHeight: 1.2,
            color: on ? "#fff" : C.ink }}>{c.label}</div>
        </button>;
      })}
    </div>
    {qtyMeta && <>
      {qtyMeta.feed && <>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 7 }}>{t("feedType")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7, marginBottom: 12 }}>
          {FEEDS.map(([k, ic]) => <button type="button" key={k} onClick={() => setFeedType(k)} style={{
            background: feedType === k ? C.field : C.paper, color: feedType === k ? "#fff" : C.ink,
            border: `1px solid ${feedType === k ? C.field : C.line}`, borderRadius: 4, padding: "8px 3px",
            cursor: "pointer", fontFamily: "var(--body)", fontSize: 11.5, fontWeight: 700 }}>
            <div style={{ fontSize: 18 }}>{ic}</div>{t(k)}</button>)}
        </div>
      </>}
      <Step n="2" label={t("purchaseQty")} />
      {qtyMeta.units.length > 1 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
        {qtyMeta.units.map((u) => <Chip key={u} active={unit === u} onClick={() => setUnit(u)}>
          {u === "bag" ? "🛍️" : "⚖️"} {purchaseUnitLabel(u, t)}</Chip>)}
      </div>}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginBottom: 12 }}>
        <Stepper big value={qty} onChange={setPurchaseQty} step={qtyMeta.step[unit] || 1}
          decimals={unit === "kg" || unit === "L" ? 2 : 0} suffix={purchaseUnitLabel(unit, t)} />
      </div>
      {unit === "bag" && <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-5px 0 12px" }}>💡 {t("bagHint")}</div>}
    </>}
    <Step n={qtyMeta ? "3" : "2"} label={t("billTotal")} />
    {qtyMeta && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <Chip active={priceMode === "total"} onClick={() => choosePriceMode("total")}>{t("priceAsTotal")}</Chip>
      <Chip active={priceMode === "unit"} onClick={() => choosePriceMode("unit")}>{t("pricePerUnit")}</Chip>
    </div>}
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginBottom: 12 }}>
      {priceMode === "unit" && qtyMeta
        ? <>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>
            {t("pricePerUnit")} · {purchaseUnitLabel(unit, t)}</div>
          <MoneyStepper big usd={unitPrice} onChange={setUnitCost} rate={S.rate} lang={lang} t={t}
            step={0.05} currency={cur} setCurrency={setCur} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12,
            paddingTop: 10, borderTop: `1px solid ${C.line}`, fontWeight: 700 }}>
            <span style={{ color: C.inkSoft }}>{t("calculatedTotal")}</span>
            <Money usd={amount} rate={S.rate} lang={lang} tone={C.field} />
          </div>
        </>
        : <MoneyStepper big usd={amount} onChange={setBill} rate={S.rate} lang={lang} t={t}
          step={5} currency={cur} setCurrency={setCur} />}
    </div>
    <Step n={qtyMeta ? "4" : "3"} label={t("amountPaid")} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <Chip active={mode === "later"} onClick={() => setMode("later")} color={C.red}>{t("payLater")}</Chip>
      <Chip active={mode === "now"} onClick={() => setMode("now")} color={C.green}>{t("payNowMode")}</Chip>
      <Chip active={mode === "partial"} onClick={() => setMode("partial")} color={C.amber}>{t("payPartialMode")}</Chip>
    </div>
    <PaySplit amount={amount} paid={paidAmount} onChange={setPaidAmount} rate={S.rate} lang={lang} t={t}
      supplierLinked />
    {pay.status !== "paid" && <>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("dueOn")}</div>
      <DatePick value={dueDate} onChange={setDueDate} />
    </>}
    <Step n={qtyMeta ? "5" : "4"} label={`${t("colDate")} — ${dmy(date)}`} />
    <DatePick value={date} max={dayKey(Date.now())} onChange={setDate} />
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("notes2")} — {t("optional")}</div>
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("expenseNoteHint")}
      style={{ ...inp, marginBottom: 16 }} />
    <button type="button" disabled={locked || invalid}
      style={{ ...primaryBtn, opacity: locked || invalid ? .45 : 1 }}
      onClick={save}>{locked ? t("saving") : `✓ ${t("save")}`}</button>
    {initial && onDelete && <DeleteConfirmBlock t={t} warn={t("deleteExpenseWarn")} onDelete={onDelete} />}
  </Sheet>;
}

function SupplierForm({ lang, t, suppliers, initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [note, setNote] = useState(initial?.note || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [err, setErr] = useState("");
  const toggleTag = (k) => setTags((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  return <Sheet title={initial ? `✏️ ${t("manageSupplier")}` : `➕ ${t("addSupplier")}`} onClose={onClose}>
    <Step n="1" label={t("supplierName")} />
    <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
      style={{ ...inp, fontSize: 18, fontWeight: 700 }} autoFocus />
    {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 7 }}>⚠️ {err}</div>}
    <div style={{ height: 14 }} />
    <Step n="2" label={`${t("phone")} — ${t("optional")}`} />
    <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} style={inp} />
    <div style={{ height: 14 }} />
    <Step n="3" label={t("supplierTags")} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {SUPPLIER_TAGS.map(([k, ic, lb]) => (
        <Chip key={k} active={tags.includes(k)} onClick={() => toggleTag(k)}>{ic} {t(lb)}</Chip>))}
    </div>
    <Step n="4" label={`${t("supplierNote")} — ${t("optional")}`} />
    <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, marginBottom: 16 }} />
    <button type="button" style={primaryBtn} onClick={() => {
      const n = name.trim(); if (!n) return setErr(t("nameNeeded"));
      if ((suppliers || []).some((s) => s.id !== initial?.id && s.name.trim().toLowerCase() === n.toLowerCase())) return setErr(t("nameTaken"));
      onSave({ id: initial?.id || uid(), name: n, phone: phone.trim(), note: note.trim(), tags,
        at: initial?.at || iso(Date.now()), archived: initial?.archived || false });
    }}>✓ {t("save")}</button>
  </Sheet>;
}

function PaySupplierSheet({ supplier, ledger, lang, t, S, onSave, onClose, preBillId, busy }) {
  const b = ledger.bySupplier[supplier.id] || { due: 0, credit: 0, paid: 0 };
  const open = ledger.list.filter((x) => x.supplierId === supplier.id && x.due > 0)
    .slice().sort((a, c) => cmpTx(a, c, "oldest"));
  const startBill = preBillId && open.some((x) => x.id === preBillId) ? preBillId : null;
  const pickDue = (id) => {
    if (!id) return b.due;
    const hit = open.find((x) => x.id === id);
    return hit ? hit.due : b.due;
  };
  const [billId, setBillId] = useState(startBill);
  const [amount, setAmount] = useState(pickDue(startBill));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = billId ? open.find((x) => x.id === billId) : null;
  const overCap = selected
    ? fromCents(Math.max(0, toCents(amount) - toCents(selected.due)))
    : fromCents(Math.max(0, toCents(amount) - toCents(b.due)));
  const locked = busy || saving;
  const save = () => {
    const amt = fromCents(toCents(amount));
    if (locked || !(amt > 0)) return;
    setSaving(true);
    onSave({
      supplierId: supplier.id, amount: amt, method, note: note.trim(),
      expenseId: billId || null, vendor: supplier.name, at: dayStamp(dayKey(Date.now())),
    });
  };
  return <Sheet title={`💵 ${t("paySupplier")}`} sub={supplier.name} onClose={onClose}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
      <Kpi label={t("weOwe")} value={fmtC(b.due, S.rate, lang)} tone={moneyColor("due", b.due)} />
      <Kpi label={t("supplierCredit")} value={fmtC(b.credit || 0, S.rate, lang)} tone={C.green} />
    </div>
    {open.length > 0 && <>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("supplierOpenBills")}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <Chip active={!billId} onClick={() => { setBillId(null); setAmount(b.due); }}>{t("allocAuto")}</Chip>
        {open.map((bill) => (
          <Chip key={bill.id} active={billId === bill.id}
            onClick={() => { setBillId(bill.id); setAmount(bill.due); }}
            color={bill.overdue ? C.red : C.amber}>
            {bill.no} · {fmtC(bill.due, S.rate, lang)}{bill.overdue ? ` · ${t("overdue")}` : ""}
          </Chip>))}
      </div>
    </>}
    <Step n="1" label={t("amount")} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 12, marginBottom: 10 }}>
      <MoneyStepper usd={amount} onChange={setAmount} rate={S.rate} lang={lang} t={t} step={5} />
    </div>
    {overCap > 0.009 && <div style={{ background: "#E6F6F0", color: "#0F5C4D", borderRadius: 4, padding: "8px 10px",
      marginBottom: 12, fontSize: 12.5, fontWeight: 600 }}>💡 {t("supplierCreditHint")} · {fmtC(overCap, S.rate, lang)}</div>}
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <Chip active={method === "cash"} onClick={() => setMethod("cash")}>{t("cash")}</Chip>
      <Chip active={method === "transfer"} onClick={() => setMethod("transfer")}>{t("transfer")}</Chip>
    </div>
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notes2")} style={{ ...inp, marginBottom: 14 }} />
    <button type="button" disabled={locked || !(amount > 0)}
      style={{ ...primaryBtn, opacity: locked || !(amount > 0) ? .45 : 1 }}
      onClick={save}>{locked ? t("saving") : `✓ ${t("save")}`}</button>
  </Sheet>;
}

function SupplierAccount({ supplier, ledger, entries, lang, t, S, tab, setTab, onBill, onPay,
  onDoc, onManage, onEditBill, onEditPay, no }) {
  const b = ledger.bySupplier[supplier.id] || { bought: 0, paid: 0, due: 0, count: 0, credit: 0, oldest: 0, openCount: 0, overdueDue: 0 };
  const [sort, setSort] = useState("newest");
  const newest = sort !== "oldest";
  const byDate = (a, c) => cmpTx(a, c, newest ? "newest" : "oldest");
  const allBills = ledger.list.filter((x) => x.supplierId === supplier.id).slice().sort(byDate);
  const openBills = allBills.filter((x) => x.due > 0.009);
  const pays = (ledger.pays || entries.filter((e) => e.type === "supplierPay" && !e.implied))
    .filter((e) => e.supplierId === supplier.id && !e.implied).slice().sort(byDate);
  const statusText = (st) => (st === "paid" ? t("paidS") : st === "partial" ? t("partial") : st === "overdue" ? t("overdue") : t("unpaid"));
  const tagLb = (k) => { const row = SUPPLIER_TAGS.find((x) => x[0] === k); return row ? `${row[1]} ${t(row[2])}` : k; };
  const activeTab = ["open", "payments", "all"].includes(tab) ? tab : (tab === "activity" ? "all" : "open");
  const billKind = (bill) => payStatusKind(bill);
  const billTable = (rows, emptyMsg, { showPay } = {}) => (
    <DataList
      empty={rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>{emptyMsg}</div> : null}
      cards={rows.map((bill) => {
        const kind = billKind(bill);
        return (
          <DataCard key={bill.id} kind={kind}
            status={<StatusPill status={kind}>{statusText(kind)}</StatusPill>}
            title={bill.no}
            subtitle={`${dmy(bill.at)} · ${catIcon(bill.category, S.categories)} ${catLabel(bill.category, lang, S.categories)}`}
            who={<WhoHint e={bill} lang={lang} />}
            meta={`${t("amount")} ${fmtC(bill.amount, S.rate, lang)} · ${t("colPaid")} ${bill.paidAmount ? fmtC(bill.paidAmount, S.rate, lang) : "—"} · ${t("weOwe")} ${bill.due ? fmtC(bill.due, S.rate, lang) : "—"}`}
            onClick={onEditBill ? () => onEditBill(bill.id) : undefined}
            actions={(showPay && bill.due > 0.009) || onDoc ? (
              <>
                {onDoc && <button type="button" className="dk-pill" title={t("purchaseInvoice")}
                  onClick={(ev) => { ev.stopPropagation(); onDoc(bill); }}>🖨️</button>}
                {showPay && bill.due > 0.009 ? <button type="button" className="dk-pill"
                  onClick={(ev) => { ev.stopPropagation(); onPay(bill.id); }}>{t("supplierPayThis")}</button> : null}
              </>
            ) : null}
          >
            {bill.note ? <div className="data-card-sub">{bill.note}</div> : null}
          </DataCard>
        );
      })}
      table={
        <div className="overflow-x-auto" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <Th>{t("colDate")}</Th><Th>{t("invoiceNo")}</Th><Th>{t("category")}</Th>
              <Th align="end">{t("amount")}</Th><Th align="end">{t("colPaid")}</Th><Th align="end">{t("weOwe")}</Th>
              <Th>{t("colStatus")}</Th><Th>{t("colUser")}</Th>
              {showPay || onDoc ? <Th align="center">{t("actions")}</Th> : null}
            </tr></thead>
            <tbody>
              {rows.map((bill) => {
                const kind = billKind(bill);
                return (
                  <tr key={bill.id} className={statusRowClass(kind)} style={{ cursor: onEditBill ? "pointer" : "default" }}
                    onClick={() => onEditBill && onEditBill(bill.id)}>
                    <Td mono>{dmy(bill.at)}</Td>
                    <Td mono tone={C.field}>{bill.no}</Td>
                    <Td>{catIcon(bill.category, S.categories)} {catLabel(bill.category, lang, S.categories)}
                      {bill.qty > 0 ? <span style={{ display: "block", fontSize: 12, color: C.field, fontWeight: 700 }}>
                        {bill.feedType ? `${t(bill.feedType)} · ` : ""}{expenseQtyLabel(bill, t)}</span> : null}
                      {bill.note ? <span style={{ display: "block", fontSize: 12, color: C.inkSoft }}>{bill.note}</span> : null}
                    </Td>
                    <Td align="end" mono strong>{fmtC(bill.amount, S.rate, lang)}</Td>
                    <Td align="end" mono>{bill.paidAmount ? fmtC(bill.paidAmount, S.rate, lang) : "—"}</Td>
                    <Td align="end" mono strong>{bill.due ? fmtC(bill.due, S.rate, lang) : "—"}</Td>
                    <Td><StatusPill status={kind}>{statusText(kind)}</StatusPill></Td>
                    <Td align="center"><WhoHint e={bill} lang={lang} /></Td>
                    {showPay || onDoc ? <Td align="center"><div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                      {onDoc && <button type="button" className="dk-pill" title={t("purchaseInvoice")}
                        onClick={(ev) => { ev.stopPropagation(); onDoc(bill); }}>🖨️</button>}
                      {showPay && bill.due > 0.009 ? <button type="button" className="dk-pill"
                        onClick={(ev) => { ev.stopPropagation(); onPay(bill.id); }}>{t("supplierPayThis")}</button> : null}
                    </div></Td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
    />
  );
  const Pays = (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
      {pays.length === 0
        ? <div style={{ padding: 12, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>{t("noTx")}</div>
        : <div style={{ display: "grid", gap: 7 }}>
          {pays.map((p2) => (
            <div key={p2.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px dotted ${C.line}`, paddingBottom: 6, cursor: onEditPay ? "pointer" : "default" }}
              onClick={() => onEditPay && onEditPay(p2)}>
              <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <b style={{ fontFamily: "var(--mono)" }}>{dmy(p2.at)}</b> · {p2.method === "transfer" ? t("transfer") : t("cash")}
                {p2.expenseId ? ` · ${t("invoice")}` : ""}
                {p2.note ? ` · ${p2.note}` : ""}
                <WhoHint e={p2} lang={lang} /></span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.red }}>−{fmtC(p2.amount, S.rate, lang)}</span>
            </div>))}
        </div>}
    </div>
  );
  const Activity = (
    <div style={{ display: "grid", gap: 12 }}>
      <SearchFilterBar t={t} activeCount={sort !== "newest" ? 1 : 0}
        onReset={() => setSort("newest")}
        chips={sort !== "newest" ? [{ key: "sort", label: sortChipLabel(t, sort), onRemove: () => setSort("newest") }] : []}
      >
        <FilterGroup label={t("sortBy")}>
          <SortPair t={t} sort={sort} onChange={setSort}
            fields={[["date", t("sortDate")]]} />
        </FilterGroup>
      </SearchFilterBar>
      {billTable(allBills, t("supplierNoBills"))}
      {pays.length > 0 && <>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>💵 {t("supplierPays")}</div>
        {Pays}
      </>}
    </div>
  );

  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: C.card,
      border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: C.field, color: "#fff", display: "grid",
        placeItems: "center", fontWeight: 800, fontFamily: "var(--mono)", fontSize: 14 }}>{initials(supplier.name)}</div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{supplier.name}</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
          {no}{(supplier.tags || []).length ? ` · ${(supplier.tags || []).map(tagLb).join(" · ")}` : ""}
          {supplier.phone ? ` · ${supplier.phone}` : ""}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginTop: 4 }}>
          {b.due > 0 ? t("supplierLeadOwe") : t("supplierLeadClear")}
        </div>
      </div>
      <div className="account-balance">
        <StatusPill status={b.due > 0 ? ((b.overdueDue || 0) > 0.009 ? "overdue" : "owing") : "clear"}>
          {b.due > 0 ? ((b.overdueDue || 0) > 0.009 ? t("overdue") : t("weOwe")) : t("statusClear")}
        </StatusPill>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 22, color: C.ink }}>
          {fmtC(b.due, S.rate, lang)}</div>
        {b.credit > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, marginTop: 2 }}>
          ＋ {t("supplierCredit")} {fmtC(b.credit, S.rate, lang)}</div>}
      </div>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={{ ...primaryBtn, width: "auto", padding: "10px 16px" }} onClick={onBill}>
        ＋ {t("logSupplierBill")}</button>
      <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "10px 16px" }} onClick={() => onPay(null)}>
        💵 {t("paySupplier")}</button>
      {onManage && <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "10px 14px", color: C.inkSoft }}
        onClick={onManage}>⚙️ {t("manageSupplier")}</button>}
    </div>
    <div className="adapt-grid" style={{ marginBottom: 0 }}>
      <Kpi label={t("totalBought")} value={fmtC(b.bought, S.rate, lang)} />
      <Kpi label={t("paidToSupplier")} value={fmtC(b.paid, S.rate, lang)} tone={C.green} />
      <Kpi label={t("supplierOpenBills")} value={nf(b.openCount || openBills.length)} tone={C.amber} />
      <Kpi label={t("supplierOverdueKpi")} value={fmtC(b.overdueDue || 0, S.rate, lang)}
        tone={moneyColor("due", b.overdueDue || 0)} />
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {[
        ["open", `📋 ${t("supplierBillsTab")} · ${openBills.length}`],
        ["payments", `💵 ${t("supplierPaysTab")} · ${pays.length}`],
        ["all", `📊 ${t("supplierActivity")}`],
      ].map(([k, lb]) => <Chip key={k} active={activeTab === k} onClick={() => setTab(k)}>{lb}</Chip>)}
    </div>
    {activeTab === "payments" ? Pays
      : activeTab === "all" ? Activity
        : billTable(openBills, t("supplierNoOpen"), { showPay: true })}
  </div>;
}

function ObligationForm({ lang, t, S, initial, onSave, onClose }) {
  const [type, setType] = useState(initial?.type || "bill");
  const [title, setTitle] = useState(initial?.title || "");
  const [party, setParty] = useState(initial?.party || "");
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [freq, setFreq] = useState(initial?.frequency || "monthly");
  const [nextDue, setNextDue] = useState(initial?.nextDue || dayKey(Date.now()));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [docs, setDocs] = useState(initial?.documents || []);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  if (preview) return <ReceiptSheet src={preview.src} title={preview.title} sub="" lang={lang} t={t}
    onClose={() => setPreview(null)} />;
  return <Sheet title={initial ? `✏️ ${initial.title}` : `➕ ${t("addObligation")}`} onClose={onClose}>
    <Step n="1" label={t("obligationTypes")} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {OBL_TYPES.map(([k, ic, lb]) => <Chip key={k} active={type === k} onClick={() => setType(k)}>{ic} {t(lb)}</Chip>)}
    </div>
    <Step n="2" label={t("identity")} />
    <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(""); }} placeholder={lang === "ar" ? "مثال: إيجار الخم" : "e.g. Coop rent"} style={{ ...inp, marginBottom: 10, fontWeight: 700 }} />
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("partyName")}</div>
    <input value={party} onChange={(e) => setParty(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
    <Step n="3" label={t("amount")} />
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 14, boxShadow: sh1 }}>
      <MoneyStepper usd={amount} onChange={setAmount} rate={S.rate || 89500} lang={lang} t={t} step={10} />
    </div>
    <Step n="4" label={t("frequency")} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {OBL_FREQ.map(([k, lb]) => <Chip key={k} active={freq === k} onClick={() => setFreq(k)}>{t(lb)}</Chip>)}
    </div>
    <Step n="5" label={t("nextDue")} />
    <DatePick value={nextDue} onChange={setNextDue} style={{ marginBottom: 14 }} />
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("notes")}</div>
    <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
    <Step n="6" label={t("obligationDocs")} />
    {docs.map((d, i) => <AttachPicker key={d.id} value={d.data} t={t}
      onPick={(data) => setDocs(docs.map((x, j) => j === i ? { ...x, data } : x))}
      onClear={() => setDocs(docs.filter((_, j) => j !== i))}
      onView={() => setPreview({ src: d.data, title: d.name || `${t("obligationDocs")} ${i + 1}` })} />)}
    <AttachPicker value={null} t={t}
      onPick={(data) => setDocs([...docs, { id: uid(), data, name: `${t("docReserved")} ${docs.length + 1}`, at: iso(Date.now()) }])}
      onClear={() => {}} />
    {err && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {err}</div>}
    <button style={primaryBtn} onClick={() => {
      const n = title.trim(); if (!n) return setErr(t("nameNeeded"));
      onSave({ ...(initial || {}), id: initial?.id || uid(), type, title: n, party: party.trim(),
        amount, frequency: freq, nextDue, notes: notes.trim(), documents: docs.filter((d) => d.data),
        active: initial?.active !== false, rate: S.rate, at: initial?.at || iso(Date.now()) });
    }}>✓ {t("save")}</button>
  </Sheet>;
}

function SaleForm({ lang, t, S, customers, animals, preId, onSave, onClose, onAddCustomer, entries, ledger }) {
  const [cid, setCid] = useState(preId || (customers.length === 1 ? customers[0].id : null));
  const c = customers.find((x) => x.id === cid);
  const [product, setProduct] = useState(c?.product || "milk");
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [total, setTotal] = useState(0);
  const [priceMode, setPriceMode] = useState("unit");
  const [till, setTill] = useState(false);
  const [cur, setCur] = useState("usd");
  const [date, setDate] = useState(dayKey(Date.now()));
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState("");
  const [err, setErr] = useState("");
  const defPrice = (p) => (c && c.priceL > 0 && (c.product || "milk") === p ? c.priceL : p === "eggs" ? S.eggPrice : p === "milk" ? S.milkPrice : 0);
  useEffect(() => { if (c) { setProduct(c.product || "milk"); setQty(c.defaultQty || 0); } }, [cid]);
  useEffect(() => {
    const next = defPrice(product) || 0;
    setPrice(next);
    setTotal(fromCents(toCents((c?.defaultQty || 0) * next)));
  }, [cid, product]);
  const pr = PRODUCTS.find((p) => p[0] === product) || PROD_OTHER;
  const unit = product === "milk" ? milkUnitLb("kg", t) : (lang === "ar" ? pr[4] : pr[5]);
  const amount = priceMode === "total"
    ? fromCents(toCents(total))
    : qtyMoney(qty, price);
  const unitPrice = priceMode === "total"
    ? unitFromTotal(amount, qty)
    : price;
  const switchPriceMode = (next) => {
    if (next === priceMode) return;
    if (next === "total") setTotal(qtyMoney(qty, price));
    else if (qty > 0.0001) setPrice(unitFromTotal(total, qty));
    setPriceMode(next);
  };
  const discC = Math.min(toCents(amount), Math.max(0, toCents(discount)));
  const netAmount = fromCents(Math.max(0, toCents(amount) - discC));
  const discountOver = toCents(discount) > toCents(amount);
  const block = saleSaveReason(t, { cid, qty, price: unitPrice, amount, priceMode, discountOver });
  const goTill = () => {
    if (block) return setErr(block);
    setErr("");
    if (toCents(netAmount) < 1) return saveSale(0);
    setTill(true);
  };
  const saveSale = (payNow) => {
    if (block) return setErr(block);
    onSave({ customerId: cid, product, qty, price: unitPrice, amount, priceMode, payNow,
      discountAmount: fromCents(discC), discountNote: discountNote.trim(),
      unit: product === "milk" ? "kg" : undefined,
      currency: cur, rateUsed: S.rate, at: dayStamp(date), note: note.trim() });
  };
  const milkAvail = milkStock(entries || [], date).available;
  const milkNeed = product === "milk" ? milkToLiters(qty, "kg") : 0;
  const oversell = product === "milk" && milkNeed > milkAvail + 0.001;
  if (customers.length === 0) return <Sheet title={`🧾 ${t("newSale")}`} onClose={onClose}>
    <Empty icon="🤝" title={t("noCustomers")} sub={t("noCustomersSub")} cta={`➕ ${t("addCustomer")}`} onCta={onAddCustomer} />
  </Sheet>;
  return <Sheet title={till ? `💵 ${t("cashier")}` : `🧾 ${t("newSale")}`}
    sub={c ? customerLabel(c, t) : undefined}
    onClose={onClose} onBack={till ? () => setTill(false) : undefined} backLabel={t("prev")}>
    {till
      ? <CashierPayPrompt t={t} lang={lang} S={S} amount={netAmount} err={err} onConfirm={saveSale} />
      : <>
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px",
      marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, fontSize: 13.5 }}>
      <span>🥛 {t("milkLeft")}</span>
      <span style={{ fontFamily: "var(--mono)", color: milkAvail > 0 ? C.field : C.red }}>{n1(milkFromLiters(milkAvail, "kg"))} {t("kg")}</span>
    </div>
    <Step n="1" label={t("pickCustomer")} />
    <SearchPick t={t} value={cid} onChange={setCid} placeholder={t("searchParty")}
      items={customers.map((x) => ({
        id: x.id, label: customerLabel(x, t),
        hint: isWalkInCustomer(x) ? "" : (x.phone || ""),
        icon: isWalkInCustomer(x) ? "🛍️" : undefined,
        search: `${x.name || ""} ${x.phone || ""}`,
      }))}
      onAdd={onAddCustomer} addLabel={t("addCustomer")} />
    <Step n="2" label={t("product")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      {PRODUCTS.map(([k, ic, ar, en]) => {
        const on = product === k;
        return <button type="button" key={k} onClick={() => setProduct(k)} style={{
          background: on ? C.field : C.card, color: on ? "#fff" : C.ink,
          border: `1.5px solid ${on ? C.field : C.line}`, borderRadius: 5, padding: "11px 6px",
          cursor: "pointer", boxShadow: sh1, fontFamily: "var(--body)" }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>{ic}</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, lineHeight: 1.25,
            color: on ? "#fff" : C.ink }}>{lang === "ar" ? ar : en}</div>
        </button>;
      })}
    </div>
    <Step n="3" label={`${t("qty")} (${unit})`} />
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 12, boxShadow: sh1 }}>
      <Stepper big value={qty} onChange={setQty} step={product === "animal" ? 1 : 5} suffix={unit} decimals={1} />
      {product === "milk" && milkEqHint(qty, "kg", t)}
    </div>
    <Step n="4" label={priceMode === "total" ? t("priceFull") : t("pricePerUnit")} />
    <PriceModeToggle t={t} mode={priceMode} onChange={switchPriceMode} />
    <div style={{ background: C.card, borderRadius: 6, padding: 14, marginBottom: 12, boxShadow: sh1 }}>
      {priceMode === "unit"
        ? <MoneyStepper usd={price} onChange={(v) => setPrice(+v.toFixed(4))} rate={S.rate} lang={lang} t={t}
            step={product === "animal" ? 25 : 0.05} currency={cur} setCurrency={setCur} />
        : <MoneyStepper usd={total} onChange={(v) => setTotal(fromCents(toCents(v)))} rate={S.rate} lang={lang} t={t}
            step={1} currency={cur} setCurrency={setCur} />}
      {qty > 0 && amount > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12,
        paddingTop: 10, borderTop: `1px solid ${C.line}`, fontWeight: 700 }}>
        <span style={{ color: C.inkSoft }}>{priceMode === "unit" ? t("calculatedTotal") : t("calculatedUnit")}</span>
        <Money usd={priceMode === "unit" ? amount : unitPrice} rate={S.rate} lang={lang} tone={C.field} />
      </div>}
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 6, padding: 15, marginBottom: 14,
      display: "grid", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{t("grossSubtotal")}</span><Money usd={amount} rate={S.rate} lang={lang} size={18} tone="#fff" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: .9 }}>
        <span style={{ fontWeight: 600 }}>{t("discount")}</span><span>− <Money usd={fromCents(discC)} rate={S.rate} lang={lang} size={18} tone="#fff" /></span>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,.35)", paddingTop: 8, display: "flex",
        justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800 }}>{t("netInvoiceTotal")}</span><Money usd={netAmount} rate={S.rate} lang={lang} size={27} tone="#fff" />
      </div>
    </div>
    {discountOver && <div style={{ background: "#F5E2E4", borderRadius: 4, padding: "10px 12px", marginBottom: 10,
      fontWeight: 700, color: "#7A1A2E", fontSize: 13.5 }}>⚠️ {t("discountOverNet")}</div>}
    <Step n="5" label={t("discount")} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 14, marginBottom: 8 }}>
      <MoneyStepper usd={discount} onChange={(v) => setDiscount(fromCents(toCents(v)))} rate={S.rate} lang={lang} t={t}
        step={1} currency={cur} setCurrency={setCur} />
    </div>
    <input value={discountNote} onChange={(e) => setDiscountNote(e.target.value)} placeholder={t("discountNote")}
      style={{ ...inp, marginBottom: 12 }} />
    <Step n="6" label={`${t("saleDate")} — ${dmy(date)}`} />
    <DatePick value={date} max={dayKey(Date.now())} onChange={setDate} />
    <Step n="7" label={`${t("notes2")} — ${t("optional")}`} />
    <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
    {oversell && <div style={{ background: "#F6EFDD", borderRadius: 4, padding: "10px 12px", marginBottom: 10,
      fontWeight: 600, color: "#7A5312", fontSize: 13.5 }}>⚠️ {t("oversellWarn")} ({n1(milkFromLiters(milkAvail, "kg"))} {t("kg")})</div>}
    {(block || err) && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {err || block}</div>}
    <button type="button" style={{ ...primaryBtn, padding: "16px 18px", fontSize: 17, opacity: block ? .45 : 1 }}
      onClick={goTill}>💵 {t("charge")} ›</button>
      </>}
  </Sheet>;
}

function QuickSaleSheet({ lang, t, S, customers, preId, onSave, onClose, onAddCustomer }) {
  const named = (customers || []).filter((c) => !isWalkInCustomer(c));
  const [cid, setCid] = useState(preId || WALKIN_ID);
  const walkIn = cid === WALKIN_ID;
  const c = named.find((x) => x.id === cid);
  const [product, setProduct] = useState(c?.product || "milk");
  const [qty, setQty] = useState(c?.defaultQty || 0);
  const [price, setPrice] = useState(0);
  const [total, setTotal] = useState(0);
  const [priceMode, setPriceMode] = useState("unit");
  const [till, setTill] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const milkSaleUnit = "kg";
  const defPrice = (p) => (c && c.priceL > 0 && (c.product || "milk") === p ? c.priceL : p === "eggs" ? S.eggPrice : p === "milk" ? S.milkPrice : 0);
  useEffect(() => {
    if (c) { setProduct(c.product || "milk"); setQty(c.defaultQty || 0); }
    else { setProduct("milk"); setQty(0); }
  }, [cid]);
  useEffect(() => {
    const next = defPrice(product) || 0;
    setPrice(next);
    setTotal(fromCents(toCents((c?.defaultQty || 0) * next)));
  }, [cid, product]);
  const pr = PRODUCTS.find((p) => p[0] === product) || PROD_OTHER;
  const unitLb = product === "milk" ? milkUnitLb(milkSaleUnit, t) : (lang === "ar" ? pr[4] : pr[5]);
  const amount = priceMode === "total" ? fromCents(toCents(total)) : qtyMoney(qty, price);
  const unitPrice = priceMode === "total" ? unitFromTotal(amount, qty) : price;
  const switchPriceMode = (next) => {
    if (next === priceMode) return;
    if (next === "total") setTotal(qtyMoney(qty, price));
    else if (qty > 0) setPrice(unitFromTotal(total, qty));
    setPriceMode(next);
  };
  const block = saleSaveReason(t, { cid, qty, price: unitPrice, amount, priceMode });
  const goTill = () => { if (block) return setErr(block); setErr(""); setTill(true); };
  const saveQuick = (payNow) => {
    if (block) return setErr(block);
    onSave({
      customerId: cid, product, qty, price: unitPrice, amount, priceMode, note: note.trim(),
      unit: product === "milk" ? milkSaleUnit : undefined,
      payNow, at: iso(Date.now()),
    });
  };
  const who = walkIn ? t("walkIn") : (c ? c.name : "");
  return <Sheet title={till ? `💵 ${t("cashier")}` : `⚡ ${t("quickSale")}`}
    sub={who || undefined}
    onClose={onClose} onBack={till ? () => setTill(false) : undefined} backLabel={t("prev")}>
    {till
      ? <CashierPayPrompt t={t} lang={lang} S={S} amount={amount} err={err} onConfirm={saveQuick} />
      : <>
    <SearchPick t={t} value={cid} onChange={setCid} placeholder={t("searchParty")}
      extras={[{ id: WALKIN_ID, label: t("walkIn"), icon: "🛍️" }]}
      items={named.map((x) => ({ id: x.id, label: x.name, hint: x.phone || "", search: `${x.name} ${x.phone || ""}` }))}
      onAdd={onAddCustomer} addLabel={t("addCustomer")} />
    {walkIn && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "-4px 0 10px" }}>
      {t("walkInHint")}</div>}
    <div className="sale-product-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, margin: "12px 0" }}>
      {PRODUCTS.map(([k, ic, ar, en]) => {
        const on = product === k;
        return <button type="button" key={k} onClick={() => setProduct(k)} style={{
          background: on ? C.field : C.card, color: on ? "#fff" : C.ink,
          border: `1.5px solid ${on ? C.field : C.line}`, borderRadius: 8, padding: "14px 6px",
          cursor: "pointer", fontFamily: "var(--body)" }}>
          <div style={{ fontSize: 22 }}>{ic}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>{lang === "ar" ? ar : en}</div>
        </button>;
      })}
    </div>
    {product === "milk" && milkEqHint(qty, "kg", t)}
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("qty")} · {unitLb}</div>
      <Stepper big value={qty} onChange={setQty} step={5} decimals={1} suffix={unitLb} />
    </div>
    <PriceModeToggle t={t} mode={priceMode} onChange={switchPriceMode} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>
        {priceMode === "total" ? t("priceFull") : t("pricePerUnit")}</div>
      {priceMode === "unit"
        ? <MoneyStepper usd={price} onChange={(v) => setPrice(+v.toFixed(4))} rate={S.rate} lang={lang} t={t} step={0.05} />
        : <MoneyStepper usd={total} onChange={(v) => setTotal(fromCents(toCents(v)))} rate={S.rate} lang={lang} t={t} step={1} />}
    </div>
    {qty > 0 && amount > 0 && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "-2px 0 10px", textAlign: "center" }}>
      {priceMode === "unit" ? `${t("calculatedTotal")}: ${fmtC(amount, S.rate, lang)}` : `${t("unitPrice")}: ${fmtC(unitPrice, S.rate, lang)}`}
    </div>}
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notes2")}
      style={{ ...inp, marginBottom: 12 }} />
    <div style={{ background: C.field, color: "#fff", borderRadius: 8, padding: 14, marginBottom: 12,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 700 }}>{t("netInvoiceTotal")}</span>
      <Money usd={amount} rate={S.rate} lang={lang} size={26} tone="#fff" />
    </div>
    {(block || err) && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {err || block}</div>}
    <button type="button" style={{ ...primaryBtn, padding: "16px 18px", fontSize: 17, opacity: block ? .45 : 1 }}
      onClick={goTill}>💵 {t("charge")} ›</button>
      </>}
  </Sheet>;
}

function reimburseTypeOptions(S, entries) {
  const saved = [];
  const seen = new Set();
  [
    ...(S.saleReimburseTypes || []),
    ...(entries || []).filter((e) => e.type === "saleReimburse" || e.origin === "payment_reimbursement")
      .map((e) => e.name || e.note),
  ].forEach((name) => {
    const clean = String(name || "").trim();
    const key = clean.toLocaleLowerCase();
    if (clean && !seen.has(key)) { seen.add(key); saved.push(clean); }
  });
  return saved;
}

function PaymentForm({ lang, t, S, customer, ledger, entries, onSave, onClose }) {
  const open = ledger.list.filter((x) => x.customerId === customer.id && isOwing(x.due));
  const b = ledger.byCustomer[customer.id] || { due: 0 };
  const dueC = Math.max(0, toCents(b.due));
  const [amount, setAmount] = useState(fromCents(dueC));
  const [cashTouched, setCashTouched] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [suggestFromC, setSuggestFromC] = useState(dueC);
  const [method, setMethod] = useState("cash");
  const [cur, setCur] = useState("usd");
  const [date, setDate] = useState(dayKey(Date.now()));
  const [note, setNote] = useState("");
  const [reimbRows, setReimbRows] = useState([{ id: uid(), name: "", amount: 0 }]);
  const [err, setErr] = useState("");
  const types = reimburseTypeOptions(S, entries);
  const reimbC = reimbRows.reduce((sum, r) => sum + Math.max(0, toCents(r.amount)), 0);
  const typedCashC = cashTouched ? Math.max(0, toCents(amount)) : 0;
  const split = recordPaymentSplit({ dueC: suggestFromC, deductC: reimbC, cashC: typedCashC });
  const payC = cashTouched ? split.cashC : split.suggestedCashC;
  const settled = settleAmounts({ grossC: dueC, deductC: reimbC, paidC: payC });
  const remainingC = settled.dueC;
  const creditC = settled.creditC;
  const updateReimb = (id, patch) => {
    setErr("");
    setReimbRows((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  };
  const reimbursements = () => {
    const rows = reimbRows.filter((r) => toCents(r.amount) > 0)
      .map((r) => ({ name: String(r.name || "").trim(), amount: fromCents(toCents(r.amount)) }));
    if (rows.some((r) => !r.name)) { setErr(t("reimburseNameNeeded")); return null; }
    return rows;
  };
  const canSave = (payC > 0 || reimbC > 0);
  return <Sheet title={`💵 ${t("recordPayment")}`} sub={customerLabel(customer, t)} onClose={onClose}>
    <div style={{ background: C.card, borderRadius: 6, padding: 13, marginBottom: 12, boxShadow: sh1,
      display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
      <span>{t("due")}</span>
      {isOwing(b.due)
        ? <Money usd={b.due} rate={S.rate} lang={lang} size={20} tone={C.red} />
        : <span style={{ fontFamily: "var(--mono)", color: C.inkSoft }}>—</span>}
    </div>
    <Step n="1" label={`${t("cashToDrawer")} — ${t("payCurrency")}`} />
    <div style={{ background: C.card, borderRadius: 6, padding: 15, marginBottom: 12, boxShadow: sh1 }}>
      <MoneyStepper big usd={fromCents(payC)} onChange={(v) => { setCashTouched(true); setAmount(v); }}
        rate={S.rate} lang={lang} t={t} step={10} currency={cur} setCurrency={setCur} />
    </div>
    <Step n="2" label={t("method")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
      {[["cash", "💵", t("cash")], ["transfer", "📲", t("transfer")]].map(([k, ic, lb]) => {
        const on = method === k;
        return <button type="button" key={k} onClick={() => setMethod(k)} style={{
          background: on ? C.field : C.card, color: on ? "#fff" : C.ink,
          border: `1.5px solid ${on ? C.field : C.line}`, borderRadius: 6, padding: "12px 6px",
          cursor: "pointer", boxShadow: sh1, fontFamily: "var(--body)" }}>
          <div style={{ fontSize: 21 }}>{ic}</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3, color: on ? "#fff" : C.ink }}>{lb}</div>
        </button>;
      })}
    </div>
    <Step n="3" label={`${t("paymentDate")} — ${dmy(date)}`} />
    <DatePick value={date} max={dayKey(Date.now())} onChange={setDate} />
    <Step n="4" label={t("invoice")} />
    <Scroller>
      <Chip active={!saleId} onClick={() => { setSaleId(""); setSuggestFromC(dueC); setCashTouched(false); }}>⚡ {t("allTypes")}</Chip>
      {open.map((iv) => <Chip key={iv.id} active={saleId === iv.id} onClick={() => {
        setSaleId(iv.id); setSuggestFromC(toCents(iv.due)); setCashTouched(false); setAmount(iv.due);
      }}>
        {iv.no} · {fmtC(iv.due, S.rate, lang)}</Chip>)}
    </Scroller>
    <Step n="5" label={t("reimbursements")} />
    <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, margin: "-4px 0 10px", lineHeight: 1.45 }}>
      {t("reimburseFromBalance")}
    </div>
    <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
      <datalist id="pay-reimburse-types">
        {types.map((name) => <option key={name.toLocaleLowerCase()} value={name} />)}
      </datalist>
      {reimbRows.map((r, i) => {
        const shown = cur === "lbp" ? Math.round((r.amount || 0) * (S.rate || 0)) : r.amount || "";
        return <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(100px,.8fr) auto",
          gap: 7, alignItems: "center" }}>
          <input list="pay-reimburse-types" value={r.name} onChange={(e) => updateReimb(r.id, { name: e.target.value })}
            placeholder={t("expenseName")} style={{ ...inp, padding: "10px 11px", fontSize: 14.5 }} />
          <input type="number" min="0" step={cur === "lbp" ? "1000" : "0.01"} value={shown}
            onChange={(e) => {
              const raw = Math.max(0, +(e.target.value || 0));
              const usd = cur === "lbp" && S.rate > 0 ? raw / S.rate : raw;
              updateReimb(r.id, { amount: fromCents(toCents(usd)) });
            }} placeholder={`${t("amount")} (${cur === "lbp" ? t("lbp") : "USD"})`}
            style={{ ...inp, padding: "10px 9px", fontSize: 14, fontFamily: "var(--mono)", textAlign: "end" }} />
          {i === reimbRows.length - 1
            ? <button type="button" title={t("addReimbursement")} onClick={() => setReimbRows((rows) => [...rows, { id: uid(), name: "", amount: 0 }])}
                style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.field}`, background: C.paper,
                  color: C.field, fontWeight: 800, fontSize: 20, cursor: "pointer" }}>＋</button>
            : <button type="button" title={t("removeReimbursement")} onClick={() => setReimbRows((rows) => rows.filter((x) => x.id !== r.id))}
                style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.line}`, background: C.card,
                  color: C.red, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>×</button>}
        </div>;
      })}
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 6, padding: 15, marginBottom: 14, display: "grid", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>{t("due")}</span>
        <Money usd={fromCents(dueC)} rate={S.rate} lang={lang} size={18} tone="#fff" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", opacity: .92 }}>
        <span style={{ fontWeight: 600 }}>{t("reimbursementTotal")}</span>
        <span>− <Money usd={fromCents(reimbC)} rate={S.rate} lang={lang} size={18} tone="#fff" /></span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", opacity: .92 }}>
        <span style={{ fontWeight: 600 }}>{t("cashToDrawer")}</span>
        <span>− <Money usd={fromCents(payC)} rate={S.rate} lang={lang} size={18} tone="#fff" /></span>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,.35)", paddingTop: 8, display: "flex",
        justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800 }}>{creditC > 0 ? t("credit") : t("netDueNow")}</span>
        <Money usd={fromCents(creditC > 0 ? creditC : remainingC)} rate={S.rate} lang={lang} size={26} tone="#fff" />
      </div>
    </div>
    <Step n="6" label={`${t("notes2")} — ${t("optional")}`} />
    <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
    {(err) && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {err}</div>}
    <button style={{ ...primaryBtn, opacity: canSave ? 1 : .45 }}
      onClick={() => {
        const rows = reimbursements();
        if (!rows || !canSave) return;
        onSave({
          amount: fromCents(payC), cashAmount: fromCents(payC), saleId, method, currency: cur, rateUsed: S.rate,
          at: dayStamp(date), note: note.trim(), reimbursements: rows,
        });
      }}>✓ {t("save")}</button>
  </Sheet>;
}

function DailyRoundSheet({ lang, t, S, customers, ledger, onSave, onClose, milkLeft }) {
  const regulars = customers.filter((c) => (c.defaultQty || 0) > 0);
  const init = {}; regulars.forEach((c) => { init[c.id] = { qty: c.defaultQty, paid: false, skip: false }; });
  const [rows, setRows] = useState(init);
  const milkSaleUnit = "kg";
  const priceOf = (c) => (c.priceL > 0 ? c.priceL : (c.product === "eggs" ? S.eggPrice : S.milkPrice));
  const set = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const active = regulars.filter((c) => !rows[c.id]?.skip && (rows[c.id]?.qty || 0) > 0);
  const total = active.reduce((a, c) => a + rows[c.id].qty * priceOf(c), 0);
  const collected = active.filter((c) => rows[c.id].paid).reduce((a, c) => a + rows[c.id].qty * priceOf(c), 0);
  const milkQty = active.filter((c) => (c.product || "milk") === "milk").reduce((a, c) => a + (rows[c.id]?.qty || 0), 0);
  if (regulars.length === 0) return <Sheet title={`🚚 ${t("dailyRound")}`} onClose={onClose}>
    <Empty icon="🚚" title={t("noRegulars")} sub={t("dailyRoundSub")} /></Sheet>;
  return <Sheet title={`🚚 ${t("dailyRound")}`} sub={t("dailyRoundSub")} onClose={onClose}>
    {regulars.some((c) => (c.product || "milk") === "milk") && <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, marginBottom: 10 }}>
      {t("milkDensityHint")}</div>}
    {milkLeft != null && <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px",
      marginBottom: 12, fontWeight: 700, fontSize: 13.5, display: "flex", justifyContent: "space-between" }}>
      <span>🥛 {t("milkLeft")}</span>
      <span style={{ fontFamily: "var(--mono)", color: milkToLiters(milkQty, milkSaleUnit) > (milkLeft || 0) + 0.001 ? C.red : C.field }}>
        {n1(milkFromLiters(milkLeft, milkSaleUnit))} {milkUnitLb(milkSaleUnit, t)}{milkQty > 0 ? ` · −${n1(milkQty)} ${milkUnitLb(milkSaleUnit, t)}` : ""}</span>
    </div>}
    {milkLeft != null && milkToLiters(milkQty, milkSaleUnit) > (milkLeft || 0) + 0.001 && <div style={{ background: "#F6EFDD", borderRadius: 4, padding: 10, marginBottom: 12,
      fontWeight: 600, color: "#7A5312", fontSize: 13 }}>⚠️ {t("oversellWarn")}</div>}
    <div style={{ display: "grid", gap: 10 }}>
      {regulars.map((c) => {
        const r = rows[c.id] || { qty: 0, paid: false, skip: false };
        const b = ledger.byCustomer[c.id] || { due: 0 };
        const p = PRODUCTS.find((x) => x[0] === (c.product || "milk")) || PROD_MILK;
        const rowUnit = (c.product || "milk") === "milk" ? milkUnitLb(milkSaleUnit, t) : (lang === "ar" ? p[4] : p[5]);
        return <div key={c.id} style={{ background: C.card, borderRadius: 6, padding: 13, boxShadow: sh1,
          opacity: r.skip ? .5 : 1, borderInlineStart: `6px solid ${r.skip ? C.line : r.paid ? C.green : C.amber}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 16.5 }}>{p[1]} {c.name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: C.inkSoft, fontWeight: 600 }}>
                {fmtC(priceOf(c), S.rate, lang)} / {rowUnit}{isOwing(b.due) ? ` · ${t("due")} ${fmtC(b.due, S.rate, lang)}` : ""}</span>
            </span>
            <span><Money usd={r.qty * priceOf(c)} rate={S.rate} lang={lang} size={18} tone={C.field} /></span>
          </div>
          <Stepper value={r.qty} onChange={(v) => set(c.id, { qty: v })} step={5} suffix={rowUnit} />
          {(c.product || "milk") === "milk" && milkEqHint(r.qty, "kg", t)}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => set(c.id, { paid: !r.paid, skip: false })} style={{ flex: 1, background: r.paid ? C.green : C.card,
              color: r.paid ? "#fff" : C.ink, border: `1.5px solid ${r.paid ? C.green : C.line}`, borderRadius: 5,
              padding: "10px 6px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "var(--body)" }}>{r.paid ? `✓ ${t("paidS")}` : t("unpaid")}</button>
            <button type="button" onClick={() => set(c.id, { skip: !r.skip })} style={{ flex: 1, background: r.skip ? C.paper : C.card,
              border: `1.5px solid ${C.line}`, borderRadius: 5, padding: "10px 6px", fontWeight: 700, fontSize: 14, cursor: "pointer", color: C.ink, fontFamily: "var(--body)" }}>
              {r.skip ? "↩︎" : `⏭️ ${t("skip")}`}</button>
          </div>
        </div>;
      })}
    </div>
    <div style={{ background: C.field, color: "#fff", borderRadius: 6, padding: 15, margin: "14px 0",
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span><span style={{ display: "block", fontWeight: 700 }}>{active.length} × {t("invoice")}</span>
        <span style={{ display: "block", fontSize: 12, opacity: .85, fontWeight: 600 }}>{t("collected")} {fmtC(collected, S.rate, lang)}</span></span>
      <span style={{ textAlign: "end" }}><Money usd={total} rate={S.rate} lang={lang} size={26} tone="#fff" /></span>
    </div>
    <button style={{ ...primaryBtn, opacity: active.length ? 1 : .45 }} onClick={() => active.length && onSave(
      active.map((c) => ({ customerId: c.id, product: c.product || "milk", qty: rows[c.id].qty, price: priceOf(c),
        unit: (c.product || "milk") === "milk" ? "kg" : undefined,
        amount: +(rows[c.id].qty * priceOf(c)).toFixed(2), paid: rows[c.id].paid })))}>✓ {t("save")}</button>
  </Sheet>;
}

function DocGenSheet({ lang, t, kinds, onPrint, onClose, S, me, customers, ledger,
  suppliers, supplierLedger, scope = "customer", docId, cid, sid }) {
  const [kind, setKind] = useState(kinds[0]);
  const [dl, setDl] = useState(lang);
  const [stage, setStage] = useState("opts");
  const label = { invoice: `🧾 ${t("invoice")}`, receipt: `💵 ${t("receipt")}`,
    purchase: `🧾 ${t("purchaseInvoice")}`, statement: `📑 ${t("statement")}` };
  const tpl = docTplOf(S);
  const doc = { scope, kind, id: kind === "statement" ? (scope === "supplier" ? sid : cid) : docId,
    cid: scope === "customer" ? cid : undefined, sid: scope === "supplier" ? sid : undefined, docLang: dl };

  if (stage === "preview") {
    return <Sheet title={`🖨️ ${t("previewDoc")}`} sub={label[kind]} onClose={onClose}
      onBack={() => setStage("opts")} backLabel={t("backToOptions")}>
      <div className="doc-preview no-print-chrome">
        <PrintDoc doc={doc} lang={lang} t={t} S={S} me={me} customers={customers} ledger={ledger}
          suppliers={suppliers} supplierLedger={supplierLedger} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" style={{ ...secondaryBtn, flex: 1 }} onClick={() => setStage("opts")}>‹ {t("backToOptions")}</button>
        <button type="button" style={{ ...primaryBtn, flex: 1.2 }} onClick={() => onPrint(doc)}>🖨️ {t("printNow")}</button>
      </div>
    </Sheet>;
  }

  return <Sheet title={`🖨️ ${t("docGen")}`} onClose={onClose}>
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("preview")}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 4, background: S?.logo ? "#fff" : C.tag,
          border: S?.logo ? `1px solid ${C.line}` : "none", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {S?.logo ? <img src={S.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "🐄"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
            {(S && S.farmName) || t("setFarmName")}</div>
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 3 }}>
            {S ? [S.farmAddress, S.farmPhone].filter(Boolean).join(" · ") || t("identityHint") : t("identityHint")}</div>
          {(tpl.thanks || tpl.footerNote) && <div style={{ fontSize: 11.5, color: C.field, marginTop: 4, fontWeight: 600 }}>
            ✦ {(tpl.thanks || tpl.footerNote).slice(0, 60)}</div>}
        </div>
      </div>
    </div>
    <Step n="1" label={t("docType")} />
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {kinds.map((k) => <button key={k} onClick={() => setKind(k)} style={{ ...rowBtn,
        borderInlineStartColor: kind === k ? C.field : C.line, background: kind === k ? C.paper : C.card, padding: "13px 14px" }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{label[k]}</span>
        <span style={{ fontSize: 17, color: kind === k ? C.field : C.line }}>{kind === k ? "●" : "○"}</span></button>)}
    </div>
    <Step n="2" label={t("docLang")} />
    <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
      {[["ar", "🇱🇧 العربية"], ["en", "🇬🇧 English"], ["both", `🌐 ${t("bilingual")}`]].map(([k, lb]) => (
        <button key={k} onClick={() => setDl(k)} style={{ ...rowBtn,
          borderInlineStartColor: dl === k ? C.field : C.line, background: dl === k ? C.paper : C.card, padding: "13px 14px" }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{lb}</span>
          <span style={{ fontSize: 17, color: dl === k ? C.field : C.line }}>{dl === k ? "●" : "○"}</span></button>))}
    </div>
    <button type="button" style={primaryBtn} onClick={() => setStage("preview")}>👁 {t("previewDoc")} ›</button>
  </Sheet>;
}

function DocPreviewSheet({ lang, t, onClose, onPrint, title, children }) {
  return <Sheet title={`🖨️ ${title || t("previewDoc")}`} onClose={onClose}>
    <div className="doc-preview no-print-chrome">{children}</div>
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <button type="button" style={{ ...secondaryBtn, flex: 1 }} onClick={onClose}>{t("cancel")}</button>
      <button type="button" style={{ ...primaryBtn, flex: 1.2 }} onClick={onPrint}>🖨️ {t("printNow")}</button>
    </div>
  </Sheet>;
}

function EditSaleSheet({ sale, lang, t, S, onSave, onDelete, onClose }) {
  const [qty, setQty] = useState(sale.qty || 0);
  const [price, setPrice] = useState(sale.price || 0);
  const [total, setTotal] = useState(sale.amount || qtyMoney(sale.qty, sale.price));
  const [priceMode, setPriceMode] = useState(sale.priceMode === "total" ? "total" : "unit");
  const [date, setDate] = useState(dayKey(sale.at));
  const [note, setNote] = useState(sale.note || "");
  const [product, setProduct] = useState(sale.product || "milk");
  const [milkSaleUnit] = useState("kg");
  const [discount, setDiscount] = useState(sale.discountAmount || 0);
  const [discountNote, setDiscountNote] = useState(sale.discountNote || "");
  const amount = priceMode === "total" ? fromCents(toCents(total)) : qtyMoney(qty, price);
  const unitPrice = priceMode === "total" ? unitFromTotal(amount, qty) : price;
  const switchPriceMode = (next) => {
    if (next === priceMode) return;
    if (next === "total") setTotal(qtyMoney(qty, price));
    else if (qty > 0) setPrice(unitFromTotal(total, qty));
    setPriceMode(next);
  };
  const reimbAmount = fromCents((sale.reimbRows || []).filter((r) => !r.accountAlloc)
    .reduce((sum, r) => sum + toCents(r.amount), 0));
  const afterReimbC = Math.max(0, toCents(amount) - toCents(reimbAmount));
  const discC = Math.min(afterReimbC, Math.max(0, toCents(discount)));
  const netAmount = fromCents(Math.max(0, afterReimbC - discC));
  const reimburseOver = toCents(reimbAmount) > toCents(amount);
  const discountOver = toCents(discount) > afterReimbC;
  const pr = PRODUCTS.find((p) => p[0] === product) || PROD_OTHER;
  const qtyUnit = product === "milk" ? milkUnitLb(milkSaleUnit, t) : (lang === "ar" ? pr[4] : pr[5]);
  return <Sheet title={`✏️ ${t("editTx")}`} sub={sale.no} onClose={onClose}>
    <Step n="1" label={t("product")} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      {PRODUCTS.map(([k, ic, ar, en]) => {
        const on = product === k;
        return <button type="button" key={k} onClick={() => setProduct(k)} style={{
          background: on ? C.field : C.card, color: on ? "#fff" : C.ink,
          border: `1.5px solid ${on ? C.field : C.line}`, borderRadius: 4, padding: "10px 6px",
          cursor: "pointer", fontFamily: "var(--body)" }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>{ic}</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, lineHeight: 1.25,
            color: on ? "#fff" : C.ink }}>{lang === "ar" ? ar : en}</div>
        </button>;
      })}
    </div>
    {product === "milk" && milkEqHint(qty, "kg", t)}
    <Step n="2" label={`${t("qty")} (${qtyUnit})`} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 14, marginBottom: 12 }}>
      <Stepper big value={qty} onChange={setQty} step={5} decimals={1} suffix={qtyUnit} /></div>
    <Step n="3" label={priceMode === "total" ? t("priceFull") : t("pricePerUnit")} />
    <PriceModeToggle t={t} mode={priceMode} onChange={switchPriceMode} />
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 14, marginBottom: 12 }}>
      {priceMode === "unit"
        ? <MoneyStepper usd={price} onChange={(v) => setPrice(+v.toFixed(4))} rate={S.rate} lang={lang} t={t} step={0.05} />
        : <MoneyStepper usd={total} onChange={(v) => setTotal(fromCents(toCents(v)))} rate={S.rate} lang={lang} t={t} step={1} />}
    </div>
    {(sale.reimbRows || []).length > 0 && <div style={{ background: C.paper, border: `1px solid ${C.line}`,
      borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{t("reimbursements")}</div>
      <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8 }}>{t("reimburseReadOnly")}</div>
      {sale.reimbRows.map((r) => <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
        gap: 10, padding: "6px 0", borderBottom: `1px dotted ${C.line}`, fontSize: 13.5 }}>
        <span>{r.accountAlloc ? t("accountReimburse") : r.name}</span><span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>−{fmtC(r.amount, S.rate, lang)}</span>
      </div>)}
    </div>}
    <Step n="4" label={`${t("saleDate")} — ${dmy(date)}`} />
    <DatePick value={date} onChange={setDate} />
    <Step n="5" label={`${t("notes2")} — ${t("optional")}`} />
    <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
    <div style={{ background: C.field, color: "#fff", borderRadius: 4, padding: 14, marginBottom: 14,
      display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("grossSubtotal")}</span>
        <Money usd={amount} rate={S.rate} lang={lang} size={18} tone="#fff" /></div>
      {reimbAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("reimbursementTotal")}</span>
        <span>− <Money usd={reimbAmount} rate={S.rate} lang={lang} size={18} tone="#fff" /></span></div>}
      {discC > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("discount")}</span>
        <span>− <Money usd={fromCents(discC)} rate={S.rate} lang={lang} size={18} tone="#fff" /></span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.35)", paddingTop: 7 }}>
        <span style={{ fontWeight: 800 }}>{t("netInvoiceTotal")}</span>
        <Money usd={netAmount} rate={S.rate} lang={lang} size={24} tone="#fff" /></div>
    </div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>{t("discount")}</div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 14, marginBottom: 8 }}>
      <MoneyStepper usd={discount} onChange={(v) => setDiscount(fromCents(toCents(v)))} rate={S.rate} lang={lang} t={t} step={1} /></div>
    <input value={discountNote} onChange={(e) => setDiscountNote(e.target.value)} placeholder={t("discountNote")}
      style={{ ...inp, marginBottom: 12 }} />
    {reimburseOver && <div style={{ background: "#F6EFDD", borderRadius: 4, padding: "10px 12px", marginBottom: 10,
      fontWeight: 600, color: "#7A5312" }}>{t("reimburseOverGross")}</div>}
    {discountOver && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {t("discountOverNet")}</div>}
    {(() => {
      const block = saleSaveReason(t, { cid: true, qty, price: unitPrice, amount, priceMode, reimburseOver, discountOver });
      return <>
        {block && <div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠️ {block}</div>}
        <button type="button" style={{ ...primaryBtn, opacity: block ? .45 : 1 }}
          onClick={() => !block && onSave({ qty, price: unitPrice, amount, product, priceMode,
            discountAmount: fromCents(discC), discountNote: discountNote.trim(),
            unit: product === "milk" ? "kg" : undefined,
            at: dayStamp(date), note: note.trim() })}>✓ {t("save")}</button>
      </>;
    })()}
    {onDelete && <DeleteConfirmBlock t={t} warn={t("deleteWarn")} onDelete={onDelete} />}
  </Sheet>;
}

/* One customer's whole file: a summary, then every transaction in a table
   that can be searched, filtered by status and bounded by a date range. */
/* The account banner: who this is, and what they owe, above everything else.
   The balance is the one number the farmer opens this screen for. */
function AccountHead({ customer, no, b, lang, t, S }) {
  const owing = isOwing(b.due);
  const price = customer.priceL > 0 ? customer.priceL
    : (customer.product === "eggs" ? S.eggPrice : S.milkPrice);
  const bits = [`${t("accountNo")} ${no}`];
  if (customer.phone) bits.push(customer.phone);
  bits.push(`${t("since")} ${dmy(customer.at)}`);
  if (!isWalkInCustomer(customer)) bits.push(`${fmtC(price, S.rate, lang)} / ${t("colUnit")}`);
  return <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
    <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, background: C.bg,
      color: C.field, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16 }}>
      {initials(customerLabel(customer, t))}</div>
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19 }}>{customerLabel(customer, t)}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 3 }}>{bits.join(" \u00b7 ")}</div>
    </div>
    <div style={{ textAlign: "end", borderRadius: 12, padding: "10px 14px",
      background: C.paper, border: `1px solid ${C.line}`, display: "flex", flexDirection: "column",
      alignItems: "flex-end", gap: 8, minWidth: 140 }} className="account-balance">
      <StatusPill status={owing ? (b.oldest > 30 ? "overdue" : "owing") : "paid"}>
        {owing ? t("outstanding") : t("paidS")}</StatusPill>
      {owing
        ? <Money usd={b.due} rate={S.rate} lang={lang} size={26} />
        : <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 26, color: C.inkSoft }}>—</span>}
      {owing && b.oldest > 30 && <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft }}>
        {b.oldest} {t("daysLate")}</div>}
    </div>
  </div>;
}

function CustomerAccount({ customer, ledger, entries, lang, t, S, tab, setTab, filters, setFilters,
  onNewSale, onPayment, onEdit, onDoc, onExport, onManage, onCtx, onDeleteTx, onEditPay, no, wide }) {
  const b = ledger.byCustomer[customer.id] || { sold: 0, paid: 0, due: 0, count: 0, credit: 0, oldest: 0 };
  const all = ledger.list.filter((x) => x.customerId === customer.id);
  /* sort here rather than trusting the order the caller happens to pass in */
  const f = filters || { q: "", status: "all", from: "", to: "", sort: "newest" };
  const sortNewest = (f.sort || "newest") !== "oldest";
  const byDate = (a, c) => cmpTx(a, c, sortNewest ? "newest" : "oldest");
  const pays = entries.filter((e) => e.type === "payment" && e.customerId === customer.id)
    .slice().sort(byDate);
  const inR = (iso) => { const k = dayKey(iso); return (!f.from || k >= f.from) && (!f.to || k <= f.to); };
  const rows = all.filter((x) => inR(x.at))
    .filter((x) => f.status === "all" || x.status === f.status)
    .filter((x) => !f.q || `${x.no} ${x.note || ""} ${n1(x.qty)}`.toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, c) => cmpBySort(a, c, f.sort, (x) => x.netAmount, (x) => x.no));
  const rGross = fromCents(rows.reduce((sum, x) => sum + toCents(x.grossAmount), 0));
  const rDeduct = fromCents(rows.reduce((sum, x) => sum + toCents(x.reimbAmount) + toCents(x.discountAmount), 0));
  const rPaid = fromCents(rows.reduce((sum, x) => sum + toCents(x.paidAmount), 0));
  const rDue = fromCents(rows.reduce((sum, x) => sum + toCents(x.due), 0));
  const ranged = !!(f.from || f.to || f.status !== "all" || f.q);
  const statusText = (st) => (st === "paid" ? t("paidS") : st === "partial" ? t("partial") : st === "overdue" ? t("overdue") : t("unpaid"));
  const chipTone = (k) => (k === "all" ? C.field : k === "paid" ? C.green : k === "partial" ? C.amber : C.red);
  const deductAmt = (iv) => fromCents(toCents(iv.reimbAmount) + toCents(iv.discountAmount));
  const reimbName = (r) => r.accountAlloc ? t("accountReimburse") : (r.name || t("reimbursement"));
  const deductItems = [
    ...(ledger.reimbursements || []).filter((r) => r.customerId === customer.id && inR(r.at))
      .map((r) => ({ id: r.id, at: r.at, label: `${t("reimbursement")} · ${r.name || "—"}`, amount: r.amount, by: r })),
    ...(ledger.paymentDeductions || []).filter((r) => r.customerId === customer.id && inR(r.at))
      .map((r) => ({ id: r.id, at: r.at, label: `${t("reimbursement")} · ${deductionMemo(r) || "—"}`, amount: fromCents(deductionCents(r)), by: r })),
    ...rows.filter((x) => toCents(x.discountAmount) > 0.009)
      .map((x) => ({ id: `${x.id}-disc`, at: x.at, label: `${t("discount")}${x.discountNote ? ` · ${x.discountNote}` : ""} · ${x.no}`,
        amount: x.discountAmount })),
  ].sort((a, c) => cmpTx(a, c, sortNewest ? "newest" : "oldest"));
  const bDeduct = fromCents(toCents(b.deductions || 0) || (toCents(b.reimbursed) + toCents(b.discounted)));

  const Settlement = ({ gross, deduct, paid, due }) => (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}
      title={t("deductHint")}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("balance")}</div>
      <div style={{ display: "grid", gap: 6, fontSize: 13.5, fontWeight: 600 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t("accountTotal")}</span><span style={{ fontFamily: "var(--mono)" }}>{fmtC(gross, S.rate, lang)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.green }}>
          <span>{t("deductions")}</span><span style={{ fontFamily: "var(--mono)" }}>{isOwing(deduct) ? `− ${fmtC(deduct, S.rate, lang)}` : "—"}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.field }}>
          <span>{t("collected")}</span><span style={{ fontFamily: "var(--mono)" }}>{isOwing(paid) ? `− ${fmtC(paid, S.rate, lang)}` : "—"}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 7, borderTop: `1px solid ${C.line}`,
          fontWeight: 800 }}>
          <span>{t("settlementNet")}</span>
          <span style={{ fontFamily: "var(--mono)", color: isOwing(due) ? C.red : C.inkSoft }}>{fmtDue(due, S.rate, lang)}</span>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{t("deductHint")}</div>
    </div>
  );

  const Overview = (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="adapt-grid">
        <Kpi label={t("accountTotal")} value={fmtC(b.gross || b.sold, S.rate, lang)} />
        <Kpi label={t("deductions")} value={fmtC(bDeduct, S.rate, lang)} tone={C.green} hint={t("deductHint")} />
        <Kpi label={t("collected")} value={fmtC(b.paid, S.rate, lang)} tone={moneyColor("paid")} />
        <Kpi label={t("due")} value={fmtDue(b.due, S.rate, lang)} tone={moneyColor("due", b.due)} />
        <Kpi label={t("txCount")} value={nf(all.length)} tone={C.inkSoft} />
      </div>
      <Settlement gross={b.gross || b.sold} deduct={bDeduct} paid={b.paid} due={b.due} />
      {toCents(b.credit) > 0 && <div style={{ background: C.paper, borderRadius: 8, padding: 11, fontWeight: 700, color: C.ink,
        border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8 }}>
        <StatusPill status="paid">{t("credit")}</StatusPill>
        {fmtC(b.credit, S.rate, lang)}</div>}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
        {customer.phone && <Row k={t("phone")} v={customer.phone} />}
        <Row k={t("product")} v={(() => { const p = PRODUCTS.find((x) => x[0] === (customer.product || "milk"));
          return p ? `${p[1]} ${lang === "ar" ? p[2] : p[3]}` : "—"; })()} />
        <Row k={t("unitPrice")} v={fmtC(customer.priceL > 0 ? customer.priceL : (customer.product === "eggs" ? S.eggPrice : S.milkPrice), S.rate, lang)} />
        {(customer.defaultQty || 0) > 0 && <Row k={t("dailyQty")} v={nf(customer.defaultQty)} />}
        {all.length > 0 && <Row k={t("lastOrder")} v={`${dmy(all[all.length - 1].at)} · ${n1(all[all.length - 1].qty)}`} />}
        <Row k={t("since")} v={dmy(customer.at)} />
        <Row k={t("oldestDebt")} v={isOwing(b.due) && b.oldest > 0 ? `${b.oldest} ${t("days")}` : t("noLate")}
          tone={isOwing(b.due) && b.oldest > 30 ? C.red : isOwing(b.due) && b.oldest > 0 ? C.amber : C.green} />
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        <button style={primaryBtn} onClick={onNewSale}>🧾 {t("newSale")}</button>
        <div style={{ display: "flex", gap: 9 }}>
          <button style={{ ...secondaryBtn, flex: 1 }} onClick={onPayment}>💵 {t("recordPayment")}</button>
          <button style={{ ...secondaryBtn, flex: 1 }} onClick={() => setTab("transactions")}>📊 {t("transactions")} ›</button>
        </div>
      </div>
      {onManage && <button style={{ ...secondaryBtn, color: C.inkSoft, fontSize: 13.5 }} onClick={onManage}>⚙️ {t("manageAccount")}</button>}
    </div>
  );

  const Transactions = (
    <div style={{ display: "grid", gap: 12 }}>
      <SearchFilterBar t={t} q={f.q} onQ={(v) => setFilters({ ...f, q: v })} qPlaceholder={t("searchTx")}
        activeCount={(f.status !== "all" ? 1 : 0) + (f.from || f.to ? 1 : 0) + ((f.sort || "newest") !== "newest" ? 1 : 0)}
        onReset={() => setFilters({ q: "", status: "all", from: "", to: "", sort: "newest" })}
        chips={[
          f.status !== "all" ? { key: "st", label: f.status === "paid" ? t("paidS") : f.status === "partial" ? t("partial") : t("unpaid"),
            onRemove: () => setFilters({ ...f, status: "all" }) } : null,
          f.from || f.to ? { key: "range", label: `${f.from ? dmy(f.from) : "…"} → ${f.to ? dmy(f.to) : "…"}`,
            onRemove: () => setFilters({ ...f, from: "", to: "" }) } : null,
          (f.sort || "newest") !== "newest" ? { key: "sort", label: sortChipLabel(t, f.sort),
            onRemove: () => setFilters({ ...f, sort: "newest" }) } : null,
        ].filter(Boolean)}>
        <FilterGroup label={t("colStatus")}>
          {[["all", t("statusAll")], ["paid", t("paidS")], ["partial", t("partial")], ["unpaid", t("unpaid")]].map(([k, lb]) => (
            <Chip key={k} active={f.status === k} onClick={() => setFilters({ ...f, status: k })} color={chipTone(k)}>{lb}</Chip>))}
        </FilterGroup>
        <FilterGroup label={t("customRange")}>
          <DateFilterPills t={t} from={f.from} to={f.to}
            onChange={(from, to) => setFilters({ ...f, from, to })} />
        </FilterGroup>
        <FilterGroup label={t("sortBy")}>
          <SortPair t={t} sort={f.sort || "newest"} onChange={(sort) => setFilters({ ...f, sort })} />
        </FilterGroup>
      </SearchFilterBar>

      <div className="adapt-grid">
        <Kpi label={`${t("accountTotal")}${ranged ? ` · ${t("inRange")}` : ""}`} value={fmtC(rGross, S.rate, lang)} />
        <Kpi label={t("deductions")} value={fmtC(rDeduct, S.rate, lang)} tone={C.green} hint={t("deductHint")} />
        <Kpi label={t("collected")} value={fmtC(rPaid, S.rate, lang)} tone={C.green} />
        <Kpi label={ranged ? t("owingInRange") : t("due")} value={fmtDue(rDue, S.rate, lang)} tone={isOwing(rDue) ? C.red : C.inkSoft} />
        <Kpi label={t("txCount")} value={nf(rows.length)} tone={C.inkSoft} />
      </div>

      <DataList
        empty={rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>{t("noTx")}</div> : null}
        cards={rows.map((iv) => {
          const pr = PRODUCTS.find((x) => x[0] === iv.product) || PROD_OTHER;
          const kind = payStatusKind(iv);
          return (
            <DataCard key={iv.id} kind={kind}
              status={<StatusPill status={kind}>{statusText(kind)}</StatusPill>}
              title={iv.no}
              subtitle={`${dmy(iv.at)} · ${pr[1]} ${lang === "ar" ? pr[2] : pr[3]} · ${n1(iv.qty)} ${saleQtyUnit(iv, lang, t)}`}
              who={<WhoHint e={iv} lang={lang} />}
              meta={`${t("accountTotal")} ${fmtC(iv.grossAmount, S.rate, lang)}${deductAmt(iv) > 0.009 ? ` · ${t("deductions")} −${fmtC(deductAmt(iv), S.rate, lang)}` : ""} · ${t("colDue")} ${fmtDue(iv.due, S.rate, lang)}`}
              actions={
                <>
                  <button type="button" className="dk-pill dk-icon-btn" onClick={() => onEdit(iv)} title={t("editTx")}>✏️</button>
                  <button type="button" className="dk-pill dk-icon-btn" onClick={() => onDoc(iv)} title={t("docGen")}>🖨️</button>
                </>
              }
            />
          );
        })}
        table={
      <div className="overflow-x-auto" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4 }}>
        {rows.length === 0
          ? null
          : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: wide ? 0 : 720 }}>
            <thead><tr>
              <Th onClick={() => setFilters({ ...f, sort: sortNewest ? "oldest" : "newest" })}
                active dirn={sortNewest ? "desc" : "asc"}>{t("colDate")}</Th><Th>{t("invoiceNo")}</Th><Th>{t("product")}</Th>
              <Th align="end">{t("colQty")}</Th><Th align="end">{t("colUnit")}</Th><Th align="end">{t("accountTotal")}</Th>
              <Th align="end">{t("deductions")}</Th><Th align="end">{t("colPaid")}</Th><Th align="end">{t("colDue")}</Th>
              <Th>{t("colStatus")}</Th><Th>{t("colNotes")}</Th><Th>{t("colUser")}</Th><Th align="center">{t("actions")}</Th>
            </tr></thead>
            <tbody>
              {rows.map((iv) => { const pr = PRODUCTS.find((x) => x[0] === iv.product) || PROD_OTHER;
                const paidOn = pays.filter((p2) => p2.saleId === iv.id).sort((a2, c2) => cmpTx(a2, c2, "newest"))[0];
                const kind = payStatusKind(iv);
                return <tr key={iv.id} className={statusRowClass(kind)}
                  onContextMenu={(e) => onCtx && onCtx(e, [
                    { key: "edit", icon: "✏️", label: t("ctxEdit"), run: () => onEdit(iv) },
                    { key: "print", icon: "🖨️", label: t("ctxPrint"), run: () => onDoc(iv) },
                    isOwing(iv.due) && { key: "pay", icon: "💵", label: t("ctxPay"), run: () => onPayment() },
                    onDeleteTx && { key: "del", icon: "🗑️", label: t("ctxDelete"), run: () => onDeleteTx(iv) },
                  ].filter(Boolean))}>
                  <Td mono>{dmy(iv.at)}</Td>
                  <Td mono tone={C.field}>{iv.no}</Td>
                  <Td>{pr[1]} {lang === "ar" ? pr[2] : pr[3]}</Td>
                  <Td align="end" mono>{n1(iv.qty)} {saleQtyUnit(iv, lang, t)}</Td>
                  <Td align="end" mono tone={C.inkSoft}>{fmtC(iv.price, S.rate, lang)}</Td>
                  <Td align="end" mono strong>{fmtC(iv.grossAmount, S.rate, lang)}</Td>
                  <Td align="end" mono tone={deductAmt(iv) > 0.009 ? C.green : C.inkSoft}>
                    {deductAmt(iv) > 0.009 ? `−${fmtC(deductAmt(iv), S.rate, lang)}` : "—"}
                    {iv.reimbAmount > 0 && <span style={{ display: "block", marginTop: 3, fontSize: 10.5,
                      color: C.inkSoft, fontFamily: "var(--body)", fontWeight: 600 }}>
                      {t("reimbursement")} {(iv.reimbRows || []).map((r) => reimbName(r)).filter(Boolean).join("، ")}
                    </span>}
                    {(iv.discountAmount || 0) > 0.009 && <span style={{ display: "block", marginTop: 3, fontSize: 10.5,
                      color: C.inkSoft, fontFamily: "var(--body)", fontWeight: 600 }}>
                      {t("discount")}{iv.discountNote ? ` · ${iv.discountNote}` : ""}
                    </span>}
                  </Td>
                  <Td align="end" mono>{isOwing(iv.paidAmount) ? fmtC(iv.paidAmount, S.rate, lang) : "—"}</Td>
                  <Td align="end" mono strong>{fmtDue(iv.due, S.rate, lang)}</Td>
                  <Td><StatusPill status={kind}>{statusText(kind)}</StatusPill>
                    {iv.status !== "unpaid" && paidOn && <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 3,
                      fontFamily: "var(--mono)" }}>{dmy(paidOn.at)}</div>}
                    {isOwing(iv.due) && iv.lateDays > 0 && <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 2 }}>
                      {iv.lateDays} {t("daysLate")}</div>}
                  </Td>
                  <Td tone={C.inkSoft}>{iv.note || "—"}</Td>
                  <Td align="center"><WhoHint e={iv} lang={lang} /></Td>
                  <Td align="center">
                    <span style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      <button type="button" className="dk-pill dk-icon-btn" onClick={() => onEdit(iv)} title={t("editTx")}>✏️</button>
                      <button type="button" className="dk-pill dk-icon-btn" onClick={() => onDoc(iv)} title={t("docGen")}>🖨️</button>
                    </span>
                  </Td>
                </tr>; })}
            </tbody>
            <tfoot><tr style={{ background: C.paper }}>
              <Td strong colSpan={5}>{t("total")}</Td>
              <Td align="end" mono strong>{fmtC(rGross, S.rate, lang)}</Td>
              <Td align="end" mono strong tone={C.green}>{rDeduct > 0.009 ? `−${fmtC(rDeduct, S.rate, lang)}` : "—"}</Td>
              <Td align="end" mono strong tone={C.green}>{fmtC(rPaid, S.rate, lang)}</Td>
              <Td align="end" mono strong tone={isOwing(rDue) ? C.red : C.inkSoft}>{fmtDue(rDue, S.rate, lang)}</Td>
              <Td colSpan={4} />
            </tr></tfoot>
          </table>}
      </div>
      }
    />

      {deductItems.length > 0 && <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>↩ {t("deductions")}</div>
        <div style={{ display: "grid", gap: 7 }}>
          {deductItems.slice(0, 12).map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px dotted ${C.line}`, paddingBottom: 6 }}>
              <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <b style={{ fontFamily: "var(--mono)" }}>{dmy(d.at)}</b> · {d.label}
                {d.by && <WhoHint e={d.by} lang={lang} />}</span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.green }}>−{nf(d.amount)}</span>
            </div>))}
        </div>
      </div>}

      {pays.length > 0 && <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 13 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>💵 {t("payments")}</div>
        <div style={{ display: "grid", gap: 7 }}>
          {pays.filter((p2) => inR(p2.at)).slice(0, 12).map((p2) => (
            <div key={p2.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px dotted ${C.line}`, paddingBottom: 6, cursor: onEditPay ? "pointer" : "default" }}
              onClick={() => onEditPay && onEditPay(p2)}>
              <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <b style={{ fontFamily: "var(--mono)" }}>{dmy(p2.at)}</b> · {p2.method === "transfer" ? t("transfer") : t("cash")}
                {p2.note ? ` · ${p2.note}` : ""}
                <WhoHint e={p2} lang={lang} /></span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.green }}>+{nf(p2.amount)}</span>
            </div>))}
        </div>
      </div>}
    </div>
  );

  return <div style={{ display: "grid", gap: 12 }}>
    <AccountHead customer={customer} no={no} b={b} lang={lang} t={t} S={S} />
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {[["overview", `📋 ${t("overview")}`], ["transactions", `📊 ${t("transactions")} · ${all.length}`]].map(([k, lb]) => (
        <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{lb}</Chip>))}
      {onExport && <button onClick={onExport} title={t("exportAccount")}
        style={{ marginInlineStart: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 3,
          padding: "7px 11px", cursor: "pointer", fontFamily: "var(--body)", fontWeight: 600,
          fontSize: 13, color: C.ink }}>📊 {t("excel")}</button>}
    </div>
    {tab === "overview" ? Overview : Transactions}
  </div>;
}

function SetPassSheet({ lang, t, onSave, onClose }) {
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  const [stage, setStage] = useState("first"); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return <Sheet title={`🔑 ${t("setPass")}`} onClose={onClose}>
    <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{stage === "first" ? t("createPass") : t("confirmPass")}</div>
    <div style={{ fontSize: 13.5, color: C.inkSoft, fontWeight: 500, marginBottom: 10 }}>{t("passHint")}</div>
    <Keypad value={pin} onChange={(v) => { setPin(v); setErr(""); }} />
    {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 10, textAlign: "center" }}>⚠️ {err}</div>}
    <button style={{ ...primaryBtn, marginTop: 16, opacity: busy ? .6 : 1 }} onClick={async () => {
      if (stage === "first") { if (pin.length < 4) return setErr(t("passShort")); setErr(""); setPin2(pin); setPin(""); setStage("confirm"); return; }
      if (pin !== pin2) { setErr(t("passMismatch")); setPin(""); setPin2(""); setStage("first"); return; }
      setBusy(true); await onSave(pin); setBusy(false);
    }}>{stage === "first" ? `${t("next")} ›` : `✓ ${t("save")}`}</button>
  </Sheet>;
}

function WhatsNewSheet({ lang, t, onClose }) {
  const [hist, setHist] = useState(false);
  const pack = WHATS_NEW[VERSION.code] || {};
  const notes = pack[lang] || pack.en || pack.ar || [];
  const history = Object.keys(WHATS_NEW)
    .filter((code) => code !== VERSION.code)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return <Sheet title={`✨ ${t("whatsNew")} · v${VERSION.code}`} onClose={onClose}>
    <div style={{ fontSize: 13.5, color: C.inkSoft, fontWeight: 500, marginBottom: 14, lineHeight: 1.45 }}>{t("whatsNewLead")}</div>
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
      {notes.length === 0
        ? <div style={{ color: C.inkSoft, fontWeight: 500 }}>{t("upToDate")}</div>
        : <ul style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 8 }}>
          {notes.map((line, i) => (
            <li key={i} style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45, color: C.ink }}>{line}</li>
          ))}
        </ul>}
    </div>
    {history.length > 0 && <button type="button" className="dk-pill" style={{ marginBottom: 12 }} onClick={() => setHist((v) => !v)}>
      {hist ? `▾ ${t("hideVersionHistory")}` : `▸ ${t("showVersionHistory")}`}
    </button>}
    {hist && history.length > 0 && <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.inkSoft }}>{t("versionHistory")}</div>
      {history.map((code) => {
        const p = WHATS_NEW[code] || {};
        const lines = p[lang] || p.en || p.ar || [];
        return <div key={code} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 13, marginBottom: 6 }}>v{code}</div>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 5 }}>
            {lines.map((line, i) => (
              <li key={i} style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, color: C.ink }}>{line}</li>
            ))}
          </ul>
        </div>;
      })}
    </div>}
    <button type="button" style={primaryBtn} onClick={onClose}>✓ {t("gotIt")}</button>
  </Sheet>;
}

function ConfirmPinSheet({ lang, t, me, title, warn, confirmLabel, onConfirm, onClose, onBack, backLabel }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const needPin = !!(me && me.pin);
  const tryConfirm = async () => {
    if (needPin) {
      if (pin.length < 4) return;
      setBusy(true);
      const h = await hashPin(pin, me.salt || "");
      setBusy(false);
      if (h !== me.pin) return setErr(t("wrongPass"));
    }
    onConfirm();
  };
  return <Sheet title={title} onClose={onClose} onBack={onBack} backLabel={backLabel}>
    {warn && <div style={{ background: "#F5E2E4", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A1A2E", marginBottom: 14 }}>{warn}</div>}
    {needPin && <>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{t("enterPinConfirm")}</div>
      <Keypad value={pin} onChange={(v) => { setPin(v); setErr(""); }} onSubmit={tryConfirm} />
      {err && <div style={{ color: C.red, fontWeight: 700, marginTop: 10, textAlign: "center" }}>⚠️ {err}</div>}
    </>}
    <button style={{ ...primaryBtn, marginTop: 14, marginBottom: 10, opacity: busy ? .6 : 1 }}
      disabled={busy || (needPin && pin.length < 4)} onClick={tryConfirm}>{confirmLabel || t("confirmDelete")}</button>
    <button style={secondaryBtn} onClick={onClose}>{t("cancel")}</button>
  </Sheet>;
}

function CustomerManageSheet({ customer, no, lang, t, S, ledger, onArchive, onDelete, onExport, onClose }) {
  const b = ledger.byCustomer[customer.id] || { due: 0 };
  const system = isWalkInCustomer(customer);
  return <Sheet title={`⚙️ ${t("manageAccount")}`} sub={customerLabel(customer, t)} onClose={onClose}>
    <Row k={t("accountNo")} v={no} />
    <Row k={t("due")} v={fmtDue(b.due || 0, S.rate, lang)} tone={moneyColor("due", b.due)} />
    {system && <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600, margin: "10px 0 4px" }}>{t("walkInHint")}</div>}
    <button style={{ ...secondaryBtn, marginTop: 14, marginBottom: 10 }} onClick={onExport}>💾 {t("exportArchive")}</button>
    {!system && <button style={{ ...secondaryBtn, marginBottom: 10 }} onClick={onArchive}>📦 {t("archiveAccount")}</button>}
    {!system && <button style={{ ...secondaryBtn, color: C.red, borderColor: C.red }} onClick={onDelete}>🗑️ {t("deleteAccount")}</button>}
  </Sheet>;
}

function ArchivedAccountsSheet({ customers, ledger, lang, t, S, onRestore, onExport, onClose }) {
  const archived = customers.filter((c) => c.archived);
  return <Sheet title={`📦 ${t("archivedAccounts")}`} onClose={onClose}>
    {archived.length === 0
      ? <Empty icon="📦" title={t("noArchived")} sub="" />
      : <div style={{ display: "grid", gap: 10 }}>
        {archived.map((c) => { const b = ledger.byCustomer[c.id] || {};
          return <div key={c.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14 }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10 }}>
              {c.archivedAt ? dmy(c.archivedAt) : "—"}{c.archivedBy ? ` · ${c.archivedBy}` : ""}
              {isOwing(b.due) && <> · <span style={{ color: C.red }}>{fmtC(b.due, S.rate, lang)} {t("due")}</span></>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...secondaryBtn, flex: 1, padding: "9px", fontSize: 13 }} onClick={() => onExport(c)}>💾 {t("exportArchive")}</button>
              <button style={{ ...primaryBtn, flex: 1, padding: "9px", fontSize: 13 }} onClick={() => onRestore(c)}>↩ {t("restoreAccount")}</button>
            </div>
          </div>; })}
      </div>}
  </Sheet>;
}

function ObligationDocsSheet({ obligation, lang, t, onView, onClose }) {
  const docs = obligation.documents || [];
  return <Sheet title={`📎 ${t("obligationDocs")}`} sub={obligation.title} onClose={onClose}>
    {docs.length === 0
      ? <div style={{ padding: 20, textAlign: "center", color: C.inkSoft }}>{t("none")}</div>
      : <div style={{ display: "grid", gap: 10 }}>
        {docs.map((d, i) => <button key={d.id || i} onClick={() => onView(d.data, d.name || `${t("docReserved")} ${i + 1}`)}
          style={{ ...rowBtn, padding: 12 }}>
          <span style={{ width: 56, height: 56, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
            <img src={d.data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></span>
          <span style={{ flex: 1, textAlign: "start" }}>
            <span style={{ display: "block", fontWeight: 700 }}>{d.name || `${t("docReserved")} ${i + 1}`}</span>
            {d.at && <span style={{ display: "block", fontSize: 12, color: C.inkSoft }}>{dmy(d.at)}</span>}
          </span>
          <span style={{ color: C.field, fontWeight: 700 }}>🔍</span>
        </button>)}
      </div>}
  </Sheet>;
}

/* ------------------------------- guide ------------------------------- */
const HELP = {
  start: { ar: { title: "كيف تبدأ", intro: "التطبيق يبدأ فارغًا. خمس خطوات ويصبح جاهزًا.",
      steps: [["1️⃣", "أنشئ ملفك", "اسمك وعملك، ورمز دخول اختياري."],
        ["2️⃣", "أضف حيواناتك", "اختر النوع: أبقار، ماعز، أغنام أو دواجن — وتتغيّر الحقول تلقائيًا."],
        ["3️⃣", "أدخل الأسعار", "سعر الصرف وسعر الحليب والبيضة وأجرة العامل."],
        ["4️⃣", "أضف العمال والزبائن", "لتسجيل الحضور والفواتير."],
        ["5️⃣", "سجّل كل يوم", "الحليب والبيض والأدوية والمصاريف — وتُبنى التقارير وحدها."]],
      tip: "كل إجراء يُحفظ باسمك وتاريخه، ويظهر لجميع المستخدمين." },
    en: { title: "How to start", intro: "The app starts empty. Five steps and it is ready.",
      steps: [["1️⃣", "Create your profile", "Your name, your job, and an optional passcode."],
        ["2️⃣", "Add your animals", "Pick the species — cattle, goats, sheep or poultry — and the fields adapt."],
        ["3️⃣", "Enter your prices", "Exchange rate, milk and egg price, daily wage."],
        ["4️⃣", "Add workers and customers", "For attendance and invoices."],
        ["5️⃣", "Log every day", "Milk, eggs, medicine, costs — the reports build themselves."]],
      tip: "Every action is saved with your name and time, visible to all users." } },
  animals: { ar: { title: "الحيوانات", intro: "كل حيوان أو قطيع في بطاقة، بلون نوعه وحالته.",
      steps: [["🐄", "الأبقار والماعز والأغنام", "تُسجَّل فرديًا برقم أذن، وتُتابَع حالتها وحملها ووزنها."],
        ["🐔", "الدواجن", "تُسجَّل كقطيع بعدد طيور، ويُتابَع البيض والنفوق ونسبة الإنتاج."],
        ["🟢🟡🔴", "الألوان", "أخضر سليم، أصفر عشار أو تربية، أحمر مريض، رمادي متوقف."],
        ["👆", "اضغط البطاقة", "ملف كامل: الإنتاج، الأدوية، الوزن، ومن سجّل كل بيان."]],
      tip: "مدة الحمل محفوظة لكل نوع: بقرة ٢٨٣ يومًا، ماعز ١٥٠، نعجة ١٥٢، وتفقيس البيض ٢١." },
    en: { title: "Animals", intro: "Every animal or flock is one card, coloured by species and condition.",
      steps: [["🐄", "Cattle, goats, sheep", "Tracked individually by ear tag, with condition, pregnancy and weight."],
        ["🐔", "Poultry", "Tracked as a flock with a bird count, eggs, losses and lay rate."],
        ["🟢🟡🔴", "The colours", "Green healthy, amber pregnant or growing, red sick, grey stopped."],
        ["👆", "Tap a card", "The full file: production, medicine, weight and who logged what."]],
      tip: "Gestation is built in: cow 283 days, goat 150, ewe 152, egg incubation 21." } },
  entry: { ar: { title: "التسجيل", intro: "تظهر أزرار التسجيل حسب ما تملكه من حيوانات.",
      steps: [["🥛", "الحليب", "حلبة الصباح والمساء لكل حيوان حلوب."],
        ["🥚", "البيض", "العدد المجموع والمكسور، وتُحسب نسبة الإنتاج تلقائيًا."],
        ["💉", "الدواء", "لقاح أو علاج أو فيتامين أو مضاد ديدان، مع الكلفة."],
        ["⚖️ 💀 🐣", "الوزن والنفوق والولادات", "لمتابعة النمو والخسائر والمواليد."],
        ["🌾 👷", "العلف والعمال", "كلفة العلف وحضور العمال."]],
      tip: "لا تكتب اسمك: التطبيق يعرف من سجّل ومتى." },
    en: { title: "Logging", intro: "The buttons you see depend on the animals you keep.",
      steps: [["🥛", "Milk", "Morning and evening for each milking animal."],
        ["🥚", "Eggs", "Collected and broken; the lay rate is worked out for you."],
        ["💉", "Medicine", "Vaccine, treatment, vitamin or deworming, with the cost."],
        ["⚖️ 💀 🐣", "Weight, losses, births", "To follow growth, mortality and newborns."],
        ["🌾 👷", "Feed and workers", "Feed costs and attendance."]],
      tip: "You never type your name — the app records who logged what and when." } },
  sales: { ar: { title: "المبيعات", intro: "حسابات الزبائن: فواتير ودفعات ومستحقات.",
      steps: [["🤝", "أضف الزبون", "الاسم، المنتج المعتاد، سعره الخاص، وكميته اليومية."],
        ["🚚", "توزيع اليوم", "فواتير كل الزبائن الدائمين بضغطة واحدة."],
        ["🧾", "بيع جديد", "حليب أو بيض أو حيوان، والمبلغ بالدولار والليرة."],
        ["💵", "الدفعات", "تُوزَّع على أقدم الفواتير تلقائيًا."],
        ["🖨️", "المستندات", "فاتورة، إيصال، أو كشف حساب."]],
      tip: "الأحمر يعني تأخّرًا يتجاوز ٣٠ يومًا، ويظهر تنبيه في الشاشة الرئيسية." },
    en: { title: "Sales", intro: "Customer accounts: invoices, payments and balances.",
      steps: [["🤝", "Add the customer", "Name, usual product, their price and daily quantity."],
        ["🚚", "Today's round", "Invoice every regular in one tap."],
        ["🧾", "New sale", "Milk, eggs or livestock, in dollars and lira."],
        ["💵", "Payments", "Applied to the oldest invoices automatically."],
        ["🖨️", "Documents", "Invoice, receipt or statement."]],
      tip: "Red means more than 30 days overdue, and raises an alert on the home screen." } },
  reports: { ar: { title: "التقارير", intro: "تُحتسب تلقائيًا من التسجيلات دون أي حساب يدوي.",
      steps: [["📋", "الملخص الذكي", "نتائج مكتوبة: المقارنة بالفترة السابقة والملاحظات المهمة."],
        ["📊", "الرسوم", "الإنتاج اليومي، توزيع المصاريف، والإنتاج لكل حيوان."],
        ["💵", "الأرباح", "المدخول ناقص المصاريف بالعملتين."],
        ["🧾", "السجل", "من سجّل كل بيان ومتى."],
        ["📄", "التصدير", "PDF أو Excel أو CSV."]],
      tip: "بدّل الفترة من الأعلى: اليوم، أسبوع، شهر، أو تاريخ محدد." },
    en: { title: "Reports", intro: "Built automatically from the entries, with no manual maths.",
      steps: [["📋", "Smart summary", "Written findings: comparison with the previous period and what matters."],
        ["📊", "Charts", "Daily production, cost breakdown and output per animal."],
        ["💵", "Profit & Loss", "Income minus costs in both currencies."],
        ["🧾", "Log", "Who logged what and when."],
        ["📄", "Export", "PDF, Excel or CSV."]],
      tip: "Switch the period at the top: today, week, month or a custom range." } },
  settings: { ar: { title: "الإعدادات", intro: "الأسعار والمستخدمون والنسخ الاحتياطي.",
      steps: [["💱", "الأسعار", "سعر الصرف وسعر الحليب والبيضة وأجرة المياومة."],
        ["🔒", "رمز الدخول", "اختياري: عيّنه أو أزله متى شئت."],
        ["☁️", "المزامنة السحابية", "اربط التطبيق بخادم ليصل إليه الجميع من أي مكان."],
        ["💾", "النسخ الاحتياطي", "JSON للاسترجاع، أو Excel أو CSV أو PDF للقراءة."]],
      tip: "أي تغيير في الأسعار يُحفظ باسم من قام به." },
    en: { title: "Settings", intro: "Prices, people and backups.",
      steps: [["💱", "Prices", "Exchange rate, milk and egg price, daily wage."],
        ["🔒", "Passcode", "Optional: set it or remove it whenever you like."],
        ["☁️", "Cloud sync", "Point the app at a server so everyone reaches it from anywhere."],
        ["💾", "Backup", "JSON to restore, or Excel, CSV or PDF to read."]],
      tip: "Any price change is saved under the name of whoever made it." } },
  walkthrough: { ar: { title: "جولة للزبون", intro: "هذه مزرعة نموذجية على جهازك فقط. استخدمها لشرح الشاشات ثم اخرج من الإعدادات.",
      steps: [["💵", "صندوق النقد", "القبض من الزبائن والصرف للموردين يظهران برصيد جارٍ."],
        ["🐾", "الحيوانات", "أبقار وماعز وأغنام وقطيع دواجن — اضغط بطاقة لفتح الملف."],
        ["🥛", "التسجيل", "حليب الصباح والمساء، البيض، الدواء والحضور."],
        ["🤝", "المبيعات", "زبون مدفوع، جزئي، غير مدفوع، ومتأخر — الأحمر يعني أكثر من ٣٠ يومًا."],
        ["🚚", "الموردون", "فاتورة مسدّدة، مستحقة، ومتأخرة. الدفع يظهر في الصندوق."],
        ["📊", "التقارير", "الملخص والرسوم والأرباح تُبنى من التسجيلات دون حساب يدوي."]],
      tip: "كل شيء هنا محلي. لن يصل إلى فريق الشركة حتى تخرج من الجولة." },
    en: { title: "Client walkthrough", intro: "This is a sample farm on your device only. Use it to show each screen, then exit from Settings.",
      steps: [["💵", "Cash box", "Money in from customers and out to suppliers, with a running balance."],
        ["🐾", "Animals", "Cattle, goats, sheep and a poultry flock — tap a card to open the file."],
        ["🥛", "Logging", "Morning and evening milk, eggs, medicine and attendance."],
        ["🤝", "Sales", "Paid, partial, unpaid and overdue customers — red means more than 30 days."],
        ["🚚", "Suppliers", "A settled bill, an open bill and an overdue one. Payments hit the cash box."],
        ["📊", "Reports", "Summary, charts and profit build themselves from the logs."]],
      tip: "Everything here stays local. It will not reach the company team until you exit the walkthrough." } },
};
const TERMS = [
  ["رقم الأذن", "Ear tag", "الرقم المثبَّت على أذن الحيوان.", "The number fixed to the animal's ear."],
  ["عشار", "Pregnant", "أنثى حامل ستلد قريبًا.", "A female carrying young."],
  ["جافة", "Dry", "أنثى أُوقف حلبها قبل الولادة.", "Rested from milking before birth."],
  ["نسبة الإنتاج", "Lay rate", "عدد البيض مقسومًا على عدد الطيور. الجيد ٦٠–٨٠٪.", "Eggs divided by bird count. Healthy is 60–80%."],
  ["النفوق", "Mortality", "عدد الحيوانات التي نفقت.", "Animals lost or died."],
  ["عمال مياومة", "Daily workers", "عمال يُحاسَبون عن كل يوم عمل.", "Workers paid per day worked."],
  ["صافي الأرباح", "Net profit", "المدخول بعد خصم كل المصاريف.", "Income after all costs."],
  ["سعر الصرف", "Exchange rate", "قيمة الدولار بالليرة اليوم.", "Today's dollar value in lira."],
];
function HelpSheet({ topic, lang, t, onClose }) {
  if (topic === "terms") return <Sheet title={`📚 ${t("terms")}`} onClose={onClose}>
    <div style={{ display: "grid", gap: 9 }}>
      {TERMS.map(([ar, en, dAr, dEn]) => <div key={en} style={{ background: C.card, borderRadius: 6, padding: 13, boxShadow: sh1 }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>{lang === "ar" ? ar : en}
          <span style={{ color: C.inkSoft, fontWeight: 600, fontSize: 13.5 }}> · {lang === "ar" ? en : ar}</span></div>
        <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 500, marginTop: 3 }}>{lang === "ar" ? dAr : dEn}</div>
      </div>)}
    </div></Sheet>;
  const h = (HELP[topic] || HELP.start)[lang];
  return <Sheet title={`؟ ${h.title}`} onClose={onClose}>
    <div style={{ background: C.field, color: "#fff", borderRadius: 6, padding: 14, fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{h.intro}</div>
    <div style={{ display: "grid", gap: 9 }}>
      {h.steps.map(([ic, title, desc]) => <div key={title} style={{ display: "flex", gap: 11, background: C.card,
        borderRadius: 6, padding: 13, boxShadow: sh1 }}>
        <span style={{ fontSize: 21, lineHeight: 1.1 }}>{ic}</span>
        <span><span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>{title}</span>
          <span style={{ display: "block", fontSize: 14, color: C.inkSoft, fontWeight: 500, marginTop: 2 }}>{desc}</span></span>
      </div>)}
    </div>
    <div style={{ marginTop: 14, background: "#F6EFDD", borderRadius: 6, padding: 13, fontWeight: 600, fontSize: 14 }}>💡 {t("tip")}: {h.tip}</div>
  </Sheet>;
}

function LogRow({ e, lang, t, animals, workers, customers, rate = 0, custom, onReceipt }) {
  const a = animals.find((x) => x.id === e.animalId);
  const w = (workers || []).find((x) => x.id === e.workerId);
  const c = (customers || []).find((x) => x.id === e.customerId);
  const m = MED[e.medType];
  const pr = PRODUCTS.find((p) => p[0] === e.product);
  const map = {
    milk: ["🥛", `${backdated(e) ? "📅 " : ""}${e.session === "am" ? t("morning") : e.session === "pm" ? t("evening") : t("dayMilkTotal")} · ${a ? animalLabel(a) : t("herdTotal")}`, `${n1(e.liters)} ${t("L")}`],
    eggs: ["🥚", `${backdated(e) ? "📅 " : ""}${t("collect")} · ${a ? animalLabel(a) : "—"}`, `${nf(e.count)} ${t("eggsUnit")}`],
    med: [m ? m.i : "💉", `${m ? (lang === "ar" ? m.ar : m.en) : ""}${e.name ? ` (${e.name})` : ""} · ${a ? animalLabel(a) : "—"}`, fmtC(e.cost, rate, lang)],
    attend: [e.present ? "✅" : "❌", w ? w.name : "—", e.present ? t("present") : t("absent")],
    expense: [catIcon(e.category, custom), `${catLabel(e.category, lang, custom)}${isCustomerPaidExpense(e) ? ` · ${t("paidByCustomer")}` : ""}${e.feedType ? ` · ${t(e.feedType)}` : ""}${e.qty ? ` · ${expenseQtyLabel(e, t)}` : ""}${e.note ? ` · ${e.note}` : ""}${e.species ? ` · ${spName(e.species, lang)}` : ""}`, fmtC(e.amount, rate, lang)],
    sale: ["🧾", `${pr ? (lang === "ar" ? pr[2] : pr[3]) : t("newSale")} · ${c ? customerLabel(c, t) : "—"}`, fmtC(e.amount, rate, lang)],
    saleReimburse: ["↩️", `${t("reimbursement")} · ${e.name || "—"} · ${c ? customerLabel(c, t) : "—"}`, `−${fmtC(e.amount, rate, lang)}`],
    payment: ["💵", `${t("recordPayment")} · ${c ? customerLabel(c, t) : "—"}${e.currency === "lbp" ? ` · ${t("lbp")}` : ""}`, fmtC(e.amount, rate, lang)],
    purchase: ["🚚", `${t("purchases")} · ${a ? animalLabel(a) : "—"}`, fmtC(e.cost, rate, lang)],
    loss: ["💀", `${t("losses")} · ${a ? animalLabel(a) : "—"}`, `${nf(e.count)}`],
    birth: ["🐣", `${t("births")} · ${a ? animalLabel(a) : "—"}${e.males !== undefined ? ` · ♂${e.males} ♀${e.females}` : ""}${e.dead ? ` · 💀${e.dead}` : ""}`, `${nf(e.count)}`],
    milkBulk: ["🥛", `${t("dayMilkTotal")}${e.session === "am" ? ` · ${t("morning")}` : e.session === "pm" ? ` · ${t("evening")}` : (e.amLiters != null || e.pmLiters != null) ? ` · ${t("morning")} ${n1(milkFromLiters(e.amLiters || 0, "kg"))} · ${t("evening")} ${n1(milkFromLiters(e.pmLiters || 0, "kg"))}` : ""}${e.species ? ` · ${spName(e.species, lang)}` : ""}`, milkKgLine(e, t)],
    milkUse: ["🥛", `${t("milkUse")} · ${milkUseLabel(e, t)}`, milkKgLine(e, t)],
    weight: ["⚖️", `${t("weighIn")} · ${a ? animalLabel(a) : "—"}`, `${nf(e.kg)} ${t("kg")}`],
    status: ["🔄", `${a ? animalLabel(a) : "—"} · ${statusLabel(e.status, lang)}`, ""],
    service: ["🍼", `${t("recordService")} · ${a ? animalLabel(a) : "—"}`, e.served || ""],
    pregCheck: [e.result === "pregnant" ? "✅" : "❌", `${t("step2")} · ${a ? animalLabel(a) : "—"}`,
      e.result === "pregnant" ? statusLabel("pregnant", lang) : t("notPreg")],
    dryOff: ["🥛", `${t("step3")} · ${a ? animalLabel(a) : "—"}`, statusLabel("dry", lang)],
    due: ["🍼", `${t("dueDate")} · ${a ? animalLabel(a) : "—"}`, e.due || ""],
    animalAdd: ["➕", `${t("addAnimal")} · ${e.name || ""}`, ""],
    animalEdit: ["✏️", `${t("editAnimal")} · ${e.name || ""}`, ""],
    workerAdd: ["👷", `${t("addWorker")} · ${e.name}`, ""],
    customerAdd: ["🤝", `${t("addCustomer")} · ${e.name}`, ""],
    profile: ["👤", `${t("createProfile")} · ${e.name}`, ""],
    profileSecurity: ["🔑", `${t("security")} · ${e.name}`, ""],
    setting: ["⚙️", `${t("settings")} · ${t(e.field) || e.field}`, nf(e.value)],
  };
  const [ic, label, val] = map[e.type] || ["•", e.type, ""];
  return <div style={{ display: "flex", alignItems: "center", gap: 11, background: C.card, borderRadius: 5, padding: "10px 12px", boxShadow: sh1 }}>
    <span style={{ fontSize: 19 }}>{ic}</span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </span>
    <WhoHint e={e} lang={lang} />
    {e.receipt && <button onClick={() => onReceipt && onReceipt(e)} title={t("viewReceipt")}
      style={{ background: onReceipt ? C.paper : "transparent", border: `1px solid ${C.line}`, borderRadius: 3,
        padding: "4px 7px", cursor: onReceipt ? "pointer" : "default", fontSize: 14, flexShrink: 0 }}>📎</button>}
    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15.5, color: C.field }}>{val}</span>
  </div>;
}

/* ---------------------------- profile gate ---------------------------- */
const roleLabel = (k, lang) => { const r = ROLES.find((x) => x[0] === k); return r ? (lang === "ar" ? r[1] : r[2]) : "—"; };
const needsFarmSetup = (settings) => !settings || settings.setupV !== SETUP_VERSION || !(settings.farmName || "").trim();

function GateShell({ lang, setLang, t, brand, logo, children, wide }) {
  return (
    <div dir={T[lang].dir} className={`gate${wide ? " gate-desk" : ""}`}>
      <style>{makeCss()}</style>
      <div className="gate-shell">
        <aside className="gate-hero">
          <div className="gate-hero-bg" aria-hidden="true">
            <span className="gate-orb gate-orb-a" /><span className="gate-orb gate-orb-b" />
          </div>
          <div className="gate-hero-inner">
            <button type="button" className="gate-lang" onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label={lang === "ar" ? "English" : "العربية"}>{lang === "ar" ? "EN" : "ع"}</button>
            <div className="gate-logo-wrap">
              {logo
                ? <img src={logo} alt="" className="gate-logo-img" />
                : <AppMark size={72} light word lang={lang} />}
            </div>
            {logo ? <div className="gate-appmark"><AppMark size={22} light word={false} lang={lang} /></div> : null}
            <h1 className="gate-title">{brand}</h1>
            <p className="gate-tagline">{t("welcomeSub")}</p>
            <div className="gate-species" aria-hidden="true">
              {SP_KEYS.map((k) => <span key={k} title={spName(k, lang)}>{SPECIES[k].icon}</span>)}
            </div>
          </div>
        </aside>
        <div className="gate-panel">
          <div className="gate-card">{children}</div>
          <footer className="gate-foot">
            <span>👥 {T[lang].sharedNote}</span>
            <span className="gate-ver">v{VERSION.code}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function GateSteps({ step, total, t }) {
  return <div className="gate-steps">
    <span>{t("stepOf")} {step} {t("of")} {total}</span>
    <div className="gate-steps-bar">{Array.from({ length: total }, (_, i) =>
      <span key={i} className={i < step ? "on" : ""} />)}</div>
  </div>;
}

function cloudErrText(t, e) {
  const code = String((e && (e.code || e.message)) || "");
  if (/email-already-in-use/i.test(code)) return t("coEmailTaken");
  if (/invalid-email/i.test(code)) return t("coEmailBad");
  if (/weak-password/i.test(code)) return t("coPassShort");
  if (/user-not-found|wrong-password|invalid-credential|invalid-login/i.test(code)) return t("coSignInBad");
  if (/network/i.test(code)) return t("cloudFail");
  return t("coErr");
}

function CloudGate({ lang, setLang, t, data, farmName, logo, onFarm, onEnter, onSkip, onWalkthrough }) {
  const [mode, setMode] = useState("welcome");
  const [name, setName] = useState("");
  const [farm, setFarm] = useState(farmName || "");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [askWalk, setAskWalk] = useState(false);
  const ready = isFirebaseReady();
  const brand = (farm || farmName || "").trim() || T[lang].brand;
  const shell = (body) => <GateShell lang={lang} setLang={setLang} t={t} brand={brand} logo={logo} wide>{body}</GateShell>;
  const makeOwner = (n) => ({
    id: uid(), name: n, role: "owner", emoji: AVATARS[0], pin: null, salt: null,
    color: AVATAR_COLORS[0], at: iso(Date.now()),
  });

  const submitStart = async () => {
    const n = name.trim(), f = farm.trim(), em = email.trim().toLowerCase();
    if (!n) return setErr(t("nameNeeded"));
    if (!f) return setErr(t("companyNeeded"));
    if (ready && (!em.includes("@") || em.length < 5)) return setErr(t("coEmailBad"));
    if (ready && pass.length < 6) return setErr(t("coPassShort"));
    const owner = makeOwner(n);
    const base = data || emptyFarm();
    const others = (base.profiles || []).filter((p) => p.name.trim().toLowerCase() !== n.toLowerCase());
    const farmObj = {
      ...base,
      settings: { ...(base.settings || {}), farmName: f, setupV: SETUP_VERSION },
      profiles: [owner, ...others],
    };
    setBusy(true); setErr("");
    try {
      if (ready) {
        await companySignUp(em, pass, n);
        await createCompany(f, JSON.stringify(farmObj), onFarm);
      }
      await store.set(SHARED_KEY, JSON.stringify(farmObj), true);
      onEnter(owner, farmObj);
    } catch (e) {
      setErr(cloudErrText(t, e));
    } finally { setBusy(false); }
  };

  const submitSignIn = async () => {
    const em = email.trim().toLowerCase();
    if (!ready) return setErr(t("cloudUnavailable"));
    if (!em.includes("@") || em.length < 5) return setErr(t("coEmailBad"));
    if (!pass) return setErr(t("coPassShort"));
    setBusy(true); setErr("");
    try {
      const cred = await companySignIn(em, pass);
      const s = await companyWaitBound(10000, cred && cred.uid);
      if (!s.companyId) { setErr(t("coNoFarmOnAccount")); setBusy(false); return; }
      try {
        const raw = await companyPullFarm();
        let farmObj = migrate(JSON.parse(raw));
        const rows = farmObj.profiles || [];
        let pick = null;
        if (rows.length === 0) {
          const n = (s.user && s.user.name) || em.split("@")[0] || "Owner";
          pick = makeOwner(n);
          farmObj = { ...farmObj, profiles: [pick] };
          await store.set(SHARED_KEY, JSON.stringify(farmObj), true);
        } else {
          if (rows.length === 1 && !rows[0].pin) pick = rows[0];
          try { store.mem[SHARED_KEY] = raw; if (store.kind === "device") window.localStorage.setItem(SHARED_KEY, raw); } catch (e2) { /* */ }
        }
        onEnter(pick, farmObj);
      } catch (e2) {
        onEnter(null, null);
      }
    } catch (e) {
      setErr(cloudErrText(t, e));
    } finally { setBusy(false); }
  };

  if (askWalk && onWalkthrough) return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("walkthrough")}</h2>
      <p className="gate-lead">{t("walkthroughWarn")}</p>
      <button type="button" style={{ ...primaryBtn, marginBottom: 10, opacity: busy ? .6 : 1 }} disabled={busy}
        onClick={async () => { setBusy(true); await onWalkthrough(); setBusy(false); }}>✓ {t("walkthroughLoad")}</button>
      <button type="button" style={secondaryBtn} onClick={() => setAskWalk(false)}>{t("cancel")}</button>
    </div>);

  if (mode === "start") return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("getStarted")}</h2>
      <p className="gate-lead">{t("cloudStartLead")}</p>
      {!ready && <p className="gate-lead" style={{ color: C.inkSoft }}>{t("cloudUnavailable")}</p>}
      <div className="gate-form-grid">
        <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("employeeName")}</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
            autoComplete="name" autoFocus style={inp} />
        </label>
        <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("companyName")}</span>
          <input value={farm} onChange={(e) => { setFarm(e.target.value); setErr(""); }}
            placeholder={lang === "ar" ? "مثال: مزرعة الريف" : "e.g. Al Reif Farm"} style={{ ...inp, fontWeight: 700 }} />
        </label>
        {ready && <>
          <label className="gate-field gate-span-2">
            <span className="gate-field-label">{t("coCompanyEmail")}</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
              autoComplete="email" style={{ ...inp, direction: "ltr" }} />
          </label>
          <label className="gate-field gate-span-2">
            <span className="gate-field-label">{t("coPassword")}</span>
            <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }}
              autoComplete="new-password" style={{ ...inp, direction: "ltr" }} />
          </label>
        </>}
      </div>
      {err && <p className="gate-err">⚠️ {err}</p>}
      <button type="button" style={{ ...primaryBtn, marginTop: 16, opacity: busy ? .6 : 1 }} disabled={busy}
        onClick={submitStart}>{busy ? t("coBusy") : t("getStarted")}</button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => { setMode("welcome"); setErr(""); }}>{t("prev")}</button>
    </div>);

  if (mode === "signin") return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("signIn")}</h2>
      <p className="gate-lead">{t("cloudSignInLead")}</p>
      {!ready && <p className="gate-lead" style={{ color: C.inkSoft }}>{t("cloudUnavailable")}</p>}
      <div className="gate-form-grid">
        <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("coCompanyEmail")}</span>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
            autoComplete="email" autoFocus style={{ ...inp, direction: "ltr" }} />
        </label>
        <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("coPassword")}</span>
          <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }}
            autoComplete="current-password" style={{ ...inp, direction: "ltr" }} />
        </label>
      </div>
      {err && <p className="gate-err">⚠️ {err}</p>}
      <button type="button" style={{ ...primaryBtn, marginTop: 16, opacity: busy ? .6 : 1 }} disabled={busy || !ready}
        onClick={submitSignIn}>{busy ? t("coBusy") : t("signIn")}</button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => { setMode("welcome"); setErr(""); }}>{t("prev")}</button>
    </div>);

  return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("welcomeTitle")}</h2>
      <p className="gate-lead">{t("welcomeCloudLead")}</p>
      {!ready && <p className="gate-lead" style={{ color: C.inkSoft }}>{t("cloudUnavailable")}</p>}
      <div className="gate-actions">
        <button type="button" style={primaryBtn} onClick={() => { setErr(""); setMode("start"); }}>{t("getStarted")}</button>
        <button type="button" style={secondaryBtn} onClick={() => { setErr(""); setMode("signin"); }}>{t("haveAccount")}</button>
      </div>
      {onSkip && <button type="button" style={{ background: "none", border: "none", color: C.field, fontWeight: 700,
        cursor: "pointer", fontFamily: "var(--body)", fontSize: 13.5, marginTop: 14, padding: 4 }}
        onClick={onSkip}>{t("useDeviceOnly")}</button>}
      {onWalkthrough && <button type="button" style={{ ...secondaryBtn, marginTop: 10 }}
        onClick={() => setAskWalk(true)}>{t("walkthroughBtn")}</button>}
    </div>);
}

function FarmSetupGate({ lang, setLang, t, settings, onSave, onWalkthrough }) {
  const S = settings || {};
  const [farmName, setFarmName] = useState(S.farmName || "");
  const [logo, setLogo] = useState(S.logo || "");
  const [phone, setPhone] = useState(S.farmPhone || "");
  const [address, setAddress] = useState(S.farmAddress || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [askWalk, setAskWalk] = useState(false);
  const fileRef = useRef(null);
  const brand = farmName.trim() || T[lang].brand;

  if (askWalk && onWalkthrough) {
    return <GateShell lang={lang} setLang={setLang} t={t} brand={brand} logo={logo} wide>
      <h2 className="gate-h2">🧭 {t("walkthrough")}</h2>
      <p className="gate-lead">{t("walkthroughWarn")}</p>
      <div style={{ background: "#F6EFDD", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A5312", marginBottom: 12, fontSize: 13.5 }}>
        {t("walkthroughSyncWarn")}
      </div>
      <button type="button" style={{ ...primaryBtn, marginBottom: 10, opacity: busy ? .6 : 1 }} disabled={busy}
        onClick={async () => { setBusy(true); await onWalkthrough(); setBusy(false); }}>✓ {t("walkthroughLoad")}</button>
      <button type="button" style={secondaryBtn} onClick={() => setAskWalk(false)}>{t("cancel")}</button>
    </GateShell>;
  }

  return <GateShell lang={lang} setLang={setLang} t={t} brand={brand} logo={logo} wide>
    <h2 className="gate-h2">{t("completeFarmSetup")}</h2>
    <p className="gate-lead">{t("completeFarmSetupLead")}</p>
    <div className="gate-form-grid">
      <label className="gate-field gate-span-2">
        <span className="gate-field-label">{t("companyName")}</span>
        <input value={farmName} onChange={(e) => { setFarmName(e.target.value); setErr(""); }}
          placeholder={lang === "ar" ? "مثال: مزرعة الريف" : "e.g. Al Reif Farm"} autoFocus style={inp} />
      </label>
      <div className="gate-field gate-span-2">
        <span className="gate-field-label">{t("farmLogo")}</span>
        <div className="gate-logo-pick">
          <button type="button" className="gate-logo-btn" onClick={() => fileRef.current?.click()}>
            {logo ? <img src={logo} alt="" /> : <span>🏷️</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
            const f = e.target.files && e.target.files[0]; e.target.value = "";
            if (!f) return;
            try { setLogo(await compressImage(f, 320, 0.7)); } catch (err2) { /* ignore */ }
          }} />
          <div>
            <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13 }}
              onClick={() => fileRef.current?.click()}>{logo ? t("changeLogo") : t("attachLogo")}</button>
            {logo && <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13, marginInlineStart: 8, color: C.red }}
              onClick={() => setLogo("")}>{t("removeLogo")}</button>}
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>{t("logoHint")}</div>
          </div>
        </div>
      </div>
      <label className="gate-field">
        <span className="gate-field-label">{t("farmPhone")} — {t("optional")}</span>
        <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} style={inp} />
      </label>
      <label className="gate-field">
        <span className="gate-field-label">{t("farmAddress")} — {t("optional")}</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder={t("addressHint")} style={inp} />
      </label>
    </div>
    {err && <p className="gate-err">⚠️ {err}</p>}
    <button type="button" style={{ ...primaryBtn, marginTop: 18, opacity: busy ? .6 : 1 }} disabled={busy}
      onClick={async () => {
        const n = farmName.trim();
        if (!n) return setErr(t("companyNeeded"));
        setBusy(true);
        await onSave({ farmName: n, logo, farmPhone: phone.trim(), farmAddress: address.trim(), setupV: SETUP_VERSION });
        setBusy(false);
      }}>{busy ? "…" : `✓ ${t("finishSetup")}`}</button>
    {onWalkthrough && <button type="button" style={{ ...secondaryBtn, marginTop: 10 }}
      onClick={() => setAskWalk(true)}>🧭 {t("walkthroughBtn")}</button>}
  </GateShell>;
}

function ProfileGate({ lang, setLang, t, profiles, preId, clearPre, onPick, onCreate, onResetPass, farmName, logo, settings }) {
  const pre = profiles.find((p) => p.id === preId);
  const hasFarm = !!(farmName || "").trim();
  const firstFarm = profiles.length === 0 || !hasFarm;
  const [mode, setMode] = useState(pre ? "pin" : profiles.length ? "pick" : "welcome");
  const [target, setTarget] = useState(pre || null);
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState(""); const [stage, setStage] = useState("first");
  const [savedPin, setSavedPin] = useState(null); const [savedSalt, setSavedSalt] = useState(null);
  const [company, setCompany] = useState(farmName || "");
  const [name, setName] = useState(""); const [role, setRole] = useState("owner");
  const [emoji] = useState(AVATARS[0]);
  const [newLogo, setNewLogo] = useState(logo || "");
  const [phone, setPhone] = useState((settings && settings.farmPhone) || "");
  const [address, setAddress] = useState((settings && settings.farmAddress) || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [farmConfirm, setFarmConfirm] = useState("");
  const [resetStep, setResetStep] = useState(1);
  const logoRef = useRef(null);
  const brand = (company || farmName || "").trim() || T[lang].brand;
  const showLogo = newLogo || logo;
  const resetKey = (farmName || "").trim() || (target && target.name) || "";
  const resetUsesFarm = !!(farmName || "").trim();

  const verify = async () => {
    if (pin.length < 4) return setErr(t("passShort"));
    setBusy(true); const h = await hashPin(pin, target.salt || ""); setBusy(false);
    if (h === target.pin) onPick(target); else { setErr(t("wrongPass")); setPin(""); }
  };

  const startReset = () => {
    setMode("reset"); setResetStep(1); setFarmConfirm(""); setPin(""); setPin2("");
    setStage("first"); setErr("");
  };

  const confirmResetIdentity = () => {
    const got = farmConfirm.trim().toLowerCase();
    const expect = resetKey.trim().toLowerCase();
    if (!got || got !== expect) return setErr(t("resetNameWrong"));
    setErr(""); setResetStep(2); setPin(""); setPin2(""); setStage("first");
  };

  const finishResetPass = async () => {
    if (stage === "first") {
      if (pin.length < 4) return setErr(t("passShort"));
      setErr(""); setPin2(pin); setPin(""); setStage("confirm");
      return;
    }
    if (pin !== pin2) { setErr(t("passMismatch")); setPin(""); setPin2(""); setStage("first"); return; }
    setBusy(true);
    try {
      const salt = uid(); const h = await hashPin(pin, salt);
      await onResetPass(target, h, salt);
    } catch (e) {
      setErr(t("wrongPass"));
    } finally { setBusy(false); }
  };

  const finishCreate = async (pinHash, salt) => {
    setBusy(true);
    const farmPatch = firstFarm ? {
      farmName: company.trim(), logo: newLogo || "", farmPhone: phone.trim(),
      farmAddress: address.trim(), setupV: SETUP_VERSION,
    } : null;
    await onCreate(name.trim(), role, emoji, pinHash, salt, farmPatch);
    setBusy(false);
  };

  const advanceFromStep1 = async () => {
    const n = name.trim();
    if (firstFarm && !company.trim()) return setErr(t("companyNeeded"));
    if (!n) return setErr(t("nameNeeded"));
    if (profiles.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return setErr(t("nameTaken"));
    if (stage === "first") {
      if (pin.length > 0 && pin.length < 4) return setErr(t("passShort"));
      if (pin.length >= 4) { setErr(""); setPin2(pin); setPin(""); setStage("confirm"); return; }
      setErr(""); setSavedPin(null); setSavedSalt(null);
      if (firstFarm) { setStep(2); return; }
      await finishCreate(null, null);
      return;
    }
    if (pin !== pin2) { setErr(t("passMismatch")); setPin(""); setPin2(""); setStage("first"); return; }
    setBusy(true);
    const salt = uid(); const h = await hashPin(pin, salt);
    setBusy(false);
    setErr("");
    if (firstFarm) { setSavedPin(h); setSavedSalt(salt); setPin(""); setPin2(""); setStage("first"); setStep(2); return; }
    await finishCreate(h, salt);
  };

  const shell = (body) => <GateShell lang={lang} setLang={setLang} t={t} brand={brand} logo={showLogo} wide>{body}</GateShell>;

  if (mode === "welcome") return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("welcomeTitle")}</h2>
      <p className="gate-lead">{profiles.length === 0 ? t("firstOne") : t("whoSub")}</p>
      <div className="gate-actions">
        <button type="button" style={primaryBtn} onClick={() => { setErr(""); setMode(profiles.length ? "pick" : "create"); setStep(1); }}>
          {profiles.length ? t("signIn") : t("getStarted")}</button>
        {profiles.length > 0 && <button type="button" style={secondaryBtn} onClick={() => { setErr(""); setMode("create"); setStep(1); }}>
          ➕ {t("createProfile")}</button>}
      </div>
    </div>);

  if (mode === "reset" && target) return shell(
    <div className="gate-step">
      <div className="gate-user-chip">
        <span className="gate-avatar" style={{ background: target.color }}>{target.emoji}</span>
        <div><div className="gate-user-name">{target.name}</div>
          <div className="gate-user-role">{roleLabel(target.role, lang)}</div></div>
      </div>
      <h2 className="gate-h2" style={{ fontSize: 20 }}>🔑 {t("resetPass")}</h2>
      {resetStep === 1 ? <>
        <p className="gate-lead">{resetUsesFarm ? t("resetPassLead") : t("resetPassLeadName")}</p>
        <label className="gate-field">
          <span className="gate-field-label">{resetUsesFarm ? t("resetFarmName") : t("resetProfileName")}</span>
          <input value={farmConfirm} onChange={(e) => { setFarmConfirm(e.target.value); setErr(""); }}
            autoFocus autoComplete="off" style={{ ...inp, fontWeight: 700 }}
            onKeyDown={(e) => { if (e.key === "Enter") confirmResetIdentity(); }} />
        </label>
        {err && <p className="gate-err">⚠️ {err}</p>}
        <button type="button" style={{ ...primaryBtn, marginTop: 14 }} onClick={confirmResetIdentity}>{t("next")} ›</button>
      </> : <>
        <p className="gate-lead">{stage === "first" ? t("createPass") : t("confirmPass")}</p>
        <p className="gate-lead" style={{ marginBottom: 10 }}>{t("passHint")}</p>
        <Keypad value={pin} onChange={(v) => { setPin(v); setErr(""); }} onSubmit={finishResetPass} />
        {err && <p className="gate-err">⚠️ {err}</p>}
        <button type="button" style={{ ...primaryBtn, marginTop: 14, opacity: busy ? .6 : 1 }} onClick={finishResetPass}
          disabled={busy}>{busy ? "…" : (stage === "first" ? `${t("next")} ›` : `✓ ${t("save")}`)}</button>
      </>}
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => {
        setMode("pin"); setResetStep(1); setFarmConfirm(""); setPin(""); setPin2(""); setStage("first"); setErr("");
      }}>{t("cancel")}</button>
    </div>);

  if (mode === "pin" && target) return shell(
    <div className="gate-step">
      <div className="gate-user-chip">
        <span className="gate-avatar" style={{ background: target.color }}>{target.emoji}</span>
        <div><div className="gate-user-name">{target.name}</div>
          <div className="gate-user-role">{roleLabel(target.role, lang)}</div></div>
      </div>
      <p className="gate-label">🔒 {t("enterPass")}</p>
      <Keypad value={pin} onChange={(v) => { setPin(v); setErr(""); }} onSubmit={verify} />
      {err && <p className="gate-err">⚠️ {err}</p>}
      <button type="button" style={{ ...primaryBtn, marginTop: 14, opacity: busy ? .6 : 1 }} onClick={verify}>
        {busy ? "…" : t("enter")}</button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => {
        clearPre(); setMode(profiles.length ? "pick" : "welcome"); setPin(""); setErr(""); }}>{t("notYou")}</button>
      <button type="button" style={{ background: "none", border: "none", color: C.field, fontWeight: 700, cursor: "pointer",
        fontFamily: "var(--body)", fontSize: 13.5, marginTop: 12, padding: 4 }} onClick={startReset}>
        {t("forgotPass")}</button>
    </div>);

  if (mode === "pick") return shell(
    <div className="gate-step">
      <h2 className="gate-h2">{t("who")}</h2>
      <p className="gate-lead">{t("whoSub")}</p>
      <div className="gate-profile-grid">
        {profiles.map((p) => (
          <button type="button" key={p.id} className="gate-profile-card" style={{ borderColor: p.color }}
            onClick={() => { if (!p.pin) return onPick(p); setTarget(p); setPin(""); setErr(""); setMode("pin"); }}>
            <span className="gate-avatar lg" style={{ background: p.color }}>{p.emoji}</span>
            <span className="gate-profile-name">{p.name}</span>
            <span className="gate-profile-role">{roleLabel(p.role, lang)}</span>
            {p.pin && <span className="gate-lock">🔒</span>}
          </button>))}
      </div>
      <button type="button" className="gate-add-profile" onClick={() => { setErr(""); setMode("create"); setStep(1); }}>
        ➕ {t("createProfile")}</button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => setMode("welcome")}>{t("prev")}</button>
    </div>);

  if (mode === "create" && firstFarm && step === 2) return shell(
    <div className="gate-step">
      <GateSteps step={2} total={2} t={t} />
      <h2 className="gate-h2">{t("setupContactTitle")}</h2>
      <p className="gate-lead">{t("setupContactLead")}</p>
      <div className="gate-form-grid">
        <div className="gate-field gate-span-2">
          <span className="gate-field-label">{t("farmLogo")} — {t("optional")}</span>
          <div className="gate-logo-pick">
            <button type="button" className="gate-logo-btn" onClick={() => logoRef.current?.click()}>
              {newLogo ? <img src={newLogo} alt="" /> : <span>🏷️</span>}
            </button>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
              const f = e.target.files && e.target.files[0]; e.target.value = "";
              if (!f) return;
              try { setNewLogo(await compressImage(f, 320, 0.7)); } catch (err2) { /* ignore */ }
            }} />
            <div>
              <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13 }}
                onClick={() => logoRef.current?.click()}>{newLogo ? t("changeLogo") : t("attachLogo")}</button>
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>{t("logoHint")}</div>
              {newLogo && <button type="button" style={{ background: "none", border: "none", color: C.red, fontWeight: 700, cursor: "pointer", padding: 0, marginTop: 6 }}
                onClick={() => setNewLogo("")}>{t("removeLogo")}</button>}
            </div>
          </div>
        </div>
        <label className="gate-field">
          <span className="gate-field-label">{t("farmPhone")} — {t("optional")}</span>
          <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} style={inp} />
        </label>
        <label className="gate-field">
          <span className="gate-field-label">{t("farmAddress")} — {t("optional")}</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("addressHint")} style={inp} />
        </label>
      </div>
      <button type="button" style={{ ...primaryBtn, marginTop: 18, opacity: busy ? .6 : 1 }}
        onClick={() => finishCreate(savedPin, savedSalt)}>{busy ? "…" : t("startNow")}</button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} onClick={() => {
        setStep(1); setErr(""); }}>{t("prev")}</button>
    </div>);

  return shell(
    <div className="gate-step">
      {firstFarm && <GateSteps step={1} total={2} t={t} />}
      <h2 className="gate-h2">{firstFarm ? t("setupFarmTitle") : t("createProfile")}</h2>
      <p className="gate-lead">{firstFarm ? t("setupFarmLead") : t("setupUserLead")}</p>
      <div className="gate-form-grid">
        {firstFarm && <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("companyName")}</span>
          <input value={company} onChange={(e) => { setCompany(e.target.value); setErr(""); }}
            placeholder={lang === "ar" ? "مثال: مزرعة الريف" : "e.g. Al Reif Farm"} autoFocus style={{ ...inp, fontWeight: 700 }} />
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 5 }}>{t("companyNameHint")}</div>
        </label>}
        <label className="gate-field gate-span-2">
          <span className="gate-field-label">{t("employeeName")}</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
            placeholder={lang === "ar" ? "مثال: أحمد" : "e.g. Ahmad"} autoFocus={!firstFarm} autoComplete="name" style={inp} />
        </label>
        <div className="gate-field gate-span-2">
          <span className="gate-field-label">{t("chooseRole")}</span>
          <div className="gate-role-row">
            {ROLES.map(([k, ar, en]) => (
              <button type="button" key={k} className={`gate-role${role === k ? " on" : ""}`} onClick={() => setRole(k)}>
                {lang === "ar" ? ar : en}</button>))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <h3 className="gate-h2" style={{ fontSize: 17 }}>🔒 {stage === "first" ? t("createPass") : t("confirmPass")}</h3>
        <p className="gate-lead" style={{ marginBottom: 10 }}>{stage === "first" ? t("passOptional") : t("passHint")}</p>
        <Keypad value={pin} onChange={(v) => { setPin(v); setErr(""); }} />
      </div>
      {err && <p className="gate-err">⚠️ {err}</p>}
      <button type="button" style={{ ...primaryBtn, marginTop: 16, opacity: busy ? .6 : 1 }} onClick={advanceFromStep1}>
        {busy ? "…" : stage === "confirm" ? (firstFarm ? `${t("continueBtn")} ›` : t("startNow")) : (pin.length >= 4 ? `${t("next")} ›` : (firstFarm ? `${t("continueBtn")} ›` : `${t("skip")} — ${t("noPass")}`))}
      </button>
      <button type="button" style={{ ...secondaryBtn, marginTop: 10 }}
        onClick={() => { setMode(profiles.length ? "pick" : "welcome"); setPin(""); setPin2(""); setStage("first"); setErr(""); }}>
        {t("cancel")}</button>
    </div>);
}

/* ---------------------------- report bodies ---------------------------- */
function ReportBody({ kind, lang, t, sums, prevSums, S, days, scoped, animals, workers, customers, summaryLines, series, outstanding, scopedSales, ledger, onReceipt }) {
  const [logType, setLogType] = useState("all");
  const milkers = animals.filter((a) => producesMilk(a));
  const flocks = animals.filter(producesEggs);

  if (kind === "summary") return <Card>
    <Title>📋 {t("summary")}</Title>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
      <Kpi label={t("totalLiters")} value={`${nf(sums.milk)} ${t("L")}`} tone={C.field} />
      <Kpi label={t("totalEggs")} value={nf(sums.eggs)} tone="#B8791F" />
      <Kpi label={t("income")} value={fmt(sums.income, S.rate, lang)} tone={C.green} />
      <Kpi label={t("profit")} value={fmt(sums.profit, S.rate, lang)} tone={sums.profit >= 0 ? C.green : C.red} />
    </div>
    <div style={{ display: "grid", gap: 9 }}>
      {summaryLines.map((l, i) => <div key={i} style={{ display: "flex", gap: 11, background: C.bg, borderRadius: 5,
        padding: "11px 13px", borderInlineStart: `5px solid ${l.tone || C.field}` }}>
        <span style={{ fontSize: 18, lineHeight: 1.2 }}>{l.icon}</span>
        <span style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.55 }}>{l.text}</span></div>)}
    </div>
  </Card>;

  if (kind === "charts") {
    const costParts = Object.entries(sums.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: catLabel(k, lang, S.categories), value: v, color: catColor(k, S.categories) }));
    const rows = animals.map((a) => ({ label: animalLabel(a).slice(0, 8),
      value: Math.round((producesEggs(a) ? sums.byEggs[a.id] : sums.byMilk[a.id]) || 0),
      target: (a.expected || 0) * days, color: spOf(a).color }))
      .filter((r) => r.value > 0 || r.target > 0).sort((a, b) => b.value - a.value).slice(0, 12);
    return <div style={{ display: "grid", gap: 12 }}>
      <Card><Title>📈 {t("dailyProd")}</Title>
        {series.length ? <BarsSVG data={series} /> : <div style={{ color: C.inkSoft, fontWeight: 500 }}>{t("noData")}</div>}</Card>
      <Card><Title>💸 {t("costBreak")}</Title>
        {sums.costs > 0 ? <><StackedSVG parts={costParts} total={sums.costs} /><Legend items={costParts} rate={S.rate} lang={lang} /></>
          : <div style={{ color: C.inkSoft, fontWeight: 500 }}>{t("noData")}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
          <Kpi label={t("income")} value={fmt(sums.income, S.rate, lang)} tone={C.green} />
          <Kpi label={t("costsL")} value={fmt(sums.costs, S.rate, lang)} tone={C.red} /></div></Card>
      <Card><Title>🐾 {t("perHead")}</Title>
        {rows.length ? <><HBarsSVG rows={rows} />
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 6 }}>┊ {t("expectedShort")}</div></>
          : <div style={{ color: C.inkSoft, fontWeight: 500 }}>{t("noData")}</div>}</Card>
      <Card><Title>💳 {t("paidVsDue")}</Title>
        <HBarsSVG rows={[{ label: t("collected"), value: Math.round(sums.collected), color: C.green },
          { label: t("outstanding"), value: Math.round(outstanding), color: C.red }]}
          formatValue={(v) => fmtC(v, S.rate, lang)} /></Card>
    </div>;
  }

  if (kind === "pl") {
    const max = Math.max(sums.income, sums.costs, 1);
    const bar = (label, value, color, key) => <div key={key || label} style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        <span>{label}</span><span style={{ fontFamily: "var(--mono)" }}>{fmtC(value, S.rate, lang)}</span></div>
      <div style={{ height: 10, background: C.line, borderRadius: 6 }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: color, borderRadius: 6 }} /></div></div>;
    return <Card><Title>💵 {t("pl")}</Title>
      <div style={{ background: C.bg, borderRadius: 6, padding: 13, marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.green, marginBottom: 7 }}>▲ {t("income")}</div>
        {sums.grossInvoiced > 0 && bar(t("accountTotal"), sums.grossInvoiced, C.field, "gross")}
        {(sums.deductions || 0) > 0 && bar(t("deductions"), sums.deductions, C.green, "deduct")}
        {PRODUCTS.filter(([k]) => sums.byProduct[k] > 0).map(([k, ic, ar, en]) => bar(`${ic} ${lang === "ar" ? ar : en}`, sums.byProduct[k], C.green, k))}
        {sums.invoiced === 0 && <div style={{ fontSize: 13.5, color: C.inkSoft, fontWeight: 500 }}>{t("noSales")}</div>}
      </div>
      <div style={{ background: C.bg, borderRadius: 6, padding: 13, marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.red, marginBottom: 7 }}>▼ {t("costsL")}</div>
        {Object.entries(sums.byCategory || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
          .map(([k, v]) => bar(`${catIcon(k, S.categories)} ${catLabel(k, lang, S.categories)}`, v, catColor(k, S.categories), k))}
        {Object.values(sums.byCategory || {}).every((v) => !v) && <div style={{ fontSize: 13.5, color: C.inkSoft }}>{t("noExpenses")}</div>}
      </div>
      <div style={{ background: C.field, borderRadius: 6, padding: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 17 }}>{t("profit")}</span>
        <Money usd={sums.profit} rate={S.rate} lang={lang} size={26} tone={sums.profit >= 0 ? "#E8C275" : "#E8A0AB"} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 10 }}>
        <Kpi label={t("collected")} value={fmt(sums.collected, S.rate, lang)} tone={C.green} />
        <Kpi label={t("outstanding")} value={fmt(outstanding, S.rate, lang)} tone={outstanding > 0 ? C.red : C.green} /></div>
    </Card>;
  }

  if (kind === "expenses") {
    const rows = Object.entries(sums.byCategory || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return <Card><Title>💸 {t("expenses")}</Title>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
        <Kpi label={t("costsL")} value={fmtC(sums.costs, S.rate, lang)} tone={C.red} />
        <Kpi label={t("perDayCost")} value={fmtC(sums.costs / Math.max(1, days), S.rate, lang)} tone={C.inkSoft} />
      </div>
      {rows.length === 0 ? <div style={{ color: C.inkSoft, fontWeight: 500 }}>{t("noExpenses")}</div> : <>
        <StackedSVG parts={rows.map(([k, v]) => ({ value: v, color: catColor(k, S.categories) }))} total={sums.costs} />
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg,
              borderRadius: 3, padding: "10px 12px", borderInlineStart: `4px solid ${catColor(k, S.categories)}` }}>
              <span style={{ fontSize: 18 }}>{catIcon(k, S.categories)}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14.5 }}>{catLabel(k, lang, S.categories)}
                <span style={{ display: "block", fontSize: 11.5, color: C.inkSoft, fontWeight: 500 }}>
                  {Math.round((v / sums.costs) * 100)}%{k === "labour" ? ` · ${t("autoLabour")}` : k === "medicine" ? ` · ${t("autoMed")}` : ""}</span></span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{fmtC(v, S.rate, lang)}</span>
            </div>))}
        </div>
      </>}
    </Card>;
  }
  const groups = [["all", "🧾", t("allTypes")], ["prod", "🥛", t("production")], ["med", "💉", t("meds")],
    ["attend", "👷", t("workers")], ["sale", "🧾", t("sales")], ["payment", "💵", t("recordPayment")], ["herd", "🐄", t("animals")]];
  const belongs = (e) => logType === "all" || e.type === logType
    || (logType === "sale" && e.type === "saleReimburse")
    || (logType === "prod" && ["milk", "milkBulk", "milkUse", "eggs"].includes(e.type))
    || (logType === "herd" && ["animalAdd", "animalEdit", "status", "due", "loss", "birth", "weight", "workerAdd", "customerAdd", "profile"].includes(e.type));
  const list = foldMilkBulkLog(scoped.filter(belongs)).slice().sort((a, b) => compareEntries(a, b, true));
  return <Card><Title>🧾 {t("log")} · {list.length}</Title>
    <Scroller>{groups.map(([k, ic, lb]) => <Chip key={k} active={logType === k} onClick={() => setLogType(k)} color={C.ink}>{ic} {lb}</Chip>)}</Scroller>
    <div style={{ display: "grid", gap: 8 }}>
      {list.length === 0 && <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 500 }}>{t("noEntries")}</div>}
      {list.slice(0, 80).map((e, i) => <LogRow key={e.id || `x${i}`} e={e} lang={lang} t={t} animals={animals} workers={workers} customers={customers} rate={S.rate} custom={S.categories} onReceipt={onReceipt} />)}
    </div></Card>;
}

/* ---------------------------- printed documents ---------------------------- */
const docTd = { border: "1px solid #D9D5CA", padding: "8px 10px", verticalAlign: "middle", fontSize: 11.5 };
const docTh = { ...docTd, background: C.field, color: "#fff", fontWeight: 700, fontSize: 11, letterSpacing: ".03em" };
const docThSum = { ...docTd, background: "#EDEAE2", fontWeight: 800, fontSize: 11.5 };
const td = docTd;
const tdh = { ...docTd, background: "#EDEAE2", fontWeight: 700, fontFamily: "var(--body)", letterSpacing: ".02em" };
const docWrap = { fontFamily: "var(--body)", color: "#1B2033", padding: "12mm", maxWidth: "210mm", margin: "0 auto", background: C.card };

function docL2(both, lang, ar, en) { return both ? `${ar} / ${en}` : lang === "ar" ? ar : en; }

function DocFarmLines({ name, phone, address, L2, size = "md" }) {
  const title = size === "lg" ? 20 : 13.5;
  return <div>
    <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: title, color: C.field, lineHeight: 1.25 }}>
      {name || L2("مزرعتي", "Mazraati Farm")}</div>
    {address && <div style={{ fontSize: 11, color: "#555", marginTop: 4, lineHeight: 1.45 }}>{address}</div>}
    {phone && <div style={{ fontSize: 11, color: "#555", fontFamily: "var(--mono)", marginTop: 2, direction: "ltr", textAlign: "inherit" }}>{phone}</div>}
  </div>;
}

function DocHead({ lang, title, docNo, meta, both, logo, farmName, farmPhone, farmAddress,
  party, partyLabel, showParty = true }) {
  const L2 = (ar, en) => docL2(both, lang, ar, en);
  const farm = { name: (farmName || "").trim(), phone: (farmPhone || "").trim(), address: (farmAddress || "").trim() };
  return <div style={{ marginBottom: 18 }}>
    <div style={{ display: "flex", alignItems: "stretch", gap: 16, paddingBottom: 14, borderBottom: `3px solid ${C.field}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        {logo
          ? <div style={{ width: 76, height: 76, border: `1px solid ${C.line}`, borderRadius: 4, padding: 5,
              background: C.card, flexShrink: 0, display: "grid", placeItems: "center" }}>
              <img src={logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div>
          : <div style={{ width: 76, height: 76, borderRadius: 4, background: C.field, color: "#fff",
              display: "grid", placeItems: "center", fontSize: 34, flexShrink: 0 }}>🐄</div>}
        <DocFarmLines name={farm.name} phone={farm.phone} address={farm.address} L2={L2} size="lg" />
      </div>
      <div style={{ textAlign: "end", flexShrink: 0, alignSelf: "center" }}>
        <div style={{ display: "inline-block", background: C.field, color: "#fff", padding: "11px 18px", borderRadius: 4, minWidth: 130 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{title}</div>
          {docNo && <div style={{ fontFamily: "var(--mono)", fontSize: 12, opacity: .92, marginTop: 5 }}>{docNo}</div>}
        </div>
      </div>
    </div>
    {showParty && party && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px", background: "#FAFAF8" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.inkSoft, letterSpacing: ".08em", marginBottom: 7 }}>
          {L2(T.ar.issuedBy, T.en.issuedBy)}</div>
        <DocFarmLines name={farm.name} phone={farm.phone} address={farm.address} L2={L2} />
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px", background: "#F3F5FA",
        borderInlineStart: `3px solid ${C.field}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.inkSoft, letterSpacing: ".08em", marginBottom: 7 }}>
          {partyLabel || L2(T.ar.issuedTo, T.en.issuedTo)}</div>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{party.name}</div>
        {party.acc && <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#555", marginTop: 4 }}>{party.acc}</div>}
        {party.phone && <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#555", marginTop: 2, direction: "ltr" }}>{party.phone}</div>}
      </div>
    </div>}
    {meta && meta.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {meta.map(([k, v], i) => <span key={`${k}-${i}`} style={{ fontSize: 10.5, background: "#EDEAE2", borderRadius: 3,
        padding: "5px 10px", color: "#333" }}><span style={{ fontWeight: 700 }}>{k}: </span>{v}</span>)}
    </div>}
  </div>;
}

function DocFoot({ thanks, footer, note, signLeft, signRight, showSigns = true }) {
  return <>
    {thanks && <div style={{ marginTop: 18, padding: "12px 14px", background: "#F7F6F2", borderRadius: 4,
      borderInlineStart: `4px solid ${C.tag}`, fontSize: 12.5, fontWeight: 600, color: C.field }}>{thanks}</div>}
    {note && <div style={{ marginTop: 8, fontSize: 11, color: "#555", textAlign: "center", fontWeight: 500 }}>{note}</div>}
    {footer && <div style={{ marginTop: 8, fontSize: 9, color: "#888", fontFamily: "var(--mono)", textAlign: "center" }}>{footer}</div>}
    {showSigns && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginTop: 40, fontSize: 11, color: "#333" }}>
      <div style={{ borderTop: "1px solid #333", paddingTop: 7, textAlign: "center" }}>{signLeft}</div>
      <div style={{ borderTop: "1px solid #333", paddingTop: 7, textAlign: "center" }}>{signRight}</div>
    </div>}
  </>;
}

function PrintDoc({ doc, lang, t: tApp, S, me, customers, ledger, suppliers = [], supplierLedger }) {
  if (doc.kind === "receiptImg") {
    const dlang = doc.docLang || lang;
    return <div dir={T[dlang].dir} style={{ ...docWrap, padding: 16 }}>
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, marginBottom: 10 }}>
        {doc.title || tApp("attachment")}</div>
      {doc.sub && <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{doc.sub}</div>}
      <img src={doc.src} alt="" style={{ width: "100%", maxHeight: "90vh", objectFit: "contain", display: "block" }} />
    </div>;
  }
  const both = doc.docLang === "both";
  const dlang = both ? "ar" : (doc.docLang || lang);
  DATE_LANG.lang = dlang === "ar" ? "ar" : "en";
  const t = (k) => (both ? `${T.ar[k]} / ${T.en[k]}` : T[dlang][k]);
  const L2 = (ar, en) => docL2(both, dlang, ar, en);
  const tpl = docTplOf(S);
  const mView = printMoneyView(tpl);
  const showLbp = S.rate > 0 && mView !== "usd";
  const showUsd = mView !== "lbp";
  const money = (v) => {
    const u = `$${nm(v)}`;
    const l = `${nf(v * S.rate)} ${L2("ل.ل", "LBP")}`;
    if (!showLbp) return u;
    if (!showUsd) return l;
    return `${u}  ·  ${l}`;
  };
  const cellAmt = (v, rateUsed) => {
    if (!showUsd && showLbp) return nf(v * (rateUsed || S.rate));
    return nm(v);
  };
  const now = `${dmy(Date.now(), dlang)} ${hhmm(Date.now())}`;
  const farm = { logo: S.logo, farmName: S.farmName, farmPhone: S.farmPhone, farmAddress: S.farmAddress, showParty: tpl.showParty !== false };
  const foot = `${(S.farmName || "").trim() ? `${S.farmName.trim()} · ` : ""}${T[both ? "ar" : dlang].poweredBy} · v${VERSION.code}`;
  const thanksTxt = (tpl.thanks || "").trim() || t("thanks");
  const footNote = (tpl.footerNote || "").trim();
  const mkFoot = (left, right) => <DocFoot thanks={thanksTxt} note={footNote} footer={foot} showSigns={tpl.showSigns !== false}
    signLeft={left} signRight={right} />;
  const payBadge = (st) => {
    const map = { paid: L2("مدفوع", "Paid"), partial: L2("متبقي", "Remainder"), unpaid: L2("غير مدفوع", "Unpaid") };
    return <StatusPill status={st}>{map[st] || map.unpaid}</StatusPill>;
  };

  if (doc.scope === "supplier") {
    const sl = supplierLedger || { list: [], bySupplier: {}, pays: [], allPays: [] };
    const supplierLabel = L2(T.ar.supplierName, T.en.supplierName);
    if (doc.kind === "statement") {
      const s = suppliers.find((x) => x.id === doc.id);
      if (!s) return <div dir={T[dlang].dir} style={docWrap}><p>{tApp("noData")}</p></div>;
      const b = sl.bySupplier[doc.id] || { bought: 0, paid: 0, due: 0, credit: 0 };
      const catName = (k) => both ? `${catLabel(k, "ar", S.categories)} / ${catLabel(k, "en", S.categories)}`
        : catLabel(k, dlang, S.categories);
      const rows = [...sl.list.filter((x) => x.supplierId === doc.id).map((x) => ({
        at: x.at, k: "b", label: [x.no, catName(x.category), expenseQtyLabel(x, t)].filter(Boolean).join(" · "),
        d: x.amount, c: 0,
      })), ...(sl.allPays || sl.pays || []).filter((p) => p.supplierId === doc.id).map((p) => ({
        at: p.at, k: "p", label: p.method === "transfer" ? t("transfer") : t("cash"), d: 0, c: p.amount,
      }))].sort((a, b2) => cmpTx(a, b2, "oldest"));
      const paidTotal = rows.reduce((sum, r) => sum + r.c, 0);
      let run = 0;
      return <div dir={T[dlang].dir} style={docWrap}>
        <DocHead lang={dlang} both={both} {...farm} title={t("statement")} docNo={supplierNo(suppliers, s.id)}
          party={{ name: s.name, phone: s.phone, acc: supplierNo(suppliers, s.id) }} partyLabel={supplierLabel}
          meta={[[t("generated"), now], [t("preparedBy"), me.name],
            ...(tpl.showRate !== false && S.rate > 0 ? [[t("rate"), `1 USD = ${nf(S.rate)} ${L2("ل.ل", "LBP")}`]] : [])]} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
          <tr>
            <td style={docTh}>{t("colDate")}</td><td style={docTh}>{t("colItem")}</td>
            <td style={{ ...docTh, textAlign: "end" }}>{t("totalBought")}{showUsd && showLbp ? "" : showLbp ? ` (${L2("ل.ل", "LBP")})` : " (USD)"}</td>
            <td style={{ ...docTh, textAlign: "end" }}>{t("paidToSupplier")}</td>
            <td style={{ ...docTh, textAlign: "end" }}>{t("balance")}</td>
          </tr>
          {rows.map((r, i) => { run += r.d - r.c; return <tr key={i} style={{ background: i % 2 ? "#FAFAF8" : "#fff" }}>
            <td style={docTd}>{dmy(r.at)}<span style={{ color: "#888", marginInlineStart: 6, fontSize: 10 }}>{hhmm(r.at)}</span></td>
            <td style={docTd}>{r.k === "b" ? r.label : `${t("paidToSupplier")} · ${r.label}`}</td>
            <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{r.d ? cellAmt(r.d) : ""}</td>
            <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{r.c ? cellAmt(r.c) : ""}</td>
            <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 700 }}>{cellAmt(run)}</td>
          </tr>; })}
          <tr>
            <td style={docThSum} colSpan={2}>{t("balance")}</td>
            <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{cellAmt(b.bought)}</td>
            <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{cellAmt(paidTotal)}</td>
            <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)", color: b.due > 0 ? C.red : C.green }}>{cellAmt(b.due || -b.credit)}</td>
          </tr>
        </tbody></table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <div className="account-balance" style={{ minWidth: 220, textAlign: "end" }}>
            <StatusPill status={b.due > 0 ? "owing" : "clear"}>
              {b.credit > 0 ? t("supplierCredit") : t("weOwe")}</StatusPill>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 20, marginTop: 4, color: C.ink }}>
              {money(b.credit > 0 ? b.credit : b.due)}</div>
          </div>
        </div>
        {mkFoot(t("signOwner"), t("signSupplier"))}
      </div>;
    }

    const bill = sl.list.find((x) => x.id === doc.id);
    if (!bill) return <div dir={T[dlang].dir} style={docWrap}><p style={{ fontWeight: 600 }}>{tApp("noData")}</p></div>;
    const s = suppliers.find((x) => x.id === bill.supplierId);
    const catName = both ? `${catLabel(bill.category, "ar", S.categories)} / ${catLabel(bill.category, "en", S.categories)}`
      : catLabel(bill.category, dlang, S.categories);
    const qtyText = expenseQtyLabel(bill, t);
    const unitPrice = bill.unitPrice > 0 ? bill.unitPrice : (bill.qty > 0 ? bill.amount / bill.qty : bill.amount);
    return <div dir={T[dlang].dir} style={docWrap}>
      <DocHead lang={dlang} both={both} {...farm} title={t("purchaseInvoice")} docNo={bill.no}
        party={{ name: s ? s.name : "—", phone: s && s.phone, acc: s ? supplierNo(suppliers, s.id) : null }}
        partyLabel={supplierLabel}
        meta={[[t("colDate"), `${dmy(bill.at)} ${hhmm(bill.at)}`], [t("preparedBy"), me.name], [t("payStatus"), payBadge(bill.status)]]} />
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}><tbody>
        <tr>
          <td style={docTh}>{t("colItem")}</td><td style={{ ...docTh, textAlign: "center" }}>{t("qty")}</td>
          <td style={{ ...docTh, textAlign: "end" }}>{t("unitPrice")}</td>
          {showUsd && <td style={{ ...docTh, textAlign: "end" }}>USD</td>}
          {showLbp && <td style={{ ...docTh, textAlign: "end" }}>{L2("ل.ل", "LBP")}</td>}
        </tr>
        <tr style={{ background: "#FAFAF8" }}>
          <td style={docTd}>{catName}{bill.feedType ? ` · ${bill.feedType}` : ""}
            {bill.note ? <div style={{ fontSize: 10, color: "#777", marginTop: 3 }}>{bill.note}</div> : null}</td>
          <td style={{ ...docTd, textAlign: "center", fontFamily: "var(--mono)" }}>{qtyText || "—"}</td>
          <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{showUsd ? `$${nm(unitPrice)}` : nf(unitPrice * (bill.rateUsed || S.rate))}</td>
          {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 700 }}>{nm(bill.amount)}</td>}
          {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: showUsd ? 400 : 700 }}>{nf(bill.amount * (bill.rateUsed || S.rate))}</td>}
        </tr>
        <tr>
          <td style={{ ...docThSum, textAlign: "end" }} colSpan={3}>{t("total")}</td>
          {showUsd && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nm(bill.amount)}</td>}
          {showLbp && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nf(bill.amount * (bill.rateUsed || S.rate))}</td>}
        </tr>
        <tr><td style={docTd} colSpan={3}>{t("amountPaid")}</td>
          {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{nm(bill.paidAmount)}</td>}
          {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{nf(bill.paidAmount * (bill.rateUsed || S.rate))}</td>}
        </tr>
        <tr>
          <td style={{ ...docTd, fontWeight: 800, background: bill.due > 0 ? "#FFECEC" : "#E0EFED" }} colSpan={3}>{bill.due > 0 ? t("weOwe") : t("paidS")}</td>
          {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 800,
            background: bill.due > 0 ? "#FFECEC" : "#E0EFED", color: bill.due > 0 ? C.red : C.green }}>{nm(bill.due)}</td>}
          {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 800,
            background: bill.due > 0 ? "#FFECEC" : "#E0EFED", color: bill.due > 0 ? C.red : C.green }}>{nf(bill.due * (bill.rateUsed || S.rate))}</td>}
        </tr>
      </tbody></table>
      {tpl.showRate !== false && S.rate > 0 && <div style={{ fontSize: 10.5, color: "#666", marginTop: 10 }}>
        {t("rate")}: 1 USD = {nf(bill.rateUsed || S.rate)} {L2("ل.ل", "LBP")}
      </div>}
      {mkFoot(t("signSupplier"), t("signOwner"))}
    </div>;
  }

  if (doc.kind === "statement") {
    const c = customers.find((x) => x.id === doc.id);
    if (!c) return <div dir={T[dlang].dir} style={docWrap}><p>{tApp("noData")}</p></div>;
    const b = ledger.byCustomer[doc.id] || { sold: 0, paid: 0, due: 0 };
    const rows = [...ledger.list.filter((x) => x.customerId === doc.id).flatMap((x) => {
      const pr = PRODUCTS.find((p) => p[0] === x.product) || PROD_OTHER;
      const pn = both ? `${pr[2]} / ${pr[3]}` : (dlang === "ar" ? pr[2] : pr[3]);
      const xu = (x.product || "milk") === "milk" ? milkUnitLb(x.unit, t)
        : both ? `${pr[4]} / ${pr[5]}` : (dlang === "ar" ? pr[4] : pr[5]);
      return [{ at: x.at, k: "s", label: `${x.no} · ${pn} · ${n1(x.qty)} ${xu} × ${money(x.price)}`,
        d: x.grossAmount, m: 0, c: 0 }, ...(x.reimbRows || []).map((r) => ({ at: r.at || x.at, k: "r",
        label: `${x.no} · ${t("reimbursement")} · ${r.accountAlloc ? t("accountReimburse") : r.name}`,
        d: 0, m: r.amount, c: 0 })),
        ...((x.discountAmount || 0) > 0.009 ? [{ at: x.at, k: "d",
          label: `${x.no} · ${t("discount")}${x.discountNote ? ` · ${x.discountNote}` : ""}`,
          d: 0, m: x.discountAmount, c: 0 }] : [])];
    }),
      ...(ledger.paymentDeductions || []).filter((e) => e.customerId === doc.id).map((e) => ({
        at: e.at, k: "r",
        label: `${t("reimbursement")} · ${e.note || e.name || "—"}`,
        d: 0, m: e.amount, c: 0,
      })),
      ...ledger.pays.filter((p) => p.customerId === doc.id && toCents(p.amount) > 0).map((p) => ({ at: p.at, k: "p",
      label: p.method === "transfer" ? t("transfer") : t("cash"), d: 0, m: 0, c: p.amount }))]
      .sort((a, b2) => cmpTx(a, b2, "oldest"));
    const totalDebit = fromCents(rows.reduce((sum, r) => sum + toCents(r.d), 0));
    const totalDeduct = fromCents(rows.reduce((sum, r) => sum + toCents(r.m), 0));
    const totalCredit = fromCents(rows.reduce((sum, r) => sum + toCents(r.c), 0));
    const finalBalance = fromCents(toCents(totalDebit) - toCents(totalDeduct) - toCents(totalCredit));
    let runC = 0;
    return <div dir={T[dlang].dir} style={docWrap}>
      <DocHead lang={dlang} both={both} {...farm} title={t("statement")}
        docNo={accNo(customers, c.id)}
        party={{ name: customerLabel(c, t), phone: c.phone, acc: accNo(customers, c.id) }}
        meta={[[t("generated"), now], [t("preparedBy"), me.name],
          ...(tpl.showRate !== false && S.rate > 0 ? [[t("rate"), `1 USD = ${nf(S.rate)} ${L2("ل.ل", "LBP")}`]] : [])]} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
        <tr>
          <td style={docTh}>{t("colDate")}</td><td style={docTh}>{t("colItem")}</td>
          <td style={{ ...docTh, textAlign: "end" }}>{t("accountTotal")}{showUsd && showLbp ? "" : showLbp ? ` (${L2("ل.ل", "LBP")})` : " (USD)"}</td>
          <td style={{ ...docTh, textAlign: "end" }}>{t("deductions")}</td>
          <td style={{ ...docTh, textAlign: "end" }}>{t("creditsCollected")}</td>
          <td style={{ ...docTh, textAlign: "end" }}>{t("balance")}</td>
        </tr>
        {rows.map((r, i) => { runC += toCents(r.d) - toCents(r.m) - toCents(r.c); return <tr key={i} style={{ background: i % 2 ? "#FAFAF8" : "#fff" }}>
          <td style={docTd}>{dmy(r.at)}<span style={{ color: "#888", marginInlineStart: 6, fontSize: 10 }}>{hhmm(r.at)}</span></td>
          <td style={docTd}>{r.k === "p" ? `${t("receipt")} · ${r.label}` : r.label}</td>
          <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{r.d ? cellAmt(r.d) : ""}</td>
          <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{r.m ? cellAmt(r.m) : ""}</td>
          <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{r.c ? cellAmt(r.c) : ""}</td>
          <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 700 }}>{runC === 0 ? "—" : cellAmt(fromCents(runC))}</td>
        </tr>; })}
        <tr>
          <td style={docThSum} colSpan={2}>{t("balance")}</td>
          <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{cellAmt(totalDebit)}</td>
          <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{cellAmt(totalDeduct)}</td>
          <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{cellAmt(totalCredit)}</td>
          <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)", color: toCents(finalBalance) > 0 ? C.red : C.green }}>{toCents(finalBalance) === 0 ? "—" : cellAmt(finalBalance)}</td>
        </tr>
      </tbody></table>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div className="account-balance" style={{ minWidth: 220, textAlign: "end" }}>
          <StatusPill status={toCents(finalBalance) > 0 ? "owing" : "paid"}>
            {toCents(finalBalance) > 0 ? t("due") : toCents(finalBalance) < 0 ? t("credit") : t("paidS")}</StatusPill>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 20, marginTop: 4, color: C.ink }}>
            {toCents(finalBalance) === 0 ? "—" : money(Math.abs(finalBalance))}</div>
        </div>
      </div>
      {mkFoot(t("signOwner"), t("signCustomer"))}
    </div>;
  }

  const iv = ledger.list.find((x) => x.id === doc.id);
  if (!iv) return <div dir={T[dlang].dir} style={docWrap}><p style={{ fontWeight: 600 }}>{tApp("noData")}</p></div>;
  const c = customers.find((x) => x.id === iv.customerId);
  const isReceipt = doc.kind === "receipt";
  const pr = PRODUCTS.find((p) => p[0] === iv.product) || PROD_OTHER;
  const pn = both ? `${pr[2]} / ${pr[3]}` : (dlang === "ar" ? pr[2] : pr[3]);
  const unit = (iv.product || "milk") === "milk" ? milkUnitLb(iv.unit, t)
    : both ? `${pr[4]} / ${pr[5]}` : (dlang === "ar" ? pr[4] : pr[5]);
  const docNo = isReceipt ? iv.no.replace("INV", "REC") : iv.no;
  return <div dir={T[dlang].dir} style={docWrap}>
    <DocHead lang={dlang} both={both} {...farm} title={isReceipt ? t("receipt") : t("invoice")} docNo={docNo}
      party={{ name: c ? customerLabel(c, t) : "—", phone: c && c.phone, acc: c ? accNo(customers, c.id) : null }}
      meta={[[t("colDate"), `${dmy(iv.at)} ${hhmm(iv.at)}`], [t("preparedBy"), me.name], [t("payStatus"), payBadge(iv.status)]]} />
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}><tbody>
      <tr>
        <td style={docTh}>{t("colItem")}</td><td style={{ ...docTh, textAlign: "center" }}>{t("qty")}</td>
        <td style={{ ...docTh, textAlign: "end" }}>{t("unitPrice")}</td>
        {showUsd && <td style={{ ...docTh, textAlign: "end" }}>USD</td>}
        {showLbp && <td style={{ ...docTh, textAlign: "end" }}>{L2("ل.ل", "LBP")}</td>}
      </tr>
      <tr style={{ background: "#FAFAF8" }}>
        <td style={docTd}>{pr[1]} {pn}{iv.note ? <div style={{ fontSize: 10, color: "#777", marginTop: 3 }}>{iv.note}</div> : null}</td>
        <td style={{ ...docTd, textAlign: "center", fontFamily: "var(--mono)" }}>{n1(iv.qty)} {unit}</td>
        <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{showUsd ? `$${nm(iv.price)}` : nf(iv.price * (iv.rateUsed || S.rate))}</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 700 }}>{nm(iv.amount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: showUsd ? 400 : 700 }}>{nf(iv.amount * (iv.rateUsed || S.rate))}</td>}
      </tr>
      {(iv.reimbRows || []).map((r) => <tr key={r.id} style={{ background: "#F4F8F6" }}>
        <td style={{ ...docTd, color: C.field, fontWeight: 700 }}>↩ {t("reimbursement")} · {r.accountAlloc ? t("accountReimburse") : r.name}</td>
        <td style={{ ...docTd, textAlign: "center" }}>—</td><td style={{ ...docTd, textAlign: "end" }}>—</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nm(r.amount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>
          −{nf(r.amount * (r.rateUsed || iv.rateUsed || S.rate))}</td>}
      </tr>)}
      {(iv.discountAmount || 0) > 0.009 && <tr style={{ background: "#F4F8F6" }}>
        <td style={{ ...docTd, color: C.field, fontWeight: 700 }}>{t("discount")}{iv.discountNote ? ` · ${iv.discountNote}` : ""}</td>
        <td style={{ ...docTd, textAlign: "center" }}>—</td><td style={{ ...docTd, textAlign: "end" }}>—</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nm(iv.discountAmount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>
          −{nf(iv.discountAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>}
      <tr>
        <td style={{ ...docThSum, textAlign: "end" }} colSpan={3}>{t("grossSubtotal")}</td>
        {showUsd && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nm(iv.grossAmount)}</td>}
        {showLbp && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nf(iv.grossAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>
      <tr>
        <td style={{ ...docTd, textAlign: "end" }} colSpan={3}>{t("reimbursementTotal")}</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nm(iv.reimbAmount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nf(iv.reimbAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>
      {(iv.discountAmount || 0) > 0.009 && <tr>
        <td style={{ ...docTd, textAlign: "end" }} colSpan={3}>{t("discount")}</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nm(iv.discountAmount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", color: C.green }}>−{nf(iv.discountAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>}
      <tr>
        <td style={{ ...docThSum, textAlign: "end" }} colSpan={3}>{t("netInvoiceTotal")}</td>
        {showUsd && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nm(iv.netAmount)}</td>}
        {showLbp && <td style={{ ...docThSum, textAlign: "end", fontFamily: "var(--mono)" }}>{nf(iv.netAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>
      <tr>
        <td style={docTd} colSpan={3}>{t("actualPaid")}</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{nm(iv.paidAmount)}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)" }}>{nf(iv.paidAmount * (iv.rateUsed || S.rate))}</td>}
      </tr>
      <tr>
        <td style={{ ...docTd, fontWeight: 800, background: isOwing(iv.due) ? "#FFECEC" : "#E0EFED" }} colSpan={3}>
          {isOwing(iv.due) ? t("outstanding") : t("paidS")}</td>
        {showUsd && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 800,
          background: isOwing(iv.due) ? "#FFECEC" : "#E0EFED", color: isOwing(iv.due) ? C.red : C.green }}>{isOwing(iv.due) ? nm(iv.due) : "—"}</td>}
        {showLbp && <td style={{ ...docTd, textAlign: "end", fontFamily: "var(--mono)", fontWeight: 800,
          background: isOwing(iv.due) ? "#FFECEC" : "#E0EFED", color: isOwing(iv.due) ? C.red : C.green }}>{isOwing(iv.due) ? nf(iv.due * (iv.rateUsed || S.rate)) : "—"}</td>}
      </tr>
    </tbody></table>
    {tpl.showRate !== false && S.rate > 0 && <div style={{ fontSize: 10.5, color: "#666", marginTop: 10 }}>
      {t("rate")}: 1 USD = {nf(iv.rateUsed || S.rate)} {L2("ل.ل", "LBP")}
      {iv.currency === "lbp" ? ` · ${t("paidIn")} ${T[both ? "ar" : dlang].lbp}` : ""}
    </div>}
    {mkFoot(isReceipt ? t("signReceived") : t("signOwner"), t("signCustomer"))}
  </div>;
}

function PrintReport({ lang, t, sums, prevSums, S, days, me, animals, workers, customers, scoped, scopedSales, summaryLines, series, periodLabel, outstanding }) {
  const money = (v) => fmt(v, S.rate, lang);
  const costParts = Object.entries(sums.byCategory || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: catLabel(k, lang), value: v, color: catColor(k) }));
  const att = {};
  scoped.filter((e) => e.type === "attend").forEach((e) => { const k = `${dayKey(e.at)}|${e.workerId}`; if (!(k in att)) att[k] = e; });
  const per = {}; Object.values(att).forEach((e) => { if (e.present) per[e.workerId] = (per[e.workerId] || 0) + 1; });
  const H = ({ children }) => <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 13.5,
    margin: "13px 0 5px", color: C.field, borderBottom: `1.5px solid ${C.line}`, paddingBottom: 3 }}>{children}</div>;
  return <div dir={T[lang].dir} style={{ fontFamily: "var(--body)", color: "#000", padding: "9mm" }}>
    <DocHead lang={lang} logo={S.logo} farmName={S.farmName} farmPhone={S.farmPhone} farmAddress={S.farmAddress} title={t("reports")} meta={[[t("period"), `${periodLabel} (${days} ${t("days")})`],
      [t("generated"), `${dmy(Date.now(), lang)} ${hhmm(Date.now())}`],
      [t("preparedBy"), me.name], [t("rate"), `1 USD = ${nf(S.rate)} LBP`]]} />
    <H>📋 {t("summary")}</H>
    <ul style={{ margin: "4px 0", paddingInlineStart: 16, fontSize: 11.5, lineHeight: 1.6 }}>
      {summaryLines.map((l, i) => <li key={i}>{l.text}</li>)}</ul>
    <H>💵 {t("pl")}</H>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}><tbody>
      {PRODUCTS.filter((p) => sums.byProduct[p[0]] > 0).map((p) => <tr key={p[0]}>
        <td style={td}>+ {lang === "ar" ? p[2] : p[3]}</td>
        <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{money(sums.byProduct[p[0]])}</td></tr>)}
      {Object.entries(sums.byCategory || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
        .map(([ck, v]) => [catLabel(ck, lang), v]).map(([k, v]) => <tr key={k}>
        <td style={td}>− {k}</td><td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{money(v)}</td></tr>)}
      <tr><td style={{ ...td, fontWeight: 800, background: "#EDEAE2" }}>{t("profit")}</td>
        <td style={{ ...td, textAlign: "end", fontWeight: 800, background: "#EDEAE2" }}>{money(sums.profit)}</td></tr>
    </tbody></table>
    <div style={{ marginTop: 8, width: "62%" }}><StackedSVG parts={costParts} total={sums.costs} /></div>
    <H>📦 {t("production")}</H>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11.5, marginBottom: 6 }}>
      <div><b>{t("totalLiters")}:</b> {nf(sums.milk)} L</div>
      <div><b>{t("totalEggs")}:</b> {nf(sums.eggs)}</div>
      <div><b>{t("herdSize")}:</b> {animals.reduce((s, a) => s + headCount(a), 0)}</div>
      <div><b>{t("vsPrev")}:</b> {nf(prevSums.milk)} L / {nf(prevSums.eggs)}</div>
      <div><b>{t("losses")}:</b> {nf(sums.losses)}</div><div><b>{t("births")}:</b> {nf(sums.births)}</div>
    </div>
    <div style={{ width: "60%" }}><BarsSVG data={series} height={120} /></div>
    <H>🐾 {t("animals")}</H>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><tbody>
      <tr><td style={tdh}>{t("species")}</td><td style={tdh}>{t("colName")}</td><td style={tdh}>{t("status")}</td>
        <td style={tdh}>{t("count")}</td><td style={tdh}>{t("expected")}</td><td style={tdh}>{t("production")}</td>
        <td style={tdh}>{t("medicineNote")}</td><td style={tdh}>{t("dueDate")}</td></tr>
      {animals.map((a) => <tr key={a.id}>
        <td style={td}>{spName(a.species, lang, true)}</td><td style={td}>{animalLabel(a)}</td>
        <td style={td}>{statusLabel(a.status, lang)}</td><td style={td}>{headCount(a)}</td>
        <td style={td}>{a.expected || "—"}</td>
        <td style={td}>{nf((producesEggs(a) ? sums.byEggs[a.id] : sums.byMilk[a.id]) || 0)}</td>
        <td style={td}>{a.medicine || "—"}</td><td style={td}>{a.due ? dmy(a.due) : "—"}</td></tr>)}
    </tbody></table>
    <H>🧾 {t("sales")}</H>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><tbody>
      <tr><td style={tdh}>{t("invoiceNo")}</td><td style={tdh}>{t("colDate")}</td><td style={tdh}>{t("customerName")}</td>
        <td style={tdh}>{t("product")}</td><td style={tdh}>{t("qty")}</td><td style={tdh}>{t("amount")}</td>
        <td style={tdh}>{t("due")}</td><td style={tdh}>{t("payStatus")}</td></tr>
      {(scopedSales || []).map((iv) => { const pr = PRODUCTS.find((p) => p[0] === iv.product) || PROD_OTHER;
        return <tr key={iv.id}><td style={td}>{iv.no}</td><td style={td}>{dmy(iv.at)}</td>
          <td style={td}>{iv.customerName || "—"}</td><td style={td}>{lang === "ar" ? pr[2] : pr[3]}</td>
          <td style={td}>{n1(iv.qty)} {saleQtyUnit(iv, lang, t)}</td><td style={{ ...td, textAlign: "end" }}>{money(iv.amount)}</td>
          <td style={{ ...td, textAlign: "end" }}>{isOwing(iv.due) ? money(iv.due) : "—"}</td>
          <td style={td}>{iv.status === "paid" ? t("paidS") : iv.status === "partial" ? t("partial") : t("unpaid")}</td></tr>; })}
      <tr><td style={{ ...td, background: "#EDEAE2", fontWeight: 800 }} colSpan={5}>{t("outstanding")}</td>
        <td style={{ ...td, background: "#EDEAE2", textAlign: "end", fontWeight: 800 }} colSpan={3}>{money(outstanding)}</td></tr>
    </tbody></table>
    <H>👷 {t("labor")}</H>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><tbody>
      <tr><td style={tdh}>{t("colName")}</td><td style={tdh}>{t("workerType")}</td><td style={tdh}>{t("days")}</td><td style={tdh}>{t("amount")}</td></tr>
      {(workers || []).map((w) => <tr key={w.id}><td style={td}>{w.name}</td>
        <td style={td}>{w.type === "daily" ? t("daily") : t("monthly")}</td>
        <td style={td}>{w.type === "daily" ? (per[w.id] || 0) : days}</td>
        <td style={{ ...td, textAlign: "end" }}>{money(w.type === "daily" ? (per[w.id] || 0) * S.wage : (w.salary * days) / 30)}</td></tr>)}
      <tr><td style={{ ...td, fontWeight: 800, background: "#EDEAE2" }} colSpan={3}>{t("payroll")}</td>
        <td style={{ ...td, textAlign: "end", fontWeight: 800, background: "#EDEAE2" }}>{money(sums.laborCost)}</td></tr>
    </tbody></table>
    <div style={{ display: "flex", gap: 44, marginTop: 36, fontSize: 11 }}>
      <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>{t("signOwner")}</div>
      <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>{t("signVet")}</div></div>
    <div style={{ marginTop: 10, fontSize: 9, color: "#888", fontFamily: "var(--mono)" }}>
      {S.farmName ? `${S.farmName} · ` : ""}{t("poweredBy")} · v{VERSION.code}</div>
  </div>;
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null, key: 0 }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
    return <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 460, margin: "40px auto", background: C.card, borderRadius: 6, padding: 20 }}>
        <div style={{ fontSize: 40 }}>🐄</div>
        <h2 style={{ margin: "8px 0", color: C.field }}>حدث خطأ · Something went wrong</h2>
        <p style={{ color: C.inkSoft }}>أعد تحميل الصفحة. إذا تكرر الخطأ أرسل هذه الرسالة:<br />Reload. If it repeats, send this message:</p>
        <pre style={{ background: C.bg, padding: 12, borderRadius: 5, fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto" }}>
          {String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err))}</pre>
        <button onClick={() => this.setState({ err: null, key: this.state.key + 1 })} style={{ ...primaryBtn }}>إعادة المحاولة · Try again</button>
      </div></div>;
  }
}

/* ============================== APP ============================== */
export default function Mazraati() { return <Boundary><FarmApp /></Boundary>; }

function NavGroup({ title, open, onToggle, dir, children }) {
  return (
    <div className="nav-group">
      <button type="button" className="nav-group-head" onClick={onToggle}>
        <span>{title}</span>
        <span className={`nav-group-chev${open ? " open" : ""}`} aria-hidden="true">›</span>
      </button>
      {open && <div className="nav-group-items">{children}</div>}
    </div>
  );
}

function FarmApp() {
  const [lang, setLang] = useState("ar");
  const [me, setMe] = useState(null);
  const [preId, setPreId] = useState(null);
  const [data, setData] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState("");
  const [failed, setFailed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [expRange, setExpRange] = useState("today");
  const [expFrom, setExpFrom] = useState(""); const [expTo, setExpTo] = useState("");
  const [expQ, setExpQ] = useState("");
  const [cashRange, setCashRange] = useState("today");
  const [cashFrom, setCashFrom] = useState(""); const [cashTo, setCashTo] = useState("");
  const [cashDir, setCashDir] = useState("all");
  const [cashQ, setCashQ] = useState("");
  const [cashRefOpen, setCashRefOpen] = useState(false);
  const [cashFlowOpen, setCashFlowOpen] = useState(false);
  const [cashCustomizeOpen, setCashCustomizeOpen] = useState(false);
  const [cashDragKey, setCashDragKey] = useState(null);
  const [cashTable, setCashTable] = useState(() => sanitizeCashTablePrefs(null));
  const cashTableRef = useRef(cashTable);
  const [expCat, setExpCat] = useState("all");
  const [expSource, setExpSource] = useState("all");
  const [expSort, setExpSort] = useState("newest");
  const [expBillsOpen, setExpBillsOpen] = useState(false);
  const [expInsightsOpen, setExpInsightsOpen] = useState(false);
  const [report, setReport] = useState("summary");
  const [spFilter, setSpFilter] = useState("all");
  const [herdStatusFilter, setHerdStatusFilter] = useState("all");
  const [printing, setPrinting] = useState(false);
  const [doc, setDoc] = useState(null);
  const [draftS, setDraftS] = useState(null);
  const [cloudCfg, setCloudCfg] = useState({ url: "", token: "", on: false });
  const [cloudMsg, setCloudMsg] = useState("");
  const [cloudAdv, setCloudAdv] = useState(false);
  const [co, setCo] = useState(() => getCompanyCloud());
  const [coEmail, setCoEmail] = useState("");
  const [coPass, setCoPass] = useState("");
  const [coCompany, setCoCompany] = useState("");
  const [coInvite, setCoInvite] = useState("");
  const [coJoinOpen, setCoJoinOpen] = useState(false);
  const [coMsg, setCoMsg] = useState("");
  const [coBusy, setCoBusy] = useState(false);
  const [moneyView, setMoneyView] = useState("both");
  const [theme, setTheme] = useState("light");
  const [navFarmOpen, setNavFarmOpen] = useState(true);
  const [navOfficeOpen, setNavOfficeOpen] = useState(true);
  const [setOpen, setSetOpen] = useState({ farm: true, money: true, milk: false, docs: false, weather: false, people: false, data: false, system: false, danger: false });
  const [rateHistOpen, setRateHistOpen] = useState(false);
  const toggleSet = (k) => setSetOpen((s) => ({ ...s, [k]: !s[k] }));
  const [sideHidden, setSideHidden] = useState(false);
  const [hideDeviceBanner, setHideDeviceBanner] = useState(false);
  const [cloudSkip, setCloudSkip] = useState(false);
  const [favKeys, setFavKeys] = useState(["n2", "n12", "n6", "n3"]);
  const [seenVersion, setSeenVersion] = useState(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [ctx, setCtx] = useState(null);
  const openCtx = useCallback((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    if (!items || !items.length) return;
    setCtx({ x: e.clientX, y: e.clientY, items });
  }, []);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [weather, setWeather] = useState(null);
  const [wErr, setWErr] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [cityQ, setCityQ] = useState("");
  const [route, setRoute] = useState("dashboard");
  const [routeHist, setRouteHist] = useState([]);
  const navigate = useCallback((r, { clearSheet = true } = {}) => {
    const target = r === "obligations" ? "expenses" : r;
    if (!target || target === route) { if (clearSheet) setSheet(null); return; }
    setRouteHist((h) => [...h.slice(-14), route]);
    setRoute(target);
    if (clearSheet) setSheet(null);
  }, [route]);
  const goBackRoute = useCallback(() => {
    setRouteHist((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setRoute(prev);
      setSheet(null);
      return h.slice(0, -1);
    });
  }, []);
  const sheetBack = useCallback(() => {
    setSheet((s) => (s && s.back ? s.back : null));
  }, []);
  const [sel, setSel] = useState(null);
  const [selCust, setSelCust] = useState(null);
  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState("");
  const [batch, setBatch] = useState({});
  const [entryDate, setEntryDate] = useState(dayKey(Date.now()));
  const [sortBy, setSortBy] = useState({ k: "tag", d: "asc" });
  const [custSort, setCustSort] = useState("nameAsc");
  const [custQ, setCustQ] = useState("");
  const [openAcc, setOpenAcc] = useState([]);          // customers kept open as tabs
  const [accTab, setAccTab] = useState("overview");
  const [txFilters, setTxFilters] = useState({ q: "", status: "all", from: "", to: "", sort: "newest" });
  const [selSupp, setSelSupp] = useState(null);
  const [openSupp, setOpenSupp] = useState([]);
  const [suppTab, setSuppTab] = useState("open");
  const [suppQ, setSuppQ] = useState("");
  const [suppSt, setSuppSt] = useState("all");
  const [suppSort, setSuppSort] = useState("alphaAsc");
  const [milkUnitDraft, setMilkUnitDraft] = useState(null);
  const [eggOpen, setEggOpen] = useState(false);
  const [milkLogFilt, setMilkLogFilt] = useState({ sess: "all", from: "", to: "", sort: "newest" });
  const dataRef = useRef(null);
  const obligationPayLocks = useRef(new Set());
  const toastTimer = useRef(null);
  dataRef.current = data;
  cashTableRef.current = cashTable;

  /* Keep legacy format helpers in sync before descendants render. */
  MONEY.view = moneyView;
  DATE_LANG.lang = lang === "ar" ? "ar" : "en";
  useEffect(() => { applyThemeColors(theme); }, [theme]);

  const t = (k) => T[lang][k] ?? k;
  const dir = T[lang].dir;

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let alive = true;
    const onCtrl = () => { if (alive) window.location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((reg) => {
      if (!alive) return;
      watchSwUpdate(reg, (v) => { if (alive) setUpdateReady(v); });
    }).catch(() => {});
    const iv = setInterval(() => {
      navigator.serviceWorker.getRegistration("./").then((r) => r?.update().catch(() => {}));
    }, 45 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); navigator.serviceWorker.removeEventListener("controllerchange", onCtrl); };
  }, []);

  const setUpdateStatus = (k) => setUpdateMsg(
    k === "checking" ? t("updateChecking") : k === "ready" ? t("updateReady")
      : k === "latest" ? t("upToDate") : k === "updating" ? t("updating") : k === "fail" ? t("updateFail") : "");
  const doCheckUpdate = () => checkAppUpdate(setUpdateReady, setUpdateStatus);
  const doApplyUpdate = () => applyAppUpdate(setUpdateStatus);

  const dismissWhatsNew = () => {
    setSeenVersion(VERSION.code);
    saveDevicePrefs({ seenVersion: VERSION.code });
    setSheet(null);
  };

  useEffect(() => {
    if (!prefsReady || !me || !data) return;
    if (seenVersion === VERSION.code) return;
    setSheet((s) => (s ? s : { k: "whatsNew" }));
  }, [prefsReady, me, data, seenVersion]);

  useEffect(() => {
    let done = false;
    const fb = setTimeout(() => { if (!done) { const b = emptyFarm(); setData(b); setDraftS(b.settings); } }, 6500);
    (async () => {
      try {
        let cRaw = null;
        try { cRaw = await store.get(CLOUD_KEY, false); }
        catch (e1) {
          try { cRaw = await store.get(LEGACY.cloud, false); } catch (e2) { /* none */ }
          if (!cRaw && typeof window !== "undefined" && window.storage) {
            try { cRaw = await withTimeout(window.storage.get(CLOUD_KEY, false), 4000); }
            catch (e3) { try { cRaw = await withTimeout(window.storage.get(LEGACY.cloud, false), 4000); } catch (e4) { /* none */ } }
          }
        }
        if (cRaw && cRaw.value) { const cfg = JSON.parse(cRaw.value); cloud.url = cfg.url || ""; cloud.token = cfg.token || "";
          cloud.on = !!cfg.on && !!cfg.url; setCloudCfg({ url: cloud.url, token: cloud.token, on: cloud.on }); }
      } catch (e) { /* none set */ }
      let savedId = null;
      try {
        let d = null;
        try { d = await store.get(DEVICE_KEY, false); } catch (e2) { d = await store.get(LEGACY.device, false); }
        if (d && d.value) {
          const p = JSON.parse(d.value); savedId = p.id;
          if (p.lang) setLang(p.lang);
          if (p.money) { MONEY.view = p.money; setMoneyView(p.money); }
          if (p.theme === "dark" || p.theme === "light") setTheme(p.theme);
          if (p.sideHidden) setSideHidden(!!p.sideHidden);
          if (p.hideDeviceBanner) setHideDeviceBanner(true);
          if (Array.isArray(p.favKeys) && p.favKeys.length) setFavKeys(p.favKeys.slice(0, 8));
          setCashTable(sanitizeCashTablePrefs(p.cashTable));
          setSeenVersion(typeof p.seenVersion === "string" ? p.seenVersion : "");
        } else setSeenVersion("");
      } catch (e) { setSeenVersion(""); /* no profile on this device */ }
      setPrefsReady(true);
      let farm; try { farm = await loadShared(); } catch (e) { farm = emptyFarm(); }
      done = true; clearTimeout(fb);
      setData(farm); setDraftS(farm.settings);
      if (farm && farm.settings && farm.settings.demoWalkthrough) setWalkthroughHold(true);
      else if (walkthroughHoldActive()) setWalkthroughHold(false);
      if (savedId) { const p = (farm.profiles || []).find((x) => x.id === savedId); if (p && p.pin) setPreId(p.id); else if (p) setMe(p); }
    })();
    return () => clearTimeout(fb);
  }, []);

  useEffect(() => {
    if (!prefsReady || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 639px)");
    if (mq.matches) setSideHidden(true);
  }, [prefsReady]);

  const applyRemoteFarm = useCallback((raw) => {
    if (walkthroughHoldActive()) return;
    try {
      const d = migrate(JSON.parse(raw));
      setData((prev) => {
        const editing = draftS && prev && JSON.stringify(draftS) !== JSON.stringify(prev.settings);
        if (!editing) setDraftS(d.settings);
        return d;
      });
      setFailed(null);
      try { store.mem[SHARED_KEY] = raw; if (store.kind === "device") window.localStorage.setItem(SHARED_KEY, raw); } catch (e) { /* */ }
    } catch (e) { /* ignore bad remote */ }
  }, [draftS]);

  useEffect(() => {
    const stop = startCompanyCloud(applyRemoteFarm);
    const unsub = subscribeCompanyCloud(setCo);
    return () => { stop(); unsub(); };
  }, [applyRemoteFarm]);

  const pull = useCallback(async () => {
    try {
      const r = await store.get(SHARED_KEY, true);
      if (!r || !r.value) return;
      const d = migrate(JSON.parse(r.value));
      const editing = draftS && data && JSON.stringify(draftS) !== JSON.stringify(data.settings);
      setData(d); if (!editing) setDraftS(d.settings); setFailed(null);
    } catch (e) { /* keep local */ }
  }, [draftS, data]);
  useEffect(() => { const i = setInterval(pull, 45000); return () => clearInterval(i); }, [pull]);

  const loc = (data && data.settings && data.settings.loc) || null;
  const loadWeather = useCallback(async () => {
    if (!loc) return;
    try { setWeather(await fetchWeather(loc.lat, loc.lon)); setWErr(false); }
    catch (e) { setWErr(true); }
  }, [loc && loc.lat, loc && loc.lon]);
  useEffect(() => { loadWeather(); const i = setInterval(loadWeather, 1800000); return () => clearInterval(i); }, [loadWeather]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const ping = (m) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1700);
  };
  const openAccount = (id, tab) => {
    setOpenAcc((list) => (list.includes(id) ? list : [...list, id]));
    setSelCust(id);
    if (tab) setAccTab(tab);
    else setAccTab("overview");
  };
  const openSupplier = (id, tab) => {
    setOpenSupp((list) => (list.includes(id) ? list : [...list, id]));
    setSelSupp(id);
    if (tab) setSuppTab(tab);
    else setSuppTab("open");
  };
  const openAccountFull = (id, tab = "transactions") => {
    setSheet(null);
    navigate("sales", { clearSheet: false });
    openAccount(id, tab);
  };
  /* After a sale/payment modal, stay on the desktop account panel — not a phone sheet. */
  const returnToAccount = (cid) => {
    if (cid) openAccount(cid, accTab);
    setSheet(null);
  };
  const returnToSupplier = (sid) => {
    if (sid) openSupplier(sid, suppTab);
    setSheet(null);
  };
  const closeAccount = (id) => {
    setOpenAcc((list) => { const next = list.filter((x) => x !== id);
      if (selCust === id) setSelCust(next.length ? next[next.length - 1] : null);
      return next; });
  };
  const closeSupplier = (id) => {
    setOpenSupp((list) => { const next = list.filter((x) => x !== id);
      if (selSupp === id) setSelSupp(next.length ? next[next.length - 1] : null);
      return next; });
  };

  const resolveSupplierPatch = (payload) => {
    let list = suppliers;
    let sid = payload.supplierId || null;
    const name = (payload.vendor || payload.supplier || "").trim();
    if (!sid && name) {
      const existing = suppliers.find((s) => !s.archived && s.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) sid = existing.id;
      else {
        const s = { id: uid(), name, phone: "", note: "", tags: payload.category === "feed" ? ["feed"]
          : payload.category === "medicine" || payload.category === "vet" ? ["med"] : ["other"],
          at: iso(Date.now()) };
        list = [...suppliers, s];
        sid = s.id;
      }
    }
    const vendorName = sid ? ((list.find((s) => s.id === sid) || {}).name || name) : name;
    const expenseId = payload.id || uid();
    const expense = { ...payload, id: expenseId, supplierId: sid || null, vendor: vendorName,
      supplier: payload.supplier || vendorName };
    const es = [{ type: "expense", ...expense }];
    const payAmt = supplierCashOut(expense);
    if (payAmt > 0.0001) {
      es.push({ type: "supplierPay", supplierId: sid, amount: payAmt, method: payload.method || "cash",
        vendor: vendorName, note: expense.note || "", at: expense.at, expenseId });
    }
    return { es, list, sid, changed: list !== suppliers, expense, payAmt };
  };

  /* Rewrite the entry list in place (edit expense + resync linked supplier pays).
     Mutator runs once so new ids (e.g. supplierPay) are not generated twice. */
  const rewriteEntries = async (mutator, okMsg) => {
    setBusy(true);
    try {
      const live = dataRef.current || emptyFarm();
      const base = await readSharedFarm(live);
      const nextEntries = mutator(base.entries || []);
      const merged = { ...base, entries: nextEntries };
      setData(merged);
      await store.set(SHARED_KEY, JSON.stringify(merged), true);
      setData(merged); setFailed(null);
      if (okMsg) ping(okMsg);
      return true;
    } catch (e) { setFailed({ entries: [], patch: null, profile: me }); return false; }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") { setPalette(false); setSheet(null); }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "Backspace")) {
        if (sheet?.back) { e.preventDefault(); sheetBack(); }
        else if (routeHist.length) { e.preventDefault(); goBackRoute(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, routeHist, sheetBack, goBackRoute]);
  const saveDevicePrefs = async (patch = {}) => {
    const body = {
      id: me ? me.id : null, lang, money: moneyView, theme, sideHidden, hideDeviceBanner,
      favKeys, seenVersion, cashTable: cashTableRef.current, ...patch,
    };
    try { await store.set(DEVICE_KEY, JSON.stringify(body), false); } catch (e) { /* device only */ }
  };
  const applyCashTable = (value) => {
    const next = sanitizeCashTablePrefs(typeof value === "function" ? value(cashTableRef.current) : value);
    cashTableRef.current = next;
    setCashTable(next);
    saveDevicePrefs({ cashTable: next });
  };
  const moveCashColumn = (source, target, after = false) => {
    if (!CASH_COLUMN_KEYS.includes(source) || !CASH_COLUMN_KEYS.includes(target) || source === target) return;
    applyCashTable((prev) => {
      const order = prev.order.filter((key) => key !== source);
      const targetIndex = order.indexOf(target);
      order.splice(targetIndex + (after ? 1 : 0), 0, source);
      return { ...prev, order };
    });
  };
  const resizeCashColumn = (key, width) => {
    applyCashTable((prev) => ({ ...prev, widths: { ...prev.widths, [key]: width } }));
  };
  const startCashResize = (e, key) => {
    const col = CASH_COLUMNS.find((item) => item.key === key);
    if (!col) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = cashTableRef.current.widths[key];
    let latest = startWidth;
    const direction = dir === "rtl" ? -1 : 1;
    const onMove = (event) => {
      latest = Math.min(col.max, Math.max(col.min, Math.round(startWidth + ((event.clientX - startX) * direction))));
      cashTableRef.current = sanitizeCashTablePrefs({
        ...cashTableRef.current,
        widths: { ...cashTableRef.current.widths, [key]: latest },
      });
      setCashTable(cashTableRef.current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizeCashColumn(key, latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const pickMoneyView = async (v) => {
    MONEY.view = v;
    setMoneyView(v);
    await saveDevicePrefs({ money: v });
  };
  const pickTheme = async (v) => {
    setTheme(v);
    applyThemeColors(v);
    await saveDevicePrefs({ theme: v });
  };
  const cycleTheme = () => pickTheme(theme === "light" ? "dark" : "light");
  const toggleSidebar = async () => {
    setSideHidden((h) => {
      const next = !h;
      saveDevicePrefs({ sideHidden: next });
      return next;
    });
  };
  const toggleFav = useCallback((key) => {
    setFavKeys((prev) => {
      const has = prev.includes(key);
      const next = has ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 8);
      saveDevicePrefs({ favKeys: next });
      return next;
    });
  }, [lang, moneyView, theme, sideHidden, hideDeviceBanner, me]);

  const commit = async (newEntries = [], patch = null, profile = null) => {
    const author = profile || me;
    const now = iso(Date.now());
    const stamped = newEntries.map((e, i) => ({
      id: e.id || `${Date.now().toString(36)}-${i}-${author?.id || "x"}`,
      at: now, ...e,
      loggedAt: e.loggedAt || now,
      byId: author?.id || null,
      byName: author ? author.name : "—",
    }));
    const { replace, ...patchRest } = patch || {};
    setBusy(true);
    setData((prev) => {
      const base = prev || emptyFarm();
      return { ...base, ...patchRest, entries: [...stamped, ...(base.entries || [])] };
    });
    try {
      const base = await readSharedFarm(dataRef.current || emptyFarm());
      const merged = { ...base, ...patchRest,
        profiles: replace?.profiles ? (patchRest.profiles || []) : (patchRest.profiles ? mergeById(base.profiles, patchRest.profiles) : base.profiles),
        animals: replace?.animals ? (patchRest.animals || []) : (patchRest.animals ? mergeById(base.animals, patchRest.animals) : base.animals),
        workers: replace?.workers ? (patchRest.workers || []) : (patchRest.workers ? mergeById(base.workers, patchRest.workers) : base.workers),
        customers: replace?.customers ? (patchRest.customers || []) : (patchRest.customers ? mergeById(base.customers, patchRest.customers) : base.customers),
        suppliers: replace?.suppliers ? (patchRest.suppliers || []) : (patchRest.suppliers ? mergeById(base.suppliers, patchRest.suppliers) : base.suppliers),
        obligations: replace?.obligations ? (patchRest.obligations || []) : (patchRest.obligations ? mergeById(base.obligations, patchRest.obligations) : base.obligations),
        entries: trimEntries([...stamped, ...(base.entries || [])]) };
      const payload = JSON.stringify(merged);
      if (payload.length > 4600000) { setFailed({ entries: newEntries, patch, profile: author, reason: "size" }); return false; }
      await store.set(SHARED_KEY, payload, true);
      setData(merged); setFailed(null); if (newEntries.length) ping(t("saved"));
      return true;
    } catch (e) { setFailed({ entries: newEntries, patch, profile: author }); return false; }
    finally { setBusy(false); }
  };
  const retry = async () => { const f = failed; if (!f) return; setFailed(null); await commit(f.entries, f.patch, f.profile); };

  const deleteEntry = async (id) => {
    await rewriteEntries((rows) => purgeRelatedEntries(rows, id), t("deleted"));
  };

  /* Entries are normally append-only; this is the one path that edits one in
     place, used to detach a receipt without losing the expense itself. */
  const updateEntry = async (id, patch) => {
    setBusy(true);
    const apply = (list) => (list || []).map((e) => (e.id === id ? { ...e, ...patch } : e));
    setData((prev) => ({ ...(prev || emptyFarm()), entries: apply((prev && prev.entries) || []) }));
    try {
      const base = await readSharedFarm(dataRef.current || emptyFarm());
      const merged = { ...base, entries: apply(base.entries) };
      await store.set(SHARED_KEY, JSON.stringify(merged), true);
      setData(merged); ping(t("saved"));
    } catch (e) { setFailed({ entries: [], patch: null, profile: me }); }
    finally { setBusy(false); }
  };

  const chooseProfile = async (p) => {
    setMe(p);
    try { await saveDevicePrefs({ id: p.id }); } catch (e) { /* device only */ }
  };
  const resetProfilePass = async (profile, pinHash, salt) => {
    const np = { ...profile, pin: pinHash, salt };
    const list = ((data && data.profiles) || []).map((p) => (p.id === profile.id ? np : p));
    const ok = await commit([{ type: "profileSecurity", name: profile.name, action: "reset" }], { profiles: list }, np);
    if (!ok) throw new Error("reset");
    ping(t("resetPassOk"));
    await chooseProfile(np);
  };
  const createProfile = async (name, role, emoji, pin, salt, farmPatch = null) => {
    const list = (data && data.profiles) || [];
    const p = { id: uid(), name, role, emoji, pin, salt, color: AVATAR_COLORS[list.length % AVATAR_COLORS.length], at: iso(Date.now()) };
    setMe(p);
    try { await chooseProfile(p); } catch (e) { /* ignore */ }
    const patch = { profiles: [...list, p] };
    if (farmPatch) patch.settings = { ...(data.settings || {}), ...farmPatch };
    try {
      await commit([{ type: "profile", name }, ...(farmPatch ? [{ type: "setting", field: "farmName", value: farmPatch.farmName }] : [])], patch, p);
      if (farmPatch) setDraftS((d) => ({ ...(d || data.settings || {}), ...farmPatch }));
    } catch (e) { /* banner */ }
  };
  const saveFarmSetup = async (farmPatch) => {
    const next = { ...(data.settings || {}), ...farmPatch };
    setDraftS(next);
    await commit([{ type: "setting", field: "farmName", value: farmPatch.farmName }], { settings: next });
  };

  /* ------------------------------ derived ------------------------------ */
  const S = (data && data.settings) || { rate: 0, milkPrice: 0, eggPrice: 0, wage: 0 };
  const milkUnit = "kg";
  const animals = (data && data.animals) || [];
  const workers = (data && data.workers) || [];
  const obligations = (data && data.obligations) || [];
  const customers = (data && data.customers) || [];
  const suppliers = (data && data.suppliers) || [];
  const activeCustomers = useMemo(() => customers.filter((c) => !c.archived), [customers]);
  const archivedCustomers = useMemo(() => customers.filter((c) => c.archived), [customers]);
  const activeSuppliers = useMemo(() => suppliers.filter((s) => !s.archived), [suppliers]);
  const entries = (data && data.entries) || [];
  const D = draftS || S;
  const dirty = JSON.stringify(D) !== JSON.stringify(S);
  const speciesPresent = SP_KEYS.filter((k) => animals.some((a) => a.species === k));
  const milkAnimals = animals.filter((a) => producesMilk(a) && a.status !== "dry");
  const eggFlocks = animals.filter(producesEggs);

  const days = useMemo(() => {
    if (range === "today") return 1; if (range === "week") return 7; if (range === "month") return 30;
    if (from && to) return Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1);
    return 1;
  }, [range, from, to]);
  const inRange = useCallback((e) => {
    if (range === "custom" && from && to) { const k = dayKey(e.at); return k >= from && k <= to; }
    const c = new Date(); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() - (days - 1));
    return new Date(e.at) >= c;
  }, [range, from, to, days]);
  const scoped = useMemo(() => entries.filter(inRange), [entries, inRange]);
  const prevScoped = useMemo(() => {
    let start;
    if (range === "custom" && from && to) start = new Date(from);
    else { start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1)); }
    const ps = new Date(start.getTime() - days * 864e5);
    return entries.filter((e) => { const d = new Date(e.at); return d >= ps && d < start; });
  }, [entries, range, from, to, days]);

  const ledger = useMemo(() => buildLedger(entries, customers), [entries, customers]);
  const supplierLedger = useMemo(() => buildSupplierLedger(entries, suppliers), [entries, suppliers]);
  const paidExpenseEntries = useMemo(() => {
    const billOf = supplierLedger.byBill || {};
    const direct = entries.flatMap((e) => {
      if (e.type === "med" && (e.cost || 0) > 0) return [e];
      if (e.type !== "expense" || e.supplierId) return [];
      if (e.origin === "payment_reimbursement" || (isDeductionReimbursement(e) && e.type === "expense")) {
        const amt = fromCents(deductionCents(e) || toCents(e.amount));
        return [{ ...e, amount: amt, paidAmount: amt, payStatus: "paid",
          sourceExpenseId: e.id, paidSource: "expense" }];
      }
      if (isCustomerPaidExpense(e)) {
        return [{ ...e, amount: fromCents(toCents(e.amount)), paidAmount: fromCents(toCents(e.amount)),
          payStatus: "paid", sourceExpenseId: e.id, paidSource: "customerReimburse" }];
      }
      const paid = expenseCounted(e);
      return paid > 0 ? [{ ...e, amount: paid, paidAmount: paid, payStatus: "paid",
        sourceExpenseId: e.id, paidSource: "expense" }] : [];
    });
    const supplierPays = (supplierLedger.allPays || supplierLedger.pays || []).flatMap((p) => {
      if (!(p.amount > 0)) return [];
      const bill = p.expenseId ? billOf[p.expenseId] : null;
      const supplier = suppliers.find((s) => s.id === p.supplierId);
      return [{
        ...p, type: "expense", category: bill?.category || "vendorPay",
        amount: p.amount, paidAmount: p.amount, payStatus: "paid",
        vendor: p.vendor || supplier?.name || bill?.vendor || "",
        note: p.note || bill?.note || "", receipt: bill?.receipt || "",
        sourceExpenseId: bill?.id || p.expenseId || null, sourcePaymentId: p.id,
        paidSource: "supplierPay",
      }];
    });
    return [...direct, ...supplierPays];
  }, [entries, supplierLedger, suppliers]);
  const scopedPaidExpenses = useMemo(() => paidExpenseEntries.filter(inRange), [paidExpenseEntries, inRange]);
  const prevPaidExpenses = useMemo(() => {
    let start;
    if (range === "custom" && from && to) start = new Date(from);
    else { start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1)); }
    const ps = new Date(start.getTime() - days * 864e5);
    return paidExpenseEntries.filter((e) => { const d = new Date(e.at); return d >= ps && d < start; });
  }, [paidExpenseEntries, range, from, to, days]);
  const financialScoped = useMemo(() => [
    ...scoped.filter((e) => e.type !== "expense" && e.type !== "supplierPay" && e.type !== "med"),
    ...scopedPaidExpenses.filter((e) => e.paidSource !== "customerReimburse"),
  ], [scoped, scopedPaidExpenses]);
  const prevFinancialScoped = useMemo(() => [
    ...prevScoped.filter((e) => e.type !== "expense" && e.type !== "supplierPay" && e.type !== "med"),
    ...prevPaidExpenses.filter((e) => e.paidSource !== "customerReimburse"),
  ], [prevScoped, prevPaidExpenses]);
  const supplierDash = useMemo(() => {
    const month = dayKey(Date.now()).slice(0, 7);
    const activeIds = new Set(activeSuppliers.map((s) => s.id));
    let owed = 0, overdue = 0, paidMonth = 0;
    Object.entries(supplierLedger.bySupplier || {}).forEach(([id, row]) => {
      if (!activeIds.has(id)) return;
      owed = fromCents(toCents(owed) + toCents(row.due));
      overdue = fromCents(toCents(overdue) + toCents(row.overdueDue || 0));
    });
    (supplierLedger.pays || []).forEach((p) => {
      if (!activeIds.has(p.supplierId)) return;
      if (dayKey(p.at).slice(0, 7) === month) paidMonth = fromCents(toCents(paidMonth) + toCents(p.amount));
    });
    return { owed, overdue, paidMonth };
  }, [supplierLedger, activeSuppliers]);
  const outstanding = useMemo(() => activeCustomers.reduce((a, c) => a + ((ledger.byCustomer[c.id] || {}).due || 0), 0), [activeCustomers, ledger]);
  const scopedSales = useMemo(() => ledger.list.filter(inRange).map((iv) => ({ ...iv,
    customerName: (customerNameById(customers, iv.customerId, t)) })), [ledger, inRange, customers, t]);
  const sums = useMemo(() => computeSums(financialScoped, S, workers, days), [financialScoped, S, workers, days]);
  const prevSums = useMemo(() => computeSums(prevFinancialScoped, S, workers, days), [prevFinancialScoped, S, workers, days]);

  const periodBounds = (kind, fromV, toV) => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (kind === "today") {
      const dk = dayKey(Date.now());
      return { from: dk, to: dk, days: 1 };
    }
    if (kind === "yesterday") {
      const yest = new Date(); yest.setHours(0, 0, 0, 0); yest.setDate(yest.getDate() - 1);
      const dk = dayKey(yest);
      return { from: dk, to: dk, days: 1 };
    }
    if (kind === "thisWeek" || kind === "week") {
      const c = new Date(); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() - 6);
      return { from: dayKey(c), to: dayKey(Date.now()), days: 7 };
    }
    if (kind === "lastMonth") {
      const fromD = new Date(y, m - 1, 1), toD = new Date(y, m, 0);
      return { from: dayKey(fromD), to: dayKey(toD), days: toD.getDate() };
    }
    if (kind === "custom" && fromV && toV) {
      return { from: fromV, to: toV, days: Math.max(1, Math.round((new Date(toV) - new Date(fromV)) / 864e5) + 1) };
    }
    const fromD = new Date(y, m, 1);
    return { from: dayKey(fromD), to: dayKey(Date.now()), days: Math.max(1, now.getDate()) };
  };
  const expBounds = useMemo(() => periodBounds(expRange, expFrom, expTo), [expRange, expFrom, expTo]);
  const cashBounds = useMemo(() => periodBounds(cashRange, cashFrom, cashTo), [cashRange, cashFrom, cashTo]);
  const cashBox = useMemo(() => buildCashBox(entries, {
      customers, suppliers, lang, t, custom: S.categories, from: cashBounds.from, to: cashBounds.to,
    }), [entries, customers, suppliers, lang, t, S.categories, cashBounds]);
  const cashView = useMemo(() => {
    const q = cashQ.trim().toLowerCase();
    const rows = cashBox.rows.filter((r) => {
      if (cashDir === "in" && !(r.debit > 0)) return false;
      if (cashDir === "out" && !(r.credit > 0)) return false;
      if (!q) return true;
      const statement = (r.parts || []).map((p) => p.text).join("");
      return `${r.day} ${r.ref} ${statement} ${r.debit || ""} ${r.credit || ""}`.toLowerCase().includes(q);
    });
    const totalIn = +rows.filter((r) => !r.nonCash).reduce((a, r) => a + r.debit, 0).toFixed(2);
    const totalOut = +rows.filter((r) => !r.nonCash).reduce((a, r) => a + r.credit, 0).toFixed(2);
    return { rows, totalIn, totalOut, filtered: cashDir !== "all" || !!q };
  }, [cashBox, cashDir, cashQ]);
  const cashFlow = useMemo(() => {
    const groups = {};
    cashBox.rows.forEach((r) => {
      if (r.nonCash) return;
      const e = r.source || {};
      let key;
      if (r.dir === "in") key = t("cashCustomerReceipts");
      else if (e.type === "supplierPay") {
        const linked = e.expenseId && entries.find((x) => x.id === e.expenseId && x.type === "expense");
        key = linked ? catLabel(linked.category, lang, S.categories) : t("supplierPays");
      } else if (e.type === "med") key = t("medicine");
      else key = catLabel(e.category || "other", lang, S.categories) || t("cashOtherOut");
      const id = `${r.dir}:${key}`;
      if (!groups[id]) groups[id] = { id, label: key, dir: r.dir, amount: 0, count: 0 };
      groups[id].amount += r.debit || r.credit;
      groups[id].count += 1;
    });
    return Object.values(groups).map((g) => ({ ...g, amount: +g.amount.toFixed(2) }))
      .sort((a, b) => (a.dir === b.dir ? b.amount - a.amount : a.dir === "in" ? -1 : 1));
  }, [cashBox, entries, lang, t, S.categories]);

  const expScoped = useMemo(() => paidExpenseEntries.filter((e) => {
    const k = dayKey(e.at);
    return k >= expBounds.from && k <= expBounds.to;
  }), [paidExpenseEntries, expBounds]);

  const expPrevScoped = useMemo(() => {
    const start = new Date(expBounds.from); start.setHours(0, 0, 0, 0);
    const ps = new Date(start.getTime() - expBounds.days * 864e5);
    const pe = new Date(start.getTime() - 864e5);
    return paidExpenseEntries.filter((e) => {
      const d = new Date(e.at);
      return d >= ps && d <= pe;
    });
  }, [paidExpenseEntries, expBounds]);

  const expMoneySums = useMemo(() => computeSums(expScoped, S, workers, expBounds.days, false), [expScoped, S, workers, expBounds]);
  const expPrevMoney = useMemo(() => computeSums(expPrevScoped, S, workers, expBounds.days, false), [expPrevScoped, S, workers, expBounds]);
  const expCatOpts = useMemo(() => {
    const seen = new Map();
    expScoped.forEach((e) => {
      const k = e.type === "med" ? "medicine" : (e.category || "other");
      if (!seen.has(k)) seen.set(k, { key: k, icon: catIcon(k, S.categories), label: catLabel(k, lang, S.categories) });
    });
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, lang === "ar" ? "ar" : "en"));
  }, [expScoped, lang, S.categories]);

  const billsDueList = useMemo(() => obligations.filter((o) => o.active && obligationAlert(o, lang, t)), [obligations, lang, t]);
  const directOpenExpenses = useMemo(() => entries
    .filter((e) => e.type === "expense" && !e.supplierId && !isCustomerPaidExpense(e))
    .map((e) => {
      const due = fromCents(Math.max(0, toCents(e.amount) - toCents(expenseCounted(e))));
      return { ...e, due };
    })
    .filter((e) => e.due > 0.009)
    .sort((a, b) => parseWhen(a.dueDate || a.at) - parseWhen(b.dueDate || b.at) || String(a.id || "").localeCompare(String(b.id || ""))), [entries]);
  const directDueList = useMemo(() => directOpenExpenses.filter((e) => {
    const dueAt = new Date(e.dueDate || e.at);
    return Math.ceil((dueAt - Date.now()) / 864e5) <= 7;
  }), [directOpenExpenses]);

  const todayProd = (a) => {
    const k = dayKey(Date.now());
    if (producesEggs(a)) { const e = entries.find((x) => x.type === "eggs" && x.animalId === a.id && dayKey(x.at) === k); return e ? e.count : 0; }
    const am = entries.find((x) => x.type === "milk" && x.animalId === a.id && x.session === "am" && dayKey(x.at) === k);
    const pm = entries.find((x) => x.type === "milk" && x.animalId === a.id && x.session === "pm" && dayKey(x.at) === k);
    return (am ? am.liters : 0) + (pm ? pm.liters : 0);
  };
  const lastFor = (a) => (entries || []).filter((x) => x.animalId === a.id && ["milk", "eggs"].includes(x.type))
    .sort((x, y) => cmpTx(x, y, "newest"))[0];
  const series = useMemo(() => {
    const map = {};
    const mk = milkTotals(scoped), eg = prodTotals(scoped, "eggs");
    Object.entries(mk.byDay).forEach(([k, v]) => { map[k] = (map[k] || 0) + v; });
    Object.entries(eg.byDay).forEach(([k, v]) => { map[k] = (map[k] || 0) + v; });
    let start;
    if (range === "custom" && from && to) start = new Date(from);
    else { start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1)); }
    const arr = [];
    for (let i = 0; i < days; i++) { const d = new Date(start.getTime() + i * 864e5);
      arr.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: map[dayKey(d)] || 0 }); }
    if (arr.length > 14) { const size = Math.ceil(arr.length / 10), out = [];
      for (let i = 0; i < arr.length; i += size) { const ch = arr.slice(i, i + size);
        out.push({ label: ch[0].label, value: ch.reduce((a, b) => a + b.value, 0) }); } return out; }
    return arr;
  }, [scoped, range, from, to, days]);

  const summaryLines = useMemo(() => smartSummary({ lang, t, sums, prev: prevSums, days, animals, workers, scoped, S, outstanding, customers, ledger }),
    [lang, moneyView, sums, prevSums, days, animals, workers, scoped, S, outstanding, customers, ledger]);
  const periodLabel = range === "custom" && from && to ? `${dmy(from)} → ${dmy(to)}` : t(range);

  const sortedCustomers = useMemo(() => {
    const idx = new Map(customers.map((c, i) => [c.id, i]));
    const prodLbl = (c) => {
      const pr = PRODUCTS.find((x) => x[0] === (c.product || "milk")) || PROD_MILK;
      return lang === "ar" ? pr[2] : pr[3];
    };
    const needle = (custQ || "").trim().toLowerCase();
    const list = [...activeCustomers].filter((c) => {
      if (!needle) return true;
      return `${customerLabel(c, t)} ${c.name || ""} ${c.phone || ""} ${accNo(customers, c.id)}`.toLowerCase().includes(needle);
    });
    const cmpStr = (a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en", { sensitivity: "base" });
    const nm = (c) => customerLabel(c, t);
    switch (custSort) {
      case "nameDesc": return list.sort((a, b) => cmpStr(nm(b), nm(a)));
      case "account": return list.sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
      case "product": return list.sort((a, b) => cmpStr(prodLbl(a), prodLbl(b)) || cmpStr(nm(a), nm(b)));
      case "newest": return list.sort((a, b) => cmpTx(a, b, "newest"));
      case "oldest": return list.sort((a, b) => cmpTx(a, b, "oldest"));
      default: return list.sort((a, b) => cmpStr(nm(a), nm(b)));
    }
  }, [activeCustomers, customers, custSort, custQ, lang, t]);

  const custSortOpts = [["nameAsc", t("sortNameAsc")], ["nameDesc", t("sortNameDesc")], ["account", t("sortAccount")],
    ["product", t("sortProduct")], ["newest", t("sortNewest")], ["oldest", t("sortOldest")]];

  const rateLog = entries.filter((e) => e.type === "setting" && e.field === "rate");
  const lastRate = rateLog[0];
  const rateAgeDays = lastRate ? Math.floor((Date.now() - new Date(lastRate.at)) / 864e5) : null;
  const rateStale = S.rate > 0 && (rateAgeDays === null || rateAgeDays >= 3);
  const doPrint = (d = null) => { setDoc(d); setPrinting(true); };
  useEffect(() => {
    if (!printing) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) window.print();
      setTimeout(() => { if (alive) { setPrinting(false); setDoc(null); } }, 700);
    }, 320);
    return () => { alive = false; clearTimeout(timer); };
  }, [printing, doc]);
  const exportArgs = () => ({ lang, t, sums, S, days, period: periodLabel, me, animals, workers, customers,
    scoped: financialScoped, scopedSales, ledger, outstanding, summaryLines });
  const doAccountExcel = (c) => {
    const rows = ledger.list.filter((x) => x.customerId === c.id);
    const pays = entries.filter((e) => e.type === "payment" && e.customerId === c.id);
    try { ping(`${t("saved")} \u00b7 .${exportAccount({ customer: c, no: accNo(customers, c.id), rows, pays, lang, t, S })}`); }
    catch (e) { ping(L(lang, "\u062a\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0644\u0641.", "Could not build the file.")); }
  };
  const exportCustomerBackup = (c) => {
    const rows = ledger.list.filter((x) => x.customerId === c.id);
    const pays = entries.filter((e) => e.type === "payment" && e.customerId === c.id);
    const payload = { customer: c, accountNo: accNo(customers, c.id), summary: ledger.byCustomer[c.id] || {},
      sales: rows, payments: pays, exportedAt: iso(Date.now()), by: me?.name || "—" };
    downloadBlob(JSON.stringify(payload, null, 2), `Mazraati-${accNo(customers, c.id)}-${dayKey(Date.now())}.json`, "application/json");
    ping(t("saved"));
  };
  const archiveCustomer = (c) => {
    if (isWalkInCustomer(c)) return;
    commit([{ type: "customerArchive", customerId: c.id, name: c.name }], {
      customers: customers.map((x) => (x.id === c.id ? { ...x, archived: true, archivedAt: iso(Date.now()), archivedBy: me.name } : x)),
    });
    setSheet(null);
    closeAccount(c.id);
    ping(t("accountArchived"));
  };
  const deleteCustomer = (c) => {
    if (isWalkInCustomer(c)) return;
    commit([{ type: "customerDelete", customerId: c.id, name: c.name }], {
      customers: customers.filter((x) => x.id !== c.id),
      replace: { customers: true },
    });
    setSheet(null);
    closeAccount(c.id);
    ping(t("accountDeleted"));
  };
  const restoreCustomer = (c) => {
    commit([], { customers: customers.map((x) => (x.id === c.id ? { ...x, archived: false, archivedAt: null, archivedBy: null } : x)) });
    ping(t("accountRestored"));
  };
  const doExcel = () => { try { ping(`${t("saved")} · .${exportExcel(exportArgs())}`); } catch (e) { ping(L(lang, "تعذّر إنشاء الملف.", "Could not build the file.")); } };
  const doBackup = (kind) => {
    const n = `Mazraati-${dayKey(Date.now())}`;
    try {
      if (kind === "json") { downloadBlob(JSON.stringify(data, null, 2), `${n}-backup.json`, "application/json"); ping(t("saved")); return; }
      if (kind === "csv") { downloadBlob(backupCSV(data, t, lang), `${n}.csv`, "text/csv;charset=utf-8"); ping(t("saved")); return; }
      if (kind === "pdf") { setReport("summary"); setRoute("reports"); setSheet({ k: "reportPreview" }); return; }
      const all = computeSums(entries, S, workers, Math.max(1, days));
      ping(`${t("saved")} · .${exportExcel({ ...exportArgs(), sums: all, scoped: entries, scopedSales: ledger.list, period: t("all") })}`);
    } catch (e) { ping(L(lang, "تعذّر إنشاء الملف.", "Could not build the file.")); }
  };
  const onRestoreFile = (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const parsed = JSON.parse(String(r.result));
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error("shape");
      setSheet({ k: "restore", payload: migrate(parsed) }); } catch (e) { ping(t("restoreBad")); } };
    r.onerror = () => ping(t("restoreBad"));
    r.readAsText(f);
  };
  const applyWalkthrough = async () => {
    const live = dataRef.current || data || emptyFarm();
    savePreWalkthrough(live);
    setWalkthroughHold(true);
    const farm = buildWalkthroughFarm({
      keep: { me, profiles: (live.profiles && live.profiles.length) ? live.profiles : (me ? [me] : []) },
      setupV: SETUP_VERSION,
    });
    setData(farm);
    setDraftS(farm.settings);
    setCashRange("month");
    setExpRange("month");
    setRange("month");
    setSheet(null);
    try {
      await store.set(SHARED_KEY, JSON.stringify(farm), false);
      ping(t("walkthroughOk"));
      setSheet({ k: "help", topic: "walkthrough" });
    } catch (e) { setFailed({ entries: [], patch: null, profile: me }); }
  };
  const exitWalkthrough = async () => {
    setWalkthroughHold(false);
    const backup = readPreWalkthrough();
    clearPreWalkthrough();
    setSheet(null);
    try {
      if (backup && typeof backup === "object") {
        const restored = migrate(backup);
        setData(restored);
        setDraftS(restored.settings);
        await store.set(SHARED_KEY, JSON.stringify(restored), false);
        ping(t("saved"));
        if (companySyncActive() || (cloud.on && cloud.url)) pull();
        return;
      }
      if (companySyncActive() || (cloud.on && cloud.url)) {
        await pull();
        ping(t("saved"));
        return;
      }
      const blank = emptyFarm();
      blank.profiles = me ? [me] : [];
      setData(blank);
      setDraftS(blank.settings);
      await store.set(SHARED_KEY, JSON.stringify(blank), false);
      ping(t("saved"));
    } catch (e) { setFailed({ entries: [], patch: null, profile: me }); }
  };
  const saveCloud = async (cfg) => {
    const next = { ...cfg, url: (cfg.url || "").trim(), token: (cfg.token || "").trim(), on: !!cfg.on && !!(cfg.url || "").trim() };
    setCloudCfg(next); cloud.url = next.url; cloud.token = next.token; cloud.on = next.on;
    try { await store.set(CLOUD_KEY, JSON.stringify(next), false); } catch (e) { /* device */ }
    if (next.on) pull();
  };
  const testCloud = async () => {
    setCloudMsg("…");
    if (!cloudCfg.url) return setCloudMsg("⚠️ " + t("cloudFail"));
    const saved = { url: cloud.url, token: cloud.token, on: cloud.on };
    cloud.url = cloudCfg.url; cloud.token = cloudCfg.token; cloud.on = true;
    try { await cloudGet(); setCloudMsg("✓ " + t("cloudOk")); }
    catch (e1) { try { await cloudSet(JSON.stringify(data)); setCloudMsg("✓ " + t("cloudOk")); }
      catch (e2) { setCloudMsg("⚠️ " + t("cloudFail") + " " + (e2.message || e1.message)); } }
    Object.assign(cloud, saved);
  };
  const copyCloudLink = async () => {
    if (!cloudCfg.url) return;
    try {
      await navigator.clipboard.writeText(cloudCfg.url);
      setCloudMsg("✓ " + t("cloudCopied"));
      ping(t("cloudCopied"));
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = cloudCfg.url; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        setCloudMsg("✓ " + t("cloudCopied"));
      } catch (e2) { setCloudMsg(cloudCfg.url); }
    }
  };
  const coRun = async (fn) => {
    if (coBusy) return;
    setCoBusy(true); setCoMsg(t("coBusy"));
    try {
      await fn();
      setCoMsg("✓ " + t("cloudOk"));
    } catch (e) {
      const code = e && (e.code || e.message) || "";
      setCoMsg("⚠️ " + t("coErr") + (code ? ` (${code})` : ""));
    } finally { setCoBusy(false); }
  };
  const onCoSignIn = () => coRun(async () => {
    const cred = await companySignIn(coEmail, coPass);
    setCoPass("");
    const s = await companyWaitBound(10000, cred && cred.uid);
    if (s.companyId) {
      try { applyRemoteFarm(await companyPullFarm()); } catch (e2) { /* keep local */ }
    }
  });
  const onCoSignOut = () => coRun(() => companySignOut());
  const onCoCreate = () => coRun(async () => {
    const r = await createCompany(coCompany || (data?.settings?.farmName) || "Farm", JSON.stringify(data || emptyFarm()), applyRemoteFarm);
    setCoInvite(r.inviteCode || "");
    ping(`${t("coInvite")}: ${r.inviteCode}`);
  });
  const onCoJoin = () => coRun(async () => {
    await joinCompany(coInvite, applyRemoteFarm);
    await pull();
  });
  const copyInvite = async () => {
    const code = coInvite || (co.company && co.company.inviteCode) || "";
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCoMsg("✓ " + t("cloudCopied")); }
    catch (e) { setCoMsg(code); }
  };

  /* Must stay above splash/profile early returns — hooks order is fixed. */
  const milkLogAll = useMemo(() => {
    const byId = {};
    (entries || []).forEach((e) => { if (e.id) byId[e.id] = e; });
    return effectiveMilkLots(entries)
      .filter((l) => (l.liters || 0) > 0.0001)
      .map((l) => {
        const src = byId[l.id] || {};
        return { ...l, unit: src.unit || l.unit || S.milkUnit, byName: l.byName || src.byName || "—" };
      });
  }, [entries, S.milkUnit]);

  const milkLogView = useMemo(() => {
    const f = milkLogFilt;
    const rows = groupMilkDayRows(milkLogAll).filter((r) => {
      if (f.sess === "am" && (r.am || 0) < 0.0001) return false;
      if (f.sess === "pm" && (r.pm || 0) < 0.0001) return false;
      if (f.from && r.day < f.from) return false;
      if (f.to && r.day > f.to) return false;
      return (r.total || 0) > 0.0001;
    }).slice().sort((a, b) => cmpBySort(a, b, f.sort, (x) => x.total, (x) => x.day));
    const totalQty = +rows.reduce((s, r) => s + (r.total || 0), 0).toFixed(2);
    const amQty = +rows.reduce((s, r) => s + (r.am || 0), 0).toFixed(2);
    const pmQty = +rows.reduce((s, r) => s + (r.pm || 0), 0).toFixed(2);
    return { rows, totalQty, amQty, pmQty, active: !!(f.from || f.to || f.sess !== "all") };
  }, [milkLogAll, milkLogFilt]);

  const milkUseLog = useMemo(() => {
    const f = milkLogFilt;
    const rows = (entries || []).filter((e) => e.type === "milkUse" && milkRecordLiters(e) > 0.0001)
      .filter((e) => {
        const d = dayKey(e.at);
        if (f.from && d < f.from) return false;
        if (f.to && d > f.to) return false;
        return true;
      })
      .slice().sort((a, b) => cmpTx(a, b, (f.sort || "newest") === "oldest" ? "oldest" : "newest"));
    const totalQty = +rows.reduce((s, r) => s + milkRecordLiters(r), 0).toFixed(2);
    return { rows, totalQty };
  }, [entries, milkLogFilt]);

  useEffect(() => {
    if (me || !data || !co.companyId) return;
    const rows = data.profiles || [];
    if (rows.length === 1 && !rows[0].pin) chooseProfile(rows[0]);
  }, [me, data, co.companyId]);

  if (!data) return <div className={`splash theme-${theme}`}><style key={theme}>{makeCss()}</style>
    <div className="splash-inner">
      <div className="splash-logo">{S.logo ? <img src={S.logo} alt="" /> : <AppMark size={88} light word lang={lang} />}</div>
      <div className="splash-brand">{S.farmName || t("brand")}</div>
      <div className="splash-spin" aria-hidden="true" />
      <div className="splash-msg">{t("loading")}</div>
    </div></div>;
  if (!me) {
    const hasPeople = ((data.profiles || []).length > 0);
    const showCloud = !co.companyId && !cloudSkip && (isFirebaseReady() || !hasPeople);
    if (showCloud) {
      return <CloudGate lang={lang} setLang={setLang} t={t} data={data}
        farmName={(data.settings && data.settings.farmName) || ""}
        logo={(data.settings && data.settings.logo) || ""}
        onFarm={applyRemoteFarm}
        onWalkthrough={async () => { setCloudSkip(true); await applyWalkthrough(); }}
        onSkip={() => setCloudSkip(true)}
        onEnter={(profile, farmObj) => {
          if (farmObj) { setData(farmObj); setDraftS(farmObj.settings); }
          if (profile) chooseProfile(profile);
        }} />;
    }
    return <ProfileGate lang={lang} setLang={setLang} t={t} profiles={data.profiles || []} preId={preId}
      farmName={(data.settings && data.settings.farmName) || ""} logo={(data.settings && data.settings.logo) || ""}
      settings={data.settings || {}}
      clearPre={() => setPreId(null)} onPick={chooseProfile} onCreate={createProfile} onResetPass={resetProfilePass} />;
  }
  if (needsFarmSetup(S)) return <FarmSetupGate lang={lang} setLang={setLang} t={t} settings={S}
    onSave={saveFarmSetup} onWalkthrough={applyWalkthrough} />;

  const setup = { identity: !!(S.farmName || "").trim(), animals: animals.length > 0,
    prices: S.rate > 0 && (S.milkPrice > 0 || S.eggPrice > 0),
    customers: activeCustomers.some((c) => !isWalkInCustomer(c)) };
  const showSetup = !(setup.identity && setup.animals && setup.prices);

  const payBill = async (o) => {
    const cycle = o.nextDue || dayKey(Date.now());
    const lockKey = `${o.id}|${cycle}`;
    if (obligationPayLocks.current.has(lockKey)) return;
    obligationPayLocks.current.add(lockKey);
    setBusy(true);
    try {
      const base = await readSharedFarm(dataRef.current || emptyFarm());
      const live = (base.obligations || []).find((x) => x.id === o.id);
      const duplicate = (base.entries || []).some((e) =>
        e.type === "expense" && e.obligationId === o.id && e.obligationDue === cycle);
      /* A changed due date means another click/device already advanced this cycle. */
      if (duplicate || !live || live.nextDue !== cycle) {
        setData(base);
        ping(t("paymentAlreadyRecorded"));
        return;
      }
      const cat = live.type === "rent" ? "rent" : live.type === "bill" ? "vendorPay" : "other";
      const now = iso(Date.now());
      const nd = live.frequency === "once" ? live.nextDue : advanceDue(live.nextDue, live.frequency);
      const expense = {
        id: `obligation-${live.id}-${cycle}`, type: "expense", category: cat,
        amount: live.amount || 0, note: live.title, vendor: live.party || "",
        payStatus: "paid", paidAmount: live.amount || 0, dueDate: "",
        obligationId: live.id, obligationDue: cycle, group: expGroupOf(cat),
        at: dayStamp(dayKey(Date.now())), loggedAt: now, currency: "usd", rateUsed: S.rate, receipt: "",
        byId: me?.id || null, byName: me ? me.name : "—",
      };
      const audit = {
        id: uid(), type: "obligationEdit", title: live.title, obligationId: live.id,
        obligationDue: cycle, at: now, loggedAt: now,
        byId: me?.id || null, byName: me ? me.name : "—",
      };
      const obligationsNext = (base.obligations || []).map((x) => (x.id === live.id
        ? { ...x, nextDue: nd, active: live.frequency === "once" ? false : x.active } : x));
      const merged = { ...base, obligations: obligationsNext,
        entries: trimEntries([expense, audit, ...(base.entries || [])]) };
      await store.set(SHARED_KEY, JSON.stringify(merged), true);
      setData(merged);
      setFailed(null);
      ping(t("saved"));
    } catch (e) {
      setFailed({ entries: [], patch: null, profile: me });
    } finally {
      obligationPayLocks.current.delete(lockKey);
      setBusy(false);
    }
  };

  const activeObligations = obligations.filter((o) => o.active);
  const billPanelCount = activeObligations.length + directOpenExpenses.length;
  const urgentBillsCount = billsDueList.length + directDueList.length;
  const urgentBillsTotal = fromCents(billsDueList.reduce((sum, row) => sum + toCents(row.amount), 0)
    + directDueList.reduce((sum, row) => sum + toCents(row.due), 0));
  const expTopCategory = Object.entries(expMoneySums.byCategory || {}).sort((a, b) => b[1] - a[1])[0];
  const expPeriodLabel = expRange === "today" ? t("today") : expRange === "yesterday" ? t("yesterday")
    : expRange === "week" ? t("thisWeek") : expRange === "lastMonth" ? t("lastMonth")
      : expRange === "custom" ? `${dmy(expBounds.from)} — ${dmy(expBounds.to)}` : t("thisMonth");
  const DeskExpenses = (
    <div style={{ display: "grid", gap: 14 }}>
      <SearchFilterBar t={t} q={expQ} onQ={setExpQ} qPlaceholder={t("searchExpenses")}
        extra={<button type="button" style={{ ...primaryBtn, width: "auto", padding: "10px 16px", fontSize: 14, minHeight: 44 }}
          onClick={() => setSheet({ k: "expense" })}>＋ {t("logExpense")}</button>}
        activeCount={(expRange !== "today" ? 1 : 0) + (expCat !== "all" ? 1 : 0) + (expSource !== "all" ? 1 : 0) + ((expSort || "newest") !== "newest" ? 1 : 0)}
        onReset={() => { setExpRange("today"); setExpFrom(""); setExpTo(""); setExpCat("all"); setExpSource("all"); setExpSort("newest"); }}
        chips={[
          expRange !== "today" ? { key: "range", label: expPeriodLabel, onRemove: () => { setExpRange("today"); setExpFrom(""); setExpTo(""); } } : null,
          expCat !== "all" ? { key: "cat", label: (expCatOpts.find((o) => o.key === expCat) || {}).label || expCat,
            onRemove: () => setExpCat("all") } : null,
          expSource !== "all" ? { key: "src", label: expSource === "reimburse" ? t("expSourceReimburse") : t("expSourceCash"),
            onRemove: () => setExpSource("all") } : null,
          (expSort || "newest") !== "newest" ? { key: "sort", label: sortChipLabel(t, expSort), onRemove: () => setExpSort("newest") } : null,
        ].filter(Boolean)}>
        <FilterGroup label={t("customRange")}>
          {[["today", t("today")], ["yesterday", t("yesterday")], ["week", t("thisWeek")],
            ["month", t("thisMonth")], ["lastMonth", t("lastMonth")], ["custom", t("customRange")]].map(([k, lb]) => (
            <Chip key={k} active={expRange === k || (k === "month" && expRange === "thisMonth")} onClick={() => setExpRange(k)}>{lb}</Chip>))}
        </FilterGroup>
        {expRange === "custom" && <FilterGroup>
          <DatePick compact allowClear value={expFrom} onChange={setExpFrom} ariaLabel={t("fromDate")} />
          <DatePick compact allowClear value={expTo} onChange={setExpTo} ariaLabel={t("toDate")} />
        </FilterGroup>}
        {expCatOpts.length > 0 && <FilterGroup label={t("category")}>
          <select className="sf-select" value={expCat} aria-label={t("category")}
            onChange={(e) => setExpCat(e.target.value)}>
            <option value="all">{t("statusAll")}</option>
            {expCatOpts.map((o) => <option key={o.key} value={o.key}>{o.icon} {o.label}</option>)}
          </select>
        </FilterGroup>}
        <FilterGroup label={t("expSourceAll")}>
          <Chip active={expSource === "all"} onClick={() => setExpSource("all")}>{t("expSourceAll")}</Chip>
          <Chip active={expSource === "reimburse"} onClick={() => setExpSource("reimburse")}>{t("expSourceReimburse")}</Chip>
          <Chip active={expSource === "cash"} onClick={() => setExpSource("cash")}>{t("expSourceCash")}</Chip>
        </FilterGroup>
        <FilterGroup label={t("sortBy")}>
          <SortPair t={t} sort={expSort} onChange={setExpSort} />
        </FilterGroup>
      </SearchFilterBar>

      <DeskCard style={{ order: 1 }} pad={0} title={`✦ ${t("expenseOverview")}`}>
        <div className="adapt-grid" style={{ gap: 0 }}>
          <div className="hero-stat">
            <span>{t("moneySpentPeriod")}</span>
            <div style={{ marginTop: 6 }}><Money usd={expMoneySums.costs} rate={S.rate} lang={lang} size={27} /></div>
            <small>{expPeriodLabel}</small>
          </div>
          {[
            ["🤝", t("supplierOutstanding"), fmtC(supplierDash.owed, S.rate, lang), supplierDash.owed > 0 ? C.red : C.green],
            ["📅", t("billsDue"), nf(urgentBillsCount), urgentBillsCount ? C.amber : C.green],
            ["📊", t("topCategory"), expTopCategory ? catLabel(expTopCategory[0], lang, S.categories) : "—", C.field],
          ].map(([ic, lb, val, tone]) => <div key={lb} style={{ padding: "15px 16px", borderInlineStart: `1px solid ${C.line}`,
            display: "grid", alignContent: "center", minHeight: 82 }}>
            <div style={{ color: C.inkSoft, fontSize: 11.5, fontWeight: 700 }}>{ic} {lb}</div>
            <div style={{ color: tone, fontFamily: "var(--mono)", fontSize: 17, fontWeight: 800, marginTop: 7 }}>{val}</div>
          </div>)}
        </div>
        {urgentBillsCount > 0 && <button type="button" onClick={() => setExpBillsOpen(true)}
          style={{ width: "100%", border: "none", borderTop: `1px solid ${C.line}`, background: C.paper,
            color: C.ink, padding: "10px 16px", textAlign: "start", cursor: "pointer", fontFamily: "var(--body)",
            fontSize: 12.5, fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center", gap: 8,
            borderInlineStart: "4px solid #F59E0B" }}>
          <StatusPill status="due">{t("billsDue")}</StatusPill>
          {nf(urgentBillsCount)} · {fmtC(urgentBillsTotal, S.rate, lang)} <span style={{ marginInlineStart: "auto" }}>›</span>
        </button>}
      </DeskCard>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", order: 3 }}>
        <button type="button" className="dk-pill" onClick={() => setExpInsightsOpen((open) => !open)}>
          📊 {t(expInsightsOpen ? "hideInsights" : "showInsights")} {expInsightsOpen ? "▴" : "▾"}</button>
        <button type="button" className="dk-pill" onClick={() => setExpBillsOpen((open) => !open)}
          style={urgentBillsCount ? { borderColor: C.amber, color: "#7A5312" } : undefined}>
          📅 {t(expBillsOpen ? "hideDueBills" : "showDueBills")} · {billPanelCount} {expBillsOpen ? "▴" : "▾"}</button>
        <button type="button" className="dk-pill" onClick={() => setSheet({ k: "addObligation" })}>＋ {t("addObligation")}</button>
        <button type="button" className="dk-pill" style={{ marginInlineStart: "auto" }}
          onClick={() => { setCashDir("out"); setRoute("dashboard"); }}>💵 {t("cashBox")} ›</button>
      </div>

      <div style={{ display: "grid", gap: 14, alignItems: "start", order: 4 }}>
        {expInsightsOpen && <DeskCard title={`📊 ${t("spendBreakdown")}`} pad={14}
          right={<button type="button" className="dk-pill" onClick={() => setExpInsightsOpen(false)}>− {t("hideInsights")}</button>}>
          {Object.keys(expMoneySums.byCategory || {}).length === 0
            ? <div style={{ color: C.inkSoft, fontSize: 14 }}>{t("noExpensesYet")}</div>
            : <div style={{ display: "grid", gap: 10 }}>
              {Object.entries(expMoneySums.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                const prev = (expPrevMoney.byCategory || {})[k] || 0;
                const hot = prev > 0 && v > prev * 1.5;
                const pctBar = expMoneySums.costs > 0 ? Math.round((v / expMoneySums.costs) * 100) : 0;
                return <div key={k}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
                    <span>{catIcon(k, S.categories)} {catLabel(k, lang, S.categories)}
                      {hot && <span style={{ color: C.amber, marginInlineStart: 8, fontSize: 12 }}>⚠ {t("higherThanUsual")}</span>}</span>
                    <span style={{ fontFamily: "var(--mono)" }}>{fmtC(v, S.rate, lang)}</span>
                  </div>
                  <div style={{ height: 8, background: C.paper, borderRadius: 99, overflow: "hidden", border: `1px solid ${C.line}` }}>
                    <div style={{ width: `${pctBar}%`, height: "100%", background: catColor(k, S.categories), borderRadius: 99 }} />
                  </div>
                </div>;
              })}
            </div>}
        </DeskCard>}

        {expBillsOpen ? <DeskCard title={`📅 ${t("billsPanel")}`}
          right={<div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="dk-pill" onClick={() => setExpBillsOpen(false)}>− {t("hideDueBills")}</button>
            <button type="button" className="dk-pill" onClick={() => setSheet({ k: "addObligation" })}>＋ {t("addObligation")}</button>
          </div>}>
          {billPanelCount === 0
            ? <Empty icon="📋" title={t("noObligations")} sub={t("noObligationsSub")}
              cta={`＋ ${t("addObligation")}`} onCta={() => setSheet({ k: "addObligation" })} />
            : <div style={{ display: "grid", gap: 8 }}>
              {[...activeObligations].sort((a, b) => new Date(a.nextDue || 0) - new Date(b.nextDue || 0)).slice(0, 8).map((o) => {
                const typ = OBL_TYPES.find((x) => x[0] === o.type) || OBL_TYPES[1];
                const dLeft = o.nextDue ? Math.ceil((new Date(o.nextDue) - Date.now()) / 864e5) : null;
                const kind = dLeft !== null && dLeft < 0 ? "overdue" : dLeft !== null && dLeft <= 7 ? "due" : "active";
                const kindLb = kind === "overdue" ? t("overdue") : kind === "due" ? t("due") : t("statusClear");
                return <div key={o.id} className={statusRowClass(kind)} style={{ border: `1px solid ${C.line}`,
                  borderRadius: 8, padding: "10px 12px", background: C.card }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 18 }}>{typ[1]}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{o.title}</span>
                    <StatusPill status={kind}>{kindLb}</StatusPill>
                  </div>
                  <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 4 }}>
                    📅 {o.nextDue ? dmy(o.nextDue) : "—"}
                    {dLeft !== null && ` · ${dLeft < 0 ? `${t("overdueBy")} ${Math.abs(dLeft)}` : dLeft === 0 ? t("dueToday") : `${t("dueInDays")} ${dLeft}`}`}
                    {` · ${fmtC(o.amount || 0, S.rate, lang)}`}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button type="button" style={{ ...secondaryBtn, flex: 1, padding: "7px", fontSize: 12.5 }}
                      onClick={() => payBill(o)}>✓ {t("markBillPaid")}</button>
                    <button type="button" style={{ ...secondaryBtn, flex: 1, padding: "7px", fontSize: 12.5 }}
                      onClick={() => setSheet({ k: "editObligation", id: o.id })}>✏️</button>
                  </div>
                </div>;
              })}
              {directOpenExpenses.length > 0 && <>
                <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 700, marginTop: 4 }}>
                  💸 {t("openBills")}</div>
                {directOpenExpenses.slice(0, 8).map((e) => {
                  const dueAt = e.dueDate || dayKey(e.at);
                  const dLeft = Math.ceil((new Date(dueAt) - Date.now()) / 864e5);
                  const kind = dLeft < 0 ? "overdue" : dLeft <= 7 ? "due" : "unpaid";
                  return <div key={e.id} className={statusRowClass(kind)} style={{ border: `1px solid ${C.line}`,
                    borderRadius: 8, padding: "10px 12px", background: C.card }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 18 }}>{catIcon(e.category || "other", S.categories)}</span>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                        {catLabel(e.category || "other", lang, S.categories)}
                        {e.vendor ? <span style={{ display: "block", color: C.inkSoft, fontSize: 11.5 }}>{e.vendor}</span> : null}
                      </span>
                      <StatusPill status={kind}>{kind === "overdue" ? t("overdue") : t("remainder")}</StatusPill>
                    </div>
                    <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 4 }}>
                      📅 {dmy(dueAt)} · {fmtC(e.due, S.rate, lang)}
                    </div>
                    <button type="button" style={{ ...secondaryBtn, width: "100%", padding: "7px", fontSize: 12.5, marginTop: 8 }}
                      onClick={() => setSheet({ k: "editExpense", id: e.id })}>✏️ {t("edit")}</button>
                  </div>;
                })}
              </>}
            </div>}
        </DeskCard> : null}
      </div>

      <DeskCard style={{ order: 2 }} pad={0} title={`🧾 ${t("expenseRegister")}`}
        right={<StatusPill status="paid">{t("paidExpensesOnly")}</StatusPill>}>
        {(() => {
          const rows = [...expScoped].filter((e) => {
            const cat = e.type === "med" ? "medicine" : (e.category || "other");
            if (expCat !== "all" && cat !== expCat) return false;
            const isReimb = e.paidSource === "customerReimburse" || isCustomerPaidExpense(e)
              || e.origin === "customer_reimbursement";
            if (expSource === "reimburse" && !isReimb) return false;
            if (expSource === "cash" && isReimb) return false;
            if (!expQ.trim()) return true;
            const q = expQ.toLowerCase();
            const label = e.type === "med" ? t("medicine") : catLabel(e.category, lang, S.categories);
            return `${label} ${e.note || ""} ${e.vendor || ""} ${e.amount || e.cost || ""} ${e.supplier || ""}`.toLowerCase().includes(q);
          }).sort((a, b) => cmpBySort(a, b, expSort,
            (x) => x.type === "med" ? (x.cost || 0) : (x.amount || 0),
            (x) => x.type === "med" ? t("medicine") : catLabel(x.category, lang, S.categories)));
          if (rows.length === 0) return <div style={{ padding: 24 }}>
            <Empty icon="💸" title={t("noPaidExpenses")} sub={t("noPaidExpensesSub")}
              cta={`＋ ${t("logExpense")}`} onCta={() => setSheet({ k: "expense" })} /></div>;
          return <DataList
            cards={rows.map((e) => {
              const isMed = e.type === "med";
              const cat = isMed ? "medicine" : (e.category || "other");
              const amt = isMed ? (e.cost || 0) : (e.amount || 0);
              const openSource = isMed ? null : e.supplierId
                ? () => {
                  if (e.sourceExpenseId) setSheet({ k: "supplierBill", sid: e.supplierId, id: e.sourceExpenseId });
                  else { setRoute("suppliers"); openSupplier(e.supplierId); }
                }
                : () => setSheet({ k: "editExpense", id: e.sourceExpenseId || e.id });
              const receiptId = e.sourceExpenseId || e.id;
              return (
                <DataCard key={e.id} kind="paid"
                  status={<StatusPill status="paid">{e.paidSource === "customerReimburse" || isCustomerPaidExpense(e) ? t("paidByCustomer") : t("paidS")}</StatusPill>}
                  title={`${catIcon(cat, S.categories)} ${catLabel(cat, lang, S.categories)}`}
                  subtitle={`${dmy(e.at)} · ${e.vendor || e.supplier || "—"}`}
                  who={<WhoHint e={e} lang={lang} />}
                  meta={fmtC(amt, S.rate, lang)}
                  onClick={openSource || undefined}
                  actions={
                    <>
                      {e.receipt && <button type="button" className="dk-pill" title={t("viewReceipt")}
                        onClick={(ev) => { ev.stopPropagation(); setSheet({ k: "receipt", id: receiptId, back: null }); }}>📎</button>}
                      {openSource && <button type="button" className="dk-pill" onClick={(ev) => { ev.stopPropagation();
                        openSource(); }}>↗</button>}
                    </>
                  }
                />
              );
            })}
            table={
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <Th>{t("colDate")}</Th><Th>{t("category")}</Th><Th>{t("vendor")}</Th>
                <Th align="end">{t("amount")}</Th><Th>{t("colStatus")}</Th><Th>{t("colUser")}</Th><Th align="center">{t("actions")}</Th>
              </tr></thead>
              <tbody>
                {rows.map((e) => {
                  const isMed = e.type === "med";
                  const cat = isMed ? "medicine" : (e.category || "other");
                  const amt = isMed ? (e.cost || 0) : (e.amount || 0);
                  const openSource = isMed
                    ? () => setSheet({ k: "editMoney", id: e.id })
                    : e.supplierId
                    ? () => {
                      if (e.sourceExpenseId) setSheet({ k: "supplierBill", sid: e.supplierId, id: e.sourceExpenseId });
                      else { setRoute("suppliers"); openSupplier(e.supplierId); }
                    }
                    : () => setSheet({ k: "editExpense", id: e.sourceExpenseId || e.id });
                  const receiptId = e.sourceExpenseId || e.id;
                  return <tr key={e.id} className={statusRowClass("paid")} style={{ cursor: openSource ? "pointer" : "default" }}
                    onClick={() => openSource && openSource()}
                    onContextMenu={(ev) => openCtx(ev, [
                      openSource && { key: "edit", icon: "✏️", label: t("ctxOpen"), run: openSource },
                      e.receipt && { key: "rec", icon: "📎", label: t("ctxReceipt"), run: () => setSheet({ k: "receipt", id: receiptId, back: null }) },
                      { key: "del", icon: "🗑️", label: t("ctxDelete"), run: () => setSheet({ k: "confirmDeleteEntry",
                        id: isMed ? e.id : (e.sourceExpenseId || e.id) }) },
                    ].filter(Boolean))}>
                    <Td mono>{dmy(e.at)}</Td>
                    <Td><span style={{ color: catColor(cat, S.categories) }}>{catIcon(cat, S.categories)}</span> {catLabel(cat, lang, S.categories)}
                      {e.qty > 0 ? <span style={{ display: "block", fontSize: 12, color: C.field, fontWeight: 700 }}>
                        {e.feedType ? `${t(e.feedType)} · ` : ""}{expenseQtyLabel(e, t)}</span> : null}
                      {e.note ? <span style={{ display: "block", fontSize: 12, color: C.inkSoft }}>{e.note}</span> : null}</Td>
                    <Td tone={C.inkSoft}>{e.vendor || e.supplier || "—"}</Td>
                    <Td align="end" mono strong>{fmtC(amt, S.rate, lang)}</Td>
                    <Td><StatusPill status="paid">{e.paidSource === "customerReimburse" || isCustomerPaidExpense(e) ? t("paidByCustomer") : t("paidS")}</StatusPill></Td>
                    <Td align="center"><WhoHint e={e} lang={lang} /></Td>
                    <Td align="center">
                      <span style={{ display: "inline-flex", gap: 5 }}>
                        {e.receipt && <button type="button" className="dk-pill" title={t("viewReceipt")}
                          onClick={(ev) => { ev.stopPropagation(); setSheet({ k: "receipt", id: receiptId, back: null }); }}>📎</button>}
                        {openSource && <button type="button" className="dk-pill" onClick={(ev) => { ev.stopPropagation();
                          openSource(); }}>↗</button>}
                      </span>
                    </Td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
          />;
        })()}
      </DeskCard>
    </div>
  );

  const Settings = (
    <div className="dk-settings-inner">
      {dirty && <div className="set-savebar">
        <span>{t("setUnsaved")}</span>
        <button type="button" disabled={busy} style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 14, opacity: busy ? .6 : 1 }}
          onClick={() => commit(Object.keys(D).filter((k) => D[k] !== S[k]).map((k) => ({ type: "setting", field: k, value: D[k] })), { settings: D })}>✓ {t("save")}</button>
      </div>}

      <SetSection open={setOpen.farm} onToggle={() => toggleSet("farm")} icon="🏷️" title={t("setCatFarm")} tip={t("setTipFarm")}
        summary={D.farmName || t("setNotSet")} accent={!S.farmName ? C.tag : undefined}>
        <div className="set-grid-id">
          <label className="set-logo">
            {S.logo ? <img src={S.logo} alt="" /> : <span>🏷️</span>}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
              const f = e.target.files && e.target.files[0]; e.target.value = "";
              if (!f) return;
              try { const img = await compressImage(f, 320, 0.7);
                commit([{ type: "setting", field: "logo", value: 1 }], { settings: { ...S, logo: img } });
              } catch (err) { ping(t("restoreBad")); } }} />
          </label>
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div>
              <SetLabel>{t("farmName")}</SetLabel>
              <input value={D.farmName || ""} onChange={(e) => setDraftS({ ...D, farmName: e.target.value })}
                placeholder={lang === "ar" ? "مثال: مزارع الريف" : "e.g. Al Reif Farms"} style={{ ...inp, padding: "9px 11px", fontSize: 14.5 }} />
            </div>
            <div className="set-row2">
              <div>
                <SetLabel>{t("farmPhone")}</SetLabel>
                <input value={D.farmPhone || ""} inputMode="tel" onChange={(e) => setDraftS({ ...D, farmPhone: e.target.value })}
                  style={{ ...inp, padding: "9px 11px", fontSize: 14.5, direction: "ltr" }} />
              </div>
              <div>
                <SetLabel>{t("farmAddress")}</SetLabel>
                <input value={D.farmAddress || ""} onChange={(e) => setDraftS({ ...D, farmAddress: e.target.value })}
                  placeholder={t("addressHint")} style={{ ...inp, padding: "9px 11px", fontSize: 14.5 }} />
              </div>
            </div>
            {S.logo && <button type="button" onClick={() => commit([{ type: "setting", field: "logo", value: 0 }], { settings: { ...S, logo: "" } })}
              style={{ background: "none", border: "none", color: C.red, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0, textAlign: "start" }}>
              ✕ {t("removeLogo")}</button>}
          </div>
        </div>
      </SetSection>

      <SetSection open={setOpen.money} onToggle={() => toggleSet("money")} icon="💱" title={t("setCatMoney")} tip={t("setTipPrices")}
        summary={`1$ = ${nf(S.rate || 0)} · ${fmtC(S.milkPrice || 0, S.rate, lang)}/${t("L")}`}
        accent={rateStale ? C.red : undefined}>
        <SetLabel tip={t("setTipRate")}>{t("rate")}</SetLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: C.field, color: "#fff",
          borderRadius: 4, padding: "8px 12px" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>1 USD =</span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 20, marginInlineStart: "auto" }}>{nf(D.rate)}</span>
          <span style={{ fontSize: 12, opacity: .85 }}>{lang === "ar" ? "ل.ل" : "LBP"}</span>
        </div>
        <Stepper compact value={D.rate} step={1000} suffix={lang === "ar" ? "ل.ل" : "LBP"} onChange={(v) => setDraftS({ ...D, rate: v })} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {[85000, 89500, 90000, 95000, 100000].map((v) => (
            <Chip key={v} active={D.rate === v} onClick={() => setDraftS({ ...D, rate: v })}>{nf(v)}</Chip>))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: rateStale ? C.red : C.inkSoft, fontWeight: 600 }}>
          {lastRate
            ? (rateStale ? `⚠ ${t("rateStale")} ${rateAgeDays} ${t("days")}` : `🕘 ${t("rateUpdated")}: ${stamp(lastRate, lang)}`)
            : `⚠ ${t("updateRate")}`}
        </div>
        {rateLog.length > 1 && <>
          <button type="button" onClick={() => setRateHistOpen((v) => !v)}
            style={{ background: "none", border: "none", color: C.field, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: "8px 0 0", textAlign: "start" }}>
            {rateHistOpen ? t("setHideHistory") : t("setShowHistory")}
          </button>
          {rateHistOpen && rateLog.slice(0, 5).map((e) => <div key={e.id} style={{ display: "flex", justifyContent: "space-between",
            fontSize: 12, padding: "4px 0", borderBottom: `1px dotted ${C.line}` }}>
            <span style={{ color: C.inkSoft }}>{stamp(e, lang)}</span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{nf(e.value)}</span></div>)}
        </>}

        <div style={{ height: 12 }} />
        <SetLabel tip={t("themeHint")}>{t("theme")}</SetLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Chip active={theme === "light"} onClick={() => pickTheme("light")} color={C.field}>☀ {t("themeLight")}</Chip>
          <Chip active={theme === "dark"} onClick={() => pickTheme("dark")} color={C.fieldDeep}>☾ {t("themeDark")}</Chip>
        </div>

        <SetLabel tip={t("setTipMoneyView")}>{t("moneyView")}</SetLabel>
        <div style={{ marginBottom: 14 }}>
          <MoneyToggle value={moneyView} onChange={pickMoneyView} rate={S.rate || 89500} lang={lang} t={t}
            previewUsd={D.milkPrice > 0 ? D.milkPrice : 100} />
        </div>

        <div className="set-price-grid">
          <div>
            <SetLabel>{t("milkPrice")}</SetLabel>
            <Stepper compact value={D.milkPrice} step={0.05} suffix={`$ ${t("perL")}`} onChange={(v) => setDraftS({ ...D, milkPrice: +v.toFixed(2) })} />
          </div>
          <div>
            <SetLabel>{t("eggPrice")}</SetLabel>
            <Stepper compact value={D.eggPrice} step={0.02} suffix={`$ ${t("perEgg")}`} onChange={(v) => setDraftS({ ...D, eggPrice: +v.toFixed(2) })} />
          </div>
          <div>
            <SetLabel tip={t("setTipPrices")}>{t("dailyWage")}</SetLabel>
            <Stepper compact value={D.wage} step={1} suffix={`$ ${t("perDay")}`} onChange={(v) => setDraftS({ ...D, wage: v })} />
          </div>
        </div>
      </SetSection>

      <SetSection open={setOpen.docs} onToggle={() => toggleSet("docs")} icon="🧾" title={t("setCatDocs")} tip={t("setTipDocs")}
        summary={(docTplOf(D).thanks || "").trim() ? "✦" : t("invoice")}>
        {(() => {
          const tpl = docTplOf(D);
          const setTpl = (patch) => setDraftS({ ...D, docTpl: { ...tpl, ...patch } });
          return <>
            <SetLabel tip={t("docThanksHint")}>{t("docThanks")}</SetLabel>
            <input value={tpl.thanks || ""} onChange={(e) => setTpl({ thanks: e.target.value })}
              placeholder={t("thanks")} style={{ ...inp, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 }} />
            <SetLabel>{t("docFooterNote")}</SetLabel>
            <input value={tpl.footerNote || ""} onChange={(e) => setTpl({ footerNote: e.target.value })}
              style={{ ...inp, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 }} />
            <SetLabel tip={t("setTipMoneyView")}>{t("docPrintMoney")}</SetLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {[["follow", t("docFollowView")], ["both", t("docAlwaysBoth")], ["usd", t("docUsdOnly")], ["lbp", t("docLbpOnly")]].map(([k, lb]) => (
                <Chip key={k} active={tpl.printMoney === k} onClick={() => setTpl({ printMoney: k })}>{lb}</Chip>))}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {[["showParty", t("docShowParty")], ["showSigns", t("docShowSigns")], ["showRate", t("docShowRate")]].map(([k, lb]) => (
                <button key={k} type="button" onClick={() => setTpl({ [k]: tpl[k] === false })}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${C.line}`,
                    borderRadius: 4, padding: "8px 10px", cursor: "pointer", textAlign: "start", fontFamily: "var(--body)" }}>
                  <span style={{ color: tpl[k] !== false ? C.field : C.line, fontSize: 14 }}>{tpl[k] !== false ? "☑" : "☐"}</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{lb}</span>
                </button>))}
            </div>
          </>;
        })()}
      </SetSection>

      <SetSection open={setOpen.milk} onToggle={() => toggleSet("milk")} icon="🥛" title={t("setCatMilk")} tip={t("kg")}
        summary={t("kg")}>
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: "12px 14px", fontSize: 13.5, color: C.inkSoft, fontWeight: 500, lineHeight: 1.45 }}>
          {t("milkDensityHint")} · {t("milkLogHint")}
        </div>
      </SetSection>

      <SetSection open={setOpen.weather} onToggle={() => toggleSet("weather")}
        icon="🌤️" title={t("setCatWeather")} tip={t("setTipWeather")}
        summary={loc ? loc.name : t("setNotSet")} accent={!loc ? C.tag : undefined}>
        {loc
          ? <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>📍 {loc.name}</span>
                {weather && <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 18 }}>
                  {wmo(weather.code, lang).icon} {weather.temp}°</span>}
              </div>
              {weather && <div style={{ marginTop: 6, fontSize: 12.5, color: C.inkSoft }}>
                {t("feels")} {weather.feels}° · {t("humidity")} {weather.hum}% · {t("rainChance")} {weather.rain}%
              </div>}
              {wErr && <div style={{ marginTop: 6, color: C.red, fontWeight: 600, fontSize: 12.5 }}>⚠ {t("weatherOff")}</div>}
            </div>
          : <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 10 }}>{t("setLocation")}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "9px 12px", fontSize: 13, opacity: locBusy ? .6 : 1 }} onClick={() => {
            setLocBusy(true);
            if (!navigator.geolocation) { setLocBusy(false); return ping(t("locDenied")); }
            navigator.geolocation.getCurrentPosition(async (pos) => {
              const p = { name: lang === "ar" ? "موقع المزرعة" : "Farm", lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) };
              await commit([{ type: "setting", field: "loc", value: 1 }], { settings: { ...S, loc: p } });
              setLocBusy(false);
            }, () => { setLocBusy(false); ping(t("locDenied")); }, { timeout: 8000 });
          }}>📍 {t("useMyLocation")}</button>
          <input value={cityQ} onChange={(e) => setCityQ(e.target.value)} placeholder={t("searchCity")}
            style={{ ...inp, flex: 1, minWidth: 140, padding: "9px 11px", fontSize: 13.5 }} />
          <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "9px 12px", fontSize: 13 }} onClick={async () => {
            if (!cityQ.trim()) return;
            setLocBusy(true);
            try { const g = await geocode(cityQ.trim());
              await commit([{ type: "setting", field: "loc", value: 1 }], { settings: { ...S, loc: g } });
              setCityQ(""); }
            catch (e) { ping(t("locNotFound")); }
            setLocBusy(false);
          }}>{locBusy ? "…" : t("search")}</button>
        </div>
      </SetSection>

      <SetSection open={setOpen.people} onToggle={() => toggleSet("people")} icon="👥" title={t("setCatPeople")} tip={t("setTipPeople")}
        summary={`${(data.profiles || []).length} · ${workers.length} ${t("workers")} · ${activeCustomers.length}`}>
        <SetLabel>{t("people")}</SetLabel>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {(data.profiles || []).map((p) => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9,
            background: C.paper, borderRadius: 4, padding: "7px 10px", border: `1px solid ${C.line}` }}>
            <span style={{ width: 28, height: 28, borderRadius: 4, background: p.color, display: "grid", placeItems: "center", fontSize: 14 }}>{p.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13.5 }}>{p.name}{p.id === me.id ? " •" : ""}</span>
              <span style={{ display: "block", fontSize: 11.5, color: C.inkSoft }}>{roleLabel(p.role, lang)}</span>
            </span>
            {p.pin && <span style={{ fontSize: 12 }}>🔒</span>}
          </div>)}
        </div>

        <SetLabel tip={t("passOptional")}>{t("security")}</SetLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13 }}
            onClick={() => setSheet({ k: "setPass" })}>🔑 {me.pin ? t("changePass") : t("setPass")}</button>
          {me.pin && <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13, color: C.red, borderColor: C.red }}
            onClick={() => setSheet({ k: "confirmRemovePass" })}>🔓 {t("removePass")}</button>}
        </div>

        <SetLabel>{t("workers")}</SetLabel>
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {workers.length === 0
            ? <div style={{ fontSize: 12.5, color: C.inkSoft }}>{t("noWorkers")}</div>
            : workers.map((w) => <div key={w.id} style={{ display: "flex", justifyContent: "space-between", gap: 8,
              background: C.paper, borderRadius: 4, padding: "7px 10px", border: `1px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}>
              <span>{w.name}</span>
              <span style={{ color: C.inkSoft, fontSize: 12 }}>{w.type === "daily" ? t("daily") : `${t("monthly")} · ${fmtC(w.salary, S.rate, lang)}`}</span>
            </div>)}
        </div>
        <button type="button" style={{ ...secondaryBtn, padding: "9px 12px", fontSize: 13.5, marginBottom: archivedCustomers.length ? 10 : 0 }}
          onClick={() => setSheet({ k: "addWorker" })}>＋ {t("addWorker")}</button>
        {archivedCustomers.length > 0 && <button type="button" style={{ ...secondaryBtn, padding: "9px 12px", fontSize: 13.5 }}
          onClick={() => setSheet({ k: "archivedAccounts" })}>📦 {t("archivedAccounts")} ({archivedCustomers.length})</button>}
      </SetSection>

      <SetSection open={setOpen.data} onToggle={() => toggleSet("data")} icon="💾" title={t("setCatData")} tip={t("setTipBackup")}
        summary={co.companyId || cloudCfg.on ? t("setSynced") : t("setOnDevice")}>
        <SetLabel tip={t("setTipCloud")}>{t("cloud")}</SetLabel>
        <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>{t("cloudHint")}</div>

        {!isFirebaseReady() && (
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 12,
            fontSize: 13, color: C.inkSoft, lineHeight: 1.45 }}>{t("coNoFirebase")}</div>
        )}

        {isFirebaseReady() && !co.user && (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input type="email" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} placeholder={t("coCompanyEmail")}
              autoComplete="email" style={{ ...inp, padding: "8px 10px", fontSize: 13.5, direction: "ltr" }} />
            <input type="password" value={coPass} onChange={(e) => setCoPass(e.target.value)} placeholder={t("coPassword")}
              autoComplete="current-password"
              style={{ ...inp, padding: "8px 10px", fontSize: 13.5, direction: "ltr" }} />
            <button type="button" disabled={coBusy || !coEmail || !coPass} onClick={onCoSignIn}
              style={{ ...primaryBtn, opacity: coBusy ? .65 : 1 }}>{t("coSignIn")}</button>
          </div>
        )}

        {isFirebaseReady() && co.user && (
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("coSignedInAs")} <span style={{ direction: "ltr", fontFamily: "var(--mono)" }}>{co.user.email}</span></div>
            {co.company ? (
              <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>✓ {t("coReady")}</div>
                <div style={{ fontSize: 13, color: C.inkSoft }}>{co.company.name}</div>
                {(coInvite || (co.company && co.company.inviteCode)) && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft }}>{t("coInvite")}:</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".08em" }}>{co.company.inviteCode}</span>
                    <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "6px 10px", fontSize: 12.5 }} onClick={copyInvite}>📋 {t("cloudCopy")}</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <button type="button" style={{ background: "none", border: "none", color: C.field, fontWeight: 700, cursor: "pointer",
                  fontFamily: "var(--body)", fontSize: 12.5, padding: "4px 0", textAlign: "start" }}
                  onClick={() => setCoJoinOpen((v) => !v)}>
                  {coJoinOpen ? "▾" : "▸"} {t("coJoin")}
                </button>
                {coJoinOpen && <>
                  <input value={coInvite} onChange={(e) => setCoInvite(e.target.value.toUpperCase())} placeholder={t("coInvite")}
                    style={{ ...inp, padding: "8px 10px", fontSize: 13.5, direction: "ltr", letterSpacing: ".1em", fontFamily: "var(--mono)" }} />
                  <button type="button" disabled={coBusy || !coInvite} onClick={onCoJoin}
                    style={{ ...secondaryBtn, opacity: coBusy ? .65 : 1 }}>{t("coJoin")}</button>
                  <input value={coCompany} onChange={(e) => setCoCompany(e.target.value)} placeholder={t("coCompany")}
                    style={{ ...inp, padding: "8px 10px", fontSize: 13.5 }} />
                  <button type="button" disabled={coBusy} onClick={onCoCreate}
                    style={{ ...secondaryBtn, opacity: coBusy ? .65 : 1 }}>{t("coCreate")}</button>
                </>}
              </div>
            )}
            <button type="button" disabled={coBusy} onClick={onCoSignOut}
              style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13 }}>{t("coSignOut")}</button>
          </div>
        )}
        {coMsg && <div style={{ fontWeight: 700, fontSize: 13, color: coMsg.startsWith("✓") ? C.green : C.red, marginBottom: 10 }}>{coMsg}</div>}

        <button type="button" style={{ background: "none", border: "none", color: C.field, fontWeight: 700, cursor: "pointer",
          fontFamily: "var(--body)", fontSize: 12.5, padding: "4px 0 10px" }} onClick={() => setCloudAdv((v) => !v)}>
          {cloudAdv ? "▾" : "▸"} {t("cloudAdvanced")}
        </button>
        {cloudAdv && (
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.amber, marginBottom: 8, fontWeight: 600 }}>{t("cloudSecret")}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <Chip active={!cloudCfg.on} onClick={() => saveCloud({ ...cloudCfg, on: false })} color={C.inkSoft}>{t("cloudOff")}</Chip>
              <Chip active={cloudCfg.on} onClick={() => saveCloud({ ...cloudCfg, on: true })} color={C.green}>{t("cloudOn")}</Chip>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>{t("cloudUrl")}</div>
              <input value={cloudCfg.url} onChange={(e) => setCloudCfg({ ...cloudCfg, url: e.target.value.trim() })}
                placeholder="https://…" inputMode="url" style={{ ...inp, padding: "8px 10px", fontSize: 13.5, direction: "ltr" }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>{t("cloudToken")}</div>
              <input value={cloudCfg.token} onChange={(e) => setCloudCfg({ ...cloudCfg, token: e.target.value.trim() })}
                style={{ ...inp, padding: "8px 10px", fontSize: 13.5, direction: "ltr" }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={{ ...secondaryBtn, padding: "8px 12px", fontSize: 13, width: "auto" }}
                onClick={() => saveCloud({ ...cloudCfg, on: !!cloudCfg.url })}>{t("save")}</button>
              <button type="button" style={{ ...secondaryBtn, padding: "8px 12px", fontSize: 13, width: "auto" }} onClick={testCloud}>🔌 {t("cloudTest")}</button>
              {cloudCfg.url && <button type="button" style={{ ...secondaryBtn, padding: "8px 12px", fontSize: 13, width: "auto" }} onClick={copyCloudLink}>{t("cloudCopy")}</button>}
            </div>
            {cloudMsg && <div style={{ fontWeight: 700, fontSize: 13, color: cloudMsg.startsWith("✓") ? C.green : C.red, marginTop: 8 }}>{cloudMsg}</div>}
          </div>
        )}

        <SetLabel tip={t("setTipBackup")}>{t("backup")}</SetLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {[["json", "🗄️", t("fullBackup")], ["xls", "📊", t("sheetFile")],
            ["csv", "📄", t("csvFile")], ["pdf", "🖨️", t("pdfFile")]].map(([k, ic, title]) => (
            <button key={k} type="button" onClick={() => doBackup(k)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.line}`,
                borderRadius: 4, padding: "9px 10px", cursor: "pointer", textAlign: "start", fontFamily: "var(--body)" }}>
              <span>{ic}</span>
              <span style={{ fontWeight: 700, fontSize: 12.5 }}>{title}</span>
            </button>))}
        </div>
        <SetLabel>{t("restore")}</SetLabel>
        <label style={{ ...secondaryBtn, display: "block", textAlign: "center", cursor: "pointer", padding: "9px 12px", fontSize: 13.5 }}>
          📂 {t("pickFile")}
          <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onRestoreFile} /></label>
        <SetLabel tip={t("walkthroughTip")}>{t("walkthrough")}</SetLabel>
        {S.demoWalkthrough
          ? <button type="button" style={{ ...secondaryBtn, padding: "9px 12px", fontSize: 13.5 }}
              onClick={() => setSheet({ k: "exitWalkthrough" })}>↩ {t("walkthroughExit")}</button>
          : <button type="button" style={{ ...secondaryBtn, padding: "9px 12px", fontSize: 13.5 }}
              onClick={() => setSheet({ k: "walkthrough" })}>🧭 {t("walkthroughBtn")}</button>}
      </SetSection>

      <SetSection open={setOpen.system} onToggle={() => toggleSet("system")} icon="⚙" title={t("setCatSystem")} tip={t("setTipUpdate")}
        summary={`v${VERSION.code}`}>
        {(() => {
          const bytes = JSON.stringify(data).length;
          const usedPct = Math.min(100, (bytes / 4600000) * 100);
          const docs = entries.filter((e) => e.receipt).length;
          const tight = usedPct > 75;
          return <div style={{ marginBottom: 12 }}>
            <SetLabel tip={t("setTipStorage")}>{t("storageUsed")}</SetLabel>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
              <span style={{ fontFamily: "var(--mono)" }}>{(bytes / 1048576).toFixed(1)} MB</span>
              <span style={{ color: C.inkSoft, fontFamily: "var(--mono)" }}>{t("storageOf")} 4.4 MB</span>
            </div>
            <div style={{ height: 8, background: C.line, borderRadius: 99 }}>
              <div style={{ width: `${usedPct}%`, height: "100%", borderRadius: 99,
                background: tight ? C.red : usedPct > 50 ? C.tag : C.green }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: C.inkSoft }}>
              <span>📎 {docs}</span><span>🧾 {entries.length}</span>
            </div>
            {tight && <div style={{ marginTop: 8, background: "#F5E2E4", borderRadius: 3, padding: "7px 9px",
              fontSize: 12, fontWeight: 600, color: "#7A1A2E" }}>⚠ {t("storageWarn")}</div>}
          </div>;
        })()}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.field }}>v{VERSION.code}</span>
          {updateReady
            ? <button type="button" style={{ ...primaryBtn, width: "auto", padding: "8px 14px", fontSize: 13, background: C.green }}
              onClick={doApplyUpdate}>⬇ {t("updateNow")}</button>
            : <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "8px 14px", fontSize: 13 }}
              onClick={doCheckUpdate}>↻ {t("checkUpdate")}</button>}
          {updateReady && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.green }}>✓ {t("updateReady")}</span>}
          {updateMsg && !updateReady && <span style={{ fontSize: 12.5, color: C.inkSoft }}>{updateMsg}</span>}
        </div>
        {(() => {
          const notes = (WHATS_NEW[VERSION.code] && (WHATS_NEW[VERSION.code][lang] || WHATS_NEW[VERSION.code].en)) || [];
          if (!notes.length) return null;
          return <div style={{ marginTop: 12, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>✨ {t("whatsNew")}</span>
              <button type="button" style={{ ...secondaryBtn, width: "auto", padding: "5px 10px", fontSize: 12 }}
                onClick={() => setSheet({ k: "whatsNew" })}>{t("viewWhatsNew")}</button>
            </div>
            <ul style={{ margin: 0, paddingInlineStart: 16, display: "grid", gap: 5 }}>
              {notes.slice(0, 3).map((line, i) => (
                <li key={i} style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 500, lineHeight: 1.4 }}>{line}</li>
              ))}
            </ul>
            {notes.length > 3 && <div style={{ fontSize: 12, color: C.field, fontWeight: 600, marginTop: 6 }}>
              +{notes.length - 3}…</div>}
          </div>;
        })()}
      </SetSection>

      <SetSection open={setOpen.danger} onToggle={() => toggleSet("danger")} icon="⚠" title={t("setDanger")}
        summary={t("resetAll")} accent={C.red}>
        <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500, marginBottom: 10 }}>{t("resetWarn")}</div>
        <button type="button" style={{ ...secondaryBtn, color: C.red, borderColor: C.red, padding: "9px 12px", fontSize: 13.5 }}
          onClick={() => setSheet({ k: "reset" })}>{t("resetAll")}</button>
      </SetSection>

      <div style={{ textAlign: "center", padding: "6px 0 2px", fontSize: 11.5, color: C.inkSoft }}>
        {S.farmName ? `${S.farmName} · ` : ""}{t("appName")} v{VERSION.code}
      </div>
    </div>
  );

  const animal = sheet?.id ? animals.find((a) => a.id === sheet.id) : null;
  const cust = sheet?.cid ? customers.find((c) => c.id === sheet.cid) : null;

  const selAnimal = sel ? animals.find((a) => a.id === sel) : null;
  const selCustomer = selCust ? customers.find((c) => c.id === selCust) : null;
  const selSupplier = selSupp ? suppliers.find((s) => s.id === selSupp) : null;

  const sortRows = (rows, key) => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = key(a), vb = key(b);
      if (typeof va === "number" && typeof vb === "number") return sortBy.d === "asc" ? va - vb : vb - va;
      return sortBy.d === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  };
  const head = (k, label, opts = {}) => (
    <Th w={opts.w} align={opts.align} active={sortBy.k === k} dirn={sortBy.d}
      onClick={() => setSortBy((p) => ({ k, d: p.k === k && p.d === "asc" ? "desc" : "asc" }))}>{label}</Th>
  );

  /* the whole herd in one editable grid — the reason to use a computer */
  const batchRows = animals.filter((a) => producesEggs(a) || a.status !== "dry");
  const batchKey = (id, f) => `${id}:${f}`;
  const bVal = (a, f) => {
    const k = batchKey(a.id, f);
    if (k in batch) return batch[k];
    const day = entryDate;
    if (producesEggs(a)) {
      const e = entries.find((x) => x.type === "eggs" && x.animalId === a.id && dayKey(x.at) === day);
      return e ? (f === "am" ? e.count : e.broken || 0) : 0;
    }
    const e = entries.find((x) => x.type === "milk" && x.animalId === a.id && x.session === f && dayKey(x.at) === day);
    return e ? e.liters : 0;
  };
  const setB = (a, f, v) => setBatch((p) => ({ ...p, [batchKey(a.id, f)]: v }));
  const gridRows = batchRows.filter((a) => (S.milkMode === "total" ? producesEggs(a) : true));
  const batchDirty = Object.keys(batch).length;
  const bulkFor = (sess) => {
    const k = `bulk:${sess}`;
    if (k in batch) return batch[k];
    const e = entries.find((x) => x.type === "milkBulk" && x.session === sess && dayKey(x.at) === entryDate);
    if (e) return milkFromLiters(milkRecordLiters(e), milkUnit);
    /* migrate legacy single-day totals into the morning field */
    if (sess === "am") {
      const hasAmPm = entries.some((x) => x.type === "milkBulk" && (x.session === "am" || x.session === "pm") && dayKey(x.at) === entryDate);
      if (!hasAmPm) {
        const dayE = entries.find((x) => x.type === "milkBulk" && (x.session === "day" || !x.session) && dayKey(x.at) === entryDate);
        if (dayE) return milkFromLiters(milkRecordLiters(dayE), milkUnit);
      }
    }
    return 0;
  };
  const saveBulk = () => {
    const amP = milkPack(bulkFor("am"), milkUnit);
    const pmP = milkPack(bulkFor("pm"), milkUnit);
    const es = [
      { type: "milkBulk", session: "am", ...amP, at: sessionStamp(entryDate, "am") },
      { type: "milkBulk", session: "pm", ...pmP, at: sessionStamp(entryDate, "pm") },
    ];
    const at = dayStamp(entryDate);
    batchRows.filter(producesEggs).forEach((a) => {
      const am = batchKey(a.id, "am"), pm = batchKey(a.id, "pm");
      if (!(am in batch || pm in batch)) return;
      es.push({ type: "eggs", animalId: a.id, count: +bVal(a, "am") || 0, broken: +bVal(a, "pm") || 0, at });
    });
    commit(es);
    setBatch({});
  };
  const saveDayMilk = () => {
    saveBulk();
  };
  /* Enter jumps straight down the column, the way a ledger is filled in */
  const gridKey = (e, rowIdx, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = document.querySelector(`[data-cell="${rowIdx + 1}:${field}"]`);
    if (next) { next.focus(); next.select(); }
  };
  const saveBatch = () => {
    const es = [];
    batchRows.forEach((a) => {
      const am = batchKey(a.id, "am"), pm = batchKey(a.id, "pm");
      const touched = am in batch || pm in batch;
      if (!touched) return;
      const at = dayStamp(entryDate);
      if (producesEggs(a)) es.push({ type: "eggs", animalId: a.id, count: +bVal(a, "am") || 0, broken: +bVal(a, "pm") || 0, at });
      else {
        es.push({ type: "milk", animalId: a.id, session: "am", liters: +bVal(a, "am") || 0, at });
        es.push({ type: "milk", animalId: a.id, session: "pm", liters: +bVal(a, "pm") || 0, at });
      }
    });
    if (!es.length) return ping(t("nothingChanged"));
    commit(es);            // every change written in a single save
    setBatch({});
  };

  const paletteItems = [
    { key: "n12", icon: "🥛", label: t("farmDay"), hint: t("entry"), group: "action", rank: 1,
      run: () => navigate("entry") },
    { key: "n13", icon: "🥛", label: t("milkUse"), hint: t("milkUseSub"), group: "farm", rank: 4,
      run: () => { navigate("entry", { clearSheet: false }); setSheet({ k: "milkUse" }); } },
    { key: "n6", icon: "💸", label: t("logExpense"), group: "action", rank: 2,
      run: () => { navigate("expenses", { clearSheet: false }); setSheet({ k: "expense" }); } },
    { key: "n2q", icon: "⚡", label: t("quickSale"), hint: t("quickSaleHint"), group: "action", rank: 2.5,
      run: () => { navigate("sales", { clearSheet: false }); setSheet({ k: "quickSale" }); } },
    { key: "n2", icon: "🧾", label: t("newSale"), group: "action", rank: 3,
      run: () => { navigate("sales", { clearSheet: false }); setSheet({ k: "newSale" }); } },
    { key: "n3", icon: "💵", label: t("recordPayment"), group: "action", rank: 4, run: () => {
      navigate("sales", { clearSheet: false });
      const cid = selCust || activeCustomers.find((c) => (ledger.byCustomer[c.id]?.due || 0) > 0)?.id;
      if (cid) { openAccount(cid); setSheet({ k: "payment", cid }); }
    } },
    { key: "n4", icon: "🚚", label: t("dailyRound"), group: "action", rank: 5, run: () => setSheet({ k: "round" }) },
    { key: "n18", icon: "📦", label: t("archivedAccounts"), group: "action", rank: 6,
      run: () => setSheet({ k: "archivedAccounts" }) },
    { key: "n1", icon: "🐄", label: t("addAnimal"), group: "farm", rank: 10, run: () => setSheet({ k: "addAnimal" }) },
    { key: "n5", icon: "💉", label: t("giveMed"), group: "farm", rank: 11, run: () => setSheet({ k: "med" }) },
    { key: "n11", icon: "🐣", label: t("recordBirth"), group: "farm", rank: 12, run: () => setSheet({ k: "birth" }) },
    { key: "n19", icon: "⚖️", label: t("weighIn"), group: "farm", rank: 13, run: () => setSheet({ k: "weight" }) },
    { key: "n14", icon: "💀", label: t("losses"), group: "farm", rank: 14, run: () => setSheet({ k: "loss" }) },
    { key: "n7", icon: "👷", label: t("workers"), group: "farm", rank: 15, run: () => setSheet({ k: "workers" }) },
    { key: "n15", icon: "🌾", label: t("cmdFeed"), group: "farm", rank: 16,
      run: () => { navigate("expenses", { clearSheet: false }); setSheet({ k: "feed" }); } },
    { key: "n21", icon: "🤝", label: t("addSupplier"), group: "farm", rank: 17,
      run: () => { navigate("suppliers", { clearSheet: false }); setSheet({ k: "addSupplier" }); } },
    { key: "n22", icon: "💵", label: t("paySupplier"), group: "farm", rank: 18,
      run: () => {
        navigate("suppliers", { clearSheet: false });
        const due = activeSuppliers.find((s) => ((supplierLedger.bySupplier[s.id] || {}).due || 0) > 0);
        if (due) { openSupplier(due.id); setSheet({ k: "paySupplier", sid: due.id }); }
        else setSheet({ k: "addSupplier" });
      } },
    { key: "n9", icon: "📊", label: t("excel"), group: "action", rank: 20, run: doExcel },
    { key: "n8", icon: "📄", label: t("exportPdf"), group: "action", rank: 21,
      run: () => { navigate("reports"); setTimeout(() => setSheet({ k: "reportPreview" }), 120); } },
    { key: "n10", icon: "💾", label: t("backup"), group: "action", rank: 22, run: () => doBackup("json") },
    { key: "n16", icon: "↻", label: t("refresh"), group: "action", rank: 23, run: () => { pull(); loadWeather(); } },
    { key: "n17", icon: "🌐", label: t("language"), group: "action", rank: 24,
      run: () => setLang(lang === "ar" ? "en" : "ar") },
    { key: "n20", icon: theme === "dark" ? "☀" : "☾", label: t("theme"), hint: theme === "dark" ? t("themeLight") : t("themeDark"),
      group: "action", rank: 25, run: () => cycleTheme() },
    ...[["dashboard", "💵", t("cashBox")], ["animals", "🐾", t("animals")], ["entry", "🥛", t("entry")],
      ["expenses", "💸", t("moneyOut")], ["sales", "🧾", t("sales")], ["reports", "▦", t("reports")],
      ["settings", "⚙", t("settings")]].map(([r, ic, lb], idx) => (
      { key: `g-${r}`, icon: ic, label: lb, hint: t("goTo"), group: "go", rank: 30 + idx, run: () => navigate(r) })),
    ...animals.map((a) => ({ key: `a-${a.id}`, icon: spOf(a).icon, label: animalLabel(a),
      hint: spName(a.species, lang, true), tag: statusLabel(a.status, lang), group: "people", rank: 60,
      run: () => { navigate("animals"); setSel(a.id); } })),
    ...activeCustomers.map((c) => ({ key: `c-${c.id}`, icon: isWalkInCustomer(c) ? "🛍️" : "🤝", label: customerLabel(c, t), hint: t("customers"),
      tag: fmtC((ledger.byCustomer[c.id] || {}).due || 0, S.rate, lang), group: "people", rank: 70,
      run: () => { navigate("sales"); openAccount(c.id); } })),
  ];

  /* Farm = stock + production + farm costs. Office = sales + reports + settings. */
  const farmNav = [["animals", "🐾", t("animals")], ["entry", "🥛", t("entry")], ["expenses", "💸", t("moneyOut")], ["suppliers", "🤝", t("suppliers")]];
  const officeNav = [["sales", "🧾", t("sales")], ["reports", "▦", t("reports")], ["settings", "⚙", t("settings")]];
  const allNav = [["dashboard", "💵", t("cashBox")], ...farmNav, ...officeNav];
  const navLabel = (k) => (allNav.find((n) => n[0] === k) || ["", "", k])[2];
  const navBtn = (k, ic, lb, active, onClick) => (
    <button key={k} type="button" onClick={onClick} className={active ? "dk-nav on" : "dk-nav"}>
      <span style={{ width: 20, textAlign: "center", fontSize: 15 }}>{ic}</span>{lb}</button>
  );
  const go = (r) => () => navigate(r);

  const exportCashBox = () => {
    const headers = [t("cashEntryDate"), t("cashRef"), t("cashStatement"), t("cashIn"), t("cashOut"), t("cashBalance")];
    const csvMoney = (v) => `"${fmt(v || 0, S.rate, lang).replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...cashBox.rows.map((r) => [
        r.day, r.ref,
        `"${(r.parts || []).map((p) => p.text).join("").replace(/"/g, '""')}"`,
        r.debit ? csvMoney(r.debit) : "", r.credit ? csvMoney(r.credit) : "", csvMoney(r.balance),
      ].join(",")),
      ["", "", t("cashTotals"), csvMoney(cashBox.totalIn),
        csvMoney(cashBox.totalOut), csvMoney(cashBox.closing)].join(","),
    ];
    downloadBlob("\uFEFF" + lines.join("\n"), `cashbox-${cashBounds.from}-${cashBounds.to}.csv`, "text/csv;charset=utf-8");
    ping(t("saved"));
  };

  const openCashSource = (r) => {
    const e = r && r.source;
    if (!e) return;
    if (e.implied) {
      setSheet({ k: "confirmDeleteEntry", id: e.id });
      return;
    }
    if (e.type === "saleReimburse") {
      if (e.saleId) setSheet({ k: "editSale", id: e.saleId, cid: e.customerId });
      else setSheet({ k: "confirmDeleteEntry", id: e.id });
      return;
    }
    if (e.type === "payment" || e.type === "supplierPay" || e.type === "med") {
      setSheet({ k: "editMoney", id: e.id });
      return;
    }
    if (e.type === "expense") {
      navigate(e.supplierId ? "suppliers" : "expenses", { clearSheet: false });
      setSheet(e.supplierId ? { k: "supplierBill", sid: e.supplierId, id: e.id }
        : { k: "editExpense", id: e.id });
    }
  };
  const cashPeriodLabel = cashRange === "today" ? t("today") : cashRange === "yesterday" ? t("yesterday")
    : cashRange === "week" ? t("thisWeek") : cashRange === "lastMonth" ? t("lastMonth")
      : cashRange === "custom" ? `${dmy(cashBounds.from)} — ${dmy(cashBounds.to)}` : t("thisMonth");
  const cashNet = +(cashBox.totalIn - cashBox.totalOut).toFixed(2);
  const cashColumnMap = Object.fromEntries(CASH_COLUMNS.map((col) => [col.key, col]));
  const cashVisibleKeys = cashTable.order.filter((key) =>
    (key !== "ref" || cashRefOpen) && (key !== "balance" || !cashView.filtered));
  const cashTableWidth = cashVisibleKeys.reduce((sum, key) => sum + cashTable.widths[key], 0);
  const cashDensityPad = { compact: "5px", comfortable: "9px", spacious: "14px" }[cashTable.density];
  const renderCashRowCell = (key, r) => {
    if (key === "date") return <Td key={key} mono>{r.day}</Td>;
    if (key === "ref") return <Td key={key} mono tone={C.inkSoft}>{r.ref}</Td>;
    if (key === "statement") return <Td key={key}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <CashParts parts={r.parts} />
      {r.source ? <WhoHint e={r.source} lang={lang} /> : null}
    </span></Td>;
    if (key === "in") return <Td key={key} align="end" mono strong tone={r.debit ? C.green : C.inkSoft}>{r.debit ? fmtC(r.debit, S.rate, lang) : "—"}</Td>;
    if (key === "out") return <Td key={key} align="end" mono strong tone={r.credit ? C.red : C.inkSoft}>{r.credit ? fmtC(r.credit, S.rate, lang) : "—"}</Td>;
    return <Td key={key} align="end" mono strong tone={r.balance >= 0 ? C.fieldDeep : C.red}>{fmtC(r.balance, S.rate, lang)}</Td>;
  };
  const renderCashOpeningCell = (key) => {
    if (key === "date") return <Td key={key} tone={C.inkSoft}>{cashBounds.from}</Td>;
    if (key === "ref") return <Td key={key} mono tone={C.inkSoft}>—</Td>;
    if (key === "statement") return <Td key={key}><span style={{ fontWeight: 700, color: C.field }}>{t("cashOpening")}</span></Td>;
    if (key === "balance") return <Td key={key} align="end" mono strong tone={cashBox.opening >= 0 ? C.green : C.red}>{fmtC(cashBox.opening, S.rate, lang)}</Td>;
    return <Td key={key} align="end" mono>—</Td>;
  };
  const renderCashTotalCell = (key) => {
    if (key === "statement") return <Td key={key} strong>{cashView.filtered ? t("cashViewTotals") : t("cashTotals")}</Td>;
    if (key === "in") return <Td key={key} align="end" mono strong tone={C.green}>{fmtC(cashView.totalIn, S.rate, lang)}</Td>;
    if (key === "out") return <Td key={key} align="end" mono strong tone={C.red}>{fmtC(cashView.totalOut, S.rate, lang)}</Td>;
    if (key === "balance") return <Td key={key} align="end" mono strong tone={cashBox.closing >= 0 ? C.green : C.red}>{fmtC(cashBox.closing, S.rate, lang)}</Td>;
    return <Td key={key} />;
  };
  const DeskDashboard = (
    <div style={{ display: "grid", gap: 14 }} className="cash-box">
      <SearchFilterBar t={t} q={cashQ} onQ={setCashQ} qPlaceholder={t("cashSearch")}
        extra={<>
          <button type="button" className={`dk-pill${cashRefOpen ? " on" : ""}`} style={{ minHeight: 44 }}
            onClick={() => setCashRefOpen((v) => !v)}>{cashRefOpen ? t("cashHideRef") : t("cashShowRef")}</button>
          <button type="button" className={`dk-pill${cashCustomizeOpen ? " on" : ""}`} style={{ minHeight: 44 }}
            aria-expanded={cashCustomizeOpen} onClick={() => setCashCustomizeOpen((v) => !v)}>
            ⚙ {t("cashTableSettings")}</button>
        </>}
        activeCount={(cashRange !== "today" ? 1 : 0) + (cashDir !== "all" ? 1 : 0)}
        onReset={() => { setCashRange("today"); setCashFrom(""); setCashTo(""); setCashDir("all"); }}
        chips={[
          cashRange !== "today" ? { key: "range", label: cashPeriodLabel, onRemove: () => { setCashRange("today"); setCashFrom(""); setCashTo(""); } } : null,
          cashDir !== "all" ? { key: "dir", label: cashDir === "in" ? t("cashFilterIn") : t("cashFilterOut"), onRemove: () => setCashDir("all") } : null,
        ].filter(Boolean)}>
        <FilterGroup label={t("customRange")}>
          {[["today", t("today")], ["yesterday", t("yesterday")], ["week", t("thisWeek")],
            ["month", t("thisMonth")], ["lastMonth", t("lastMonth")], ["custom", t("customRange")]].map(([k, lb]) => (
            <Chip key={k} active={cashRange === k || (k === "week" && cashRange === "thisWeek") || (k === "month" && cashRange === "thisMonth")}
              onClick={() => setCashRange(k === "week" ? "week" : k === "month" ? "month" : k)}>{lb}</Chip>))}
        </FilterGroup>
        {cashRange === "custom" && <FilterGroup>
          <DatePick compact allowClear value={cashFrom} onChange={setCashFrom} ariaLabel={t("fromDate")} />
          <DatePick compact allowClear value={cashTo} onChange={setCashTo} ariaLabel={t("toDate")} />
        </FilterGroup>}
        <FilterGroup label={t("cashFilterAll")}>
          {[["all", t("cashFilterAll")], ["in", t("cashFilterIn")], ["out", t("cashFilterOut")]].map(([k, lb]) => (
            <Chip key={k} active={cashDir === k} onClick={() => setCashDir(k)}>{lb}</Chip>))}
        </FilterGroup>
      </SearchFilterBar>

      <DeskCard pad={0} title={`✦ ${t("cashOverview")}`}>
        <div className="cash-overview">
          <div className="cash-closing">
            <span>{t("cashClosing")}</span>
            <Money usd={cashBox.closing} rate={S.rate} lang={lang} size={30} />
            <small>{cashPeriodLabel}</small>
          </div>
          {[
            [t("cashOpening"), cashBox.opening, C.field],
            [t("cashIn"), cashBox.totalIn, C.green],
            [t("cashOut"), cashBox.totalOut, C.red],
            [t("cashNet"), cashNet, cashNet >= 0 ? C.green : C.red],
          ].map(([label, value, tone]) => <div className="cash-overview-stat" key={label}>
            <span>{label}</span>
            <b style={{ color: tone }}>{fmtC(value, S.rate, lang)}</b>
          </div>)}
        </div>
      </DeskCard>

      <DeskCard pad={0} title={`💵 ${t("cashRegister")} · ${cashPeriodLabel}`}
        right={null}>
        {cashView.filtered && <div className="cash-filter-note">
          <span>ⓘ {t("cashFilteredHint")}</span>
          <b>{t("cashViewTotals")}: <span style={{ color: C.green }}>+{fmtC(cashView.totalIn, S.rate, lang)}</span>
            {" · "}<span style={{ color: C.red }}>−{fmtC(cashView.totalOut, S.rate, lang)}</span></b>
        </div>}
        {cashCustomizeOpen && <div className="cash-customize">
          <div className="cash-customize-top">
            <div>
              <b>{t("cashTableSettings")}</b>
              <span>{t("cashTableSettingsHint")}</span>
            </div>
            <button type="button" className="dk-pill" onClick={() => applyCashTable(null)}>↺ {t("cashResetTable")}</button>
          </div>
          <div className="cash-density" role="group" aria-label={t("cashDensity")}>
            <span>{t("cashDensity")}</span>
            {CASH_DENSITIES.map((density) => <button type="button" key={density}
              className={`dk-pill${cashTable.density === density ? " on" : ""}`}
              aria-pressed={cashTable.density === density}
              onClick={() => applyCashTable((prev) => ({ ...prev, density }))}>
              {t(`cashDensity${density[0].toUpperCase()}${density.slice(1)}`)}
            </button>)}
          </div>
          <div className="cash-column-list">
            {cashVisibleKeys.map((key, index) => {
              const col = cashColumnMap[key];
              return <div className={`cash-column-control${cashDragKey === key ? " dragging" : ""}`} key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  moveCashColumn(e.dataTransfer.getData("text/plain") || cashDragKey, key);
                  setCashDragKey(null);
                }}>
                <button type="button" className="cash-drag" draggable
                  aria-label={`${t("cashDragColumn")}: ${t(col.label)}`}
                  title={t("cashDragColumn")}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", key);
                    setCashDragKey(key);
                  }}
                  onDragEnd={() => setCashDragKey(null)}>⠿</button>
                <b>{t(col.label)}</b>
                <label>
                  <span>{t("cashColumnWidth")}</span>
                  <input type="range" min={col.min} max={col.max} step="5"
                    value={cashTable.widths[key]}
                    onChange={(e) => resizeCashColumn(key, Number(e.target.value))} />
                  <output>{cashTable.widths[key]}px</output>
                </label>
                <div className="cash-column-move">
                  <button type="button" disabled={index === 0} title={t("cashMoveEarlier")}
                    aria-label={`${t("cashMoveEarlier")}: ${t(col.label)}`}
                    onClick={() => moveCashColumn(key, cashVisibleKeys[index - 1])}>‹</button>
                  <button type="button" disabled={index === cashVisibleKeys.length - 1} title={t("cashMoveLater")}
                    aria-label={`${t("cashMoveLater")}: ${t(col.label)}`}
                    onClick={() => moveCashColumn(key, cashVisibleKeys[index + 1], true)}>›</button>
                </div>
              </div>;
            })}
          </div>
        </div>}
        <DataList
          empty={null}
          cards={cashView.rows.map((r) => (
            <DataCard key={r.id} kind={r.dir === "deduct" ? "partial" : r.dir === "out" ? "out" : "in"}
              status={<StatusPill status={r.dir === "deduct" ? "partial" : r.dir === "out" ? "out" : "in"}>
                {r.dir === "deduct" ? t("cashDeductPaid") : r.dir === "out" ? t("cashFilterOut") : t("cashFilterIn")}</StatusPill>}
              title={r.day}
              subtitle={<CashParts parts={r.parts} />}
              who={r.source ? <WhoHint e={r.source} lang={lang} /> : null}
              meta={`${r.debit ? `+${fmtC(r.debit, S.rate, lang)}` : ""}${r.credit ? `${r.debit ? " · " : ""}−${fmtC(r.credit, S.rate, lang)}` : ""}`}
              onClick={() => openCashSource(r)}
            />
          ))}
          table={
        <div className="overflow-x-auto">
          <table className={`cash-table cash-density-${cashTable.density}`}
            style={{ width: `max(100%, ${cashTableWidth}px)`, minWidth: cashTableWidth, borderCollapse: "collapse",
              tableLayout: "fixed", "--cash-cell-y": cashDensityPad }}>
            <colgroup>{cashVisibleKeys.map((key) => <col key={key} style={{ width: cashTable.widths[key] }} />)}</colgroup>
            <thead><tr>
              {cashVisibleKeys.map((key) => {
                const col = cashColumnMap[key];
                return <Th key={key} w={cashTable.widths[key]} align={col.align}>
                  <div className={`cash-column-head${cashDragKey === key ? " dragging" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      moveCashColumn(e.dataTransfer.getData("text/plain") || cashDragKey, key);
                      setCashDragKey(null);
                    }}>
                    <button type="button" className="cash-drag cash-drag-head" draggable
                      aria-label={`${t("cashDragColumn")}: ${t(col.label)}`}
                      title={t("cashDragColumn")}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", key);
                        setCashDragKey(key);
                      }}
                      onDragEnd={() => setCashDragKey(null)}>⠿</button>
                    <span>{t(col.label)}</span>
                    <button type="button" className="cash-col-resize"
                      aria-label={`${t("cashResizeColumn")}: ${t(col.label)}`}
                      title={t("cashResizeColumn")}
                      onPointerDown={(e) => startCashResize(e, key)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                        e.preventDefault();
                        const visualStep = e.key === "ArrowRight" ? 10 : -10;
                        resizeCashColumn(key, cashTable.widths[key] + (dir === "rtl" ? -visualStep : visualStep));
                      }} />
                  </div>
                </Th>;
              })}
            </tr></thead>
            <tbody>
              {!cashView.filtered && cashBox.opening !== 0 && (
                <tr style={{ background: C.paper }}>
                  {cashVisibleKeys.map(renderCashOpeningCell)}
                </tr>
              )}
              {cashView.rows.length === 0 ? (
                <tr><td colSpan={cashVisibleKeys.length} style={{ padding: 30, textAlign: "center" }}>
                  <div style={{ fontSize: 25, marginBottom: 5 }}>⌕</div>
                  <b>{cashBox.rows.length ? t("cashNoResults") : t("cashEmpty")}</b>
                  {cashBox.rows.length > 0 && <div style={{ color: C.inkSoft, fontSize: 12.5, marginTop: 4 }}>{t("cashNoResultsSub")}</div>}
                </td></tr>
              ) : cashView.rows.map((r) => (
                <tr key={r.id} onClick={() => openCashSource(r)} title={t("cashOpenSource")}
                  className={statusRowClass(r.dir === "deduct" ? "partial" : r.dir === "out" ? "out" : "in")}
                  onContextMenu={(ev) => openCtx(ev, [
                    { key: "open", icon: "✏️", label: t("ctxEdit"), run: () => openCashSource(r) },
                    { key: "del", icon: "🗑️", label: t("ctxDelete"),
                      run: () => setSheet({ k: "confirmDeleteEntry", id: r.source?.id || r.id }) },
                  ])}
                  style={{ cursor: "pointer" }}>
                  {cashVisibleKeys.map((key) => renderCashRowCell(key, r))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.paper, borderTop: `2px solid ${C.rule}` }}>
                {cashVisibleKeys.map(renderCashTotalCell)}
              </tr>
            </tfoot>
          </table>
        </div>
          }
        />
      </DeskCard>

      <div className="cash-secondary-actions">
        <button type="button" className="dk-pill" onClick={exportCashBox}>↧ {t("cashExport")} · {t("cashFullPeriod")}</button>
        <button type="button" className="dk-pill" onClick={() => window.print()}>🖨️ {t("print")}</button>
        <button type="button" className="dk-pill" onClick={() => setCashFlowOpen((v) => !v)}>
          📊 {cashFlowOpen ? t("cashHideFlow") : t("cashShowFlow")} {cashFlowOpen ? "▴" : "▾"}</button>
        <button type="button" className="dk-pill" style={{ marginInlineStart: "auto" }}
          onClick={() => navigate("expenses")}>💸 {t("expenses")} ›</button>
      </div>

      {cashFlowOpen && <DeskCard title={`📊 ${t("cashFlowBreakdown")} · ${cashPeriodLabel}`}
        right={<button type="button" className="dk-pill" onClick={() => setCashFlowOpen(false)}>− {t("cashHideFlow")}</button>}>
        {cashFlow.length === 0 ? <div style={{ color: C.inkSoft, fontSize: 14 }}>{t("cashEmpty")}</div>
          : <div className="cash-flow-list">
            {cashFlow.map((g) => {
              const base = g.dir === "in" ? cashBox.totalIn : cashBox.totalOut;
              const pct = base > 0 ? Math.round((g.amount / base) * 100) : 0;
              const tone = g.dir === "in" ? C.green : C.red;
              return <div className="cash-flow-row" key={g.id}>
                <div><b>{g.dir === "in" ? "↙" : "↗"} {g.label}</b>
                  <span>{g.count} {t("rows")} · {pct}%</span></div>
                <strong style={{ color: tone }}>{fmtC(g.amount, S.rate, lang)}</strong>
                <i><span style={{ width: `${pct}%`, background: tone }} /></i>
              </div>;
            })}
          </div>}
      </DeskCard>}
    </div>
  );

  const herdStatusKeys = [...new Set(animals.map((a) => a.status).filter(Boolean))];
  const herdFilterActive = (spFilter !== "all" ? 1 : 0) + (herdStatusFilter !== "all" ? 1 : 0) + (q.trim() ? 1 : 0);
  const herdRows = sortRows(animals.filter((a) => {
    if (spFilter !== "all" && a.species !== spFilter) return false;
    if (herdStatusFilter !== "all" && a.status !== herdStatusFilter) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return `${animalLabel(a)} ${a.tag || ""} ${a.name || ""} ${breedLabel(a, "ar")} ${breedLabel(a, "en")} ${a.notes || ""}`
      .toLowerCase().includes(needle);
  }), (a) => ({
    tag: isFlock(a) ? a.name : (+a.tag || a.tag),
    sp: a.species, st: a.status, breed: breedLabel(a, lang),
    age: a.dob ? new Date(a.dob).getTime() : -(a.ageYears || 0),
  })[sortBy.k]);
  const totalHeads = animals.reduce((sum, a) => sum + headCount(a), 0);
  const sickCount = animals.filter((a) => a.status === "sick").reduce((sum, a) => sum + headCount(a), 0);
  const pregnantCount = animals.filter((a) => a.status === "pregnant").reduce((sum, a) => sum + headCount(a), 0);
  const attentionCount = animals.filter((a) => {
    const r = repro(a);
    return a.status === "sick" || !!a.medicine || !!(r && (r.needsCheck || r.dryDue || r.overdue));
  }).length;
  const speciesSummary = SP_KEYS.map((k) => {
    const count = animals.filter((a) => a.species === k).reduce((sum, a) => sum + headCount(a), 0);
    return count > 0 ? `${SPECIES[k].icon} ${nf(count)}` : null;
  }).filter(Boolean).join(" · ");

  const herdSort = joinSort(sortBy.k === "age" ? "date" : "alpha", sortBy.d);
  const herdSortOn = sortBy.k !== "tag" || sortBy.d !== "asc";
  const clearHerdFilters = () => { setQ(""); setSpFilter("all"); setHerdStatusFilter("all"); setSortBy({ k: "tag", d: "asc" }); };
  const DeskAnimals = (
    <div style={{ display: "grid", gap: 14 }}>
      <SearchFilterBar t={t} q={q} onQ={setQ} qPlaceholder={t("searchAnimals")}
        extra={<button type="button" style={{ ...primaryBtn, width: "auto", padding: "10px 16px", fontSize: 14, minHeight: 44 }}
          onClick={() => setSheet({ k: "addAnimal" })}>＋ {t("addAnimal")}</button>}
        activeCount={(spFilter !== "all" ? 1 : 0) + (herdStatusFilter !== "all" ? 1 : 0) + (herdSortOn ? 1 : 0)}
        onReset={clearHerdFilters}
        chips={[
          spFilter !== "all" ? { key: "sp", label: spName(spFilter, lang, true), onRemove: () => setSpFilter("all") } : null,
          herdStatusFilter !== "all" ? { key: "st", label: statusLabel(herdStatusFilter, lang), onRemove: () => setHerdStatusFilter("all") } : null,
          herdSortOn ? { key: "sort", label: sortChipLabel(t, herdSort), onRemove: () => setSortBy({ k: "tag", d: "asc" }) } : null,
        ].filter(Boolean)}>
        <FilterGroup label={t("species")}>
          <Chip active={spFilter === "all"} onClick={() => setSpFilter("all")}>{t("all")}</Chip>
          {speciesPresent.map((k) => <Chip key={k} active={spFilter === k} onClick={() => setSpFilter(k)} color={SPECIES[k].color}>
            {SPECIES[k].icon} {spName(k, lang, true)}</Chip>)}
        </FilterGroup>
        <FilterGroup label={t("status")}>
          <Chip active={herdStatusFilter === "all"} onClick={() => setHerdStatusFilter("all")}>{t("statusAll")}</Chip>
          {herdStatusKeys.map((k) => <Chip key={k} active={herdStatusFilter === k}
            onClick={() => setHerdStatusFilter(k)} color={statusColor(k)}>{statusLabel(k, lang)}</Chip>)}
        </FilterGroup>
        <FilterGroup label={t("sortBy")}>
          <SortPair t={t} sort={herdSort} fields={[["date", t("sortDate")], ["alpha", t("sortAlpha")]]}
            onChange={(s) => { const p = parseSort(s); setSortBy({ k: p.field === "date" ? "age" : "tag", d: p.dir }); }} />
        </FilterGroup>
      </SearchFilterBar>

      <DeskCard pad={0} title={`✦ ${t("herdOverview")}`}>
        <div className="adapt-grid" style={{ gap: 0 }}>
          <div className="hero-stat">
            <span>{t("totalHeads")}</span>
            <div style={{ fontFamily: "var(--mono)", fontSize: 29, fontWeight: 800, marginTop: 5, color: C.ink }}>{nf(totalHeads)}</div>
            <small>{nf(animals.length)} {t("rows")}</small>
          </div>
          {[
            ["🐾", t("perSpecies"), speciesSummary || "—", C.field],
            ["🍼", statusLabel("pregnant", lang), nf(pregnantCount), C.amber],
            ["⚠️", t("needsAttention"), nf(attentionCount || sickCount), attentionCount ? C.red : C.green],
          ].map(([ic, lb, val, tone]) => <div key={lb} style={{ padding: "15px 16px", borderInlineStart: `1px solid ${C.line}`,
            display: "grid", alignContent: "center", minHeight: 78 }}>
            <div style={{ color: C.inkSoft, fontSize: 11.5, fontWeight: 700 }}>{ic} {lb}</div>
            <div style={{ color: tone, fontFamily: "var(--mono)", fontSize: 17, fontWeight: 800, marginTop: 7 }}>{val}</div>
          </div>)}
        </div>
      </DeskCard>

      <div className="desk-split" style={{ display: "grid", gridTemplateColumns: selAnimal ? "minmax(0,1fr) 310px" : "1fr", gap: 14, alignItems: "start" }}>
        <DeskCard pad={0} title={`🐾 ${t("animalDirectory")} · ${herdRows.length}${herdRows.length !== animals.length ? ` / ${animals.length}` : ""}`}>
          {animals.length === 0 ? <div style={{ padding: 24 }}>
            <Empty icon="🐄" title={t("noAnimals")} sub={t("noAnimalsSub")} cta={`＋ ${t("addAnimal")}`}
              onCta={() => setSheet({ k: "addAnimal" })} /></div>
            : herdRows.length === 0 ? <div style={{ padding: 24 }}>
              <Empty icon="🔎" title={t("noAnimalsMatch")} sub={t("noAnimalsMatchSub")}
                cta={t("clearFilters")} onCta={clearHerdFilters} /></div>
              : <DataList
                  cards={herdRows.map((a) => (
                    <AnimalCard key={a.id} a={a} lang={lang} t={t} today={todayProd(a)}
                      last={entries.find((e) => e.animalId === a.id)}
                      onClick={() => setSel(a.id)} />
                  ))}
                  table={
                <div className="overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {head("tag", t("colName"))}{head("sp", t("species"))}{head("st", t("status"))}
                    {head("breed", t("breed"))}{head("age", t("age"))}
                  </tr></thead>
                  <tbody>
                    {herdRows.map((a) => <tr key={a.id} onClick={() => setSel(a.id)}
                      className={statusRowClass(a.status)}
                      onContextMenu={(e) => openCtx(e, [
                        { key: "open", icon: "👁", label: t("ctxOpen"), run: () => setSel(a.id) },
                        { key: "edit", icon: "✏️", label: t("ctxEdit"), run: () => setSheet({ k: "editAnimal", id: a.id, back: null }) },
                      ])}
                      style={{ cursor: "pointer", background: sel === a.id ? C.paper : "transparent" }}>
                      <Td strong><span style={{ color: spOf(a).color }}>{spOf(a).icon}</span> {animalLabel(a)}</Td>
                      <Td tone={C.inkSoft}>{spName(a.species, lang, true)}</Td>
                      <Td><Stamp status={a.status} lang={lang} /></Td>
                      <Td tone={C.inkSoft}>{breedLabel(a, lang)}</Td>
                      <Td tone={C.inkSoft}>{isFlock(a) ? `${nf(a.birds)} ${t("birds")}` : ageText(a, lang)}</Td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
                />
              }
        </DeskCard>

        {selAnimal && <DeskCard title={`${spOf(selAnimal).icon} ${animalLabel(selAnimal)}`}
          right={<button type="button" onClick={() => setSel(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.inkSoft }}>✕</button>}>
          <div style={{ width: "100%", height: 110, borderRadius: 6, background: C.paper, border: `1px solid ${C.line}`,
            display: "grid", placeItems: "center", fontSize: 44, overflow: "hidden", marginBottom: 12 }}>
            {selAnimal.photo ? <img src={selAnimal.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : spOf(selAnimal).icon}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft, marginBottom: 5 }}>{t("basicDetails")}</div>
          <Row k={t("species")} v={spName(selAnimal.species, lang, true)} />
          <Row k={t("status")} v={<Stamp status={selAnimal.status} lang={lang} />} />
          <Row k={t("breed")} v={breedLabel(selAnimal, lang)} />
          {isFlock(selAnimal)
            ? <><Row k={t("birds")} v={nf(selAnimal.birds)} />{selAnimal.coop && <Row k={t("coop")} v={selAnimal.coop} />}</>
            : <Row k={t("age")} v={ageText(selAnimal, lang)} />}
          {selAnimal.notes && <div style={{ marginTop: 9, padding: "9px 10px", borderRadius: 4, background: C.paper,
            color: C.inkSoft, fontSize: 12.5 }}>📝 {selAnimal.notes}</div>}
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button type="button" style={primaryBtn} onClick={() => setSheet({ k: "animal", id: selAnimal.id })}>
              {t("moreDetails")} ›</button>
            <button type="button" style={secondaryBtn} onClick={() => setSheet({ k: "editAnimal", id: selAnimal.id, back: null })}>
              ✏️ {t("edit")}</button>
          </div>
        </DeskCard>}
      </div>
    </div>
  );

  const milkU = milkUnitLb(milkUnit, t);
  const liveStock = milkStock(entries);
  const draftAm = parseMilkQty(bulkFor("am"));
  const draftPm = parseMilkQty(bulkFor("pm"));
  const draftTotal = draftAm + draftPm;
  const draftAmL = milkToLiters(draftAm, milkUnit);
  const draftPmL = milkToLiters(draftPm, milkUnit);
  const draftStock = (() => {
    const savedDay = milkDayProduced(entries, entryDate);
    const delta = (draftAmL + draftPmL) - savedDay;
    if (Math.abs(delta) < 0.001) return liveStock;
    const fake = [
      { type: "milkBulk", session: "am", liters: draftAmL, kg: milkPack(draftAm, milkUnit).kg, unit: milkUnit,
        at: dayStamp(entryDate), id: "__draft_am__", byName: me?.name },
      { type: "milkBulk", session: "pm", liters: draftPmL, kg: milkPack(draftPm, milkUnit).kg, unit: milkUnit,
        at: dayStamp(entryDate), id: "__draft_pm__", byName: me?.name },
      ...(entries || []).filter((e) => !(e.type === "milkBulk" && dayKey(e.at) === entryDate)
        && !(e.type === "milk" && dayKey(e.at) === entryDate)),
    ];
    return milkStock(fake);
  })();

  const commitDayMilk = () => {
    const unit = milkUnit;
    const amP = milkPack(draftAm, unit);
    const pmP = milkPack(draftPm, unit);
    const es = [
      { type: "milkBulk", session: "am", ...amP, at: sessionStamp(entryDate, "am") },
      { type: "milkBulk", session: "pm", ...pmP, at: sessionStamp(entryDate, "pm") },
    ];
    const patch = { settings: { ...S, milkMode: "total", milkUnit: unit } };
    const log = unit !== milkUnitOf(S.milkUnit)
      ? [...es, { type: "setting", field: "milkUnit", value: unit }]
      : es;
    commit(log, patch);
    setBatch({});
    setMilkUnitDraft(null);
  };

  const DeskEntry = (
    <div style={{ display: "grid", gap: 14, maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <DeskCard pad={0} title={`🥛 ${t("addMilkStock")}`}
        right={<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" className="dk-pill" title={t("prevDay")} onClick={() => {
            const d = new Date(entryDate); d.setDate(d.getDate() - 1); setEntryDate(dayKey(d)); setBatch({});
          }}>‹</button>
          <DatePick compact value={entryDate} max={dayKey(Date.now())}
            onChange={(v) => { if (v && v <= dayKey(Date.now())) { setEntryDate(v); setBatch({}); } }} />
          <button type="button" className="dk-pill" title={t("nextDay")} disabled={entryDate >= dayKey(Date.now())}
            onClick={() => {
              if (entryDate >= dayKey(Date.now())) return;
              const d = new Date(entryDate); d.setDate(d.getDate() + 1);
              const next = dayKey(d); if (next <= dayKey(Date.now())) { setEntryDate(next); setBatch({}); }
            }}>›</button>
        </div>}>
        <div style={{ padding: 22, display: "grid", gap: 16 }}>
          <div className="milk-am-pm">
            {[["am", `🌅 ${t("morningMilk")}`], ["pm", `🌙 ${t("eveningMilk")}`]].map(([sess, label]) => (
              <div key={sess} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 14px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>{label}</div>
                <input value={bulkFor(sess)} inputMode="decimal" onFocus={(e) => e.target.select()}
                  onChange={(e) => setBatch((p) => ({ ...p, [`bulk:${sess}`]: e.target.value.replace(/[^0-9.]/g, "") }))}
                  placeholder="0" aria-label={label}
                  style={{ width: "100%", textAlign: "center", padding: "14px 8px", borderRadius: 8,
                    border: `1.5px solid ${C.field}`, background: C.card,
                    fontFamily: "var(--mono)", fontWeight: 800, fontSize: 34, color: C.ink, outline: "none" }} />
                {milkEqHint(bulkFor(sess), milkUnit, t)}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>
            {t("milkDensityHint")}</div>

          <MilkStockCard stock={draftStock} lang={lang} t={t} unit={milkUnit} simple
            onUse={() => setSheet({ k: "milkUse" })} />

          <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "center", fontWeight: 600 }}>
            {t("dayMilkTotal")}: {n1(draftTotal)} {milkU}
            {` · ${t("morningMilk")} ${n1(draftAm)} · ${t("eveningMilk")} ${n1(draftPm)}`}
          </div>

          <button type="button" disabled={busy} onClick={commitDayMilk}
            style={{ ...primaryBtn, padding: "14px 18px", fontSize: 16, opacity: busy ? .5 : 1 }}>
            ✓ {t("saveDayMilk")}</button>
        </div>
      </DeskCard>

      {eggFlocks.length > 0 && (
        <DeskCard pad={0} title={`🥚 ${t("eggsTodayBlock")}`}
          right={<button type="button" className="dk-pill" onClick={() => setEggOpen((o) => !o)}>
            {eggOpen ? "▾" : "▸"}
          </button>}>
          {eggOpen && <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>{t("colName")}</Th>
                  <Th align="center">{L(lang, "العدد", "Count")}</Th>
                  <Th align="center">{L(lang, "المكسور", "Broken")}</Th>
                </tr></thead>
                <tbody>
                  {eggFlocks.map((a, rowIdx) => (
                    <tr key={a.id}>
                      <Td strong>{spOf(a).icon} {animalLabel(a)}</Td>
                      <Td align="center"><input value={bVal(a, "am")} inputMode="decimal" data-cell={`e${rowIdx}:am`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setB(a, "am", e.target.value.replace(/[^0-9.]/g, ""))}
                        style={{ width: 100, textAlign: "center", padding: "8px", borderRadius: 3, border: `1px solid ${C.line}`,
                          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }} /></Td>
                      <Td align="center"><input value={bVal(a, "pm")} inputMode="decimal"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setB(a, "pm", e.target.value.replace(/[^0-9.]/g, ""))}
                        style={{ width: 100, textAlign: "center", padding: "8px", borderRadius: 3, border: `1px solid ${C.line}`,
                          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16 }} /></Td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${C.line}` }}>
              <button type="button" style={{ ...primaryBtn, width: "auto" }} onClick={() => {
                const at = dayStamp(entryDate); const es = [];
                eggFlocks.forEach((a) => {
                  const amK = batchKey(a.id, "am"), pmK = batchKey(a.id, "pm");
                  if (!(amK in batch || pmK in batch)) return;
                  es.push({ type: "eggs", animalId: a.id, count: +bVal(a, "am") || 0, broken: +bVal(a, "pm") || 0, at });
                });
                if (!es.length) return ping(t("nothingChanged"));
                commit(es); setBatch((p) => {
                  const n = { ...p }; eggFlocks.forEach((a) => { delete n[batchKey(a.id, "am")]; delete n[batchKey(a.id, "pm")]; });
                  return n;
                });
              }}>✓ {t("save")}</button>
            </div>
          </>}
        </DeskCard>
      )}

      {milkAnimals.length === 0 && eggFlocks.length === 0 && (
        <Empty icon="🐄" title={t("noAnimals")} sub={t("noAnimalsSub")}
          cta={`＋ ${t("addAnimal")}`} onCta={() => setSheet({ k: "addAnimal" })} />)}

      <DeskCard pad={0} title={`📋 ${t("milkStockLog")} · ${milkLogView.rows.length}`}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
          <SearchFilterBar t={t}
            activeCount={(milkLogFilt.sess !== "all" ? 1 : 0) + (milkLogFilt.from || milkLogFilt.to ? 1 : 0) + ((milkLogFilt.sort || "newest") !== "newest" ? 1 : 0)}
            onReset={() => setMilkLogFilt({ sess: "all", from: "", to: "", sort: "newest" })}
            chips={[
              milkLogFilt.sess !== "all" ? { key: "sess", label: milkLogFilt.sess === "pm" ? t("eveningMilk") : t("morningMilk"),
                onRemove: () => setMilkLogFilt((p) => ({ ...p, sess: "all" })) } : null,
              milkLogFilt.from || milkLogFilt.to ? { key: "range", label: `${milkLogFilt.from ? dmy(milkLogFilt.from) : "…"} → ${milkLogFilt.to ? dmy(milkLogFilt.to) : "…"}`,
                onRemove: () => setMilkLogFilt((p) => ({ ...p, from: "", to: "" })) } : null,
              (milkLogFilt.sort || "newest") !== "newest" ? { key: "sort", label: sortChipLabel(t, milkLogFilt.sort),
                onRemove: () => setMilkLogFilt((p) => ({ ...p, sort: "newest" })) } : null,
            ].filter(Boolean)}>
            <FilterGroup label={t("milkSession")}>
              {[["all", t("milkSessionAll")], ["am", t("morningMilk")], ["pm", t("eveningMilk")]].map(([k, lb]) => (
                <Chip key={k} active={milkLogFilt.sess === k}
                  onClick={() => setMilkLogFilt((p) => ({ ...p, sess: k }))}>{lb}</Chip>))}
            </FilterGroup>
            <FilterGroup label={t("customRange")}>
              <DateFilterPills t={t} from={milkLogFilt.from} to={milkLogFilt.to}
                onChange={(from, to) => setMilkLogFilt((p) => ({ ...p, from, to }))} />
            </FilterGroup>
            <FilterGroup label={t("sortBy")}>
              <SortPair t={t} sort={milkLogFilt.sort || "newest"}
                onChange={(sort) => setMilkLogFilt((p) => ({ ...p, sort }))} />
            </FilterGroup>
          </SearchFilterBar>
        </div>

        <div style={{ padding: "12px 14px" }} className="adapt-grid">
          <Kpi label={t("milkLogPreview")} value={`${n1(milkFromLiters(milkLogView.totalQty, milkUnit))} ${milkU}`} tone={C.field} />
          <Kpi label={t("morningMilk")} value={`${n1(milkFromLiters(milkLogView.amQty, milkUnit))} ${milkU}`} />
          <Kpi label={t("eveningMilk")} value={`${n1(milkFromLiters(milkLogView.pmQty, milkUnit))} ${milkU}`} />
          <Kpi label={t("txCount")} value={nf(milkLogView.rows.length)} tone={C.inkSoft} />
        </div>

        <DataList
          empty={milkLogView.rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>{t("milkLogEmpty")}</div> : null}
          cards={milkLogView.rows.map((r) => (
            <DataCard key={r.key || r.day} kind="day"
              status={<StatusPill status="day">{t("dayMilkTotal")}</StatusPill>}
              title={dmy(r.day)}
              subtitle={hhmm(new Date(r.loggedAt || r.at))}
              who={<WhoHint e={r} lang={lang} />}
              meta={`🌅 ${n1(milkFromLiters(r.am || 0, milkUnit))} · 🌙 ${n1(milkFromLiters(r.pm || 0, milkUnit))} · ${n1(milkFromLiters(r.total || 0, milkUnit))} ${milkU}`}
              onClick={() => { setEntryDate(r.day); setBatch({}); }}
            />
          ))}
          table={
        <div className="overflow-x-auto">
          {milkLogView.rows.length === 0
            ? null
            : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>
                <Th>{t("colDate")}</Th>
                <Th>{t("colTime")}</Th>
                <Th align="end">{t("morningMilk")}</Th>
                <Th align="end">{t("eveningMilk")}</Th>
                <Th align="end">{t("dayMilkTotal")}</Th>
                <Th>{t("milkUnit")}</Th>
                <Th>{t("colUser")}</Th>
              </tr></thead>
              <tbody>
                {milkLogView.rows.map((r) => (
                  <tr key={r.key || r.day} className={statusRowClass("day")} style={{ cursor: "pointer" }}
                    onClick={() => { setEntryDate(r.day); setBatch({}); }}>
                    <Td mono>{dmy(r.day)}</Td>
                    <Td mono tone={C.inkSoft}>{hhmm(new Date(r.loggedAt || r.at))}</Td>
                    <Td align="end" mono>{n1(milkFromLiters(r.am || 0, milkUnit))}</Td>
                    <Td align="end" mono>{n1(milkFromLiters(r.pm || 0, milkUnit))}</Td>
                    <Td align="end" mono strong>{n1(milkFromLiters(r.total || 0, milkUnit))}</Td>
                    <Td tone={C.inkSoft}>{milkU}</Td>
                    <Td align="center"><WhoHint e={r} lang={lang} /></Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: C.paper, borderTop: `2px solid ${C.rule}` }}>
                  <Td colSpan={2} strong>{t("milkLogPreview")}</Td>
                  <Td align="end" mono>{n1(milkLogView.amQty)}</Td>
                  <Td align="end" mono>{n1(milkLogView.pmQty)}</Td>
                  <Td align="end" mono strong tone={C.field}>{n1(milkLogView.totalQty)}</Td>
                  <Td tone={C.inkSoft}>{milkU}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>}
        </div>
          }
        />
      </DeskCard>

      <DeskCard pad={0} title={`🥛 ${t("milkUseHistory")} · ${milkUseLog.rows.length}`}
        right={<button type="button" className="dk-pill" onClick={() => setSheet({ k: "milkUse" })}>− {t("milkUse")}</button>}>
        <DataList
          empty={milkUseLog.rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>{t("milkUseEmpty")}</div> : null}
          cards={milkUseLog.rows.map((e) => (
            <DataCard key={e.id} kind="day"
              status={<StatusPill status="day">{t("milkUse")}</StatusPill>}
              title={milkUseLabel(e, t)}
              subtitle={`${dmy(e.at)} · ${hhmm(e.loggedAt || e.at)}`}
              who={<WhoHint e={e} lang={lang} />}
              meta={milkKgLine(e, t)}
            />
          ))}
          table={
        <div className="overflow-x-auto">
          {milkUseLog.rows.length === 0
            ? null
            : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead><tr>
                <Th>{t("colDate")}</Th>
                <Th>{t("colTime")}</Th>
                <Th>{t("lossReason")}</Th>
                <Th align="end">{t("qty")}</Th>
                <Th>{t("colUser")}</Th>
              </tr></thead>
              <tbody>
                {milkUseLog.rows.map((e) => (
                  <tr key={e.id} className={statusRowClass("day")}>
                    <Td mono>{dmy(e.at)}</Td>
                    <Td mono tone={C.inkSoft}>{hhmm(e.loggedAt || e.at)}</Td>
                    <Td>{milkUseLabel(e, t)}</Td>
                    <Td align="end" mono strong>{milkKgLine(e, t)}</Td>
                    <Td align="center"><WhoHint e={e} lang={lang} /></Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: C.paper, borderTop: `2px solid ${C.rule}` }}>
                  <Td colSpan={3} strong>{t("milkUsed")}</Td>
                  <Td align="end" mono strong tone={C.field}>{n1(milkFromLiters(milkUseLog.totalQty, "kg"))} {t("kg")}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>}
        </div>
          }
        />
      </DeskCard>
    </div>
  );

  const DeskSales = (
    <div style={{ display: "grid", gap: 14 }}>
      {/* open accounts, minimised into named tabs */}
      {openAcc.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginInlineEnd: 4 }}>{t("accounts")}</span>
          {openAcc.map((id) => { const c = customers.find((x) => x.id === id); if (!c) return null;
            const due = (ledger.byCustomer[id] || {}).due || 0;
            const on = selCust === id;
            return <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6,
              background: on ? C.field : C.paper, color: on ? "#fff" : C.ink,
              border: `1px solid ${on ? C.field : C.line}`, borderBottom: `3px solid ${on ? C.field : C.line}`,
              borderRadius: "4px 4px 0 0", padding: "7px 10px", fontSize: 13.5, fontWeight: 600 }}>
              <button onClick={() => { setSelCust(id); }}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer",
                  fontFamily: "var(--body)", fontWeight: 600, fontSize: 13.5, padding: 0 }}>
                {customerLabel(c, t)}{due > 0 ? <span style={{ fontFamily: "var(--mono)", opacity: .8 }}> · {fmtC(due, S.rate, lang)}</span> : ""}</button>
              <button onClick={() => closeAccount(id)} title={t("closeTab")}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: .7, padding: 0, fontSize: 13 }}>✕</button>
            </span>; })}
        </div>)}

      {selCustomer
        ? <DeskCard title={`🧾 ${customerLabel(selCustomer, t)}`}
            right={<div style={{ display: "flex", gap: 7 }}>
              <button className="dk-pill" onClick={() => setSheet({ k: "docgen", id: selCustomer.id, cid: selCustomer.id, kinds: ["statement"] })}>🖨️ {t("statement")}</button>
              <button className="dk-pill" onClick={() => setSelCust(null)}>‹ {t("backToCustomers")}</button>
            </div>}>
            <CustomerAccount customer={selCustomer} ledger={ledger} entries={entries} lang={lang} t={t} S={S} wide onCtx={openCtx}
              no={accNo(customers, selCustomer.id)} onExport={() => doAccountExcel(selCustomer)}
              tab={accTab} setTab={setAccTab} filters={txFilters} setFilters={setTxFilters}
              onNewSale={() => setSheet({ k: "newSale", cid: selCustomer.id })}
              onPayment={() => setSheet({ k: "payment", cid: selCustomer.id })}
              onEdit={(iv) => setSheet({ k: "editSale", id: iv.id, cid: selCustomer.id })}
              onDeleteTx={(iv) => setSheet({ k: "confirmDeleteEntry", id: iv.id, back: { k: null } })}
              onEditPay={(p) => setSheet({ k: "editMoney", id: p.id })}
              onDoc={(iv) => setSheet({ k: "docgen", id: iv.id, cid: selCustomer.id,
                kinds: isOwing(iv.due) || !isOwing(iv.paidAmount) ? ["invoice", "statement"] : ["invoice", "receipt", "statement"] })}
              onManage={() => setSheet({ k: "customerManage", cid: selCustomer.id })} />
          </DeskCard>
        : <DeskCard pad={0} title={`🤝 ${t("customers")} · ${activeCustomers.length}`}
            right={<div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13.5 }}
                onClick={() => setSheet({ k: "addCustomer" })}>＋ {t("addCustomer")}</button>
              <button style={{ ...secondaryBtn, width: "auto", padding: "8px 12px", fontSize: 13.5 }}
                onClick={() => setSheet({ k: "quickSale" })}>⚡ {t("quickSale")}</button>
              <button style={{ ...primaryBtn, width: "auto", padding: "8px 13px", fontSize: 13.5 }}
                onClick={() => setSheet({ k: "newSale" })}>🧾 {t("newSale")}</button></div>}>
            {activeCustomers.length === 0
              ? <div style={{ padding: 24 }}><Empty icon="🤝" title={t("noCustomers")} sub={t("noCustomersSub")}
                  cta={`＋ ${t("addCustomer")}`} onCta={() => setSheet({ k: "addCustomer" })} /></div>
              : <>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}` }}>
                  <SearchFilterBar t={t} q={custQ} onQ={setCustQ} qPlaceholder={t("searchCustomers")}
                    activeCount={custSort !== "nameAsc" ? 1 : 0}
                    onReset={() => { setCustQ(""); setCustSort("nameAsc"); }}
                    chips={custSort !== "nameAsc" ? [{ key: "sort", label: (custSortOpts.find((o) => o[0] === custSort) || [])[1] || custSort,
                      onRemove: () => setCustSort("nameAsc") }] : []}>
                    <FilterGroup label={t("sortBy")}>
                      {custSortOpts.map(([k, lb]) => (
                        <Chip key={k} active={custSort === k} onClick={() => setCustSort(k)}>{lb}</Chip>))}
                    </FilterGroup>
                  </SearchFilterBar>
                </div>
                <DataList
                  cards={sortedCustomers.map((c) => {
                    const pr = PRODUCTS.find((x) => x[0] === (c.product || "milk")) || PROD_MILK;
                    const due = (ledger.byCustomer[c.id] || {}).due || 0;
                    const kind = due > 0.009 ? "owing" : "clear";
                    return (
                      <DataCard key={c.id} kind={kind}
                        status={<StatusPill status={kind}>{due > 0.009 ? t("outstanding") : t("statusClear")}</StatusPill>}
                        title={customerLabel(c, t)}
                        subtitle={`${accNo(customers, c.id)}${isWalkInCustomer(c) ? ` · ${t("walkInHint")}` : c.phone ? ` · ${c.phone}` : ""} · ${pr[1]} ${lang === "ar" ? pr[2] : pr[3]}`}
                        meta={c.defaultQty ? `${t("dailyQty")} ${nf(c.defaultQty)}` : undefined}
                        onClick={() => openAccount(c.id)}
                        actions={<button type="button" className="dk-pill" onClick={(ev) => { ev.stopPropagation(); openAccount(c.id); }}>
                          {t("openAccount")} ›</button>}
                      />
                    );
                  })}
                  table={
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <Th w={100}>{t("accountNo")}</Th>
                      <Th>{t("customerName")}</Th>
                      <Th w={130}>{t("phone")}</Th>
                      <Th w={120}>{t("product")}</Th>
                      <Th w={100} align="end">{t("dailyQty")}</Th>
                      <Th w={90} align="center">{t("actions")}</Th>
                    </tr></thead>
                    <tbody>
                      {sortedCustomers.map((c) => {
                        const pr = PRODUCTS.find((x) => x[0] === (c.product || "milk")) || PROD_MILK;
                        const due = (ledger.byCustomer[c.id] || {}).due || 0;
                        return <tr key={c.id} onClick={() => openAccount(c.id)}
                          className={statusRowClass(due > 0.009 ? "owing" : "clear")}
                          onContextMenu={(e) => openCtx(e, [
                            { key: "open", icon: "👁", label: t("ctxOpen"), run: () => openAccount(c.id) },
                            { key: "sale", icon: "🧾", label: t("ctxSale"), run: () => { openAccount(c.id); setSheet({ k: "newSale", cid: c.id }); } },
                            { key: "pay", icon: "💵", label: t("ctxPay"), run: () => { openAccount(c.id); setSheet({ k: "payment", cid: c.id }); } },
                            { key: "stmt", icon: "🖨️", label: t("statement"), run: () => setSheet({ k: "docgen", id: c.id, cid: c.id, kinds: ["statement"] }) },
                            "—",
                            { key: "manage", icon: "⚙️", label: t("ctxManage"), run: () => setSheet({ k: "customerManage", cid: c.id }) },
                          ])}
                          style={{ cursor: "pointer" }}>
                          <Td mono tone={C.inkSoft}>{accNo(customers, c.id)}</Td>
                          <Td strong>{customerLabel(c, t)}</Td>
                          <Td tone={C.inkSoft}>{c.phone || t("noPhone")}</Td>
                          <Td tone={C.inkSoft}>{pr[1]} {lang === "ar" ? pr[2] : pr[3]}</Td>
                          <Td align="end" mono tone={C.inkSoft}>{c.defaultQty ? nf(c.defaultQty) : "—"}</Td>
                          <Td align="center"><button type="button" onClick={(ev) => { ev.stopPropagation(); openAccount(c.id); }}
                            className="dk-pill">{t("openAccount")} ›</button></Td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>}
                />
              </>}
          </DeskCard>}
    </div>
  );

  const filteredSuppliers = activeSuppliers.filter((s) => {
    const bal = supplierLedger.bySupplier[s.id] || { due: 0, overdueDue: 0 };
    const st = (bal.overdueDue || 0) > 0.009 ? "overdue" : bal.due > 0.009 ? "owing" : "clear";
    if (suppSt !== "all" && st !== suppSt) return false;
    if (!suppQ.trim()) return true;
    const q = suppQ.toLowerCase();
    return `${s.name} ${s.phone || ""} ${(s.tags || []).join(" ")}`.toLowerCase().includes(q);
  }).slice().sort((a, b) => {
    const locale = lang === "ar" ? "ar" : "en";
    if (suppSort === "amountDesc" || suppSort === "amountAsc") {
      const da = (supplierLedger.bySupplier[a.id] || {}).due || 0;
      const db = (supplierLedger.bySupplier[b.id] || {}).due || 0;
      return (toCents(da) - toCents(db)) * (suppSort === "amountAsc" ? 1 : -1) || a.name.localeCompare(b.name, locale, { sensitivity: "base" });
    }
    const d = a.name.localeCompare(b.name, locale, { sensitivity: "base" });
    return parseSort(suppSort).dir === "desc" ? -d : d;
  });

  const DeskSuppliers = (
    <div style={{ display: "grid", gap: 14 }}>
      {openSupp.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginInlineEnd: 4 }}>{t("supplierAccounts")}</span>
          {openSupp.map((id) => { const s = suppliers.find((x) => x.id === id); if (!s) return null;
            const due = (supplierLedger.bySupplier[id] || {}).due || 0;
            const on = selSupp === id;
            return <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6,
              background: on ? C.field : C.paper, color: on ? "#fff" : C.ink,
              border: `1px solid ${on ? C.field : C.line}`, borderBottom: `3px solid ${on ? C.field : C.line}`,
              borderRadius: "4px 4px 0 0", padding: "7px 10px", fontSize: 13.5, fontWeight: 600 }}>
              <button type="button" onClick={() => { setSelSupp(id); setSuppTab("open"); }}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer",
                  fontFamily: "var(--body)", fontWeight: 600, fontSize: 13.5, padding: 0 }}>
                {s.name}{due > 0 ? <span style={{ fontFamily: "var(--mono)", opacity: .8 }}> · {fmtC(due, S.rate, lang)}</span> : ""}</button>
              <button type="button" onClick={() => closeSupplier(id)} title={t("closeTab")}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: .7, padding: 0, fontSize: 13 }}>✕</button>
            </span>; })}
        </div>)}

      {selSupplier
        ? <DeskCard title={`🤝 ${selSupplier.name}`}
            right={<div style={{ display: "flex", gap: 7 }}>
              <button type="button" className="dk-pill"
                onClick={() => setSheet({ k: "supplierBill", sid: selSupplier.id })}>＋ {t("logSupplierBill")}</button>
              <button type="button" className="dk-pill"
                onClick={() => setSheet({ k: "paySupplier", sid: selSupplier.id })}>💵 {t("paySupplier")}</button>
              <button type="button" className="dk-pill"
                onClick={() => setSheet({ k: "docgen", scope: "supplier", sid: selSupplier.id,
                  id: selSupplier.id, kinds: ["statement"] })}>🖨️ {t("statement")}</button>
              <button type="button" className="dk-pill" onClick={() => setSelSupp(null)}>‹ {t("backToSuppliers")}</button>
            </div>}>
            <SupplierAccount supplier={selSupplier} ledger={supplierLedger} entries={entries} lang={lang} t={t} S={S}
              no={supplierNo(suppliers, selSupplier.id)}
              tab={["open", "payments", "all", "activity"].includes(suppTab) ? suppTab : "open"} setTab={setSuppTab}
              onBill={() => setSheet({ k: "supplierBill", sid: selSupplier.id })}
              onPay={(billId) => setSheet({ k: "paySupplier", sid: selSupplier.id, billId: billId || null })}
              onDoc={(bill) => setSheet({ k: "docgen", scope: "supplier", sid: selSupplier.id,
                id: bill.id, kinds: ["purchase", "statement"] })}
              onEditBill={(id) => setSheet({ k: "supplierBill", sid: selSupplier.id, id })}
              onEditPay={(p) => setSheet({ k: "editMoney", id: p.id })}
              onManage={() => setSheet({ k: "editSupplier", sid: selSupplier.id })} />
          </DeskCard>
        : <DeskCard pad={0} title={`🤝 ${t("suppliers")} · ${activeSuppliers.length}`}
            right={<button type="button" style={{ ...primaryBtn, width: "auto", padding: "8px 13px", fontSize: 13.5 }}
              onClick={() => setSheet({ k: "addSupplier" })}>＋ {t("addSupplier")}</button>}>
            {activeSuppliers.length === 0
              ? <div style={{ padding: 24 }}><Empty icon="🤝" title={t("noSuppliers")} sub={t("noSuppliersSub")}
                  cta={`＋ ${t("addSupplier")}`} onCta={() => setSheet({ k: "addSupplier" })} /></div>
              : <>
                <div className="adapt-grid" style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: C.paper }}>
                  <Kpi label={t("supplierOutstanding")} value={fmtC(supplierDash.owed, S.rate, lang)}
                    tone={moneyColor("due", supplierDash.owed)} />
                  <Kpi label={t("supplierOverdueKpi")} value={fmtC(supplierDash.overdue, S.rate, lang)}
                    tone={moneyColor("due", supplierDash.overdue)} />
                  <Kpi label={t("supplierPaidMonth")} value={fmtC(supplierDash.paidMonth, S.rate, lang)} tone={C.green} />
                </div>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}` }}>
                  <SearchFilterBar t={t} q={suppQ} onQ={setSuppQ} qPlaceholder={t("searchSuppliers")}
                    activeCount={(suppSt !== "all" ? 1 : 0) + (suppSort !== "alphaAsc" ? 1 : 0)}
                    onReset={() => { setSuppSt("all"); setSuppSort("alphaAsc"); }}
                    chips={[
                      suppSt !== "all" ? { key: "st", label: suppSt === "overdue" ? t("statusOverdue") : suppSt === "owing" ? t("statusOwing") : t("statusClear"),
                        onRemove: () => setSuppSt("all") } : null,
                      suppSort !== "alphaAsc" ? { key: "sort", label: sortChipLabel(t, suppSort), onRemove: () => setSuppSort("alphaAsc") } : null,
                    ].filter(Boolean)}>
                    <FilterGroup label={t("colStatus")}>
                      {[["all", t("statusAll")], ["owing", t("statusOwing")], ["overdue", t("statusOverdue")], ["clear", t("statusClear")]].map(([k, lb]) => (
                        <Chip key={k} active={suppSt === k} onClick={() => setSuppSt(k)}>{lb}</Chip>))}
                    </FilterGroup>
                    <FilterGroup label={t("sortBy")}>
                      <SortPair t={t} sort={suppSort} onChange={setSuppSort}
                        fields={[["amount", t("sortAmount")], ["alpha", t("sortAlpha")]]} />
                    </FilterGroup>
                  </SearchFilterBar>
                </div>
                <DataList
                  cards={filteredSuppliers.map((s) => {
                    const bal = supplierLedger.bySupplier[s.id] || { bought: 0, paid: 0, due: 0, overdueDue: 0, lastAt: null };
                    const st = (bal.overdueDue || 0) > 0.009 ? "overdue" : bal.due > 0.009 ? "owing" : "clear";
                    const stLb = st === "overdue" ? t("statusOverdue") : st === "owing" ? t("statusOwing") : t("statusClear");
                    return (
                      <DataCard key={s.id} kind={st}
                        status={<StatusPill status={st}>{stLb}</StatusPill>}
                        title={s.name}
                        subtitle={`${supplierNo(suppliers, s.id)}${s.phone ? ` · ${s.phone}` : ""}`}
                        meta={`${t("weOwe")} ${fmtC(bal.due, S.rate, lang)} · ${t("lastActivity")} ${bal.lastAt ? dmy(bal.lastAt) : "—"}`}
                        onClick={() => openSupplier(s.id)}
                        actions={<button type="button" className="dk-pill" onClick={(ev) => { ev.stopPropagation(); openSupplier(s.id); }}>
                          {t("openSupplier")} ›</button>}
                      />
                    );
                  })}
                  table={
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <Th w={90}>{t("accountNo")}</Th>
                      <Th>{t("supplierName")}</Th>
                      <Th w={100}>{t("colStatus")}</Th>
                      <Th w={120} align="end">{t("weOwe")}</Th>
                      <Th w={110} align="end">{t("paidToSupplier")}</Th>
                      <Th w={120}>{t("lastActivity")}</Th>
                      <Th w={100} align="center">{t("actions")}</Th>
                    </tr></thead>
                    <tbody>
                      {filteredSuppliers.map((s) => {
                        const bal = supplierLedger.bySupplier[s.id] || { bought: 0, paid: 0, due: 0, overdueDue: 0, lastAt: null };
                        const st = (bal.overdueDue || 0) > 0.009 ? "overdue" : bal.due > 0.009 ? "owing" : "clear";
                        const stLb = st === "overdue" ? t("statusOverdue") : st === "owing" ? t("statusOwing") : t("statusClear");
                        return <tr key={s.id} onClick={() => openSupplier(s.id)} className={statusRowClass(st)} style={{ cursor: "pointer" }}>
                          <Td mono tone={C.inkSoft}>{supplierNo(suppliers, s.id)}</Td>
                          <Td strong>{s.name}
                            {s.phone ? <span style={{ display: "block", fontSize: 12, color: C.inkSoft, fontWeight: 500 }}>{s.phone}</span> : null}
                          </Td>
                          <Td><StatusPill status={st}>{stLb}</StatusPill></Td>
                          <Td align="end" mono strong tone={moneyColor("due", bal.due)}>{fmtC(bal.due, S.rate, lang)}</Td>
                          <Td align="end" mono tone={C.green}>{fmtC(bal.paid, S.rate, lang)}</Td>
                          <Td mono tone={C.inkSoft}>{bal.lastAt ? dmy(bal.lastAt) : "—"}</Td>
                          <Td align="center"><div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                            <button type="button" className="dk-pill" title={t("statement")}
                              onClick={(ev) => { ev.stopPropagation(); setSheet({ k: "docgen", scope: "supplier",
                                sid: s.id, id: s.id, kinds: ["statement"] }); }}>🖨️</button>
                            <button type="button" onClick={(ev) => { ev.stopPropagation(); openSupplier(s.id); }}
                              className="dk-pill">{t("openSupplier")} ›</button>
                          </div></Td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>}
                />
              </>}
          </DeskCard>}
    </div>
  );

  const DeskReports = (
    <div className="desk-report-split" style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 14, alignItems: "start" }}>
      <DeskCard pad={8}>
        <div style={{ display: "grid", gap: 4 }}>
          {[["summary", "📋"], ["charts", "📊"], ["pl", "💵"], ["expenses", "💸"], ["log", "🧾"]].map(([k, ic]) => (
            <button key={k} onClick={() => setReport(k)} style={{ display: "flex", alignItems: "center", gap: 9,
              background: report === k ? C.field : "transparent", color: report === k ? "#fff" : C.ink,
              border: "none", borderRadius: 3, padding: "10px 11px", cursor: "pointer", textAlign: "start",
              fontFamily: "var(--body)", fontWeight: 600, fontSize: 14 }}>
              <span>{ic}</span>{t(k)}</button>))}
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 10, display: "grid", gap: 7 }}>
          <button onClick={() => setSheet({ k: "reportPreview" })} style={{ ...primaryBtn, padding: "10px", fontSize: 14 }}>📄 PDF</button>
          <button onClick={doExcel} style={{ ...primaryBtn, padding: "10px", fontSize: 14, background: C.green }}>📊 Excel</button>
        </div>
      </DeskCard>
      <div style={{ display: "grid", gap: 14 }}>
        <SearchFilterBar t={t}
          extra={<span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>{me?.name || "—"} · {periodLabel}</span>}
          activeCount={range !== "today" ? 1 : 0}
          onReset={() => { setRange("today"); setFrom(""); setTo(""); }}
          chips={range !== "today" ? [{ key: "range", label: periodLabel, onRemove: () => { setRange("today"); setFrom(""); setTo(""); } }] : []}>
          <FilterGroup label={t("customRange")}>
            {["today", "week", "month", "custom"].map((r) => <Chip key={r} active={range === r} onClick={() => setRange(r)}>{t(r)}</Chip>)}
          </FilterGroup>
          {range === "custom" && <FilterGroup>
            <DatePick compact allowClear value={from} onChange={setFrom} ariaLabel={t("fromDate")} />
            <DatePick compact allowClear value={to} onChange={setTo} ariaLabel={t("toDate")} />
          </FilterGroup>}
        </SearchFilterBar>
        <ReportBody {...{ kind: report, lang, t, sums, prevSums, S, days, scoped: report === "log" ? scoped : financialScoped, animals, workers, customers,
          summaryLines, series, outstanding, scopedSales, ledger,
          onReceipt: (x) => setSheet({ k: "receipt", id: x.sourceExpenseId || x.id }) }} />
      </div>
    </div>
  );

  /* Every dialog is shared by both layouts: bottom sheets on a phone,
     centred modals on a desktop (handled purely in CSS). */
  const sheets = (<>
        {sheet?.k === "addAnimal" && <AnimalForm lang={lang} t={t} animals={animals} onClose={() => setSheet(null)}
          onSave={(a) => { const es = [{ type: "animalAdd", animalId: a.id, name: animalLabel(a) }];
            if (a.source === "bought" && a.price > 0) es.push({ type: "expense", category: "livestock", animalId: a.id, amount: a.price });
            commit(es, { animals: [...animals, a] }); setSheet(null); }} />}

        {sheet?.k === "editAnimal" && animal && <AnimalForm lang={lang} t={t} animals={animals} initial={animal}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onSave={(a) => { commit([{ type: "animalEdit", animalId: a.id, name: animalLabel(a) }],
            { animals: animals.map((x) => (x.id === a.id ? a : x)) });
            setSheet(sheet.back !== undefined ? sheet.back : { k: "animal", id: a.id }); }} />}

        {sheet?.k === "animal" && animal && (() => {
          const sp = spOf(animal), flock = isFlock(animal);
          const mine = entries.filter((e) => e.animalId === animal.id);
          return <Sheet title={`${sp.icon} ${animalLabel(animal)}`} sub={spName(animal.species, lang, true)} onClose={() => setSheet(null)}>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 96, height: 96, borderRadius: 6, background: `${sp.color}1A`, display: "grid",
                placeItems: "center", fontSize: 44, overflow: "hidden", flexShrink: 0 }}>
                {animal.photo ? <img src={animal.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : sp.icon}</div>
              <div style={{ flex: 1, display: "grid", gap: 3, alignContent: "center" }}>
                <Row k={t("status")} v={<Stamp status={animal.status} lang={lang} />} />
                <Row k={t("breed")} v={breedLabel(animal, lang)} />
                {flock ? <Row k={t("birds")} v={nf(animal.birds)} /> : <Row k={t("age")} v={ageText(animal, lang)} />}
                <Row k={t("today")} v={`${n1(todayProd(animal))} ${producesEggs(animal) ? t("eggsUnit") : t("L")}`} />
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 6, padding: 13, marginBottom: 12, boxShadow: sh1 }}>
              <Row k={t("expected")} v={animal.expected > 0 ? nf(animal.expected) : t("unknown")} />
              {!flock && <Row k={t("weight")} v={animal.weight > 0 ? `${nf(animal.weight)} ${t("kg")}` : t("unknown")} />}
              {!flock && <Row k={t("parity")} v={String(animal.parity || 0)} />}
              {flock && animal.coop && <Row k={t("coop")} v={animal.coop} />}
              <Row k={t("source")} v={animal.source === "bought" ? `${t("bought")}${animal.price ? ` · ${fmtC(animal.price, S.rate, lang)}` : ""}` : t("born")} />
              {animal.due && <Row k={t("dueIn")} v={`${Math.max(0, Math.ceil((new Date(animal.due) - Date.now()) / 864e5))} ${t("days")}`} />}
              {animal.medicine && <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 7, marginTop: 5,
                fontSize: 14, fontWeight: 700, color: C.red }}>💊 {animal.medicine}</div>}
              {animal.notes && <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 7, marginTop: 5,
                fontSize: 14, color: C.inkSoft, fontWeight: 500 }}>📝 {animal.notes}</div>}
            </div>
            <div style={{ display: "grid", gap: 9, marginBottom: 14 }}>
              <button style={primaryBtn} onClick={() => setSheet({ k: "prod", id: animal.id, back: { k: "animal", id: animal.id } })}>
                {producesEggs(animal) ? `🥚 ${t("collect")}` : `🥛 ${t("milk")}`}</button>
              <div style={{ display: "flex", gap: 9 }}>
                <button style={{ ...secondaryBtn, flex: 1 }} onClick={() => setSheet({ k: "med", pre: animal.id, back: { k: "animal", id: animal.id } })}>💉 {t("meds")}</button>
                <button style={{ ...secondaryBtn, flex: 1 }} onClick={() => setSheet({ k: "editAnimal", id: animal.id, back: { k: "animal", id: animal.id } })}>✏️ {t("edit")}</button>
              </div>
              {!isFlock(animal) && <button style={{ ...secondaryBtn, borderColor: C.tag }}
                onClick={() => setSheet({ k: "repro", id: animal.id, back: { k: "animal", id: animal.id } })}>🍼 {t("repro")}
                {(() => { const r = repro(animal); return r ? ` · ${r.daysIn} ${t("days")}` : ""; })()}</button>}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("changeStatus")}</div>
            <div style={{ marginBottom: 14 }}>
              <StatusChoice value={animal.status} options={sp.statuses} lang={lang}
                onChange={(k) => commit([{ type: "status", animalId: animal.id, status: k }],
                  { animals: animals.map((x) => (x.id === animal.id ? { ...x, status: k } : x)) })} />
            </div>
            {animal.status === "pregnant" && <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>
                {t("dueDate")} · {L(lang, `مدة الحمل ${sp.gestation} يومًا`, `gestation ${sp.gestation} days`)}</div>
              <DatePick value={animal.due ? dayKey(animal.due) : ""}
                onChange={(v) => commit([{ type: "due", animalId: animal.id, due: v }],
                  { animals: animals.map((x) => (x.id === animal.id ? { ...x, due: v } : x)) })} /></div>}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>{t("history")}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {mine.slice(0, 15).map((e) => <LogRow key={e.id} e={e} lang={lang} t={t} animals={animals} workers={workers} customers={customers} rate={S.rate} custom={S.categories} onReceipt={(x) => setSheet({ k: "receipt", id: x.id, back: sheet })} />)}
              {mine.length === 0 && <div style={{ color: C.inkSoft, fontWeight: 500, fontSize: 14 }}>{t("never")}</div>}
            </div>
          </Sheet>;
        })()}

        {sheet?.k === "bulkMilk" && (() => {
          const k = entryDate;
          const am = entries.find((x) => x.type === "milkBulk" && x.session === "am" && dayKey(x.at) === k);
          const pm = entries.find((x) => x.type === "milkBulk" && x.session === "pm" && dayKey(x.at) === k);
          return <BulkMilkSheet lang={lang} t={t} date={entryDate} setDate={setEntryDate} unit={milkUnit}
            existing={{ am: am ? milkRecordLiters(am) : 0, pm: pm ? milkRecordLiters(pm) : 0 }}
            lastAm={am} lastPm={pm}
            onClose={() => setSheet(null)}
            onSave={(v) => {
              const u = milkUnitOf(v.unit || milkUnit);
              const amP = milkPack(v.am, u);
              const pmP = milkPack(v.pm, u);
              commit([
                { type: "milkBulk", session: "am", ...amP, at: sessionStamp(k, "am") },
                { type: "milkBulk", session: "pm", ...pmP, at: sessionStamp(k, "pm") },
                { type: "setting", field: "milkUnit", value: u },
              ], { settings: { ...S, milkUnit: u, milkMode: "total" } });
              setSheet(null);
            }} />;
        })()}

        {sheet?.k === "milkUse" && <MilkUseSheet lang={lang} t={t} stock={milkStock(entries)} date={dayKey(Date.now())}
          savedReasons={S.milkUseReasons || []}
          onClose={() => setSheet(null)}
          onSave={(v) => {
            const saved = rememberNames(S.milkUseReasons, v.reasonLabel ? [v.reasonLabel] : []);
            commit([{ type: "milkUse", qty: v.liters, liters: v.liters, kg: v.kg,
              reason: v.reason, reasonLabel: v.reasonLabel || "",
              unit: "kg", at: v.at }],
              namesChanged(saved, S.milkUseReasons) ? { settings: { ...S, milkUseReasons: saved } } : null);
            setSheet(null);
          }} />}

        {sheet?.k === "pickProd" && <PickAnimalSheet title={`${sheet.produce === "eggs" ? `🥚 ${t("collect")}` : `🥛 ${t("milk")}`} · ${dayLabel(entryDate, lang)}`}
          animals={animals} lang={lang} t={t} onClose={() => setSheet(null)} onAdd={() => setSheet({ k: "addAnimal" })}
          filter={(a) => (sheet.produce === "eggs" ? producesEggs(a) : producesMilk(a) && a.status !== "dry")}
          onPick={(a) => setSheet({ k: "prod", id: a.id, back: { k: "pickProd", produce: sheet.produce } })}
          footer={sheet.produce === "milk" ? <button style={{ ...secondaryBtn, marginTop: 12 }}
            onClick={() => { commit([{ type: "setting", field: "milkMode", value: "total" }], { settings: { ...S, milkMode: "total" } });
              setSheet({ k: "bulkMilk" }); }}>🔀 {t("switchMode")} — {t("herdTotal")}</button> : null} />}

        {sheet?.k === "prod" && animal && (() => {
          const k = entryDate;
          const am = entries.find((x) => x.type === "milk" && x.animalId === animal.id && x.session === "am" && dayKey(x.at) === k);
          const pm = entries.find((x) => x.type === "milk" && x.animalId === animal.id && x.session === "pm" && dayKey(x.at) === k);
          const eg = entries.find((x) => x.type === "eggs" && x.animalId === animal.id && dayKey(x.at) === k);
          const at = dayStamp(k);
          return <ProdSheet animal={animal} lang={lang} t={t} date={entryDate} setDate={setEntryDate}
            existing={{ am: am ? am.liters : 0, pm: pm ? pm.liters : 0, count: eg ? eg.count : 0, broken: eg ? eg.broken : 0 }}
            lastAm={producesEggs(animal) ? eg : am} lastPm={pm}
            onClose={() => setSheet(null)}
            onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
            onSave={(v) => { if (producesEggs(animal)) commit([{ type: "eggs", animalId: animal.id, count: v.count, broken: v.broken, at }]);
              else commit([{ type: "milk", animalId: animal.id, session: "am", liters: v.am, at },
                { type: "milk", animalId: animal.id, session: "pm", liters: v.pm, at }]);
              setSheet(sheet.back || null); }} />;
        })()}

        {sheet?.k === "repro" && animal && <ReproSheet animal={animal} lang={lang} t={t}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onAct={(what, payload) => {
            const upd = (patch, entry) => { commit([entry], { animals: animals.map((x) => (x.id === animal.id ? { ...x, ...patch } : x)) }); };
            if (what === "service") upd({ served: payload.served, method: payload.method, status: "served", due: "" },
              { type: "service", animalId: animal.id, served: payload.served, method: payload.method });
            if (what === "pregnant") {
              const r = repro(animal);
              upd({ status: "pregnant", due: r ? dayKey(r.due) : "" },
                { type: "pregCheck", animalId: animal.id, result: "pregnant" });
            }
            if (what === "notPregnant") upd({ status: "healthy", served: "", due: "", method: "" },
              { type: "pregCheck", animalId: animal.id, result: "open" });
            if (what === "dry") upd({ status: "dry" }, { type: "dryOff", animalId: animal.id });
            if (what === "birth") { setSheet({ k: "birthConfirm", id: animal.id, back: sheet.back || { k: "animal", id: animal.id } }); return; }
            setSheet(sheet.back !== undefined ? sheet.back : { k: "animal", id: animal.id });
          }} />}

        {sheet?.k === "birthConfirm" && animal && <BirthSheet animal={animal}
          animals={[animal]} lang={lang} t={t}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet({ k: "repro", id: animal.id, back: sheet.back }) : () => setSheet({ k: "repro", id: animal.id, back: { k: "animal", id: animal.id } })}
          backLabel={t("backBtn")}
          onSave={(v) => { commit([{ type: "birth", ...v, animalId: animal.id }],
            { animals: animals.map((x) => (x.id === animal.id
              ? { ...x, status: "lactating", served: "", due: "", method: "", parity: (x.parity || 0) + 1 } : x)) });
            setSheet(sheet.back !== undefined ? sheet.back : { k: "animal", id: animal.id }); }} />}

        {sheet?.k === "med" && <MedSheet animals={animals} lang={lang} t={t} rate={S.rate} pre={sheet.pre}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onSave={(v) => { commit([{ type: "med", ...v }]); setSheet(sheet.back || null); }} />}

        {sheet?.k === "weight" && <WeightSheet animals={animals.filter((a) => spOf(a).weight)} lang={lang} t={t}
          onClose={() => setSheet(null)} onSave={(v) => { commit([{ type: "weight", ...v }],
            { animals: animals.map((x) => (x.id === v.animalId ? { ...x, weight: v.kg } : x)) }); setSheet(null); }} />}

        {sheet?.k === "loss" && <CountSheet title={t("losses")} icon="💀" animals={animals} lang={lang} t={t} mode="loss"
          onClose={() => setSheet(null)} onSave={(v) => { const a = animals.find((x) => x.id === v.animalId);
            const patch = a && isFlock(a) ? { animals: animals.map((x) => (x.id === a.id ? { ...x, birds: Math.max(0, (x.birds || 0) - v.count) } : x)) } : null;
            commit([{ type: "loss", ...v }], patch); setSheet(null); }} />}

        {sheet?.k === "birth" && <BirthSheet animals={animals} lang={lang} t={t}
          onClose={() => setSheet(null)} onSave={(v) => { const a = animals.find((x) => x.id === v.animalId);
            let patch = null;
            if (a && isFlock(a)) patch = { animals: animals.map((x) => (x.id === a.id ? { ...x, birds: (x.birds || 0) + v.count } : x)) };
            else if (a) patch = { animals: animals.map((x) => (x.id === a.id
              ? { ...x, status: "lactating", served: "", due: "", method: "", parity: (x.parity || 0) + 1 } : x)) };
            commit([{ type: "birth", ...v }], patch); setSheet(null); }} />}

        {sheet?.k === "receipt" && (() => {
          const previewReceipt = (src, title, sub, back = null) => setSheet({ k: "receiptPreview", src, title, sub, back });
          if (sheet.src) return <ReceiptSheet src={sheet.src} lang={lang} t={t}
            title={sheet.title || t("obligationDocs")} sub={sheet.sub || ""}
            onClose={() => setSheet(null)}
            onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
            onPrint={({ src, title, sub }) => previewReceipt(src, title, sub, sheet)} />;
          const e = entries.find((x) => x.id === sheet.id);
          if (!e || !e.receipt) return null;
          const title = e.type === "med" ? t("meds") : catLabel(e.category, lang, S.categories);
          const sub = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {`${dayKey(e.at)} · ${fmtC(e.amount ?? e.cost, S.rate, lang)}`}
              <WhoHint e={e} lang={lang} />
            </span>
          );
          return <ReceiptSheet src={e.receipt} lang={lang} t={t} title={title} sub={sub}
            onClose={() => setSheet(null)}
            onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
            onRemove={() => { updateEntry(e.id, { receipt: "" }); setSheet(sheet.back || null); }}
            onPrint={() => previewReceipt(e.receipt, title, sub, { k: "receipt", id: e.id, back: sheet.back })} />;
        })()}

        {sheet?.k === "addSupplier" && <SupplierForm lang={lang} t={t} suppliers={suppliers}
          onClose={() => setSheet(null)}
          onSave={(s) => {
            commit([{ type: "supplierAdd", name: s.name }], { suppliers: [...suppliers, s] });
            setSheet(null); navigate("suppliers", { clearSheet: false }); openSupplier(s.id); ping(t("supplierCreated"));
          }} />}

        {sheet?.k === "editSupplier" && (() => {
          const s = suppliers.find((x) => x.id === sheet.sid);
          if (!s) return null;
          return <SupplierForm lang={lang} t={t} suppliers={suppliers} initial={s}
            onClose={() => returnToSupplier(s.id)}
            onSave={(next) => {
              commit([{ type: "supplierAdd", name: next.name }], { suppliers: suppliers.map((x) => (x.id === s.id ? next : x)) });
              returnToSupplier(s.id); ping(t("saved"));
            }} />;
        })()}

        {sheet?.k === "supplierBill" && (() => {
          const s = suppliers.find((x) => x.id === sheet.sid);
          if (!s) return null;
          const raw = sheet.id
            ? entries.find((x) => x.id === sheet.id && x.type === "expense" && x.supplierId === s.id)
            : null;
          const lb = raw ? (supplierLedger.byBill || {})[raw.id] : null;
          const initial = raw && lb
            ? { ...raw, paidAmount: lb.paidAmount, payStatus: lb.status, dueDate: lb.dueDate || raw.dueDate }
            : raw;
          return <SupplierBillSheet key={sheet.id || "new-bill"} supplier={s} lang={lang} t={t} S={S}
            custom={S.categories} initial={initial || undefined} busy={busy}
            onClose={() => returnToSupplier(s.id)}
            onDelete={initial ? () => { deleteEntry(initial.id); returnToSupplier(s.id); } : undefined}
            onSave={(v) => {
              if (busy) return;
              if (initial) {
                const { list, sid, changed, expense } = resolveSupplierPatch({ ...v, id: initial.id });
                rewriteEntries((rows) => {
                  let next = (rows || []).map((x) => (x.id === initial.id
                    ? { ...x, ...expense, id: initial.id, type: "expense" } : x));
                  if (!next.some((x) => x.id === initial.id)) next = [{ type: "expense", ...expense }, ...next];
                  /* Keep existing linked pays (incl. overpay credit). Only add cash for an increase. */
                  const linkedC = next
                    .filter((x) => x.type === "supplierPay" && x.expenseId === initial.id)
                    .reduce((a, p) => a + toCents(p.amount), 0);
                  const wantC = toCents(supplierCashOut(expense));
                  if (wantC > linkedC) {
                    const now = iso(Date.now());
                    next = [{
                      type: "supplierPay", id: uid(), supplierId: expense.supplierId,
                      amount: fromCents(wantC - linkedC), method: expense.method || "cash",
                      vendor: expense.vendor, note: expense.note || "", at: expense.at,
                      expenseId: initial.id, loggedAt: now,
                      byId: me?.id || null, byName: me ? me.name : "—",
                    }, ...next];
                  }
                  const billC = toCents(expense.amount);
                  const paidC = Math.min(billC, next
                    .filter((x) => x.type === "supplierPay" && x.expenseId === initial.id)
                    .reduce((a, p) => a + toCents(p.amount), 0));
                  const payStatus = moneyStatus(billC, paidC);
                  next = next.map((x) => (x.id === initial.id
                    ? { ...x, paidAmount: fromCents(paidC), payStatus,
                      dueDate: payStatus === "paid" ? "" : (expense.dueDate || x.dueDate || "") }
                    : x));
                  return next;
                }, t("saved"));
                if (changed) commit([], { suppliers: list });
                returnToSupplier(sid || s.id);
                return;
              }
              const { es, list, sid, changed } = resolveSupplierPatch(v);
              commit(es, changed ? { suppliers: list } : null);
              returnToSupplier(sid || s.id);
            }} />;
        })()}

        {sheet?.k === "paySupplier" && (() => {
          const s = suppliers.find((x) => x.id === sheet.sid);
          if (!s) return null;
          return <PaySupplierSheet supplier={s} ledger={supplierLedger} lang={lang} t={t} S={S}
            preBillId={sheet.billId || null} busy={busy}
            onClose={() => returnToSupplier(s.id)}
            onSave={(v) => {
              if (busy) return;
              const openBills = supplierLedger.list
                .filter((x) => x.supplierId === s.id && x.due > 0.009)
                .slice().sort((a, c) => cmpTx(a, c, "oldest"));
              rewriteEntries((rows) => {
                const now = iso(Date.now());
                let remainC = toCents(v.amount);
                if (!(remainC > 0)) return rows || [];
                let next = [...(rows || [])];
                const stamp = {
                  supplierId: v.supplierId, method: v.method || "cash", note: v.note || "",
                  vendor: v.vendor, at: v.at, loggedAt: now,
                  byId: me?.id || null, byName: me ? me.name : "—",
                };
                const syncBill = (billId) => {
                  const bill = next.find((x) => x.id === billId && x.type === "expense");
                  if (!bill) return;
                  const billC = toCents(bill.amount);
                  const paidC = Math.min(billC, next
                    .filter((x) => x.type === "supplierPay" && x.expenseId === billId)
                    .reduce((a, p) => a + toCents(p.amount), 0));
                  const payStatus = moneyStatus(billC, paidC);
                  next = next.map((x) => (x.id === billId
                    ? { ...x, paidAmount: fromCents(paidC), payStatus,
                      dueDate: payStatus === "paid" ? "" : (x.dueDate || "") }
                    : x));
                };
                const post = (billId, payC) => {
                  if (!(payC > 0)) return;
                  next = [{ type: "supplierPay", id: uid(), ...stamp, amount: fromCents(payC),
                    expenseId: billId || null }, ...next];
                  if (billId) syncBill(billId);
                };
                if (v.expenseId) {
                  /* Full amount on the chosen bill — overpay becomes credit in the ledger. */
                  post(v.expenseId, remainC);
                  remainC = 0;
                } else {
                  for (const bill of openBills) {
                    if (remainC <= 0) break;
                    const dueC = toCents(bill.due);
                    const take = Math.min(remainC, dueC);
                    post(bill.id, take);
                    remainC -= take;
                  }
                  if (remainC > 0) post(null, remainC);
                }
                return next;
              }, t("saved"));
              returnToSupplier(s.id);
            }} />;
        })()}

        {sheet?.k === "expense" && <ExpenseSheet key={sheet.fresh || "expense"} lang={lang} t={t} S={S} custom={S.categories} species={speciesPresent}
          animals={animals} suppliers={activeSuppliers} preSupplierId={sheet.preSupplierId}
          onClose={() => (sheet.preSupplierId ? returnToSupplier(sheet.preSupplierId) : setSheet(null))}
          onSaveFeed={() => setSheet({ k: "feed", back: { k: "expense", preSupplierId: sheet.preSupplierId } })}
          onAddCategory={(c) => commit([{ type: "setting", field: "categories", value: 1 }],
            { settings: { ...S, categories: [...(S.categories || []), c] } })}
          onSave={(v) => {
            const { es, list, sid, changed } = resolveSupplierPatch(v);
            commit(es, changed ? { suppliers: list } : null);
            if (sheet.preSupplierId || sid) returnToSupplier(sheet.preSupplierId || sid);
            else setSheet(null);
            ping(t("saved"));
          }}
          onSaveAndNew={(v) => {
            const { es, list, changed } = resolveSupplierPatch(v);
            commit(es, changed ? { suppliers: list } : null);
            ping(t("saved"));
            setSheet({ k: "expense", fresh: uid(), preSupplierId: sheet.preSupplierId });
          }} />}

        {sheet?.k === "editExpense" && (() => {
          const e = entries.find((x) => x.id === sheet.id && x.type === "expense");
          if (!e) return null;
          return <ExpenseSheet lang={lang} t={t} S={S} custom={S.categories} species={speciesPresent}
            animals={animals} suppliers={activeSuppliers} initial={e} onClose={() => setSheet(null)}
            onSaveFeed={() => setSheet({ k: "feed", back: { k: "editExpense", id: e.id } })}
            onAddCategory={(c) => commit([{ type: "setting", field: "categories", value: 1 }],
              { settings: { ...S, categories: [...(S.categories || []), c] } })}
            onDelete={() => { deleteEntry(e.id); setSheet(null); }}
            onSave={(v) => {
              const { list, sid, changed, expense } = resolveSupplierPatch({ ...v, id: e.id });
              rewriteEntries((rows) => {
                let next = (rows || []).map((x) => (x.id === e.id
                  ? { ...x, ...expense, id: e.id, type: "expense" } : x));
                if (!next.some((x) => x.id === e.id)) next = [{ type: "expense", ...expense }, ...next];
                if (expense.supplierId) {
                  const linkedC = next
                    .filter((x) => x.type === "supplierPay" && x.expenseId === e.id)
                    .reduce((a, p) => a + toCents(p.amount), 0);
                  const wantC = toCents(supplierCashOut(expense));
                  if (wantC > linkedC) {
                    const now = iso(Date.now());
                    next = [{
                      type: "supplierPay", id: uid(), supplierId: expense.supplierId,
                      amount: fromCents(wantC - linkedC), method: expense.method || "cash",
                      vendor: expense.vendor, note: expense.note || "", at: expense.at,
                      expenseId: e.id, loggedAt: now,
                      byId: me?.id || null, byName: me ? me.name : "—",
                    }, ...next];
                  }
                  const billC = toCents(expense.amount);
                  const paidC = Math.min(billC, next
                    .filter((x) => x.type === "supplierPay" && x.expenseId === e.id)
                    .reduce((a, p) => a + toCents(p.amount), 0));
                  const payStatus = moneyStatus(billC, paidC);
                  next = next.map((x) => (x.id === e.id
                    ? { ...x, paidAmount: fromCents(paidC), payStatus,
                      dueDate: payStatus === "paid" ? "" : (expense.dueDate || x.dueDate || "") }
                    : x));
                }
                return next;
              }, t("saved"));
              if (changed) commit([], { suppliers: list });
              if (sid) returnToSupplier(sid);
              else setSheet(null);
            }} />;
        })()}

        {sheet?.k === "feed" && <FeedSheet lang={lang} t={t} S={S} species={speciesPresent} animals={animals} suppliers={activeSuppliers}
          lastPriceOf={(ft, u) => { const e = entries.find((x) => x.type === "expense" && x.category === "feed" && x.feedType === ft && x.unit === u && x.unitPrice > 0); return e ? e.unitPrice : 0; }}
          onClose={() => setSheet(null)}
          onBack={() => setSheet(sheet.back || { k: "expense" })} backLabel={t("backBtn")}
          onSave={(v) => {
            const { es, list, changed } = resolveSupplierPatch({ ...v, payStatus: "paid", paidAmount: v.amount, group: "feedLive" });
            commit(es, changed ? { suppliers: list } : null);
            setSheet(null); ping(t("saved"));
          }} />}

        {sheet?.k === "workers" && (() => {
          const k = dayKey(Date.now());
          const att = {}; entries.filter((e) => e.type === "attend" && dayKey(e.at) === k).forEach((e) => { if (!(e.workerId in att)) att[e.workerId] = e; });
          return <Sheet title={`👷 ${t("workers")}`} onClose={() => setSheet(null)}>
            {workers.length === 0
              ? <Empty icon="👷" title={t("noWorkers")} sub={t("noWorkersSub")} cta={`➕ ${t("addWorker")}`} onCta={() => setSheet({ k: "addWorker", back: { k: "workers" } })} />
              : <>
                <div style={{ display: "grid", gap: 10 }}>
                  {workers.filter((w) => w.type === "daily").map((w) => { const rec = att[w.id], on = rec && rec.present;
                    return <div key={w.id} role="button" tabIndex={0}
                      onClick={() => commit([{ type: "attend", workerId: w.id, present: !on }])}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault();
                        commit([{ type: "attend", workerId: w.id, present: !on }]); } }}
                      style={{ display: "flex", alignItems: "center", gap: 13, background: C.card,
                        border: `1.5px solid ${on ? C.green : C.line}`, borderRadius: 6, padding: "12px 14px", cursor: "pointer", textAlign: "start" }}>
                      <span style={{ width: 40, height: 40, borderRadius: 5, background: on ? C.green : "#ECE9E0",
                        color: on ? "#fff" : C.inkSoft, display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800 }}>{on ? "✓" : "✗"}</span>
                      <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 16.5, fontWeight: 700 }}>{w.name}</span>
                        <span style={{ display: "flex", alignItems: "center", minHeight: 16 }}>
                          {rec ? <WhoHint e={rec} lang={lang} /> : <span style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 500 }}>{t("never")}</span>}
                        </span></span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? C.green : C.inkSoft }}>{on ? t("present") : t("absent")}</span></div>; })}
                  <button style={secondaryBtn} onClick={() => setSheet({ k: "addWorker", back: { k: "workers" } })}>➕ {t("addWorker")}</button>
                </div>
                <div style={{ marginTop: 14, background: C.field, color: "#fff", borderRadius: 6, padding: 15,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{t("payroll")}</span>
                  <Money usd={Object.values(att).filter((e) => e.present).length * S.wage} rate={S.rate} lang={lang} size={22} tone="#E8C275" /></div>
              </>}
          </Sheet>;
        })()}

        {sheet?.k === "addWorker" && <WorkerForm lang={lang} t={t}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onSave={(w) => { commit([{ type: "workerAdd", workerId: w.id, name: w.name }], { workers: [...workers, w] });
            setSheet(sheet.back || null); }} />}

        {sheet?.k === "addCustomer" && <CustomerForm lang={lang} t={t} S={S} customers={customers}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onSave={(c) => { const next = [...customers, c];
            commit([{ type: "customerAdd", customerId: c.id, name: c.name }], { customers: next });
            setSheet({ k: "customerCreated", customer: c, acc: accNo(next, c.id), back: sheet.back || null });
            ping(`✓ ${t("saved")}`); }} />}

        {sheet?.k === "customerCreated" && sheet.customer && <CustomerCreatedSheet lang={lang} t={t} S={S}
          customer={sheet.customer} acc={sheet.acc}
          onViewFull={() => openAccountFull(sheet.customer.id, "transactions")}
          onView={() => openAccountFull(sheet.customer.id, "overview")}
          onAddAnother={() => setSheet({ k: "addCustomer", back: sheet.back || null })}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")} />}

        {sheet?.k === "customerManage" && cust && <CustomerManageSheet lang={lang} t={t} S={S}
          customer={cust} no={accNo(customers, cust.id)} ledger={ledger}
          onClose={() => setSheet(null)}
          onExport={() => exportCustomerBackup(cust)}
          onArchive={() => setSheet({ k: "confirmArchive", cid: cust.id, back: { k: "customerManage", cid: cust.id } })}
          onDelete={() => setSheet({ k: "confirmDeleteCustomer", cid: cust.id, back: { k: "customerManage", cid: cust.id } })} />}

        {sheet?.k === "confirmArchive" && cust && <Sheet title={`📦 ${t("archiveAccount")}`}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}>
          <div style={{ background: "#F6EFDD", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A5312", marginBottom: 14 }}>{t("archiveWarn")}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{t("archiveConfirm")}<br /><span style={{ color: C.field }}>{cust.name}</span></div>
          <button style={{ ...primaryBtn, marginBottom: 10 }} onClick={() => archiveCustomer(cust)}>📦 {t("archiveAccount")}</button>
          <button style={secondaryBtn} onClick={() => setSheet(sheet.back || null)}>{t("cancel")}</button>
        </Sheet>}

        {sheet?.k === "confirmDeleteCustomer" && cust && <ConfirmPinSheet lang={lang} t={t} me={me}
          title={`🗑️ ${t("deleteAccount")}`} warn={t("deleteAccountWarn")} confirmLabel={t("confirmDeleteAccount")}
          onClose={() => setSheet(null)}
          onBack={sheet.back ? () => setSheet(sheet.back) : undefined} backLabel={t("backBtn")}
          onConfirm={() => deleteCustomer(cust)} />}

        {sheet?.k === "archivedAccounts" && <ArchivedAccountsSheet customers={customers} ledger={ledger}
          lang={lang} t={t} S={S} onClose={() => setSheet(null)}
          onExport={exportCustomerBackup} onRestore={restoreCustomer} />}

        {sheet?.k === "obligationDocs" && (() => {
          const ob = obligations.find((x) => x.id === sheet.id);
          if (!ob) return null;
          return <ObligationDocsSheet obligation={ob} lang={lang} t={t} onClose={() => setSheet(null)}
            onView={(src, title) => setSheet({ k: "receipt", src, title, back: { k: "obligationDocs", id: ob.id } })} />;
        })()}

        {sheet?.k === "addObligation" && <ObligationForm lang={lang} t={t} S={S}
          onClose={() => setSheet(null)}
          onSave={(o) => { commit([{ type: "obligationAdd", title: o.title }], { obligations: [...obligations, o] });
            setSheet(null); ping(t("saved")); }} />}

        {sheet?.k === "editObligation" && (() => {
          const ob = obligations.find((x) => x.id === sheet.id);
          if (!ob) return null;
          return <ObligationForm lang={lang} t={t} S={S} initial={ob} onClose={() => setSheet(null)}
            onSave={(o) => { commit([{ type: "obligationEdit", title: o.title }],
              { obligations: obligations.map((x) => x.id === o.id ? o : x) });
              setSheet(null); ping(t("saved")); }} />;
        })()}

        {sheet?.k === "newSale" && <SaleForm lang={lang} t={t} S={S} customers={activeCustomers} animals={animals} preId={sheet.cid}
          entries={entries} ledger={ledger}
          onClose={() => returnToAccount(sheet.cid)}
          onAddCustomer={() => setSheet({ k: "addCustomer", back: { k: "newSale", cid: sheet.cid } })}
          onSave={({ customerId, product, qty, price, amount, priceMode, payNow, discountAmount, discountNote, unit, currency, rateUsed, at, note }) => {
            const saleId = `sale-${uid()}`;
            const loggedAt = iso(Date.now());
            const es = [{ id: saleId, type: "sale", customerId, product, qty, unit, price, amount, priceMode: priceMode || "unit",
              discountAmount: discountAmount || 0, discountNote: discountNote || "",
              currency, rateUsed, at, loggedAt, note }];
            if (payNow > 0) es.push({ type: "payment", customerId, saleId, amount: payNow, method: "cash", currency, rateUsed, at, loggedAt });
            commit(es);
            returnToAccount(customerId); }} />}

        {sheet?.k === "quickSale" && <QuickSaleSheet lang={lang} t={t} S={S} customers={activeCustomers} preId={sheet.cid}
          onClose={() => setSheet(null)}
          onAddCustomer={() => setSheet({ k: "addCustomer", back: { k: "quickSale", cid: sheet.cid } })}
          onSave={({ customerId, product, qty, price, amount, priceMode, note, unit, payNow, at }) => {
            const saleId = `sale-${uid()}`;
            const es = [{ id: saleId, type: "sale", customerId, product, qty, unit, price, amount, priceMode: priceMode || "unit", at, note,
              loggedAt: at, currency: "usd", rateUsed: S.rate }];
            if (payNow > 0) es.push({ type: "payment", customerId, saleId, amount: payNow, method: "cash",
              at, loggedAt: at, currency: "usd", rateUsed: S.rate });
            const needWalkIn = customerId === WALKIN_ID;
            commit(es, needWalkIn ? { customers: withWalkInCustomer(customers) } : null);
            returnToAccount(customerId);
          }} />}

        {sheet?.k === "round" && <DailyRoundSheet lang={lang} t={t} S={S} customers={activeCustomers} ledger={ledger}
          milkLeft={milkStock(entries).available}
          onClose={() => setSheet(null)}
          onSave={(list) => { const es = [];
            list.forEach((x) => { const saleId = `sale-${uid()}`;
              es.push({ id: saleId, type: "sale", customerId: x.customerId, product: x.product,
                qty: x.qty, unit: x.unit, price: x.price, amount: x.amount });
              if (x.paid) es.push({ type: "payment", customerId: x.customerId, saleId, amount: x.amount, method: "cash" }); });
            commit(es); setSheet(null); }} />}

        {sheet?.k === "payment" && cust && <PaymentForm lang={lang} t={t} S={S} customer={cust} ledger={ledger}
          entries={entries}
          onClose={() => returnToAccount(cust.id)}
          onSave={({ amount, cashAmount, saleId, method, currency, rateUsed, at, note, reimbursements }) => {
            const loggedAt = iso(Date.now());
            const payId = `pay-${uid()}`;
            const cash = fromCents(toCents(cashAmount != null ? cashAmount : amount));
            const es = [];
            const hasCash = toCents(cash) > 0;
            if (hasCash) {
              es.push({ id: payId, type: "payment", customerId: cust.id, saleId: saleId || null, amount: cash,
                method, currency, rateUsed, at, note, loggedAt });
            }
            (reimbursements || []).forEach((r) => {
              const amt = fromCents(toCents(r.amount));
              const cat = expenseCatFromName(r.name, S.categories);
              es.push({
                id: `exp-${uid()}`, type: "expense", category: cat, group: expGroupOf(cat),
                amount: amt, paidAmount: amt, payStatus: "paid",
                customerId: cust.id, paymentId: hasCash ? payId : null,
                vendor: customerNameById(customers, cust.id, t) || "",
                note: r.name, name: r.name, memo: r.name, origin: "payment_reimbursement",
                kind: DEDUCTION_REIMBURSEMENT, deductions: amt,
                currency, rateUsed, at, loggedAt,
              });
            });
            if (!es.length) return;
            const savedTypes = rememberNames(S.saleReimburseTypes, (reimbursements || []).map((r) => r.name));
            const typesChanged = namesChanged(savedTypes, S.saleReimburseTypes);
            commit(es, typesChanged ? { settings: { ...S, saleReimburseTypes: savedTypes } } : null);
            returnToAccount(cust.id); }} />}

        {sheet?.k === "editSale" && (() => {
          const iv = ledger.list.find((x) => x.id === sheet.id);
          if (!iv) return null;
          const backCid = sheet.cid || iv.customerId;
          return <EditSaleSheet sale={iv} lang={lang} t={t} S={S}
            onClose={() => returnToAccount(backCid)}
            onSave={(v) => { updateEntry(iv.id, v); returnToAccount(backCid); }}
            onDelete={() => { deleteEntry(iv.id); returnToAccount(backCid); }} />;
        })()}

        {sheet?.k === "editMoney" && (() => {
          const impliedOf = impliedExpenseId(sheet.id);
          if (impliedOf) {
            return <Sheet title={`🗑️ ${t("deleteTx")}`} onClose={() => setSheet(null)}>
              <div style={{ fontWeight: 600, color: "#7A1A2E", marginBottom: 12 }}>{t("deletePayWarn")}</div>
              <button style={{ ...primaryBtn, background: C.red, marginBottom: 8 }}
                onClick={() => { deleteEntry(sheet.id); setSheet(null); }}>{t("confirmDelete")}</button>
              <button style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button>
            </Sheet>;
          }
          const e = entries.find((x) => x.id === sheet.id);
          if (!e) return null;
          return <EditMoneySheet entry={e} lang={lang} t={t} S={S}
            onClose={() => setSheet(null)}
            onDelete={() => { deleteEntry(e.id); setSheet(null); }}
            onSave={(v) => {
              if (e.type === "supplierPay") {
                rewriteEntries((rows) => {
                  let next = (rows || []).map((x) => (x.id === e.id
                    ? { ...x, amount: v.amount, method: v.method, note: v.note, at: v.at } : x));
                  if (e.expenseId) {
                    const bill = next.find((x) => x.id === e.expenseId && x.type === "expense");
                    if (bill) {
                      const paidC = next.filter((x) => x.type === "supplierPay" && x.expenseId === bill.id)
                        .reduce((a, p) => a + toCents(p.amount), 0);
                      const billC = toCents(bill.amount);
                      const st = moneyStatus(billC, paidC);
                      next = next.map((x) => (x.id === bill.id
                        ? { ...x, paidAmount: fromCents(Math.min(billC, paidC)), payStatus: st,
                          dueDate: st === "paid" ? "" : (x.dueDate || dayKey(x.at)) }
                        : x));
                    }
                  }
                  return next;
                }, t("saved"));
              } else if (e.type === "med") {
                updateEntry(e.id, { cost: v.cost, note: v.note, at: v.at });
              } else {
                updateEntry(e.id, { amount: v.amount, method: v.method, note: v.note, at: v.at });
              }
              setSheet(null);
            }} />;
        })()}

        {sheet?.k === "confirmDeleteEntry" && (() => {
          const seed = sheet.id;
          const e = entries.find((x) => x.id === seed)
            || (impliedExpenseId(seed) ? entries.find((x) => x.id === impliedExpenseId(seed)) : null);
          return <Sheet title={`🗑️ ${t("deleteTx")}`} onClose={() => setSheet(null)}>
            <div style={{ background: "#F5E2E4", borderRadius: 6, padding: 14, fontWeight: 600,
              color: "#7A1A2E", marginBottom: 14, lineHeight: 1.45 }}>{deleteWarnFor(e, t, seed)}</div>
            <button type="button" style={{ ...primaryBtn, background: C.red, marginBottom: 8 }}
              onClick={() => { deleteEntry(seed); setSheet(null); }}>{t("confirmDelete")}</button>
            <button type="button" style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button>
          </Sheet>;
        })()}

        {sheet?.k === "docgen" && <DocGenSheet lang={lang} t={t} S={S} kinds={sheet.kinds || ["invoice"]}
          me={me} customers={customers} ledger={ledger} suppliers={suppliers} supplierLedger={supplierLedger}
          scope={sheet.scope || "customer"} docId={sheet.id} cid={sheet.cid} sid={sheet.sid}
          onClose={() => sheet.scope === "supplier" ? returnToSupplier(sheet.sid) : returnToAccount(sheet.cid)}
          onPrint={(doc) => {
            if (sheet.scope === "supplier") returnToSupplier(sheet.sid);
            else returnToAccount(sheet.cid);
            doPrint(doc);
          }} />}

        {sheet?.k === "reportPreview" && <DocPreviewSheet lang={lang} t={t} title={`📄 ${t("reports")}`}
          onClose={() => setSheet(null)}
          onPrint={() => { setSheet(null); doPrint(null); }}>
          <PrintReport {...{ lang, t, sums, prevSums, S, days, me, animals, workers, customers, scoped: financialScoped,
            scopedSales, summaryLines, series, periodLabel, outstanding }} />
        </DocPreviewSheet>}

        {sheet?.k === "receiptPreview" && sheet.src && <DocPreviewSheet lang={lang} t={t}
          title={sheet.title || t("attachment")}
          onClose={() => setSheet(sheet.back || null)}
          onPrint={() => {
            const d = { kind: "receiptImg", src: sheet.src, title: sheet.title, sub: sheet.sub, docLang: lang };
            setSheet(null);
            doPrint(d);
          }}>
          <PrintDoc doc={{ kind: "receiptImg", src: sheet.src, title: sheet.title, sub: sheet.sub, docLang: lang }}
            lang={lang} t={t} S={S} me={me} customers={customers} ledger={ledger} />
        </DocPreviewSheet>}

        {sheet?.k === "whatsNew" && <WhatsNewSheet lang={lang} t={t} onClose={dismissWhatsNew} />}
        {sheet?.k === "setPass" && <SetPassSheet lang={lang} t={t} onClose={() => setSheet(null)} onSave={async (pin) => {
          const salt = uid(); const hash = await hashPin(pin, salt);
          const np = { ...me, pin: hash, salt }; setMe(np); setSheet(null);
          commit([{ type: "profileSecurity", name: me.name }], { profiles: (data.profiles || []).map((p) => (p.id === me.id ? np : p)) }); }} />}

        {sheet?.k === "confirmRemovePass" && <ConfirmPinSheet lang={lang} t={t} me={me}
          title={`🔓 ${t("removePass")}`} warn={t("passOptional")} confirmLabel={t("removePass")}
          onClose={() => setSheet(null)}
          onConfirm={() => {
            const np = { ...me, pin: null, salt: null }; setMe(np); setSheet(null);
            commit([{ type: "profileSecurity", name: me.name }], { profiles: (data.profiles || []).map((p) => (p.id === me.id ? np : p)) });
            ping(t("passRemoved"));
          }} />}

        {sheet?.k === "help" && <HelpSheet topic={sheet.topic} lang={lang} t={t} onClose={() => setSheet(null)} />}

        {sheet?.k === "walkthrough" && <Sheet title={`🧭 ${t("walkthrough")}`} onClose={() => setSheet(null)}>
          <div style={{ background: "#F6EFDD", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A5312", marginBottom: 12 }}>{t("walkthroughWarn")}</div>
          {(companySyncActive() || cloudCfg.on) && <div style={{ background: "#F5E2E4", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A1A2E", marginBottom: 12 }}>{t("walkthroughSyncWarn")}</div>}
          {(() => {
            const c = walkthroughCounts(buildWalkthroughFarm({ keep: { me, profiles: data.profiles }, setupV: SETUP_VERSION }));
            return <div style={{ background: C.card, borderRadius: 6, padding: 13, marginBottom: 14, display: "grid", gap: 3, boxShadow: sh1 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{t("restoreFound")}:</div>
              <Row k={t("animals")} v={`${c.animals}`} />
              <Row k={t("customers")} v={`${c.customers}`} />
              <Row k={t("workers")} v={`${c.workers}`} />
              <Row k={t("log")} v={`${c.entries}`} />
            </div>;
          })()}
          <button style={{ ...primaryBtn, marginBottom: 10 }} onClick={applyWalkthrough}>✓ {t("walkthroughLoad")}</button>
          <button style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button></Sheet>}

        {sheet?.k === "exitWalkthrough" && <Sheet title={`↩ ${t("walkthroughExit")}`} onClose={() => setSheet(null)}>
          <div style={{ background: "#F6EFDD", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A5312", marginBottom: 12 }}>{t("walkthroughExitWarn")}</div>
          <button style={{ ...primaryBtn, marginBottom: 10 }} onClick={exitWalkthrough}>✓ {t("walkthroughExit")}</button>
          <button style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button></Sheet>}

        {sheet?.k === "restore" && sheet.payload && <Sheet title={`♻️ ${t("restore")}`} onClose={() => setSheet(null)}>
          <div style={{ background: "#F6EFDD", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A5312", marginBottom: 12 }}>{t("restoreWarn")}</div>
          <div style={{ background: C.card, borderRadius: 6, padding: 13, marginBottom: 14, display: "grid", gap: 3, boxShadow: sh1 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{t("restoreFound")}:</div>
            <Row k={t("animals")} v={`${(sheet.payload.animals || []).length}`} />
            <Row k={t("customers")} v={`${(sheet.payload.customers || []).length}`} />
            <Row k={t("workers")} v={`${(sheet.payload.workers || []).length}`} />
            <Row k={t("people")} v={`${(sheet.payload.profiles || []).length}`} />
            <Row k={t("log")} v={`${(sheet.payload.entries || []).length}`} /></div>
          <button style={{ ...primaryBtn, marginBottom: 10 }} onClick={async () => {
            const incoming = { ...emptyFarm(), ...sheet.payload };
            if (!(incoming.profiles || []).some((p) => p.id === me.id)) incoming.profiles = [...(incoming.profiles || []), me];
            setData(incoming); setDraftS(incoming.settings); setSheet(null);
            try { await store.set(SHARED_KEY, JSON.stringify(incoming), true); ping(t("restoreOk")); }
            catch (e) { setFailed({ entries: [], patch: null, profile: me }); } }}>✓ {t("confirmRestore")}</button>
          <button style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button></Sheet>}

        {sheet?.k === "reset" && <Sheet title={`🗑️ ${t("resetAll")}`} onClose={() => setSheet(null)}>
          <div style={{ background: "#F5E2E4", borderRadius: 6, padding: 14, fontWeight: 600, color: "#7A1A2E", marginBottom: 14 }}>{t("resetWarn")}</div>
          <button style={{ ...primaryBtn, background: C.red, marginBottom: 10 }} onClick={async () => {
            const blank = emptyFarm(); blank.profiles = [me];
            setData(blank); setDraftS(blank.settings); setSheet(null);
            try { await store.set(SHARED_KEY, JSON.stringify(blank), true); ping(t("saved")); }
            catch (e) { setFailed({ entries: [], patch: null, profile: me }); } }}>{t("confirmReset")}</button>
          <button style={secondaryBtn} onClick={() => setSheet(null)}>{t("cancel")}</button></Sheet>}

  </>);

  return (
    <div dir={dir} className={`app dk theme-${theme}`}>
      <style key={theme}>{makeCss()}</style>
      <div className={`dk-wrap${sideHidden ? " side-off" : ""}`}>
        <button type="button" className="dk-side-backdrop" aria-label={t("hideSidebar")}
          onClick={toggleSidebar} tabIndex={sideHidden ? -1 : 0} />
        <aside className="dk-side" aria-hidden={sideHidden}>
          <div className="dk-brand">
            <div className="dk-brand-logo">
              {S.logo
                ? <img src={S.logo} alt="" />
                : <AppMark size={36} light word={false} lang={lang} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis" }}>{S.farmName || t("setFarmName")}</div>
              <div style={{ fontSize: 10.5, opacity: .7, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="dk-app-chip">{t("appName")}</span>
                <span>v{VERSION.code}</span>
              </div>
            </div>
            <button type="button" className="dk-side-hide" title={t("hideSidebar")} onClick={toggleSidebar}>‹</button>
          </div>
          <nav style={{ padding: "6px 8px 10px", overflowY: "auto" }}>
            {navBtn("dashboard", "💵", t("cashBox"), route === "dashboard", go("dashboard"))}
            <NavGroup title={t("farmWork")} open={navFarmOpen} onToggle={() => setNavFarmOpen((o) => !o)} dir={dir}>
              {farmNav.map(([k, ic, lb]) => navBtn(k, ic, lb, route === k, go(k)))}
            </NavGroup>
            <NavGroup title={t("officeWork")} open={navOfficeOpen} onToggle={() => setNavOfficeOpen((o) => !o)} dir={dir}>
              {officeNav.map(([k, ic, lb]) => navBtn(k, ic, lb, route === k, go(k)))}
            </NavGroup>
          </nav>
          <div style={{ marginTop: "auto", padding: 10, borderTop: "1px solid rgba(255,255,255,.14)" }}>
            <button onClick={() => setPalette(true)} className="dk-nav" style={{ opacity: .8 }}>
              <span style={{ width: 20, textAlign: "center" }}>⌘</span>{t("runCommand")}
              <span style={{ marginInlineStart: "auto", fontFamily: "var(--mono)", fontSize: 10.5, opacity: .7 }}>Ctrl K</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 10px 4px" }}>
              <span style={{ width: 30, height: 30, borderRadius: 3, background: me.color, display: "grid",
                placeItems: "center", fontSize: 15 }}>{me.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</span>
                <span style={{ display: "block", fontSize: 10.5, opacity: .6 }}>{roleLabel(me.role, lang)}</span></span>
              <button onClick={() => { setPreId(null); setMe(null); }} title={t("switchUser")}
                style={{ background: "none", border: "1px solid rgba(255,255,255,.24)", color: "#fff",
                  borderRadius: 3, padding: "5px 7px", cursor: "pointer", fontSize: 12 }}>⇄</button>
            </div>
          </div>
        </aside>

        <main className="dk-main">
          <header className="dk-top">
            {sideHidden && <button type="button" className="dk-pill" title={t("showSidebar")} onClick={toggleSidebar}
              style={{ fontSize: 16, padding: "7px 11px" }}>☰</button>}
            {(routeHist.length > 0 || (sheet && sheet.back)) && (
              <button type="button" className="dk-pill" onClick={() => (sheet?.back ? sheetBack() : goBackRoute())}
                title={t("backBtn")} style={{ fontSize: 16, padding: "7px 11px" }}>‹</button>)}
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, marginInlineEnd: 4 }}>
              {navLabel(route)}</div>
            <button type="button" onClick={() => setPalette(true)} className="dk-search" style={{ flex: 1, maxWidth: 420 }}>
              <span>⌘</span><span style={{ flex: 1, textAlign: "start" }}>{t("palHint")}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.inkSoft }}>Ctrl K</span></button>
            {weather && (() => { const w = wmo(weather.code, lang); return (
              <span title={loc ? loc.name : t("weather")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: C.inkSoft }}>
                <span>{w.icon}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.ink }}>{weather.temp}°</span>
              </span>); })()}
            <button type="button" onClick={cycleTheme} className="dk-pill" title={t("theme")}>
              {theme === "dark" ? "☀" : "☾"}</button>
            <MoneyToggle value={moneyView} onChange={pickMoneyView} rate={S.rate} lang={lang} t={t} size="sm" />
            <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="dk-pill" title={t("language")}>
              {lang === "ar" ? "EN" : "ع"}</button>
          </header>

          {!co.companyId && !cloud.on && store.kind !== "host" && !hideDeviceBanner && (
            <div className="banner amber" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>⚠️ {t("deviceOnly")}</span>
              <button type="button" onClick={() => { setHideDeviceBanner(true); saveDevicePrefs({ hideDeviceBanner: true }); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#7A5312",
                  fontFamily: "var(--body)", fontSize: 12.5 }}>{t("dismiss")}</button>
            </div>)}
          {S.demoWalkthrough && (
            <div className="banner green" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>🧭 {t("walkthroughBanner")}</span>
              <button type="button" onClick={() => setSheet({ k: "help", topic: "walkthrough" })}
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#0F5C4D",
                  fontFamily: "var(--body)", fontSize: 12.5 }}>{t("guide")}</button>
              <button type="button" onClick={() => setSheet({ k: "exitWalkthrough" })}
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#0F5C4D",
                  fontFamily: "var(--body)", fontSize: 12.5 }}>{t("walkthroughExit")}</button>
            </div>)}
          {updateReady && (
            <div className="banner green" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>🔄 {t("updateReady")}</span>
              <button onClick={doApplyUpdate} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 4,
                padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", fontSize: 13 }}>{t("updateNow")}</button>
            </div>)}
          {failed && <div className="banner red">
            <span style={{ flex: 1 }}>⚠️ {failed.reason === "size" ? t("storageFull") : t("saveFail")}</span>
            <button onClick={retry} style={{ ...secondaryBtn, width: "auto", padding: "6px 11px", fontSize: 13 }}>{t("retry")}</button></div>}
          {showSetup && route === "dashboard" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#F6EFDD",
              border: `1px solid ${C.tag}`, borderRadius: 4, padding: "11px 14px", margin: "0 0 14px" }}>
              <b style={{ fontSize: 13.5 }}>🚀 {t("setup")}</b>
              {[["identity", t("setupIdentity"), () => setRoute("settings")],
                ["animals", t("setupAnimals"), () => setSheet({ k: "addAnimal" })],
                ["prices", t("setupPrices"), () => setRoute("settings")],
                ["customers", t("setupCustomers"), () => setSheet({ k: "addCustomer" })]].map(([k, lb, go]) => (
                <button key={k} onClick={go} style={{ background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--body)", fontSize: 13, fontWeight: 600,
                  color: setup[k] ? C.inkSoft : "#7A5312", textDecoration: setup[k] ? "line-through" : "underline" }}>
                  {setup[k] ? "✓ " : ""}{lb}</button>))}
            </div>)}

          <div className="dk-body">
            {route === "dashboard" && DeskDashboard}
            {route === "animals" && DeskAnimals}
            {route === "entry" && DeskEntry}
            {route === "sales" && DeskSales}
            {route === "suppliers" && DeskSuppliers}
            {route === "expenses" && DeskExpenses}
            {route === "reports" && DeskReports}
            {route === "settings" && <div className="dk-settings">{Settings}</div>}
          </div>
        </main>
      </div>

      {palette && <Palette items={paletteItems} onClose={() => setPalette(false)} lang={lang} t={t}
        favorites={favKeys} onToggleFav={toggleFav} />}
      {sheets}
      <CtxMenu menu={ctx} onClose={() => setCtx(null)} />
      {toast && <div className="toast">✓ {toast}</div>}

      <div className={printing ? "print-sheet show" : "print-sheet"}>
        {doc ? <PrintDoc {...{ doc, lang, t, S, me, customers, ledger, suppliers, supplierLedger }} />
          : <PrintReport {...{ lang, t, sums, prevSums, S, days, me, animals, workers, customers, scoped: financialScoped,
            scopedSales, summaryLines, series, periodLabel, outstanding }} />}
      </div>
    </div>
  );
}

const makeCss = () => `
@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Literata:opsz,wght@7..72,600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap');
:root{
  --display:'Literata','Amiri',Georgia,'Times New Roman',serif;
  --body:'IBM Plex Sans Arabic','Segoe UI',system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,'Courier New',monospace;
  --ease:cubic-bezier(.22,1,.36,1);
  --radius:14px;
  --shadow:0 1px 2px rgba(21,42,36,.04),0 8px 24px rgba(21,42,36,.06);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;overscroll-behavior-y:none;background:${C.bg}}
button,a,label,input,select,textarea{touch-action:manipulation}
img{-webkit-user-drag:none}
input,textarea,select{font-size:16px}
button,input,textarea{font-family:var(--body)}
/* Explicit ink — OS dark mode otherwise paints ButtonText white on our light cards. */
button{color:${C.ink};transition:transform .14s var(--ease),box-shadow .14s var(--ease),opacity .12s ease,background .14s ease,border-color .14s ease}
button:hover{filter:brightness(1.02)}
button:active{transform:translateY(1px) scale(.985);opacity:.92}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid ${C.tag};outline-offset:2px}
input:focus,textarea:focus{border-color:${C.field}!important;box-shadow:0 0 0 3px ${C.field}22}
.app{min-height:100vh;min-height:100dvh;background:
  radial-gradient(1200px 500px at 10% -10%,${C.glow},transparent 55%),
  radial-gradient(900px 420px at 100% 0%,${C.glowGold},transparent 50%),
  ${C.bg};
  font-family:var(--body);color:${C.ink};transition:background .25s ease,color .2s ease}
.app.dk{background:
  radial-gradient(1200px 500px at 10% -10%,${C.glow},transparent 55%),
  radial-gradient(900px 420px at 100% 0%,${C.glowGold},transparent 50%),
  ${C.bg}}
.app.theme-dark .dk-pill{background:${C.card};color:${C.ink}}
.app.theme-dark .sf-search,.app.theme-dark .sf-chip{background:${C.paper};color:${C.ink}}
.app.theme-dark .sf-ico,.app.theme-dark .sf-clear,.app.theme-dark .sf-gear,.app.theme-dark .sf-chip{color:${C.inkSoft}}
.app.theme-dark .sf-pop,.app.theme-dark .help-kit-pop{background:${C.card}}
.app.theme-dark .dk-search{background:${C.card};color:${C.inkSoft}}
.app.theme-dark .pal-tile{background:${C.card}}
.app.theme-dark .pal-tile:hover,.app.theme-dark .pal-tile.on{background:${C.paper};box-shadow:0 8px 20px rgba(0,0,0,.25)}
.app.theme-dark .pal-tile.starred{background:${C.paper}}
.app.theme-dark .set-sec{background:${C.card}}
.app.theme-dark .money-tog-seg{background:${C.card}}
.app.theme-dark .ctx-menu{background:${C.card}}
.app.theme-dark input, .app.theme-dark textarea{background:${C.paper};color:${C.ink}}
.app.theme-dark input::placeholder, .app.theme-dark textarea::placeholder{color:${C.inkSoft};opacity:.9}
.app.theme-dark table{color:${C.ink}}
.app.theme-dark .dk thead th,.app.theme-dark .dk tfoot td{background:${C.paper}}
.due-val{color:${C.red};font-weight:700}
.paid-val{color:${C.green};font-weight:700}
.part-val{color:${C.amber};font-weight:700}
.pos-val{color:${C.green};font-weight:700}
.neg-val{color:${C.red};font-weight:700}
.kpi-card,.stat-tile,.desk-card{animation:rise .35s var(--ease) both}
.kpi-val{animation:pop .45s var(--ease) both}
@keyframes pop{from{opacity:.35;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}
.chart-bar{opacity:0;animation:barIn .45s var(--ease) forwards}
@keyframes barIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.splash{min-height:100vh;min-height:100dvh;background:linear-gradient(160deg,${C.fieldDeep} 0%,${C.field} 48%,#24806C 100%);
  display:grid;place-items:center;color:#fff;font-family:var(--body)}
.splash-inner{text-align:center;padding:24px}
.splash-logo{width:auto;max-width:220px;height:auto;margin:0 auto 14px;border-radius:18px;background:transparent;
  display:grid;place-items:center;overflow:visible;border:none}
.splash-logo img{width:100%;max-height:140px;height:auto;object-fit:contain;border-radius:14px;background:rgba(255,255,255,.96);padding:8px}
.splash-logo span{font-size:36px}
.splash-brand{font-family:var(--display);font-weight:700;font-size:24px;letter-spacing:-.02em}
.splash-mark{margin-top:8px;opacity:.9;display:flex;justify-content:center}
.splash-msg{margin-top:14px;font-size:14px;opacity:.85;font-weight:500}
.splash-spin{width:28px;height:28px;margin:18px auto 0;border:3px solid rgba(255,255,255,.25);
  border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.gate{min-height:100vh;min-height:100dvh;background:
  radial-gradient(900px 400px at 0% 0%,${C.glow},transparent 55%),
  ${C.bg};font-family:var(--body);color:${C.ink}}
.gate-appmark{display:flex;justify-content:center;margin-bottom:8px}
.gate-desk .gate-shell{flex-direction:row;align-items:stretch;min-height:100vh;min-height:100dvh}
.gate-desk .gate-hero{flex:0 0 38%;max-width:420px;display:flex;align-items:center;justify-content:center;padding:40px 28px}
.gate-desk .gate-panel{flex:1;max-width:none;margin:0;padding:36px 40px;justify-content:center}
.gate-desk .gate-card{max-width:640px;width:100%;margin:0;border-radius:10px;padding:28px 28px 24px;flex:0 1 auto}
.gate-shell{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}
.gate-hero{position:relative;background:linear-gradient(155deg,${C.fieldDeep} 0%,${C.field} 52%,#24806C 100%);
  color:#fff;padding:calc(28px + env(safe-area-inset-top)) 20px 32px;overflow:hidden;flex-shrink:0}
.gate-hero-bg{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.gate-orb{position:absolute;border-radius:50%;filter:blur(40px);opacity:.35}
.gate-orb-a{width:180px;height:180px;background:${C.tag};top:-40px;inset-inline-end:-30px}
.gate-orb-b{width:140px;height:140px;background:${C.green};bottom:-20px;inset-inline-start:-20px}
.gate-hero-inner{position:relative;z-index:1;text-align:center;max-width:360px;margin:0 auto}
.gate-lang{position:absolute;top:0;inset-inline-end:0;border:1px solid rgba(255,255,255,.35);
  background:rgba(255,255,255,.12);color:#fff;border-radius:4px;padding:7px 12px;font-size:12px;
  font-weight:700;cursor:pointer;font-family:var(--body)}
.gate-logo-wrap{width:auto;min-width:96px;max-width:220px;height:auto;margin:0 auto 14px;border-radius:16px;
  background:transparent;border:none;display:grid;place-items:center;overflow:visible;padding:0}
.gate-logo-img{width:100%;height:100%;max-height:96px;object-fit:contain;padding:6px;background:rgba(255,255,255,.96);border-radius:14px}
.gate-logo-fallback{display:grid;place-items:center}
.gate-title{font-family:var(--display);font-weight:700;font-size:26px;margin:0;line-height:1.2;letter-spacing:-.02em}
.gate-tagline{margin:8px 0 0;font-size:13.5;opacity:.88;font-weight:500;line-height:1.45}
.gate-species{display:flex;justify-content:center;gap:12px;margin-top:18px;font-size:26px;opacity:.95}
.gate-panel{flex:1;display:flex;flex-direction:column;padding:32px 28px calc(12px + env(safe-area-inset-bottom));
  margin-top:0;position:relative;z-index:2;width:100%;max-width:560px;margin-inline:auto;justify-content:center}
.gate-card{background:${C.card};border:1px solid ${C.line};border-radius:10px 10px 6px 6px;
  box-shadow:0 12px 40px rgba(27,32,51,.12);padding:22px 20px 20px;flex:1}
.gate-step{max-width:100%}
.gate-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}
.gate-span-2{grid-column:1 / -1}
.gate-steps{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;
  font-size:12.5px;font-weight:700;color:${C.inkSoft}}
.gate-steps-bar{display:flex;gap:6px;flex:1;max-width:160px}
.gate-steps-bar span{height:4px;flex:1;border-radius:2px;background:${C.line}}
.gate-steps-bar span.on{background:${C.field}}
.gate-logo-pick{display:flex;align-items:center;gap:14px}
.gate-logo-btn{width:88px;height:88px;border-radius:8px;border:1.5px dashed ${C.line};background:${C.paper};
  display:grid;place-items:center;cursor:pointer;overflow:hidden;flex-shrink:0;font-size:28px;padding:0;
  font-family:var(--body);color:${C.ink}}
.gate-logo-btn img{width:100%;height:100%;object-fit:contain}
.gate-soon{background:${C.paper};border:1px dashed ${C.line};border-radius:6px;padding:12px 14px}
.gate-soon-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gate-soon-badge{font-size:11.5px;font-weight:700;color:#7A5312;background:#F6EFDD;border:1px solid ${C.tag};
  border-radius:4px;padding:6px 10px;white-space:nowrap}
.gate-h2{font-family:var(--display);font-weight:700;font-size:21px;margin:0 0 6px;color:${C.ink}}
.gate-lead{font-size:14px;color:${C.inkSoft};font-weight:500;margin:0 0 18px;line-height:1.5}
.gate-label{font-size:14px;font-weight:700;color:${C.inkSoft};margin:0 0 8px}
.gate-err{color:${C.red};font-weight:700;font-size:14px;margin:10px 0 0;text-align:center}
.gate-actions{display:grid;gap:10px}
.gate-field{display:block;margin-bottom:4px}
.gate-field-label{display:block;font-size:12.5px;font-weight:700;color:${C.inkSoft};margin-bottom:6px}
.gate-role-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:4px}
.gate-role{border:1.5px solid ${C.line};background:${C.card};color:${C.ink};border-radius:99px;padding:8px 13px;
  font-size:12.5px;font-weight:700;cursor:pointer;font-family:var(--body)}
.gate-role.on{background:${C.field};border-color:${C.field};color:#fff}
.gate-avatar-row{display:flex;flex-wrap:wrap;gap:8px}
.gate-av-pick{width:46px;height:46px;border-radius:8px;font-size:24px;cursor:pointer;background:${C.card};
  border:1.5px solid ${C.line};display:grid;place-items:center;padding:0}
.gate-av-pick.on{border-color:${C.field};background:${C.paper};box-shadow:0 0 0 2px ${C.field}33}
.gate-profile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.gate-profile-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:16px 10px;background:${C.card};border:1.5px solid ${C.line};border-radius:8px;cursor:pointer;
  font-family:var(--body);text-align:center;transition:border-color .12s,box-shadow .12s}
.gate-profile-card:hover{box-shadow:0 4px 14px rgba(27,32,51,.08)}
.gate-profile-name{font-weight:700;font-size:15px;color:${C.ink}}
.gate-profile-role{font-size:11.5px;color:${C.inkSoft};font-weight:600}
.gate-lock{position:absolute;top:8px;inset-inline-end:8px;font-size:13px;opacity:.7}
.gate-add-profile{width:100%;border:2px dashed ${C.line};background:transparent;border-radius:8px;
  padding:14px;font-weight:700;font-size:15px;color:${C.field};cursor:pointer;font-family:var(--body)}
.gate-user-chip{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px;
  background:${C.paper};border-radius:8px;border:1px solid ${C.line}}
.gate-avatar{width:48px;height:48px;border-radius:10px;display:grid;place-items:center;font-size:24px;flex-shrink:0}
.gate-avatar.lg{width:56px;height:56px;font-size:28px;border-radius:12px}
.gate-user-name{font-family:var(--display);font-weight:700;font-size:18px}
.gate-user-role{font-size:12.5px;color:${C.inkSoft};font-weight:600;margin-top:2px}
.gate-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 4px 0;
  font-size:11.5px;color:${C.inkSoft}}
.gate-ver{font-family:var(--mono)}
@media (max-width:900px){
  .gate-desk .gate-shell{flex-direction:column}
  .gate-desk .gate-hero{flex:none;max-width:none;padding:28px 20px}
  .gate-desk .gate-panel{padding:20px 16px}
  .gate-form-grid{grid-template-columns:1fr}
}
@keyframes drop{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
.banner{display:flex;align-items:center;gap:10px;padding:9px 13px;font-weight:600;font-size:13.5px;
  border-bottom:1px solid ${C.line}}
.banner.amber{background:#FBF1DC;color:#7A5312;border-radius:12px;margin:8px 12px 0;border:1px solid ${C.tag}55}
.banner.green{background:#E6F6F0;color:#0F5C4D;border-radius:12px;margin:8px 12px 0;border:1px solid ${C.green}44}
.banner.red{background:#F8E9EC;color:#7A1A2E;border-radius:12px;margin:8px 12px 0;border:1px solid ${C.red}44}
.sheet-wrap{position:fixed;inset:0;background:${C.overlay};display:flex;align-items:center;
  justify-content:center;z-index:20;animation:fade .14s ease;padding:16px}
.sheet{background:${C.paper};color:${C.ink};width:100%;max-width:560px;max-height:86vh;max-height:86dvh;overflow-y:auto;
  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  border-radius:18px;border-top:3px solid ${C.tag};padding:12px 18px 18px;
  box-shadow:0 24px 60px rgba(12,58,49,.28);animation:rise .22s var(--ease)}
.grabber{display:none}
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:${C.fieldDeep};color:#fff;
  border-radius:999px;padding:12px 22px;font-weight:600;z-index:30;animation:rise .18s var(--ease);
  box-shadow:0 10px 30px rgba(12,58,49,.35)}
.hscroll::-webkit-scrollbar{display:none}
.hscroll{scrollbar-width:none;border-bottom:1px solid ${C.line}}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:${C.line};border-radius:0}
@keyframes rise{from{transform:translateY(12px);opacity:.6}to{transform:translateY(0);opacity:1}}
@keyframes fade{from{opacity:0}to{opacity:1}}

/* ---------------------------- desktop ---------------------------- */
.dk-wrap{display:flex;min-height:100vh;min-height:100dvh;width:100%}
.dk-side{width:248px;flex-shrink:0;background:linear-gradient(180deg,${C.fieldDeep} 0%,${C.field} 55%,#176355 100%);
  color:#fff;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;height:100dvh;
  border-inline-end:1px solid rgba(255,255,255,.08);box-shadow:8px 0 28px rgba(12,58,49,.18);
  transition:width .22s var(--ease),opacity .22s var(--ease),border .22s ease;overflow:hidden}
.dk-wrap.side-off .dk-side{width:0;min-width:0;opacity:0;border-inline-end-width:0;pointer-events:none}
.dk-brand{display:flex;align-items:center;gap:10px;padding:16px 14px;border-bottom:1px solid rgba(255,255,255,.12)}
.dk-brand-logo{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);
  display:grid;place-items:center;overflow:hidden;flex-shrink:0}
.dk-brand-logo img{width:100%;height:100%;object-fit:contain}
.dk-app-chip{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;background:rgba(201,162,39,.22);
  border:1px solid rgba(201,162,39,.45);font-size:10px;font-weight:700;letter-spacing:.02em}
.dk-side-hide{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:8px;
  width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1;flex-shrink:0;padding:0}
.dk-side-hide:hover{background:rgba(255,255,255,.16)}
.money-tog{display:flex;flex-direction:column;gap:8px}
.money-cycle{font-family:var(--mono)!important;min-width:44px}
.money-tog-seg{display:inline-flex;background:${C.card};border:1px solid ${C.line};border-radius:4px;overflow:hidden}
.money-tog-seg button{background:transparent;border:none;border-inline-end:1px solid ${C.line};padding:7px 11px;
  font-family:var(--body);font-size:12.5px;font-weight:600;color:${C.ink};cursor:pointer;white-space:nowrap}
.money-tog-seg button:last-child{border-inline-end:none}
.money-tog-seg button:hover{background:${C.paper}}
.money-tog-seg button.on{background:${C.field};color:#fff}
.money-tog.sm .money-tog-seg button{padding:6px 9px;font-size:12px}
.money-tog-prev{display:flex;align-items:center;gap:10px;background:${C.paper};border:1px solid ${C.line};
  border-radius:4px;padding:8px 12px}
.money-tog-prev-lb{font-size:11.5px;font-weight:700;color:${C.inkSoft}}
.ctx-menu{position:fixed;z-index:80;min-width:190px;max-width:240px;background:${C.card};border:1px solid ${C.line};
  border-radius:5px;box-shadow:0 10px 28px rgba(27,32,51,.18);padding:4px;font-family:var(--body)}
.ctx-item{display:flex;align-items:center;gap:8px;width:100%;background:transparent;border:none;border-radius:3px;
  padding:8px 10px;cursor:pointer;text-align:start;font-family:var(--body);font-size:13.5px;font-weight:600;color:${C.ink}}
.ctx-item:hover{background:${C.paper}}
.ctx-item.danger{color:${C.red}}
.ctx-item:disabled{opacity:.4;cursor:default}
.ctx-ic{width:18px;text-align:center;flex-shrink:0}
.ctx-sep{height:1px;background:${C.line};margin:4px 6px}
.pal-group{padding:8px 4px 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.inkSoft}}
.dk-top .dk-search{min-width:200px}
.pal-hub{width:min(640px,94vw)!important;padding:0!important;overflow:hidden}
.pal-top{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid ${C.line}}
.pal-top-ic{font-size:16px;opacity:.55}
.pal-input{flex:1;border:none;padding:6px 0;font-size:16px;font-family:var(--body);outline:none;background:transparent;color:${C.ink}}
.pal-kbd{font-family:var(--mono);font-size:11px;color:${C.inkSoft}}
.pal-favs{padding:10px 14px 8px;background:${C.paper};border-bottom:1px solid ${C.line}}
.pal-favs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.pal-edit-btn{background:${C.card};border:1px solid ${C.line};border-radius:3px;padding:5px 10px;cursor:pointer;
  font-family:var(--body);font-size:12px;font-weight:700;color:${C.field}}
.pal-edit-btn:hover{border-color:${C.field}}
.pal-fav-hint,.pal-fav-empty{font-size:12px;color:${C.inkSoft};font-weight:500;margin-bottom:8px}
.pal-body{max-height:min(52vh,420px);overflow-y:auto;padding:6px 14px 14px}
.pal-sec{margin-bottom:6px}
.pal-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pal-grid-fav{grid-template-columns:repeat(4,minmax(0,1fr))}
.pal-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  min-height:84px;padding:10px 6px;background:${C.card};border:1px solid ${C.line};border-radius:14px;cursor:pointer;
  font-family:var(--body);color:${C.ink};text-align:center;transition:transform .14s var(--ease),box-shadow .14s var(--ease),border-color .14s ease}
.pal-tile:hover,.pal-tile.on{border-color:${C.field};background:${C.paper};box-shadow:0 8px 20px rgba(27,107,90,.12);transform:translateY(-2px)}
.pal-tile.starred{border-color:${C.tag};background:#F4EBDA}
.pal-tile-ic{font-size:22px;line-height:1}
.pal-tile-lb{font-size:11.5px;font-weight:700;line-height:1.25;max-width:100%;overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pal-star{position:absolute;top:4px;inset-inline-end:6px;font-size:12px;color:${C.inkSoft}}
.pal-star.on{color:${C.tag}}
.pal-empty{padding:24px;text-align:center;color:${C.inkSoft};font-size:14px}
@media (max-width:560px){
  .pal-grid,.pal-grid-fav{grid-template-columns:repeat(3,minmax(0,1fr))}
  .pal-tile{min-height:76px}
}
.dk-nav{display:flex;align-items:center;gap:10px;width:100%;background:transparent;border:none;
  color:rgba(255,255,255,.84);border-radius:10px;padding:10px 11px;cursor:pointer;text-align:start;
  font-family:var(--body);font-weight:600;font-size:14px}
.dk-nav:hover{background:rgba(255,255,255,.10);color:#fff}
.dk-nav.on{background:${C.card};color:${C.fieldDeep};box-shadow:0 6px 16px rgba(0,0,0,.12)}
.nav-group{margin-bottom:4px}
.nav-group-head{display:flex;align-items:center;justify-content:space-between;width:100%;
  background:transparent;border:none;padding:8px 10px 5px;cursor:pointer;font-family:var(--body);
  font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.dk-side .nav-group-head{color:rgba(255,255,255,.72)}
.dk-side .nav-group-head:hover{color:#fff}
.menu .nav-group-head{color:${C.inkSoft};padding:12px 0 6px}
.menu .nav-group-head:hover{color:${C.ink}}
.nav-group-chev{font-size:14px;transition:transform .15s ease;opacity:.75;display:inline-block;line-height:1}
.nav-group-chev.open{transform:rotate(90deg)}
[dir=rtl] .nav-group-chev.open{transform:rotate(-90deg)}
.nav-group-items{display:grid;gap:2px;padding-bottom:2px}
.menu .nav-group-items{margin-bottom:4px}
.dk-main{flex:1;min-width:0;display:flex;flex-direction:column}
.dk-top{display:flex;align-items:center;gap:12px;padding:12px 22px;background:${C.paper}ee;
  border-bottom:1px solid ${C.line};position:sticky;top:0;z-index:4;backdrop-filter:blur(12px)}
.dk-search{display:flex;align-items:center;gap:9px;background:${C.card};border:1px solid ${C.line};border-radius:999px;
  padding:8px 14px;min-width:230px;cursor:pointer;font-family:var(--body);font-size:13.5px;color:${C.inkSoft};
  box-shadow:0 1px 2px rgba(21,42,36,.04);transition:border-color .15s ease,box-shadow .15s ease}
.dk-search:hover{border-color:${C.field};box-shadow:0 0 0 3px ${C.field}18}
.dk-pill{background:${C.card};border:1px solid ${C.line};border-radius:999px;padding:10px 14px;cursor:pointer;
  font-family:var(--body);font-size:12.5px;font-weight:600;color:${C.ink};transition:all .14s var(--ease);
  min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center}
.dk-pill:hover{border-color:${C.field};transform:translateY(-1px)}
.dk-pill.on{background:${C.field};border-color:${C.field};color:#fff;box-shadow:0 4px 12px ${C.field}33}
.milk-am-pm{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:520px){.milk-am-pm{grid-template-columns:1fr}}
.cash-overview{display:grid;grid-template-columns:minmax(230px,1.35fr) repeat(4,minmax(120px,1fr))}
.cash-closing{background:${C.card};color:${C.ink};padding:18px 20px;display:grid;align-content:center;gap:5px;min-height:104px;
  border-inline-start:4px solid ${C.field}}
.cash-closing>span{font-size:12px;font-weight:700;color:${C.inkSoft}}
.cash-closing>small{font-size:11.5px;color:${C.inkSoft}}
.cash-overview-stat{padding:16px;border-inline-start:1px solid ${C.line};display:grid;align-content:center;gap:7px;min-height:82px}
.cash-overview-stat span{color:${C.inkSoft};font-size:11.5px;font-weight:700}
.cash-overview-stat b{font-family:var(--mono);font-size:15px;line-height:1.35}
.cash-register-tools{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
.cash-dir{display:flex;gap:4px}
.cash-dir .dk-pill{padding:6px 10px}
.cash-search{display:flex;align-items:center;gap:6px;background:${C.paper};border:1px solid ${C.line};border-radius:999px;padding:5px 10px;color:${C.inkSoft}}
.cash-search:focus-within{border-color:${C.field};box-shadow:0 0 0 3px ${C.field}18}
.cash-search input{width:190px;border:0!important;outline:0!important;box-shadow:none!important;background:transparent;color:${C.ink};font-size:12.5px;padding:1px}
.cash-filter-note{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 13px;
  background:${C.paper};border-bottom:1px solid ${C.line};font-size:11.5px;color:${C.inkSoft}}
.cash-filter-note b{font-family:var(--mono);font-weight:600}
.cash-customize{display:grid;gap:11px;padding:12px 14px;background:${C.paper};border-bottom:1px solid ${C.line}}
.cash-customize-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cash-customize-top>div{display:grid;gap:2px}.cash-customize-top b{font-size:13px}.cash-customize-top span{font-size:11.5px;color:${C.inkSoft}}
.cash-density{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.cash-density>span{font-size:12px;font-weight:700;color:${C.inkSoft};margin-inline-end:3px}
.cash-density .dk-pill{padding:5px 10px}
.cash-column-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:7px}
.cash-column-control{display:grid;grid-template-columns:28px minmax(72px,.65fr) minmax(110px,1fr) auto;align-items:center;gap:7px;
  background:${C.card};border:1px solid ${C.line};border-radius:6px;padding:6px 7px;transition:opacity .12s,border-color .12s}
.cash-column-control.dragging,.cash-column-head.dragging{opacity:.48}.cash-column-control:has(.cash-drag:hover){border-color:${C.field}}
.cash-column-control>b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cash-column-control label{display:grid;grid-template-columns:auto minmax(55px,1fr) 40px;align-items:center;gap:5px;font-size:10.5px;color:${C.inkSoft}}
.cash-column-control input[type=range]{min-width:55px;width:100%;accent-color:${C.field}}
.cash-column-control output{font-family:var(--mono);font-size:10.5px;text-align:end}
.cash-drag{width:26px;height:26px;border:0;border-radius:4px;background:transparent;color:${C.inkSoft};cursor:grab;font-size:17px;padding:0;line-height:1}
.cash-drag:hover,.cash-drag:focus-visible{background:${C.field}15;color:${C.field}}.cash-drag:active{cursor:grabbing}
.cash-column-move{display:flex;gap:2px}.cash-column-move button{width:23px;height:23px;border:1px solid ${C.line};background:${C.paper};
  color:${C.ink};border-radius:4px;padding:0;cursor:pointer}.cash-column-move button:disabled{opacity:.3;cursor:default}
.cash-column-head{position:relative;display:flex;align-items:center;gap:5px;min-height:24px;padding-inline-end:7px}
.cash-column-head>span{overflow:hidden;text-overflow:ellipsis}.cash-drag-head{width:20px;height:20px;font-size:14px;flex:0 0 auto}
.cash-col-resize{position:absolute;z-index:1;inset-block:-9px;inset-inline-end:-12px;width:9px;border:0;border-inline-end:2px solid transparent;
  background:transparent;cursor:col-resize;padding:0;touch-action:none}
.cash-col-resize:hover,.cash-col-resize:focus-visible{border-inline-end-color:${C.field};outline:0}
.cash-table tbody tr{transition:background .12s ease}
.cash-table tbody tr[title]:hover{background:${C.paper}!important}
.cash-secondary-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.cash-flow-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px}
.cash-flow-row{display:grid;grid-template-columns:1fr auto;gap:7px 12px;padding:11px 12px;border:1px solid ${C.line};border-radius:5px;background:${C.paper}}
.cash-flow-row div{display:grid;gap:2px}.cash-flow-row b{font-size:13px}.cash-flow-row span{font-size:11.5px;color:${C.inkSoft}}
.cash-flow-row strong{font-family:var(--mono);font-size:13px}
.cash-flow-row i{grid-column:1/-1;height:4px;background:${C.line};border-radius:99px;overflow:hidden}
.cash-flow-row i span{display:block;height:100%;border-radius:99px}
@media(max-width:1050px){.cash-overview{grid-template-columns:repeat(4,1fr)}.cash-closing{grid-column:1/-1}}
@media(max-width:700px){
  .cash-overview{grid-template-columns:repeat(2,1fr)}.cash-closing{grid-column:1/-1}
  .cash-register-tools{justify-content:flex-start;width:100%}.cash-search{order:3;width:100%}.cash-search input{width:100%}
  .cash-secondary-actions .dk-pill:last-child{margin-inline-start:0!important}
  .cash-customize-top{align-items:flex-start}.cash-column-list{grid-template-columns:1fr}
}
.sf-wrap{position:relative;display:grid;gap:8px}
.sf-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sf-search{flex:1 1 180px;min-width:0;display:flex;align-items:center;gap:6px;min-height:44px;
  background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:0 6px 0 12px;
  transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
.sf-search:focus-within{border-color:${C.field};box-shadow:0 0 0 3px ${C.field}22}
.sf-ico{display:inline-flex;color:${C.inkSoft};flex-shrink:0}
.sf-svg{display:block}
.sf-search input{flex:1;min-width:0;border:none;background:transparent;outline:none;font-family:var(--body);
  font-size:15px;color:${C.ink};height:44px;padding:0}
.sf-search input::placeholder{color:${C.inkSoft};opacity:.85}
.sf-clear,.sf-gear,.sf-dir,.sf-apply,.sf-chip,.help-kit-btn{min-width:44px;min-height:44px}
.sf-clear{display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;
  color:${C.inkSoft};border-radius:10px;cursor:pointer;padding:0;flex-shrink:0}
.sf-clear:hover{background:${C.paper};color:${C.ink}}
.sf-gear{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;flex:0 0 44px;
  background:${C.card};border:1px solid ${C.line};border-radius:12px;color:${C.inkSoft};cursor:pointer;padding:0}
.sf-gear:hover,.sf-gear.on{border-color:${C.field};color:${C.field};background:${C.paper}}
.sf-gear.hot{background:${C.paper};border-color:${C.line};color:${C.ink};box-shadow:inset 0 0 0 1px ${C.line}}
.sf-badge{position:absolute;top:-5px;inset-inline-end:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;
  background:${C.field};color:#fff;font-size:10px;font-weight:800;display:inline-grid;place-items:center;font-family:var(--mono);line-height:1}
.sf-scrim{display:none}
.sf-pop{position:absolute;z-index:40;inset-inline-end:0;top:calc(100% + 8px);width:min(380px,calc(100vw - 24px));
  background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:14px 14px 12px;
  box-shadow:0 16px 40px ${C.shadow};display:grid;gap:12px;max-height:min(70vh,560px);overflow:auto}
.sf-pop-handle{display:none;width:40px;height:4px;border-radius:99px;background:${C.line};margin:0 auto 4px}
.sf-group{display:grid;gap:8px}
.sf-group-lb{font-size:11.5px;font-weight:700;color:${C.inkSoft};letter-spacing:.02em}
.sf-group-body{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sf-span{flex:1 1 100%;min-width:0;display:grid;gap:8px}
.sf-dates{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.date-pick{display:block;margin-bottom:12px;min-width:0}
.date-pick.compact{margin-bottom:0;flex:1 1 160px}
.date-pick.locked{opacity:.85}
.date-pick-btn{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;border:1.5px solid ${C.line};
  border-radius:12px;background:${C.paper};padding:0 10px 0 12px;cursor:pointer;font-family:var(--body);
  color:${C.ink};text-align:start}
.date-pick-btn.open{border-color:${C.field};box-shadow:0 0 0 3px ${C.field}22}
.date-pick.locked .date-pick-btn{cursor:default}
.date-pick-ico{display:grid;place-items:center;color:${C.inkSoft};flex-shrink:0}
.date-pick-val{flex:1;min-width:0;font-weight:700;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.date-pick-val.ph{font-weight:500;color:${C.inkSoft}}
.date-pick-caret{color:${C.inkSoft};font-size:12px;flex-shrink:0}
.date-cal{position:fixed;z-index:120;background:${C.card};border:1px solid ${C.line};border-radius:14px;
  box-shadow:0 16px 40px ${C.shadow};padding:10px 10px 8px;animation:dateCalIn .16s ease}
@keyframes dateCalIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.date-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.date-cal-title{flex:1;text-align:center;font-weight:800;font-size:15px;color:${C.ink}}
.date-cal-nav{width:40px;height:40px;border:1px solid ${C.line};border-radius:10px;background:${C.paper};
  cursor:pointer;font-size:18px;color:${C.ink}}
.date-cal-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}
.date-cal-dow span{text-align:center;font-size:11px;font-weight:700;color:${C.inkSoft};padding:4px 0}
.date-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.date-cal-day{min-height:40px;border:none;background:transparent;border-radius:10px;cursor:pointer;
  font-family:var(--mono);font-weight:700;font-size:13.5px;color:${C.ink}}
.date-cal-day:hover:not(:disabled){background:${C.paper}}
.date-cal-day.on{background:${C.field};color:#fff}
.date-cal-day.today:not(.on){box-shadow:inset 0 0 0 1.5px ${C.field}}
.date-cal-day.off,.date-cal-day:disabled{opacity:.32;cursor:default}
.date-cal-day.muted{min-height:40px}
.date-cal-foot{display:flex;gap:8px;margin-top:8px}
.date-cal-foot button{flex:1;min-height:40px;border-radius:10px;border:1px solid ${C.line};background:${C.paper};
  font-family:var(--body);font-weight:700;cursor:pointer;color:${C.ink}}
.app.theme-dark .date-pick-btn,.app.theme-dark .date-cal,.app.theme-dark .date-cal-nav,.app.theme-dark .date-cal-foot button{background:${C.card};color:${C.ink}}
.sf-dates .date-pick,.sf-group-body .date-pick{flex:1 1 160px;margin-bottom:0;min-width:0}
.spick-row{display:flex;gap:8px;align-items:stretch;margin-bottom:12px}
.spick{position:relative;flex:1;min-width:0}
.spick-field{display:flex;align-items:center;gap:8px;min-height:44px;border:1.5px solid ${C.line};
  border-radius:12px;background:${C.paper};padding:0 10px 0 12px;cursor:pointer}
.spick-field.open{border-color:${C.field};box-shadow:0 0 0 3px ${C.field}22}
.spick-ico{display:grid;place-items:center;color:${C.inkSoft};flex-shrink:0}
.spick-val{flex:1;min-width:0;font-weight:700;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spick-val.ph{font-weight:500;color:${C.inkSoft}}
.spick-hint,.spick-opt-hint{font-weight:500;color:${C.inkSoft};font-size:12.5px}
.spick-caret{color:${C.inkSoft};font-size:12px;flex-shrink:0}
.spick-field input{flex:1;min-width:0;border:none;background:transparent;font-family:var(--body);
  font-size:15px;font-weight:600;color:${C.ink};outline:none;min-height:40px}
.spick-list{position:absolute;z-index:50;left:0;right:0;top:calc(100% + 6px);max-height:min(50vh,320px);
  overflow:auto;background:${C.card};border:1px solid ${C.line};border-radius:12px;
  box-shadow:0 12px 32px ${C.shadow};padding:6px}
.spick-empty{padding:14px 12px;color:${C.inkSoft};font-weight:600;font-size:13.5px}
.spick-opt{display:flex;align-items:center;gap:8px;width:100%;text-align:start;border:none;background:transparent;
  border-radius:8px;padding:10px;cursor:pointer;font-family:var(--body);color:${C.ink};min-height:44px}
.spick-opt.on,.spick-opt:hover{background:${C.paper}}
.spick-opt-copy{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.spick-opt-lb{font-weight:700;font-size:14px}
.spick-em{flex-shrink:0}
.spick-add{width:44px;flex:0 0 44px;border:1.5px solid ${C.line};border-radius:12px;background:${C.paper};
  cursor:pointer;font-size:18px}
.sf-date,.sf-select,.sf-mini{min-height:44px;border:1px solid ${C.line};border-radius:10px;background:${C.paper};
  color:${C.ink};font-family:var(--body);font-size:14px;padding:0 12px;min-width:0}
.sf-date,.sf-select{flex:1 1 140px}
.sf-mini{width:100%}
.sf-sort{display:flex;align-items:center;gap:8px;width:100%}
.sf-seg{flex:1;display:flex;background:${C.paper};border:1px solid ${C.line};border-radius:12px;padding:3px;gap:3px;min-height:44px}
.sf-seg-btn{flex:1;min-height:38px;min-width:44px;border:none;background:transparent;border-radius:9px;cursor:pointer;
  font-family:var(--body);font-size:12.5px;font-weight:700;color:${C.inkSoft}}
.sf-seg-btn.on{background:${C.card};color:${C.ink};box-shadow:0 1px 2px ${C.shadow}}
.sf-dir{display:inline-flex;align-items:center;justify-content:center;width:44px;flex:0 0 44px;border:1px solid ${C.line};
  background:${C.paper};border-radius:12px;color:${C.ink};cursor:pointer;padding:0}
.sf-pop-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px}
.sf-reset{border:none;background:transparent;color:${C.field};font-family:var(--body);font-size:13.5px;font-weight:700;
  cursor:pointer;min-height:44px;padding:0 8px}
.sf-apply{border:none;background:${C.field};color:#fff;font-family:var(--body);font-size:14px;font-weight:700;
  cursor:pointer;border-radius:10px;padding:0 16px;min-height:44px}
.sf-chips{display:flex;flex-wrap:wrap;gap:6px}
.sf-chip{display:inline-flex;align-items:center;gap:4px;padding:0 10px;background:${C.paper};color:${C.ink};
  font-size:12px;font-weight:600;border-radius:999px;border:1px solid ${C.line};cursor:pointer;font-family:var(--body);line-height:1}
.sf-chip .sf-svg{width:12px;height:12px;opacity:.7}
.help-kit{position:relative;display:inline-flex}
.help-kit-btn{width:44px;height:44px;border-radius:50%;border:1px solid ${C.line};background:${C.card};color:${C.inkSoft};
  font-weight:800;cursor:pointer;font-family:var(--body);font-size:16px}
.help-kit-btn.inv{background:transparent;border-color:rgba(255,255,255,.35);color:#fff}
.help-kit-pop{position:absolute;z-index:30;top:calc(100% + 6px);inset-inline-end:0;min-width:220px;max-width:280px;
  background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:10px;box-shadow:0 12px 32px ${C.shadow}}
.help-kit-act{display:block;width:100%;text-align:start;min-height:44px;border:none;background:transparent;padding:10px;
  border-radius:8px;cursor:pointer;font-weight:600;font-family:var(--body);color:${C.ink}}
.help-kit-act:hover{background:${C.paper}}
.help-kit-txt{margin:8px 4px 0;font-size:12.5px;color:${C.inkSoft};line-height:1.45}
.app.theme-dark .sf-search,.app.theme-dark .sf-pop,.app.theme-dark .sf-gear,.app.theme-dark .help-kit-pop{background:${C.card};color:${C.ink}}
.app.theme-dark .sf-chip,.app.theme-dark .sf-date,.app.theme-dark .sf-select,.app.theme-dark .sf-dir,.app.theme-dark .sf-seg{background:${C.paper};color:${C.ink}}
.app.theme-dark .sf-gear.hot{background:${C.paper};border-color:${C.line}}
@media(max-width:720px){
  body.sf-open{overflow:hidden}
  .sf-search{flex:1 1 calc(100% - 52px)}
  .sf-scrim{display:block;position:fixed;inset:0;z-index:80;background:${C.overlay};border:0;padding:0}
  .sf-pop{position:fixed;inset-inline:0;bottom:0;top:auto;width:100%;max-height:min(82vh,640px);overflow:auto;
    border-radius:16px 16px 0 0;z-index:90;padding:12px 16px calc(16px + env(safe-area-inset-bottom))}
  .sf-pop-handle{display:block}
}
.filter-tray{display:grid;gap:0}
.filter-tray-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.filter-tog{display:inline-flex;align-items:center;gap:7px;background:${C.card};border:1px solid ${C.line};
  border-radius:8px;padding:8px 12px;cursor:pointer;font-family:var(--body);font-size:13px;font-weight:700;
  color:${C.inkSoft};transition:border-color .15s ease,background .15s ease,color .15s ease}
.filter-tog:hover{border-color:${C.field};color:${C.field}}
.filter-tog.on{border-color:${C.field};color:${C.field};background:${C.paper}}
.filter-tog.hot{border-color:${C.amber};color:${C.amber}}
.filter-badge{min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:${C.amber};color:#fff;
  font-size:11px;font-weight:800;display:inline-grid;place-items:center;font-family:var(--mono)}
.filter-body{margin-top:10px;padding:12px 14px;background:${C.paper};border:1px solid ${C.line};border-radius:8px}
.sort-tog{display:inline-flex;align-items:center;gap:8px;background:${C.card};border:1px solid ${C.line};
  border-radius:999px;padding:6px 12px;cursor:pointer;font-family:var(--body);font-weight:700;font-size:13px;color:${C.field}}
.sort-tog:hover{border-color:${C.field}}
.sort-arrow{opacity:.7;font-size:12px}
.sort-knob{width:34px;height:18px;border-radius:99px;background:${C.field};position:relative;flex-shrink:0}
.sort-knob i{position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;
  transition:inset-inline-start .15s ease;display:block}
.sort-dd{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:${C.inkSoft}}
.sort-dd select{appearance:none;-webkit-appearance:none;background:${C.card};border:1px solid ${C.line};border-radius:8px;
  padding:7px 28px 7px 12px;font-family:var(--body);font-size:13px;font-weight:700;color:${C.ink};cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,${C.inkSoft} 50%),linear-gradient(135deg,${C.inkSoft} 50%,transparent 50%);
  background-position:calc(100% - 14px) 55%,calc(100% - 9px) 55%;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.sort-dd select:focus{outline:none;border-color:${C.field}}
.sort-lbl{font-size:12px;font-weight:700;color:${C.inkSoft}}
[dir=rtl] .sort-dd select{padding:7px 12px 7px 28px;background-position:10px 55%,15px 55%}
.dk-quick{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 22px;background:${C.card};
  border-bottom:1px solid ${C.line}}
.dk-quick-btn{display:inline-flex;align-items:center;gap:5px;background:${C.paper};border:1px solid ${C.line};
  border-radius:3px;padding:6px 10px;cursor:pointer;font-family:var(--body);font-size:12.5px;font-weight:600;
  color:${C.ink};white-space:nowrap;line-height:1.2}
.dk-quick-btn:hover{border-color:${C.field}}
.dk-quick-btn.on{background:${C.field};border-color:${C.field};color:#fff}
.dk-quick-btn.accent{border-color:${C.field};color:${C.field};background:${C.card}}
.dk-quick-btn.accent:hover{background:${C.field};color:#fff}
.dk-quick-btn.back{font-weight:700}
.dk-quick-sep{width:1px;height:22px;background:${C.line};margin:0 4px;flex-shrink:0}
.dk-body{padding:20px 28px 48px;width:100%;max-width:none}
.dk-settings{max-width:640px}
.dk-settings-inner{display:grid;gap:8px}
.set-savebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;
  background:#FFF8E8;border:1px solid ${C.tag};border-radius:4px;font-size:13px;font-weight:700;color:#7A5312;
  position:sticky;top:0;z-index:2}
.set-sec{background:${C.card};border:1px solid ${C.line};border-radius:5px;overflow:visible}
.set-sec-head{display:flex;align-items:center;gap:8px;width:100%;background:transparent;border:none;
  padding:11px 12px;cursor:pointer;text-align:start;font-family:var(--body);color:${C.ink}}
.set-sec-head:hover{background:${C.paper}}
.set-sec-ic{width:22px;text-align:center;font-size:15px;flex-shrink:0}
.set-sec-title{font-family:var(--display);font-weight:700;font-size:15px;display:inline-flex;align-items:center;flex-wrap:wrap}
.set-sec-sum{margin-inline-start:8px;flex:1;text-align:end;font-size:11.5px;font-weight:600;color:${C.inkSoft};
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono)}
.set-sec-head .nav-group-chev{margin-inline-start:8px;flex-shrink:0}
.set-sec-body{padding:0 12px 12px;display:grid;gap:0;border-top:1px solid ${C.line};padding-top:10px}
.set-grid-id{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:start}
.set-logo{width:64px;height:64px;border-radius:4px;background:${C.paper};border:1px solid ${C.line};
  display:grid;place-items:center;cursor:pointer;overflow:hidden}
.set-logo img{width:100%;height:100%;object-fit:contain}
.set-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.set-price-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.help-tip-pop{position:absolute;z-index:20;top:calc(100% + 6px);inset-inline-start:0;min-width:200px;max-width:280px;
  background:${C.ink};color:#fff;border-radius:4px;padding:8px 10px;font-size:12px;font-weight:500;line-height:1.45;
  box-shadow:0 8px 20px rgba(0,0,0,.18);font-family:var(--body);white-space:normal}
@media (max-width:720px){
  .set-row2,.set-price-grid{grid-template-columns:1fr}
  .set-grid-id{grid-template-columns:56px 1fr}
}
.dk tbody tr:hover{background:${C.paper}}
.dk thead th{position:sticky;top:0;background:${C.paper};z-index:1}
.dk tfoot td{position:sticky;bottom:0;background:${C.paper}}
.dk table{font-variant-numeric:tabular-nums}
.pal-back{position:fixed;inset:0;background:${C.overlay};z-index:40;display:flex;
  align-items:flex-start;justify-content:center;padding-top:12vh;animation:fade .12s ease}
.pal{width:min(620px,92vw);background:${C.card};border:1px solid ${C.line};border-top:3px solid ${C.tag};
  border-radius:5px;box-shadow:0 20px 50px rgba(27,32,51,.28);overflow:hidden;animation:drop .14s ease}
.print-sheet{display:none}
.doc-preview{background:#fff;border:1px solid ${C.line};border-radius:8px;overflow:auto;
  max-height:min(68vh,760px);box-shadow:inset 0 0 0 1px rgba(27,32,51,.04)}
.doc-preview > div{margin:0 auto}
@media print{
  .gate,.toast,.pal-back{display:none!important}
  .print-sheet{display:none!important}
  .print-sheet.show{display:block!important;position:static!important;width:100%}
  .sheet-wrap.keep-print{display:block!important;position:static;inset:auto;background:#fff;padding:0;animation:none}
  .sheet-wrap.keep-print .sheet{max-height:none;box-shadow:none;border:none;border-radius:0;padding:12px;margin:0;width:100%}
  .sheet-wrap.keep-print .grabber,.sheet-wrap.keep-print button,.no-print{display:none!important}
  body{background:#fff!important;margin:0}
  .app.dk .dk-side,.app.dk .dk-top,.app.dk .banner,.app.dk .dk-quick,.no-print{display:none!important}
  .app.dk .dk-wrap,.app.dk .dk-main,.app.dk .dk-body,.cash-box,.desk-card{display:block!important;width:100%!important;max-width:none!important}
  .cash-box button,.cash-box .chip{display:none!important}
  .print-sheet.show,.print-sheet.show *,.sheet-wrap.keep-print,.sheet-wrap.keep-print *,.cash-box, .cash-box *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table,tr,td,th{page-break-inside:avoid}
  @page{size:A4;margin:10mm}
}
@media (prefers-reduced-motion:reduce){
  *,.chart-bar,.kpi-val,.kpi-card,.stat-tile,.desk-card{transition:none!important;animation:none!important;opacity:1!important;transform:none!important}
}

/* Status pills, adaptive grids, foldable/tablet data displays */
.inline-flex{display:inline-flex}
.items-center{align-items:center}
.gap-1\\.5{gap:.375rem}
.px-2\\.5{padding-inline:.625rem}
.py-1{padding-block:.25rem}
.rounded-full{border-radius:999px}
.text-xs{font-size:.75rem;line-height:1.2}
.font-medium{font-weight:500}
.border{border-width:1px;border-style:solid}
.shrink-0{flex-shrink:0}
.overflow-x-auto{overflow-x:auto;-webkit-overflow-scrolling:touch}
.border-l-4{border-inline-start-width:4px;border-inline-start-style:solid}
.grid{display:grid}
.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}
.gap-4{gap:1rem}
.bg-emerald-50{background:#ECFDF5}.text-emerald-700{color:#047857}.border-emerald-200{border-color:#A7F3D0}.bg-emerald-500{background:#10B981}
.bg-amber-50{background:#FFFBEB}.text-amber-700{color:#B45309}.border-amber-200{border-color:#FDE68A}.bg-amber-500{background:#F59E0B}
.bg-rose-50{background:#FFF1F2}.text-rose-700{color:#BE123C}.border-rose-200{border-color:#FECDD3}.bg-rose-500{background:#F43F5E}
.bg-sky-50{background:#F0F9FF}.text-sky-700{color:#0369A1}.border-sky-200{border-color:#BAE6FD}.bg-sky-500{background:#0EA5E9}
.bg-slate-100{background:#F1F5F9}.text-slate-600{color:#475569}.border-slate-200{border-color:#E2E8F0}.bg-slate-400{background:#94A3B8}
.status-pill{position:relative;line-height:1.2;white-space:nowrap;max-width:100%}
.status-pill::after{content:"";position:absolute;inset:50%;width:44px;height:44px;transform:translate(-50%,-50%);pointer-events:none}
.status-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;display:inline-block}
.data-display-cards{display:grid}
.data-display-table{display:none}
.data-card{background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:14px;min-height:44px;color:${C.ink};
  box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:visible}
.data-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.data-card-copy{min-width:0;flex:1}
.data-card-title{font-weight:700;font-size:15px;line-height:1.3}
.data-card-sub{font-size:12.5px;color:${C.inkSoft};margin-top:3px;font-weight:500}
.data-card-meta{font-size:12.5px;color:${C.inkSoft};margin-top:8px;font-family:var(--mono)}
.data-card-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.data-card-actions .dk-pill,.data-card-actions button{min-height:44px;min-width:44px}
.data-card-head-end{display:flex;align-items:center;gap:8px;flex-shrink:0}
.who-hint{position:relative;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;
  padding:0;margin:0;border:none;background:transparent;cursor:help;flex-shrink:0;vertical-align:middle;
  color:inherit;box-shadow:none;appearance:none;-webkit-appearance:none}
.who-hint:hover,.who-hint:active{filter:none;transform:none;opacity:1;box-shadow:none}
.who-hint-dot{width:7px;height:7px;border-radius:50%;background:${C.inkSoft};opacity:.5;display:block}
.who-hint:hover .who-hint-dot,.who-hint:focus-visible .who-hint-dot,.who-hint.is-on .who-hint-dot{opacity:.9;background:${C.field}}
.who-hint-tip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;
  font-size:11.5px;font-weight:600;font-family:var(--body);line-height:1.25;padding:5px 8px;border-radius:6px;
  background:${C.ink};color:${C.card};box-shadow:0 6px 16px ${C.shadow};opacity:0;visibility:hidden;
  pointer-events:none;z-index:80;transition:opacity .12s ease,visibility .12s ease}
.who-hint:hover .who-hint-tip,.who-hint:focus-visible .who-hint-tip,.who-hint.is-on .who-hint-tip{opacity:1;visibility:visible}
.status-row{border-inline-start-width:4px;border-inline-start-style:solid}
.status-row--success,.data-card--success{border-inline-start-color:#10B981}
.status-row--warning,.data-card--warning{border-inline-start-color:#F59E0B}
.status-row--danger,.data-card--danger{border-inline-start-color:#F43F5E}
.status-row--info,.data-card--info{border-inline-start-color:#0EA5E9}
.status-row--neutral,.data-card--neutral{border-inline-start-color:#94A3B8}
.adapt-grid{display:grid;grid-template-columns:1fr;gap:1rem}
.touch-target,.dk-pill,.chip,.filter-tog,.ctx-item,.dk-quick-btn,.dk-nav,.dk-side-hide,.sort-tog,
.sf-gear,.sf-clear,.sf-chip,.sf-apply,.sf-dir,.help-kit-btn,.help-kit-act{
  min-height:44px;min-width:44px}
.dk-pill,.filter-tog,.sort-tog,.dk-quick-btn{display:inline-flex;align-items:center;justify-content:center}
.dk-icon-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
.status-choice{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;width:100%;
  padding:10px 12px;border-radius:999px;border:1.5px solid ${C.line};background:${C.card};color:${C.ink};
  font-family:var(--body);font-weight:600;font-size:13.5px;cursor:pointer}
.status-choice .status-dot{background:#94A3B8}
.status-choice[data-tone=success] .status-dot{background:#10B981}
.status-choice[data-tone=warning] .status-dot{background:#F59E0B}
.status-choice[data-tone=danger] .status-dot{background:#F43F5E}
.status-choice[data-tone=info] .status-dot{background:#0EA5E9}
.status-choice.on[data-tone=success]{background:#ECFDF5;color:#047857;border-color:#A7F3D0}
.status-choice.on[data-tone=warning]{background:#FFFBEB;color:#B45309;border-color:#FDE68A}
.status-choice.on[data-tone=danger]{background:#FFF1F2;color:#BE123C;border-color:#FECDD3}
.status-choice.on[data-tone=info]{background:#F0F9FF;color:#0369A1;border-color:#BAE6FD}
.status-choice.on[data-tone=neutral]{background:#F1F5F9;color:#475569;border-color:#E2E8F0}
.hero-stat{background:${C.card};color:${C.ink};padding:18px 20px;display:grid;align-content:center;gap:5px;min-height:104px;
  border-inline-start:4px solid ${C.field}}
.hero-stat>span{font-size:12px;font-weight:700;color:${C.inkSoft}}
.hero-stat>small{font-size:11.5px;color:${C.inkSoft}}
.account-balance{background:${C.paper};border:1px solid ${C.line};border-radius:12px;padding:10px 14px;
  display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:140px}
.dk-side-backdrop{display:none;border:0;padding:0;background:rgba(15,23,42,.4);cursor:pointer}
@media(min-width:640px){
  .data-display-cards{display:none}
  .data-display-table{display:block}
  .sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .adapt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:1024px){
  .lg\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .adapt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(min-width:1280px){
  .xl\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .adapt-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:639px){
  .dk-side{position:fixed;inset-block:0;inset-inline-start:0;z-index:30;width:min(248px,86vw)!important;
    height:100vh;height:100dvh;opacity:1}
  .dk-wrap.side-off .dk-side{width:0!important;min-width:0;opacity:0;pointer-events:none}
  .dk-wrap:not(.side-off) .dk-side-backdrop{display:block;position:fixed;inset:0;z-index:25}
  .dk-body{padding:12px 12px 40px}
  .dk-top{padding:10px 12px}
  .dk-quick{padding:8px 12px}
  .desk-split,.desk-report-split{grid-template-columns:1fr!important}
}
.app.theme-dark .bg-emerald-50{background:rgba(16,185,129,.14)}.app.theme-dark .text-emerald-700{color:#6EE7B7}.app.theme-dark .border-emerald-200{border-color:rgba(110,231,183,.35)}
.app.theme-dark .bg-amber-50{background:rgba(245,158,11,.14)}.app.theme-dark .text-amber-700{color:#FBBF24}.app.theme-dark .border-amber-200{border-color:rgba(251,191,36,.35)}
.app.theme-dark .bg-rose-50{background:rgba(244,63,94,.14)}.app.theme-dark .text-rose-700{color:#FDA4AF}.app.theme-dark .border-rose-200{border-color:rgba(253,164,175,.35)}
.app.theme-dark .bg-sky-50{background:rgba(14,165,233,.14)}.app.theme-dark .text-sky-700{color:#7DD3FC}.app.theme-dark .border-sky-200{border-color:rgba(125,211,252,.35)}
.app.theme-dark .bg-slate-100{background:rgba(148,163,184,.16)}.app.theme-dark .text-slate-600{color:#CBD5E1}.app.theme-dark .border-slate-200{border-color:rgba(203,213,225,.28)}
.app.theme-dark .data-card,.app.theme-dark .account-balance,.app.theme-dark .hero-stat{background:${C.card};color:${C.ink}}
.app.theme-dark .status-choice{background:${C.card};color:${C.ink};border-color:${C.line}}
@media print{
  .data-display-cards{display:none!important}
  .data-display-table{display:block!important}
  .status-pill::after{content:none}
  .who-hint-tip{display:none!important}
}
`;

/* =====================================================================
   DESKTOP EDITION
   A wide screen and a keyboard allow things a phone cannot: seeing the
   whole herd at once, typing a full milking round without lifting a hand,
   and jumping anywhere with one shortcut. Same data, different shape.
   ===================================================================== */

const dsh = sh1;
function DeskCard({ children, style, title, right, pad = 16 }) {
  return <section className="desk-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
    boxShadow: "0 1px 2px rgba(21,42,36,.04)", ...style }}>
    {title && <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, padding: "13px 16px", borderBottom: `1px solid ${C.line}`, background: `linear-gradient(180deg,${C.card} 0%,${C.paper} 100%)`,
      borderRadius: "16px 16px 0 0" }}>
      <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>{title}</span>
      {right}
    </header>}
    <div style={{ padding: pad }}>{children}</div>
  </section>;
}
function StatTile({ label, value, sub, tone, icon, onClick }) {
  return <div className="stat-tile" onClick={onClick} role={onClick ? "button" : undefined}
    style={{ background: C.card, border: `1px solid ${C.line}`, borderInlineStart: `4px solid ${tone || C.field}`,
    borderRadius: 14, padding: "13px 15px", boxShadow: "0 1px 2px rgba(15,23,42,.04)",
    cursor: onClick ? "pointer" : undefined, minHeight: 44 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
      color: C.inkSoft, letterSpacing: ".04em" }}>{icon && <span>{icon}</span>}{label}</div>
    <div className="kpi-val" style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 25, color: C.ink,
      letterSpacing: "-.03em", marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 500, marginTop: 2 }}>{sub}</div>}
  </div>;
}
const Th = ({ children, w, align, onClick, active, dirn }) => (
  <th onClick={onClick} style={{ textAlign: align || "start", padding: "var(--cash-cell-y, 9px) 12px", fontSize: 11.5, fontWeight: 700,
    color: C.inkSoft, letterSpacing: ".04em", borderBottom: `1.5px solid ${C.line}`, width: w,
    cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>
    {children}{active ? <span style={{ color: C.field }}>{dirn === "asc" ? " ▲" : " ▼"}</span> : null}
  </th>
);
const Td = ({ children, align, mono, strong, tone, w, colSpan }) => (
  <td colSpan={colSpan} style={{ textAlign: align || "start", padding: "var(--cash-cell-y, 10px) 12px", fontSize: 13.5, width: w,
    fontFamily: mono ? "var(--mono)" : "var(--body)", fontWeight: strong ? 700 : 500,
    color: tone || C.ink, borderBottom: `1px solid ${C.line}` }}>{children}</td>
);
function Palette({ items, onClose, lang, t, favorites, onToggleFav }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [editFav, setEditFav] = useState(false);
  const qq = q.trim().toLowerCase();
  const favSet = new Set(favorites || []);
  const byKey = Object.fromEntries(items.map((x) => [x.key, x]));
  const favItems = (favorites || []).map((k) => byKey[k]).filter(Boolean);
  const pinnable = items.filter((x) => x.group === "action" || x.group === "farm" || x.group === "go");

  const match = (x) => !qq
    || x.label.toLowerCase().includes(qq)
    || (x.hint || "").toLowerCase().includes(qq)
    || (x.group || "").toLowerCase().includes(qq)
    || (x.tag || "").toLowerCase().includes(qq);

  const sections = editFav
    ? [["pick", t("palAddFav"), pinnable.sort((a, b) => (a.rank || 50) - (b.rank || 50))]]
    : qq
      ? [["search", "", items.filter(match).sort((a, b) => (a.rank || 50) - (b.rank || 50)).slice(0, 24)]]
      : [
          ["action", t("palActions"), items.filter((x) => x.group === "action" && !favSet.has(x.key)).sort((a, b) => (a.rank || 50) - (b.rank || 50))],
          ["farm", t("palFarm"), items.filter((x) => x.group === "farm" && !favSet.has(x.key)).sort((a, b) => (a.rank || 50) - (b.rank || 50))],
          ["go", t("palGo"), items.filter((x) => x.group === "go" && !favSet.has(x.key)).sort((a, b) => (a.rank || 50) - (b.rank || 50))],
        ];

  const flatNav = [];
  if (!qq && !editFav) favItems.forEach((x) => flatNav.push(x));
  sections.forEach(([, , list]) => list.forEach((x) => flatNav.push(x)));

  useEffect(() => { setI(0); }, [q, editFav]);

  const activate = (x) => {
    if (!x) return;
    if (editFav) { onToggleFav(x.key); return; }
    onClose();
    x.run();
  };

  const Tile = ({ x, idx }) => (
    <button type="button" className={`pal-tile${idx === i ? " on" : ""}${favSet.has(x.key) ? " starred" : ""}`}
      onMouseEnter={() => setI(idx)}
      onClick={() => activate(x)}
      title={x.hint || x.label}>
      {editFav && <span className={`pal-star${favSet.has(x.key) ? " on" : ""}`} aria-hidden="true">{favSet.has(x.key) ? "★" : "☆"}</span>}
      <span className="pal-tile-ic">{x.icon}</span>
      <span className="pal-tile-lb">{x.label}</span>
    </button>
  );

  let idx = 0;
  return <div className="pal-back" onClick={onClose}>
    <div className="pal pal-hub" onClick={(e) => e.stopPropagation()}>
      <div className="pal-top">
        <span className="pal-top-ic">⌘</span>
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setEditFav(false); }}
          onKeyDown={(e) => {
            const cols = 4;
            if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => Math.min(n + 1, Math.max(flatNav.length - 1, 0))); }
            if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
            if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + cols, Math.max(flatNav.length - 1, 0))); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - cols, 0)); }
            if (e.key === "Enter" && flatNav[i]) { e.preventDefault(); activate(flatNav[i]); }
            if (e.key === "Escape") onClose();
          }}
          placeholder={t("palHint")}
          className="pal-input" />
        <span className="pal-kbd">Ctrl K</span>
      </div>

      {!qq && <div className="pal-favs">
        <div className="pal-favs-head">
          <span className="pal-group" style={{ padding: 0 }}>{t("palFavs")}</span>
          <button type="button" className="pal-edit-btn" onClick={() => setEditFav((v) => !v)}>
            {editFav ? `✓ ${t("palDoneFavs")}` : `✎ ${t("palEditFavs")}`}
          </button>
        </div>
        {editFav && <div className="pal-fav-hint">{t("palPinHint")}</div>}
        {!editFav && favItems.length === 0
          ? <div className="pal-fav-empty">{t("palFavEmpty")}</div>
          : !editFav && <div className="pal-grid pal-grid-fav">
              {favItems.map((x) => {
                const my = idx++;
                return <Tile key={x.key} x={x} idx={my} />;
              })}
            </div>}
      </div>}

      <div className="pal-body">
        {sections.every(([, , list]) => list.length === 0)
          ? <div className="pal-empty">{t("noData")}</div>
          : sections.map(([key, title, list]) => {
              if (!list.length) return null;
              return <div className="pal-sec" key={key}>
                {title ? <div className="pal-group">{title}</div> : null}
                <div className="pal-grid">
                  {list.map((x) => {
                    const my = idx++;
                    return <Tile key={x.key} x={x} idx={my} />;
                  })}
                </div>
              </div>;
            })}
      </div>
    </div>
  </div>;
}
