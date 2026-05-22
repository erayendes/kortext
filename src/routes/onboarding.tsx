import { OnboardingScreen } from '../components/OnboardingScreen.tsx';

export function OnboardingRoute({ onDone }: { onDone?: () => void }) {
  return <OnboardingScreen onDone={onDone} />;
}
