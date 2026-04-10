import Hero from "@/components/Hero";
import StatsStrip from "@/components/StatsStrip";
import FeaturesGrid from "@/components/FeaturesGrid";
import CreditSection from "@/components/CreditSection";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import CTASection from "@/components/CTASection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <FeaturesGrid />
      <CreditSection />
      <HowItWorks />
      <Testimonials />
      <CTASection />
    </>
  );
}
