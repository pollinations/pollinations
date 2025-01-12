// controllers/userController.js

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import { jwtSecret } from '../config/keys.js';

/**
 * Register a new user.
 * Expects JSON body: { username, password }
 */
export const register = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already in use.' });
    }

    // Create new user (the password is automatically hashed by userModel.js "pre-save")
    const newUser = new User({ username, password });
    await newUser.save();

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
};

/**
 * Log in user.
 * Expects JSON body: { username, password }
 */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Create JWT
    const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: '1h' });

    // Set token as HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour in ms
    });

    return res.status(200).json({ message: 'Logged in successfully.' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login.' });
  }
};

/**
 * Log out user by clearing the cookie.
 */
export const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  return res.status(200).json({ message: 'Logged out successfully.' });
};

/**
 * Example: retrieve the authenticated user's profile from the database.
 */
export const getProfile = async (req, res) => {
  try {
    // req.user is set by authMiddleware
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authorized' });
    }

    // Find user by ID, omit the password field
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user data
    return res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Server error while fetching profile' });
  }
};
