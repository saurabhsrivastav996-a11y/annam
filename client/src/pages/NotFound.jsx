import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl" aria-hidden>🍽️</p>
      <h1 className="mt-4 font-display text-3xl font-bold text-stone-900">Nothing cooking here</h1>
      <p className="mt-2 text-sm text-stone-600">That page does not exist on Annam.</p>
      <Button as={Link} to="/" size="lg" className="mt-6">Back to discover</Button>
    </div>
  );
}
