import mongoose from 'mongoose';
import User from '../models/User.js';

export const getFreelancers = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { role: 'freelancer' };

    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { bio: { $regex: search.trim(), $options: 'i' } },
        { skills: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const freelancers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ success: true, freelancers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getFreelancerById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid freelancer ID' });
    }

    const freelancer = await User.findOne({ _id: req.params.id, role: 'freelancer' })
      .select('-password');

    if (!freelancer) {
      return res.status(404).json({ success: false, message: 'Freelancer not found' });
    }

    res.json({ success: true, freelancer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
