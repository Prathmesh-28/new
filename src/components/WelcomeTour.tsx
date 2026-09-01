import { useState } from "react";
import { Bookmark, Command, LifeBuoy, LineChart, Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { usePref } from "@/hooks/usePrefs";
import { useAuth } from "@/context/AuthContext";

/**
 * First-run tour (Wave 20). Nothing ever introduced the product: a new owner landed on a
 * dashboard with 75 routes and worked out ⌘K, saved views and the support button by luck
 * or never. Four cards, once, dismissible forever — the "seen" marker is a server-side
 * preference, so it doesn't reappear on their phone.
 */
const STEPS = [
  { icon: Command, title: "Find anything with ⌘K",
    body: "One box searches pages, tools, invoices, customers, bank lines — even amounts. Type ⌘K (Ctrl+K on Windows) anywhere. Press ? for every keyboard shortcut." },
  { icon: Bookmark, title: "Save the views you use every morning",
    body: "Filter or sort any list, then save it from the bookmark button — \"Overdue over ₹1L\" comes back with one click, and can be shared with the firm or made your default." },
  { icon: LineChart, title: "Reports come to you",
    body: "In Reports, subscribe to a daily or weekly email — your receivables, who owes the most, cash by week. No more opening the app to learn yesterday's number." },
  { icon: LifeBuoy, title: "A human is one click away",
    body: "The life-ring button on every page reaches us with the page you're on already attached. Deleted something by mistake? Trash keeps everything for 30 days." },
];

export default function WelcomeTour() {
  const { user } = useAuth();
  const [seen, setSeen] = usePref<boolean>("tour.welcomed", false);
  const [step, setStep] = useState(0);
  // Only greet a genuinely new account — not everyone on deploy day.
  const isNew = !!user?.first_login;
  if (seen || !isNew) return null;

  const s = STEPS[step];
  const done = () => setSeen(true);

  return (
    <Modal open onClose={done} title="Welcome to Headroom" size="sm" closeOnOverlay={false}
      footer={
        <>
          <Button variant="ghost" onClick={done}>Skip</Button>
          {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < STEPS.length - 1
            ? <Button variant="primary" onClick={() => setStep(step + 1)}>Next</Button>
            : <Button variant="primary" icon={<Sparkles size={13} />} onClick={done}>Start working</Button>}
        </>
      }>
      <div className="text-center py-2">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-[var(--color-primary)]/15 flex items-center justify-center">
          <s.icon size={22} className="text-[var(--color-primary)]" />
        </div>
        <h3 className="text-sm font-semibold">{s.title}</h3>
        <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">{s.body}</p>
        <div className="flex justify-center gap-1.5 mt-5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
