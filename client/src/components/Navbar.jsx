import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Menu, X, HeartHandshake, LayoutDashboard, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { Button } from './ui.jsx';

// Where each role's "dashboard" link points.
const DASHBOARDS = {
  restaurant: { to: '/dashboard/restaurant', label: 'My Kitchen' },
  delivery: { to: '/dashboard/delivery', label: 'Deliveries' },
  volunteer: { to: '/annadevta', label: 'Annadevta' },
  admin: { to: '/dashboard/admin', label: 'Admin' },
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const dash = user && DASHBOARDS[user.role];

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  const link = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-saffron-50 text-saffron-700' : 'text-stone-600 hover:bg-stone-100'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 pr-2">
          <span className="text-2xl" aria-hidden>🍲</span>
          <span className="font-display text-xl font-bold tracking-tight text-stone-900">
            Annam
            <span className="ml-1.5 align-middle text-sm font-normal text-saffron-600">अन्नम्</span>
          </span>
        </Link>

        <div className="hidden flex-1 items-center gap-1 md:flex">
          <NavLink to="/" end className={link}>Discover</NavLink>
          <NavLink to="/search" className={link}>Search</NavLink>
          <NavLink to="/reels" className={link}>Reels</NavLink>
          <NavLink to="/annadevta" className={link}>Annadevta</NavLink>
          {user && <NavLink to="/orders" className={link}>My Orders</NavLink>}
          {dash && <NavLink to={dash.to} className={link}>{dash.label}</NavLink>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {(!user || user.role === 'customer') && (
            <Link
              to="/cart"
              className="relative rounded-lg p-2 text-stone-600 transition hover:bg-stone-100"
              aria-label={`Cart, ${count} items`}
            >
              <ShoppingCart size={20} />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-saffron-500 text-[11px] font-semibold text-white">
                  {count}
                </span>
              )}
            </Link>
          )}

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100"
              >
                <span className="grid size-8 place-items-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-24 truncate">{user.name.split(' ')[0]}</span>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Log out">
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button as={Link} to="/login" variant="outline" size="sm">Log in</Button>
              <Button as={Link} to="/register" size="sm">Sign up</Button>
            </div>
          )}

          <button
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-stone-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            <NavLink to="/" end className={link} onClick={() => setOpen(false)}>Discover</NavLink>
            <NavLink to="/reels" className={link} onClick={() => setOpen(false)}>Reels</NavLink>
            <NavLink to="/annadevta" className={link} onClick={() => setOpen(false)}>
              <HeartHandshake size={15} className="mr-1.5 inline" />Annadevta
            </NavLink>
            {user && (
              <NavLink to="/orders" className={link} onClick={() => setOpen(false)}>
                <ClipboardList size={15} className="mr-1.5 inline" />My Orders
              </NavLink>
            )}
            {dash && (
              <NavLink to={dash.to} className={link} onClick={() => setOpen(false)}>
                <LayoutDashboard size={15} className="mr-1.5 inline" />{dash.label}
              </NavLink>
            )}
            <div className="mt-2 border-t border-stone-200 pt-2">
              {user ? (
                <>
                  <NavLink to="/profile" className={link} onClick={() => setOpen(false)}>
                    <User size={15} className="mr-1.5 inline" />{user.name}
                  </NavLink>
                  <button className={`${link({ isActive: false })} w-full text-left`} onClick={handleLogout}>
                    <LogOut size={15} className="mr-1.5 inline" />Log out
                  </button>
                </>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Button as={Link} to="/login" variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)}>Log in</Button>
                  <Button as={Link} to="/register" size="sm" className="flex-1" onClick={() => setOpen(false)}>Sign up</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
