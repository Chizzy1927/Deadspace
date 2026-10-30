import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-blue-700 hover:underline">
        Back to home
      </Link>
    </section>
  );
}
