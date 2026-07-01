import { PageShell } from "../components/PageShell";

const MANUALS = [
  {
    id: "admin",
    role: "Admin",
    subtitle: "Command Center Guide",
    tagline: "Everything you need to run your association on Stride — members, staff, scheduling, billing, compliance, and crisis response.",
    file: "/stride-manual-admin.pdf",
    color: "#1E3A8A",
    badge: "bg-[#1E3A8A]",
    chapters: [
      "Getting started & first-time setup",
      "Understanding roles & permissions",
      "Members hub",
      "Operations hub — scheduling, staff & AI tools",
      "Finance hub — invoicing, billing & promotions",
      "Crisis & safety escalation",
      "Reports & data exports",
      "Branding & subscription",
      "Privacy, compliance & data",
      "Troubleshooting & FAQ",
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
  {
    id: "operator",
    role: "Operator",
    subtitle: "Field Operations Guide",
    tagline: "Everything you need to manage classes, track attendance, keep students safe, and stay connected with your team.",
    file: "/stride-manual-operator.pdf",
    color: "#1E3A8A",
    badge: "bg-[#1E3A8A]",
    chapters: [
      "Your role & what you can do",
      "Dashboard — your daily command view",
      "QR attendance scanner & Smart check-in",
      "Student management",
      "Schedule & availability",
      "Private lessons",
      "Safety — SOS & emergency tools",
      "Substitute cascade — reporting an absence",
      "Communications & notifications",
      "Your profile, skills & earnings",
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="14" />
        <line x1="17" y1="14" x2="21" y2="14" /><line x1="14" y1="17" x2="14" y2="21" />
        <line x1="17" y1="17" x2="21" y2="17" /><line x1="21" y1="21" x2="21" y2="21" />
      </svg>
    ),
  },
  {
    id: "member",
    role: "Member",
    subtitle: "Family Guide",
    tagline: "Everything your family needs — bookings, payments, your children's progress, and a digital pass that replaces every membership card.",
    file: "/stride-manual-member.pdf",
    color: "#1E3A8A",
    badge: "bg-[#1E3A8A]",
    chapters: [
      "Getting started — your first login",
      "Your family dashboard",
      "The Smart Pass — your digital membership card",
      "Enrolling in courses & classes",
      "Payments & wallet",
      "Documents & consent",
      "Your children's progress — the Gold Star diary",
      "Events, shows & special activities",
      "Notifications & communications",
      "Your account & privacy",
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: "kiosk",
    role: "Kiosk",
    subtitle: "Setup & Operations Guide",
    tagline: "Your front-desk self-service check-in station — always on, always ready, freeing your staff to focus on students.",
    file: "/stride-manual-kiosk.pdf",
    color: "#1E3A8A",
    badge: "bg-[#1E3A8A]",
    chapters: [
      "What is the Kiosk?",
      "Hardware requirements & setup",
      "Activating Kiosk mode",
      "Daily operation — what families see and do",
      "What each scan result means",
      "Exiting Kiosk mode",
      "Managing Kiosk terminals (Admin)",
      "Troubleshooting & FAQ",
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <line x1="12" y1="18" x2="12" y2="18" strokeWidth="2.5" />
      </svg>
    ),
  },
];

function IcoDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IcoChapter() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function ManualsPage() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="bg-[#1E3A8A] py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 text-center">
          <div className="inline-flex items-center gap-2 bg-[#FBBF24]/15 border border-[#FBBF24]/30 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
            <span className="text-[#FBBF24] text-xs font-bold tracking-wider uppercase">Documentation · v1.0</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white mb-5 leading-tight">
            Stride User Guides
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed max-w-2xl mx-auto">
            Complete documentation for every role on the platform. Download the PDF for offline reading or browse the chapter list below.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="py-16 sm:py-24 bg-[#F8FAFC]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {MANUALS.map(m => (
              <div
                key={m.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
              >
                {/* Card header */}
                <div className="bg-[#1E3A8A] px-7 py-6 flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    {m.icon}
                  </div>
                  <div>
                    <div className="text-[#FBBF24] text-xs font-black uppercase tracking-widest mb-1">
                      {m.role} Guide
                    </div>
                    <h2 className="text-white text-xl font-black leading-tight">{m.subtitle}</h2>
                  </div>
                </div>

                {/* Body */}
                <div className="px-7 py-6 flex-1 flex flex-col gap-5">
                  <p className="text-slate-500 text-sm leading-relaxed">{m.tagline}</p>

                  {/* Chapter list */}
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Contents</p>
                    <ul className="space-y-1.5">
                      {m.chapters.map((ch, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="text-[#FBBF24] mt-0.5 flex-shrink-0"><IcoChapter /></span>
                          {ch}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Download button */}
                  <div className="mt-auto pt-2">
                    <a
                      href={m.file}
                      download
                      className="flex items-center justify-center gap-2.5 w-full bg-[#FBBF24] text-[#0A192F] font-black text-sm py-3.5 rounded-2xl hover:bg-[#fcd34d] transition-colors no-underline"
                    >
                      <IcoDownload />
                      Download {m.role} Guide (PDF)
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Estimate note */}
          <div className="mt-16 bg-white border border-slate-200 rounded-3xl px-8 py-8 text-center shadow-sm">
            <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 rounded-full px-4 py-1.5 mb-5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">Coming Soon</span>
            </div>
            <h3 className="text-slate-900 text-2xl font-black mb-3">Interactive Web Manuals</h3>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xl mx-auto mb-6">
              We are building fully searchable, chapter-linked web versions of all four guides — with screenshots, embedded videos, and a live search bar. Expected availability: <strong className="text-slate-700">Q3 2026</strong>.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#1E3A8A] text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-[#163075] transition-colors no-underline"
            >
              Get notified when they launch
            </a>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
