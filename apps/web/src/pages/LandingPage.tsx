import { ExampleMatch } from '../components/landing/ExampleMatch';
import { Hero } from '../components/landing/Hero';
import { HowItWorks } from '../components/landing/HowItWorks';
import { ProblemSection } from '../components/landing/ProblemSection';
import { SideChooser } from '../components/landing/SideChooser';

/**
 * The front door: problem, how it works, an example match, then the need/have choice. Fully
 * static, so it renders even when the API or database is down.
 */
export function LandingPage() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <ExampleMatch />
      <SideChooser />
    </>
  );
}
