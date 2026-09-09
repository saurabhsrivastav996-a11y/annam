import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-bold text-stone-900">
            Annam <span className="text-saffron-600">अन्नम्</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-stone-600">
            Discover food through reels, order from kitchens you can see, and help surplus meals reach
            people instead of bins.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-stone-800">Explore</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li><Link to="/" className="hover:text-saffron-600">Restaurants</Link></li>
            <li><Link to="/reels" className="hover:text-saffron-600">Food Reels</Link></li>
            <li><Link to="/annadevta" className="hover:text-saffron-600">Annadevta Donations</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-stone-800">For partners</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li><Link to="/register?role=restaurant" className="hover:text-saffron-600">List your restaurant</Link></li>
            <li><Link to="/register?role=delivery" className="hover:text-saffron-600">Deliver with Annam</Link></li>
            <li><Link to="/register?role=volunteer" className="hover:text-saffron-600">Volunteer as Annadevta</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-stone-800">Built with</p>
          <p className="mt-3 text-sm text-stone-600">
            React · Express · MongoDB · Socket.IO · Tailwind · Leaflet
          </p>
        </div>
      </div>

      <div className="border-t border-stone-200 py-4 text-center text-xs text-stone-500">
        अन्नम् — “food is life.” Demo build for the Annam project.
      </div>
    </footer>
  );
}
