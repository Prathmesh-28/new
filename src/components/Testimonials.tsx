import TestimonialCard from "./TestimonialCard";

const testimonials = [
  {
    quote:
      "Headroom changed how we run the restaurant. Instead of checking the bank balance and hoping, we now see the cash gap coming weeks ahead and can adjust staffing or vendor timing before it becomes urgent.",
    author: "Maya Torres",
    role: "Owner",
    company: "Harborline Bistro",
    initials: "MT",
    rating: 5,
  },
  {
    quote:
      "The scenario planner alone is worth it. We modeled hiring our next account manager, saw what it would do to runway, and made the decision with data instead of instinct.",
    author: "Evan Brooks",
    role: "Founder",
    company: "Northstar Creative",
    initials: "EB",
    rating: 5,
  },
  {
    quote:
      "When Headroom flagged a crunch around a delayed customer payment, we compared invoice financing inside the forecast and closed the gap without guessing what repayment would do to the next month.",
    author: "Danielle Reed",
    role: "Principal",
    company: "Reed & Sons Contracting",
    initials: "DR",
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="py-20" style={{ backgroundColor: "var(--olive-cream)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--olive-bright)" }}
          >
            What our customers say
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold font-serif mb-4"
            style={{ color: "var(--text-dark)" }}
          >
            SMBs that sleep better at night
          </h2>
          <p
            className="text-lg max-w-xl mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Real operators. Real cash decisions made earlier.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <TestimonialCard key={i} {...t} />
          ))}
        </div>
      </div>
    </section>
  );
}
