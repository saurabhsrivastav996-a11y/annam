import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, EmptyState, rupees } from '../components/ui.jsx';
import FoodImage from '../components/FoodImage.jsx';

export default function CartPage() {
  const { cart, setQty, removeItem, clear, subtotal, deliveryFee, total, count } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!count) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          hint="Find something worth eating on the discover page."
          action={<Button as={Link} to="/">Browse restaurants</Button>}
        />
      </div>
    );
  }

  const checkout = () => {
    if (!user) return navigate('/login', { state: { from: '/checkout' } });
    navigate('/checkout');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Your cart</h1>
          <p className="mt-1 text-sm text-stone-600">
            From <Link to={`/restaurant/${cart.restaurantId}`} className="font-medium text-saffron-600 hover:underline">
              {cart.restaurantName}
            </Link>
          </p>
        </div>
        <button onClick={clear} className="text-sm text-stone-500 hover:text-red-600">Clear cart</button>
      </div>

      <ul className="mt-6 divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {cart.items.map((item) => (
          <li key={item.foodId} className="flex items-center gap-3 p-4">
            <FoodImage src={item.imageUrl} alt={item.name} className="size-16 shrink-0 overflow-hidden rounded-xl" />

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-900">{item.name}</p>
              <p className="text-sm text-stone-500">{rupees(item.price)} each</p>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-stone-300">
              <button
                onClick={() => setQty(item.foodId, item.qty - 1)}
                className="p-1.5 text-stone-600 hover:bg-stone-50"
                aria-label={`Reduce ${item.name}`}
              >
                <Minus size={14} />
              </button>
              <span className="w-7 text-center text-sm font-medium">{item.qty}</span>
              <button
                onClick={() => setQty(item.foodId, item.qty + 1)}
                className="p-1.5 text-stone-600 hover:bg-stone-50"
                aria-label={`Add another ${item.name}`}
              >
                <Plus size={14} />
              </button>
            </div>

            <p className="w-20 shrink-0 text-right font-semibold text-stone-900">{rupees(item.price * item.qty)}</p>

            <button
              onClick={() => removeItem(item.foodId)}
              className="p-1.5 text-stone-400 hover:text-red-600"
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Subtotal</dt>
            <dd className="font-medium">{rupees(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">Delivery fee</dt>
            <dd className="font-medium">{rupees(deliveryFee)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-2 text-base">
            <dt className="font-semibold text-stone-900">Total</dt>
            <dd className="font-bold text-stone-900">{rupees(total)}</dd>
          </div>
        </dl>

        <Button size="lg" className="mt-4 w-full" onClick={checkout}>
          {user ? 'Proceed to checkout' : 'Log in to checkout'}
        </Button>
      </div>
    </div>
  );
}
