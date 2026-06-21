import { useState } from "react";
import { PageShell } from "../components/PageShell";

const categories = [
  {
    label: "Getting Started",
    icon: "🚀",
    items: [
      {
        q: "How do I set up Stride for my association?",
        a: "Register your account at /register. After verifying your email you'll be guided through the Pioneer Wizard — a 4-step setup that configures your organisation name, branding, billing, and creates your first admin account. The whole process takes under 10 minutes.",
      },
      {
        q: "Do I need technical knowledge to run Stride?",
        a: "No. Stride is designed for non-technical operators. Everything is managed through the mobile app. The only technical step is provisioning the kiosk tablet, which takes two minutes using the Terminals screen.",
      },
      {
        q: "Can I import existing student records?",
        a: "Yes. From the admin panel go to Members → Import and upload a CSV file. The importer validates and maps fields automatically. You can preview the data before confirming.",
      },
      {
        q: "Is there a demo or trial I can try first?",
        a: "Yes — a full 30-day free trial with no credit card required. You can also request a live demo with our team from the Contact page.",
      },
    ],
  },
  {
    label: "Safety & Pick-Up",
    icon: "🔐",
    items: [
      {
        q: "How does Smart Pick-Up work?",
        a: "Members configure a Guardian Circle — a list of people authorised to collect each dependant. When an operator scans the dependant's QR code at the kiosk, the system checks this list and displays a live photo and name. If an unknown person arrives, the operator sees a warning and can trigger an SOS.",
      },
      {
        q: "What happens if an unauthorised person tries to pick up a dependant member?",
        a: "The kiosk shows a 'Denied' screen with red alert colour. The operator's dashboard displays an SOS alert with the dependant's name and a prompt to follow the association's emergency protocol. The event is logged with a timestamp and is available in the security audit log.",
      },
      {
        q: "Can members add and remove guardians themselves?",
        a: "Yes. Members can manage their Guardian Circle from the mobile app at any time. Changes take effect immediately — no admin approval required, though admins can view the full circle.",
      },
      {
        q: "Are signatures legally binding?",
        a: "Pickup signatures are captured with device IP, timestamp, and a SHA-256 integrity hash. They are not qualified electronic signatures under eIDAS, but they provide a strong audit trail suitable for most association safeguarding policies.",
      },
    ],
  },
  {
    label: "Payments & Billing",
    icon: "💳",
    items: [
      {
        q: "How are payments processed?",
        a: "Stripe handles all payments. Members can pay for subscriptions, one-off invoices, marketplace products, and private lessons directly in the app. Funds are deposited to your bank account via Stripe Connect.",
      },
      {
        q: "Can I use my own Stripe account?",
        a: "Yes. Enterprise customers can connect their own Stripe account. Growth plan users use Stride's Stripe Connect integration, which routes payments directly to your connected bank account.",
      },
      {
        q: "Are there transaction fees?",
        a: "Stride does not charge transaction fees on top of Stripe's standard rates (typically 1.4% + 25¢ for European cards). For the marketplace, Stride applies a small platform commission — see the Pricing page for details.",
      },
      {
        q: "What currencies are supported?",
        a: "All currencies supported by Stripe. The default is EUR. Operators can configure their preferred currency in admin settings.",
      },
    ],
  },
  {
    label: "Privacy & Data",
    icon: "🛡️",
    items: [
      {
        q: "Is Stride GDPR compliant?",
        a: "Yes. Stride is built with GDPR compliance by design. Data is processed under a Data Processing Agreement (DPA) available on request. You can request a full data export or deletion at any time.",
      },
      {
        q: "Where is my data stored?",
        a: "Data is stored on servers in the European Union (Supabase EU region + Replit infrastructure). Enterprise customers can request dedicated data residency.",
      },
      {
        q: "Who has access to my data?",
        a: "Only your own admin and operator accounts can access your organisation's data. Stride staff access production data only under break-glass procedures with full audit logging. We never sell or share data with third parties.",
      },
      {
        q: "What happens to my data if I cancel?",
        a: "On cancellation you can export everything in CSV/JSON. We retain your data for 90 days after cancellation and then permanently delete it. You can request early deletion at any time by contacting info@stride-ops.com.",
      },
    ],
  },
  {
    label: "Technical",
    icon: "⚙️",
    items: [
      {
        q: "What devices is the Stride app available on?",
        a: "Stride is available as a native app for iOS and Android (via Expo / React Native) and as a progressive web app. The kiosk interface is optimised for iPad but works on any Android tablet.",
      },
      {
        q: "Does Stride work offline?",
        a: "Core check-in functions require an internet connection. The app will show a connection error if offline. We are working on an offline-first mode for kiosk check-in — subscribe to updates on our roadmap.",
      },
      {
        q: "What is BLE proximity check-in?",
        a: "Bluetooth Low Energy (BLE) beacons placed at your entrance detect a member's device automatically as they arrive, triggering a check-in without needing to scan a QR code. Beacons are configured in Admin → Beacons.",
      },
      {
        q: "Is there an API for custom integrations?",
        a: "A public REST API is available for Enterprise customers. Contact us for API documentation and access tokens.",
      },
    ],
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        className="w-full flex items-start justify-between gap-4 py-4 text-left bg-transparent border-0 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-sm font-bold text-slate-900 leading-snug">{q}</span>
        <svg
          className={`flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <p className="text-slate-500 text-sm leading-relaxed pb-4 pr-8">
          {a}
        </p>
      )}
    </div>
  );
}

export default function Faq() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto px-5 py-14">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">FAQ</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Frequently asked questions</h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            Can't find your answer here? <a href="/contact" className="text-[#1E3A8A] font-semibold hover:underline">Contact our team</a> — we typically reply within 4 hours.
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {categories.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-colors cursor-pointer ${
                activeTab === i
                  ? "bg-[#1E3A8A] text-white border-[#1E3A8A]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* ── Accordion ── */}
        <div className="bg-white border border-slate-200 rounded-2xl px-6 shadow-sm mb-12">
          {categories[activeTab]!.items.map(item => (
            <AccordionItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        {/* ── Still have questions ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a href="/contact" className="no-underline flex items-center gap-4 bg-[#1E3A8A] rounded-2xl p-6 text-white hover:bg-[#1e3070] transition-colors group">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <div>
              <p className="font-black text-base">Contact support</p>
              <p className="text-blue-200 text-sm mt-0.5">We reply within 4 hours</p>
            </div>
          </a>
          <a href="/pricing" className="no-underline flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-6 hover:border-[#1E3A8A] transition-colors group">
            <div className="w-11 h-11 rounded-xl bg-[#1E3A8A]/8 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </div>
            <div>
              <p className="font-black text-base text-slate-900">See pricing plans</p>
              <p className="text-slate-500 text-sm mt-0.5">Free 30-day trial included</p>
            </div>
          </a>
        </div>

      </div>
    </PageShell>
  );
}
