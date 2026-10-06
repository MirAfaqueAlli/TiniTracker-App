import '@/styles/landing.css';
import LandingPage from '@/components/LandingPage';

export const metadata = {
  title: 'TiniTraker | Timeline of care',
  description: 'Continuous maternity care, connected on WhatsApp. TiniTraker helps clinics share reminders, baby journey updates, and chatbot appointments.',
};

export const viewport = {
  themeColor: '#063b49',
};

export default function Page() {
  return <LandingPage />;
}
