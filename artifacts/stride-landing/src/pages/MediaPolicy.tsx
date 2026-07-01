import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "purpose",
    title: "1. Purpose",
    body: `The Platform provides optional tools that allow your Association to capture, upload, store and share photographs and video (collectively, "Media") — for example progress clips, event photos and member profile images. This policy makes clear who is responsible for that Media and the consents required.`,
  },
  {
    id: "sole-controller",
    title: "2. The Association Is the Sole Controller of Media",
    body: `You acknowledge and accept that:

• You are solely and exclusively responsible for all Media captured, uploaded, stored, displayed or shared through the Platform by you, your staff or your members.
• You are solely responsible for obtaining, recording and retaining valid, informed and (where the subject is a minor) parental or guardian consent BEFORE any Media is captured, uploaded or shared.
• You are solely responsible for honouring any refusal or withdrawal of consent at any time, including ceasing to capture Media and removing previously stored Media where required.
• Stride does NOT verify, validate or police consent. Any consent indicators inside the Platform are administrative aids for your staff only; they do not constitute legal consent and do not transfer any responsibility to Stride.`,
  },
  {
    id: "children",
    title: "3. Children and Vulnerable Persons",
    body: `Where Media depicts minors or vulnerable persons, heightened obligations apply. You accept sole responsibility for compliance with all applicable child-safeguarding, data-protection and privacy requirements, including:

• Obtaining explicit written parental or guardian consent before capturing, storing or publishing any Media featuring a minor.
• Restricting access to Media featuring minors to authorised staff only.
• Immediately removing any Media if consent is withdrawn or if the Media is found to be inappropriate.
• Complying with Australian child-protection legislation (including the Children and Community Services Act 2004 (WA) and relevant federal legislation) and/or GDPR where applicable.

Stride bears no responsibility for safeguarding outcomes arising from your use of the Platform.`,
  },
  {
    id: "no-responsibility",
    title: "4. Stride Is Never Responsible for Media",
    body: `Stride is NOT and WILL NEVER BE responsible for: Media captured or shared without proper consent; Media that is unlawful, harmful, infringing or inappropriate; the publication of Media on social media, websites or elsewhere; or any claim, complaint, fine or damage arising from Media. If Media is misused, that is your responsibility alone.`,
  },
  {
    id: "lawful-basis",
    title: "5. Lawful Basis and Publication",
    body: `You confirm that you have a valid lawful basis for every use of Media (consent, legitimate interests or another applicable ground) and that, before any public use (social media, marketing, website, promotional material), you have obtained explicit consent appropriate to that use from all identifiable persons depicted, or their legal guardians where applicable. You are responsible for the conduct of any third party (for example a photographer or social-media manager) you allow access for Media purposes.`,
  },
  {
    id: "storage",
    title: "6. Storage and Security",
    body: `Media uploaded to the Platform is stored using third-party cloud infrastructure subject to reasonable technical security measures. You remain responsible for deciding what Media to upload and for the lawfulness of doing so. You should not upload Media that you do not have a lawful basis to store and share.`,
  },
  {
    id: "law",
    title: "7. Applicable Law",
    body: `For Associations in Australia: this policy is subject to the Privacy Act 1988 (Cth), the Australian Privacy Principles, and applicable state legislation including child-protection legislation in Western Australia.

For Associations in the European Union or Italy: this policy is subject to the GDPR and applicable national implementing legislation regarding image rights and child data.`,
  },
  {
    id: "indemnity",
    title: "8. Indemnity",
    body: `You agree to defend, indemnify and hold harmless Stride from and against any and all claims, damages, fines, penalties, losses and costs (including reasonable legal fees) arising out of or related to Media captured, stored, displayed, shared or published through the Platform by you, your staff or your members.

Acceptance: by creating an account or continuing to use the Platform, you confirm that you have read, understood and agree to this document on behalf of yourself and your Association.

Questions: info@stride-ops.com — Version 1.1-draft — © Stride Technologies`,
  },
];

export default function MediaPolicy() {
  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Legal</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Media Responsibility Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Version 1.1-draft
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            This policy sets out who is responsible for photographs, video and media content captured, uploaded or shared through the Stride Platform, and the consent obligations that apply.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { label: "Consent Required",         icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
            { label: "Children Protected",       icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg> },
            { label: "Association Responsible",  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg> },
          ].map(({ label, icon }) => (
            <div key={label} className="flex items-center gap-2 bg-[#1E3A8A]/6 border border-[#1E3A8A]/12 rounded-full px-4 py-1.5 text-xs text-[#1E3A8A] font-semibold">
              {icon}<span>{label}</span>
            </div>
          ))}
        </div>

        <div className="lg:hidden bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
          <p className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">Contents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {sections.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-[#1E3A8A] text-sm hover:underline truncate">{s.title}</a>
            ))}
          </div>
        </div>

        <div className="flex gap-10 items-start">

          <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-20 self-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-3">On this page</p>
              <nav className="space-y-1">
                {sections.map(s => (
                  <a key={s.id} href={`#${s.id}`}
                    className="block text-sm text-slate-600 hover:text-[#1E3A8A] hover:font-semibold transition-colors py-0.5 leading-snug truncate">
                    {s.title}
                  </a>
                ))}
              </nav>
              <div className="mt-5 pt-4 border-t border-slate-200">
                <a href="mailto:info@stride-ops.com"
                  className="flex items-center gap-2 text-xs text-[#1E3A8A] font-semibold hover:underline">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  info@stride-ops.com
                </a>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="space-y-10">
              {sections.map(s => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">{s.title}</h2>
                  <div className="text-slate-600 text-sm leading-7 whitespace-pre-line">{s.body}</div>
                </section>
              ))}
            </div>

            <div className="mt-14 p-5 bg-[#1E3A8A]/5 border border-[#1E3A8A]/12 rounded-2xl">
              <p className="text-slate-600 text-sm leading-relaxed">
                This policy was last reviewed on <strong>1 June 2026</strong>. For questions about media consent obligations, email{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
