// Demo content for the seeded database. Dish photos are hotlink-friendly Unsplash
// URLs; reel videos are rendered locally (see scripts/build-seed-reels.mjs) so they
// play with no network. The UI falls back to the poster image if a video fails.

export const DEMO_PASSWORD = 'Test@123';

const img = (id, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
// Clips rendered by scripts/build-seed-reels.mjs and served from server/seed-media.
const reel = (slug) => `/seed-media/reels/${slug}.mp4`;

export const users = [
  { name: 'Vikram Rao', email: 'customer@annam.dev', role: 'customer', phone: '+91-98450-11111',
    address: { street: '12 Indiranagar 100ft Rd', city: 'Bengaluru', state: 'KA', zip: '560038' } },
  { name: 'Anita Desai', email: 'restaurant@annam.dev', role: 'restaurant', phone: '+91-98450-22222' },
  { name: 'Rahul Nair', email: 'restaurant2@annam.dev', role: 'restaurant', phone: '+91-98450-33333' },
  { name: 'Meera Iyer', email: 'restaurant3@annam.dev', role: 'restaurant', phone: '+91-98450-44444' },
  { name: 'Ravi Kumar', email: 'delivery@annam.dev', role: 'delivery', phone: '+91-98450-55555' },
  { name: 'Priya Sharma', email: 'volunteer@annam.dev', role: 'volunteer', phone: '+91-98450-66666' },
  { name: 'Annam Admin', email: 'admin@annam.dev', role: 'admin', phone: '+91-98450-77777' },
  // Extra customers so the review list has more than one voice in it.
  { name: 'Sneha Kulkarni', email: 'sneha@annam.dev', role: 'customer', phone: '+91-98450-88881' },
  { name: 'Arjun Menon', email: 'arjun@annam.dev', role: 'customer', phone: '+91-98450-88882' },
  { name: 'Fatima Sheikh', email: 'fatima@annam.dev', role: 'customer', phone: '+91-98450-88883' },
];

// Delivered orders that already carry a rating, so the reviews section is not
// empty on a fresh install. Dishes are matched by name against the menu above.
export const reviews = [
  { restaurant: 'Spice Bites', email: 'sneha@annam.dev', rating: 5, dishes: ['Butter Chicken', 'Garlic Naan'],
    text: 'The butter chicken is the real thing — properly smoky, not just cream and sugar. Watching the tandoor on their live feed before ordering sold me.' },
  { restaurant: 'Spice Bites', email: 'arjun@annam.dev', rating: 4, dishes: ['Chicken Biryani'],
    text: 'Biryani was excellent, though it arrived a little cooler than I would have liked. Still ordering again.' },
  { restaurant: 'Spice Bites', email: 'fatima@annam.dev', rating: 5, dishes: ['Paneer Tikka Masala', 'Dal Makhani'],
    text: 'Ordered the paneer tikka masala twice this week. Portions are generous and the packaging does not leak.' },
  { restaurant: 'Coastal Curry House', email: 'sneha@annam.dev', rating: 4, dishes: ['Prawn Ghee Roast', 'Neer Dosa (4 pcs)'],
    text: 'Ghee roast had a proper Byadgi kick. Neer dosa went slightly soggy on the way, but the flavour held up.' },
  { restaurant: 'Coastal Curry House', email: 'arjun@annam.dev', rating: 3, dishes: ['Fish Curry Meal'],
    text: 'Fish was fresh but the curry was milder than I expected from a Mangalorean kitchen.' },
  { restaurant: 'Green Leaf Kitchen', email: 'fatima@annam.dev', rating: 5, dishes: ['Millet Buddha Bowl'],
    text: 'Finally a healthy bowl that is actually filling. You can tell the vegetables were cut that morning.' },
  { restaurant: 'Green Leaf Kitchen', email: 'sneha@annam.dev', rating: 5, dishes: ['Ragi Dosa', 'Cold-Pressed Juice'],
    text: 'Ragi dosa with the coconut chutney is my new weekday breakfast. Zero-waste kitchen is a nice bonus.' },
  { restaurant: 'Green Leaf Kitchen', email: 'arjun@annam.dev', rating: 4, dishes: ['Paneer Quinoa Salad'], text: '' },
];

export const restaurants = [
  {
    ownerEmail: 'restaurant@annam.dev',
    name: 'Spice Bites',
    description: 'Slow-cooked North Indian curries, clay-oven breads and a kitchen you can watch live.',
    address: '123 Curry Lane, Indiranagar, Bengaluru',
    cuisineType: 'North Indian',
    category: 'both',
    phone: '+91-80-4000-1111',
    isTransparentKitchen: true,
    imageUrl: img('photo-1517248135467-4c7edcad34c4'),
    location: { type: 'Point', coordinates: [77.6408, 12.9784] },
    menu: [
      { name: 'Butter Chicken', description: 'Tandoori chicken simmered in tomato-cream gravy', price: 320, category: 'non-veg', imageUrl: img('photo-1603894584373-5ac82b2ae398', 600) },
      { name: 'Paneer Tikka Masala', description: 'Char-grilled paneer in a smoky onion-tomato masala', price: 280, category: 'veg', imageUrl: img('photo-1631452180519-c014fe946bc7', 600) },
      { name: 'Dal Makhani', description: 'Black lentils cooked overnight with butter and cream', price: 220, category: 'veg', imageUrl: img('photo-1546833999-b9f581a1996d', 600) },
      { name: 'Garlic Naan', description: 'Clay-oven flatbread brushed with garlic butter', price: 60, category: 'veg', imageUrl: img('photo-1601050690597-df0568f70950', 600) },
      { name: 'Chicken Biryani', description: 'Long-grain basmati layered with spiced chicken', price: 340, category: 'non-veg', imageUrl: img('photo-1563379091339-03b21ab4a4f8', 600) },
    ],
  },
  {
    ownerEmail: 'restaurant2@annam.dev',
    name: 'Coastal Curry House',
    description: 'Mangalorean seafood, coconut gravies and neer dosa made to order.',
    address: '45 Church Street, Bengaluru',
    cuisineType: 'South Indian',
    category: 'both',
    phone: '+91-80-4000-2222',
    isTransparentKitchen: false,
    imageUrl: img('photo-1555939594-58d7cb561ad1'),
    location: { type: 'Point', coordinates: [77.6033, 12.9756] },
    menu: [
      { name: 'Fish Curry Meal', description: 'Kingfish in coconut-kokum gravy with rice', price: 360, category: 'non-veg', imageUrl: img('photo-1585032226651-759b368d7246', 600) },
      { name: 'Neer Dosa (4 pcs)', description: 'Feather-light rice crepes with chutney', price: 140, category: 'veg', imageUrl: img('photo-1630383249896-424e482df921', 600) },
      { name: 'Prawn Ghee Roast', description: 'Byadgi chilli and ghee roasted prawns', price: 420, category: 'non-veg', imageUrl: img('photo-1559847844-5315695dadae', 600) },
      { name: 'Veg Thali', description: 'Rice, sambar, two vegetables, rasam, curd, papad', price: 190, category: 'veg', imageUrl: img('photo-1567188040759-fb8a883dc6d8', 600) },
    ],
  },
  {
    ownerEmail: 'restaurant3@annam.dev',
    name: 'Green Leaf Kitchen',
    description: 'Pure-veg millet bowls, salads and cold-pressed juices. Zero-waste kitchen.',
    address: '78 Jayanagar 4th Block, Bengaluru',
    cuisineType: 'Healthy',
    category: 'veg',
    phone: '+91-80-4000-3333',
    isTransparentKitchen: true,
    imageUrl: img('photo-1512621776951-a57141f2eefd'),
    location: { type: 'Point', coordinates: [77.5833, 12.9250] },
    menu: [
      { name: 'Millet Buddha Bowl', description: 'Foxtail millet, roasted veg, hummus, seeds', price: 260, category: 'veg', imageUrl: img('photo-1512621776951-a57141f2eefd', 600) },
      { name: 'Paneer Quinoa Salad', description: 'Grilled paneer, quinoa, greens, lemon dressing', price: 240, category: 'veg', imageUrl: img('photo-1546793665-c74683f339c1', 600) },
      { name: 'Ragi Dosa', description: 'Finger-millet dosa with coconut chutney', price: 150, category: 'veg', imageUrl: img('photo-1668236543090-82eba5ee5976', 600) },
      { name: 'Cold-Pressed Juice', description: 'Seasonal fruit, no added sugar', price: 120, category: 'veg', imageUrl: img('photo-1622597467836-f3285f2131b8', 600) },
    ],
  },
];

export const reels = [
  { restaurant: 'Spice Bites', title: 'Butter Chicken, start to finish',
    videoUrl: reel('butter-chicken'), thumbnailUrl: img('photo-1603894584373-5ac82b2ae398', 500) },
  { restaurant: 'Spice Bites', title: 'Naan straight off the tandoor',
    videoUrl: reel('garlic-naan'), thumbnailUrl: img('photo-1601050690597-df0568f70950', 500) },
  { restaurant: 'Coastal Curry House', title: 'Prawn ghee roast in the pan',
    videoUrl: reel('prawn-ghee-roast'), thumbnailUrl: img('photo-1559847844-5315695dadae', 500) },
  { restaurant: 'Coastal Curry House', title: 'Neer dosa on the griddle',
    videoUrl: reel('neer-dosa'), thumbnailUrl: img('photo-1630383249896-424e482df921', 500) },
  { restaurant: 'Green Leaf Kitchen', title: 'Building the millet bowl',
    videoUrl: reel('millet-bowl'), thumbnailUrl: img('photo-1512621776951-a57141f2eefd', 500) },
];

export const donations = [
  { restaurant: 'Spice Bites', description: '15 veg meals (dal, rice, roti) from today’s buffet', quantity: 15, units: 'meals', foodType: 'veg', status: 'Posted' },
  { restaurant: 'Green Leaf Kitchen', description: '8 packed millet bowls, untouched', quantity: 8, units: 'meals', foodType: 'veg', status: 'Posted' },
  { restaurant: 'Coastal Curry House', description: '20 portions of rice and sambar', quantity: 20, units: 'meals', foodType: 'veg', status: 'Completed', volunteerEmail: 'volunteer@annam.dev' },
];
