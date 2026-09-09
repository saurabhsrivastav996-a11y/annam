import Donation from '../models/Donation.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { broadcast, emitToUser } from '../sockets/emitters.js';

/** Available donations, nearest first when coordinates are supplied. */
export const listDonations = asyncHandler(async (req, res) => {
  const { status = 'Posted', lat, lng, radius = 20000, mine } = req.query;

  const filter = {};
  if (status !== 'all') filter.status = status;

  if (mine === 'true') {
    if (req.user.role === 'volunteer') {
      filter.volunteerId = req.user._id;
      delete filter.status;
    } else if (req.user.role === 'restaurant') {
      const restaurant = await Restaurant.findOne({ ownerUserId: req.user._id });
      if (!restaurant) return res.json([]);
      filter.restaurantId = restaurant._id;
      delete filter.status;
    }
  }

  if (lat && lng) {
    filter.pickupLocation = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radius),
      },
    };
  }

  const donations = await Donation.find(filter)
    .populate('restaurantId', 'name address phone location')
    .populate('volunteerId', 'name phone')
    .sort(lat && lng ? {} : { postedAt: -1 })
    .limit(100);

  res.json(donations);
});

export const createDonation = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ ownerUserId: req.user._id });
  if (!restaurant) throw new ApiError(400, 'Create your restaurant profile before posting a donation');

  const { lat, lng, ...rest } = req.body;
  const donation = await Donation.create({
    ...rest,
    restaurantId: restaurant._id,
    pickupAddress: rest.pickupAddress || restaurant.address,
    pickupLocation:
      lat && lng
        ? { type: 'Point', coordinates: [Number(lng), Number(lat)] }
        : restaurant.location,
  });

  // Volunteers watching the Annadevta feed see this without refreshing.
  broadcast('donation:new', { donationId: donation._id, restaurant: restaurant.name });

  res.status(201).json(donation);
});

export const acceptDonation = asyncHandler(async (req, res) => {
  // Atomic claim: two volunteers tapping Accept at once cannot both win.
  const donation = await Donation.findOneAndUpdate(
    { _id: req.params.id, status: 'Posted', volunteerId: null },
    { status: 'Accepted', volunteerId: req.user._id, acceptedAt: new Date() },
    { new: true }
  ).populate('restaurantId', 'name address ownerUserId');

  if (!donation) throw new ApiError(409, 'This donation is no longer available');

  emitToUser(donation.restaurantId.ownerUserId.toString(), 'donation:accepted', {
    donationId: donation._id,
    volunteer: req.user.name,
  });
  broadcast('donation:taken', { donationId: donation._id });

  res.json(donation);
});

/** Volunteer marks the food collected, then completed after distribution. */
export const updateDonationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Collected', 'Completed'].includes(status)) {
    throw new ApiError(400, 'Status must be Collected or Completed');
  }

  const donation = await Donation.findById(req.params.id);
  if (!donation) throw new ApiError(404, 'Donation not found');
  if (donation.volunteerId?.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new ApiError(403, 'You did not accept this donation');
  }

  const allowed = { Accepted: ['Collected'], Collected: ['Completed'] };
  if (!(allowed[donation.status] || []).includes(status)) {
    throw new ApiError(400, `Cannot move a donation from ${donation.status} to ${status}`);
  }

  donation.status = status;
  if (status === 'Completed') {
    donation.completedAt = new Date();
    await User.updateOne(
      { _id: donation.volunteerId },
      { $inc: { 'stats.donationsCollected': 1, 'stats.mealsServed': donation.quantity } }
    );
  }
  await donation.save();

  res.json(donation);
});

export const cancelDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation) throw new ApiError(404, 'Donation not found');

  const restaurant = await Restaurant.findById(donation.restaurantId);
  const isOwner = restaurant?.ownerUserId.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') throw new ApiError(403, 'Not your donation');
  if (donation.status !== 'Posted') throw new ApiError(400, 'Only unclaimed donations can be removed');

  await donation.deleteOne();
  res.json({ message: 'Donation removed' });
});

/** Aggregate impact numbers for the Annadevta landing strip. */
export const donationStats = asyncHandler(async (req, res) => {
  const [agg] = await Donation.aggregate([
    { $match: { status: 'Completed' } },
    { $group: { _id: null, meals: { $sum: '$quantity' }, count: { $sum: 1 } } },
  ]);
  const openCount = await Donation.countDocuments({ status: 'Posted' });

  res.json({
    mealsRescued: agg?.meals || 0,
    completedDonations: agg?.count || 0,
    openDonations: openCount,
  });
});
