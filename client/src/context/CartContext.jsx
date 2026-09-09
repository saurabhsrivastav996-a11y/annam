import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'annam_cart';
export const DELIVERY_FEE = 30;

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { restaurantId: null, restaurantName: '', items: [] };
  } catch {
    return { restaurantId: null, restaurantName: '', items: [] };
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const value = useMemo(() => {
    /**
     * Adds an item. A cart maps to exactly one restaurant because an order is
     * placed against one kitchen; adding from another asks the caller to confirm.
     * Returns 'conflict' when the existing cart belongs elsewhere.
     */
    const addItem = (restaurant, food, qty = 1, { force = false } = {}) => {
      const rid = restaurant._id || restaurant.id;
      if (cart.items.length && cart.restaurantId !== rid && !force) return 'conflict';

      setCart((prev) => {
        const base =
          prev.restaurantId === rid
            ? prev
            : { restaurantId: rid, restaurantName: restaurant.name, items: [] };

        const foodId = food._id || food.id;
        const existing = base.items.find((i) => i.foodId === foodId);
        const items = existing
          ? base.items.map((i) => (i.foodId === foodId ? { ...i, qty: i.qty + qty } : i))
          : [...base.items, { foodId, name: food.name, price: food.price, imageUrl: food.imageUrl, qty }];

        return { ...base, restaurantName: restaurant.name, items };
      });
      return 'ok';
    };

    const setQty = (foodId, qty) =>
      setCart((prev) => {
        const items = prev.items
          .map((i) => (i.foodId === foodId ? { ...i, qty } : i))
          .filter((i) => i.qty > 0);
        return items.length ? { ...prev, items } : { restaurantId: null, restaurantName: '', items: [] };
      });

    const removeItem = (foodId) => setQty(foodId, 0);
    const clear = () => setCart({ restaurantId: null, restaurantName: '', items: [] });

    const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
    const count = cart.items.reduce((s, i) => s + i.qty, 0);

    return {
      cart,
      addItem,
      setQty,
      removeItem,
      clear,
      subtotal,
      count,
      deliveryFee: cart.items.length ? DELIVERY_FEE : 0,
      total: subtotal + (cart.items.length ? DELIVERY_FEE : 0),
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
